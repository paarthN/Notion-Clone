import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { Transform } from "@tiptap/pm/transform";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAccess } from "./lib/access";
import { pagePmSchema } from "./lib/pmSchema";
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
    await requireAccess(ctx, id as Id<"documents">, "view");
  },
  checkWrite: async (ctx, id) => {
    await requireAccess(ctx, id as Id<"documents">, "edit");
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
  pruneSnapshots: false,
});

export const listVersions = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireAccess(ctx, args.id, "view");
    return await ctx.runQuery(components.prosemirrorSync.lib.listSnapshots, {
      id: args.id,
    });
  },
});

export const restore = mutation({
  args: { id: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, args.id, "edit");
    const snapshot = await ctx.runQuery(components.prosemirrorSync.lib.getSnapshot, {
      id: args.id,
      version: args.version,
    });
    if (!snapshot.content || snapshot.version !== args.version) {
      throw new Error("Save not found");
    }

    const schema = pagePmSchema();
    let target;
    try {
      target = schema.nodeFromJSON(JSON.parse(snapshot.content));
    } catch {
      throw new Error("Couldn't restore this save");
    }

    const doc = await prosemirrorSync.transform(
      ctx,
      args.id,
      schema,
      (node) => {
        if (node.eq(target)) return null;
        const tr = new Transform(node);
        tr.replaceWith(0, node.content.size, target.content);
        return tr.steps.length > 0 ? tr : null;
      },
      { clientId: "restore" },
    );

    await ctx.db.patch("documents", args.id, {
      updatedAt: Date.now(),
      plainText: plainTextFromSnapshot(JSON.stringify(doc.toJSON())),
    });
  },
});

