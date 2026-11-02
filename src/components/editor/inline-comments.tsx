"use client";

import {
  getBlockInfoFromNode,
  getNodeById,
  type BlockNoteEditor,
} from "@blocknote/core";
import type { ThreadData } from "@blocknote/core/comments";
import { useBlockNoteEditor } from "@blocknote/react";
import { useQuery } from "convex/react";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { threadIdFromMark } from "@/components/editor/comment-style";
import {
  REACTION,
  anchorFromEditor,
  bodyToText,
  textToBody,
  useCommentThreads,
  useWorkspaceMembers,
  type CommentAnchor,
  type ConvexThreadStore,
} from "@/components/editor/convex-thread-store";
import { CommentComposer, CommentMargin, type MarginThread } from "@/components/editor/page-comments";
import { api } from "../../../convex/_generated/api";

const commentUiKey = new PluginKey("potion-inline-comments");

type UiState = {
  threads: Map<string, ThreadData>;
  selectedId: string | null;
  select: (threadId: string | null) => void;
};

export function InlineComments({
  store,
  canWrite,
}: {
  store: ConvexThreadStore;
  canWrite: boolean;
}) {
  const editor = useBlockNoteEditor();
  const threads = useCommentThreads(store);
  const members = useWorkspaceMembers();
  const session = useQuery(api.documents.session);
  const userId = session?.userId ?? "";
  const uiRef = useRef<UiState>({
    threads,
    selectedId: null,
    select: () => {},
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    from: number;
    to: number;
    anchor: Exclude<CommentAnchor, "page">;
    top: number;
    left: number;
  } | null>(null);
  const [selectionLive, setSelectionLive] = useState(false);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);

  uiRef.current.threads = threads;
  uiRef.current.selectedId = selectedId;
  uiRef.current.select = (threadId) => {
    setDraft(null);
    setSelectedId(threadId);
  };

  useEffect(() => {
    store.setEditor(editor);
  }, [editor, store]);

  useEffect(() => {
    try {
      editor._tiptapEditor.registerPlugin(commentPlugin(uiRef));
    } catch {
      return;
    }
    return () => {
      try {
        editor._tiptapEditor.unregisterPlugin(commentUiKey);
      } catch {
        // The editor is already gone.
      }
    };
  }, [editor]);

  useEffect(() => {
    refreshCommentDecorations(editor);
  }, [editor, threads, selectedId]);

  const rows = useQuery(api.comments.list, { documentId: store.documentId });

  useEffect(() => {
    if (rows === undefined) return;
    const known = new Set<string>(rows.map((row) => row.threadId));
    for (const threadId of threads.keys()) known.add(threadId);
    removeUnknownCommentMarks(editor, known);
  }, [editor, rows, threads]);

  useEffect(() => {
    return editor.onSelectionChange(() => {
      let empty = true;
      try {
        empty = editor.prosemirrorState.selection.empty;
      } catch {
        empty = true;
      }
      setSelectionLive(!empty);
    });
  }, [editor]);

  useEffect(() => {
    if (!canWrite) {
      setToolbarHost(null);
      return;
    }
    const find = () => document.querySelector<HTMLElement>(".bn-formatting-toolbar");
    const sync = () => {
      const next = find();
      setToolbarHost((current) => (current === next ? current : next));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [canWrite]);

  const marginThreads = marginThreadsFrom(threads, userId);

  const openComposer = () => {
    let view: EditorView;
    try {
      view = editor.prosemirrorView;
    } catch {
      return;
    }
    const selection = view.state.selection;
    if (selection.empty) return;
    const anchor = anchorFromEditor(editor);
    if (!anchor || anchor === "page") {
      toast.error("Select some text to comment");
      return;
    }
    const coords = view.coordsAtPos(selection.to);
    setSelectedId(null);
    setDraft({
      from: selection.from,
      to: selection.to,
      anchor,
      top: coords.bottom + 8,
      left: coords.left,
    });
  };

  return (
    <>
      {canWrite && toolbarHost && selectionLive
        ? createPortal(
            <button
              type="button"
              className="ml-1 inline-flex h-7 items-center rounded-md px-2 text-[14px] text-[#2c2c2b] hover:bg-black/5 dark:text-[#f0efed] dark:hover:bg-white/10"
              onMouseDown={(event) => {
                event.preventDefault();
                openComposer();
              }}
            >
              Comment
            </button>,
            toolbarHost,
          )
        : null}
      {draft ? (
        <ThreadPopover top={draft.top} left={draft.left} onClose={() => setDraft(null)}>
          <CommentComposer
            placeholder="Add a comment…"
            members={members}
            submitLabel="Comment"
            autoFocus
            onCancel={() => setDraft(null)}
            onSubmit={async (body, mentions) => {
              store.beginInline({ mentions, anchor: draft.anchor });
              const thread = await store.createThread({
                initialComment: { body: textToBody(body) },
              });
              applyCommentMark(editor, draft.from, draft.to, thread.id);
              setDraft(null);
              setSelectedId(thread.id);
            }}
          />
        </ThreadPopover>
      ) : null}
      <CommentMargin
        threads={marginThreads}
        canWrite={canWrite}
        userId={userId}
        activeId={selectedId}
        onActivate={setSelectedId}
        onReply={async (threadId, body, mentions) => {
          await store.addComment({
            threadId,
            comment: { body: textToBody(body), metadata: { mentions } },
          });
        }}
        onEdit={async (threadId, commentId, body, mentions) => {
          await store.updateComment({
            threadId,
            commentId,
            comment: { body: textToBody(body), metadata: { mentions } },
          });
        }}
        onDelete={async (threadId, commentId, isRoot) => {
          await store.deleteComment({ threadId, commentId });
          if (isRoot) {
            removeCommentMarks(editor, threadId);
            setSelectedId((current) => (current === threadId ? null : current));
          }
        }}
        onResolve={async (threadId) => {
          await store.resolveThread({ threadId });
          setSelectedId((current) => (current === threadId ? null : current));
        }}
        onReact={async (threadId, commentId) => {
          await store.addReaction({ threadId, commentId, emoji: REACTION });
        }}
      />
    </>
  );
}

function marginThreadsFrom(threads: Map<string, ThreadData>, userId: string) {
  const models: MarginThread[] = [];
  for (const thread of threads.values()) {
    if (thread.resolved) continue;
    const anchor = thread.metadata?.anchor === "page" ? "page" : "text";
    const comments = thread.comments.flatMap((comment) => {
      if (!comment.body) return [];
      const reaction = comment.reactions.find((item) => item.emoji === REACTION);
      return [
        {
          id: comment.id,
          userId: comment.userId,
          body: bodyToText(comment.body),
          createdAt: comment.createdAt.getTime(),
          updatedAt: comment.updatedAt.getTime(),
          isRoot: Boolean((comment.metadata as { root?: boolean } | undefined)?.root),
          reactionCount: reaction?.userIds.length ?? 0,
          reacted: reaction?.userIds.includes(userId) ?? false,
        },
      ];
    });
    if (comments.length === 0) continue;
    models.push({ id: thread.id, anchor, comments });
  }
  return models;
}

function ThreadPopover({
  top,
  left,
  onClose,
  children,
}: {
  top: number;
  left: number;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed z-40 w-80 rounded-md border border-[#e6e5e3] bg-white p-2 dark:border-[#383836] dark:bg-[#202020]"
      style={{ top, left: Math.max(8, Math.min(left, window.innerWidth - 336)) }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

function commentPlugin(uiRef: { current: UiState }) {
  return new Plugin({
    key: commentUiKey,
    props: {
      decorations(state) {
        return commentDecorations(state.doc, uiRef.current);
      },
      handleClick(view, pos, event) {
        if (event.button !== 0) return false;
        const threadId = threadIdAt(view.state.doc, pos, uiRef.current.threads);
        if (!threadId) {
          if (uiRef.current.selectedId) uiRef.current.select(null);
          return false;
        }
        if (threadId === uiRef.current.selectedId) return false;
        uiRef.current.select(threadId);
        return true;
      },
    },
  });
}

function commentDecorations(doc: Node, ui: UiState) {
  const decorations: Decoration[] = [];
  const marked = new Set<string>();
  doc.descendants((node, pos) => {
    const mark = commentMark(node);
    if (!mark) return;
    const parsed = threadIdFromMark(String(mark.attrs.stringValue ?? ""));
    if (!parsed) return;
    marked.add(parsed.threadId);
    const thread = ui.threads.get(parsed.threadId);
    if (!thread || thread.resolved || thread.deletedAt) return;
    decorations.push(commentDecoration(pos, pos + node.nodeSize, parsed.threadId, ui.selectedId === parsed.threadId));
  });
  for (const thread of ui.threads.values()) {
    if (thread.resolved || thread.deletedAt || marked.has(thread.id)) continue;
    const anchor = thread.metadata?.anchor as CommentAnchor | undefined;
    if (!anchor || anchor === "page") continue;
    const range = rangeInBlock(doc, anchor);
    if (!range) continue;
    decorations.push(commentDecoration(range.from, range.to, thread.id, ui.selectedId === thread.id));
  }
  if (decorations.length === 0) return DecorationSet.empty;
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  try {
    return DecorationSet.create(doc, decorations);
  } catch {
    return DecorationSet.empty;
  }
}

function threadIdAt(doc: Node, pos: number, threads: Map<string, ThreadData>) {
  const direct = doc.nodeAt(pos);
  const marks = direct?.marks ?? doc.resolve(Math.max(1, Math.min(pos, doc.content.size))).marks();
  const mark = marks.find((item) => item.type.name === "comment");
  const parsed = threadIdFromMark(mark ? String(mark.attrs.stringValue ?? "") : undefined);
  if (!parsed) return anchorThreadAt(doc, pos, threads);
  const thread = threads.get(parsed.threadId);
  if (!thread || thread.resolved || thread.deletedAt) return null;
  return parsed.threadId;
}

function anchorThreadAt(doc: Node, pos: number, threads: Map<string, ThreadData>) {
  for (const thread of threads.values()) {
    if (thread.resolved || thread.deletedAt) continue;
    const anchor = thread.metadata?.anchor as CommentAnchor | undefined;
    if (!anchor || anchor === "page") continue;
    const range = rangeInBlock(doc, anchor);
    if (range && pos >= range.from && pos <= range.to) return thread.id;
  }
  return null;
}

function rangeInBlock(doc: Node, anchor: { blockId: string; from: number; to: number }) {
  const found = getNodeById(anchor.blockId, doc);
  if (!found) return null;
  try {
    const info = getBlockInfoFromNode(found.node, found.posBeforeNode);
    if (!info.hasContent) return null;
    const span = Math.max(0, info.contentEnd - info.contentStart);
    const start = info.contentStart + Math.max(0, Math.min(anchor.from, span));
    const end = info.contentStart + Math.max(0, Math.min(anchor.to, span));
    if (end <= start) return null;
    return { from: start, to: end };
  } catch {
    return null;
  }
}

function commentDecoration(from: number, to: number, threadId: string, selected: boolean) {
  return Decoration.inline(from, to, {
    class: selected ? "potion-comment-mark potion-comment-mark-selected" : "potion-comment-mark",
    "data-comment-thread": threadId,
  });
}

function commentMark(node: Node) {
  return node.marks.find((mark) => mark.type.name === "comment");
}

function refreshCommentDecorations(editor: BlockNoteEditor) {
  let view: EditorView;
  try {
    view = editor.prosemirrorView;
  } catch {
    return;
  }
  if (!view?.dispatch) return;
  view.dispatch(view.state.tr.setMeta(commentUiKey, true).setMeta("addToHistory", false));
}

function applyCommentMark(editor: BlockNoteEditor, from: number, to: number, threadId: string) {
  let view: EditorView;
  try {
    view = editor.prosemirrorView;
  } catch {
    return;
  }
  const markType = view.state.schema.marks.comment;
  if (!markType) return;
  const max = view.state.doc.content.size;
  const start = Math.max(0, Math.min(from, max));
  const end = Math.max(start, Math.min(to, max));
  if (end <= start) return;
  view.dispatch(view.state.tr.addMark(start, end, markType.create({ stringValue: threadId })));
}

function removeCommentMarks(editor: BlockNoteEditor, threadId: string) {
  let view: EditorView;
  try {
    view = editor.prosemirrorView;
  } catch {
    return;
  }
  const markType = view.state.schema.marks.comment;
  if (!markType) return;
  let tr = view.state.tr;
  let changed = false;
  view.state.doc.descendants((node, pos) => {
    const mark = commentMark(node);
    if (!mark) return;
    const parsed = threadIdFromMark(String(mark.attrs.stringValue ?? ""));
    if (!parsed || parsed.threadId !== threadId) return;
    tr = tr.removeMark(pos, pos + node.nodeSize, markType);
    changed = true;
  });
  if (changed) view.dispatch(tr);
}

function removeUnknownCommentMarks(editor: BlockNoteEditor, known: Set<string>) {
  let view: EditorView;
  try {
    view = editor.prosemirrorView;
  } catch {
    return;
  }
  const markType = view.state.schema.marks.comment;
  if (!markType) return;
  let tr = view.state.tr;
  let changed = false;
  view.state.doc.descendants((node, pos) => {
    const mark = commentMark(node);
    if (!mark) return;
    const parsed = threadIdFromMark(String(mark.attrs.stringValue ?? ""));
    if (!parsed || known.has(parsed.threadId)) return;
    tr = tr.removeMark(pos, pos + node.nodeSize, markType);
    changed = true;
  });
  if (changed) view.dispatch(tr);
}

