"use client";

import type { EditorState } from "@tiptap/pm/state";
import { useEffect, type MutableRefObject } from "react";
import { sendableSteps } from "prosemirror-collab";

export type SavePhase = "idle" | "saving" | "saved" | "error";

type Entry = { documentId: string; phase: SavePhase };

let entry: Entry = { documentId: "", phase: "idle" };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function readSavePhase(documentId: string): SavePhase {
  return entry.documentId === documentId ? entry.phase : "idle";
}

export function setSavePhase(documentId: string, phase: SavePhase) {
  if (entry.documentId === documentId && entry.phase === phase) return;
  entry = { documentId, phase };
  emit();
}

export function clearSavePhase(documentId: string) {
  if (entry.documentId !== documentId) return;
  entry = { documentId, phase: "idle" };
  emit();
}

export function subscribeSavePhase(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function noteEditorSync(documentId: string, pending: boolean) {
  const phase = readSavePhase(documentId);
  if (pending) {
    setSavePhase(documentId, "saving");
    return;
  }
  if (phase === "saving" || phase === "error") {
    setSavePhase(documentId, "saved");
  }
}

type SyncedEditor = {
  _tiptapEditor: {
    state: EditorState;
    on(event: "transaction", handler: () => void): void;
    off(event: "transaction", handler: () => void): void;
  };
};

export function useEditorSaveState(
  documentId: string,
  editor: SyncedEditor | null,
  reportSyncError: MutableRefObject<(error: Error) => void>,
) {
  useEffect(() => {
    if (!editor) return;
    const tiptap = editor._tiptapEditor;
    const fromEditor = () => {
      noteEditorSync(documentId, sendableSteps(tiptap.state) !== null);
    };
    reportSyncError.current = () => {
      const pending = sendableSteps(tiptap.state) !== null;
      setSavePhase(documentId, pending ? "error" : "saved");
    };
    fromEditor();
    tiptap.on("transaction", fromEditor);
    return () => {
      tiptap.off("transaction", fromEditor);
      reportSyncError.current = () => {
        setSavePhase(documentId, "error");
      };
      clearSavePhase(documentId);
    };
  }, [documentId, editor, reportSyncError]);
}
