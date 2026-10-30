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
