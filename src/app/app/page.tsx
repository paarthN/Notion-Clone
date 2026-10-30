"use client";

import { useMutation, useQuery } from "convex/react";
import { FilePlus2, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

export default function WorkspaceHome() {
  const router = useRouter();
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const create = useMutation(api.documents.create);
  const [creating, setCreating] = useState(false);

  const onCreate = async () => {
    setCreating(true);
    try {
      const id = await create({ parentId: null, title: "Untitled" });
      router.push(`/app/p/${id}`);
    } catch {
      toast.error("Couldn't create page");
      setCreating(false);
    }
  };

  const recent = (pages ?? [])
    .filter((page) => page.kind !== "folder")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 15);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-12 pt-16 pb-24">
        <div className="mb-1 flex h-8 items-center justify-between">
          <h1 className="text-[12px] font-medium text-[#a19e99] dark:text-[#7d7a75]">
            Recent
          </h1>
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={creating}
            className="inline-flex h-7 items-center rounded-md px-2 text-[14px] text-foreground hover:bg-accent disabled:opacity-50"
          >
            <FilePlus2 className="mr-1.5 size-4" />
            {creating ? "Creating…" : "New page"}
          </button>
        </div>
        {pages === undefined ? (
          <div className="flex flex-col gap-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-8 w-3/5" />
          </div>
        ) : recent.length === 0 ? (
          <p className="px-2 py-2 text-[14px] text-[#5f5e59] dark:text-[#bcbab6]">
            No pages yet.
          </p>
        ) : (
          <ul>
            {recent.map((page) => (
              <li key={page._id}>
                <button
                  type="button"
                  onClick={() => router.push(`/app/p/${page._id}`)}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left hover:bg-accent"
                >
                  {page.icon ? (
                    <span className="text-[16px] leading-none">{page.icon}</span>
                  ) : (
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                    {page.title || "Untitled"}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#a19e99] dark:text-[#7d7a75]">
                    {relativeTime(page.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function relativeTime(updatedAt: number) {
  const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
