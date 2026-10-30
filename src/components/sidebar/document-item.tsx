"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isPageWithin, type DropTarget, type PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

export function DocumentItem({
  document,
  pages,
  depth = 0,
  onNavigate,
  dragId,
  drop,
  onRowDragStart,
  onRowDragEnd,
  onRowDragOver,
  onRowDrop,
}: {
  document: PageDoc;
  pages: PageDoc[];
  depth?: number;
  onNavigate?: () => void;
  dragId: string | null;
  drop: DropTarget | null;
  onRowDragStart: (id: string) => void;
  onRowDragEnd: () => void;
  onRowDragOver: (target: DropTarget | null) => void;
  onRowDrop: (rowId: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isFolder = document.kind === "folder";
  const isActive = !isFolder && pathname === `/app/p/${document._id}`;
  const favoriteIds = useQuery(api.documents.favorites) as string[] | undefined;
  const isFavorite = favoriteIds?.includes(document._id) ?? false;

  const [expanded, setExpanded] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(document.title);

  const create = useMutation(api.documents.create);
  const rename = useMutation(api.documents.rename);
  const archive = useMutation(api.documents.archive);
  const duplicate = useMutation(api.documents.duplicate);
  const toggleFavorite = useMutation(api.documents.toggleFavorite);
  const skipClick = useRef(false);

  useEffect(() => {
    if (drop?.id !== document._id || drop.placement !== "inside" || expanded) {
      return;
    }
    const timer = window.setTimeout(() => setExpanded(true), 450);
    return () => window.clearTimeout(timer);
  }, [drop, document._id, expanded]);

  const children = pages.filter((page) => page.parentId === document._id);
  const indentPadding = depth * 12 + 12;
  const showBefore = drop?.id === document._id && drop.placement === "before";
  const showAfter = drop?.id === document._id && drop.placement === "after";
  const showInside = drop?.id === document._id && drop.placement === "inside";

  const resolveDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!dragId || dragId === document._id) {
      onRowDragOver(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.height === 0 ? 0.5 : (event.clientY - rect.top) / rect.height;
    const placement = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside";
    const parentId = placement === "inside" ? document._id : document.parentId;
    if (parentId && isPageWithin(pages, dragId, parentId)) {
      onRowDragOver(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    onRowDragOver({ id: document._id, placement });
  };

  const onSelect = useCallback(() => {
    if (isFolder) {
      setExpanded((prev) => !prev);
      return;
    }
    onNavigate?.();
    router.push(`/app/p/${document._id}`);
  }, [isFolder, onNavigate, router, document._id]);

  const onCreateChild = useCallback(
    async (kind: "page" | "folder") => {
      try {
        const childId = await create({
          parentId: document._id,
          title: "Untitled",
          kind,
        });
        setExpanded(true);
        if (kind === "page") {
          onNavigate?.();
          router.push(`/app/p/${childId}`);
        }
      } catch {
        toast.error(kind === "folder" ? "Couldn't create folder" : "Couldn't create page");
      }
    },
    [create, document._id, onNavigate, router],
  );

  const startRename = useCallback(() => {
    setDraftTitle(document.title);
    setIsRenaming(true);
  }, [document.title]);

  const commitRename = useCallback(async () => {
    setIsRenaming(false);
    const next = draftTitle.trim();
    if (next.length === 0 || next === document.title) {
      setDraftTitle(document.title);
      return;
    }
    try {
      await rename({ id: document._id, title: next });
    } catch {
      toast.error("Couldn't rename");
      setDraftTitle(document.title);
    }
  }, [draftTitle, document._id, document.title, rename]);

  const onArchive = useCallback(async () => {
    try {
      await archive({ id: document._id });
      toast.success("Moved to trash");
      if (isActive) {
        router.push("/app");
      }
    } catch {
      toast.error("Couldn't move to trash");
    }
  }, [archive, document._id, isActive, router]);

  const onDuplicate = useCallback(async () => {
    try {
      const copyId = await duplicate({ id: document._id });
      toast.success("Duplicated");
      onNavigate?.();
      router.push(`/app/p/${copyId}`);
    } catch {
      toast.error("Couldn't duplicate");
    }
  }, [duplicate, document._id, onNavigate, router]);

  const onToggleFavorite = useCallback(async () => {
    try {
      await toggleFavorite({ id: document._id });
    } catch {
      toast.error("Couldn't update favorite");
    }
  }, [toggleFavorite, document._id]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        draggable={!isRenaming}
        aria-expanded={isFolder ? expanded : undefined}
        data-document-id={document._id}
        onClick={
          isRenaming
            ? undefined
            : () => {
                if (skipClick.current) {
                  skipClick.current = false;
                  return;
                }
                onSelect();
              }
        }
        onKeyDown={(event) => {
          if (isRenaming) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        onDragStart={(event) => {
          event.stopPropagation();
          skipClick.current = true;
          event.dataTransfer.setData("text/plain", document._id);
          event.dataTransfer.effectAllowed = "move";
          onRowDragStart(document._id);
        }}
        onDragOver={resolveDrop}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRowDrop(document._id);
        }}
        onDragEnd={onRowDragEnd}
        style={{ paddingLeft: indentPadding }}
        className={cn(
          "group/item relative mx-2 flex h-[30px] items-center rounded-[6px] pr-1 text-[14px] leading-[16.8px] font-normal text-foreground hover:bg-sidebar-accent",
          isActive && "bg-sidebar-accent",
          dragId === document._id && "opacity-40",
          showInside && "bg-[#efefed] shadow-[inset_2px_0_0_0_var(--foreground)] dark:bg-[#2a2a28]",
        )}
      >
        {showBefore ? (
          <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 bg-foreground" />
        ) : null}
        {showAfter ? (
          <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 bg-foreground" />
        ) : null}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className={cn(
            "absolute flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-black/10 group-hover/item:opacity-100 dark:hover:bg-white/10",
            expanded && "opacity-100",
          )}
          style={{ left: Math.max(indentPadding - 18, 2) }}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>

        {document.icon ? (
          <span className="mr-1.5 text-[16px] leading-none">{document.icon}</span>
        ) : isFolder ? (
          expanded ? (
            <FolderOpen className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <FileText className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {isRenaming ? (
          <Input
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDraftTitle(document.title);
                setIsRenaming(false);
              }
            }}
            className="h-6 px-1 py-0 text-sm"
          />
        ) : (
          <span className="flex-1 truncate">{document.title || "Untitled"}</span>
        )}

        {!isRenaming ? (
          <div className="ml-auto flex shrink-0 items-center gap-x-2 opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Document actions"
                    onClick={(event) => event.stopPropagation()}
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                <DropdownMenuItem onClick={() => void onCreateChild("page")}>
                  <FileText className="size-3.5" />
                  New page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onCreateChild("folder")}>
                  <Folder className="size-3.5" />
                  New folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void onToggleFavorite()}>
                  <Star className={cn("size-3.5", isFavorite && "fill-current text-amber-500")} />
                  {isFavorite ? "Remove from favorites" : "Add to favorites"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={startRename}>
                  <Pencil className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onDuplicate()}>
                  <Copy className="size-3.5" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void onArchive()}>
                  <Trash2 className="size-3.5" />
                  Move to trash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add a page inside"
              onClick={(event) => {
                event.stopPropagation();
                void onCreateChild("page");
              }}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div>
          {children.length === 0 ? (
            <p
              className="py-1 text-xs text-muted-foreground/70"
              style={{ paddingLeft: indentPadding + 20 }}
            >
              No pages inside
            </p>
          ) : (
            children.map((child) => (
              <DocumentItem
                key={child._id}
                document={child}
                pages={pages}
                depth={depth + 1}
                onNavigate={onNavigate}
                dragId={dragId}
                drop={drop}
                onRowDragStart={onRowDragStart}
                onRowDragEnd={onRowDragEnd}
                onRowDragOver={onRowDragOver}
                onRowDrop={onRowDrop}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
