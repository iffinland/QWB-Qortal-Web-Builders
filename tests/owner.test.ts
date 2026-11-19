import { describe, expect, it, vi } from 'vitest';

import { resolveOwner } from '../src/qortal/owner';
import type { QortalBridge } from '../src/qortal/adapter';
import { saveEntity } from '../src/content/save';
import type { QdnWriter } from '../src/qortal/adapter';
import { memoryReader, publishedStore, allSeedEntities } from './helpers';
import { seedBundle } from '../src/content/seed';

const OWNER_ADDRESS = 'QOWNERADDRESS1';

function bridgeFor(address: string | null): QortalBridge {
  return {
    request: vi.fn((payload: Record<string, unknown>) => {
      if (payload.action === 'GET_USER_ACCOUNT') {
        return Promise.resolve(address === null ? {} : { address });
      }
      return Promise.reject(new Error(`unexpected action ${String(payload.action)}`));
    }),
  };
}

const nameOwnedBy = (owner: string | null) => () => Promise.resolve(owner);

describe('owner recognition (fail-closed)', () => {
  it('is a visitor when no owner name is configured', async () => {
    const state = await resolveOwner({
      ownerName: '',
      bridge: bridgeFor(OWNER_ADDRESS),
      nameOwner: nameOwnedBy(OWNER_ADDRESS),
    });
    expect(state).toEqual({ status: 'visitor', reason: 'publishing-name-unknown' });
  });

  it('is a visitor outside Qortal, where no bridge exists', async () => {
    const state = await resolveOwner({
      ownerName: 'owner',
      bridge: null,
      nameOwner: nameOwnedBy(OWNER_ADDRESS),
    });
    expect(state).toEqual({ status: 'visitor', reason: 'no-qortal-bridge' });
  });

  it('is a visitor when no account is connected', async () => {
    const state = await resolveOwner({
      ownerName: 'owner',
      bridge: bridgeFor(null),
      nameOwner: nameOwnedBy(OWNER_ADDRESS),
    });
    expect(state).toEqual({ status: 'visitor', reason: 'no-account' });
  });

  it('is a visitor when the configured name is not registered', async () => {
    const state = await resolveOwner({
      ownerName: 'owner',
      bridge: bridgeFor(OWNER_ADDRESS),
      nameOwner: nameOwnedBy(null),
    });
    expect(state).toEqual({ status: 'visitor', reason: 'owner-name-unregistered' });
  });

  it('is a visitor for any account that does not own the name', async () => {
    const state = await resolveOwner({
      ownerName: 'owner',
      bridge: bridgeFor('QSOMEONEELSE'),
      nameOwner: nameOwnedBy(OWNER_ADDRESS),
    });
    expect(state).toEqual({ status: 'visitor', reason: 'not-owner' });
  });

  it('is a visitor when the check itself fails', async () => {
    const failing = nameOwnedBy(null);
    const state = await resolveOwner({
      ownerName: 'owner',
      bridge: bridgeFor(OWNER_ADDRESS),
      nameOwner: () => failing().then(() => Promise.reject(new Error('network down'))),
    });
    expect(state).toEqual({ status: 'visitor', reason: 'check-failed' });
  });

  it('recognises the owner only when the connected address owns the name', async () => {
    const state = await resolveOwner({
      ownerName: ' owner ',
      bridge: bridgeFor(OWNER_ADDRESS),
      nameOwner: nameOwnedBy(OWNER_ADDRESS),
    });
    expect(state).toEqual({ status: 'owner', name: 'owner', address: OWNER_ADDRESS });
  });
});

describe('owner gating of writes', () => {
  function writerSpy(): { writer: QdnWriter; publish: ReturnType<typeof vi.fn> } {
    const publish = vi.fn(() => Promise.resolve());
    return { writer: { publishJson: publish }, publish };
  }

  it('refuses every save from a visitor and never calls the writer', async () => {
    const { writer, publish } = writerSpy();
    const store = publishedStore();
    const entity = { ...seedBundle.works[0]!, rev: 2, updatedAt: 1, title: 'Changed' };
    const outcome = await saveEntity(
      {
        owner: { status: 'visitor', reason: 'not-owner' },
        name: 'Qortal Web Builders',
        reader: memoryReader(store),
        writer,
      },
      entity,
      1,
    );
    expect(outcome).toEqual({ status: 'unauthorized', reason: 'not-owner' });
    expect(publish).not.toHaveBeenCalled();
  });

  it('refuses a save from the owner when the entity is invalid, before publishing', async () => {
    const { writer, publish } = writerSpy();
    const outcome = await saveEntity(
      {
        owner: { status: 'owner', name: 'owner', address: OWNER_ADDRESS },
        name: 'Qortal Web Builders',
        reader: memoryReader(publishedStore()),
        writer,
      },
      { ...seedBundle.works[0]!, rev: 2, payload: {} },
      1,
    );
    expect(outcome.status).toBe('invalid');
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps the seed entities valid for owner editing', () => {
    expect(allSeedEntities().every((entity) => entity.rev === 1)).toBe(true);
  });
});
