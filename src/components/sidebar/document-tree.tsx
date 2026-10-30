"use client";

import { useMutation, useQuery } from "convex/react";
import { FileText, Folder, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

import { DocumentItem } from "@/components/sidebar/document-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { PageDoc } from "@/lib/documents/tree";

export function DocumentTree({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const create = useMutation(api.documents.create);

  const onCreate = useCallback(
    async (kind: "page" | "folder") => {
      try {
        const id = await create({ parentId: null, title: "Untitled", kind });
        if (kind === "page") {
          onNavigate?.();
          router.push(`/app/p/${id}`);
        }
      } catch {
        toast.error(kind === "folder" ? "Couldn't create folder" : "Couldn't create page");
      }
    },
    [create, onNavigate, router],
  );

  const roots = pages?.filter((page) => !page.parentId) ?? [];

  return (
    <div className="group/section mt-3 flex flex-col">
      <div className="mx-2 flex h-[30px] items-center justify-between px-2">
        <span className="text-[12px] leading-4 font-medium text-[#a19e99] dark:text-[#7d7a75]">
          Workspace
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="New page or folder"
                className="opacity-0 group-hover/section:opacity-100"
              />
            }
          >
            <Plus className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem onClick={() => void onCreate("page")}>
              <FileText className="size-3.5" />
              New page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onCreate("folder")}>
              <Folder className="size-3.5" />
              New folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col">
        {pages === undefined ? (
          <div className="flex flex-col gap-1 px-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        ) : roots.length === 0 ? (
          <button
            type="button"
            onClick={() => void onCreate("page")}
            className="mx-2 h-[30px] rounded-[6px] px-2 text-left text-[14px] leading-[16.8px] text-[#5f5e59] hover:bg-sidebar-accent dark:text-[#bcbab6]"
          >
            Create your first page
          </button>
        ) : (
          roots.map((page) => (
            <DocumentItem
              key={page._id}
              document={page}
              pages={pages}
              depth={0}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>
    </div>
  );
}
