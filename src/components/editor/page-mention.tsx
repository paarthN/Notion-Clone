"use client";

import { BlockNoteSchema, defaultInlineContentSpecs, type BlockNoteEditor } from "@blocknote/core";
import {
  createReactInlineContentSpec,
  SuggestionMenuController,
  useBlockNoteEditor,
} from "@blocknote/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

import type { PageDoc } from "@/lib/documents/tree";
import { api } from "../../../convex/_generated/api";

const PageMention = createReactInlineContentSpec(
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
      <PageMentionView
        pageId={props.inlineContent.props.pageId}
        title={props.inlineContent.props.title}
      />
    ),
  },
);

export const editorSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    text: defaultInlineContentSpecs.text,
    link: defaultInlineContentSpecs.link,
    pageMention: PageMention,
  },
});

function PageMentionView({ pageId, title }: { pageId: string; title: string }) {
  const router = useRouter();
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const page = pages?.find((item) => item._id === pageId);
  const label = page?.title || title || "Untitled";
  const href = `/app/p/${pageId}`;

  return (
    <a
      href={href}
      className="page-mention"
      onMouseDown={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        router.push(href);
      }}
    >
      {page?.icon ? <span className="mr-1">{page.icon}</span> : null}
      {label}
    </a>
  );
}

export function PageMentionMenu({ documentId }: { documentId: string }) {
  const editor = useBlockNoteEditor();
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const getItems = useCallback(
    async (query: string) => {
      const needle = query.trim().toLowerCase();
      const matches = (pagesRef.current ?? []).filter((page) => {
        if (page._id === documentId || page.isArchived) return false;
        if (!needle) return true;
        return (page.title || "Untitled").toLowerCase().includes(needle);
      });
      return matches.slice(0, 8).map((page) => ({
        title: page.title || "Untitled",
        size: "small" as const,
        icon: page.icon ? (
          <span className="text-[14px] leading-none">{page.icon}</span>
        ) : undefined,
        onItemClick: () => {
          const mentionEditor = editorRef.current as BlockNoteEditor<
            typeof editorSchema.blockSchema,
            typeof editorSchema.inlineContentSchema,
            typeof editorSchema.styleSchema
          >;
          mentionEditor.insertInlineContent([
            {
              type: "pageMention",
              props: {
                pageId: page._id,
                title: page.title || "Untitled",
              },
            },
            " ",
          ]);
        },
      }));
    },
    [documentId, pages],
  );

  return <SuggestionMenuController triggerCharacter="@" getItems={getItems} />;
}
