"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
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
import { api } from "../../../../convex/_generated/api";
import type { PageDoc } from "@/lib/documents/tree";

export default function TrashPage() {
  const pages = useQuery(api.documents.listTrash) as PageDoc[] | undefined;
  const restore = useMutation(api.documents.restore);
  const remove = useMutation(api.documents.remove);
  const [pending, setPending] = useState<PageDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <section className="mx-auto w-full max-w-[720px] px-12 py-16">
      <h1 className="text-[12px] font-medium text-[#a19e99] dark:text-[#7d7a75]">Trash</h1>
      <p className="mt-2 text-[14px] leading-5 text-[#5f5e59] dark:text-[#bcbab6]">
        Restore a page, or delete it forever along with anything inside it.
      </p>
      {pages === undefined ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading trash…</p>
      ) : pages.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Trash is empty.</p>
      ) : (
        <ul className="mt-6">
          {pages.map((page) => (
            <li key={page._id} className="flex h-9 items-center gap-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate">
                {page.icon ? `${page.icon} ` : ""}
                {page.title || "Untitled"}
              </span>
              <Button variant="ghost" size="xs" onClick={() => void restore({ id: page._id })}>
                Restore
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive"
                onClick={() => setPending(page)}
              >
                Delete forever
              </Button>
            </li>
          ))}
        </ul>
      )}
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
    </section>
  );
}
