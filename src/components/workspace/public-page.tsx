"use client";

import {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultInlineContentSpecs,
  docToBlocks,
} from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import { createReactInlineContentSpec, useCreateBlockNote } from "@blocknote/react";
import { useQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";

import { commentStyle } from "@/components/editor/comment-style";
import { api } from "../../../convex/_generated/api";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/components/editor/notion-editor.css";

const publicPageMention = createReactInlineContentSpec(
  {
    type: "pageMention",
    propSchema: {
      pageId: { default: "" },
      title: { default: "Untitled" },
    },
    content: "none",
  },
  {
    render: (props) => (
      <span className="page-mention">{props.inlineContent.props.title || "Untitled"}</span>
    ),
  },
);

const publicSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    text: defaultInlineContentSpecs.text,
    link: defaultInlineContentSpecs.link,
    pageMention: publicPageMention,
  },
}).extend({
  styleSpecs: {
    comment: commentStyle,
  },
});

const dictionary = {
  ...en,
  placeholders: {
    ...en.placeholders,
    default: "",
    emptyDocument: "",
  },
};

const TITLE_CLASS =
  "w-full px-2 text-[40px] leading-[48px] font-bold break-words text-[#2c2c2b] dark:text-[#f0efed]";

export function PublicPage({ token }: { token: string }) {
  const page = useQuery(api.prosemirror.publicPage, { token });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (page === undefined) {
    return <p className="p-8 text-sm text-muted-foreground">Opening the page…</p>;
  }
  if (page === null) {
    return (
      <p className="p-8 text-sm text-muted-foreground">This link doesn't open a page.</p>
    );
  }

  const emptyTitle = page.title.trim() === "" || page.title.trim() === "Untitled";

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {page.coverUrl ? (
        <div className="h-[35vh] w-full bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.coverUrl} alt="" className="size-full object-cover" />
        </div>
      ) : null}
      <article className="mx-auto w-full max-w-[720px] px-4 pt-16 pb-24">
        {page.icon ? (
          <div className="px-2 pb-2 text-[40px] leading-none">{page.icon}</div>
        ) : null}
        <h1
          className={
            emptyTitle
              ? "w-full px-2 text-[40px] leading-[48px] font-bold break-words text-[#a19e99] dark:text-[#7d7a75]"
              : TITLE_CLASS
          }
        >
          {emptyTitle ? "Untitled" : page.title}
        </h1>
        {mounted ? <ReadOnlyBody snapshot={page.snapshot} /> : null}
      </article>
    </main>
  );
}

function ReadOnlyBody({ snapshot }: { snapshot: string | null }) {
  const { resolvedTheme } = useTheme();
  const blocks = useMemo(() => blocksFromSnapshot(snapshot), [snapshot]);
  const fallback = blocks ? "" : textFromSnapshot(snapshot);
  const editor = useCreateBlockNote(
    {
      schema: publicSchema,
      dictionary,
      initialContent: blocks,
    },
    [snapshot],
  );

  if (fallback) {
    return (
      <div className="px-2 text-[16px] leading-6 whitespace-pre-wrap text-[#2c2c2b] dark:text-[#f0efed]">
        {fallback}
      </div>
    );
  }

  return (
    <BlockNoteView
      editor={editor}
      editable={false}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      sideMenu={false}
      slashMenu={false}
      formattingToolbar={false}
      linkToolbar={false}
      filePanel={false}
    />
  );
}

function blocksFromSnapshot(snapshot: string | null) {
  if (!snapshot) return undefined;
  try {
    const headless = BlockNoteEditor.create({
      schema: publicSchema,
      _headless: true,
    });
    const pmNode = headless.pmSchema.nodeFromJSON(JSON.parse(snapshot));
    const blocks = docToBlocks(pmNode);
    return blocks.length > 0 ? blocks : undefined;
  } catch {
    return undefined;
  }
}

function textFromSnapshot(snapshot: string | null) {
  if (!snapshot) return "";
  try {
    return textFromPm(JSON.parse(snapshot)).replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}

function textFromPm(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; content?: unknown };
  if (typeof record.text === "string") return record.text;
  if (!Array.isArray(record.content)) return "";
  return record.content
    .map((child) => textFromPm(child))
    .filter(Boolean)
    .join("\n");
}
