/**
 * The owner interaction flows, driven through the **real** QDN read and publish
 * modules against the scripted node in `tests/support/qdn.ts`.
 *
 * These are the Phase 3 contract tests: a verified write must be proven by a
 * read-back before the UI claims anything, an unverified or ambiguous write must
 * keep the draft and never be retried automatically, media must publish before the
 * entity that references it, and a second write for the same identifier must be
 * refused while the first is in flight.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createOwnerFlows } from '../src/owner/flows';
import type { OwnerFlowDeps, OwnerFlows } from '../src/owner/flows';
import { createDraftStore } from '../src/owner/drafts';
import type { DraftStore } from '../src/owner/drafts';
import { createWriteLog } from '../src/owner/writes';
import type { WriteLog } from '../src/owner/writes';
import { ownerTargetsFor } from '../src/owner/targets';
import type { OwnerItemTarget } from '../src/owner/targets';
import { activeModalCount, closeAllModals } from '../src/ui/modal';
import { clearToasts } from '../src/ui/toast';
import { assembleDraft, fieldsForKind, readFormValues } from '../src/owner/fields';
import type { OwnerSession } from '../src/owner/session';
import type { ContentBundle, ImageRef, WorkPayload } from '../src/content/schema';
import { createQdnSource } from '../src/content/qdn-source';
import type { QortalBridge } from '../src/qortal/bridge';
import type { ImageEncoder } from '../src/owner/media';
import { provideWrittenClaim, scanForWrittenClaims } from './support/claims';
import { createFakeNode, seedStoredEntities } from './support/qdn';
import type { FakeNode } from './support/qdn';
import { identityFrom, mountApp, RENDER_OWNER_SCOPE, sessionFor, settle } from './support/owner';

const OWNER_NAME = 'Qortal Web Builders';

interface Harness {
  content: () => ContentBundle;
  session: OwnerSession;
  flows: OwnerFlows;
  drafts: DraftStore;
  writes: WriteLog;
  rerenders: () => number;
  app: HTMLElement;
  node: FakeNode;
}

/**
 * A node already holding every shipped seed entity, so the read path under test
 * discovers a realistic multi-entity publisher and the re-read after a write is a
 * real reload rather than an echo of the draft.
 */
async function nodeWithSeed(): Promise<FakeNode> {
  return createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
}

async function harness(
  options: {
    readonly node?: FakeNode;
    /** Delays every signed publish until this resolves (in-flight tests). */
    readonly gate?: Promise<void>;
    readonly encodeImage?: ImageEncoder;
  } = {},
): Promise<Harness> {
  const node = options.node ?? (await nodeWithSeed());
  const appIdentity = identityFrom(RENDER_OWNER_SCOPE);
  const source = createQdnSource({ app: appIdentity, bridge: node.bridge });
  const loaded = await source.load();
  if (loaded.status === 'error') throw new Error('content could not be loaded for the test');

  let content = loaded.bundle;
  const app = mountApp({ kind: 'home' }, content);

  const base = node.bridge;
  const gate = options.gate;
  const bridge: QortalBridge =
    gate === undefined
      ? base
      : {
          available: base.available,
          describe: base.describe,
          request: async (action, payload, requestOptions) => {
            if (action === 'PUBLISH_QDN_RESOURCE') await gate;
            return base.request(action, payload, requestOptions);
          },
        };

  const drafts = createDraftStore();
  const writes = createWriteLog();
  const session = sessionFor({ app: appIdentity, bridge });
  let renders = 0;

  const deps: OwnerFlowDeps = {
    session,
    drafts,
    writes,
    getContent: () => content,
    loadContent: async () => {
      const reloaded = await source.load();
      content = reloaded.bundle;
      return reloaded;
    },
    requestRerender: () => {
      renders += 1;
    },
    verifyAttempts: 1,
    verifyDelayMs: 0,
    ...(options.encodeImage === undefined ? {} : { encodeImage: options.encodeImage }),
  };
  const flows = createOwnerFlows(deps);
  await session.reverify('boot');

  return {
    content: () => content,
    session,
    flows,
    drafts,
    writes,
    rerenders: () => renders,
    app,
    node,
  };
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

function submitButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('[data-qwb-form-submit]');
  if (button === null) throw new Error('no submit button');
  return button;
}

function statusText(): string {
  return document.querySelector<HTMLElement>('[data-qwb-form-status]')?.textContent ?? '';
}

function toastText(): string {
  return document.getElementById('qwb-toast-host')?.textContent ?? '';
}

function targetFor(h: Harness, predicate: (item: OwnerItemTarget) => boolean): OwnerItemTarget {
  const target = ownerTargetsFor({ kind: 'home' }, h.content()).items.find(predicate);
  if (target === undefined) throw new Error('no matching owner target');
  return target;
}

function firstItem(h: Harness): OwnerItemTarget {
  const target = ownerTargetsFor({ kind: 'home' }, h.content()).items[0];
  if (target === undefined) throw new Error('no target');
  return target;
}

/** Types into a field the way a person would, so the dirty-draft registry updates. */
function setField(name: string, value: string): void {
  const element = field(name);
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function highlightId(h: Harness): string {
  const highlight = h.content().highlights[0];
  if (highlight === undefined) throw new Error('no highlight');
  return highlight.id;
}

/** Answers as the given stored payloads without going through the bridge at all. */
function encoderOf(bytes: Uint8Array, mimeType = 'image/webp'): ImageEncoder {
  return {
    encode: () =>
      Promise.resolve({
        bytes,
        mimeType,
        filename: mimeType === 'image/png' ? 'cover.png' : 'cover.webp',
        width: 800,
        height: 600,
      }),
  };
}

function chooseFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  closeAllModals();
  clearToasts();
});

describe('owner edit flow', () => {
  it('opens a form pre-filled from the current content with an enabled, truthful save', async () => {
    const h = await harness();
    const target = firstItem(h);

    h.flows.openEditEntity(target);
    await settle();

    expect(field('title').value).toBe(h.content().highlights[0]?.title);
    expect(field('bullets')).toBeInstanceOf(HTMLTextAreaElement);
    expect((field('bullets') as HTMLTextAreaElement).value).toContain('\n');

    const submit = submitButton();
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toContain('Save & publish');
    // The Phase 2 "nothing is published" copy must be gone, replaced by the real
    // explanation of what a save does and what is verified.
    expect(document.body.textContent).not.toContain('not enabled in this phase');
    expect(document.body.textContent).toContain('publishes to the Qortal Data Network');
    expect(document.body.textContent).toContain('only reported as published after');
  });

  it('shows the current identifier and the revision that a save would publish', async () => {
    const h = await harness();
    h.flows.openEditEntity(firstItem(h));
    await settle();

    const highlight = h.content().highlights[0];
    if (highlight === undefined) throw new Error('no highlight');
    expect(document.body.textContent).toContain(highlight.id);
    expect(document.body.textContent).toContain(
      `current rev ${String(highlight.rev)} → draft rev ${String(highlight.rev + 1)}`,
    );
  });

  it('validates a draft through the real assembler and never claims a publish', async () => {
    const h = await harness();
    h.flows.openEditEntity(firstItem(h));
    await settle();

    buttons(document)
      .find((button) => button.dataset.qwbFormValidate !== undefined)
      ?.click();

    const result = document.querySelector<HTMLElement>('[data-qwb-form-result]');
    expect(result?.hidden).toBe(false);
    expect(result?.className).toContain('qwb-form-result-ok');
    expect(result?.textContent).toContain('would be published as revision 2');
    expect(result?.textContent).toContain('Nothing was published by this check');
    expect(h.node.publishes()).toHaveLength(0);
  });

  it('reports field errors instead of pretending the draft is publishable', async () => {
    const h = await harness();
    h.flows.openEditEntity(firstItem(h));
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
    const h = await harness({
      node: createFakeNode({ name: 'a different name' }),
    });
    expect(h.session.state.status).toBe('visitor');

    h.flows.openEditEntity(firstItem(h));
    await settle();

    expect(activeModalCount()).toBe(0);
    expect(toastText()).toContain('nothing was opened');
  });

  it('keeps the draft and explains itself when owner mode ends mid-form', async () => {
    const h = await harness();
    h.flows.openEditEntity(firstItem(h));
    await settle();

    setField('title', 'Edited but not published');
    h.flows.notifyOwnerModeEnded('the current account does not own the publishing name');

    const result = document.querySelector<HTMLElement>('[data-qwb-form-result]');
    expect(result?.textContent).toContain('Owner mode ended');
    expect(result?.textContent).toContain('draft is still in this form');
    expect(field('title').value).toBe('Edited but not published');
    expect(activeModalCount()).toBe(1);
    expect(h.node.publishes()).toHaveLength(0);
  });

  it('publishes an update, verifies the served revision and closes the form', async () => {
    const h = await harness();
    const target = firstItem(h);
    const id = highlightId(h);
    const original = h.content().highlights[0];
    if (original === undefined) throw new Error('no highlight');

    h.flows.openEditEntity(target);
    await settle();
    setField('title', 'A verified new title');
    submitButton().click();
    await settle();
    await settle();

    const publishes = h.node.publishes();
    expect(publishes).toHaveLength(1);
    expect(publishes[0]?.service).toBe('JSON');
    expect(publishes[0]?.name).toBe(OWNER_NAME);
    expect(publishes[0]?.identifier).toBe(id);

    const stored = h.node.stored().find((entry) => entry.identifier === id);
    expect(stored?.payload.title).toBe('A verified new title');
    expect(stored?.payload.rev).toBe(original.rev + 1);

    const entry = h.writes.entries()[0];
    expect(entry?.stage).toBe('settled');
    expect(entry?.state).toBe('submitted');
    expect(entry?.availability).toBe('verified');
    expect(entry?.servedRev).toBe(original.rev + 1);

    // The form closes only on a verified write, and the served content is re-read.
    expect(activeModalCount()).toBe(0);
    expect(toastText()).toContain('was published and verified as revision 2');
    expect(h.content().highlights[0]?.title).toBe('A verified new title');
    expect(h.drafts.count).toBe(0);
  });

  it('does not claim success when the node has not served the new revision', async () => {
    const h = await harness({
      node: createFakeNode({ name: OWNER_NAME, autoStore: false }),
    });
    const original = h.content().highlights[0];
    if (original === undefined) throw new Error('no highlight');

    h.flows.openEditEntity(firstItem(h));
    await settle();
    setField('title', 'Not served yet');
    submitButton().click();
    await settle();
    await settle();

    const entry = h.writes.entries()[0];
    expect(entry?.state).toBe('submitted');
    expect(entry?.availability).toBe('not-yet-served');

    // The draft survives, the form stays open and the retry is explicitly barred.
    expect(activeModalCount()).toBe(1);
    expect(field('title').value).toBe('Not served yet');
    expect(h.drafts.count).toBe(1);
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain('Not retryable');
    expect(statusText()).toContain('not verified yet');
    expect(statusText()).toContain('Nothing is retried automatically');
    // Only the single submitted publish exists — no automatic retry.
    expect(h.node.publishes()).toHaveLength(1);
    // The page still renders the served truth, not the optimistic draft.
    expect(h.content().highlights[0]?.title).toBe(original.title);
  });

  it('reports an ambiguous outcome as unknown and never retries it', async () => {
    const h = await harness({
      node: createFakeNode({
        name: OWNER_NAME,
        publishError: new Error('The request timed out'),
      }),
    });

    h.flows.openEditEntity(firstItem(h));
    await settle();
    submitButton().click();
    await settle();
    await settle();

    const entry = h.writes.entries()[0];
    expect(entry?.state).toBe('ambiguous');
    expect(entry?.availability).toBe('unverified');
    expect(statusText()).toContain('Outcome unknown');
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain('Not retryable');
    // The signature might already be on its way, so there is exactly one attempt.
    expect(h.node.publishes()).toHaveLength(1);
    expect(activeModalCount()).toBe(1);
  });

  it('reports a declined publish as rejected and allows an explicit second attempt', async () => {
    const node = createFakeNode({
      name: OWNER_NAME,
      publishError: new Error('user declined request'),
    });
    const h = await harness({ node });

    h.flows.openEditEntity(firstItem(h));
    await settle();
    submitButton().click();
    await settle();
    await settle();

    expect(h.writes.entries()[0]?.state).toBe('rejected');
    expect(statusText()).toContain('Rejected by the host');
    expect(statusText()).toContain('No change was published');
    // Nothing was signed, so an explicit retry is allowed — the owner decides.
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().textContent).toContain('Save & publish');

    // The owner retries deliberately; the second attempt succeeds.
    node.setPublishError(undefined);
    submitButton().click();
    await settle();
    await settle();

    expect(h.node.publishes()).toHaveLength(2);
    expect(h.writes.entries()[0]?.availability).toBe('verified');
    expect(activeModalCount()).toBe(0);
  });

  it('refuses a second write for the same identifier while one is in flight', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await harness({ gate });
    const target = firstItem(h);
    const id = highlightId(h);

    h.flows.openEditEntity(target);
    await settle();
    submitButton().click();
    await settle();

    // The first write is now waiting for the host: the identifier is locked.
    expect(h.writes.isBusy(id)).toBe(true);
    clearToasts();

    // Any other entry point for the same entity is refused.
    h.flows.openEditEntity(target);
    await settle();
    expect(toastText()).toContain('still in flight');
    expect(toastText()).toContain('never submits the same item twice');
    expect(activeModalCount()).toBe(1);

    release();
    await settle();
    await settle();

    expect(h.node.publishes()).toHaveLength(1);
    expect(h.node.publishes()[0]?.identifier).toBe(id);
    expect(h.writes.entries()[0]?.availability).toBe('verified');
  });
});

describe('owner add flow', () => {
  it('opens a create form with the identifier assigned at open time and an enabled publish', async () => {
    const h = await harness();
    const addTarget = ownerTargetsFor({ kind: 'home' }, h.content()).adds[0];
    if (addTarget === undefined) throw new Error('no add target');

    h.flows.openAddEntity(addTarget.kind);
    await settle();

    expect(document.body.textContent).toContain('assigned when this form opened');
    expect(document.body.textContent).toContain('qwb_hl_');
    expect(field('title').value).toBe('New featured card');
    expect(submitButton().disabled).toBe(false);

    const values = readFormValues(formOf(), fieldsForKind('highlight'));
    const assembly = assembleDraft({
      kind: 'highlight',
      values: { ...values, title: 'A new featured card' },
      original: null,
      site: h.content().site,
      id: 'qwb_hl_new-1',
      order: 90,
      now: 1,
    });
    expect(assembly.ok).toBe(true);
  });

  it('reuses one minted identifier for a failed attempt instead of recycling it', async () => {
    const node = createFakeNode({
      name: OWNER_NAME,
      publishError: new Error('user declined request'),
    });
    const h = await harness({ node });
    const addTarget = ownerTargetsFor({ kind: 'home' }, h.content()).adds[0];
    if (addTarget === undefined) throw new Error('no add target');

    h.flows.openAddEntity(addTarget.kind);
    await settle();
    const minted = formOf().elements.namedItem('title');
    expect(minted).not.toBeNull();
    const identifier = document.body.textContent?.match(/qwb_hl_[a-z0-9_-]+/)?.[0];
    expect(identifier).toBeDefined();

    submitButton().click();
    await settle();
    await settle();
    submitButton().click();
    await settle();
    await settle();

    const publishes = h.node.publishes();
    expect(publishes).toHaveLength(2);
    expect(publishes[0]?.identifier).toBe(identifier);
    expect(publishes[1]?.identifier).toBe(identifier);
  });
});

describe('owner delete flow', () => {
  it('publishes a verified tombstone for the same identifier', async () => {
    const h = await harness();
    const target = firstItem(h);
    const id = highlightId(h);
    const original = h.content().highlights[0];
    if (original === undefined) throw new Error('no highlight');

    h.flows.openDeleteEntity(target);
    await settle();

    const text = document.body.textContent ?? '';
    expect(text).toContain('tombstone');
    expect(text).toContain('no app-accessible QDN delete');
    expect(text).toContain('stay retrievable');
    const destructive = buttons(document).find((button) => button.textContent?.trim() === 'Delete');
    expect(destructive?.disabled).toBe(false);

    destructive?.click();
    await settle();
    await settle();

    const stored = h.node.stored().find((entry) => entry.identifier === id);
    expect(stored?.payload.state).toBe('deleted');
    expect(stored?.payload.rev).toBe(original.rev + 1);
    expect(stored?.payload.payload).toBeNull();
    expect(h.writes.entries()[0]?.availability).toBe('verified');
    expect(toastText()).toContain('tombstone was published');
    // A tombstoned entity is filtered out of every read path.
    expect(h.content().highlights.some((entry) => entry.id === id)).toBe(false);
  });

  it('keeps the destructive action open and explains itself when the tombstone is not verified', async () => {
    const h = await harness({
      node: createFakeNode({ name: OWNER_NAME, autoStore: false }),
    });
    const target = firstItem(h);

    h.flows.openDeleteEntity(target);
    await settle();
    buttons(document)
      .find((button) => button.textContent?.trim() === 'Delete')
      ?.click();
    await settle();
    await settle();

    const status = document.querySelector<HTMLElement>('[data-qwb-delete-status]');
    expect(status?.textContent).toContain('Submitted to the host');
    expect(status?.textContent).toContain('not verified yet');
    const destructive = buttons(document).find((button) => button.textContent?.trim() === 'Delete');
    expect(destructive?.disabled).toBe(true);
    expect(h.node.publishes()).toHaveLength(1);
  });
});

describe('owner reorder flow', () => {
  it('persists the move by republishing the moved item with a midpoint order', async () => {
    const h = await harness();
    const targets = ownerTargetsFor({ kind: 'home' }, h.content());
    const priceTarget = targets.items.find(
      (item) => item.groupKey === 'prices' && item.entityId === h.content().prices[1]?.id,
    );
    if (priceTarget === undefined) throw new Error('no second price target');
    const moved = h.content().prices[1];
    const above = h.content().prices[0];
    if (moved === undefined || above === undefined) throw new Error('missing price tiers');

    // The flow must not move DOM nodes: order is persisted, then re-read.
    const before = Array.from(
      h.app.querySelectorAll<HTMLElement>('#section_3 article.pricing-box'),
    );

    h.flows.reorderEntity(priceTarget, 'up');
    await settle();
    await settle();

    const publishes = h.node.publishes();
    expect(publishes).toHaveLength(1);
    expect(publishes[0]?.identifier).toBe(moved.id);
    const stored = h.node.stored().find((entry) => entry.identifier === moved.id);
    const order = (stored?.payload as { order?: number }).order;
    expect(order).toBeDefined();
    expect(order as number).toBeLessThan(above.order);
    expect(order as number).toBeLessThan(moved.order);
    expect(stored?.payload.rev).toBe(moved.rev + 1);

    expect(h.writes.entries()[0]?.availability).toBe('verified');
    expect(toastText()).toContain('Order saved and verified');
    // Ordering is persisted, not staged as an unsaved draft.
    expect(h.drafts.count).toBe(0);
    // The flow itself never moves DOM nodes; the served order changed instead.
    const after = Array.from(h.app.querySelectorAll<HTMLElement>('#section_3 article.pricing-box'));
    expect(after.length).toBe(before.length);
    after.forEach((element, index) => {
      expect(element).toBe(before[index]);
    });
    // Re-reading the node proves the new order is what the site now renders from.
    expect(h.content().prices.map((entry) => entry.id)).toEqual([
      moved.id,
      above.id,
      ...h
        .content()
        .prices.slice(2)
        .map((entry) => entry.id),
    ]);
  });

  it('refuses a move at the edge of the group without publishing', async () => {
    const h = await harness();
    const targets = ownerTargetsFor({ kind: 'home' }, h.content());
    const firstPrice = targets.items.find(
      (item) => item.groupKey === 'prices' && item.entityId === h.content().prices[0]?.id,
    );
    if (firstPrice === undefined) throw new Error('no first price target');

    h.flows.reorderEntity(firstPrice, 'up');
    await settle();

    expect(h.node.publishes()).toHaveLength(0);
    expect(toastText()).toContain('already first in its group');
    expect(h.drafts.count).toBe(0);
  });
});

describe('owner media flow', () => {
  it('publishes and verifies the image before the entity that references it', async () => {
    const h = await harness({
      encodeImage: encoderOf(new Uint8Array([1, 2, 3, 4, 5])),
    });
    const workTarget = targetFor(h, (item) => item.kind === 'work');
    const work = h.content().works.find((entry) => entry.id === workTarget.entityId);
    if (work === undefined) throw new Error('no work');

    h.flows.openEditEntity(workTarget);
    await settle();

    const fileInput = formOf().querySelector<HTMLInputElement>('[data-qwb-media="cover"]');
    if (fileInput === null) throw new Error('no cover file input');
    chooseFile(fileInput, new File([new Uint8Array([9])], 'cover.png', { type: 'image/png' }));
    await settle();
    await settle();

    const note = formOf().querySelector<HTMLElement>('[data-qwb-media-note="cover"]');
    expect(note?.textContent).toContain('THUMBNAIL');
    expect(note?.textContent).toContain('Publishes before the item');

    submitButton().click();
    await settle();
    await settle();
    await settle();

    const publishes = h.node.publishes();
    expect(publishes).toHaveLength(2);
    // Media first, under the entity's identifier, then the JSON entity.
    expect(publishes[0]?.service).toBe('THUMBNAIL');
    expect(publishes[0]?.identifier).toBe(work.id);
    expect(publishes[1]?.service).toBe('JSON');

    const storedWork = h.node.stored().find((entry) => entry.identifier === work.id);
    const payload = storedWork?.payload.payload as WorkPayload | undefined;
    const cover: ImageRef | undefined = payload?.cover;
    expect(cover?.source).toBe('qdn');
    if (cover?.source !== 'qdn') throw new Error('the stored cover is not a QDN reference');
    expect(cover.identifier).toBe(work.id);
    expect(cover.name).toBe(OWNER_NAME);

    expect(h.writes.entries()[0]?.availability).toBe('verified');
    expect(activeModalCount()).toBe(0);
  });

  it('does not publish the entity when the image cannot be verified', async () => {
    const h = await harness({
      node: createFakeNode({ name: OWNER_NAME, autoStore: false }),
      encodeImage: encoderOf(new Uint8Array([1, 2, 3, 4, 5])),
    });
    const workTarget = targetFor(h, (item) => item.kind === 'work');
    const work = h.content().works.find((entry) => entry.id === workTarget.entityId);
    if (work === undefined) throw new Error('no work');

    h.flows.openEditEntity(workTarget);
    await settle();
    const fileInput = formOf().querySelector<HTMLInputElement>('[data-qwb-media="cover"]');
    if (fileInput === null) throw new Error('no cover file input');
    chooseFile(fileInput, new File([new Uint8Array([9])], 'cover.png', { type: 'image/png' }));
    await settle();
    await settle();

    submitButton().click();
    await settle();
    await settle();
    await settle();

    // Only the image was submitted; the entity that references it was held back.
    const publishes = h.node.publishes();
    expect(publishes).toHaveLength(1);
    expect(publishes[0]?.service).toBe('THUMBNAIL');
    expect(statusText()).toContain('The image was not verified');
    // The draft, including the chosen image, is still in the open form.
    expect(activeModalCount()).toBe(1);
    expect(h.drafts.count).toBe(1);
    expect(h.node.publishes().every((call) => call.service === 'THUMBNAIL')).toBe(true);
  });

  it('re-checks an unverified image from the form, then publishes the item', async () => {
    const h = await harness({ encodeImage: encoderOf(new Uint8Array([1, 2, 3, 4, 5])) });
    const workTarget = targetFor(h, (item) => item.kind === 'work');
    const work = h.content().works.find((entry) => entry.id === workTarget.entityId);
    if (work === undefined) throw new Error('no work');

    h.flows.openEditEntity(workTarget);
    await settle();
    const fileInput = formOf().querySelector<HTMLInputElement>('[data-qwb-media="cover"]');
    if (fileInput === null) throw new Error('no cover file input');
    chooseFile(fileInput, new File([new Uint8Array([9])], 'cover.png', { type: 'image/png' }));
    await settle();
    await settle();

    // The node accepts the image submission but has not caught up when it is read back.
    h.node.setLagging(work.id);
    submitButton().click();
    await settle();
    await settle();
    await settle();

    // Media before entity: the item was held back while its image is unproven.
    expect(h.node.publishes()).toHaveLength(1);
    expect(h.node.publishes()[0]?.service).toBe('THUMBNAIL');
    expect(statusText()).toContain('The image was not verified');
    expect(statusText()).toContain('Check status');
    // A submitted-but-unverified image may already be relayed, so a second submit is refused…
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain('Not retryable');
    // …and the draft, including the chosen image, is still in the open form.
    expect(activeModalCount()).toBe(1);
    expect(h.drafts.count).toBe(1);

    const check = formOf().querySelector<HTMLButtonElement>('[data-qwb-form-check]');
    if (check === null) throw new Error('no check button');

    // Re-checking while the node is still behind is honest, and publishes nothing.
    check.click();
    await settle();
    await settle();
    expect(statusText()).toContain('Image still unverified');
    expect(h.node.publishes()).toHaveLength(1);

    h.node.setLagging(null);
    check.click();
    await settle();
    await settle();
    await settle();
    await settle();

    // The image is re-read as the exact bytes, and only then is the item published.
    const publishes = h.node.publishes();
    expect(publishes).toHaveLength(2);
    expect(publishes[0]?.service).toBe('THUMBNAIL');
    expect(publishes[1]?.service).toBe('JSON');
    const storedWork = h.node.stored().find((entry) => entry.identifier === work.id);
    const payload = storedWork?.payload.payload as WorkPayload | undefined;
    expect(payload?.cover?.source).toBe('qdn');
    expect(activeModalCount()).toBe(0);
  });

  it('allows an explicit second submit when the image was rejected, not submitted', async () => {
    const h = await harness({ encodeImage: encoderOf(new Uint8Array([1, 2, 3, 4, 5])) });
    const workTarget = targetFor(h, (item) => item.kind === 'work');
    h.flows.openEditEntity(workTarget);
    await settle();
    const fileInput = formOf().querySelector<HTMLInputElement>('[data-qwb-media="cover"]');
    if (fileInput === null) throw new Error('no cover file input');
    chooseFile(fileInput, new File([new Uint8Array([9])], 'cover.png', { type: 'image/png' }));
    await settle();
    await settle();

    // The host declined, so nothing was published and nothing may be claimed.
    h.node.setPublishError('user declined request');
    submitButton().click();
    await settle();
    await settle();
    await settle();

    expect(h.node.publishes()).toHaveLength(1);
    expect(statusText()).toContain('Rejected by the host');
    expect(h.writes.entries()[0]?.availability).toBe('unverified');
    // A rejected request published nothing, so an explicit retry is still offered.
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().textContent).toContain('Save & publish');
    expect(activeModalCount()).toBe(1);
  });

  it('edits an article through its own service and re-reads it from there', async () => {
    // Articles are the one kind the approved model publishes in DOCUMENT rather
    // than JSON, so this pins that the whole cycle (discovery → publish →
    // read-back → re-read → render) uses that service, not the JSON default.
    const h = await harness();
    const target = ownerTargetsFor({ kind: 'posts' }, h.content()).items.find(
      (item) => item.kind === 'article',
    );
    if (target === undefined) throw new Error('no article target');
    const article = h.content().articles.find((entry) => entry.id === target.entityId);
    if (article === undefined) throw new Error('no article');

    h.flows.openEditEntity(target);
    await settle();
    expect(field('title').value).toBe(article.title);

    setField('title', 'Harness article headline');
    submitButton().click();
    await settle();
    await settle();
    await settle();

    const publishes = h.node.publishes();
    expect(publishes).toHaveLength(1);
    expect(publishes[0]?.service).toBe('DOCUMENT');
    expect(publishes[0]?.identifier).toBe(article.id);

    const reads = h.node
      .calls()
      .filter((call) => call.action === 'FETCH_QDN_RESOURCE' && call.identifier === article.id);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((call) => call.service === 'DOCUMENT')).toBe(true);

    // The reload discovered the article in DOCUMENT and the app now shows the
    // verified title, not the draft.
    const reloaded = h.content().articles.find((entry) => entry.id === article.id);
    expect(reloaded?.title).toBe('Harness article headline');
    expect(reloaded?.rev).toBe(article.rev + 1);
    expect(h.writes.entries()[0]?.availability).toBe('verified');
    expect(activeModalCount()).toBe(0);
  });
});

describe('owner publish-status shell', () => {
  it('shows the truthful vocabulary and then the real write entries', async () => {
    const h = await harness();

    h.flows.openPublishStatus();
    await settle();
    let text = document.body.textContent ?? '';
    expect(text).toContain('No write has been submitted in this session');
    expect(text).toContain('A submission is not a result');
    closeAllModals();

    h.flows.openEditEntity(firstItem(h));
    await settle();
    submitButton().click();
    await settle();
    await settle();

    h.flows.openPublishStatus();
    await settle();
    text = document.body.textContent ?? '';
    expect(text).toContain('Pending writes: 0');
    expect(text).toContain('Submitted to the host');
    expect(text).toContain('availability: verified');
  });
});

describe('phase guarantees', () => {
  it('keeps every bridge action and direct qortalRequest inside src/qortal', async () => {
    await harness();
    const scan = scanForWrittenClaims();
    expect(scan.writeActionsOutsideAllowList).toEqual([]);
    expect(scan.directBridgeUsage).toEqual([]);
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
