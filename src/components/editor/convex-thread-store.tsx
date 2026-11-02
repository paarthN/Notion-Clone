"use client";

import type { BlockNoteEditor, User } from "@blocknote/core";
import {
  ThreadStore,
  ThreadStoreAuth,
  type CommentBody,
  type CommentData,
  type ThreadData,
} from "@blocknote/core/comments";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { caretFromEditor } from "@/components/editor/remote-carets";

export type CommentAnchor = "page" | { blockId: string; from: number; to: number };
export type CommentRow = Doc<"comments">;

export type CommentMember = {
  userId: string;
  name: string;
  imageUrl: string | null;
};

type CommentCommands = {
  create: (args: {
    documentId: Id<"documents">;
    body: string;
    mentions: string[];
    anchor: CommentAnchor;
  }) => Promise<{ commentId: string; threadId: string }>;
  reply: (args: {
    documentId: Id<"documents">;
    threadId: string;
    body: string;
    mentions: string[];
  }) => Promise<{ commentId: string; threadId: string }>;
  update: (args: {
    documentId: Id<"documents">;
    commentId: Id<"comments">;
    body: string;
    mentions: string[];
  }) => Promise<unknown>;
  remove: (args: {
    documentId: Id<"documents">;
    commentId: Id<"comments">;
  }) => Promise<unknown>;
  resolve: (args: { documentId: Id<"documents">; threadId: string }) => Promise<unknown>;
  unresolve: (args: { documentId: Id<"documents">; threadId: string }) => Promise<unknown>;
  toggleReaction: (args: {
    documentId: Id<"documents">;
    commentId: Id<"comments">;
    emoji: string;
  }) => Promise<unknown>;
};

type InlineDraft = {
  mentions: string[];
  anchor: CommentAnchor;
};

class PotionThreadAuth extends ThreadStoreAuth {
  userId = "";
  canWrite = false;

  canCreateThread() {
    return this.canWrite;
  }

  canAddComment() {
    return this.canWrite;
  }

  canUpdateComment(comment: CommentData) {
    return this.canWrite && comment.userId === this.userId;
  }

  canDeleteComment(comment: CommentData) {
    return this.canWrite && comment.userId === this.userId;
  }

  canDeleteThread() {
    return this.canWrite;
  }

  canResolveThread() {
    return this.canWrite;
  }

  canUnresolveThread() {
    return this.canWrite;
  }

  canAddReaction(comment: CommentData, emoji?: string) {
    if (!this.canWrite || !emoji) return false;
    return !comment.reactions.some(
      (reaction) => reaction.emoji === emoji && reaction.userIds.includes(this.userId),
    );
  }

  canDeleteReaction(comment: CommentData, emoji?: string) {
    if (!this.canWrite || !emoji) return false;
    return comment.reactions.some(
      (reaction) => reaction.emoji === emoji && reaction.userIds.includes(this.userId),
    );
  }
}

export function bodyToText(body: CommentBody): string {
  if (typeof body === "string") return body.trim();
  if (!Array.isArray(body)) return "";
  return body
    .map((block) => blockToText(block))
    .join("\n")
    .trim();
}

export function textToBody(text: string): CommentBody {
  const lines = text.split("\n");
  return lines.map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line, styles: {} }] : [],
  }));
}

function blockToText(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const node = block as { content?: unknown; children?: unknown };
  const content = inlineToText(node.content);
  const children = Array.isArray(node.children)
    ? node.children.map((child) => blockToText(child)).filter(Boolean).join("\n")
    : "";
  return [content, children].filter((part) => part.length > 0).join("\n");
}

function inlineToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const node = item as { text?: unknown; content?: unknown };
      if (typeof node.text === "string") return node.text;
      return inlineToText(node.content);
    })
    .join("");
}

function mentioned(metadata: unknown, text: string, members: CommentMember[]) {
  const ids = (metadata as { mentions?: unknown } | undefined)?.mentions;
  if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
    return ids;
  }
  return mentionsIn(text, members);
}

function mentionsIn(text: string, members: CommentMember[]) {
  const ids: string[] = [];
  const ranked = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const member of ranked) {
    if (!member.name) continue;
    if (text.includes(`@${member.name}`) && !ids.includes(member.userId)) {
      ids.push(member.userId);
    }
  }
  return ids;
}

function toCommentData(row: CommentRow, root: boolean): CommentData {
  return {
    type: "comment",
    id: row._id,
    userId: row.userId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    reactions: (row.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      createdAt: new Date(row.createdAt),
      userIds: reaction.userIds,
    })),
    body: textToBody(row.body),
    metadata: { mentions: row.mentions, root },
  };
}

function threadsFromRows(rows: CommentRow[]) {
  const grouped = new Map<string, CommentRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.threadId) ?? [];
    list.push(row);
    grouped.set(row.threadId, list);
  }
  const threads = new Map<string, ThreadData>();
  for (const [threadId, list] of grouped) {
    list.sort((a, b) => a.createdAt - b.createdAt);
    const root = list.find((row) => row.replyTo === undefined) ?? list[0];
    if (!root) continue;
    threads.set(threadId, {
      type: "thread",
      id: threadId,
      createdAt: new Date(root.createdAt),
      updatedAt: new Date(Math.max(...list.map((row) => row.updatedAt))),
      comments: list.map((row) => toCommentData(row, row._id === root._id)),
      resolved: root.resolved,
      metadata: { anchor: root.anchor },
    });
  }
  return threads;
}

function rowSignature(rows: CommentRow[]) {
  return rows
    .map(
      (row) =>
        `${row._id}:${row.updatedAt}:${row.resolved}:${row.body}:${row.mentions.join(",")}:${JSON.stringify(row.reactions ?? [])}`,
    )
    .join("|");
}

export function anchorFromEditor(editor: BlockNoteEditor): CommentAnchor | null {
  const cursor = caretFromEditor(editor);
  if (!cursor) return null;
  if (
    cursor.anchorBlockId &&
    cursor.anchorOffset !== undefined &&
    cursor.anchorBlockId === cursor.blockId
  ) {
    return {
      blockId: cursor.blockId,
      from: Math.min(cursor.offset, cursor.anchorOffset),
      to: Math.max(cursor.offset, cursor.anchorOffset),
    };
  }
  return {
    blockId: cursor.anchorBlockId ?? cursor.blockId,
    from: cursor.anchorOffset ?? cursor.offset,
    to: cursor.anchorBlockId === cursor.blockId ? cursor.offset : (cursor.anchorOffset ?? cursor.offset),
  };
}

export class ConvexThreadStore extends ThreadStore {
  readonly documentId: Id<"documents">;
  readonly addThreadToDocument = undefined;
  private readonly potionAuth: PotionThreadAuth;
  private commands: CommentCommands | null = null;
  private members: CommentMember[] = [];
  private selfName = "";
  private selfImage: string | null = null;
  private editor: BlockNoteEditor | null = null;
  private inline: InlineDraft | null = null;
  private rows: CommentRow[] = [];
  private pending: CommentRow[] = [];
  private hidden = new Set<string>();
  private signature = "";
  loaded = false;
  private threads = new Map<string, ThreadData>();
  private listeners = new Set<(threads: Map<string, ThreadData>) => void>();
  private requestedUsers = new Set<string>();
  private userSink: { setUser: (user: User | User[]) => void } | null = null;

  constructor(documentId: Id<"documents">) {
    const auth = new PotionThreadAuth();
    super(auth);
    this.potionAuth = auth;
    this.documentId = documentId;
  }

  setEditor(editor: BlockNoteEditor | null) {
    this.editor = editor;
  }

  setAccess(access: { userId: string; canWrite: boolean; selfName: string; selfImage: string | null }) {
    this.potionAuth.userId = access.userId;
    this.potionAuth.canWrite = access.canWrite;
    this.selfName = access.selfName;
    this.selfImage = access.selfImage;
    this.publishUsers();
  }

  setMembers(members: CommentMember[]) {
    this.members = members;
    this.publishUsers();
  }

  setCommands(commands: CommentCommands) {
    this.commands = commands;
  }

  beginInline(draft: InlineDraft) {
    this.inline = draft;
  }

  replace(rows: CommentRow[]) {
    const visibleIds = new Set<string>(rows.map((row) => row._id));
    for (const id of this.hidden) {
      if (!visibleIds.has(id)) this.hidden.delete(id);
    }
    this.pending = this.pending.filter((row) => !visibleIds.has(row._id));
    this.rows = rows;
    this.loaded = true;
    this.rebuild();
  }

  resolveUsers(userIds: string[], sink?: { setUser: (user: User | User[]) => void }) {
    if (sink) this.userSink = sink;
    for (const id of userIds) this.requestedUsers.add(id);
    return Promise.resolve(this.usersFor(userIds));
  }

  getThread(threadId: string): ThreadData {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }
    return thread;
  }

  getThreads() {
    return this.threads;
  }

  subscribe(cb: (threads: Map<string, ThreadData>) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async createThread(options: {
    initialComment: { body: CommentBody; metadata?: unknown };
    metadata?: unknown;
  }): Promise<ThreadData> {
    const commands = this.requireCommands();
    const text = bodyToText(options.initialComment.body);
    const draft = this.inline;
    this.inline = null;
    const anchor = draft?.anchor ?? (this.editor ? anchorFromEditor(this.editor) : null);
    if (!anchor || anchor === "page" || !anchor.blockId) {
      throw new Error("Select some text to comment");
    }
    const mentions = draft?.mentions ?? mentionsIn(text, this.members);
    const created = await commands.create({
      documentId: this.documentId,
      body: text,
      mentions,
      anchor,
    });
    const row = this.localRow({
      id: created.commentId,
      threadId: created.threadId,
      body: text,
      mentions,
      anchor,
      replyTo: undefined,
    });
    this.pending.push(row);
    this.rebuild();
    return this.getThread(created.threadId);
  }

  async addComment(options: {
    comment: { body: CommentBody; metadata?: unknown };
    threadId: string;
  }): Promise<CommentData> {
    const commands = this.requireCommands();
    const text = bodyToText(options.comment.body);
    const mentions = mentioned(options.comment.metadata, text, this.members);
    const created = await commands.reply({
      documentId: this.documentId,
      threadId: options.threadId,
      body: text,
      mentions,
    });
    const thread = this.threads.get(options.threadId);
    const anchor =
      thread && isAnchor(thread.metadata?.anchor) ? thread.metadata.anchor : "page";
    const row = this.localRow({
      id: created.commentId,
      threadId: created.threadId,
      body: text,
      mentions,
      anchor,
      replyTo: thread?.comments.find((comment) => commentIsRoot(comment))?.id,
    });
    this.pending.push(row);
    this.rebuild();
    const next = this.getThread(created.threadId);
    const comment = next.comments.find((item) => item.id === created.commentId);
    if (!comment) throw new Error("Comment not found");
    return comment;
  }

  async updateComment(options: {
    comment: { body: CommentBody; metadata?: unknown };
    threadId: string;
    commentId: string;
  }) {
    const commands = this.requireCommands();
    const text = bodyToText(options.comment.body);
    const mentions = mentioned(options.comment.metadata, text, this.members);
    await commands.update({
      documentId: this.documentId,
      commentId: options.commentId as Id<"comments">,
      body: text,
      mentions,
    });
  }

  async deleteComment(options: { threadId: string; commentId: string }) {
    const commands = this.requireCommands();
    const thread = this.threads.get(options.threadId);
    const rootId = thread?.comments.find((comment) => commentIsRoot(comment))?.id;
    await commands.remove({
      documentId: this.documentId,
      commentId: options.commentId as Id<"comments">,
    });
    if (rootId === options.commentId) {
      for (const comment of thread?.comments ?? []) this.hidden.add(comment.id);
    } else {
      this.hidden.add(options.commentId);
    }
    this.pending = this.pending.filter((row) => !this.hidden.has(row._id));
    this.rebuild();
  }

  async deleteThread(options: { threadId: string }) {
    const thread = this.threads.get(options.threadId);
    const rootId = thread?.comments.find((comment) => commentIsRoot(comment))?.id;
    if (!rootId) return;
    await this.deleteComment({ threadId: options.threadId, commentId: rootId });
  }

  async resolveThread(options: { threadId: string }) {
    await this.requireCommands().resolve({
      documentId: this.documentId,
      threadId: options.threadId,
    });
    this.patchResolved(options.threadId, true);
  }

  async unresolveThread(options: { threadId: string }) {
    await this.requireCommands().unresolve({
      documentId: this.documentId,
      threadId: options.threadId,
    });
    this.patchResolved(options.threadId, false);
  }

  async addReaction(options: { threadId: string; commentId: string; emoji: string }) {
    await this.toggle(options.commentId, options.emoji);
  }

  async deleteReaction(options: { threadId: string; commentId: string; emoji: string }) {
    await this.toggle(options.commentId, options.emoji);
  }

  private async toggle(commentId: string, emoji: string) {
    await this.requireCommands().toggleReaction({
      documentId: this.documentId,
      commentId: commentId as Id<"comments">,
      emoji,
    });
  }

  private requireCommands() {
    if (!this.commands) throw new Error("Comments are still loading");
    return this.commands;
  }

  private localRow(input: {
    id: string;
    threadId: string;
    body: string;
    mentions: string[];
    anchor: CommentAnchor;
    replyTo: string | undefined;
  }): CommentRow {
    const now = Date.now();
    return {
      _id: input.id as Id<"comments">,
      _creationTime: now,
      orgId: "",
      documentId: this.documentId,
      userId: this.potionAuth.userId,
      body: input.body,
      createdAt: now,
      updatedAt: now,
      threadId: input.threadId,
      replyTo: input.replyTo as Id<"comments"> | undefined,
      resolved: false,
      anchor: input.anchor,
      mentions: input.mentions,
      reactions: [],
    };
  }

  private patchResolved(threadId: string, resolved: boolean) {
    this.rows = this.rows.map((row) =>
      row.threadId === threadId && row.replyTo === undefined ? { ...row, resolved } : row,
    );
    this.pending = this.pending.map((row) =>
      row.threadId === threadId && row.replyTo === undefined ? { ...row, resolved } : row,
    );
    this.rebuild();
  }

  private visibleRows() {
    const hidden = this.hidden;
    return [...this.rows, ...this.pending].filter((row) => !hidden.has(row._id));
  }

  private rebuild() {
    const rows = this.visibleRows();
    const signature = rowSignature(rows);
    if (signature === this.signature) return;
    this.signature = signature;
    this.threads = threadsFromRows(rows);
    for (const listener of this.listeners) listener(this.threads);
  }

  private usersFor(userIds: string[]): User[] {
    return userIds.map((id) => {
      const member = this.members.find((item) => item.userId === id);
      const self = id === this.potionAuth.userId;
      return {
        id,
        username: member?.name || (self ? this.selfName : "") || "Member",
        avatarUrl: member?.imageUrl || (self ? this.selfImage : "") || "",
      };
    });
  }

  private publishUsers() {
    if (!this.userSink || this.requestedUsers.size === 0) return;
    this.userSink.setUser(this.usersFor([...this.requestedUsers]));
  }
}

function commentIsRoot(comment: CommentData) {
  return Boolean((comment.metadata as { root?: boolean } | undefined)?.root);
}

function isAnchor(value: unknown): value is CommentAnchor {
  if (value === "page") return true;
  if (!value || typeof value !== "object") return false;
  const anchor = value as { blockId?: unknown };
  return typeof anchor.blockId === "string";
}

function mapMembers(
  data:
    | Array<{
        publicUserData?: {
          userId?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          identifier?: string | null;
          imageUrl?: string | null;
        } | null;
      }>
    | null
    | undefined,
): CommentMember[] {
  return (data ?? []).flatMap((membership) => {
    const person = membership.publicUserData;
    const userId = person?.userId;
    if (!person || !userId) return [];
    const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
    return [
      {
        userId,
        name: name || person.identifier || "Member",
        imageUrl: person.imageUrl ?? null,
      },
    ];
  });
}

export function useWorkspaceMembers() {
  const { memberships } = useOrganization({ memberships: { infinite: true } });
  useEffect(() => {
    if (!memberships?.hasNextPage || memberships.isFetching) return;
    void memberships.fetchNext();
  }, [memberships]);
  return useMemo(() => mapMembers(memberships?.data), [memberships?.data]);
}

export function useConvexThreadStore(documentId: Id<"documents">, canWrite: boolean) {
  const session = useQuery(api.documents.session);
  const rows = useQuery(api.comments.list, { documentId });
  const create = useMutation(api.comments.create);
  const reply = useMutation(api.comments.reply);
  const update = useMutation(api.comments.update);
  const remove = useMutation(api.comments.remove);
  const resolve = useMutation(api.comments.resolve);
  const unresolve = useMutation(api.comments.unresolve);
  const toggleReaction = useMutation(api.comments.toggleReaction);
  const { user } = useUser();
  const members = useWorkspaceMembers();
  const storeRef = useRef<ConvexThreadStore | null>(null);
  if (!storeRef.current || storeRef.current.documentId !== documentId) {
    storeRef.current = new ConvexThreadStore(documentId);
  }
  const store = storeRef.current;

  store.setAccess({
    userId: session?.userId ?? user?.id ?? "",
    canWrite,
    selfName: user?.fullName || user?.username || "",
    selfImage: user?.imageUrl ?? null,
  });
  store.setMembers(members);
  store.setCommands({
    create,
    reply,
    update,
    remove,
    resolve,
    unresolve,
    toggleReaction,
  });

  useEffect(() => {
    if (rows) store.replace(rows);
  }, [rows, store]);

  return store;
}

export function useCommentThreads(store: ConvexThreadStore) {
  return useSyncExternalStore(
    (callback) => store.subscribe(() => callback()),
    () => store.getThreads(),
    () => store.getThreads(),
  );
}

export const REACTION = "👍";
