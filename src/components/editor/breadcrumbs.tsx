"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Lock } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function Breadcrumbs({
  documentId,
  pages,
}: {
  documentId: string;
  pages: PageDoc[] | undefined;
}) {
  const id = documentId as Id<"documents">;
  const access = useQuery(api.documents.pageAccess, { id });
  const setAccess = useMutation(api.documents.setAccess);
  const page = pages?.find((item) => item._id === documentId);
  const general =
    access?.generalAccess ??
    (page?.generalAccess === "view" || page?.generalAccess === "none"
      ? page.generalAccess
      : "edit");
  const workspaceLevel =
    general === "none"
      ? access?.accessBeforePrivate === "view"
        ? "view"
        : "edit"
      : general;
  const canChange = access?.level === "full";

  const onChoose = async (next: "edit" | "view" | "none") => {
    if (!canChange || next === general) return;
    try {
      await setAccess({ id, generalAccess: next });
    } catch {
      toast.error("Couldn't update access");
    }
  };

  if (pages === undefined) {
    return (
      <div className="flex h-6 items-center" aria-hidden>
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!page) {
    return null;
  }

  const label =
    general === "none" ? "Private" : general === "view" ? "Can view" : "Can edit";
  const description =
    general === "none"
      ? "Only people with access can open this page."
      : "People in this workspace can open this page.";

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
          {label}
          <ChevronDown className="size-3" strokeWidth={2} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          {canChange ? (
            <div className="flex flex-col">
              <button
                type="button"
                className="flex h-7 items-center rounded-md px-1.5 text-left text-[14px] text-foreground hover:bg-accent"
                onClick={() => void onChoose("none")}
              >
                <span className="flex-1">Private</span>
                {general === "none" ? <Check className="size-3.5" /> : null}
              </button>
              <button
                type="button"
                className="flex h-7 items-center rounded-md px-1.5 text-left text-[14px] text-foreground hover:bg-accent"
                onClick={() => void onChoose(workspaceLevel)}
              >
                <span className="flex-1">
                  {workspaceLevel === "view" ? "Can view" : "Can edit"}
                </span>
                {general !== "none" ? <Check className="size-3.5" /> : null}
              </button>
            </div>
          ) : null}
          <p className="px-1.5 py-1 text-[14px] leading-5 text-foreground">{description}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
