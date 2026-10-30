"use client";

import { ChevronDown, Lock } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PageDoc } from "@/lib/documents/tree";

export function Breadcrumbs({
  documentId,
  pages,
}: {
  documentId: string;
  pages: PageDoc[] | undefined;
}) {
  if (pages === undefined) {
    return (
      <div className="flex h-6 items-center" aria-hidden>
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const page = pages.find((item) => item._id === documentId);
  if (!page) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="truncate text-[14px] leading-[16.8px] font-semibold text-[#2c2c2b] dark:text-[#f0efed]"
        aria-current="page"
      >
        {page.title || "Untitled"}
      </span>
      <Popover>
        <PopoverTrigger className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1 text-[14px] leading-none font-[450] text-[#7d7a75] hover:bg-accent dark:text-[#ada9a3]">
          <Lock className="size-3.5" strokeWidth={1.75} />
          Private
          <ChevronDown className="size-3" strokeWidth={2} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <p className="text-[14px] leading-5 text-foreground">
            People in this workspace can open this page.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
