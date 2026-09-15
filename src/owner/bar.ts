/**
 * The compact owner bar.
 *
 * Per the approved interaction philosophy it is deliberately *not* a CMS
 * dashboard: it carries only global, non-cascading state —
 *
 *   owner mode + publishing name · publishing status · unsaved changes · re-check
 *
 * It is built as DOM nodes (never markup) and only exists while owner mode
 * holds, so visitors never see it. On narrow screens the actions collapse into a
 * single badge that opens the same bar as a sheet.
 */

import type { OwnerSession, OwnerSessionState, ReverifyTrigger } from './session';
import type { OwnerFlows } from './flows';
import type { DraftStore } from './drafts';
import { showToast } from '../ui/toast';

export const OWNER_BAR_ID = 'qwb-owner-bar';

/**
 * The bar's live height, published as a custom property so the toast layer can
 * stack above it instead of on top of it. The bar is expanded by default wherever
 * there is room, so a fixed toast offset would be wrong at some viewport.
 */
export const OWNER_BAR_HEIGHT_VAR = '--qwb-owner-bar-height';

export interface OwnerBarDeps {
  readonly state: OwnerSessionState;
  readonly session: OwnerSession;
  readonly flows: OwnerFlows;
  readonly drafts: DraftStore;
  /** Expansion is owned by the shell so a state rebuild cannot collapse it. */
  readonly isExpanded: () => boolean;
  readonly onToggleExpanded: () => void;
  /** Called after an explicit re-check so the shell can rebuild. */
  readonly onReverifyRequested: () => void;
  readonly requestRerender: () => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(
  label: string,
  onClick: () => void,
  className = 'qwb-bar-btn',
): HTMLButtonElement {
  const button = element('button', className, label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export function mountOwnerBar(root: HTMLElement, deps: OwnerBarDeps): () => void {
  const { state } = deps;
  const bar = element('div', 'qwb-owner-bar');
  bar.id = OWNER_BAR_ID;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Owner mode');

  const header = element('div', 'qwb-owner-head');
  const badge = element('span', 'qwb-owner-badge', 'Owner mode');
  const name = element('span', 'qwb-owner-name', state.publishingName);
  const meta = element(
    'span',
    'qwb-owner-meta',
    `${state.service === '' ? 'resource' : state.service} · ${state.checking ? 're-checking…' : 'verified by name ownership'}`,
  );
  const toggle = actionButton(
    deps.isExpanded() ? 'Hide owner tools' : 'Show owner tools',
    () => {
      deps.onToggleExpanded();
    },
    'qwb-bar-toggle',
  );
  toggle.setAttribute('aria-expanded', String(deps.isExpanded()));
  toggle.setAttribute('aria-controls', 'qwb-owner-bar-body');
  header.append(badge, name, meta, toggle);

  const body = element('div', 'qwb-owner-body');
  body.id = 'qwb-owner-bar-body';
  body.hidden = !deps.isExpanded();

  const status = element(
    'span',
    'qwb-owner-status',
    'Publishing: off (Phase 2) — nothing is saved or published',
  );

  const dirtyCount = deps.drafts.count;
  const dirty = element(
    'span',
    `qwb-owner-dirty${dirtyCount > 0 ? ' qwb-owner-dirty-active' : ''}`,
    dirtyCount === 0
      ? 'No unsaved changes'
      : `${String(dirtyCount)} unsaved change${dirtyCount === 1 ? '' : 's'} (not published)`,
  );

  const actions = element('div', 'qwb-owner-actions');
  actions.append(
    actionButton('Publishing status', () => {
      deps.flows.openPublishStatus();
    }),
  );

  if (dirtyCount > 0) {
    actions.append(
      actionButton('Discard unsaved changes', () => {
        deps.drafts.clear();
        deps.requestRerender();
        showToast('Unsaved order changes were discarded. Nothing had been published.', {
          tone: 'warning',
        });
      }),
    );
  }

  const reverify = actionButton(
    state.checking ? 'Re-checking…' : 'Re-check owner mode',
    () => {
      const trigger: ReverifyTrigger = 'manual';
      void deps.session.reverify(trigger).then((decision) => {
        deps.onReverifyRequested();
        showToast(
          decision.status === 'owner'
            ? `Owner mode confirmed: the current account owns "${decision.publishingName}".`
            : `Owner mode is no longer confirmed (${decision.detail}). Owner controls were removed; nothing was published.`,
          { tone: decision.status === 'owner' ? 'info' : 'warning' },
        );
      });
    },
    'qwb-bar-btn qwb-bar-btn-primary',
  );
  reverify.disabled = state.checking;
  actions.append(reverify);

  body.append(status, dirty, actions);
  bar.append(header, body);
  root.prepend(bar);

  const publishHeight = (): void => {
    const height = Math.round(bar.getBoundingClientRect().height);
    // 0 in a non-laid-out document (tests); the stylesheet fallback then applies.
    if (height > 0) {
      document.documentElement.style.setProperty(OWNER_BAR_HEIGHT_VAR, `${String(height)}px`);
    }
  };
  publishHeight();

  return () => {
    bar.remove();
    document.documentElement.style.removeProperty(OWNER_BAR_HEIGHT_VAR);
  };
}
