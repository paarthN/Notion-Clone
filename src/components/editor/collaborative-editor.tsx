"use client";

import { useBlockNoteSync } from "@convex-dev/prosemirror-sync/blocknote";
import type { SyncApi } from "@convex-dev/prosemirror-sync";
import type { BlockNoteEditor } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import { useMutation, useQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { editorSchema, PageMentionMenu } from "@/components/editor/page-mention";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/components/editor/notion-editor.css";

const EMPTY_DOC = { type: "doc", content: [] };

const dictionary = {
  ...en,
  placeholders: {
    ...en.placeholders,
    default: "Type '/' for commands",
    emptyDocument: "Type '/' for commands",
  },
};

export function CollaborativeEditor({ documentId }: { documentId: string }) {
  const id = documentId as Id<"documents">;
  const access = useQuery(api.documents.pageAccess, { id });
  const canEdit = access?.level !== "view";
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const storageUrl = useMutation(api.documents.storageUrl);
  const uploadFileRef = useRef<(file: File) => Promise<string>>(async () => {
    throw new Error("Upload is not ready");
  });
  uploadFileRef.current = (file) =>
    uploadInlineFile(file, generateUploadUrl, storageUrl);

  const sync = useBlockNoteSync<BlockNoteEditor>(
    api.prosemirror as unknown as SyncApi,
    documentId,
    {
      editorOptions: {
        schema: editorSchema,
        dictionary,
        uploadFile: (file) => uploadFileRef.current(file),
      },
    },
  );
  const { resolvedTheme } = useTheme();
  const creating = useRef(false);
  const editor = sync.editor;

  useEffect(() => {
    if (!editor) return;
    const focusBody = () => {
      const first = editor.document[0];
      if (first) editor.setTextCursorPosition(first, "start");
      editor.focus();
    };
    window.addEventListener("potion:focus-editor", focusBody);
    return () => window.removeEventListener("potion:focus-editor", focusBody);
  }, [editor]);

  useEffect(() => {
    if (!canEdit || sync.isLoading || sync.editor || !sync.create || creating.current) {
      return;
    }
    creating.current = true;
    void sync.create(EMPTY_DOC).catch(() => {
      creating.current = false;
    });
  }, [canEdit, sync]);

  if (!sync.editor) {
    return <p className="text-sm text-muted-foreground">Opening the page…</p>;
  }

  return (
    <BlockNoteView
      editor={sync.editor}
      editable={canEdit}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      sideMenu={canEdit}
      slashMenu={canEdit}
      formattingToolbar={canEdit}
      linkToolbar={canEdit}
      filePanel={canEdit}
    >
      <PageMentionMenu documentId={documentId} />
    </BlockNoteView>
  );
}

async function uploadInlineFile(
  file: File,
  generateUploadUrl: () => Promise<string>,
  storageUrl: (args: { storageId: Id<"_storage"> }) => Promise<string>,
) {
  const uploadUrl = await generateUploadUrl();
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const body = (await result.json()) as { storageId?: Id<"_storage"> };
  if (!body.storageId) {
    throw new Error("Upload failed");
  }
  return storageUrl({ storageId: body.storageId });
}
