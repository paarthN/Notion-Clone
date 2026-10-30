"use client";

import { useMutation, useQuery } from "convex/react";
import { FileText, Folder, Star } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

export function FavoritesSection({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const favoriteIds = useQuery(api.documents.favorites) as string[] | undefined;
  const toggleFavorite = useMutation(api.documents.toggleFavorite);

  if (pages === undefined || favoriteIds === undefined) {
    return (
      <div className="flex flex-col gap-1 px-2">
        <span className="text-xs font-medium text-muted-foreground">Favorites</span>
        <Skeleton className="h-6 w-4/5" />
      </div>
    );
  }

  const favorites = pages.filter((page) => favoriteIds.includes(page._id));
  if (favorites.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col">
      <span className="mx-2 flex h-[30px] items-center px-2 text-[12px] leading-4 font-medium text-[#a19e99] dark:text-[#7d7a75]">
        Favorites
      </span>
      <div className="flex flex-col">
        {favorites.map((page) => {
          const isFolder = page.kind === "folder";
          const isActive = !isFolder && pathname === `/app/p/${page._id}`;
          const openPage = () => {
            if (isFolder) return;
            onNavigate?.();
            router.push(`/app/p/${page._id}`);
          };
          return (
            <div
              key={page._id}
              role={isFolder ? undefined : "button"}
              tabIndex={isFolder ? undefined : 0}
              onClick={isFolder ? undefined : openPage}
              onKeyDown={
                isFolder
                  ? undefined
                  : (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPage();
                      }
                    }
              }
              className={cn(
                "group/fav mx-2 flex h-[30px] items-center rounded-[6px] px-2 text-[14px] leading-[16.8px] font-normal text-foreground hover:bg-sidebar-accent",
                isActive && "bg-sidebar-accent",
              )}
            >
              {page.icon ? (
                <span className="mr-2 text-[16px] leading-none">{page.icon}</span>
              ) : isFolder ? (
                <Folder className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{page.title || "Untitled"}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove from favorites"
                className="opacity-0 transition-opacity group-hover/fav:opacity-100 group-focus-within/fav:opacity-100"
                onClick={async (event) => {
                  event.stopPropagation();
                  try {
                    await toggleFavorite({ id: page._id });
                  } catch {
                    toast.error("Couldn't update favorite");
                  }
                }}
              >
                <Star className="size-3.5 fill-current text-amber-500" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
