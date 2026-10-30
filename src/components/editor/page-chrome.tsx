"use client";

import { useMutation, useQuery } from "convex/react";
import { ImagePlus, Smile, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const access = useQuery(api.documents.pageAccess, { id });
  const canEdit = access?.level !== "view";
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
            {canEdit ? (
              <>
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
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[720px]">
        {(page.coverUrl || (!canEdit && !page.icon)) ? null : (
          <div className="group/top relative h-[112px]">
            {page.icon ? (
              canEdit ? (
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
              ) : (
                <span className="absolute bottom-1 left-2 text-[40px] leading-none">
                  {page.icon}
                </span>
              )
            ) : null}
            {canEdit ? (
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
            ) : null}
          </div>
        )}

        {canEdit ? (
          <PageTitle key={id} id={id} title={page.title} />
        ) : (
          <PageTitleText title={page.title} />
        )}
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

const TITLE_CLASS =
  "w-full px-2 text-[40px] leading-[48px] font-bold break-words text-[#2c2c2b] dark:text-[#f0efed]";

function PageTitleText({ title }: { title: string }) {
  const empty = title.trim() === "" || title.trim() === "Untitled";
  return (
    <div
      aria-label="Page title"
      className={
        empty
          ? "w-full px-2 text-[40px] leading-[48px] font-bold break-words text-[#a19e99] dark:text-[#7d7a75]"
          : TITLE_CLASS
      }
    >
      {empty ? "Untitled" : title}
    </div>
  );
}

const TITLE_SAVE_DELAY_MS = 300;

function titleForField(title: string) {
  const trimmed = title.trim();
  return trimmed === "" || trimmed === "Untitled" ? "" : title;
}

function PageTitle({ id, title }: { id: Id<"documents">; title: string }) {
  const rename = useMutation(api.documents.rename);
  const renameRef = useRef(rename);
  renameRef.current = rename;
  const [draft, setDraft] = useState(() => titleForField(title));
  const draftRef = useRef(draft);
  const serverTitle = useRef(title);
  const timer = useRef<number | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = fieldRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (title === serverTitle.current) return;
    const previousField = titleForField(serverTitle.current);
    serverTitle.current = title;
    if (draftRef.current !== previousField) return;
    const next = titleForField(title);
    draftRef.current = next;
    setDraft(next);
  }, [title]);

  const writeTitle = (value: string) => {
    const saved = value.trim() || "Untitled";
    const current = serverTitle.current.trim() || "Untitled";
    if (saved === current) return;
    const previous = serverTitle.current;
    serverTitle.current = saved;
    void renameRef.current({ id, title: saved }).catch(() => {
      if (serverTitle.current === saved) serverTitle.current = previous;
      toast.error("Could not rename the page");
    });
  };

  const flush = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    writeTitle(draftRef.current);
  };

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      const saved = draftRef.current.trim() || "Untitled";
      const current = serverTitle.current.trim() || "Untitled";
      if (saved === current) return;
      serverTitle.current = saved;
      void renameRef.current({ id, title: saved }).catch(() => {
        toast.error("Could not rename the page");
      });
    };
  }, [id]);

  return (
    <textarea
      ref={fieldRef}
      rows={1}
      aria-label="Page title"
      value={draft}
      placeholder="Untitled"
      onChange={(event) => {
        const value = event.target.value.replace(/\n/g, "");
        draftRef.current = value;
        setDraft(value);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          writeTitle(draftRef.current);
        }, TITLE_SAVE_DELAY_MS);
      }}
      onBlur={flush}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          flush();
          window.dispatchEvent(new Event("potion:focus-editor"));
        } else if (event.key === "Escape") {
          event.preventDefault();
          if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
          }
          const next = titleForField(serverTitle.current);
          draftRef.current = next;
          setDraft(next);
          event.currentTarget.blur();
        }
      }}
      className={`${TITLE_CLASS} resize-none overflow-hidden bg-transparent outline-none placeholder:text-[#a19e99] dark:placeholder:text-[#7d7a75]`}
    />
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
