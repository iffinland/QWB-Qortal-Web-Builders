/**
 * Owner interaction flows: the modal/sheet shells Phase 3 plugs persistence into.
 *
 * Phase 2 boundaries enforced here:
 *
 *  - **every flow re-verifies owner mode before it opens or acts**
 *    (`session.assertOwner()`); a control rendered while the account owned the
 *    publishing name does nothing after an account switch, and the failure is
 *    reported instead of silently ignored;
 *  - **no flow can claim a save**: the primary action is rendered disabled with
 *    a reason, and the only enabled action is "Validate draft", which runs the
 *    real assembly + the read path's validator and says explicitly that nothing
 *    was saved (`phase.ts`);
 *  - **drafts survive**: closing a dirty form asks first, and if owner mode ends
 *    while a form is open the form stays open with its draft and an explanation
 *    instead of being thrown away.
 */

import type { AnyEntity, ContentBundle, EntityKind } from '../content/schema';
import { escapeHtml } from '../ui/html';
import type { ModalHandle } from '../ui/modal';
import { openModal } from '../ui/modal';
import { showToast } from '../ui/toast';
import type { OwnerSession } from './session';
import type { DraftStore } from './drafts';
import type { OwnerItemTarget, SiteSlice } from './targets';
import {
  DELETE_DISABLED_NOTICE,
  REORDER_NOTICE,
  WRITE_DISABLED_NOTICE,
  WRITE_DISABLED_SHORT,
} from './phase';
import type { DraftAssembly, FieldDescriptor, FormValues } from './fields';
import {
  assembleDraft,
  defaultValuesForKind,
  fieldsForKind,
  fieldsForSiteSlice,
  nextOrder,
  readFormValues,
  siteSliceTitle,
  valuesForEntity,
} from './fields';
import { generateIdentifier } from '../content/identifier';
import { TOMBSTONE_NOTICE, WRITE_STATE_DESCRIPTION, WRITE_STATE_LABEL } from '../qortal/write';
import { renderFormBody } from './forms';

export interface OwnerFlowDeps {
  readonly session: OwnerSession;
  readonly drafts: DraftStore;
  readonly getContent: () => ContentBundle;
  readonly requestRerender: () => void;
  readonly now?: () => number;
}

export interface OwnerFlows {
  openEditEntity(target: OwnerItemTarget): void;
  openEditSiteSlice(slice: SiteSlice, label: string): void;
  openAddEntity(kind: EntityKind): void;
  openDeleteEntity(target: OwnerItemTarget): void;
  openPublishStatus(): void;
  reorderEntity(target: OwnerItemTarget, direction: 'up' | 'down', element: HTMLElement): void;
  /** Called by the shell when owner mode ends: keeps drafts, explains why. */
  notifyOwnerModeEnded(detail: string): void;
  readonly openModalCount: number;
}

const KIND_LABEL: Readonly<Record<EntityKind, string>> = {
  site: 'site identity',
  highlight: 'featured card',
  service: 'build service',
  step: 'process step',
  work: 'project',
  price: 'pricing tier',
  article: 'article',
};

function entityById(content: ContentBundle, kind: EntityKind, id: string): AnyEntity | null {
  const lists: Partial<Record<EntityKind, readonly AnyEntity[]>> = {
    highlight: content.highlights,
    service: content.services,
    step: content.steps,
    work: content.works,
    price: content.prices,
    article: content.articles,
  };
  const list = lists[kind] ?? [];
  return list.find((entity) => entity.id === id) ?? null;
}

function groupEntities(content: ContentBundle, kind: EntityKind): readonly AnyEntity[] {
  switch (kind) {
    case 'highlight':
      return content.highlights;
    case 'service':
      return content.services;
    case 'step':
      return content.steps;
    case 'work':
      return content.works;
    case 'price':
      return content.prices;
    case 'article':
      return content.articles;
    case 'site':
      return [content.site];
  }
}

export function createOwnerFlows(deps: OwnerFlowDeps): OwnerFlows {
  const now = deps.now ?? (() => Date.now());
  const openModals = new Set<ModalHandle>();
  const openForms = new Set<DirtyForm>();

  interface DirtyForm {
    readonly form: HTMLFormElement;
    dirty: boolean;
    readonly notice: HTMLElement | null;
  }

  async function guarded(description: string): Promise<boolean> {
    const isOwner = await deps.session.assertOwner();
    if (!isOwner) {
      showToast(
        `Owner mode ended before "${description}" started, so nothing was opened. Re-check owner mode and try again.`,
        { tone: 'warning' },
      );
    }
    return isOwner;
  }

  function trackModal(handle: ModalHandle): void {
    openModals.add(handle);
  }

  /** Wires the shared "validate draft, never save" action. */
  function wireForm(options: {
    readonly handle: ModalHandle;
    readonly fields: readonly FieldDescriptor[];
    readonly buildDraft: (values: FormValues) => DraftAssembly;
  }): DirtyForm | null {
    const form = options.handle.body.querySelector<HTMLFormElement>('[data-qwb-form]');
    if (form === null) return null;

    const result = options.handle.body.querySelector<HTMLElement>('[data-qwb-form-result]');
    const state: DirtyForm = { form, dirty: false, notice: result };
    openForms.add(state);

    form.addEventListener('input', () => {
      state.dirty = true;
    });
    form.addEventListener('change', () => {
      state.dirty = true;
    });

    form.querySelector<HTMLElement>('[data-qwb-form-validate]')?.addEventListener('click', () => {
      const values = readFormValues(form, options.fields);
      const assembly = options.buildDraft(values);
      if (result === null) return;
      result.hidden = false;
      if (assembly.ok) {
        result.className = 'qwb-form-result qwb-form-result-ok';
        result.textContent = `Draft is valid. It would be published as rev ${String(
          assembly.entity.rev,
        )} under identifier ${assembly.entity.id} — in Phase 3. Nothing was saved or published.`;
      } else {
        result.className = 'qwb-form-result qwb-form-result-error';
        result.textContent = `Draft is not publishable yet: ${assembly.errors.join('; ')}`;
      }
    });

    // The submit button exists but is disabled in Phase 2; if a future phase
    // enables it, this guard is what stops an unverified write.
    form.querySelector<HTMLElement>('[data-qwb-form-submit]')?.addEventListener('click', () => {
      showToast(WRITE_DISABLED_NOTICE, { tone: 'warning' });
    });

    return state;
  }

  function editorModal(options: {
    readonly title: string;
    readonly subtitle: string;
    readonly fields: readonly FieldDescriptor[];
    readonly values: FormValues;
    readonly original: AnyEntity | null;
    readonly id: string;
    readonly order: number;
    readonly kind: EntityKind;
  }): void {
    let dirtyForm: DirtyForm | null = null;
    let cleanup: () => void = () => undefined;
    const buildDraft = (values: FormValues): DraftAssembly =>
      assembleDraft({
        kind: options.kind,
        values,
        original: options.original,
        site: deps.getContent().site,
        id: options.id,
        order: options.order,
        now: now(),
      });

    const body = renderFormBody({
      fields: options.fields,
      values: options.values,
      title: options.title,
      subtitle: options.subtitle,
      noticeHtml: WRITE_DISABLED_NOTICE,
      primaryLabel: 'Save & publish',
      primaryDisabled: true,
      primaryDisabledReason: WRITE_DISABLED_SHORT,
      secondaryLabel: 'Validate draft',
    });

    const handle = openModal({
      title: escapeHtml(options.title),
      subtitle: escapeHtml(options.subtitle),
      bodyHtml: body,
      dirty: () => dirtyForm !== null && dirtyForm.dirty,
      onClose: () => cleanup(),
    });
    trackModal(handle);
    dirtyForm = wireForm({ handle, fields: options.fields, buildDraft });
    cleanup = () => {
      if (dirtyForm !== null) openForms.delete(dirtyForm);
      openModals.delete(handle);
    };
  }

  return {
    get openModalCount() {
      return openModals.size;
    },

    openEditEntity(target) {
      void (async () => {
        const label = `${KIND_LABEL[target.kind]}: ${target.entityTitle}`;
        if (!(await guarded(`Edit ${label}`))) return;

        const content = deps.getContent();
        const entity = entityById(content, target.kind, target.entityId);
        if (entity === null) {
          showToast(
            `That ${KIND_LABEL[target.kind]} is no longer on the page, so nothing was opened.`,
            {
              tone: 'warning',
            },
          );
          return;
        }

        editorModal({
          title: `Edit ${KIND_LABEL[target.kind]}`,
          subtitle: `${entity.title} · identifier ${entity.id} · current rev ${String(entity.rev)} → draft rev ${String(entity.rev + 1)}`,
          fields: fieldsForKind(entity.kind),
          values: valuesForEntity(entity),
          original: entity,
          id: entity.id,
          order: entity.order,
          kind: entity.kind,
        });
      })();
    },

    openEditSiteSlice(slice, label) {
      void (async () => {
        if (!(await guarded(`Edit ${label}`))) return;

        const site = deps.getContent().site;
        editorModal({
          title: `Edit ${siteSliceTitle(slice)}`,
          subtitle: `${site.title} · identifier ${site.id} · current rev ${String(site.rev)} → draft rev ${String(site.rev + 1)}`,
          fields: fieldsForSiteSlice(slice),
          values: valuesForEntity(site),
          original: site,
          id: site.id,
          order: site.order,
          kind: 'site',
        });
      })();
    },

    openAddEntity(kind) {
      void (async () => {
        if (!(await guarded(`Add ${KIND_LABEL[kind]}`))) return;

        const content = deps.getContent();
        const entities = groupEntities(content, kind);
        const timestamp = now();
        const identifier = generateIdentifier(kind, `${KIND_LABEL[kind]}`, { now: timestamp });

        editorModal({
          title: `New ${KIND_LABEL[kind]}`,
          subtitle: `Candidate identifier ${identifier} (assigned at publish time) · order ${String(nextOrder(entities))}`,
          fields: fieldsForKind(kind),
          values: defaultValuesForKind(kind, content.site),
          original: null,
          id: identifier,
          order: nextOrder(entities),
          kind,
        });
      })();
    },

    openDeleteEntity(target) {
      void (async () => {
        const label = `${KIND_LABEL[target.kind]}: ${target.entityTitle}`;
        if (!(await guarded(`Delete ${label}`))) return;

        const content = deps.getContent();
        const entity = entityById(content, target.kind, target.entityId);
        if (entity === null) {
          showToast(
            `That ${KIND_LABEL[target.kind]} is no longer on the page, so nothing was opened.`,
            {
              tone: 'warning',
            },
          );
          return;
        }

        const handle = openModal({
          title: `Delete “${escapeHtml(entity.title)}”?`,
          subtitle: `${KIND_LABEL[target.kind]} · identifier ${entity.id} · current rev ${String(entity.rev)}`,
          bodyHtml: `<div class="qwb-notice qwb-notice-warning" role="note">${escapeHtml(
            DELETE_DISABLED_NOTICE,
          )}</div>
<p>${escapeHtml(TOMBSTONE_NOTICE)}</p>
<p>In Phase 3 a delete would therefore republish this identifier as a tombstone, filtered out of every read path — and the app could never say “removed from the network”.</p>`,
          footerHtml: `<button type="button" class="qwb-btn qwb-btn-quiet" data-qwb-modal-cancel>Cancel</button>
<button type="button" class="qwb-btn qwb-btn-danger" disabled aria-describedby="qwb-delete-reason">Delete</button>
<p class="qwb-field-help" id="qwb-delete-reason">Deleting is disabled in Phase 2. Nothing was changed.</p>`,
        });
        trackModal(handle);
        handle.footer
          .querySelector('[data-qwb-modal-cancel]')
          ?.addEventListener('click', () => handle.close());
      })();
    },

    openPublishStatus() {
      const states = (['submitted', 'rejected', 'ambiguous', 'failed'] as const)
        .map(
          (state) =>
            `<li><strong>${escapeHtml(WRITE_STATE_LABEL[state])}</strong> — ${escapeHtml(
              WRITE_STATE_DESCRIPTION[state],
            )}</li>`,
        )
        .join('\n');

      openModal({
        title: 'Publishing status',
        subtitle: 'This is the vocabulary the app will use once QDN publishing exists.',
        bodyHtml: `<div class="qwb-notice qwb-notice-warning" role="note">Publishing is not enabled in this phase. Pending writes: 0. No content has been submitted, saved or published.</div>
<ul class="qwb-status-list">
${states}
</ul>
<p>Availability is only ever reported after the resource has been read back: a submission is not proof that the new revision is served.</p>`,
        footerHtml:
          '<button type="button" class="qwb-btn qwb-btn-quiet" data-qwb-modal-cancel>Close</button>',
      });
    },

    reorderEntity(target, direction, element) {
      void (async () => {
        if (!(await guarded(`Reorder ${target.entityTitle}`))) return;

        const sibling =
          direction === 'up'
            ? (element.previousElementSibling as HTMLElement | null)
            : (element.nextElementSibling as HTMLElement | null);
        const parent = element.parentElement;

        if (parent === null || sibling === null || sibling.parentElement !== parent) {
          showToast(`${target.entityTitle} is already at the edge of its group.`, {
            tone: 'warning',
          });
          return;
        }

        if (direction === 'up') parent.insertBefore(element, sibling);
        else parent.insertBefore(sibling, element);

        deps.drafts.record({
          key: target.key,
          entityId: target.entityId,
          entityTitle: target.entityTitle,
          direction,
        });
        showToast(REORDER_NOTICE, { tone: 'warning' });
      })();
    },

    notifyOwnerModeEnded(detail) {
      for (const state of openForms) {
        if (state.notice === null) continue;
        state.notice.hidden = false;
        state.notice.className = 'qwb-form-result qwb-form-result-error';
        state.notice.textContent = `Owner mode ended (${detail}). Your draft is still in this form — copy anything you need. Nothing can be published from here until owner mode is restored.`;
      }
    },
  };
}
