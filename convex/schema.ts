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
    kind: v.optional(v.union(v.literal("page"), v.literal("folder"))),
    plainText: v.optional(v.string()),
    generalAccess: v.optional(v.union(v.literal("edit"), v.literal("view"))),
  })
    .index("by_org", ["orgId"])
    .index("by_org_parent", ["orgId", "parentId"])
    .index("by_org_archived", ["orgId", "isArchived"]),

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
  }).index("by_document", ["documentId"]),

  access: defineTable({
    orgId: v.string(),
    documentId: v.id("documents"),
    userId: v.string(),
    level: v.union(v.literal("full"), v.literal("edit"), v.literal("view")),
  })
    .index("by_document", ["documentId"])
    .index("by_document_user", ["documentId", "userId"]),
});
