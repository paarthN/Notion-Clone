"use client";

import { OrganizationSwitcher } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { PanelLeft, Search, SquarePen, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DocumentTree } from "@/components/sidebar/document-tree";
import { FavoritesSection } from "@/components/sidebar/favorites-section";
import { TrashView } from "@/components/sidebar/trash-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";

export const OPEN_SEARCH_EVENT = "potion:open-search";

export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

export function AppSidebar({
  className,
  onNavigate,
  onCollapse,
}: {
  className?: string;
  onNavigate?: () => void;
  onCollapse?: () => void;
}) {
  const router = useRouter();
  const create = useMutation(api.documents.create);

  const onCreatePage = async () => {
    try {
      const id = await create({ parentId: null, title: "Untitled", kind: "page" });
      onNavigate?.();
      router.push(`/app/p/${id}`);
    } catch {
      toast.error("Couldn't create page");
    }
  };

  return (
    <nav
      aria-label="Workspace navigation"
      className={cn(
        "flex h-full min-h-0 w-[270px] shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-[inset_-1px_0_0_0_var(--sidebar-border)]",
        className,
      )}
    >
      <div className="flex h-11 items-center justify-between px-3">
        {onCollapse ? (
          <button
            type="button"
            aria-label="Hide sidebar"
            onClick={onCollapse}
            className="flex size-7 items-center justify-center rounded-md text-[#7d7a75] hover:bg-sidebar-accent dark:text-[#ada9a3]"
          >
            <PanelLeft className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onNavigate}
            className="flex size-7 items-center justify-center rounded-md text-[#7d7a75] hover:bg-sidebar-accent dark:text-[#ada9a3]"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="New page"
          onClick={() => void onCreatePage()}
          className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <SquarePen className="size-4" />
        </button>
      </div>

      <div className="px-3 pb-1.5">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openSearch();
          }}
          className="flex h-8 w-full items-center rounded-lg border border-[rgba(28,19,1,0.11)] bg-transparent px-2 text-[14px] leading-[16.8px] font-normal text-[#a19e99] hover:bg-sidebar-accent dark:border-white/10 dark:text-[#7d7a75]"
        >
          <Search className="mr-1.5 size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="pointer-events-none hidden text-[12px] font-normal sm:inline">⌘K</kbd>
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col pb-2">
          <FavoritesSection onNavigate={onNavigate} />
          <DocumentTree onNavigate={onNavigate} />
          <TrashView />
        </div>
      </ScrollArea>

      <div className="px-2 py-1.5">
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/app"
          afterCreateOrganizationUrl="/app"
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger:
                "h-7 w-full justify-between rounded-md px-2 text-[16px] leading-6 font-normal text-sidebar-foreground hover:bg-sidebar-accent",
            },
          }}
        />
      </div>
    </nav>
  );
}
