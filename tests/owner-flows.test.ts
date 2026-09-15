import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createOwnerFlows } from '../src/owner/flows';
import { createDraftStore } from '../src/owner/drafts';
import { ownerTargetsFor } from '../src/owner/targets';
import { activeModalCount, closeAllModals } from '../src/ui/modal';
import { clearToasts } from '../src/ui/toast';
import { assembleDraft, fieldsForKind, readFormValues } from '../src/owner/fields';
import type { OwnerSession } from '../src/owner/session';
import type { ContentBundle } from '../src/content/schema';
import { provideWrittenClaim, scanForWrittenClaims } from './support/claims';
import {
  bridgeForAccount,
  identityFrom,
  loadContent,
  mountApp,
  RENDER_OWNER_SCOPE,
  sessionFor,
  settle,
} from './support/owner';

const OWNER_NAME = 'Qortal Web Builders';

interface Harness {
  readonly content: ContentBundle;
  readonly session: OwnerSession;
  readonly flows: ReturnType<typeof createOwnerFlows>;
  readonly drafts: ReturnType<typeof createDraftStore>;
  readonly rerenders: () => number;
  readonly app: HTMLElement;
}

async function harness(options: { readonly names?: readonly string[] } = {}): Promise<Harness> {
  const content = await loadContent();
  const app = mountApp({ kind: 'home' }, content);
  const drafts = createDraftStore();
  const session = sessionFor({
    app: identityFrom(RENDER_OWNER_SCOPE),
    bridge: bridgeForAccount({
      address: 'QOwner',
      names: (options.names ?? [OWNER_NAME]).map((name) => ({ name })),
    }),
  });
  let renders = 0;
  const flows = createOwnerFlows({
    session,
    drafts,
    getContent: () => content,
    requestRerender: () => {
      renders += 1;
    },
  });
  await session.reverify('boot');
  return { content, session, flows, drafts, rerenders: () => renders, app };
}

function formOf(): HTMLFormElement {
  const form = document.querySelector<HTMLFormElement>('[data-qwb-form]');
  if (form === null) throw new Error('no form is open');
  return form;
}

function field(name: string): HTMLInputElement | HTMLTextAreaElement {
  const element = formOf().elements.namedItem(name);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element;
  throw new Error(`no field ${name}`);
}

function buttons(root: ParentNode = document): readonly HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('button'));
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  closeAllModals();
  clearToasts();
});

describe('owner edit flow', () => {
  it('opens a form pre-filled from the current seed model with a truthful disabled save', async () => {
    const h = await harness();
    const target = ownerTargetsFor({ kind: 'home' }, h.content).items[0];
    if (target === undefined) throw new Error('no target');

    h.flows.openEditEntity(target);
    await settle();

    expect(field('title').value).toBe(h.content.highlights[0]?.title);
    expect(field('bullets')).toBeInstanceOf(HTMLTextAreaElement);
    expect((field('bullets') as HTMLTextAreaElement).value).toContain('\n');

    const submit = document.querySelector<HTMLButtonElement>('[data-qwb-form-submit]');
    expect(submit?.disabled).toBe(true);
    expect(submit?.textContent).toContain('Save & publish');
    expect(document.body.textContent).toContain('not enabled in this phase');
    expect(document.body.textContent).toContain('Nothing you change here is saved or published');
    expect(document.body.textContent).not.toMatch(/published successfully|saved successfully/i);
  });

  it('shows the current identifier and the revision that a save would publish', async () => {
    const h = await harness();
    const target = ownerTargetsFor({ kind: 'home' }, h.content).items[0];
    if (target === undefined) throw new Error('no target');

    h.flows.openEditEntity(target);
    await settle();

    const highlight = h.content.highlights[0];
    if (highlight === undefined) throw new Error('no highlight');
    expect(document.body.textContent).toContain(highlight.id);
    expect(document.body.textContent).toContain(
      `current rev ${String(highlight.rev)} → draft rev ${String(highlight.rev + 1)}`,
    );
  });

  it('validates a draft through the real assembler and never claims a save', async () => {
    const h = await harness();
    const target = ownerTargetsFor({ kind: 'home' }, h.content).items[0];
    if (target === undefined) throw new Error('no target');
    h.flows.openEditEntity(target);
    await settle();

    buttons(document)
      .find((button) => button.dataset.qwbFormValidate !== undefined)
      ?.click();

    const result = document.querySelector<HTMLElement>('[data-qwb-form-result]');
    expect(result?.hidden).toBe(false);
    expect(result?.className).toContain('qwb-form-result-ok');
    expect(result?.textContent).toContain('would be published as rev 2');
    expect(result?.textContent).toContain('Nothing was saved or published');
  });

  it('reports field errors instead of pretending the draft is publishable', async () => {
    const h = await harness();
    const target = ownerTargetsFor({ kind: 'home' }, h.content).items[0];
    if (target === undefined) throw new Error('no target');
    h.flows.openEditEntity(target);
    await settle();

    field('title').value = '';
    buttons(document)
      .find((button) => button.dataset.qwbFormValidate !== undefined)
      ?.click();

    const result = document.querySelector<HTMLElement>('[data-qwb-form-result]');
    expect(result?.className).toContain('qwb-form-result-error');
    expect(result?.textContent).toContain('Title: required');
  });

  it('refuses to open an editor after the account no longer owns the name', async () => {
    const h = await harness({ names: ['a different name'] });
    const target = ownerTargetsFor({ kind: 'home' }, h.content).items[0];
    if (target === undefined) throw new Error('no target');

    h.flows.openEditEntity(target);
    await settle();

    expect(activeModalCount()).toBe(0);
    expect(document.getElementById('qwb-toast-host')?.textContent).toContain('nothing was opened');
  });

  it('keeps the draft and explains itself when owner mode ends mid-form', async () => {
    const h = await harness();
    const target = ownerTargetsFor({ kind: 'home' }, h.content).items[0];
    if (target === undefined) throw new Error('no target');
    h.flows.openEditEntity(target);
    await settle();

    field('title').value = 'Edited but not saved';
    h.flows.notifyOwnerModeEnded('the current account does not own the publishing name');

    const result = document.querySelector<HTMLElement>('[data-qwb-form-result]');
    expect(result?.textContent).toContain('Owner mode ended');
    expect(result?.textContent).toContain('draft is still in this form');
    expect(field('title').value).toBe('Edited but not saved');
    expect(activeModalCount()).toBe(1);
  });
});

describe('owner add flow', () => {
  it('opens a create form with candidate identifier, defaults and a disabled publish action', async () => {
    const h = await harness();
    const addTarget = ownerTargetsFor({ kind: 'home' }, h.content).adds[0];
    if (addTarget === undefined) throw new Error('no add target');

    h.flows.openAddEntity(addTarget.kind);
    await settle();

    expect(document.body.textContent).toContain('Candidate identifier qwb_hl_');
    expect(document.body.textContent).toContain('assigned at publish time');
    expect(field('title').value).toBe('New featured card');
    expect(document.querySelector<HTMLButtonElement>('[data-qwb-form-submit]')?.disabled).toBe(
      true,
    );

    const values = readFormValues(formOf(), fieldsForKind('highlight'));
    const assembly = assembleDraft({
      kind: 'highlight',
      values: { ...values, title: 'A new featured card' },
      original: null,
      site: h.content.site,
      id: 'qwb_hl_candidate-1',
      order: 90,
      now: 1,
    });
    expect(assembly.ok).toBe(true);
  });
});

describe('owner delete flow', () => {
  it('explains tombstone semantics and keeps the destructive action disabled', async () => {
    const h = await harness();
    const target = ownerTargetsFor({ kind: 'home' }, h.content).items[0];
    if (target === undefined) throw new Error('no target');

    h.flows.openDeleteEntity(target);
    await settle();

    const text = document.body.textContent ?? '';
    expect(text).toContain('tombstone');
    expect(text).toContain('no app-accessible QDN delete');
    expect(text).toContain('stay retrievable');
    expect(text).toContain('Nothing was changed');
    const destructive = buttons(document).find((button) => button.textContent?.trim() === 'Delete');
    expect(destructive?.disabled).toBe(true);
  });
});

describe('owner reorder flow', () => {
  it('moves the item on screen, records an unsaved change and never claims a publish', async () => {
    const h = await harness();
    const app = h.app;
    const targets = ownerTargetsFor({ kind: 'home' }, h.content);
    const priceTarget = targets.items.find((item) => item.groupKey === 'prices');
    if (priceTarget === undefined) throw new Error('no price target');

    const boxes = Array.from(app.querySelectorAll<HTMLElement>('#section_3 article.pricing-box'));
    const second = boxes[1];
    if (second === undefined) throw new Error('missing second pricing box');

    h.flows.reorderEntity(priceTarget, 'up', second);
    await settle();

    expect(h.drafts.count).toBe(1);
    expect(h.drafts.list()[0]?.entityId).toBe(priceTarget.entityId);
    const after = Array.from(app.querySelectorAll<HTMLElement>('#section_3 article.pricing-box'));
    expect(after[0]).toBe(second);
    expect(document.getElementById('qwb-toast-host')?.textContent).toContain(
      'shown on this screen only',
    );
    expect(document.getElementById('qwb-toast-host')?.textContent).not.toContain(
      'published successfully',
    );
  });

  it('does nothing when the item is already at the edge of its group', async () => {
    const h = await harness();
    const app = h.app;
    const targets = ownerTargetsFor({ kind: 'home' }, h.content);
    const priceTarget = targets.items.find((item) => item.groupKey === 'prices');
    if (priceTarget === undefined) throw new Error('no price target');

    const first = app.querySelector<HTMLElement>('#section_3 article.pricing-box');
    if (first === null) throw new Error('missing first pricing box');

    h.flows.reorderEntity(priceTarget, 'up', first);
    await settle();

    expect(h.drafts.count).toBe(0);
    expect(document.getElementById('qwb-toast-host')?.textContent).toContain('already at the edge');
  });
});

describe('owner publish-status shell', () => {
  it('states that nothing was submitted and shows the truthful vocabulary', async () => {
    const h = await harness();

    h.flows.openPublishStatus();
    await settle();

    const text = document.body.textContent ?? '';
    expect(text).toContain('Pending writes: 0');
    expect(text).toContain('No content has been submitted, saved or published');
    expect(text).toContain('Submitted to the host — availability not yet verified');
    expect(text).toContain('Outcome unknown');
  });
});

describe('phase guarantees', () => {
  it('has no write path behind any owner surface', async () => {
    await harness();
    const scan = scanForWrittenClaims();
    expect(scan.writeActionsOutsideAllowList).toEqual([]);
    expect(scan.persistenceUsage).toEqual([]);
    expect(provideWrittenClaim()).toBe(false);
  });

  it('does not use persisted storage for owner state', async () => {
    const h = await harness();
    h.flows.openAddEntity('work');
    await settle();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
