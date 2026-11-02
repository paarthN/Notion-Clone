"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

type Starter = "blank" | "note" | "todo";

const buttonClass =
  "inline-flex h-8 cursor-pointer items-center rounded-md border border-[#e6e5e3] bg-white px-3 text-[14px] font-[450] text-[#2c2c2b] shadow-[0_1px_1px_rgba(15,15,15,0.04)] hover:bg-[#f7f6f5] active:bg-[#efeeec] disabled:cursor-default disabled:opacity-40 dark:border-[#383836] dark:bg-[#202020] dark:text-[#f0efed] dark:hover:bg-[#2a2a2a] dark:active:bg-[#333331]";

export function StartActions() {
  const router = useRouter();
  const create = useMutation(api.documents.create);
  const lock = useRef(false);
  const [creating, setCreating] = useState<Starter | null>(null);

  const start = async (starter: Starter) => {
    if (lock.current) return;
    lock.current = true;
    setCreating(starter);
    try {
      const id =
        starter === "todo"
          ? await create({
              parentId: null,
              title: "To-do",
              kind: "database",
              view: "board",
            })
          : await create({
              parentId: null,
              title: starter === "note" ? "Note" : "Untitled",
            });
      router.push(`/app/p/${id}`);
    } catch {
      toast.error(
        starter === "todo" ? "Couldn't create database" : "Couldn't create page",
      );
      lock.current = false;
      setCreating(null);
    }
  };

  const label = (starter: Starter, text: string) =>
    creating === starter ? "Creating…" : text;

  const starterButton = (starter: Starter, text: string) => {
    const busy = creating === starter;
    return (
      <button
        type="button"
        onClick={() => void start(starter)}
        disabled={creating !== null}
        aria-busy={busy}
        className={cn(buttonClass, busy && "disabled:opacity-100")}
      >
        {label(starter, text)}
      </button>
    );
  };

  return (
    <div className="mb-1 flex h-8 items-center gap-1.5" role="group" aria-label="Start">
      {starterButton("blank", "Blank page")}
      {starterButton("note", "Note")}
      {starterButton("todo", "To-do list")}
    </div>
  );
}
