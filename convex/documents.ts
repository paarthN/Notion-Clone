import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireOrg } from "./lib/org";
import { prosemirrorSync } from "./prosemirror";

const EMPTY_DOC = { type: "doc", content: [] };
const documentKind = v.union(v.literal("page"), v.literal("folder"));
const PRESENCE_TTL_MS = 30_000;

export const session = query({
  args: {},
  handler: async (ctx) => {
    const { userId, name, imageUrl, role } = await requireOrg(ctx);
    return { userId, name, imageUrl, role };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return docs
      .filter((doc) => !doc.isArchived)
      .sort((a, b) => a.position - b.position)
      .map(withKind);
  },
});

export const listTrash = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org_archived", (q) =>
        q.eq("orgId", orgId).eq("isArchived", true),
      )
      .collect();
    return docs.sort((a, b) => b.updatedAt - a.updatedAt).map(withKind);
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const needle = args.query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const { orgId } = await requireOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return docs
      .filter(
        (doc) => !doc.isArchived && doc.title.toLowerCase().includes(needle),
      )
      .slice(0, 20)
      .map(withKind);
  },
});

export const favorites = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, userId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("favorites")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
      .collect();
    return rows.map((row) => row.documentId);
  },
});

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    parentId: v.union(v.id("documents"), v.null()),
    kind: v.optional(documentKind),
  },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOrg(ctx);
    const kind = args.kind ?? "page";
    if (args.parentId) {
      const parent = await ctx.db.get("documents", args.parentId);
      if (!parent || parent.orgId !== orgId || parent.isArchived) {
        throw new Error("Parent page not found");
      }
    }

    const siblings = await ctx.db
      .query("documents")
      .withIndex("by_org_parent", (q) =>
        q.eq("orgId", orgId).eq("parentId", args.parentId),
      )
      .collect();
    const position =
      siblings.reduce((max, doc) => Math.max(max, doc.position), -1) + 1;

    const id = await ctx.db.insert("documents", {
      orgId,
      parentId: args.parentId,
      title: args.title?.trim() || "Untitled",
      icon: null,
      coverUrl: null,
      isArchived: false,
      position,
      createdBy: userId,
      updatedAt: Date.now(),
      kind,
    });

    if (kind === "page") {
      await prosemirrorSync.create(ctx, id, EMPTY_DOC);
    }
    return id;
  },
});

export const rename = mutation({
  args: { id: v.id("documents"), title: v.string() },
  handler: async (ctx, args) => {
    await requireOwned(ctx, args.id);
    await ctx.db.patch("documents", args.id, {
      title: args.title.trim() || "Untitled",
      updatedAt: Date.now(),
    });
  },
});

export const setIcon = mutation({
  args: { id: v.id("documents"), icon: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireOwned(ctx, args.id);
    await ctx.db.patch("documents", args.id, {
      icon: args.icon,
      updatedAt: Date.now(),
    });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOrg(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const storageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireOrg(ctx);
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Uploaded file is missing");
    }
    return url;
  },
});

export const setCover = mutation({
  args: {
    id: v.id("documents"),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, args) => {
    await requireOwned(ctx, args.id);
    const coverUrl = args.storageId
      ? await ctx.storage.getUrl(args.storageId)
      : null;
    await ctx.db.patch("documents", args.id, {
      coverUrl,
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const { orgId } = await requireOwned(ctx, args.id);
    await setArchived(ctx, orgId, args.id, true);
  },
});

export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const { orgId } = await requireOwned(ctx, args.id);
    await setArchived(ctx, orgId, args.id, false);
  },
});

export const toggleFavorite = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOwned(ctx, args.id);
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
      .collect();
    const match = existing.find((row) => row.documentId === args.id);
    if (match) {
      await ctx.db.delete("favorites", match._id);
      return false;
    }
    await ctx.db.insert("favorites", {
      orgId,
      userId,
      documentId: args.id,
    });
    return true;
  },
});

export const heartbeat = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const actor = await requireOwned(ctx, args.documentId);
    const now = Date.now();
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    const mine = rows.find((row) => row.userId === actor.userId);
    const next = {
      orgId: actor.orgId,
      documentId: args.documentId,
      userId: actor.userId,
      name: viewerName(actor.name, actor.userId),
      imageUrl: actor.imageUrl,
      updatedAt: now,
    };
    if (mine) {
      await ctx.db.patch("presence", mine._id, next);
    } else {
      await ctx.db.insert("presence", next);
    }

    const current = await ctx.db
      .query("presence")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    const cutoff = now - PRESENCE_TTL_MS;
    const seen = new Set<string>();
    const ordered = [...current].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const row of ordered) {
      if (row.updatedAt < cutoff || seen.has(row.userId)) {
        await ctx.db.delete("presence", row._id);
      } else {
        seen.add(row.userId);
      }
    }
  },
});

export const viewers = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const actor = await requireOwned(ctx, args.documentId);
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    const seen = new Set<string>();
    const fresh = rows
      .filter((row) => row.updatedAt >= cutoff && row.orgId === actor.orgId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return fresh.flatMap((row) => {
      if (seen.has(row.userId)) {
        return [];
      }
      seen.add(row.userId);
      return [
        {
          userId: row.userId,
          name: viewerName(row.name, row.userId),
          imageUrl: row.imageUrl,
        },
      ];
    });
  },
});

function withKind(doc: Doc<"documents">) {
  return { ...doc, kind: doc.kind ?? "page" };
}

function viewerName(name: string, userId: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === userId) {
    return "Member";
  }
  return trimmed;
}

async function requireOwned(ctx: QueryCtx | MutationCtx, id: Id<"documents">) {
  const actor = await requireOrg(ctx);
  const doc = await ctx.db.get("documents", id);
  if (!doc || doc.orgId !== actor.orgId) {
    throw new Error("Page not found");
  }
  return actor;
}

async function setArchived(
  ctx: MutationCtx,
  orgId: string,
  id: Id<"documents">,
  isArchived: boolean,
  depth = 0,
) {
  if (depth > 20) {
    return;
  }
  await ctx.db.patch("documents", id, { isArchived, updatedAt: Date.now() });
  const children = await ctx.db
    .query("documents")
    .withIndex("by_org_parent", (q) => q.eq("orgId", orgId).eq("parentId", id))
    .collect();
  for (const child of children) {
    await setArchived(ctx, orgId, child._id, isArchived, depth + 1);
  }
}
