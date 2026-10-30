"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { breadcrumbs, type PageDoc } from "@/lib/documents/tree";

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

  const trail = breadcrumbs(pages, documentId);
  if (trail.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-0.5 overflow-hidden text-[14px] leading-[16.8px] font-normal text-foreground"
    >
      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1;
        const label = (
          <span className="flex min-w-0 items-center gap-1">
            {crumb.icon ? <span aria-hidden>{crumb.icon}</span> : null}
            <span className="truncate">{crumb.title || "Untitled"}</span>
          </span>
        );

        return (
          <span key={crumb._id} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3.5 shrink-0 text-[#a19e99]" /> : null}
            {isLast ? (
              <span className="flex h-6 max-w-[16rem] items-center rounded-md px-1.5" aria-current="page">
                {label}
              </span>
            ) : (
              <Link
                href={`/app/p/${crumb._id}`}
                className="flex h-6 max-w-[12rem] items-center rounded-md px-1.5 hover:bg-accent"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
