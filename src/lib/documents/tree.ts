import type { Id } from "../../../convex/_generated/dataModel";

export type PageDoc = {
  _id: Id<"documents">;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  parentId: Id<"documents"> | null;
  position: number;
  isArchived: boolean;
  updatedAt: number;
  kind: "page" | "folder";
};

export type PageNode = PageDoc & { children: PageNode[] };

export function buildTree(pages: PageDoc[]): PageNode[] {
  const nodes = new Map<string, PageNode>();
  for (const page of pages) {
    nodes.set(page._id, { ...page, children: [] });
  }

  const roots: PageNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: PageNode[]) => {
    list.sort(
      (a, b) => a.position - b.position || a.title.localeCompare(b.title),
    );
    for (const node of list) {
      sortNodes(node.children);
    }
  };
  sortNodes(roots);
  return roots;
}

export type DropPlacement = "before" | "after" | "inside";

export type DropTarget = {
  id: string;
  placement: DropPlacement;
};

export function isPageWithin(pages: PageDoc[], ancestorId: string, nodeId: string) {
  const byId = new Map(pages.map((page) => [page._id as string, page]));
  let current = byId.get(nodeId);
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current._id)) {
      return false;
    }
    seen.add(current._id);
    if (current._id === ancestorId) {
      return true;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

export function insertionIndex(
  pages: PageDoc[],
  parentId: string | null,
  movingId: string,
  targetId: string,
  placement: "before" | "after",
) {
  const siblings = pages
    .filter((page) => (page.parentId ?? null) === parentId && page._id !== movingId)
    .sort((a, b) => a.position - b.position || (a._id < b._id ? -1 : 1));
  const targetIndex = siblings.findIndex((page) => page._id === targetId);
  if (targetIndex < 0) {
    return siblings.length;
  }
  return placement === "before" ? targetIndex : targetIndex + 1;
}

export function breadcrumbs(pages: PageDoc[], documentId: string) {
  const byId = new Map(pages.map((page) => [page._id, page]));
  const trail: PageDoc[] = [];
  let current = byId.get(documentId as PageDoc["_id"]);
  const seen = new Set<string>();
  while (current && !seen.has(current._id)) {
    seen.add(current._id);
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return trail;
}
