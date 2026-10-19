import {
  acquireIdentityLease, assertIdentityLease, canIdentityInteract, IdentityBoundaryError,
  identityCharacterKey, identityStorageKey, type CharacterIdentityAccess,
  type IdentityLease, type IdentitySpaceManifest,
} from "./identity-space";

export type IdentityHostContext = {
  readonly lease: IdentityLease;
  assertCurrent: () => void;
  storageKey: (logicalKey: string) => string;
  characterKey: (characterId: string) => string;
  assertCharacter: (characterId: string) => void;
  run: <T>(operation: (lease: IdentityLease) => Promise<T>) => Promise<T>;
};

/** Freeze the identity when mounting an app / starting a request. Do not accept a payload userId. */
export function createIdentityHostContext(
  readState: () => IdentitySpaceManifest,
  readAccess: () => CharacterIdentityAccess,
): IdentityHostContext {
  const lease = acquireIdentityLease(readState());
  const assertCurrent = () => assertIdentityLease(readState(), lease);
  const assertCharacter = (characterId: string) => {
    assertCurrent();
    if (!canIdentityInteract(readState(), readAccess(), lease.userId, characterId)) {
      throw new IdentityBoundaryError("当前身份不能与这个角色互动");
    }
  };
  return Object.freeze({
    lease, assertCurrent,
    storageKey: (logicalKey: string) => { assertCurrent(); return identityStorageKey(lease.userId, logicalKey); },
    characterKey: (characterId: string) => { assertCharacter(characterId); return identityCharacterKey(lease.userId, characterId); },
    assertCharacter,
    run: async <T>(operation: (lease: IdentityLease) => Promise<T>): Promise<T> => {
      assertCurrent();
      const result = await operation(lease);
      assertCurrent();
      return result;
    },
  });
}

export type IdentityCollectionBackend = {
  read: (physicalKey: string) => Promise<unknown>;
  /** Commit must recheck the guard inside the transaction, not after writing. */
  write: (physicalKey: string, value: unknown, beforeCommit: () => void) => Promise<void>;
};

/** An app keeps its collection names; the host supplies app and identity namespaces. */
export function bindIdentityAppStorage(
  context: IdentityHostContext, appId: string, backend: IdentityCollectionBackend,
): { read: (collection: string) => Promise<unknown>; write: (collection: string, value: unknown) => Promise<void> } {
  const logicalKey = (collection: string) => JSON.stringify(["custom-app", appId, collection]);
  return {
    read: async collection => context.run(() => backend.read(context.storageKey(logicalKey(collection)))),
    write: async (collection, value) => context.run(() => backend.write(
      context.storageKey(logicalKey(collection)), value, context.assertCurrent,
    )),
  };
}
