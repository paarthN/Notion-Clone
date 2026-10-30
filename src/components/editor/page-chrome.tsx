"use client";

import { useMutation, useQuery } from "convex/react";
import { ImagePlus, Smile, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

const EMOJI_CHOICES = [
  "📄", "📝", "📌", "📒", "📚", "📖", "🗂️", "🗃️",
  "✅", "⭐", "🔥", "💡", "🎯", "🚀", "🧠", "🛠️",
  "📊", "📈", "💰", "🧾", "🗓️", "⏰", "🔖", "🏷️",
  "❤️", "🎉", "🌱", "🌍", "☕", "🍿", "🎨", "🎵",
] as const;

export function PageChrome({
  documentId,
  children,
}: {
  documentId: string;
  children?: ReactNode;
}) {
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const id = documentId as Id<"documents">;
  const page = pages?.find((item) => item._id === id);
  const setIcon = useMutation(api.documents.setIcon);
  const setCover = useMutation(api.documents.setCover);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (pages === undefined) {
    return (
      <div className="px-1 pt-6" aria-hidden>
        <div className="h-10 w-10 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!page) {
    return null;
  }

  return (
    <div className="pb-40">
      {page.coverUrl ? (
        <div className="group relative h-[35vh] w-full bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.coverUrl} alt="Page cover" className="h-full w-full object-cover" />
          <div className="absolute right-5 bottom-5 flex items-center gap-x-2 opacity-0 group-hover:opacity-100">
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-muted-foreground"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              Change cover
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-muted-foreground"
              onClick={() => {
                void setCover({ id, storageId: null }).catch(() => {
                  toast.error("Could not remove the cover");
                });
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[720px]">
        {page.coverUrl ? null : (
          <div className="group/top relative h-[112px]">
            {page.icon ? (
              <Popover open={iconOpen} onOpenChange={setIconOpen}>
                <PopoverTrigger
                  className="absolute bottom-1 left-2 text-[40px] leading-none"
                  aria-label="Choose page icon"
                >
                  {page.icon}
                </PopoverTrigger>
                <IconMenu
                  hasIcon
                  onClose={() => setIconOpen(false)}
                  onRemove={() => {
                    setIconOpen(false);
                    void setIcon({ id, icon: null }).catch(() => {
                      toast.error("Could not remove the page icon");
                    });
                  }}
                  onPick={(emoji) => {
                    setIconOpen(false);
                    void setIcon({ id, icon: emoji }).catch(() => {
                      toast.error("Could not update the page icon");
                    });
                  }}
                />
              </Popover>
            ) : null}
            <div className="absolute bottom-2 left-2 flex items-center gap-1 opacity-0 group-hover/top:opacity-100">
              {!page.icon ? (
                <Popover open={iconOpen} onOpenChange={setIconOpen}>
                  <PopoverTrigger className="inline-flex h-7 items-center rounded-md px-2 text-[14px] text-[#a19e99] hover:bg-accent dark:text-[#7d7a75]">
                    <Smile className="mr-1.5 size-4" />
                    Add icon
                  </PopoverTrigger>
                  <IconMenu
                    hasIcon={false}
                    onClose={() => setIconOpen(false)}
                    onRemove={() => setIconOpen(false)}
                    onPick={(emoji) => {
                      setIconOpen(false);
                      void setIcon({ id, icon: emoji }).catch(() => {
                        toast.error("Could not update the page icon");
                      });
                    }}
                  />
                </Popover>
              ) : null}
              <button
                type="button"
                className="inline-flex h-7 items-center rounded-md px-2 text-[14px] text-[#a19e99] hover:bg-accent disabled:opacity-50 dark:text-[#7d7a75]"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="mr-1.5 size-4" />
                {uploading ? "Uploading…" : "Add cover"}
              </button>
            </div>
          </div>
        )}

        <PageTitle id={id} title={page.title} />
        {children}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setUploading(true);
          void uploadCover(file, generateUploadUrl, setCover, id)
            .catch(() => toast.error("Could not upload cover image"))
            .finally(() => setUploading(false));
        }}
      />
    </div>
  );
}

function IconMenu({
  hasIcon,
  onClose,
  onRemove,
  onPick,
}: {
  hasIcon: boolean;
  onClose: () => void;
  onRemove: () => void;
  onPick: (emoji: string) => void;
}) {
  return (
    <PopoverContent className="w-72" align="start">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Pick an icon</span>
        {hasIcon ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRemove}>
            <X className="mr-1 h-3 w-3" />
            Remove
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_CHOICES.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded text-xl hover:bg-muted"
            onClick={() => {
              onClose();
              onPick(emoji);
            }}
            aria-label={`Use ${emoji} as page icon`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </PopoverContent>
  );
}

function PageTitle({ id, title }: { id: Id<"documents">; title: string }) {
  const rename = useMutation(api.documents.rename);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const skipCommit = useRef(false);
  const shown = title.trim() || "Untitled";

  const startEditing = () => {
    setDraft(title.trim() ? title : "");
    setEditing(true);
  };

  const commit = async () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      setEditing(false);
      return;
    }
    const saved = draft.trim() || "Untitled";
    setEditing(false);
    if (saved === shown) {
      return;
    }
    try {
      await rename({ id, title: saved });
    } catch {
      toast.error("Could not rename the page");
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Page title"
        value={draft}
        placeholder="Untitled"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            skipCommit.current = true;
            setDraft(shown);
            setEditing(false);
          }
        }}
        className="w-full resize-none bg-transparent px-2 text-[40px] leading-[48px] font-bold break-words text-[#2c2c2b] outline-none placeholder:text-[#a19e99] dark:text-[#f0efed] dark:placeholder:text-[#7d7a75]"
      />
    );
  }

  return (
    <h1>
      <button
        type="button"
        onClick={startEditing}
        className="w-full px-2 text-left text-[40px] leading-[48px] font-bold break-words text-[#2c2c2b] outline-none dark:text-[#f0efed]"
      >
        {shown}
      </button>
    </h1>
  );
}

async function uploadCover(
  file: File,
  generateUploadUrl: () => Promise<string>,
  setCover: (args: {
    id: Id<"documents">;
    storageId: Id<"_storage">;
  }) => Promise<unknown>,
  documentId: Id<"documents">,
) {
  const uploadUrl = await generateUploadUrl();
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const body = (await result.json()) as { storageId?: Id<"_storage"> };
  if (!body.storageId) {
    throw new Error("Upload failed");
  }
  await setCover({ id: documentId, storageId: body.storageId });
}
