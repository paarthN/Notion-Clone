import {
  BlockNoteEditor,
  BlockNoteSchema,
  createInlineContentSpec,
  createStyleSpec,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import type { Schema } from "@tiptap/pm/model";

const pageMention = createInlineContentSpec(
  {
    type: "pageMention",
    propSchema: {
      pageId: { default: "" },
      title: { default: "Untitled" },
    },
    content: "none",
  },
  {
    render: () => {
      throw new Error("Page mention render is client-only");
    },
  },
);

const comment = createStyleSpec(
  {
    type: "comment",
    propSchema: "string",
  },
  {
    render: () => {
      throw new Error("Comment render is client-only");
    },
  },
);

const markConfig = comment.implementation.mark.config as {
  inclusive?: boolean;
  keepOnSplit?: boolean;
  excludes?: string;
};
markConfig.inclusive = false;
markConfig.keepOnSplit = true;
markConfig.excludes = "";

let cached: Schema | undefined;

export function pagePmSchema() {
  if (cached) return cached;
  const blockNoteSchema = BlockNoteSchema.create({
    inlineContentSpecs: {
      text: defaultInlineContentSpecs.text,
      link: defaultInlineContentSpecs.link,
      pageMention,
    },
  }).extend({
    styleSpecs: { comment },
  });
  cached = BlockNoteEditor.create({
    _headless: true,
    schema: blockNoteSchema,
  }).pmSchema;
  return cached;
}
