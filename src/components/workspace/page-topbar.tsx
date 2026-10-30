"use client";

import { UserButton, useOrganization, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Copy, FolderInput, Link, Lock, MoreHorizontal, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PageDoc } from "@/lib/documents/tree";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const ink =
  "text-black hover:bg-accent dark:text-[#f0efed]";

type AccessLevel = "full" | "edit" | "view";

const ROLE_LABEL: Record<AccessLevel, string> = {
  full: "Full access",
  edit: "Can edit",
  view: "Can view",
};

export function PageActions({
  documentId,
  pages,
  viewers,
}: {
  documentId: string;
  pages: PageDoc[] | undefined;
  viewers: Array<{ userId: string; name: string; imageUrl: string | null }> | undefined;
}) {
  const router = useRouter();
  const { user } = useUser();
  const { resolvedTheme, setTheme } = useTheme();
  const page = pages?.find((item) => item._id === documentId);
  const favoriteIds = useQuery(api.documents.favorites) as string[] | undefined;
  const isFavorite = favoriteIds?.includes(documentId) ?? false;
  const toggleFavorite = useMutation(api.documents.toggleFavorite);
  const archive = useMutation(api.documents.archive);
  const duplicate = useMutation(api.documents.duplicate);
  const move = useMutation(api.documents.move);
  const setAccess = useMutation(api.documents.setAccess);
  const id = documentId as Id<"documents">;
  const access = useQuery(api.documents.pageAccess, { id });
  const { memberships } = useOrganization({
    memberships: { infinite: true },
  });
  const canShare = access?.level === "full";
  const generalAccess = access?.generalAccess ?? "edit";
  const others = (viewers ?? []).filter((viewer) => viewer.userId !== user?.id);
  const destinations = page && pages ? moveDestinations(pages, page) : [];

  useEffect(() => {
    if (!memberships?.hasNextPage || memberships.isFetching) return;
    void memberships.fetchNext();
  }, [memberships]);

  const members = (memberships?.data ?? []).flatMap((membership) => {
    const person = membership.publicUserData;
    const userId = person?.userId;
    if (!person || !userId) return [];
    const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
    return [
      {
        id: membership.id,
        userId,
        name: name || person.identifier || "Member",
        imageUrl: person.imageUrl,
        admin: membership.role === "org:admin",
      },
    ];
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const onFavorite = async () => {
    try {
      const added = await toggleFavorite({ id });
      toast.success(added ? "Added to favorites" : "Removed from favorites");
    } catch {
      toast.error("Couldn't update favorite");
    }
  };

  const onDuplicate = async () => {
    try {
      const copyId = await duplicate({ id });
      toast.success("Duplicated");
      router.push(`/app/p/${copyId}`);
    } catch {
      toast.error("Couldn't duplicate");
    }
  };

  const onMove = async (parentId: Id<"documents"> | null) => {
    const index = (pages ?? []).filter(
      (item) => item.parentId === parentId && item._id !== id,
    ).length;
    try {
      await move({ id, parentId, index });
      toast.success(parentId ? "Moved" : "Moved to top level");
    } catch {
      toast.error("Couldn't move page");
    }
  };

  const onTrash = async () => {
    try {
      await archive({ id });
      toast.success("Moved to trash");
      router.push("/app");
    } catch {
      toast.error("Couldn't move page to trash");
    }
  };

  const onGeneralAccess = async (level: "edit" | "view") => {
    if (!canShare || level === generalAccess) return;
    try {
      await setAccess({ id, generalAccess: level });
    } catch (error) {
      toast.error(accessError(error));
    }
  };

  const onMemberAccess = async (userId: string, level: AccessLevel) => {
    if (!canShare) return;
    try {
      await setAccess({ id, userId, level });
    } catch (error) {
      toast.error(accessError(error));
    }
  };

  const levelFor = (member: { userId: string; admin: boolean }): AccessLevel => {
    if (member.admin) return "full";
    const grant = access?.grants.find((row) => row.userId === member.userId);
    if (grant) return grant.level;
    if (page?.createdBy === member.userId) return "full";
    return generalAccess;
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {others.map((viewer) => (
        <span
          key={viewer.userId}
          title={viewer.name}
          aria-label={viewer.name}
          className="inline-flex size-6 items-center justify-center overflow-hidden rounded-full bg-muted text-[12px] font-medium text-foreground"
        >
          {viewer.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.imageUrl} alt="" className="size-full object-cover" />
          ) : (
            viewer.name.trim().slice(0, 1).toLocaleUpperCase() || "?"
          )}
        </span>
      ))}
      {page ? (
        <span className="hidden px-1.5 text-[14px] leading-none font-[450] text-[#a19e99] sm:inline dark:text-[#7d7a75]">
          {editedLabel(page.updatedAt)}
        </span>
      ) : null}
      <Popover>
        <PopoverTrigger
          className={cn(
            "flex h-7 items-center gap-1 rounded-md px-1.5 text-[14px] leading-none font-[450]",
            ink,
          )}
        >
          <Lock className="size-4" strokeWidth={1.75} />
          Share
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-3 p-3">
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {!memberships || memberships.isLoading ? (
              <p className="px-1.5 py-1 text-[14px] text-muted-foreground">Loading members…</p>
            ) : members.length === 0 ? (
              <p className="px-1.5 py-1 text-[14px] text-muted-foreground">No members yet.</p>
            ) : (
              members.map((member) => {
                const level = levelFor(member);
                return (
                  <div key={member.id} className="flex items-center gap-2 px-1 py-1">
                    <span className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[12px] font-medium">
                      {member.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        member.name.slice(0, 1).toLocaleUpperCase() || "?"
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                      {member.name}
                    </span>
                    {canShare ? (
                      <RoleMenu
                        value={level}
                        options={["full", "edit", "view"]}
                        locked={member.admin}
                        onChange={(next) => void onMemberAccess(member.userId, next)}
                      />
                    ) : (
                      <span className="shrink-0 text-[13px] text-[#7d7a75] dark:text-[#ada9a3]">
                        {ROLE_LABEL[level]}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-foreground">Workspace</p>
              <p className="text-[12px] leading-4 text-muted-foreground">
                Everyone in this workspace
              </p>
            </div>
            {canShare ? (
              <RoleMenu
                value={generalAccess}
                options={["edit", "view"]}
                onChange={(next) => {
                  if (next === "edit" || next === "view") void onGeneralAccess(next);
                }}
              />
            ) : (
              <span className="shrink-0 text-[13px] text-[#7d7a75] dark:text-[#ada9a3]">
                {ROLE_LABEL[generalAccess]}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[14px] text-foreground hover:bg-accent"
          >
            <Link className="size-3.5" strokeWidth={1.75} />
            Copy link
          </button>
        </PopoverContent>
      </Popover>
      <button type="button" aria-label="Copy link" onClick={() => void copyLink()} className={cn("flex size-7 items-center justify-center rounded-md", ink)}>
        <Link className="size-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={isFavorite}
        onClick={() => void onFavorite()}
        className={cn("flex size-7 items-center justify-center rounded-md", ink)}
      >
        <Star className={cn("size-4", isFavorite && "fill-current")} strokeWidth={1.75} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Page actions"
          className={cn("flex size-7 items-center justify-center rounded-md", ink)}
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onClick={() => void onFavorite()}>
            <Star className={cn("size-3.5", isFavorite && "fill-current")} />
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyLink()}>
            <Link className="size-3.5" />
            Copy link
          </DropdownMenuItem>
          {canShare ? (
            <>
              <DropdownMenuItem onClick={() => void onDuplicate()}>
                <Copy className="size-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="size-3.5" />
                  Move to
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 min-w-52">
                  <DropdownMenuItem onClick={() => void onMove(null)}>
                    Top level
                  </DropdownMenuItem>
                  {destinations.length > 0 ? <DropdownMenuSeparator /> : null}
                  {destinations.map((item) => (
                    <DropdownMenuItem key={item._id} onClick={() => void onMove(item._id)}>
                      <span className="max-w-52 truncate">
                        {item.icon ? `${item.icon} ` : ""}
                        {item.title || "Untitled"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void onTrash()}>
                Move to trash
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-sm">Account</span>
            <UserButton />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function moveDestinations(pages: PageDoc[], page: PageDoc) {
  const blocked = new Set<string>([page._id]);
  const walk = (parentId: string) => {
    for (const item of pages) {
      if (item.parentId === parentId && !blocked.has(item._id)) {
        blocked.add(item._id);
        walk(item._id);
      }
    }
  };
  walk(page._id);
  return pages
    .filter((item) => !blocked.has(item._id))
    .sort((a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled"));
}

function editedLabel(updatedAt: number) {
  const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000));
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Edited yesterday";
  return `Edited ${days}d ago`;
}

function accessError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("full access")) {
    return "The last person with full access can't be removed";
  }
  return "Couldn't update access";
}

function RoleMenu({
  value,
  options,
  locked = false,
  onChange,
}: {
  value: AccessLevel;
  options: AccessLevel[];
  locked?: boolean;
  onChange: (level: AccessLevel) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[13px] text-foreground hover:bg-accent">
        {ROLE_LABEL[value]}
        <ChevronDown className="size-3" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={locked && option !== "full"}
            onClick={() => {
              if (option !== value) onChange(option);
            }}
          >
            <span className="flex-1">{ROLE_LABEL[option]}</span>
            {option === value ? <Check className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
