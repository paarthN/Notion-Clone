import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireOrg, type OrgContext } from "./org";

export type AccessLevel = "full" | "edit" | "view";

const RANK: Record<AccessLevel, number> = { view: 0, edit: 1, full: 2 };

type DbCtx = QueryCtx | MutationCtx;

export async function resolveLevel(
  ctx: DbCtx,
  doc: Doc<"documents">,
  actor: OrgContext,
): Promise<AccessLevel> {
  if (actor.role === "admin") {
    return "full";
  }

  const row = await ctx.db
    .query("access")
    .withIndex("by_document_user", (q) =>
      q.eq("documentId", doc._id).eq("userId", actor.userId),
    )
    .unique();
  if (row && row.orgId === actor.orgId) {
    return row.level;
  }
  if (doc.createdBy === actor.userId) {
    return "full";
  }
  return doc.generalAccess ?? "edit";
}

export async function requireAccess(
  ctx: DbCtx,
  id: Id<"documents">,
  need: AccessLevel,
) {
  const actor = await requireOrg(ctx);
  const doc = await ctx.db.get("documents", id);
  if (!doc || doc.orgId !== actor.orgId) {
    throw new Error("Page not found");
  }
  const level = await resolveLevel(ctx, doc, actor);
  if (RANK[level] < RANK[need]) {
    throw new Error("You don't have access to do that");
  }
  return { ...actor, doc, level };
}

export async function assertFullHolderRemains(
  ctx: MutationCtx,
  doc: Doc<"documents">,
  actor: OrgContext,
) {
  const rows = await ctx.db
    .query("access")
    .withIndex("by_document", (q) => q.eq("documentId", doc._id))
    .collect();
  const holders = new Set<string>();
  const covered = new Set<string>();
  for (const row of rows) {
    if (row.orgId !== doc.orgId) {
      continue;
    }
    covered.add(row.userId);
    if (row.level === "full") {
      holders.add(row.userId);
    }
  }
  if (!covered.has(doc.createdBy)) {
    holders.add(doc.createdBy);
  }
  if (actor.role === "admin") {
    holders.add(actor.userId);
  }
  if (holders.size === 0) {
    throw new Error("The last person with full access can't be removed");
  }
}
