const MAX_PLAIN_TEXT = 20_000;

export function plainTextFromSnapshot(snapshot: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return "";
  }
  const chunks: string[] = [];
  collectText(parsed, chunks);
  return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_PLAIN_TEXT);
}

function collectText(node: unknown, chunks: string[]) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectText(child, chunks);
    }
    return;
  }
  const record = node as { text?: unknown; content?: unknown };
  if (typeof record.text === "string" && record.text.length > 0) {
    chunks.push(record.text);
  }
  if (record.content !== undefined) {
    collectText(record.content, chunks);
  }
}
