"use client";

import { useMutation, useQuery } from "convex/react";
import { History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function VersionHistory({
  documentId,
  canEdit,
}: {
  documentId: string;
  canEdit: boolean;
}) {
  const id = documentId as Id<"documents">;
  const versions = useQuery(api.prosemirror.listVersions, { id });
  const restore = useMutation(api.prosemirror.restore);
  const [armed, setArmed] = useState<number | null>(null);

  const onRestore = async (version: number) => {
    try {
      await restore({ id, version });
    } catch {
      toast.error("Couldn't restore this save");
    }
  };

  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (!open) setArmed(null);
      }}
    >
      <DropdownMenuSubTrigger>
        <History className="size-3.5" />
        Version history
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 min-w-64">
        {versions === undefined ? (
          <p className="px-1.5 py-1 text-sm text-[#a19e99] dark:text-[#7d7a75]">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="px-1.5 py-1 text-sm text-[#a19e99] dark:text-[#7d7a75]">No saves yet</p>
        ) : (
          versions.map((row) => {
            const confirming = armed === row.version;
            return (
              <DropdownMenuItem
                key={row.version}
                closeOnClick={confirming}
                onClick={(event) => {
                  if (!canEdit) {
                    event.preventDefault();
                    return;
                  }
                  if (!confirming) {
                    event.preventDefault();
                    setArmed(row.version);
                    return;
                  }
                  void onRestore(row.version);
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {confirming ? "Replace the page with this save?" : versionLabel(row.createdAt)}
                </span>
                {canEdit && !confirming ? (
                  <span className="shrink-0 text-[13px] text-[#7d7a75] dark:text-[#ada9a3]">
                    Restore
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function versionLabel(createdAt: number) {
  const minutes = Math.max(0, Math.round((Date.now() - createdAt) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
