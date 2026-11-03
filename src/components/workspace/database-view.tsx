"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DateField,
  PersonField,
  StatusField,
  formatDue,
  personName,
  useWorkspaceMembers,
  type WorkspaceMember,
} from "@/components/workspace/row-properties";
import {
  ROW_STATUSES,
  STATUS_LABEL,
  type DatabaseViewMode,
  type PageDoc,
  type RowStatus,
} from "@/lib/documents/tree";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type StatusFilter = "all" | RowStatus;

export function DatabaseView({
  databaseId,
  pages,
}: {
  databaseId: Id<"documents">;
  pages: PageDoc[];
}) {
  const router = useRouter();
  const access = useQuery(api.documents.pageAccess, { id: databaseId });
  const canEdit = access !== undefined && access.level !== "view";
  const create = useMutation(api.documents.create);
  const setProperties = useMutation(api.documents.setProperties);
  const setView = useMutation(api.documents.setView);
  const setStatusFilter = useMutation(api.documents.setStatusFilter);
  const { members, loading } = useWorkspaceMembers();
  const database = pages.find((page) => page._id === databaseId);
  const view = database?.view ?? "table";
  const filter: StatusFilter = database?.statusFilter ?? "all";
  const canChangeFilter = access !== undefined && access.level !== "view";
  const [creating, setCreating] = useState(false);
  const [over, setOver] = useState<RowStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const rows = pages
    .filter((page) => page.parentId === databaseId && !page.isArchived)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const visible = filter === "all" ? rows : rows.filter((row) => (row.status ?? "not_started") === filter);

  const saveProperties = async (
    id: Id<"documents">,
    patch: {
      status?: RowStatus;
      dueAt?: number | null;
      personId?: string | null;
    },
  ) => {
    try {
      await setProperties({ id, ...patch });
    } catch {
      toast.error("Couldn't update this page");
    }
  };

  const onView = async (next: DatabaseViewMode) => {
    if (!canEdit || next === view) return;
    try {
      await setView({ id: databaseId, view: next });
    } catch {
      toast.error("Couldn't update the view");
    }
  };

  const onFilter = async (next: StatusFilter) => {
    if (!canChangeFilter || next === filter) return;
    try {
      await setStatusFilter({
        id: databaseId,
        status: next === "all" ? null : next,
      });
    } catch {
      toast.error("Couldn't update the filter");
    }
  };

  const onCreate = async () => {
    setCreating(true);
    try {
      const id = await create({ parentId: databaseId, kind: "page", title: "Untitled" });
      router.push(`/app/p/${id}`);
    } catch {
      toast.error("Couldn't create page");
      setCreating(false);
    }
  };

  const onDropStatus = (status: RowStatus, event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const id = dragId.current || event.dataTransfer.getData("text/plain");
    dragId.current = null;
    setDragging(null);
    setOver(null);
    if (!canEdit || !id) return;
    const row = rows.find((item) => item._id === id);
    if (!row || (row.status ?? "not_started") === status) return;
    void saveProperties(row._id, { status });
  };

  return (
    <div className="mt-2">
      <div className="flex h-8 items-center gap-1 px-2">
        <ViewButton label="Table" active={view === "table"} canEdit={canEdit} onSelect={() => void onView("table")} />
        <ViewButton label="Board" active={view === "board"} canEdit={canEdit} onSelect={() => void onView("board")} />
        {canChangeFilter ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 items-center rounded-md px-2 text-[14px] leading-none text-[#5f5e59] hover:bg-[rgba(33,27,23,0.05)] dark:text-[#bcbab6] dark:hover:bg-white/6">
              {filter === "all" ? "Status" : STATUS_LABEL[filter]}
              <ChevronDown className="ml-1 size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-36">
              <DropdownMenuItem onClick={() => void onFilter("all")}>
                <span className="flex-1">All</span>
                {filter === "all" ? <Check className="size-3.5" /> : null}
              </DropdownMenuItem>
              {ROW_STATUSES.map((status) => (
                <DropdownMenuItem key={status} onClick={() => void onFilter(status)}>
                  <span className="flex-1">{STATUS_LABEL[status]}</span>
                  {filter === status ? <Check className="size-3.5" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="inline-flex h-7 items-center px-2 text-[14px] leading-none text-[#5f5e59] dark:text-[#bcbab6]">
            {filter === "all" ? "Status" : STATUS_LABEL[filter]}
          </span>
        )}
        {canEdit ? (
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={creating}
            className="ml-auto inline-flex h-7 items-center rounded-md px-2 text-[14px] text-foreground hover:bg-[rgba(33,27,23,0.05)] disabled:opacity-50 dark:hover:bg-white/6"
          >
            <Plus className="mr-1 size-4" />
            {creating ? "Creating…" : "New page"}
          </button>
        ) : null}
      </div>

      {view === "board" ? (
        <div className="mt-2 grid grid-cols-1 gap-3 px-2 sm:grid-cols-3">
          {ROW_STATUSES.map((status) => {
            const cards = visible.filter((row) => (row.status ?? "not_started") === status);
            return (
              <section
                key={status}
                onDragOver={(event) => {
                  if (!canEdit || !dragId.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(status);
                }}
                onDrop={(event) => onDropStatus(status, event)}
                className={cn(
                  "min-h-32 rounded-[6px] px-1",
                  over === status && "bg-[rgba(33,27,23,0.05)] dark:bg-white/6",
                )}
              >
                <h2 className="flex h-7 items-center gap-1 px-1 text-[12px] leading-4 font-medium text-[#a19e99] dark:text-[#7d7a75]">
                  {STATUS_LABEL[status]}
                  <span>{cards.length}</span>
                </h2>
                {cards.map((row) => (
                  <div
                    key={row._id}
                    draggable={canEdit}
                    onDragStart={(event) => {
                      dragId.current = row._id;
                      event.dataTransfer.setData("text/plain", row._id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(row._id);
                    }}
                    onDragEnd={() => {
                      dragId.current = null;
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      "rounded-[6px] px-1.5 py-1.5",
                      canEdit && "cursor-grab",
                      dragging === row._id && "opacity-40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/app/p/${row._id}`)}
                      className="block w-full truncate text-left text-[14px] leading-[16.8px] text-foreground"
                    >
                      {row.title || "Untitled"}
                    </button>
                    <CardMeta row={row} members={members} />
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-1 overflow-x-auto px-2">
          <table className="w-full min-w-[520px] table-fixed border-collapse text-left">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="text-[12px] leading-4 font-medium text-[#a19e99] dark:text-[#7d7a75]">
                <th scope="col" className="h-8 px-1.5 font-medium">
                  Title
                </th>
                <th scope="col" className="h-8 px-1.5 font-medium">
                  Status
                </th>
                <th scope="col" className="h-8 px-1.5 font-medium">
                  Date
                </th>
                <th scope="col" className="h-8 px-1.5 font-medium">
                  Person
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-1.5 py-2 text-[14px] text-[#5f5e59] dark:text-[#bcbab6]">
                    {rows.length === 0 ? "No pages yet." : "No pages with this status."}
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row._id} className="hover:bg-[rgba(33,27,23,0.05)] dark:hover:bg-white/6">
                    <td className="h-9 px-0.5">
                      <button
                        type="button"
                        onClick={() => router.push(`/app/p/${row._id}`)}
                        className="flex h-7 w-full min-w-0 items-center truncate rounded-[6px] px-1 text-left text-[14px] leading-[16.8px] text-foreground"
                      >
                        {row.icon ? (
                          <span className="mr-1.5 text-[16px] leading-none">{row.icon}</span>
                        ) : null}
                        <span className="truncate">{row.title || "Untitled"}</span>
                      </button>
                    </td>
                    <td className="h-9 px-0.5">
                      <StatusField
                        status={row.status ?? "not_started"}
                        canEdit={canEdit}
                        onChange={(status) => void saveProperties(row._id, { status })}
                      />
                    </td>
                    <td className="h-9 px-0.5">
                      <DateField
                        dueAt={row.dueAt}
                        canEdit={canEdit}
                        onChange={(dueAt) => void saveProperties(row._id, { dueAt })}
                      />
                    </td>
                    <td className="h-9 px-0.5">
                      <PersonField
                        personId={row.personId}
                        members={members}
                        loading={loading}
                        canEdit={canEdit}
                        onChange={(personId) => void saveProperties(row._id, { personId })}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ViewButton({
  label,
  active,
  canEdit,
  onSelect,
}: {
  label: string;
  active: boolean;
  canEdit: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={!canEdit && !active}
      onClick={onSelect}
      className={cn(
        "inline-flex h-7 items-center rounded-md px-2 text-[14px] leading-none",
        active
          ? "bg-[rgba(33,27,23,0.05)] text-foreground dark:bg-white/6"
          : "text-[#5f5e59] hover:bg-[rgba(33,27,23,0.05)] dark:text-[#bcbab6] dark:hover:bg-white/6",
        !canEdit && !active && "disabled:opacity-50",
      )}
    >
      {label}
    </button>
  );
}

function CardMeta({ row, members }: { row: PageDoc; members: WorkspaceMember[] }) {
  const date = row.dueAt !== undefined ? formatDue(row.dueAt) : null;
  const person = row.personId ? personName(members, row.personId) : null;
  if (!date && !person) return null;
  return (
    <p className="mt-0.5 truncate text-[12px] leading-4 text-[#a19e99] dark:text-[#7d7a75]">
      {[date, person].filter(Boolean).join(" · ")}
    </p>
  );
}
