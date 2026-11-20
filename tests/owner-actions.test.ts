import { describe, expect, it, vi } from 'vitest';
import { mountOwnerConsole, renderOwnerEditorHost } from '../src/owner/console';
import { seedBundle } from '../src/content/seed';
import type { ContentBundle } from '../src/content/schema';
import { memoryReader } from './helpers';

describe('inline owner removal actions', () => {
  it.each(['toggle-hidden', 'delete'])('publishes seed %s as revision one and keeps other content', async (action) => {
    const entity = seedBundle.services[0]!;
    const store = new Map<string, unknown>();
    const root = document.createElement('div');
    root.innerHTML = renderOwnerEditorHost() + `<button data-action="${action}" data-collection="services" data-id="${entity.id}">Action</button>`;
    const changed = vi.fn<(raw: ContentBundle, notice: string) => void>();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const teardown = mountOwnerConsole(root, {
      raw: seedBundle,
      unpublishedIds: [entity.id],
      deps: {
        owner: { status: 'owner', name: 'Owner', address: 'QOwner' },
        name: 'Owner', reader: memoryReader(store),
        writer: { publishJson: (request) => { store.set(request.identifier, request.value); return Promise.resolve(); } },
      },
      onRawChange: changed,
    });
    root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(store.get(entity.id)).toMatchObject({ rev: 1, ...(action === 'delete' ? { state: 'deleted' } : { hidden: true }) });
    expect(changed.mock.calls[0]![0].services).toHaveLength(seedBundle.services.length);
    teardown();
    confirm.mockRestore();
  });
});
