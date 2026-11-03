const MAX_SEARCH_TEXT = 8_000;

export function documentSearchText(title: string, plainText: string) {
  const heading = title.trim() || "Untitled";
  const body = plainText.trim();
  const combined = body ? `${heading}\n${body}` : heading;
  if (combined.length <= MAX_SEARCH_TEXT) {
    return combined;
  }
  return combined.slice(0, MAX_SEARCH_TEXT);
}
