import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { Step, Transform } from "@tiptap/pm/transform";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAccess } from "./lib/access";
import { pagePmSchema } from "./lib/pmSchema";
import { plainTextFromSnapshot } from "./lib/plaintext";
import { documentSearchText } from "./lib/searchText";

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
  onSnapshot: async (ctx, id, snapshot, _version) => {
    const documentId = id as Id<"documents">;
    const doc = await ctx.db.get("documents", documentId);
    if (doc) {
      const plainText = plainTextFromSnapshot(snapshot);
      await ctx.db.patch("documents", doc._id, {
        updatedAt: Date.now(),
        plainText,
        searchText: documentSearchText(doc.title, plainText),
      });
    }
    await keepLatestSnapshots(ctx, documentId);
  },
  pruneSnapshots: false,
});

export const publicPage = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token || token.length > 128) {
      return null;
    }
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_share_token", (q) => q.eq("shareToken", token))
      .unique();
    if (!doc || doc.isArchived) {
      return null;
    }
    const snapshot = await ctx.runQuery(components.prosemirrorSync.lib.getSnapshot, {
      id: doc._id,
    });
    return {
      title: doc.title,
      icon: doc.icon,
      coverUrl: doc.coverUrl,
      snapshot: snapshot.content
        ? await replaySteps(ctx, doc._id, snapshot.content, snapshot.version)
        : null,
    };
  },
});

async function replaySteps(
  ctx: QueryCtx,
  id: string,
  content: string,
  version: number,
) {
  try {
    const steps = await ctx.runQuery(components.prosemirrorSync.lib.getSteps, {
      id,
      version,
    });
    if (steps.steps.length === 0) {
      return content;
    }
    const schema = pagePmSchema();
    const transform = new Transform(schema.nodeFromJSON(JSON.parse(content)));
    for (const step of steps.steps) {
      transform.step(Step.fromJSON(schema, JSON.parse(step)));
    }
    return JSON.stringify(transform.doc.toJSON());
  } catch {
    return content;
  }
}

export const listVersions = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireAccess(ctx, args.id, "view");
    return await ctx.runQuery(components.prosemirrorSync.lib.listSnapshots, {
      id: args.id,
    });
  },
});

export const versionChange = query({
  args: { id: v.id("documents"), version: v.number() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, args.id, "view");
    const versions = await ctx.runQuery(components.prosemirrorSync.lib.listSnapshots, {
      id: args.id,
    });
    const index = versions.findIndex((row) => row.version === args.version);
    if (index < 0) return null;
    const selected = await ctx.runQuery(components.prosemirrorSync.lib.getSnapshot, {
      id: args.id,
      version: args.version,
    });
    if (!selected.content || selected.version !== args.version) return null;

    if (index === 0) {
      const current = await replaySteps(ctx, args.id, selected.content, selected.version);
      return changedLines(linesFromSnapshot(selected.content), linesFromSnapshot(current));
    }

    const older = versions[index + 1];
    let before: string[] = [];
    if (older) {
      const previous = await ctx.runQuery(components.prosemirrorSync.lib.getSnapshot, {
        id: args.id,
        version: older.version,
      });
      if (previous.content && previous.version === older.version) {
        before = linesFromSnapshot(previous.content);
      }
    }
    return changedLines(before, linesFromSnapshot(selected.content));
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

    const plainText = plainTextFromSnapshot(JSON.stringify(doc.toJSON()));
    const page = await ctx.db.get("documents", args.id);
    await ctx.db.patch("documents", args.id, {
      updatedAt: Date.now(),
      plainText,
      ...(page ? { searchText: documentSearchText(page.title, plainText) } : {}),
    });
  },
});

const KEPT_SNAPSHOTS = 20;
const CHANGE_CAP = 4;

async function keepLatestSnapshots(ctx: MutationCtx, id: string) {
  const saved = await ctx.runQuery(components.prosemirrorSync.lib.listSnapshots, { id });
  if (saved.length < KEPT_SNAPSHOTS) return;
  const oldestKept = saved[KEPT_SNAPSHOTS - 1];
  if (!oldestKept) return;
  await ctx.runMutation(components.prosemirrorSync.lib.deleteSnapshots, {
    id,
    beforeVersion: oldestKept.version,
  });
}

function changedLines(before: string[], after: string[]) {
  const counts = new Map<string, number>();
  for (const line of before) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const added: string[] = [];
  for (const line of after) {
    const left = counts.get(line) ?? 0;
    if (left > 0) counts.set(line, left - 1);
    else added.push(line);
  }
  const removed: string[] = [];
  for (const line of before) {
    const left = counts.get(line) ?? 0;
    if (left > 0) {
      removed.push(line);
      counts.set(line, left - 1);
    }
  }
  return {
    added: added.slice(0, CHANGE_CAP).map(clipLine),
    removed: removed.slice(0, CHANGE_CAP).map(clipLine),
  };
}

function clipLine(line: string) {
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function linesFromSnapshot(snapshot: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return [];
  }
  const content = (parsed as { content?: unknown }).content;
  const blocks = Array.isArray(content) ? content : [parsed];
  const lines: string[] = [];
  for (const block of blocks) {
    for (const line of blockText(block).split("\n")) {
      const clean = line.replace(/\s+/g, " ").trim();
      if (clean) lines.push(clean);
    }
  }
  return lines;
}

function blockText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return node.map(blockText).join("");
  const record = node as { type?: unknown; text?: unknown; content?: unknown };
  if (typeof record.text === "string") return record.text;
  if (record.type === "hardBreak") return "\n";
  if (record.content === undefined) return "";
  return blockText(record.content);
}

