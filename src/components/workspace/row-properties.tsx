"use client";

import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Check } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ROW_STATUSES, STATUS_LABEL, type PageDoc, type RowStatus } from "@/lib/documents/tree";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

export type WorkspaceMember = {
  userId: string;
  name: string;
  imageUrl: string | null;
};

const emptyTone = "text-[#a19e99] dark:text-[#7d7a75]";

export function useWorkspaceMembers() {
  const { memberships } = useOrganization({
    memberships: { infinite: true },
  });

  useEffect(() => {
    if (!memberships?.hasNextPage || memberships.isFetching) return;
    void memberships.fetchNext();
  }, [memberships]);

  const members: WorkspaceMember[] = [];
  const seen = new Set<string>();
  for (const membership of memberships?.data ?? []) {
    const person = membership.publicUserData;
    const userId = person?.userId;
    if (!person || !userId || seen.has(userId)) continue;
    seen.add(userId);
    const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
    members.push({
      userId,
      name: name || person.identifier || "Member",
      imageUrl: person.imageUrl ?? null,
    });
  }

  return {
    members,
    loading: !memberships || memberships.isLoading,
  };
}

export function personName(members: WorkspaceMember[], personId: string | undefined) {
  if (!personId) return "Empty";
  return members.find((member) => member.userId === personId)?.name ?? "Member";
}

export function formatDue(dueAt: number | undefined) {
  if (dueAt === undefined) return "Empty";
  const date = new Date(dueAt);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function RowProperties({ page }: { page: PageDoc }) {
  const access = useQuery(api.documents.pageAccess, { id: page._id });
  const canEdit = access !== undefined && access.level !== "view";
  const setProperties = useMutation(api.documents.setProperties);
  const { members, loading } = useWorkspaceMembers();

  const save = async (patch: {
    status?: RowStatus;
    dueAt?: number | null;
    personId?: string | null;
  }) => {
    try {
      await setProperties({ id: page._id, ...patch });
    } catch {
      toast.error("Couldn't update this page");
    }
  };

  return (
    <div className="mt-2 mb-4 flex flex-col px-2">
      <Property label="Status">
        <StatusField
          status={page.status ?? "not_started"}
          canEdit={canEdit}
          onChange={(status) => void save({ status })}
        />
      </Property>
      <Property label="Date">
        <DateField
          dueAt={page.dueAt}
          canEdit={canEdit}
          onChange={(dueAt) => void save({ dueAt })}
        />
      </Property>
      <Property label="Person">
        <PersonField
          personId={page.personId}
          members={members}
          loading={loading}
          canEdit={canEdit}
          onChange={(personId) => void save({ personId })}
        />
      </Property>
    </div>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-8 items-center">
      <span className={cn("w-28 shrink-0 text-[14px] leading-[16.8px]", emptyTone)}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function fieldClass(canEdit: boolean, empty: boolean) {
  return cn(
    "flex h-7 max-w-full items-center truncate rounded-[6px] px-1.5 text-left text-[14px] leading-[16.8px]",
    empty ? emptyTone : "text-foreground",
    canEdit && "hover:bg-[rgba(33,27,23,0.05)] dark:hover:bg-white/6",
  );
}

export function StatusField({
  status,
  canEdit,
  onChange,
}: {
  status: RowStatus;
  canEdit: boolean;
  onChange: (status: RowStatus) => void;
}) {
  if (!canEdit) {
    return <span className={fieldClass(false, false)}>{STATUS_LABEL[status]}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={fieldClass(true, false)}>
        {STATUS_LABEL[status]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {ROW_STATUSES.map((option) => (
          <DropdownMenuItem key={option} onClick={() => onChange(option)}>
            <span className="flex-1">{STATUS_LABEL[option]}</span>
            {option === status ? <Check className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DateField({
  dueAt,
  canEdit,
  onChange,
}: {
  dueAt: number | undefined;
  canEdit: boolean;
  onChange: (dueAt: number | null) => void;
}) {
  const label = formatDue(dueAt);
  if (!canEdit) {
    return <span className={fieldClass(false, dueAt === undefined)}>{label}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger className={fieldClass(true, dueAt === undefined)}>{label}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-2">
        <input
          type="date"
          aria-label="Date"
          value={dueInputValue(dueAt)}
          onChange={(event) => onChange(dueTimestamp(event.target.value))}
          className="h-8 bg-transparent text-[14px] text-foreground outline-none"
        />
        {dueAt !== undefined ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="h-7 self-start rounded-md px-1.5 text-[14px] text-[#5f5e59] hover:bg-accent dark:text-[#bcbab6]"
          >
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function PersonField({
  personId,
  members,
  loading,
  canEdit,
  onChange,
}: {
  personId: string | undefined;
  members: WorkspaceMember[];
  loading: boolean;
  canEdit: boolean;
  onChange: (personId: string | null) => void;
}) {
  const label = personName(members, personId);
  if (!canEdit) {
    return <span className={fieldClass(false, !personId)}>{label}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={fieldClass(true, !personId)}>{label}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 min-w-44">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <span className="flex-1">Empty</span>
          {!personId ? <Check className="size-3.5" /> : null}
        </DropdownMenuItem>
        {loading && members.length === 0 ? (
          <DropdownMenuItem disabled>Loading members…</DropdownMenuItem>
        ) : (
          members.map((member) => (
            <DropdownMenuItem key={member.userId} onClick={() => onChange(member.userId)}>
              <span className="flex-1 truncate">{member.name}</span>
              {member.userId === personId ? <Check className="size-3.5" /> : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function dueInputValue(dueAt: number | undefined) {
  if (dueAt === undefined) return "";
  const date = new Date(dueAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dueTimestamp(value: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}
