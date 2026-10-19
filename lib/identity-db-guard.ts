import type Dexie from "dexie";
import { assertIdentityActive, identityDatabaseIsShared } from "./identity-runtime";

export function protectIdentityDatabase(db: Dexie, logicalName: string): void {
  if (identityDatabaseIsShared(logicalName)) return;
  db.use({ stack: "dbcore", name: "identity-write-boundary", create: down => ({
    ...down,
    table: name => {
      const table = down.table(name);
      return { ...table, mutate: request => { assertIdentityActive(); return table.mutate(request); } };
    },
  }) });
  if (typeof window !== "undefined") window.addEventListener("float-identity-silenced", () => db.close());
}
