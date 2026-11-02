"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { ArrowUp, AtSign, Check, MoreHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  REACTION,
  useWorkspaceMembers,
  type CommentMember,
} from "@/components/editor/convex-thread-store";
import { api } from "../../../convex/_generated/api";
import "@/components/editor/notion-editor.css";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type CommentRow = Doc<"comments">;

export function CommentComposer({
  placeholder,
  members,
  onSubmit,
  submitLabel,
  autoFocus = false,
  initial = "",
  initialMentions = [],
  onCancel,
  appearance = "plain",
}: {
  placeholder: string;
  members: CommentMember[];
  onSubmit: (body: string, mentions: string[]) => Promise<void>;
  submitLabel: string;
  autoFocus?: boolean;
  initial?: string;
  initialMentions?: string[];
  onCancel?: () => void;
  appearance?: "plain" | "inline";
}) {
  return (
    <ComposerField
      placeholder={placeholder}
      members={members}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      autoFocus={autoFocus}
      initial={initial}
      initialMentions={initialMentions}
      onCancel={onCancel}
      appearance={appearance}
    />
  );
}

function ComposerField({
  placeholder,
  members,
  onSubmit,
  submitLabel,
  autoFocus,
  initial,
  initialMentions,
  onCancel,
  appearance,
}: {
  placeholder: string;
  members: CommentMember[];
  onSubmit: (body: string, mentions: string[]) => Promise<void>;
  submitLabel: string;
  autoFocus: boolean;
  initial: string;
  initialMentions: string[];
  onCancel?: () => void;
  appearance: "plain" | "inline";
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(initial);
  const [picked, setPicked] = useState<string[]>(initialMentions);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const element = fieldRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
  }, [autoFocus]);

  const matches = query
    ? members
        .filter((member) => {
          const needle = query.text.trim().toLowerCase();
          if (!needle) return true;
          return member.name.toLowerCase().includes(needle);
        })
        .slice(0, 8)
    : [];

  const choose = (member: CommentMember) => {
    if (!query) return;
    const next = `${draft.slice(0, query.start)}@${member.name} ${draft.slice(fieldRef.current?.selectionStart ?? draft.length)}`;
    setDraft(next);
    setPicked((current) => (current.includes(member.userId) ? current : [...current, member.userId]));
    setQuery(null);
    requestAnimationFrame(() => {
      const element = fieldRef.current;
      if (!element) return;
      const cursor = query.start + member.name.length + 2;
      element.focus();
      element.setSelectionRange(cursor, cursor);
    });
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body || saving) return;
    const mentions = picked.filter((id) => {
      const member = members.find((item) => item.userId === id);
      return member ? bodyHasMention(body, member.name) : false;
    });
    setSaving(true);
    try {
      await onSubmit(body, mentions);
      setDraft("");
      setPicked([]);
      setQuery(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the comment");
    } finally {
      setSaving(false);
    }
  };

  const mention = () => {
    const element = fieldRef.current;
    const start = element?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, start)}@${draft.slice(start)}`;
    setDraft(next);
    setQuery({ start, text: "" });
    setActive(0);
    requestAnimationFrame(() => {
      const node = fieldRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(start + 1, start + 1);
    });
  };

  const field = (
    <textarea
      ref={fieldRef}
      rows={1}
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        setQuery(mentionAt(value, event.target.selectionStart ?? value.length));
        setActive(0);
      }}
      onKeyDown={(event) => {
        if (query && matches.length > 0) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (index + 1) % matches.length);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index - 1 + matches.length) % matches.length);
            return;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const member = matches[active];
            if (member) choose(member);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setQuery(null);
            return;
          }
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void submit();
        } else if (event.key === "Escape" && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
      className={
        appearance === "inline"
          ? "min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-5 text-[#2c2c2b] outline-none placeholder:text-[#a19e99] dark:text-[#f0efed] dark:placeholder:text-[#7d7a75]"
          : "w-full resize-none bg-transparent py-1 text-[14px] leading-5 text-[#2c2c2b] outline-none placeholder:text-[#a19e99] dark:text-[#f0efed] dark:placeholder:text-[#7d7a75]"
      }
    />
  );

  const mentions = query && matches.length > 0 ? (
    <div className="absolute top-full left-0 z-30 mt-1 max-h-48 w-64 overflow-y-auto rounded-md border border-[#e6e5e3] bg-white py-1 dark:border-[#383836] dark:bg-[#202020]">
      {matches.map((member, index) => (
        <button
          key={member.userId}
          type="button"
          className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[14px] ${
            index === active
              ? "bg-[rgba(33,27,23,0.05)] dark:bg-white/6"
              : "hover:bg-[rgba(33,27,23,0.05)] dark:hover:bg-white/6"
          }`}
          onMouseDown={(event) => {
            event.preventDefault();
            choose(member);
          }}
        >
          <Avatar name={member.name} imageUrl={member.imageUrl} />
          <span className="truncate text-[#2c2c2b] dark:text-[#f0efed]">{member.name}</span>
        </button>
      ))}
    </div>
  ) : null;

  if (appearance === "inline") {
    return (
      <div className="potion-reply-shell relative">
        {field}
        <button type="button" className="potion-reply-icon" aria-label="Mention" onClick={mention}>
          <AtSign className="size-3.5" />
        </button>
        <button
          type="button"
          className="potion-reply-send"
          aria-label="Send reply"
          disabled={saving || !draft.trim()}
          onClick={() => void submit()}
        >
          <ArrowUp className="size-3.5" />
        </button>
        {mentions}
      </div>
    );
  }

  return (
    <div className="relative">
      {field}
      {mentions}
      {draft.trim() || onCancel ? (
        <div className="flex items-center gap-2 pb-1">
          <button
            type="button"
            className="text-[12px] text-[#2c2c2b] hover:underline disabled:opacity-50 dark:text-[#f0efed]"
            disabled={saving || !draft.trim()}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : submitLabel}
          </button>
          {onCancel ? (
            <button type="button" className="text-[12px] text-[#a19e99]" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MentionText({ text, names }: { text: string; names: string[] }) {
  const ranked = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  if (ranked.length === 0) return text;
  const pattern = ranked.map(escapeRegExp).join("|");
  const parts = text.split(new RegExp(`(@(?:${pattern}))(?=$|[\\s.,!?;:])`, "g"));
  return parts.map((part, index) =>
    ranked.some((name) => part === `@${name}`) ? (
      <span key={index} className="text-[#337ea9]">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function Avatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(33,27,23,0.05)] text-[11px] text-[#5f5e59] dark:bg-white/6 dark:text-[#bcbab6]">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        name.trim().slice(0, 1).toLocaleUpperCase() || "?"
      )}
    </span>
  );
}


function mentionAt(value: string, cursor: number) {
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null;
  const text = before.slice(at + 1);
  if (text.includes("\n") || text.length > 80) return null;
  return { start: at, text };
}

function bodyHasMention(body: string, name: string) {
  if (!name) return false;
  const needle = `@${name}`;
  let index = body.indexOf(needle);
  while (index !== -1) {
    const after = body[index + needle.length];
    if (after === undefined || /[\s.,!?;:]/.test(after)) return true;
    index = body.indexOf(needle, index + 1);
  }
  return false;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CARD_WIDTH = 260;
const MARGIN_GAP = 24;
const COLUMN_MAX = 720;
const STACK_GAP = 10;

export type MarginComment = {
  id: string;
  userId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  isRoot: boolean;
  reactionCount: number;
  reacted: boolean;
};

export type MarginThread = {
  id: string;
  anchor: "page" | "text";
  comments: MarginComment[];
};

type Place = { top: number; left: number; width: number };

export function commentAge(timestamp: number, now = Date.now()) {
  const delta = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.max(1, Math.floor(delta / minute))}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CommentMargin({
  threads,
  canWrite,
  userId,
  activeId,
  onActivate,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onReact,
}: {
  threads: MarginThread[];
  canWrite: boolean;
  userId: string;
  activeId: string | null;
  onActivate: (threadId: string | null) => void;
  onReply: (threadId: string, body: string, mentions: string[]) => Promise<void>;
  onEdit: (threadId: string, commentId: string, body: string, mentions: string[]) => Promise<void>;
  onDelete: (threadId: string, commentId: string, isRoot: boolean) => Promise<void>;
  onResolve: (threadId: string) => Promise<void>;
  onReact: (threadId: string, commentId: string) => Promise<void>;
}) {
  const members = useWorkspaceMembers();
  const { user } = useUser();
  const [scroll, setScroll] = useState<HTMLElement | null>(null);
  const [places, setPlaces] = useState<Record<string, Place>>({});
  const [now, setNow] = useState(() => Date.now());
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    setScroll(document.querySelector<HTMLElement>("[data-page-scroll]"));
  }, []);

  const signature = threads
    .map((thread) =>
      `${thread.id}:${thread.anchor}:${thread.comments.map((comment) => `${comment.id}:${comment.updatedAt}:${comment.body.length}`).join(",")}`,
    )
    .join("|");

  useLayoutEffect(() => {
    if (!scroll) return;
    let frame = 0;
    let running = false;
    const measure = () => {
      if (running) return;
      running = true;
      try {
        const next = layoutMargin(scroll, threadsRef.current, cardRefs.current);
        setPlaces((current) => (samePlaces(current, next) ? current : next));
      } finally {
        running = false;
      }
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(scroll);
    const column = scroll.querySelector<HTMLElement>("[data-page-column]");
    const gutter = scroll.querySelector<HTMLElement>("[data-page-gutter]");
    if (column) resize.observe(column);
    if (gutter) resize.observe(gutter);
    for (const card of cardRefs.current.values()) resize.observe(card);
    const mutation = new MutationObserver(schedule);
    if (column) {
      mutation.observe(column, { childList: true, subtree: true, characterData: true });
    }
    scroll.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      scroll.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [scroll, signature]);

  useEffect(() => {
    return () => clearMarginChrome(document.querySelector<HTMLElement>("[data-page-scroll]"));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    cardRefs.current.get(activeId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  if (!scroll || threads.length === 0) return null;

  const self = {
    id: user?.id,
    name: user?.fullName || user?.username || "Member",
    imageUrl: user?.imageUrl ?? null,
  };
  const names = members.map((member) => member.name).filter(Boolean);

  return createPortal(
    <>
      {threads.map((thread) => {
        const place = places[thread.id];
        return (
          <MarginCommentCard
            key={thread.id}
            thread={thread}
            place={place}
            active={activeId === thread.id}
            canWrite={canWrite}
            userId={userId}
            members={members}
            self={self}
            names={names}
            now={now}
            cardRef={(node) => {
              if (node) cardRefs.current.set(thread.id, node);
              else cardRefs.current.delete(thread.id);
            }}
            onActivate={() => onActivate(thread.id)}
            onReply={(body, mentions) => onReply(thread.id, body, mentions)}
            onEdit={(commentId, body, mentions) => onEdit(thread.id, commentId, body, mentions)}
            onDelete={(commentId, isRoot) => onDelete(thread.id, commentId, isRoot)}
            onResolve={() => onResolve(thread.id)}
            onReact={(commentId) => onReact(thread.id, commentId)}
          />
        );
      })}
    </>,
    scroll,
  );
}

export function PageAnchorMargin({
  documentId,
  canWrite,
}: {
  documentId: Id<"documents">;
  canWrite: boolean;
}) {
  const rows = useQuery(api.comments.list, { documentId });
  const session = useQuery(api.documents.session);
  const { user } = useUser();
  const userId = session?.userId ?? user?.id ?? "";
  const reply = useMutation(api.comments.reply);
  const update = useMutation(api.comments.update);
  const remove = useMutation(api.comments.remove);
  const resolve = useMutation(api.comments.resolve);
  const toggleReaction = useMutation(api.comments.toggleReaction);
  const [activeId, setActiveId] = useState<string | null>(null);
  const threads = rows ? unresolvedPageThreads(rows, userId) : [];

  if (!rows || threads.length === 0) return null;

  return (
    <CommentMargin
      threads={threads}
      canWrite={canWrite}
      userId={userId}
      activeId={activeId}
      onActivate={setActiveId}
      onReply={async (threadId, body, mentions) => {
        await reply({ documentId, threadId, body, mentions });
      }}
      onEdit={async (_threadId, commentId, body, mentions) => {
        await update({ documentId, commentId: commentId as Id<"comments">, body, mentions });
      }}
      onDelete={async (_threadId, commentId) => {
        await remove({ documentId, commentId: commentId as Id<"comments"> });
      }}
      onResolve={async (threadId) => {
        await resolve({ documentId, threadId });
      }}
      onReact={async (_threadId, commentId) => {
        await toggleReaction({ documentId, commentId: commentId as Id<"comments">, emoji: REACTION });
      }}
    />
  );
}

function CommentMenu({
  comment,
  isAuthor,
  confirming,
  open,
  onOpenChange,
  onReact,
  onEdit,
  onArmDelete,
  onDelete,
}: {
  comment: MarginComment;
  isAuthor: boolean;
  confirming: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReact: () => void;
  onEdit: () => void;
  onArmDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger className="potion-comment-action" aria-label="More actions">
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem onClick={onReact}>{REACTION} Like</DropdownMenuItem>
        {isAuthor ? <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem> : null}
        {isAuthor ? (
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={confirming}
            onClick={() => {
              if (!confirming) {
                onArmDelete();
                return;
              }
              onDelete();
            }}
          >
            {confirming ? (comment.isRoot ? "Delete thread" : "Delete") : "Delete"}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarginCommentCard({
  thread,
  place,
  active,
  canWrite,
  userId,
  members,
  self,
  names,
  now,
  cardRef,
  onActivate,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onReact,
}: {
  thread: MarginThread;
  place: Place | undefined;
  active: boolean;
  canWrite: boolean;
  userId: string;
  members: CommentMember[];
  self: { id?: string; name: string; imageUrl: string | null };
  names: string[];
  now: number;
  cardRef: (node: HTMLElement | null) => void;
  onActivate: () => void;
  onReply: (body: string, mentions: string[]) => Promise<void>;
  onEdit: (commentId: string, body: string, mentions: string[]) => Promise<void>;
  onDelete: (commentId: string, isRoot: boolean) => Promise<void>;
  onResolve: () => Promise<void>;
  onReact: (commentId: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the comment");
    }
  };
  const root = thread.comments.find((comment) => comment.isRoot) ?? thread.comments[0];

  return (
    <article
      ref={cardRef}
      data-comment-card={thread.id}
      data-active={active ? "true" : "false"}
      data-actions={menuFor ? "open" : undefined}
      aria-label="Comment"
      className="potion-comment-card pointer-events-auto absolute z-20 max-h-80 overflow-y-auto px-3 py-2"
      style={{
        top: place?.top ?? 0,
        left: place?.left ?? 0,
        width: place?.width ?? CARD_WIDTH,
        visibility: place ? "visible" : "hidden",
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onActivate}
    >
      {canWrite && root ? (
        <div className="potion-comment-actions" data-open={menuFor === root.id ? "true" : undefined}>
          <button
            type="button"
            className="potion-comment-action"
            aria-label="Resolve"
            onClick={() => void run(onResolve)}
          >
            <Check className="size-3.5" />
          </button>
          <CommentMenu
            comment={root}
            isAuthor={root.userId === userId && userId !== ""}
            confirming={confirmingId === root.id}
            open={menuFor === root.id}
            onOpenChange={(open) => setMenuFor(open ? root.id : null)}
            onReact={() => void run(() => onReact(root.id))}
            onEdit={() => setEditingId(root.id)}
            onArmDelete={() => setConfirmingId(root.id)}
            onDelete={() => void run(() => onDelete(root.id, root.isRoot))}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {thread.comments.map((comment) => {
          const person = personFor(comment.userId, members, self);
          const isAuthor = comment.userId === userId && userId !== "";
          const edited = comment.updatedAt !== comment.createdAt;
          return (
            <div key={comment.id} className="group/comment relative">
              <div className="flex items-start gap-2">
                <CardAvatar name={person.name} imageUrl={person.imageUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-1.5 pr-14">
                    <span className="truncate text-[14px] leading-5 font-semibold">{person.name}</span>
                    <span className="shrink-0 text-[12px] leading-5 text-[#a19e99] dark:text-[#7d7a75]">
                      {commentAge(comment.createdAt, now)}
                      {edited ? " · Edited" : ""}
                    </span>
                  </div>
                  {editingId === comment.id ? (
                    <CommentComposer
                      placeholder="Edit comment…"
                      members={members}
                      submitLabel="Save"
                      autoFocus
                      initial={comment.body}
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (body, mentions) => {
                        await onEdit(comment.id, body, mentions);
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <p className="text-[14px] leading-5 break-words whitespace-pre-wrap">
                      <MentionText text={comment.body} names={names} />
                    </p>
                  )}
                </div>
              </div>
              {comment.reactionCount > 0 ? (
                <div className="pt-1 pl-7 text-[12px] text-[#a19e99] dark:text-[#7d7a75]">
                  {REACTION} {comment.reactionCount}
                </div>
              ) : null}
              {canWrite && !comment.isRoot ? (
                <div
                  className="potion-comment-actions potion-comment-actions-row"
                  data-open={menuFor === comment.id ? "true" : undefined}
                >
                  <CommentMenu
                    comment={comment}
                    isAuthor={isAuthor}
                    confirming={confirmingId === comment.id}
                    open={menuFor === comment.id}
                    onOpenChange={(open) => setMenuFor(open ? comment.id : null)}
                    onReact={() => void run(() => onReact(comment.id))}
                    onEdit={() => setEditingId(comment.id)}
                    onArmDelete={() => setConfirmingId(comment.id)}
                    onDelete={() => void run(() => onDelete(comment.id, comment.isRoot))}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {canWrite && active ? (
        <div className="potion-comment-compose mt-2 flex items-start gap-2" data-reply>
          <CardAvatar name={self.name || "Member"} imageUrl={self.imageUrl} />
          <CommentComposer
            appearance="inline"
            placeholder="Reply..."
            members={members}
            submitLabel="Reply"
            autoFocus
            onSubmit={async (body, mentions) => {
              await onReply(body, mentions);
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

function CardAvatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e6e5e3] bg-white text-[11px] leading-none font-medium text-[#5f5e59] dark:border-[#383836] dark:bg-[#252525] dark:text-[#bcbab6]">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        name.trim().slice(0, 1).toLocaleUpperCase() || "?"
      )}
    </span>
  );
}

function personFor(
  userId: string,
  members: CommentMember[],
  self: { id?: string; name: string; imageUrl: string | null },
) {
  const member = members.find((item) => item.userId === userId);
  if (member?.name) return { name: member.name, imageUrl: member.imageUrl };
  if (self.id && self.id === userId) return { name: self.name || "Member", imageUrl: self.imageUrl };
  return { name: member?.name || "Member", imageUrl: member?.imageUrl ?? null };
}

function unresolvedPageThreads(rows: CommentRow[], userId: string): MarginThread[] {
  const grouped = new Map<string, CommentRow[]>();
  for (const row of rows) {
    if (row.anchor !== "page") continue;
    const list = grouped.get(row.threadId) ?? [];
    list.push(row);
    grouped.set(row.threadId, list);
  }
  const models: MarginThread[] = [];
  for (const [threadId, list] of grouped) {
    list.sort((a, b) => a.createdAt - b.createdAt);
    const root = list.find((row) => row.replyTo === undefined);
    if (!root || root.resolved) continue;
    models.push({
      id: threadId,
      anchor: "page",
      comments: list.map((row) => {
        const reaction = (row.reactions ?? []).find((item) => item.emoji === REACTION);
        return {
          id: row._id,
          userId: row.userId,
          body: row.body,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          isRoot: row._id === root._id,
          reactionCount: reaction?.userIds.length ?? 0,
          reacted: reaction?.userIds.includes(userId) ?? false,
        };
      }),
    });
  }
  models.sort((a, b) => (a.comments[0]?.createdAt ?? 0) - (b.comments[0]?.createdAt ?? 0));
  return models;
}

function layoutMargin(
  scroll: HTMLElement,
  threads: MarginThread[],
  cards: Map<string, HTMLElement>,
) {
  if (threads.length === 0) {
    clearMarginChrome(scroll);
    return {};
  }
  const client = scroll.clientWidth;
  const needed = CARD_WIDTH + MARGIN_GAP;
  const centeredRoom = (client - COLUMN_MAX) / 2;
  const side = centeredRoom >= needed || client >= COLUMN_MAX + needed;
  const gutterPad = side && centeredRoom < needed ? needed : 0;
  applyGutterPad(scroll, gutterPad);
  if (side) applyBlockPads(scroll, new Map());
  const first = layoutOnce(scroll, threads, cards, side);
  if (!side) applyBlockPads(scroll, first.pads);
  const placed = layoutOnce(scroll, threads, cards, side);
  applyBlockPads(scroll, side ? new Map() : placed.pads);
  return placed.places;
}

function layoutOnce(
  scroll: HTMLElement,
  threads: MarginThread[],
  cards: Map<string, HTMLElement>,
  side: boolean,
) {
  const column = scroll.querySelector<HTMLElement>("[data-page-column]");
  const columnBox = column ? boxOf(column, scroll) : null;
  const width = side
    ? CARD_WIDTH
    : Math.min(CARD_WIDTH, Math.max(200, (columnBox ? columnBox.right - columnBox.left : scroll.clientWidth) - 16));
  let left = side
    ? (columnBox ? columnBox.right + MARGIN_GAP : Math.max(8, scroll.clientWidth - width - 12))
    : (columnBox ? columnBox.left : 8);
  if (side && columnBox) {
    const maxLeft = scroll.clientWidth - width - 4;
    if (maxLeft >= columnBox.right + 12) left = Math.min(left, maxLeft);
  }
  const items = threads.flatMap((thread) => {
    const anchor = locateThread(scroll, thread);
    if (!anchor) return [];
    const height = Math.max(cards.get(thread.id)?.offsetHeight ?? 0, 52);
    return [{ id: thread.id, ...anchor, height }];
  });
  items.sort((a, b) => a.top - b.top || (a.id < b.id ? -1 : 1));
  const pads = new Map<HTMLElement, number>();
  const places: Record<string, Place> = {};
  let cursor = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const blockBox = !side && item.block ? boxOf(item.block, scroll) : null;
    const natural = side ? item.top : (blockBox ? blockBox.bottom + 8 : item.bottom + 8);
    const top = Math.round(Math.max(natural, cursor));
    places[item.id] = { top, left: Math.round(left), width };
    cursor = top + item.height + STACK_GAP;
    if (blockBox && item.block) {
      const pad = top + item.height - blockBox.bottom + 8;
      pads.set(item.block, Math.max(pads.get(item.block) ?? 0, pad));
    }
  }
  return { places, pads };
}

function locateThread(scroll: HTMLElement, thread: MarginThread) {
  const mark = markFor(scroll, thread.id);
  if (mark) {
    const box = boxOf(mark, scroll);
    return { top: box.top, bottom: box.bottom, block: mark.closest<HTMLElement>(".bn-block") };
  }
  if (thread.anchor !== "page") return null;
  const title = scroll.querySelector<HTMLElement>('[aria-label="Page title"]');
  if (!title) return { top: 16, bottom: 48, block: null };
  const box = boxOf(title, scroll);
  return { top: box.top, bottom: box.bottom, block: title };
}

function markFor(scroll: HTMLElement, threadId: string) {
  const marks = scroll.querySelectorAll<HTMLElement>("[data-comment-thread]");
  for (const mark of marks) {
    if (mark.getAttribute("data-comment-thread") === threadId) return mark;
  }
  return null;
}

function boxOf(element: HTMLElement, scroll: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const host = scroll.getBoundingClientRect();
  return {
    top: rect.top - host.top + scroll.scrollTop,
    bottom: rect.bottom - host.top + scroll.scrollTop,
    left: rect.left - host.left + scroll.scrollLeft,
    right: rect.right - host.left + scroll.scrollLeft,
  };
}

function applyGutterPad(scroll: HTMLElement, pad: number) {
  const gutter = scroll.querySelector<HTMLElement>("[data-page-gutter]");
  if (!gutter) return;
  const next = pad > 0 ? `${Math.ceil(pad)}px` : "";
  if (gutter.style.paddingRight !== next) gutter.style.paddingRight = next;
}

function applyBlockPads(scroll: HTMLElement, pads: Map<HTMLElement, number>) {
  scroll.querySelectorAll<HTMLElement>("[data-comment-pad]").forEach((element) => {
    if (pads.has(element)) return;
    element.style.marginBottom = "";
    element.removeAttribute("data-comment-pad");
  });
  for (const [element, pad] of pads) {
    const next = pad > 0 ? `${Math.ceil(pad)}px` : "";
    if (element.style.marginBottom !== next) element.style.marginBottom = next;
    if (pad > 0) element.setAttribute("data-comment-pad", "");
    else element.removeAttribute("data-comment-pad");
  }
}

function clearMarginChrome(scroll: HTMLElement | null) {
  if (!scroll) return;
  applyGutterPad(scroll, 0);
  applyBlockPads(scroll, new Map());
}

function samePlaces(current: Record<string, Place>, next: Record<string, Place>) {
  const currentIds = Object.keys(current);
  const nextIds = Object.keys(next);
  if (currentIds.length !== nextIds.length) return false;
  return nextIds.every((id) => {
    const left = current[id];
    const right = next[id];
    return left && right && left.top === right.top && left.left === right.left && left.width === right.width;
  });
}
