const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const DUE_CAP = 30;

export type DueCandidate = {
  _id: string;
  title: string;
  parentId: string | null;
  kind: "page" | "folder" | "database";
  status?: "not_started" | "in_progress" | "done";
  dueAt?: number;
};

export type DueGroup<T> = {
  boardId: string;
  title: string;
  tasks: T[];
};

function startOfLocalDay(time: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function addLocalDays(time: number, days: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

export function selectDueTasks<T extends DueCandidate>(
  pages: readonly T[] | undefined,
  now: number,
): T[] {
  if (!pages) return [];

  const cutoff = addLocalDays(startOfLocalDay(now), 7);
  const byId = new Map(pages.map((page) => [page._id, page]));

  return pages
    .filter((page) => {
      if (typeof page.dueAt !== "number" || page.dueAt >= cutoff) return false;
      if ((page.status ?? "not_started") === "done") return false;
      if (!page.parentId) return false;
      return byId.get(page.parentId)?.kind === "database";
    })
    .sort((a, b) => a.dueAt! - b.dueAt! || a.title.localeCompare(b.title))
    .slice(0, DUE_CAP);
}

export function groupDueTasks<T extends DueCandidate>(
  tasks: readonly T[],
  pages: readonly T[],
): DueGroup<T>[] {
  const titles = new Map(pages.map((page) => [page._id, page.title]));
  const groups: DueGroup<T>[] = [];
  const byBoard = new Map<string, DueGroup<T>>();

  for (const task of tasks) {
    if (!task.parentId) continue;
    let group = byBoard.get(task.parentId);
    if (!group) {
      group = {
        boardId: task.parentId,
        title: titles.get(task.parentId) ?? "",
        tasks: [],
      };
      byBoard.set(task.parentId, group);
      groups.push(group);
    }
    group.tasks.push(task);
  }

  return groups;
}

export function dueWeekLabel(dueAt: number, now: number) {
  const today = startOfLocalDay(now);
  if (dueAt < today) return "Overdue";
  if (dueAt < addLocalDays(today, 1)) return "Today";
  if (dueAt < addLocalDays(today, 2)) return "Tomorrow";
  const date = new Date(dueAt);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
