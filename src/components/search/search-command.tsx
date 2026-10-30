"use client";

import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { OPEN_SEARCH_EVENT } from "@/components/sidebar/app-sidebar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const trimmed = term.trim();
  const results = useQuery(
    api.documents.search,
    open && trimmed.length > 0 ? { query: trimmed } : "skip",
  ) as PageDoc[] | undefined;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    };
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setTerm("");
  }, []);

  const showResults = trimmed.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search documents"
      description="Search documents in this workspace"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Search documents…"
        />
        <CommandList>
          {!showResults ? (
            <CommandEmpty>Type to search your workspace.</CommandEmpty>
          ) : results === undefined ? (
            <div className="flex flex-col gap-1 p-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-4/5" />
              <Skeleton className="h-7 w-3/5" />
            </div>
          ) : results.length === 0 ? (
            <CommandEmpty>No documents found.</CommandEmpty>
          ) : (
            <CommandGroup heading="Documents">
              {results.map((page) => (
                <CommandItem
                  key={page._id}
                  value={page._id}
                  onSelect={() => {
                    onOpenChange(false);
                    router.push(`/app/p/${page._id}`);
                  }}
                >
                  {page.icon ? (
                    <span className="text-sm leading-none">{page.icon}</span>
                  ) : (
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{page.title || "Untitled"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
