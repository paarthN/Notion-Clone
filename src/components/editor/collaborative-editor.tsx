"use client";

import { useBlockNoteSync } from "@convex-dev/prosemirror-sync/blocknote";
import type { SyncApi } from "@convex-dev/prosemirror-sync";
import type { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useMutation } from "convex/react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/components/editor/notion-editor.css";

const EMPTY_DOC = { type: "doc", content: [] };

export function CollaborativeEditor({ documentId }: { documentId: string }) {
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
        uploadFile: (file) => uploadFileRef.current(file),
      },
    },
  );
  const { resolvedTheme } = useTheme();
  const creating = useRef(false);

  useEffect(() => {
    if (sync.isLoading || sync.editor || !sync.create || creating.current) {
      return;
    }
    creating.current = true;
    void sync.create(EMPTY_DOC).catch(() => {
      creating.current = false;
    });
  }, [sync]);

  if (!sync.editor) {
    return <p className="text-sm text-muted-foreground">Opening the page…</p>;
  }

  return (
    <BlockNoteView
      editor={sync.editor}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
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
