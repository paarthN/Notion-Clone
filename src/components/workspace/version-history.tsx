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
              <div key={row.version}>
                <DropdownMenuItem
                  closeOnClick={confirming && canEdit}
                  onClick={(event) => {
                    if (!confirming) {
                      event.preventDefault();
                      setArmed(row.version);
                      return;
                    }
                    if (!canEdit) {
                      event.preventDefault();
                      return;
                    }
                    void onRestore(row.version);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {confirming && canEdit
                      ? "Replace the page with this save?"
                      : versionLabel(row.createdAt)}
                  </span>
                  {canEdit && !confirming ? (
                    <span className="shrink-0 text-[13px] text-[#7d7a75] dark:text-[#ada9a3]">
                      Restore
                    </span>
                  ) : null}
                </DropdownMenuItem>
                {confirming ? (
                  <div className="px-1.5 pb-1" onPointerDown={(event) => event.preventDefault()}>
                    <VersionChange id={id} version={row.version} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function VersionChange({ id, version }: { id: Id<"documents">; version: number }) {
  const change = useQuery(api.prosemirror.versionChange, { id, version });
  if (change === undefined) {
    return <p className="text-[12px] leading-4 text-[#a19e99] dark:text-[#7d7a75]">…</p>;
  }
  if (change === null || (change.added.length === 0 && change.removed.length === 0)) {
    return (
      <p className="text-[12px] leading-4 text-[#a19e99] dark:text-[#7d7a75]">No text changes</p>
    );
  }
  return (
    <div>
      {change.removed.map((line, index) => (
        <p
          key={`removed-${index}`}
          className="truncate text-[12px] leading-4 text-[#7d7a75] dark:text-[#ada9a3]"
        >
          − {line}
        </p>
      ))}
      {change.added.map((line, index) => (
        <p
          key={`added-${index}`}
          className="truncate text-[12px] leading-4 text-[#7d7a75] dark:text-[#ada9a3]"
        >
          + {line}
        </p>
      ))}
    </div>
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
