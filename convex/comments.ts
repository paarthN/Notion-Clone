import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAccess } from "./lib/access";
import { requireOrg } from "./lib/org";

const anchorValidator = v.union(
  v.literal("page"),
  v.object({
    blockId: v.string(),
    from: v.number(),
    to: v.number(),
  }),
);

const mentionsValidator = v.array(v.string());

type DbCtx = QueryCtx | MutationCtx;
type Anchor = "page" | { blockId: string; from: number; to: number };

function cleanBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Write a comment first");
  }
  if (trimmed.length > 8000) {
    throw new Error("Comment is too long");
  }
  return trimmed;
}

function cleanMentions(ids: string[]) {
  const unique = new Set<string>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed) unique.add(trimmed);
    if (unique.size >= 20) break;
  }
  return [...unique];
}

function cleanAnchor(anchor: Anchor): Anchor {
  if (anchor === "page") return "page";
  const blockId = anchor.blockId.trim();
  const from = Math.floor(anchor.from);
  const to = Math.floor(anchor.to);
  if (
    !blockId ||
    blockId.length > 128 ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to < 0
  ) {
    throw new Error("Comment position is invalid");
  }
  return {
    blockId,
    from: Math.min(from, to),
    to: Math.max(from, to),
  };
}

function cleanEmoji(emoji: string) {
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > 8 || /\s/.test(trimmed)) {
    throw new Error("Pick a reaction");
  }
  return trimmed;
}

async function documentComments(
  ctx: DbCtx,
  orgId: string,
  documentId: Id<"documents">,
) {
  return ctx.db
    .query("comments")
    .withIndex("by_document", (q) =>
      q.eq("orgId", orgId).eq("documentId", documentId),
    )
    .collect();
}

async function loadOwn(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  commentId: Id<"comments">,
) {
  const { orgId, userId } = await requireAccess(ctx, documentId, "edit");
  const comment = await ctx.db.get("comments", commentId);
  if (!comment || comment.orgId !== orgId || comment.documentId !== documentId) {
    throw new Error("Comment not found");
  }
  if (comment.userId !== userId) {
    throw new Error("You can only change your own comment");
  }
  return { orgId, userId, comment };
}

function rootOf(rows: Doc<"comments">[], threadId: string) {
  return rows.find((row) => row.threadId === threadId && row.replyTo === undefined);
}

export const list = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const { orgId } = await requireAccess(ctx, args.documentId, "view");
    const rows = await documentComments(ctx, orgId, args.documentId);
    rows.sort((a, b) => a.createdAt - b.createdAt || (a._id < b._id ? -1 : 1));
    return rows;
  },
});

export const mentions = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, userId } = await requireOrg(ctx);
    const [rows, reads] = await Promise.all([
      ctx.db
        .query("commentMentions")
        .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
        .collect(),
      ctx.db
        .query("mentionReads")
        .withIndex("by_org_user_comment", (q) =>
          q.eq("orgId", orgId).eq("userId", userId),
        )
        .collect(),
    ]);
    const readIds = new Set(reads.map((row) => row.commentId));

    const mentioned = rows
      .filter((row) => row.authorId !== userId && !readIds.has(row.commentId))
      .sort(
        (a, b) => b.createdAt - a.createdAt || (a.commentId < b.commentId ? 1 : -1),
      );

    const found: {
      _id: Id<"comments">;
      documentId: Id<"documents">;
      userId: string;
      title: string;
      createdAt: number;
    }[] = [];

    for (const row of mentioned) {
      if (found.length >= 8) break;
      try {
        const access = await requireAccess(ctx, row.documentId, "view");
        if (access.doc.orgId !== orgId || access.doc.isArchived) continue;
        found.push({
          _id: row.commentId,
          documentId: row.documentId,
          userId: row.authorId,
          title: access.doc.title,
          createdAt: row.createdAt,
        });
      } catch {
        continue;
      }
    }

    return found;
  },
});

export const markMentionRead = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireOrg(ctx);
    const comment = await ctx.db.get("comments", args.commentId);
    if (
      !comment ||
      comment.orgId !== orgId ||
      comment.userId === userId ||
      !comment.mentions.includes(userId)
    ) {
      return;
    }
    await requireAccess(ctx, comment.documentId, "view");
    const existing = await ctx.db
      .query("mentionReads")
      .withIndex("by_org_user_comment", (q) =>
        q.eq("orgId", orgId).eq("userId", userId).eq("commentId", args.commentId),
      )
      .unique();
    if (existing) return;
    await ctx.db.insert("mentionReads", {
      orgId,
      userId,
      commentId: args.commentId,
    });
  },
});

export const create = mutation({
  args: {
    documentId: v.id("documents"),
    body: v.string(),
    mentions: mentionsValidator,
    anchor: anchorValidator,
  },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireAccess(ctx, args.documentId, "edit");
    const now = Date.now();
    const threadId = crypto.randomUUID();
    const mentions = cleanMentions(args.mentions);
    const commentId = await ctx.db.insert("comments", {
      orgId,
      documentId: args.documentId,
      userId,
      body: cleanBody(args.body),
      createdAt: now,
      updatedAt: now,
      threadId,
      resolved: false,
      anchor: cleanAnchor(args.anchor),
      mentions,
      reactions: [],
    });
    await writeMentions(ctx, {
      _id: commentId,
      orgId,
      documentId: args.documentId,
      userId,
      createdAt: now,
      mentions,
    });
    return { commentId, threadId };
  },
});

export const reply = mutation({
  args: {
    documentId: v.id("documents"),
    threadId: v.string(),
    body: v.string(),
    mentions: mentionsValidator,
  },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireAccess(ctx, args.documentId, "edit");
    const rows = await documentComments(ctx, orgId, args.documentId);
    const root = rootOf(rows, args.threadId);
    if (!root) {
      throw new Error("Thread not found");
    }
    const now = Date.now();
    const mentions = cleanMentions(args.mentions);
    const commentId = await ctx.db.insert("comments", {
      orgId,
      documentId: args.documentId,
      userId,
      body: cleanBody(args.body),
      createdAt: now,
      updatedAt: now,
      threadId: root.threadId,
      replyTo: root._id,
      resolved: false,
      anchor: root.anchor,
      mentions,
      reactions: [],
    });
    await writeMentions(ctx, {
      _id: commentId,
      orgId,
      documentId: args.documentId,
      userId,
      createdAt: now,
      mentions,
    });
    return { commentId, threadId: root.threadId };
  },
});

export const update = mutation({
  args: {
    documentId: v.id("documents"),
    commentId: v.id("comments"),
    body: v.string(),
    mentions: mentionsValidator,
  },
  handler: async (ctx, args) => {
    const { comment } = await loadOwn(ctx, args.documentId, args.commentId);
    const mentions = cleanMentions(args.mentions);
    await ctx.db.patch("comments", comment._id, {
      body: cleanBody(args.body),
      mentions,
      updatedAt: Date.now(),
    });
    await writeMentions(ctx, { ...comment, mentions });
  },
});

export const remove = mutation({
  args: {
    documentId: v.id("documents"),
    commentId: v.id("comments"),
  },
  handler: async (ctx, args) => {
    const { orgId, comment } = await loadOwn(ctx, args.documentId, args.commentId);
    if (comment.replyTo !== undefined) {
      await deleteCommentRecord(ctx, comment._id);
      return;
    }
    const rows = await documentComments(ctx, orgId, args.documentId);
    for (const row of rows) {
      if (row.threadId === comment.threadId) {
        await deleteCommentRecord(ctx, row._id);
      }
    }
  },
});

export const resolve = mutation({
  args: {
    documentId: v.id("documents"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAccess(ctx, args.documentId, "edit");
    const rows = await documentComments(ctx, orgId, args.documentId);
    const root = rootOf(rows, args.threadId);
    if (!root) {
      throw new Error("Thread not found");
    }
    await ctx.db.patch("comments", root._id, { resolved: true });
  },
});

export const unresolve = mutation({
  args: {
    documentId: v.id("documents"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireAccess(ctx, args.documentId, "edit");
    const rows = await documentComments(ctx, orgId, args.documentId);
    const root = rootOf(rows, args.threadId);
    if (!root) {
      throw new Error("Thread not found");
    }
    await ctx.db.patch("comments", root._id, { resolved: false });
  },
});

export const toggleReaction = mutation({
  args: {
    documentId: v.id("documents"),
    commentId: v.id("comments"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId, userId } = await requireAccess(ctx, args.documentId, "edit");
    const comment = await ctx.db.get("comments", args.commentId);
    if (!comment || comment.orgId !== orgId || comment.documentId !== args.documentId) {
      throw new Error("Comment not found");
    }
    const emoji = cleanEmoji(args.emoji);
    const reactions = [...(comment.reactions ?? [])];
    const index = reactions.findIndex((reaction) => reaction.emoji === emoji);
    if (index === -1) {
      reactions.push({ emoji, userIds: [userId] });
    } else {
      const current = reactions[index]!;
      const userIds = current.userIds.includes(userId)
        ? current.userIds.filter((id) => id !== userId)
        : [...current.userIds, userId];
      if (userIds.length === 0) {
        reactions.splice(index, 1);
      } else {
        reactions[index] = { emoji, userIds };
      }
    }
    await ctx.db.patch("comments", comment._id, { reactions });
  },
});

export async function deleteCommentsForDocument(
  ctx: MutationCtx,
  orgId: string,
  documentId: Id<"documents">,
) {
  const rows = await documentComments(ctx, orgId, documentId);
  for (const row of rows) {
    await deleteCommentRecord(ctx, row._id);
  }
}

async function writeMentions(
  ctx: MutationCtx,
  comment: {
    _id: Id<"comments">;
    orgId: string;
    documentId: Id<"documents">;
    userId: string;
    createdAt: number;
    mentions: string[];
  },
) {
  const existing = await ctx.db
    .query("commentMentions")
    .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
    .collect();
  for (const row of existing) {
    await ctx.db.delete("commentMentions", row._id);
  }
  for (const mentioned of comment.mentions) {
    if (mentioned === comment.userId) continue;
    await ctx.db.insert("commentMentions", {
      orgId: comment.orgId,
      userId: mentioned,
      commentId: comment._id,
      documentId: comment.documentId,
      authorId: comment.userId,
      createdAt: comment.createdAt,
    });
  }
}

async function deleteCommentRecord(ctx: MutationCtx, commentId: Id<"comments">) {
  const mentions = await ctx.db
    .query("commentMentions")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const row of mentions) {
    await ctx.db.delete("commentMentions", row._id);
  }
  const reads = await ctx.db
    .query("mentionReads")
    .withIndex("by_comment", (q) => q.eq("commentId", commentId))
    .collect();
  for (const row of reads) {
    await ctx.db.delete("mentionReads", row._id);
  }
  await ctx.db.delete("comments", commentId);
}
