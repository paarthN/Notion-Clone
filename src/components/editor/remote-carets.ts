"use client";

import {
  getBlockInfoFromNode,
  getBlockInfoNearPos,
  getNodeById,
  type BlockNoteEditor,
} from "@blocknote/core";
import { useMutation, useQuery } from "convex/react";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { useEffect } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const CURSOR_THROTTLE_MS = 180;

const COLORS = [
  "#e5484d",
  "#d9730d",
  "#0f7b6c",
  "#337ea9",
  "#6940a5",
  "#c14c8a",
  "#448361",
  "#b42318",
];

export type CursorPayload = {
  blockId: string;
  offset: number;
  anchorBlockId?: string;
  anchorOffset?: number;
};

type RemoteCaret = CursorPayload & {
  userId: string;
  name: string;
};

const remoteCaretKey = new PluginKey<RemoteCaret[]>("remote-carets");

export function caretColor(userId: string) {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return COLORS[(hash >>> 0) % COLORS.length] ?? COLORS[0];
}

function remoteCaretPlugin() {
  return new Plugin<RemoteCaret[]>({
    key: remoteCaretKey,
    state: {
      init: () => [],
      apply(tr, value) {
        const meta: unknown = tr.getMeta(remoteCaretKey);
        return Array.isArray(meta) ? (meta as RemoteCaret[]) : value;
      },
    },
    props: {
      decorations(state) {
        const carets = remoteCaretKey.getState(state) ?? [];
        if (carets.length === 0) return DecorationSet.empty;
        const decorations: Decoration[] = [];
        for (const caret of carets) {
          const head = resolvePoint(state.doc, caret.blockId, caret.offset);
          if (head === null) continue;
          const color = caretColor(caret.userId);
          if (caret.anchorBlockId !== undefined && caret.anchorOffset !== undefined) {
            const anchor = resolvePoint(state.doc, caret.anchorBlockId, caret.anchorOffset);
            if (anchor !== null && anchor !== head) {
              decorations.push(...selectionDecorations(state.doc, anchor, head, color));
            }
          }
          decorations.push(
            Decoration.widget(head, () => caretElement(caret.name, color), {
              side: -1,
              ignoreSelection: true,
              key: caret.userId,
              stopEvent: () => true,
            }),
          );
        }
        if (decorations.length === 0) return DecorationSet.empty;
        decorations.sort((a, b) => a.from - b.from || a.to - b.to);
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

function caretElement(name: string, color: string) {
  const wrap = document.createElement("span");
  wrap.className = "remote-caret";
  wrap.contentEditable = "false";
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.setProperty("--remote-caret", color);
  const flag = document.createElement("span");
  flag.className = "remote-caret-flag";
  flag.textContent = displayName(name);
  wrap.appendChild(flag);
  return wrap;
}

function displayName(name: string) {
  const trimmed = name.trim();
  return trimmed || "Member";
}

function selectionDecorations(doc: Node, anchor: number, head: number, color: string) {
  const max = doc.content.size;
  const start = Math.max(0, Math.min(Math.min(anchor, head), max));
  const end = Math.max(0, Math.min(Math.max(anchor, head), max));
  if (start >= end) return [];
  const marks: Decoration[] = [];
  doc.nodesBetween(start, end, (node, pos) => {
    if (!node.isTextblock) return true;
    const from = Math.max(start, pos + 1);
    const to = Math.min(end, pos + node.nodeSize - 1);
    if (from < to) {
      marks.push(
        Decoration.inline(from, to, {
          class: "remote-caret-selection",
          style: `background-color: ${color}33`,
        }),
      );
    }
    return false;
  });
  return marks;
}

function resolvePoint(doc: Node, blockId: string, offset: number) {
  const found = getNodeById(blockId, doc);
  if (!found) return null;
  try {
    const info = getBlockInfoFromNode(found.node, found.posBeforeNode);
    if (!info.hasContent) return null;
    const span = info.contentEnd - info.contentStart;
    if (span < 0) return null;
    const clamped = Math.max(0, Math.min(Math.floor(offset), span));
    return info.contentStart + clamped;
  } catch {
    return null;
  }
}

export function caretFromEditor(editor: BlockNoteEditor): CursorPayload | null {
  let state: EditorState;
  try {
    state = editor.prosemirrorState;
  } catch {
    return null;
  }
  const head = pointFromPos(state, state.selection.head);
  if (!head) return null;
  if (state.selection.empty) return head;
  const anchor = pointFromPos(state, state.selection.anchor);
  if (!anchor || (anchor.blockId === head.blockId && anchor.offset === head.offset)) {
    return head;
  }
  return {
    ...head,
    anchorBlockId: anchor.blockId,
    anchorOffset: anchor.offset,
  };
}

function pointFromPos(state: EditorState, pos: number): { blockId: string; offset: number } | null {
  try {
    const info = getBlockInfoNearPos(state, pos);
    if (!info.hasContent) return null;
    const raw: unknown = info.block.node.attrs.id;
    if (typeof raw !== "string" || !raw) return null;
    const span = info.contentEnd - info.contentStart;
    const offset = Math.max(0, Math.min(pos - info.contentStart, span));
    if (!Number.isFinite(offset)) return null;
    return { blockId: raw, offset: Math.floor(offset) };
  } catch {
    return null;
  }
}

function editorFocused(editor: BlockNoteEditor) {
  try {
    if (editor.isFocused({ includeEditorUI: true })) return true;
  } catch {
    // The view can still hold a caret when the headless flag is set.
  }
  try {
    return Boolean(editor.prosemirrorView?.hasFocus());
  } catch {
    return false;
  }
}

function publishRemoteCarets(view: EditorView, carets: RemoteCaret[]) {
  const current = remoteCaretKey.getState(view.state);
  if (!current || sameCarets(current, carets)) return;
  view.dispatch(
    view.state.tr.setMeta(remoteCaretKey, carets).setMeta("addToHistory", false),
  );
}

function sameCarets(left: RemoteCaret[], right: RemoteCaret[]) {
  if (left.length !== right.length) return false;
  return left.every((caret, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      caret.userId === other.userId &&
      caret.name === other.name &&
      caret.blockId === other.blockId &&
      caret.offset === other.offset &&
      caret.anchorBlockId === other.anchorBlockId &&
      caret.anchorOffset === other.anchorOffset
    );
  });
}

function createCursorSender(send: (cursor: CursorPayload | null) => void) {
  let timer: number | null = null;
  let lastSentAt = 0;
  let pending: CursorPayload | null | undefined;
  let lastKey: string | null = null;
  let hasCursor = false;

  const keyOf = (cursor: CursorPayload | null) =>
    cursor
      ? `${cursor.blockId}:${cursor.offset}:${cursor.anchorBlockId ?? ""}:${cursor.anchorOffset ?? ""}`
      : "";

  const emit = (cursor: CursorPayload | null) => {
    const key = keyOf(cursor);
    if (key === lastKey) return;
    if (!cursor && !hasCursor) {
      lastKey = key;
      return;
    }
    lastKey = key;
    hasCursor = cursor !== null;
    send(cursor);
  };

  const flush = () => {
    timer = null;
    lastSentAt = Date.now();
    if (pending === undefined) return;
    const next = pending;
    pending = undefined;
    emit(next);
  };

  return {
    update(cursor: CursorPayload) {
      pending = cursor;
      const wait = CURSOR_THROTTLE_MS - (Date.now() - lastSentAt);
      if (wait <= 0) {
        if (timer !== null) window.clearTimeout(timer);
        flush();
        return;
      }
      if (timer === null) timer = window.setTimeout(flush, wait);
    },
    clearNow() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      pending = undefined;
      lastSentAt = Date.now();
      emit(null);
    },
    dispose() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      pending = undefined;
    },
  };
}

export function useLiveCarets(editor: BlockNoteEditor | null, documentId: Id<"documents">) {
  const session = useQuery(api.documents.session);
  const viewers = useQuery(api.documents.viewers, { documentId });
  const setCursor = useMutation(api.documents.cursor);
  const selfId = session?.userId;

  useEffect(() => {
    if (!editor) return;
    try {
      editor._tiptapEditor.registerPlugin(remoteCaretPlugin());
    } catch {
      return;
    }
    return () => {
      try {
        editor._tiptapEditor.unregisterPlugin(remoteCaretKey);
      } catch {
        // The editor is already gone.
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    let view: EditorView;
    try {
      view = editor.prosemirrorView;
    } catch {
      return;
    }
    if (!view?.dispatch) return;
    publishRemoteCarets(view, caretsForOthers(viewers, selfId));
  }, [editor, viewers, selfId]);

  useEffect(() => {
    if (!editor) return;
    const sender = createCursorSender((cursor) => {
      void setCursor({
        documentId,
        cursor: cursor
          ? {
              blockId: cursor.blockId,
              offset: cursor.offset,
              ...(cursor.anchorBlockId !== undefined && cursor.anchorOffset !== undefined
                ? {
                    anchorBlockId: cursor.anchorBlockId,
                    anchorOffset: cursor.anchorOffset,
                  }
                : {}),
            }
          : null,
      }).catch(() => {});
    });

    const publish = () => {
      if (!editorFocused(editor)) return;
      const cursor = caretFromEditor(editor);
      if (!cursor) return;
      sender.update(cursor);
    };

    const offSelection = editor.onSelectionChange(publish);
    const offFocus = editor.onFocusChange((_next, { focused }) => {
      if (focused) {
        publish();
        return;
      }
      sender.clearNow();
    }, { includeEditorUI: true });

    return () => {
      offSelection();
      offFocus();
      sender.clearNow();
      sender.dispose();
    };
  }, [documentId, editor, setCursor]);
}

function caretsForOthers(
  viewers:
    | Array<{
        userId: string;
        name: string;
        cursor: {
          blockId: string;
          offset: number;
          anchor?: { blockId: string; offset: number };
        } | null;
      }>
    | undefined,
  selfId: string | undefined,
) {
  if (!selfId || !viewers) return [];
  const carets: RemoteCaret[] = [];
  for (const viewer of viewers) {
    if (viewer.userId === selfId || !viewer.cursor) continue;
    const name = viewer.name.trim();
    carets.push({
      userId: viewer.userId,
      name: !name || name === viewer.userId ? "Member" : name,
      blockId: viewer.cursor.blockId,
      offset: viewer.cursor.offset,
      ...(viewer.cursor.anchor
        ? {
            anchorBlockId: viewer.cursor.anchor.blockId,
            anchorOffset: viewer.cursor.anchor.offset,
          }
        : {}),
    });
  }
  return carets;
}
