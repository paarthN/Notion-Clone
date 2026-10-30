"use client";

import { useMutation, useQuery } from "convex/react";
import { FileText, Folder, RotateCcw, Search as SearchIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

export function TrashView() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-2 mt-1 flex h-[30px] items-center rounded-[6px] px-2 text-[14px] leading-[16.8px] text-foreground hover:bg-sidebar-accent"
      >
        <Trash2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left">Trash</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription>
              Restore a page, or delete it forever along with anything inside it.
            </DialogDescription>
          </DialogHeader>
          <TrashList onRestored={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function TrashList({ onRestored }: { onRestored: () => void }) {
  const router = useRouter();
  const trashed = useQuery(api.documents.listTrash) as PageDoc[] | undefined;
  const restore = useMutation(api.documents.restore);
  const remove = useMutation(api.documents.remove);
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<PageDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!trashed) return [];
    const term = filter.trim().toLowerCase();
    if (term.length === 0) return trashed;
    return trashed.filter((page) => (page.title || "Untitled").toLowerCase().includes(term));
  }, [trashed, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by title…"
          className="pl-7"
        />
      </div>

      <ScrollArea className="max-h-72">
        {trashed === undefined ? (
          <div className="flex flex-col gap-1.5 pr-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {trashed.length === 0 ? "Trash is empty" : "No matches"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 pr-3">
            {filtered.map((page) => (
              <li
                key={page._id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                {page.icon ? (
                  <span className="text-sm leading-none">{page.icon}</span>
                ) : page.kind === "folder" ? (
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{page.title || "Untitled"}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  onClick={() => setPending(page)}
                >
                  Delete forever
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    try {
                      await restore({ id: page._id });
                      toast.success("Restored");
                      onRestored();
                      if (page.kind !== "folder") {
                        router.push(`/app/p/${page._id}`);
                      }
                    } catch {
                      toast.error("Couldn't restore");
                    }
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete forever?</DialogTitle>
            <DialogDescription>
              {pending?.title || "Untitled"} and anything inside it will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || !pending}
              onClick={async () => {
                if (!pending) return;
                setDeleting(true);
                try {
                  await remove({ id: pending._id });
                  toast.success("Deleted");
                  setPending(null);
                } catch {
                  toast.error("Couldn't delete");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
