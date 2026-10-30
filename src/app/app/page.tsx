"use client";

import { useMutation } from "convex/react";
import { FilePlus2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { openSearch } from "@/components/sidebar/app-sidebar";
import { api } from "../../../convex/_generated/api";

export default function WorkspaceHome() {
  const router = useRouter();
  const create = useMutation(api.documents.create);
  const [creating, setCreating] = useState(false);

  const onCreate = async () => {
    setCreating(true);
    try {
      const id = await create({ parentId: null, title: "Untitled" });
      router.push(`/app/p/${id}`);
    } catch {
      toast.error("Couldn't create page");
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col justify-center px-2">
      <h1 className="text-[40px] leading-[48px] font-bold text-[#2c2c2b] dark:text-[#f0efed]">
        Welcome
      </h1>
      <p className="mt-2 text-[16px] leading-6 text-[#5f5e59] dark:text-[#bcbab6]">
        Create a page, or search this workspace.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={creating}
          className="inline-flex h-7 items-center rounded-md px-2 text-[14px] text-foreground hover:bg-accent disabled:opacity-50"
        >
          <FilePlus2 className="mr-1.5 size-4" />
          {creating ? "Creating…" : "Create a page"}
        </button>
        <button
          type="button"
          onClick={openSearch}
          className="inline-flex h-7 items-center rounded-md px-2 text-[14px] text-[#5f5e59] hover:bg-accent dark:text-[#bcbab6]"
        >
          <Search className="mr-1.5 size-4" />
          Search
        </button>
      </div>
    </div>
  );
}
