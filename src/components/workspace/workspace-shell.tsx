"use client";

import {
  OrganizationList,
  OrganizationSwitcher,
  UserButton,
  useOrganization,
} from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Breadcrumbs } from "@/components/editor/breadcrumbs";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchCommand } from "@/components/search/search-command";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PageDoc } from "@/lib/documents/tree";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { MembersButton } from "@/components/workspace/members-button";
import { cn } from "@/lib/utils";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { isLoaded, organization } = useOrganization();
  const pathname = usePathname();
  const documentId = pathname.match(/^\/app\/p\/([^/]+)/)?.[1];
  const pages = useQuery(
    api.documents.list,
    organization ? {} : "skip",
  ) as PageDoc[] | undefined;
  const viewers = useQuery(
    api.documents.viewers,
    documentId && organization ? { documentId: documentId as Id<"documents"> } : "skip",
  ) as Array<{ userId: string; name: string; imageUrl: string | null }> | undefined;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (media.matches) setMobileOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-6 p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">Select or create a workspace</h1>
          <p className="text-sm text-neutral-500">
            Potion organizes everything by workspace. Pick one or create a new one to get started.
          </p>
        </div>
        <OrganizationList
          hidePersonal
          afterCreateOrganizationUrl="/app"
          afterSelectOrganizationUrl="/app"
        />
      </div>
    );
  }

  return (
    <div className="notion-ui flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "group/sidebar hidden h-full shrink-0 overflow-hidden bg-sidebar md:block md:transition-[width] md:duration-200 md:ease-in-out",
          collapsed ? "md:w-0" : "md:w-[270px]",
        )}
        inert={collapsed ? true : undefined}
        aria-hidden={collapsed || undefined}
      >
        <AppSidebar onCollapse={() => setCollapsed(true)} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[270px] max-w-[85vw] gap-0 overflow-hidden bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">Workspace</SheetTitle>
          <SheetDescription className="sr-only">
            Search, pages, favorites, and trash.
          </SheetDescription>
          <AppSidebar
            onNavigate={() => setMobileOpen(false)}
            className="h-full min-h-0 w-full border-r-0"
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 bg-background px-3">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"
              aria-label="Open sidebar"
              onClick={() => setMobileOpen(true)}
            >
              <PanelLeft className="size-4" />
            </button>
            {collapsed ? (
              <button
                type="button"
                className="hidden size-7 items-center justify-center rounded-md text-foreground hover:bg-accent md:inline-flex"
                aria-label="Show sidebar"
                onClick={() => setCollapsed(false)}
              >
                <PanelLeft className="size-4" />
              </button>
            ) : null}
            <div className={cn(!collapsed && "md:hidden")}>
              <OrganizationSwitcher
                hidePersonal
                afterSelectOrganizationUrl="/app"
                afterCreateOrganizationUrl="/app"
                appearance={{
                  elements: {
                    organizationSwitcherTrigger: "h-6 rounded-md px-1.5 text-[14px] font-normal",
                  },
                }}
              />
            </div>
            {documentId ? <Breadcrumbs documentId={documentId} pages={pages} /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {documentId
              ? uniqueViewers(viewers ?? []).map((viewer) => (
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
                      nameInitial(viewer.name)
                    )}
                  </span>
                ))
              : null}
            <MembersButton />
            <ThemeToggle />
            <UserButton />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <SearchCommand />
    </div>
  );
}

function uniqueViewers(
  viewers: Array<{ userId: string; name: string; imageUrl: string | null }>,
) {
  const seen = new Set<string>();
  const unique = [];
  for (const viewer of viewers) {
    if (seen.has(viewer.userId)) continue;
    seen.add(viewer.userId);
    unique.push(viewer);
  }
  return unique;
}

function nameInitial(name: string) {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : "?";
}
