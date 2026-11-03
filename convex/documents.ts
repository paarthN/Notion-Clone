import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { assertFullHolderRemains, requireAccess, resolveLevel } from "./lib/access";
import { clerkUserInOrg } from "./lib/clerkMembership";
import { requireOrg, type OrgContext } from "./lib/org";
import { documentSearchText } from "./lib/searchText";
import { deleteCommentsForDocument } from "./comments";
import { prosemirrorSync } from "./prosemirror";

const EMPTY_DOC = { type: "doc", content: [] };
const documentKind = v.union(
  v.literal("page"),
  v.literal("folder"),
  v.literal("database"),
);
const rowStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("done"),
);
const databaseView = v.union(v.literal("table"), v.literal("board"));
const PRESENCE_TTL_MS = 30_000;
const TREE_LIMIT = 2_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

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
    const actor = await requireOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("orgId", actor.orgId))
      .collect();
    const visible = await filterVisible(ctx, docs, actor);
    return visible
      .filter((doc) => !doc.isArchived)
      .sort((a, b) => a.position - b.position)
      .map(withKind);
  },
});

export const listTrash = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org_archived", (q) =>
        q.eq("orgId", actor.orgId).eq("isArchived", true),
      )
      .collect();
    const visible = await filterVisible(ctx, docs, actor);
    return visible.sort((a, b) => b.updatedAt - a.updatedAt).map(withKind);
  },
});

export const backfillSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const doc of docs) {
      if (doc.searchText !== undefined) continue;
      await ctx.db.patch("documents", doc._id, {
        searchText: documentSearchText(doc.title, doc.plainText ?? ""),
      });
    }
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const needle = args.query.trim();
    if (!needle) {
      return [];
    }
    const actor = await requireOrg(ctx);
    const docs = await ctx.db
      .query("documents")
      .withSearchIndex("search_documents", (q) =>
        q.search("searchText", needle).eq("orgId", actor.orgId).eq("isArchived", false),
      )
      .take(50);
    const visible = await filterVisible(ctx, docs, actor);
    const lowered = needle.toLowerCase();
    const hits = visible.filter((doc) => !doc.isArchived);
    hits.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(lowered) ? 0 : 1;
      const bTitle = b.title.toLowerCase().includes(lowered) ? 0 : 1;
      if (aTitle !== bTitle) {
        return aTitle - bTitle;
      }
      return b.updatedAt - a.updatedAt;
    });
    return hits.slice(0, 20).map((doc) => ({
      ...withKind(doc),
      snippet: matchSnippet(doc.plainText ?? "", lowered),
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
    view: v.optional(databaseView),
  },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOrg(ctx);
    const kind = args.kind ?? "page";
    const title = args.title?.trim() || "Untitled";
    let generalAccess: "edit" | "view" | "none" | undefined;
    let accessBeforePrivate: "edit" | "view" | undefined;
    if (args.parentId) {
      const parent = await requireAccess(ctx, args.parentId, "edit");
      if (parent.doc.isArchived) {
        throw new Error("Parent page not found");
      }
      generalAccess = parent.doc.generalAccess;
      accessBeforePrivate = parent.doc.accessBeforePrivate;
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
      title,
      icon: null,
      coverUrl: null,
      isArchived: false,
      position,
      createdBy: userId,
      updatedAt: Date.now(),
      kind,
      plainText: "",
      searchText: documentSearchText(title, ""),
      ...(generalAccess ? { generalAccess } : {}),
      ...(accessBeforePrivate ? { accessBeforePrivate } : {}),
      ...(kind === "database" && args.view ? { view: args.view } : {}),
    });

    await ctx.db.insert("access", {
      orgId,
      documentId: id,
      userId,
      level: "full",
      trusted: true,
    });

    if (kind === "page") {
      await prosemirrorSync.create(ctx, id, EMPTY_DOC);
    }
    return id;
  },
});

export const createCourse = mutation({
  args: {
    title: v.string(),
    courseCode: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOrg(ctx);
    const title = args.title.trim();
    const courseCode = args.courseCode.trim();
    if (!title) {
      throw new Error("Course name is required");
    }
    if (!courseCode) {
      throw new Error("Course code is required");
    }

    const roots = await ctx.db
      .query("documents")
      .withIndex("by_org_parent", (q) => q.eq("orgId", orgId).eq("parentId", null))
      .collect();
    const position = roots.reduce((max, doc) => Math.max(max, doc.position), -1) + 1;
    const updatedAt = Date.now();

    const courseId = await ctx.db.insert("documents", {
      orgId,
      parentId: null,
      title,
      icon: null,
      coverUrl: null,
      isArchived: false,
      position,
      createdBy: userId,
      updatedAt,
      kind: "folder",
      plainText: "",
      searchText: documentSearchText(title, ""),
      courseCode,
    });
    await ctx.db.insert("access", {
      orgId,
      documentId: courseId,
      userId,
      level: "full",
      trusted: true,
    });

    const course = await ctx.db.get("documents", courseId);
    if (!course || course.orgId !== orgId) {
      throw new Error("Course not found");
    }

    const children: Array<{
      title: string;
      kind: "page" | "database";
      section: "notes" | "tasks" | "exams";
      view?: "board";
    }> = [
      { title: "Notes", kind: "page", section: "notes" },
      { title: "Tasks", kind: "database", section: "tasks", view: "board" },
      { title: "Exams", kind: "database", section: "exams", view: "board" },
    ];

    for (const [index, child] of children.entries()) {
      const id = await ctx.db.insert("documents", {
        orgId,
        parentId: courseId,
        title: child.title,
        icon: null,
        coverUrl: null,
        isArchived: false,
        position: index,
        createdBy: userId,
        updatedAt,
        kind: child.kind,
        plainText: "",
        searchText: documentSearchText(child.title, ""),
        section: child.section,
        ...(course.generalAccess ? { generalAccess: course.generalAccess } : {}),
        ...(course.accessBeforePrivate
          ? { accessBeforePrivate: course.accessBeforePrivate }
          : {}),
        ...(child.kind === "database" && child.view ? { view: child.view } : {}),
      });
      await ctx.db.insert("access", {
        orgId,
        documentId: id,
        userId,
        level: "full",
        trusted: true,
      });
      if (child.kind === "page") {
        await prosemirrorSync.create(ctx, id, EMPTY_DOC);
      }
    }

    return courseId;
  },
});

export const termStart = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const row = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    return row?.termStartsOn ?? null;
  },
});

export const setTermStart = mutation({
  args: { termStartsOn: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    if (!Number.isFinite(args.termStartsOn)) {
      throw new Error("Invalid date");
    }
    const existing = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (existing) {
      await ctx.db.patch("workspaceSettings", existing._id, {
        termStartsOn: args.termStartsOn,
      });
      return;
    }
    await ctx.db.insert("workspaceSettings", {
      orgId,
      termStartsOn: args.termStartsOn,
    });
  },
});

export const rename = mutation({
  args: { id: v.id("documents"), title: v.string() },
  handler: async (ctx, args) => {
    const { doc } = await requireAccess(ctx, args.id, "edit");
    const title = args.title.trim() || "Untitled";
    await ctx.db.patch("documents", args.id, {
      title,
      searchText: documentSearchText(title, doc.plainText ?? ""),
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

export const storageUrl = action({
  args: { storageId: v.id("_storage"), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) {
      throw new Error("Uploaded file is missing");
    }
    const problem = imageProblem(metadata);
    if (problem) {
      await ctx.runMutation(internal.documents.discardUpload, {
        storageId: args.storageId,
      });
      throw new Error(problem);
    }
    return await ctx.runMutation(internal.documents.claimUpload, {
      storageId: args.storageId,
      documentId: args.documentId,
    });
  },
});

export const discardUpload = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireOrg(ctx);
    const existing = await ctx.db
      .query("files")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      return;
    }
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) {
      return;
    }
    await ctx.storage.delete(args.storageId);
  },
});

export const claimUpload = internalMutation({
  args: { storageId: v.id("_storage"), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const actor = await requireAccess(ctx, args.documentId, "edit");
    return await claimImage(ctx, actor.orgId, args.documentId, args.storageId);
  },
});

export const setCover = mutation({
  args: {
    id: v.id("documents"),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAccess(ctx, args.id, "edit");
    if (!args.storageId) {
      await ctx.db.patch("documents", args.id, {
        coverUrl: null,
        coverStorageId: undefined,
        updatedAt: Date.now(),
      });
      return;
    }
    const coverUrl = await claimImage(ctx, actor.orgId, args.id, args.storageId);
    await ctx.db.patch("documents", args.id, {
      coverUrl,
      coverStorageId: args.storageId,
      updatedAt: Date.now(),
    });
  },
});

export const setProperties = mutation({
  args: {
    id: v.id("documents"),
    status: v.optional(v.union(rowStatus, v.null())),
    dueAt: v.optional(v.union(v.number(), v.null())),
    personId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    if (
      args.status === undefined &&
      args.dueAt === undefined &&
      args.personId === undefined
    ) {
      throw new Error("Nothing to update");
    }
    await requireAccess(ctx, args.id, "edit");
    const patch: {
      updatedAt: number;
      status?: "not_started" | "in_progress" | "done";
      dueAt?: number;
      personId?: string;
    } = { updatedAt: Date.now() };
    if (args.status !== undefined) {
      patch.status = args.status ?? undefined;
    }
    if (args.dueAt !== undefined) {
      if (args.dueAt !== null && !Number.isFinite(args.dueAt)) {
        throw new Error("Invalid date");
      }
      patch.dueAt = args.dueAt ?? undefined;
    }
    if (args.personId !== undefined) {
      if (args.personId === null) {
        patch.personId = undefined;
      } else {
        const personId = args.personId.trim();
        if (!personId || personId.length > 256) {
          throw new Error("Invalid member");
        }
        patch.personId = personId;
      }
    }
    await ctx.db.patch("documents", args.id, patch);
  },
});

export const setView = mutation({
  args: {
    id: v.id("documents"),
    view: databaseView,
  },
  handler: async (ctx, args) => {
    const { doc } = await requireAccess(ctx, args.id, "edit");
    if ((doc.kind ?? "page") !== "database") {
      throw new Error("This page is not a database");
    }
    await ctx.db.patch("documents", args.id, {
      view: args.view,
      updatedAt: Date.now(),
    });
  },
});

export const setStatusFilter = mutation({
  args: {
    id: v.id("documents"),
    status: v.union(rowStatus, v.null()),
  },
  handler: async (ctx, args) => {
    const { doc } = await requireAccess(ctx, args.id, "edit");
    if ((doc.kind ?? "page") !== "database") {
      throw new Error("This page is not a database");
    }
    await ctx.db.patch("documents", args.id, {
      statusFilter: args.status ?? undefined,
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
    const { orgId, doc: moving } = await requireAccess(ctx, args.id, "full");
    if (moving.orgId !== orgId || moving.isArchived) {
      throw new Error("Page not found");
    }
    if (args.parentId) {
      const parent = await requireAccess(ctx, args.parentId, "edit");
      if (parent.doc.isArchived) {
        throw new Error("Archived pages cannot be drop targets");
      }
      await assertMoveIsSafe(ctx, orgId, args.id, args.parentId);
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
    const { orgId } = actor;
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
    const rootId = await copyDocument(
      ctx,
      actor,
      source,
      parentId,
      `Copy of ${source.title.trim() || "Untitled"}`,
      position,
    );

    const queue: { sourceId: Id<"documents">; copyId: Id<"documents"> }[] = [
      { sourceId: source._id, copyId: rootId },
    ];
    const seen = new Set<string>([source._id]);
    let copied = 1;
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      const children = await ctx.db
        .query("documents")
        .withIndex("by_org_parent", (q) =>
          q.eq("orgId", orgId).eq("parentId", job.sourceId),
        )
        .collect();
      const active = children.filter((child) => !child.isArchived).sort(byPosition);
      for (const child of active) {
        if (seen.has(child._id)) {
          throw new Error("Couldn't duplicate this page");
        }
        seen.add(child._id);
        copied += 1;
        if (copied > TREE_LIMIT) {
          throw new Error("This page is too large to duplicate");
        }
        const copyId = await copyDocument(
          ctx,
          actor,
          child,
          job.copyId,
          child.title,
          child.position,
        );
        queue.push({ sourceId: child._id, copyId });
      }
    }
    return rootId;
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
    const mine = newestOwn(rows, actor.orgId, actor.userId);
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
          cursor: cursorFromRow(row),
        },
      ];
    });
  },
});

const cursorPoint = {
  blockId: v.string(),
  offset: v.number(),
  anchorBlockId: v.optional(v.string()),
  anchorOffset: v.optional(v.number()),
};

export const cursor = mutation({
  args: {
    documentId: v.id("documents"),
    cursor: v.union(v.null(), v.object(cursorPoint)),
  },
  handler: async (ctx, args) => {
    const actor = await requireAccess(ctx, args.documentId, "view");
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    const mine = newestOwn(rows, actor.orgId, actor.userId);
    const now = Date.now();
    const identity = {
      orgId: actor.orgId,
      documentId: args.documentId,
      userId: actor.userId,
      name: viewerName(actor.name, actor.userId),
      imageUrl: actor.imageUrl,
      updatedAt: now,
    };
    const point = args.cursor ? normalizeCursor(args.cursor) : null;
    if (!mine) {
      if (!point) return;
      await ctx.db.insert("presence", {
        ...identity,
        blockId: point.blockId,
        offset: point.offset,
        ...(point.anchorBlockId !== undefined && point.anchorOffset !== undefined
          ? {
              anchorBlockId: point.anchorBlockId,
              anchorOffset: point.anchorOffset,
            }
          : {}),
      });
      return;
    }
    await ctx.db.patch("presence", mine._id, {
      ...identity,
      blockId: point?.blockId,
      offset: point?.offset,
      anchorBlockId: point?.anchorBlockId,
      anchorOffset: point?.anchorOffset,
    });
  },
});

const accessLevel = v.union(
  v.literal("full"),
  v.literal("edit"),
  v.literal("view"),
  v.literal("none"),
);
const workspaceAccess = v.union(
  v.literal("edit"),
  v.literal("view"),
  v.literal("none"),
);

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
      accessBeforePrivate: actor.doc.accessBeforePrivate ?? null,
      shareToken: actor.doc.shareToken ?? null,
      grants: rows
        .filter((row) => row.orgId === actor.orgId)
        .map((row) => ({ userId: row.userId, level: row.level })),
    };
  },
});

export const hasAccessGrant = internalQuery({
  args: { id: v.id("documents"), userId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOrg(ctx);
    const row = await ctx.db
      .query("access")
      .withIndex("by_document_user", (q) =>
        q.eq("documentId", args.id).eq("userId", args.userId),
      )
      .unique();
    return Boolean(row && row.orgId === actor.orgId);
  },
});

export const setAccess = action({
  args: {
    id: v.id("documents"),
    generalAccess: v.optional(workspaceAccess),
    userId: v.optional(v.string()),
    level: v.optional(v.union(accessLevel, v.null())),
  },
  handler: async (ctx, args) => {
    let userId = args.userId;
    let membershipVerified = false;
    if (args.userId !== undefined) {
      userId = args.userId.trim();
      if (!userId) {
        throw new Error("Missing member");
      }
      if (userId.length > 256) {
        throw new Error("Invalid member");
      }
      const actor = await requireOrg(ctx);
      const existing = await ctx.runQuery(internal.documents.hasAccessGrant, {
        id: args.id,
        userId,
      });
      if (!existing) {
        const member = await clerkUserInOrg(actor.orgId, userId);
        if (member === false) {
          throw new Error("That person is not in this workspace");
        }
        membershipVerified = member === true;
      }
    }
    await ctx.runMutation(internal.documents.applyAccess, {
      id: args.id,
      generalAccess: args.generalAccess,
      userId,
      level: args.level,
      membershipVerified,
    });
  },
});

export const applyAccess = internalMutation({
  args: {
    id: v.id("documents"),
    generalAccess: v.optional(workspaceAccess),
    userId: v.optional(v.string()),
    level: v.optional(v.union(accessLevel, v.null())),
    membershipVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.generalAccess === undefined && args.userId === undefined) {
      throw new Error("Nothing to update");
    }
    const actor = await requireAccess(ctx, args.id, "full");
    if (args.generalAccess) {
      if (args.generalAccess === "none") {
        const current = actor.doc.generalAccess;
        const remembered =
          current === "edit" || current === "view"
            ? current
            : actor.doc.accessBeforePrivate ?? "edit";
        await ctx.db.patch("documents", args.id, {
          generalAccess: "none",
          accessBeforePrivate: remembered,
        });
      } else {
        await ctx.db.patch("documents", args.id, {
          generalAccess: args.generalAccess,
          accessBeforePrivate: undefined,
        });
      }
    }
    if (args.userId === undefined) {
      return;
    }
    const userId = args.userId.trim();
    if (!userId) {
      throw new Error("Missing member");
    }
    if (userId.length > 256) {
      throw new Error("Invalid member");
    }
    if (args.level === undefined) {
      throw new Error("Missing access level");
    }
    const level = args.level === null ? "none" : args.level;
    const prior = await ctx.db
      .query("access")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    const priorUserIds = new Set(
      prior.filter((row) => row.orgId === actor.orgId).map((row) => row.userId),
    );
    const existing = prior.find((row) => row.userId === userId && row.orgId === actor.orgId);
    const foreign = prior.find((row) => row.userId === userId && row.orgId !== actor.orgId);
    if (foreign) {
      throw new Error("Page not found");
    }
    if (existing) {
      await ctx.db.patch("access", existing._id, { level });
    } else {
      await ctx.db.insert("access", {
        orgId: actor.orgId,
        documentId: args.id,
        userId,
        level,
        trusted: args.membershipVerified,
      });
    }
    const doc = await ctx.db.get("documents", args.id);
    if (!doc || doc.orgId !== actor.orgId) {
      throw new Error("Page not found");
    }
    await assertFullHolderRemains(ctx, doc, actor, priorUserIds);
  },
});

export const setShareLink = mutation({
  args: { id: v.id("documents"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireAccess(ctx, args.id, "full");
    if (!args.enabled) {
      await ctx.db.patch("documents", args.id, { shareToken: undefined });
      return null;
    }
    if (actor.doc.shareToken) {
      return actor.doc.shareToken;
    }
    const token = newShareToken();
    await ctx.db.patch("documents", args.id, { shareToken: token });
    return token;
  },
});

function newShareToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let token = "";
  for (const byte of bytes) {
    token += byte.toString(16).padStart(2, "0");
  }
  return token;
}

function withKind(doc: Doc<"documents">) {
  const {
    plainText,
    searchText,
    coverStorageId,
    status,
    dueAt,
    personId,
    view,
    shareToken,
    ...rest
  } = doc;
  void plainText;
  void searchText;
  void coverStorageId;
  void shareToken;
  return {
    ...rest,
    kind: doc.kind ?? "page",
    ...(status !== undefined ? { status } : {}),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(personId !== undefined ? { personId } : {}),
    ...(view !== undefined ? { view } : {}),
  };
}

async function filterVisible(
  ctx: QueryCtx,
  docs: Doc<"documents">[],
  actor: OrgContext,
) {
  if (actor.role === "admin") {
    return docs;
  }
  const visible: Doc<"documents">[] = [];
  for (const doc of docs) {
    const level = await resolveLevel(ctx, doc, actor);
    if (level !== "none") {
      visible.push(doc);
    }
  }
  return visible;
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

function newestOwn(rows: Doc<"presence">[], orgId: string, userId: string) {
  let match: Doc<"presence"> | undefined;
  for (const row of rows) {
    if (row.orgId !== orgId || row.userId !== userId) continue;
    if (!match || row.updatedAt >= match.updatedAt) match = row;
  }
  return match;
}

function cursorFromRow(row: Doc<"presence">) {
  if (row.blockId === undefined || row.offset === undefined) return null;
  const cursor: {
    blockId: string;
    offset: number;
    anchor?: { blockId: string; offset: number };
  } = { blockId: row.blockId, offset: row.offset };
  if (
    row.anchorBlockId !== undefined &&
    row.anchorOffset !== undefined &&
    (row.anchorBlockId !== row.blockId || row.anchorOffset !== row.offset)
  ) {
    cursor.anchor = { blockId: row.anchorBlockId, offset: row.anchorOffset };
  }
  return cursor;
}

function normalizeCursor(cursor: {
  blockId: string;
  offset: number;
  anchorBlockId?: string;
  anchorOffset?: number;
}) {
  const blockId = readBlockId(cursor.blockId);
  const offset = readOffset(cursor.offset);
  let anchorBlockId: string | undefined;
  let anchorOffset: number | undefined;
  if (cursor.anchorBlockId !== undefined && cursor.anchorOffset !== undefined) {
    anchorBlockId = readBlockId(cursor.anchorBlockId);
    anchorOffset = readOffset(cursor.anchorOffset);
    if (anchorBlockId === blockId && anchorOffset === offset) {
      anchorBlockId = undefined;
      anchorOffset = undefined;
    }
  }
  return { blockId, offset, anchorBlockId, anchorOffset };
}

function readBlockId(value: string) {
  const id = value.trim();
  if (!id || id.length > 128) throw new Error("Invalid cursor");
  return id;
}

function readOffset(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error("Invalid cursor");
  }
  return value;
}

async function setArchived(
  ctx: MutationCtx,
  orgId: string,
  rootId: Id<"documents">,
  isArchived: boolean,
) {
  const stack: Id<"documents">[] = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) break;
    if (seen.has(id)) {
      throw new Error("Couldn't archive this page");
    }
    seen.add(id);
    if (seen.size > TREE_LIMIT) {
      throw new Error("This page is too large to archive");
    }
    const doc = await ctx.db.get("documents", id);
    if (!doc || doc.orgId !== orgId) {
      continue;
    }
    await ctx.db.patch("documents", id, { isArchived, updatedAt: Date.now() });
    const children = await ctx.db
      .query("documents")
      .withIndex("by_org_parent", (q) => q.eq("orgId", orgId).eq("parentId", id))
      .collect();
    for (const child of children) {
      stack.push(child._id);
    }
  }
}

async function assertMoveIsSafe(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  ancestorId: Id<"documents">,
  nodeId: Id<"documents">,
) {
  let current: Id<"documents"> | null = nodeId;
  const seen = new Set<string>();
  let walked = 0;
  while (current) {
    if (seen.has(current) || walked >= TREE_LIMIT) {
      throw new Error("Cannot move a page into itself");
    }
    seen.add(current);
    walked += 1;
    if (current === ancestorId) {
      throw new Error("Cannot move a page into itself");
    }
    const doc: Doc<"documents"> | null = await ctx.db.get("documents", current);
    if (!doc || doc.orgId !== orgId) {
      throw new Error("Destination not found");
    }
    current = doc.parentId;
  }
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
  rootId: Id<"documents">,
) {
  const order: Id<"documents">[] = [];
  const stack: Id<"documents">[] = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) break;
    if (seen.has(id)) {
      throw new Error("Couldn't delete this page");
    }
    seen.add(id);
    if (seen.size > TREE_LIMIT) {
      throw new Error("This page is too large to delete");
    }
    const doc = await ctx.db.get("documents", id);
    if (!doc || doc.orgId !== orgId) {
      continue;
    }
    order.push(id);
    const children = await ctx.db
      .query("documents")
      .withIndex("by_org_parent", (q) => q.eq("orgId", orgId).eq("parentId", id))
      .collect();
    for (const child of children) {
      stack.push(child._id);
    }
  }

  for (const id of order.reverse()) {
    const doc = await ctx.db.get("documents", id);
    if (!doc || doc.orgId !== orgId) {
      continue;
    }
    await deleteCommentsForDocument(ctx, orgId, id);

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

    if (doc.coverStorageId) {
      const metadata = await ctx.storage.getMetadata(doc.coverStorageId);
      if (metadata) {
        await ctx.storage.delete(doc.coverStorageId);
      }
      const claim = await ctx.db
        .query("files")
        .withIndex("by_storage", (q) => q.eq("storageId", doc.coverStorageId))
        .unique();
      if (claim) {
        await ctx.db.delete("files", claim._id);
      }
    }

    if ((doc.kind ?? "page") === "page") {
      await ctx.runMutation(components.prosemirrorSync.lib.deleteDocument, { id });
    }
    await ctx.db.delete("documents", id);
  }
}

async function copyDocument(
  ctx: MutationCtx,
  actor: OrgContext & { doc: Doc<"documents">; level: string },
  source: Doc<"documents">,
  parentId: Id<"documents"> | null,
  title: string,
  position: number,
) {
  const kind = source.kind ?? "page";
  const plainText = source.plainText ?? "";
  const id = await ctx.db.insert("documents", {
    orgId: actor.orgId,
    parentId,
    title,
    icon: source.icon,
    coverUrl: source.coverUrl,
    isArchived: false,
    position,
    createdBy: actor.userId,
    updatedAt: Date.now(),
    kind,
    plainText,
    searchText: documentSearchText(title, plainText),
    ...(source.generalAccess ? { generalAccess: source.generalAccess } : {}),
    ...(source.accessBeforePrivate
      ? { accessBeforePrivate: source.accessBeforePrivate }
      : {}),
    ...(source.status ? { status: source.status } : {}),
    ...(source.dueAt !== undefined ? { dueAt: source.dueAt } : {}),
    ...(source.personId ? { personId: source.personId } : {}),
    ...(source.view ? { view: source.view } : {}),
    ...(source.statusFilter ? { statusFilter: source.statusFilter } : {}),
  });

  await ctx.db.insert("access", {
    orgId: actor.orgId,
    documentId: id,
    userId: actor.userId,
    level: "full",
    trusted: true,
  });

  if (kind === "page") {
    const snapshot = await ctx.runQuery(components.prosemirrorSync.lib.getSnapshot, {
      id: source._id,
    });
    await prosemirrorSync.create(ctx, id, snapshotContent(snapshot.content));
  }
  return id;
}

function imageProblem(metadata: { size: number; contentType: string | null }) {
  if (metadata.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller";
  }
  const contentType = metadata.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!IMAGE_TYPES.has(contentType)) {
    return "Only PNG, JPEG, GIF, and WebP images can be uploaded";
  }
  return null;
}

async function claimImage(
  ctx: MutationCtx,
  orgId: string,
  documentId: Id<"documents">,
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.storage.getMetadata(storageId);
  if (!metadata) {
    throw new Error("Uploaded file is missing");
  }
  const existing = await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
  if (existing) {
    if (existing.orgId !== orgId || existing.documentId !== documentId) {
      throw new Error("Uploaded file is missing");
    }
  } else {
    const problem = imageProblem(metadata);
    if (problem) {
      throw new Error(problem);
    }
    await ctx.db.insert("files", { orgId, documentId, storageId });
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) {
    throw new Error("Uploaded file is missing");
  }
  return url;
}
