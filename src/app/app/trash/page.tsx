"use client";

import { useMutation, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { PageDoc } from "@/lib/documents/tree";

export default function TrashPage() {
  const pages = useQuery(api.documents.listTrash) as PageDoc[] | undefined;
  const restore = useMutation(api.documents.restore);

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="font-serif text-4xl tracking-tight">Trash</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Restoring a page also restores the pages nested under it.
      </p>
      {pages === undefined ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading trash…</p>
      ) : pages.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Trash is empty.</p>
      ) : (
        <ul className="mt-8 divide-y divide-border">
          {pages.map((page) => (
            <li key={page._id} className="flex items-center justify-between py-3">
              <span>
                {page.icon ? `${page.icon} ` : ""}
                {page.title}
              </span>
              <Button variant="outline" size="sm" onClick={() => void restore({ id: page._id })}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
