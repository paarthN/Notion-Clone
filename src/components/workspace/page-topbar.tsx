"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Copy, FolderInput, Link, Lock, MoreHorizontal, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
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
  const id = documentId as Id<"documents">;
  const others = (viewers ?? []).filter((viewer) => viewer.userId !== user?.id);
  const destinations = page && pages ? moveDestinations(pages, page) : [];

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
        <PopoverContent align="end" className="w-64 gap-2 p-3">
          <p className="text-[14px] leading-5 text-foreground">
            People in this workspace can open this page.
          </p>
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
