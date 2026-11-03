"use client";

import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { Mentions } from "@/components/workspace/mentions";
import { StudentHome } from "@/components/workspace/student-home";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

export default function WorkspaceHome() {
  const router = useRouter();
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;

  const recent = (pages ?? [])
    .filter((page) => page.kind !== "folder")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 15);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-12 pt-16 pb-24">
        <StudentHome pages={pages} />
        <Mentions pagesLoaded={pages !== undefined} />
        <div className="mb-1 flex min-h-9 items-center px-2">
          <h2 className="text-[16px] font-semibold leading-6 text-[#2c2c2b] dark:text-[#f0efed]">
            Recent
          </h2>
        </div>
        {pages === undefined ? (
          <div className="flex flex-col gap-1">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-4/5" />
            <Skeleton className="h-10 w-3/5" />
          </div>
        ) : recent.length === 0 ? (
          <p className="px-2 py-2 text-[15px] text-[#5f5e59] dark:text-[#bcbab6]">
            No pages yet.
          </p>
        ) : (
          <ul>
            {recent.map((page) => (
              <li key={page._id}>
                <button
                  type="button"
                  onClick={() => router.push(`/app/p/${page._id}`)}
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-[6px] px-2 text-left hover:bg-accent"
                >
                  {page.icon ? (
                    <span className="shrink-0 text-[18px] leading-none">{page.icon}</span>
                  ) : (
                    <FileText className="size-[18px] shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[16px] leading-6 text-foreground">
                    {page.title || "Untitled"}
                  </span>
                  <span className="shrink-0 text-[12px] leading-4 text-[#a19e99] dark:text-[#7d7a75]">
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
