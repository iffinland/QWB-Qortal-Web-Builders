/**
 * Owner interaction flows: the accepted Phase 2 shells wired to real QDN writes.
 *
 * Rules enforced here (all from the approved model):
 *
 *  - **owner mode is re-verified immediately before every write** and a control
 *    rendered under a previous account can never publish;
 *  - **one in-flight write per entity** (`WriteLog`) — a second submit for the same
 *    identifier is refused, because the host has no compare-and-swap;
 *  - **nothing is claimed as published before the served revision is read back**
 *    (`publishEntity` → `verifyServedEntity`), and the owner sees the four-state
 *    vocabulary (`submitted`/`rejected`/`ambiguous`/`failed` + availability);
 *  - **no automatic retry**: an unresolved write stays unresolved until the owner
 *    presses `Check status`, and a rejected/failed write can only be repeated by an
 *    explicit second submit;
 *  - **media before entity**: a chosen image is published and verified first, and
 *    the entity is not published while the image is unproven;
 *  - **drafts survive** rejected, failed and ambiguous writes: the form stays open
 *    with its values and its chosen image.
 */

import type { AnyEntity, ContentBundle, EntityKind, ImageRef } from '../content/schema';
import { buildTombstone } from '../content/schema';
import type { ContentLoadResult } from '../content/repository';
import { escapeHtml } from '../ui/html';
import type { ModalHandle } from '../ui/modal';
import { openModal } from '../ui/modal';
import { showToast } from '../ui/toast';
import type { OwnerSession } from './session';
import type { DraftStore } from './drafts';
import type { WriteLog } from './writes';
import type { OwnerItemTarget, SiteSlice } from './targets';
import { DELETE_ENABLED_NOTICE, MEDIA_NOTICE, REORDER_NOTICE, WRITE_ENABLED_NOTICE } from './phase';
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
import { planReorder } from '../content/ordering';
import { TOMBSTONE_NOTICE, WRITE_STATE_LABEL } from '../qortal/write';
import type { PublishContext, PublishableEntity, WriteResult } from '../qortal/publish';
import {
  checkEntityStatus,
  planMediaService,
  publishEntity,
  publishMedia,
  verifyServedMedia,
} from '../qortal/publish';
import type { WriteState } from '../qortal/write';
import { bytesToBase64 } from '../qortal/base64';
import type { EncodedImage, ImageEncoder } from './media';
import {
  browserImageEncoder,
  describeMediaTarget,
  formatBytes,
  isAcceptedImageType,
} from './media';
import { renderFormBody } from './forms';

export interface OwnerFlowDeps {
  readonly session: OwnerSession;
  readonly drafts: DraftStore;
  readonly writes: WriteLog;
  readonly getContent: () => ContentBundle;
  /** Re-reads the published content through the QDN source. */
  readonly loadContent: () => Promise<ContentLoadResult>;
  readonly requestRerender: () => void;
  readonly encodeImage?: ImageEncoder;
  readonly now?: () => number;
  readonly verifyAttempts?: number;
  readonly verifyDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface OwnerFlows {
  openEditEntity(target: OwnerItemTarget): void;
  openEditSiteSlice(slice: SiteSlice, label: string): void;
  openAddEntity(kind: EntityKind): void;
  openDeleteEntity(target: OwnerItemTarget): void;
  openPublishStatus(): void;
  reorderEntity(target: OwnerItemTarget, direction: 'up' | 'down'): void;
  /** Re-checks the last unresolved entity write (owner bar). */
  checkLastWrite(): void;
  /** Re-reads the published content and re-renders (owner bar). */
  reloadContent(): void;
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

const MEDIA_FIELD_BY_KIND: Readonly<Partial<Record<EntityKind, string>>> = {
  step: 'illustration',
  work: 'cover',
  article: 'heroImage',
};

function entityById(content: ContentBundle, kind: EntityKind, id: string): AnyEntity | null {
  const lists: Partial<Record<EntityKind, readonly AnyEntity[]>> = {
    highlight: content.highlights,
    service: content.services,
    step: content.steps,
    work: content.works,
    price: content.prices,
    article: content.articles,
    site: [content.site],
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
  const encodeImage = deps.encodeImage ?? browserImageEncoder;
  const openModals = new Set<ModalHandle>();
  const openForms = new Set<DirtyForm>();

  interface PendingMedia {
    readonly field: string;
    readonly encoded: EncodedImage;
    /** `null` until the image submission has been read back and verified. */
    published: ImageRef | null;
    /** Present while an image submission is unverified. */
    submittedData64: string | null;
  }

  interface DirtyForm {
    readonly form: HTMLFormElement;
    readonly key: string;
    dirty: boolean;
    readonly notice: HTMLElement | null;
    pendingMedia: PendingMedia | null;
    /**
     * The entity the last submission targeted, for `Check status`. Set as soon as
     * the draft validates — *before* any media is published — because the image
     * re-check has to be reachable when the image is what did not verify.
     */
    lastAttempt: {
      readonly id: string;
      readonly rev: number;
      readonly label: string;
      readonly title: string;
    } | null;
  }

  /**
   * The outcome of the image half of one submit: either a verified reference the
   * entity may point at, or the state of the image submission that blocked it.
   * That state feeds the same retry policy as an item write — only a request that
   * provably published nothing may be repeated by another explicit submit.
   */
  type MediaStep =
    { readonly ref: ImageRef } | { readonly ref: null; readonly state: WriteState | null };

  function publishContext(): PublishContext {
    return {
      bridge: deps.session.bridge,
      name: deps.session.app.name,
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
      ...(deps.verifyAttempts === undefined ? {} : { verifyAttempts: deps.verifyAttempts }),
      ...(deps.verifyDelayMs === undefined ? {} : { verifyDelayMs: deps.verifyDelayMs }),
    };
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

  function refuseIfBusy(id: string, label: string): boolean {
    if (!deps.writes.isBusy(id)) return false;
    showToast(
      `A write for "${label}" is still in flight. This app never submits the same item twice: wait for it to settle, then use Check status.`,
      { tone: 'warning' },
    );
    return true;
  }

  /** A write that reached the host is never retried without an explicit re-check. */
  function isNonRetryable(state: WriteState): boolean {
    return state === 'submitted' || state === 'ambiguous';
  }

  /**
   * The one place the submit button's availability is decided. Anything that may
   * already have been relayed is not a retry candidate, so the button says so
   * instead of inviting a second non-idempotent submission.
   */
  function applySubmitPolicy(submit: HTMLButtonElement | null, state: WriteState | null): void {
    if (submit === null) return;
    if (state !== null && isNonRetryable(state)) {
      submit.disabled = true;
      submit.textContent = 'Not retryable — check status';
      return;
    }
    submit.disabled = false;
    submit.textContent = 'Save & publish';
  }

  function trackModal(handle: ModalHandle): void {
    openModals.add(handle);
  }

  async function refreshContent(): Promise<ContentLoadResult> {
    const result = await deps.loadContent();
    deps.requestRerender();
    return result;
  }

  function setStatus(
    element: HTMLElement | null,
    tone: 'info' | 'ok' | 'warning',
    text: string,
  ): void {
    if (element === null) return;
    element.hidden = false;
    element.className = `qwb-form-status qwb-form-status-${tone}`;
    element.textContent = text;
  }

  /**
   * Publishes a chosen image before the entity that references it and returns the
   * verified reference, or `null` when the caller must stop (keeping the draft).
   */
  async function ensureMediaPublished(
    state: DirtyForm,
    values: FormValues,
    entityId: string,
    title: string,
    status: HTMLElement | null,
  ): Promise<MediaStep> {
    const pending = state.pendingMedia;
    if (pending === null) return { ref: null, state: null };
    if (pending.published !== null) return { ref: pending.published };

    setStatus(
      status,
      'info',
      `Publishing the image (${describeMediaTarget(pending.encoded.bytes.length)}) — waiting for host approval…`,
    );
    deps.writes.setStage(entityId, 'publishing', 'Publishing the image…');

    const alt = (values[`${pending.field}.alt`] ?? '').trim();
    const written = await publishMedia(publishContext(), {
      identifier: entityId,
      bytes: pending.encoded.bytes,
      mimeType: pending.encoded.mimeType,
      filename: pending.encoded.filename,
      title: alt === '' ? title : alt,
    });

    if (!written.result.verified) {
      pending.submittedData64 = bytesToBase64(pending.encoded.bytes);
      deps.writes.settle(entityId, {
        state: written.result.state,
        availability: written.result.availability,
        detail: `Image: ${written.result.detail}`,
        servedRev: null,
      });
      setStatus(
        status,
        'warning',
        `The image was not verified — ${WRITE_STATE_LABEL[written.result.state]}. ${written.result.detail} Use “Check status”: it re-reads the image first and only then publishes the item.`,
      );
      /*
       * The same retry policy as an item write: a rejected or failed image
       * published nothing, so a second explicit submit is allowed; a submitted or
       * ambiguous image submission may already be relayed, so it is not.
       */
      return { ref: null, state: written.result.state };
    }

    if (written.ref === null) {
      // Defensive: `verified` and a `ref` are set together by `publishMedia`.
      setStatus(status, 'warning', 'The image was verified without a usable reference.');
      return { ref: null, state: 'ambiguous' };
    }

    pending.published = written.ref;
    pending.submittedData64 = null;
    deps.writes.setStage(
      entityId,
      'publishing',
      `Image verified (${formatBytes(pending.encoded.bytes.length)}) — publishing the item…`,
    );
    return { ref: written.ref };
  }

  /**
   * Reports one write result in the form's status region and returns whether the
   * form should close (a verified write is the only case that closes it).
   */
  function reportOutcome(
    state: DirtyForm,
    result: WriteResult,
    options: {
      readonly status: HTMLElement | null;
      readonly submit: HTMLButtonElement | null;
      readonly check: HTMLButtonElement | null;
      readonly entity: PublishableEntity;
      readonly label: string;
      readonly successToast: string;
    },
  ): boolean {
    const tone = result.verified ? 'ok' : 'warning';
    const stateLabel =
      result.state === 'submitted' ? WRITE_STATE_LABEL.submitted : WRITE_STATE_LABEL[result.state];
    setStatus(options.status, tone, `${stateLabel} — ${result.detail}`);

    if (result.verified) {
      deps.drafts.setDirty(state.key, null);
      deps.requestRerender();
      showToast(options.successToast);
      return true;
    }

    if (options.check !== null) options.check.hidden = false;
    // A rejected or failed request published nothing, so an explicit retry is
    // allowed. An ambiguous or unverified submission is *not* retryable.
    applySubmitPolicy(options.submit, result.state);
    return false;
  }

  function wireForm(options: {
    readonly handle: ModalHandle;
    readonly fields: readonly FieldDescriptor[];
    readonly kind: EntityKind;
    readonly key: string;
    readonly label: string;
    readonly entityId: string;
    readonly order: number;
    readonly original: AnyEntity | null;
    readonly buildDraft: (
      values: FormValues,
      media: Readonly<Record<string, ImageRef>>,
    ) => DraftAssembly;
  }): DirtyForm | null {
    const form = options.handle.body.querySelector<HTMLFormElement>('[data-qwb-form]');
    if (form === null) return null;

    const validationRegion =
      options.handle.body.querySelector<HTMLElement>('[data-qwb-form-result]');
    const status = options.handle.body.querySelector<HTMLElement>('[data-qwb-form-status]');
    const submit = options.handle.body.querySelector<HTMLButtonElement>('[data-qwb-form-submit]');
    const check = options.handle.body.querySelector<HTMLButtonElement>('[data-qwb-form-check]');
    const validate = options.handle.body.querySelector<HTMLButtonElement>(
      '[data-qwb-form-validate]',
    );

    // `form` is captured into a local so the hoisted `submitDraft` declaration is
    // not affected by the narrowing of the original `const`.
    const formElement: HTMLFormElement = form;
    const state: DirtyForm = {
      form: formElement,
      key: options.key,
      dirty: false,
      notice: validationRegion,
      pendingMedia: null,
      lastAttempt: null,
    };
    openForms.add(state);

    const markDirty = (): void => {
      state.dirty = true;
      deps.drafts.setDirty(options.key, options.label);
    };
    formElement.addEventListener('input', markDirty);
    formElement.addEventListener('change', markDirty);

    formElement.querySelectorAll<HTMLInputElement>('[data-qwb-media]').forEach((input) => {
      const field = input.dataset.qwbMedia ?? '';
      input.addEventListener('change', () => {
        void (async () => {
          const file = input.files?.[0];
          const note = formElement.querySelector<HTMLElement>(`[data-qwb-media-note="${field}"]`);
          if (file === undefined) {
            state.pendingMedia = null;
            if (note !== null) note.textContent = 'No new image chosen — the current image stays.';
            return;
          }
          if (!isAcceptedImageType(file.type === '' ? 'image/webp' : file.type)) {
            input.value = '';
            if (note !== null) {
              note.textContent =
                'That file type is not supported: choose a WebP, JPEG or PNG image.';
            }
            return;
          }
          if (note !== null) note.textContent = `Encoding ${file.name} in this browser…`;
          try {
            const encoded = await encodeImage.encode(file);
            state.pendingMedia = { field, encoded, published: null, submittedData64: null };
            markDirty();
            if (note !== null) {
              note.textContent = `${file.name} → ${encoded.filename} ${String(encoded.width)}×${String(
                encoded.height,
              )}, ${formatBytes(encoded.bytes.length)} — ${describeMediaTarget(encoded.bytes.length)}. Publishes before the item.`;
            }
          } catch (error) {
            state.pendingMedia = null;
            input.value = '';
            if (note !== null) {
              note.textContent = `That image could not be prepared: ${
                error instanceof Error ? error.message : 'unknown error'
              }`;
            }
          }
        })();
      });
    });

    validate?.addEventListener('click', () => {
      const values = readFormValues(formElement, options.fields);
      const assembly = options.buildDraft(values, {});
      if (validationRegion === null) return;
      validationRegion.hidden = false;
      if (assembly.ok) {
        validationRegion.className = 'qwb-form-result qwb-form-result-ok';
        validationRegion.textContent = `Draft is valid. It would be published as revision ${String(
          assembly.entity.rev,
        )} under identifier ${assembly.entity.id}. Nothing was published by this check.`;
      } else {
        validationRegion.className = 'qwb-form-result qwb-form-result-error';
        validationRegion.textContent = `Draft is not publishable yet: ${assembly.errors.join('; ')}`;
      }
    });

    async function submitDraft(): Promise<void> {
      const entityId = options.entityId;
      if (refuseIfBusy(entityId, options.label)) return;

      const values = readFormValues(formElement, options.fields);
      const wantsMedia = state.pendingMedia !== null;
      const provisional = options.buildDraft(values, {});
      if (!provisional.ok) {
        if (validationRegion !== null) {
          validationRegion.hidden = false;
          validationRegion.className = 'qwb-form-result qwb-form-result-error';
          validationRegion.textContent = `Draft is not publishable yet: ${provisional.errors.join('; ')}`;
        }
        return;
      }

      // Owner mode is re-verified immediately before the write.
      if (!(await deps.session.assertOwner())) {
        setStatus(
          status,
          'warning',
          'Owner mode is no longer confirmed for this account, so nothing was published. Your draft is still here.',
        );
        return;
      }

      /*
       * Re-check the per-entity lock *after* the gate. The owner gate is the only
       * await between the click and the reservation, and two rapid clicks share one
       * gate promise, so whichever continuation runs first reserves the identifier
       * here and the other is refused — no two publishes for one entity.
       */
      if (refuseIfBusy(entityId, options.label)) return;

      if (submit !== null) submit.disabled = true;
      /*
       * The attempt is recorded *before* the image is published: the item's id and
       * revision are already final at this point, and `Check status` must be able to
       * re-read an unverified image even though the item itself was never submitted.
       */
      state.lastAttempt = {
        id: entityId,
        rev: provisional.entity.rev,
        label: options.label,
        title: provisional.entity.title,
      };
      deps.writes.begin({
        key: entityId,
        label: options.label,
        kind: wantsMedia ? 'media+entity' : options.kind,
        expectedRev: provisional.entity.rev,
      });

      const mediaStep = await ensureMediaPublished(
        state,
        values,
        entityId,
        provisional.entity.title,
        status,
      );
      if (wantsMedia && mediaStep.ref === null) {
        if (check !== null) check.hidden = false;
        applySubmitPolicy(submit, mediaStep.state);
        return;
      }

      const media =
        mediaStep.ref === null || state.pendingMedia === null
          ? {}
          : { [state.pendingMedia.field]: mediaStep.ref };
      const assembly = options.buildDraft(values, media);
      if (!assembly.ok) {
        deps.writes.settle(entityId, {
          state: 'failed',
          availability: 'unverified',
          detail: `Draft is not publishable yet: ${assembly.errors.join('; ')}`,
          servedRev: null,
        });
        setStatus(status, 'warning', `Draft is not publishable yet: ${assembly.errors.join('; ')}`);
        if (submit !== null) submit.disabled = false;
        return;
      }

      const entity = assembly.entity;
      deps.writes.setStage(entityId, 'publishing', 'Waiting for host approval…');
      const result = await publishEntity(publishContext(), entity);
      deps.writes.settle(entityId, result);

      const closed = reportOutcome(state, result, {
        status,
        submit,
        check,
        entity,
        label: options.label,
        successToast: `"${entity.title}" was published and verified as revision ${String(entity.rev)}.`,
      });
      if (closed) {
        options.handle.close();
        await refreshContent();
      }
    }

    submit?.addEventListener('click', () => {
      void submitDraft();
    });

    check?.addEventListener('click', () => {
      void (async () => {
        const attempt = state.lastAttempt;
        if (attempt === null) {
          setStatus(
            status,
            'warning',
            'This form has not submitted anything yet, so there is nothing to re-check.',
          );
          return;
        }
        if (check !== null) check.disabled = true;
        setStatus(status, 'info', 'Re-reading the resource from this node…');
        try {
          // An unverified image submission is re-checked first: the item must not
          // be published while the image it references is unproven.
          const pending = state.pendingMedia;
          if (pending !== null && pending.published === null && pending.submittedData64 !== null) {
            const service = planMediaService(pending.encoded.bytes.length);
            if (service === null) {
              setStatus(
                status,
                'warning',
                'This image is no longer within the QDN image limits, so it cannot be verified. Choose the image again.',
              );
              return;
            }
            const media = await verifyServedMedia(publishContext(), {
              service,
              id: attempt.id,
              data64: pending.submittedData64,
            });
            if (media.availability !== 'verified') {
              setStatus(status, 'warning', `Image still unverified: ${media.detail}`);
              return;
            }
            pending.published = {
              source: 'qdn',
              service,
              name: deps.session.app.name,
              identifier: attempt.id,
              filename: pending.encoded.filename,
              alt: attempt.title,
            };
            pending.submittedData64 = null;
            setStatus(status, 'info', 'The image is now verified. Publishing the item…');
            if (submit !== null) {
              submit.disabled = false;
            }
            void submitDraft();
            return;
          }

          const served = await checkEntityStatus(publishContext(), {
            id: attempt.id,
            rev: attempt.rev,
          });
          if (served.availability === 'verified') {
            setStatus(
              status,
              'ok',
              `Verified: the node serves revision ${String(attempt.rev)} of ${attempt.id}.`,
            );
            deps.writes.settle(attempt.id, {
              state: 'submitted',
              availability: 'verified',
              detail: served.detail,
              servedRev: attempt.rev,
            });
            options.handle.close();
            await refreshContent();
            showToast(`"${attempt.label}" is verified as revision ${String(attempt.rev)}.`);
            return;
          }
          setStatus(status, 'warning', `Still not verified: ${served.detail}`);
        } finally {
          if (check !== null) check.disabled = false;
        }
      })();
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
    readonly label: string;
  }): void {
    const buildDraft = (
      values: FormValues,
      media: Readonly<Record<string, ImageRef>>,
    ): DraftAssembly =>
      assembleDraft({
        kind: options.kind,
        values,
        original: options.original,
        site: deps.getContent().site,
        id: options.id,
        order: options.order,
        now: now(),
        media,
      });

    const mediaField = MEDIA_FIELD_BY_KIND[options.kind];
    const body = renderFormBody({
      fields: options.fields,
      values: options.values,
      title: options.title,
      subtitle: options.subtitle,
      noticeHtml: `${WRITE_ENABLED_NOTICE}${mediaField === undefined ? '' : ` ${MEDIA_NOTICE}`}`,
      primaryLabel: 'Save & publish',
      secondaryLabel: 'Validate draft',
    });

    let dirtyForm: DirtyForm | null = null;
    const handle = openModal({
      title: escapeHtml(options.title),
      subtitle: escapeHtml(options.subtitle),
      bodyHtml: body,
      dirty: () => dirtyForm !== null && dirtyForm.dirty,
      onClose: () => {
        if (dirtyForm !== null) {
          openForms.delete(dirtyForm);
          deps.drafts.setDirty(dirtyForm.key, null);
        }
        openModals.delete(handle);
      },
    });
    trackModal(handle);
    dirtyForm = wireForm({
      handle,
      fields: options.fields,
      kind: options.kind,
      key: `${options.kind}:${options.id}`,
      label: options.label,
      entityId: options.id,
      order: options.order,
      original: options.original,
      buildDraft,
    });
  }

  return {
    get openModalCount() {
      return openModals.size;
    },

    openEditEntity(target) {
      void (async () => {
        const label = `${KIND_LABEL[target.kind]}: ${target.entityTitle}`;
        if (!(await guarded(`Edit ${label}`))) return;
        if (refuseIfBusy(target.entityId, target.entityTitle)) return;

        const content = deps.getContent();
        const entity = entityById(content, target.kind, target.entityId);
        if (entity === null) {
          showToast(
            `That ${KIND_LABEL[target.kind]} is no longer on the page, so nothing was opened.`,
            { tone: 'warning' },
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
          label,
        });
      })();
    },

    openEditSiteSlice(slice, label) {
      void (async () => {
        if (!(await guarded(`Edit ${label}`))) return;
        if (refuseIfBusy(deps.getContent().site.id, label)) return;

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
          label: `Site: ${siteSliceTitle(slice)}`,
        });
      })();
    },

    openAddEntity(kind) {
      void (async () => {
        if (!(await guarded(`Add ${KIND_LABEL[kind]}`))) return;

        const content = deps.getContent();
        const entities = groupEntities(content, kind);
        const timestamp = now();
        /*
         * The identifier is minted once per opened form and reused for every
         * submit of that form: a retry must republish the same coordinate, and an
         * identifier is never recycled for a different entity (audit §6.1/§8).
         */
        const identifier = generateIdentifier(kind, KIND_LABEL[kind], {
          now: timestamp,
          // Never hand back an identifier the loaded content already uses: that
          // would republish someone else's coordinate instead of adding an item.
          taken: (candidate) => entityById(content, kind, candidate) !== null,
        });

        editorModal({
          title: `New ${KIND_LABEL[kind]}`,
          subtitle: `Identifier ${identifier} (assigned when this form opened) · order ${String(nextOrder(entities))}`,
          fields: fieldsForKind(kind),
          values: defaultValuesForKind(kind, content.site),
          original: null,
          id: identifier,
          order: nextOrder(entities),
          kind,
          label: `New ${KIND_LABEL[kind]}`,
        });
      })();
    },

    openDeleteEntity(target) {
      void (async () => {
        const label = `${KIND_LABEL[target.kind]}: ${target.entityTitle}`;
        if (!(await guarded(`Delete ${label}`))) return;
        if (refuseIfBusy(target.entityId, target.entityTitle)) return;

        const content = deps.getContent();
        const entity = entityById(content, target.kind, target.entityId);
        if (entity === null) {
          showToast(
            `That ${KIND_LABEL[target.kind]} is no longer on the page, so nothing was opened.`,
            { tone: 'warning' },
          );
          return;
        }

        const handle = openModal({
          title: `Delete “${escapeHtml(entity.title)}”?`,
          subtitle: `${KIND_LABEL[target.kind]} · identifier ${entity.id} · current rev ${String(entity.rev)}`,
          bodyHtml: `<div class="qwb-notice qwb-notice-warning" role="note">${escapeHtml(
            DELETE_ENABLED_NOTICE,
          )}</div>
<p>${escapeHtml(TOMBSTONE_NOTICE)}</p>
<div class="qwb-form-status" data-qwb-delete-status role="status" aria-live="polite" hidden></div>`,
          footerHtml: `<button type="button" class="qwb-btn qwb-btn-quiet" data-qwb-modal-cancel>Cancel</button>
<button type="button" class="qwb-btn qwb-btn-secondary" data-qwb-delete-check hidden>Check status</button>
<button type="button" class="qwb-btn qwb-btn-danger" data-qwb-delete-confirm>Delete</button>`,
        });
        trackModal(handle);

        const status = handle.body.querySelector<HTMLElement>('[data-qwb-delete-status]');
        const confirm = handle.footer.querySelector<HTMLButtonElement>('[data-qwb-delete-confirm]');
        const check = handle.footer.querySelector<HTMLButtonElement>('[data-qwb-delete-check]');
        let expectedRev = entity.rev + 1;

        check?.addEventListener('click', () => {
          void (async () => {
            setStatus(status, 'info', 'Re-reading the resource from this node…');
            const served = await checkEntityStatus(publishContext(), {
              id: entity.id,
              rev: expectedRev,
            });
            if (served.availability === 'verified') {
              handle.close();
              await refreshContent();
              showToast(`"${entity.title}" is deleted: the tombstone is verified.`);
              return;
            }
            setStatus(status, 'warning', `Still not verified: ${served.detail}`);
          })();
        });

        confirm?.addEventListener('click', () => {
          void (async () => {
            if (refuseIfBusy(entity.id, entity.title)) return;
            if (!(await deps.session.assertOwner())) {
              setStatus(
                status,
                'warning',
                'Owner mode is no longer confirmed for this account, so nothing was published.',
              );
              return;
            }
            // Same post-gate lock re-check as the form submit: one tombstone per click.
            if (refuseIfBusy(entity.id, entity.title)) return;
            confirm.disabled = true;
            const tombstone = buildTombstone(entity, now());
            expectedRev = tombstone.rev;
            deps.writes.begin({
              key: entity.id,
              label,
              kind: 'tombstone',
              expectedRev: tombstone.rev,
            });
            deps.writes.setStage(entity.id, 'publishing', 'Waiting for host approval…');
            const result = await publishEntity(publishContext(), tombstone);
            deps.writes.settle(entity.id, result);

            if (result.verified) {
              handle.close();
              await refreshContent();
              showToast(
                `"${entity.title}" was deleted: a tombstone was published as revision ${String(tombstone.rev)} and verified. The previous bytes stay retrievable from the network.`,
              );
              return;
            }

            if (check !== null) check.hidden = false;
            confirm.disabled = result.state === 'submitted' || result.state === 'ambiguous';
            setStatus(status, 'warning', `${WRITE_STATE_LABEL[result.state]} — ${result.detail}`);
          })();
        });
      })();
    },

    openPublishStatus() {
      const entries = deps.writes.entries();
      const list =
        entries.length === 0
          ? '<p>No write has been submitted in this session.</p>'
          : `<ul class="qwb-status-list">
${entries
  .map(
    (entry) =>
      `<li><strong>${escapeHtml(entry.label)}</strong> — ${escapeHtml(
        entry.stage === 'settled'
          ? `${entry.state === null ? 'unknown' : WRITE_STATE_LABEL[entry.state]} (availability: ${entry.availability})`
          : `in flight: ${entry.stage}`,
      )}: ${escapeHtml(entry.detail)}</li>`,
  )
  .join('\n')}
</ul>`;

      openModal({
        title: 'Publishing status',
        subtitle: 'What this session submitted, and what the node was proven to serve.',
        bodyHtml: `<div class="qwb-notice qwb-notice-info" role="note">A submission is not a result. “Verified” means the resource was read back and the revision matched.</div>
${list}
<p>Pending writes: ${String(deps.writes.pendingCount())}. Ambiguous or unverified writes are never retried automatically — use “Check status” in the item's form, or “Check last write” in the owner bar.</p>`,
        footerHtml:
          '<button type="button" class="qwb-btn qwb-btn-quiet" data-qwb-modal-cancel>Close</button>',
      });
    },

    reorderEntity(target, direction) {
      void (async () => {
        if (!(await guarded(`Reorder ${target.entityTitle}`))) return;
        if (refuseIfBusy(target.entityId, target.entityTitle)) return;

        const content = deps.getContent();
        const plan = planReorder(groupEntities(content, target.kind), target.entityId, direction);
        if (!plan.ok) {
          showToast(`Nothing was published: ${plan.reason}.`, { tone: 'warning' });
          return;
        }

        showToast(REORDER_NOTICE);
        for (const update of plan.updates) {
          const current = entityById(content, target.kind, update.id);
          if (current === null) continue;
          if (refuseIfBusy(update.id, current.title)) return;

          const next: AnyEntity = {
            ...current,
            order: update.order,
            rev: current.rev + 1,
            updatedAt: now(),
          };
          deps.writes.begin({
            key: update.id,
            label: `${KIND_LABEL[target.kind]}: ${current.title}`,
            kind: 'reorder',
            expectedRev: next.rev,
          });
          deps.writes.setStage(update.id, 'publishing', 'Waiting for host approval…');
          const result = await publishEntity(publishContext(), next);
          deps.writes.settle(update.id, result);

          if (!result.verified) {
            await refreshContent();
            showToast(
              `Order not verified for "${current.title}": ${result.detail} Nothing is retried automatically — use Check status.`,
              { tone: 'warning' },
            );
            return;
          }
        }

        await refreshContent();
        showToast(
          `Order saved and verified: "${target.entityTitle}" moved ${direction === 'up' ? 'earlier' : 'later'}${
            plan.renumbered
              ? ` (the group was renumbered, ${String(plan.updates.length)} item(s) republished)`
              : ''
          }.`,
        );
      })();
    },

    checkLastWrite() {
      const entry = deps.writes.lastUnverified();
      if (entry === null) {
        showToast('Every write in this session has been verified.');
        return;
      }
      if (entry.expectedRev === null) {
        showToast(
          'The last unresolved write was an image submission. Open the item and press “Check status” there: the image bytes are only known inside that form.',
          { tone: 'warning' },
        );
        return;
      }
      const expectedRev = entry.expectedRev;
      void (async () => {
        showToast(`Re-reading ${entry.key}…`);
        const served = await checkEntityStatus(publishContext(), {
          id: entry.key,
          rev: expectedRev,
        });
        if (served.availability === 'verified') {
          deps.writes.settle(entry.key, {
            state: 'submitted',
            availability: 'verified',
            detail: served.detail,
            servedRev: expectedRev,
          });
          await refreshContent();
          showToast(`Verified: ${entry.label} is served as revision ${String(expectedRev)}.`);
          return;
        }
        showToast(`Still not verified: ${served.detail}`, { tone: 'warning' });
      })();
    },

    reloadContent() {
      void (async () => {
        const result = await refreshContent();
        showToast(
          result.status === 'ready'
            ? 'Content reloaded from this node.'
            : `Content reloaded with ${String(result.diagnostics.length)} diagnostic(s); status ${result.status}. Nothing was published.`,
          { tone: result.status === 'ready' ? 'info' : 'warning' },
        );
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
