import { createStyleSpec } from "@blocknote/core";

const RESOLVED_PREFIX = "resolved:";

export function threadIdFromMark(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(RESOLVED_PREFIX)) {
    const threadId = value.slice(RESOLVED_PREFIX.length);
    return threadId ? { threadId, resolved: true } : null;
  }
  return { threadId: value, resolved: false };
}

export function commentMarkValue(threadId: string, resolved: boolean) {
  return resolved ? `${RESOLVED_PREFIX}${threadId}` : threadId;
}

export const commentStyle = createStyleSpec(
  {
    type: "comment",
    propSchema: "string",
  },
  {
    render: () => {
      const dom = document.createElement("span");
      return { dom, contentDOM: dom };
    },
  },
);

const markConfig = commentStyle.implementation.mark.config as {
  inclusive?: boolean;
  keepOnSplit?: boolean;
  excludes?: string;
};
markConfig.inclusive = false;
markConfig.keepOnSplit = true;
markConfig.excludes = "";
