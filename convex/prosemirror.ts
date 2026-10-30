import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";

import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireOrg } from "./lib/org";
import { plainTextFromSnapshot } from "./lib/plaintext";

export const prosemirrorSync = new ProsemirrorSync(
  components.prosemirrorSync as unknown as ConstructorParameters<
    typeof ProsemirrorSync
  >[0],
);

export const {
  getSnapshot,
  submitSnapshot,
  latestVersion,
  getSteps,
  submitSteps,
} = prosemirrorSync.syncApi<DataModel>({
  checkRead: async (ctx, id) => {
    await assertSameOrg(ctx, id);
  },
  checkWrite: async (ctx, id) => {
    await assertSameOrg(ctx, id);
  },
  onSnapshot: async (ctx, id, snapshot) => {
    const documentId = id as Id<"documents">;
    const doc = await ctx.db.get("documents", documentId);
    if (doc) {
      await ctx.db.patch("documents", doc._id, {
        updatedAt: Date.now(),
        plainText: plainTextFromSnapshot(snapshot),
      });
    }
  },
});

async function assertSameOrg(ctx: QueryCtx | MutationCtx, id: string) {
  const { orgId } = await requireOrg(ctx);
  const doc = await ctx.db.get("documents", id as Id<"documents">);
  if (!doc || doc.orgId !== orgId) {
    throw new Error("Page not found");
  }
}
