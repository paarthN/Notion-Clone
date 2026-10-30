import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { assertFullHolderRemains, requireAccess } from "./lib/access";
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
    const hits = docs.filter((doc) => {
      if (doc.isArchived) {
        return false;
      }
      return (
        doc.title.toLowerCase().includes(needle) ||
        (doc.plainText ?? "").toLowerCase().includes(needle)
      );
    });
    hits.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(needle) ? 0 : 1;
      const bTitle = b.title.toLowerCase().includes(needle) ? 0 : 1;
      if (aTitle !== bTitle) {
        return aTitle - bTitle;
      }
      return b.updatedAt - a.updatedAt;
    });
    return hits.slice(0, 20).map((doc) => ({
      ...withKind(doc),
      snippet: matchSnippet(doc.plainText ?? "", needle),
    }));
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
    let generalAccess: "edit" | "view" | undefined;
    if (args.parentId) {
      const parent = await requireAccess(ctx, args.parentId, "edit");
      if (parent.doc.isArchived) {
        throw new Error("Parent page not found");
      }
      generalAccess = parent.doc.generalAccess;
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
      plainText: "",
      ...(generalAccess ? { generalAccess } : {}),
    });

    await ctx.db.insert("access", {
      orgId,
      documentId: id,
      userId,
      level: "full",
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
    await requireAccess(ctx, args.id, "edit");
    await ctx.db.patch("documents", args.id, {
      title: args.title.trim() || "Untitled",
      updatedAt: Date.now(),
    });
  },
});

export const setIcon = mutation({
  args: { id: v.id("documents"), icon: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAccess(ctx, args.id, "edit");
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
    await requireAccess(ctx, args.id, "edit");
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
    const { orgId } = await requireAccess(ctx, args.id, "full");
    await setArchived(ctx, orgId, args.id, true);
  },
});

export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const { orgId } = await requireAccess(ctx, args.id, "full");
    await setArchived(ctx, orgId, args.id, false);
  },
});

export const move = mutation({
  args: {
    id: v.id("documents"),
    parentId: v.union(v.id("documents"), v.null()),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAccess(ctx, args.id, "full");
    const moving = await ctx.db.get("documents", args.id);
    if (!moving || moving.orgId !== orgId || moving.isArchived) {
      throw new Error("Page not found");
    }
    if (args.parentId) {
      const parent = await ctx.db.get("documents", args.parentId);
      if (!parent || parent.orgId !== orgId) {
        throw new Error("Destination not found");
      }
      if (parent.isArchived) {
        throw new Error("Archived pages cannot be drop targets");
      }
      if (await isInside(ctx, orgId, args.id, args.parentId)) {
        throw new Error("Cannot move a page into itself");
      }
    }

    const index = Number.isFinite(args.index) ? Math.floor(args.index) : 0;
    if (moving.parentId !== args.parentId) {
      await rewriteParent(ctx, orgId, moving.parentId, moving, null);
    }
    await rewriteParent(ctx, orgId, args.parentId, moving, index);
  },
});

export const duplicate = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const actor = await requireAccess(ctx, args.id, "full");
    const { orgId, userId } = actor;
    const source = actor.doc;
    if (!source || source.orgId !== orgId || source.isArchived) {
      throw new Error("Page not found");
    }

    let parentId = source.parentId;
    if (parentId) {
      const parent = await ctx.db.get("documents", parentId);
      if (!parent || parent.orgId !== orgId || parent.isArchived) {
        parentId = null;
      }
    }

    const siblings = await ctx.db
      .query("documents")
      .withIndex("by_org_parent", (q) =>
        q.eq("orgId", orgId).eq("parentId", parentId),
      )
      .collect();
    const position =
      siblings.reduce((max, doc) => Math.max(max, doc.position), -1) + 1;
    const kind = source.kind ?? "page";
    const id = await ctx.db.insert("documents", {
      orgId,
      parentId,
      title: `Copy of ${source.title.trim() || "Untitled"}`,
      icon: source.icon,
      coverUrl: source.coverUrl,
      isArchived: false,
      position,
      createdBy: userId,
      updatedAt: Date.now(),
      kind,
      plainText: source.plainText ?? "",
      ...(source.generalAccess ? { generalAccess: source.generalAccess } : {}),
    });

    await ctx.db.insert("access", {
      orgId,
      documentId: id,
      userId,
      level: "full",
    });

    if (kind === "page") {
      const snapshot = await ctx.runQuery(components.prosemirrorSync.lib.getSnapshot, {
        id: source._id,
      });
      await prosemirrorSync.create(ctx, id, snapshotContent(snapshot.content));
    }
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const actor = await requireAccess(ctx, args.id, "full");
    if (!actor.doc.isArchived) {
      throw new Error("Move the page to trash before deleting it");
    }
    await deleteDocumentTree(ctx, actor.orgId, args.id);
  },
});

export const toggleFavorite = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireAccess(ctx, args.id, "view");
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
    const actor = await requireAccess(ctx, args.documentId, "view");
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
    const actor = await requireAccess(ctx, args.documentId, "view");
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

const accessLevel = v.union(v.literal("full"), v.literal("edit"), v.literal("view"));
const workspaceAccess = v.union(v.literal("edit"), v.literal("view"));

export const pageAccess = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const actor = await requireAccess(ctx, args.id, "view");
    const rows = await ctx.db
      .query("access")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    return {
      level: actor.level,
      generalAccess: actor.doc.generalAccess ?? "edit",
      grants: rows
        .filter((row) => row.orgId === actor.orgId)
        .map((row) => ({ userId: row.userId, level: row.level })),
    };
  },
});

export const setAccess = mutation({
  args: {
    id: v.id("documents"),
    generalAccess: v.optional(workspaceAccess),
    userId: v.optional(v.string()),
    level: v.optional(v.union(accessLevel, v.null())),
  },
  handler: async (ctx, args) => {
    if (args.generalAccess === undefined && args.userId === undefined) {
      throw new Error("Nothing to update");
    }
    const actor = await requireAccess(ctx, args.id, "full");
    if (args.generalAccess) {
      await ctx.db.patch("documents", args.id, {
        generalAccess: args.generalAccess,
      });
    }
    if (args.userId === undefined) {
      return;
    }
    const userId = args.userId.trim();
    if (!userId) {
      throw new Error("Missing member");
    }
    if (args.level === undefined) {
      throw new Error("Missing access level");
    }
    const existing = await ctx.db
      .query("access")
      .withIndex("by_document_user", (q) =>
        q.eq("documentId", args.id).eq("userId", userId),
      )
      .unique();
    if (existing && existing.orgId !== actor.orgId) {
      throw new Error("Page not found");
    }
    if (args.level === null) {
      if (existing) {
        await ctx.db.delete("access", existing._id);
      }
    } else if (existing) {
      await ctx.db.patch("access", existing._id, { level: args.level });
    } else {
      await ctx.db.insert("access", {
        orgId: actor.orgId,
        documentId: args.id,
        userId,
        level: args.level,
      });
    }
    const doc = await ctx.db.get("documents", args.id);
    if (!doc || doc.orgId !== actor.orgId) {
      throw new Error("Page not found");
    }
    await assertFullHolderRemains(ctx, doc, actor);
  },
});

function withKind(doc: Doc<"documents">) {
  const { plainText, ...rest } = doc;
  void plainText;
  return { ...rest, kind: doc.kind ?? "page" };
}

function matchSnippet(text: string, needle: string) {
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) {
    return null;
  }
  const start = Math.max(0, at - 36);
  const end = Math.min(text.length, at + needle.length + 36);
  let slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) {
    slice = `…${slice}`;
  }
  if (end < text.length) {
    slice = `${slice}…`;
  }
  return slice;
}

function viewerName(name: string, userId: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === userId) {
    return "Member";
  }
  return trimmed;
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

async function isInside(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  ancestorId: Id<"documents">,
  nodeId: Id<"documents">,
) {
  let current: Id<"documents"> | null = nodeId;
  const seen = new Set<string>();
  for (let depth = 0; depth < 25 && current; depth += 1) {
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    if (current === ancestorId) {
      return true;
    }
    const doc: Doc<"documents"> | null = await ctx.db.get("documents", current);
    if (!doc || doc.orgId !== orgId) {
      return false;
    }
    current = doc.parentId;
  }
  return false;
}

function byPosition(a: Doc<"documents">, b: Doc<"documents">) {
  return a.position - b.position || (a._id < b._id ? -1 : 1);
}

async function rewriteParent(
  ctx: MutationCtx,
  orgId: string,
  parentId: Id<"documents"> | null,
  moving: Doc<"documents">,
  index: number | null,
) {
  const siblings = await ctx.db
    .query("documents")
    .withIndex("by_org_parent", (q) =>
      q.eq("orgId", orgId).eq("parentId", parentId),
    )
    .collect();
  const active = siblings
    .filter((doc) => !doc.isArchived && doc._id !== moving._id)
    .sort(byPosition);
  if (index !== null) {
    const at = Math.max(0, Math.min(index, active.length));
    active.splice(at, 0, moving);
  }
  const archived = siblings
    .filter((doc) => doc.isArchived && doc._id !== moving._id)
    .sort(byPosition);
  const ordered = [...active, ...archived];
  const now = Date.now();
  for (let i = 0; i < ordered.length; i += 1) {
    const doc = ordered[i];
    const patch: {
      position: number;
      parentId?: Id<"documents"> | null;
      updatedAt?: number;
    } = { position: i };
    if (index !== null && doc._id === moving._id) {
      patch.parentId = parentId;
      patch.updatedAt = now;
    }
    if (
      doc.position === i &&
      patch.parentId === undefined &&
      patch.updatedAt === undefined
    ) {
      continue;
    }
    await ctx.db.patch("documents", doc._id, patch);
  }
}

function snapshotContent(raw: string | null) {
  if (!raw) {
    return EMPTY_DOC;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return EMPTY_DOC;
  }
  return EMPTY_DOC;
}

async function deleteDocumentTree(
  ctx: MutationCtx,
  orgId: string,
  id: Id<"documents">,
  depth = 0,
) {
  if (depth > 25) {
    return;
  }
  const doc = await ctx.db.get("documents", id);
  if (!doc || doc.orgId !== orgId) {
    return;
  }
  const children = await ctx.db
    .query("documents")
    .withIndex("by_org_parent", (q) => q.eq("orgId", orgId).eq("parentId", id))
    .collect();
  for (const child of children) {
    await deleteDocumentTree(ctx, orgId, child._id, depth + 1);
  }

  const favorites = await ctx.db
    .query("favorites")
    .withIndex("by_document", (q) => q.eq("documentId", id))
    .collect();
  for (const row of favorites) {
    if (row.orgId === orgId) {
      await ctx.db.delete("favorites", row._id);
    }
  }

  const presence = await ctx.db
    .query("presence")
    .withIndex("by_document", (q) => q.eq("documentId", id))
    .collect();
  for (const row of presence) {
    await ctx.db.delete("presence", row._id);
  }

  const grants = await ctx.db
    .query("access")
    .withIndex("by_document", (q) => q.eq("documentId", id))
    .collect();
  for (const row of grants) {
    await ctx.db.delete("access", row._id);
  }

  if ((doc.kind ?? "page") === "page") {
    await ctx.runMutation(components.prosemirrorSync.lib.deleteDocument, { id });
  }
  await ctx.db.delete("documents", id);
}
