"use client";

import { useMutation } from "convex/react";
import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { dueWeekLabel, groupDueTasks, selectDueTasks } from "@/lib/documents/due";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

export function DueTasks({ pages }: { pages: PageDoc[] | undefined }) {
  const router = useRouter();
  const setProperties = useMutation(api.documents.setProperties);
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = Date.now();
  const groups = groupDueTasks(selectDueTasks(pages, now), pages ?? []);
  if (groups.length === 0) return null;

  const markDone = async (page: PageDoc) => {
    if (busyId) return;
    setBusyId(page._id);
    try {
      await setProperties({ id: page._id, status: "done" });
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-6">
      <div className="mb-1 flex h-8 items-center">
        <h2 className="text-[12px] font-medium text-[#a19e99] dark:text-[#7d7a75]">This week</h2>
      </div>
      {groups.map((group) => (
        <div key={group.boardId}>
          <div className="flex h-8 items-center px-2">
            <h3 className="min-w-0 truncate text-[12px] font-medium text-[#a19e99] dark:text-[#7d7a75]">
              {group.title || "Untitled"}
            </h3>
          </div>
          <ul>
            {group.tasks.map((page) => (
              <li key={page._id}>
                <div className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 hover:bg-accent">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Mark ${page.title || "Untitled"} done`}
                    disabled={busyId === page._id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void markDone(page);
                    }}
                    className="size-4 shrink-0 rounded-[3px] border border-[#a19e99] disabled:opacity-40 dark:border-[#7d7a75]"
                  />
                  <button
                    type="button"
                    onClick={() => router.push(`/app/p/${page._id}`)}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
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
                      {typeof page.dueAt === "number" ? dueWeekLabel(page.dueAt, now) : ""}
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function errorText(error: unknown) {
  if (!(error instanceof Error)) return "Couldn't update this page";
  const message = error.message.split("Uncaught Error: ").pop()?.trim();
  return message || "Couldn't update this page";
}
