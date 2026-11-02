import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    orgId: v.string(),
    parentId: v.union(v.id("documents"), v.null()),
    title: v.string(),
    icon: v.union(v.string(), v.null()),
    coverUrl: v.union(v.string(), v.null()),
    isArchived: v.boolean(),
    position: v.number(),
    createdBy: v.string(),
    updatedAt: v.number(),
    kind: v.optional(
      v.union(v.literal("page"), v.literal("folder"), v.literal("database")),
    ),
    plainText: v.optional(v.string()),
    shareToken: v.optional(v.string()),
    generalAccess: v.optional(
      v.union(v.literal("edit"), v.literal("view"), v.literal("none")),
    ),
    accessBeforePrivate: v.optional(v.union(v.literal("edit"), v.literal("view"))),
    status: v.optional(
      v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("done")),
    ),
    dueAt: v.optional(v.number()),
    personId: v.optional(v.string()),
    view: v.optional(v.union(v.literal("table"), v.literal("board"))),
  })
    .index("by_org", ["orgId"])
    .index("by_org_parent", ["orgId", "parentId"])
    .index("by_org_archived", ["orgId", "isArchived"])
    .index("by_share_token", ["shareToken"]),

  favorites: defineTable({
    orgId: v.string(),
    userId: v.string(),
    documentId: v.id("documents"),
  })
    .index("by_org_user", ["orgId", "userId"])
    .index("by_document", ["documentId"]),

  presence: defineTable({
    orgId: v.string(),
    documentId: v.id("documents"),
    userId: v.string(),
    name: v.string(),
    imageUrl: v.union(v.string(), v.null()),
    updatedAt: v.number(),
    blockId: v.optional(v.string()),
    offset: v.optional(v.number()),
    anchorBlockId: v.optional(v.string()),
    anchorOffset: v.optional(v.number()),
  }).index("by_document", ["documentId"]),

  access: defineTable({
    orgId: v.string(),
    documentId: v.id("documents"),
    userId: v.string(),
    level: v.union(v.literal("full"), v.literal("edit"), v.literal("view")),
  })
    .index("by_document", ["documentId"])
    .index("by_document_user", ["documentId", "userId"]),

  comments: defineTable({
    orgId: v.string(),
    documentId: v.id("documents"),
    userId: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    threadId: v.string(),
    replyTo: v.optional(v.id("comments")),
    resolved: v.boolean(),
    anchor: v.union(
      v.literal("page"),
      v.object({
        blockId: v.string(),
        from: v.number(),
        to: v.number(),
      }),
    ),
    mentions: v.array(v.string()),
    reactions: v.optional(
      v.array(
        v.object({
          emoji: v.string(),
          userIds: v.array(v.string()),
        }),
      ),
    ),
  })
    .index("by_document", ["orgId", "documentId"])
    .index("by_org", ["orgId"]),
});
