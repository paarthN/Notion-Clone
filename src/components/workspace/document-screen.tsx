"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";

import { CollaborativeEditor } from "@/components/editor/collaborative-editor";
import { PageChrome } from "@/components/editor/page-chrome";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PageDoc } from "@/lib/documents/tree";

export function DocumentScreen({ documentId }: { documentId: string }) {
  const id = documentId as Id<"documents">;
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const heartbeat = useMutation(api.documents.heartbeat);
  const page = pages?.find((item) => item._id === id);
  const isFolder = page?.kind === "folder";

  useEffect(() => {
    const beat = () => {
      void heartbeat({ documentId: id });
    };
    beat();
    const timer = window.setInterval(beat, 10_000);
    return () => window.clearInterval(timer);
  }, [id, heartbeat]);

  if (pages !== undefined && !page) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        This page is missing, or it is in the trash.
      </p>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PageChrome documentId={documentId}>
          {isFolder ? (
            <p className="px-2 text-[16px] leading-6 text-[#5f5e59] dark:text-[#bcbab6]">
              This is a folder.
            </p>
          ) : page ? (
            <CollaborativeEditor documentId={documentId} />
          ) : null}
        </PageChrome>
      </div>
    </div>
  );
}
