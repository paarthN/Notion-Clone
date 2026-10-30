"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { Component, useEffect, type ReactNode } from "react";

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
    if (pages !== undefined && !page) {
      return;
    }
    const beat = () => {
      void heartbeat({ documentId: id });
    };
    beat();
    const timer = window.setInterval(beat, 10_000);
    return () => window.clearInterval(timer);
  }, [id, heartbeat, pages, page]);

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
            <>
              <EditorBoundary>
                <CollaborativeEditor documentId={documentId} />
              </EditorBoundary>
              <Subpages parentId={id} pages={pages ?? []} />
            </>
          ) : null}
        </PageChrome>
      </div>
    </div>
  );
}

function Subpages({ parentId, pages }: { parentId: Id<"documents">; pages: PageDoc[] }) {
  const router = useRouter();
  const children = pages
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

  if (children.length === 0) return null;

  return (
    <div className="mt-3 px-1 pb-8">
      {children.map((child) => (
        <button
          key={child._id}
          type="button"
          onClick={() => router.push(`/app/p/${child._id}`)}
          className="flex h-[30px] w-full items-center rounded-[6px] px-1 text-left text-[14px] leading-[16.8px] text-[#5f5e59] hover:bg-[rgba(33,27,23,0.05)] dark:text-[#bcbab6] dark:hover:bg-white/6"
        >
          {child.icon ? (
            <span className="mr-1.5 text-[16px] leading-none">{child.icon}</span>
          ) : null}
          <span className="truncate">{child.title || "Untitled"}</span>
        </button>
      ))}
    </div>
  );
}

class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="px-2 text-sm text-muted-foreground">
          This page is missing, or it is in the trash.
        </p>
      );
    }
    return this.props.children;
  }
}
