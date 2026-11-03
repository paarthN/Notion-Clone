import { selectDueTasks } from "./due";

export type CourseSection = "notes" | "tasks" | "exams";

export type CourseCandidate = {
  _id: string;
  title: string;
  parentId: string | null;
  kind: "page" | "folder" | "database";
  status?: "not_started" | "in_progress" | "done";
  dueAt?: number;
  courseCode?: string;
  section?: CourseSection;
  position?: number;
};

const UPCOMING_CAP = 8;

export function termWeekLabel(termStartsOn: number | null, now: number) {
  if (termStartsOn === null || !Number.isFinite(termStartsOn)) return "Set week 1";
  const days = localDayNumber(now) - localDayNumber(termStartsOn);
  if (!Number.isFinite(days)) return "Set week 1";
  if (days < 0) return "Before week 1";
  return `Week ${Math.floor(days / 7) + 1}`;
}

export function isCourse<T extends { kind: string; courseCode?: string | null }>(
  page: T,
): page is T & { courseCode: string } {
  return page.kind === "folder" && Boolean(page.courseCode?.trim());
}

export function courseFolders<T extends CourseCandidate>(pages: readonly T[]) {
  return pages
    .filter((page) => isCourse(page))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title));
}

export function courseSections<T extends CourseCandidate>(pages: readonly T[], courseId: string) {
  const found = new Map<CourseSection, T>();
  for (const page of pages) {
    if (page.parentId !== courseId || !page.section) continue;
    const current = found.get(page.section);
    if (!current || (page.position ?? 0) < (current.position ?? 0)) {
      found.set(page.section, page);
    }
  }
  return {
    notes: found.get("notes"),
    tasks: found.get("tasks"),
    exams: found.get("exams"),
  };
}

export function countOpenTasksDueThisWeek<T extends CourseCandidate>(
  pages: readonly T[] | undefined,
  now: number,
) {
  if (!pages) return 0;
  const examBoards = examBoardIds(pages);
  return selectDueTasks(pages, now).filter(
    (page) => page.parentId === null || !examBoards.has(page.parentId),
  ).length;
}

export function countUpcomingExams<T extends CourseCandidate>(
  pages: readonly T[] | undefined,
  now: number,
) {
  if (!pages) return 0;
  const today = startOfLocalDay(now);
  const examBoards = examBoardIds(pages);
  return pages.filter((page) => {
    if (typeof page.dueAt !== "number" || page.dueAt < today) return false;
    if ((page.status ?? "not_started") === "done") return false;
    return page.parentId !== null && examBoards.has(page.parentId);
  }).length;
}

export function selectUpcoming<T extends CourseCandidate>(
  pages: readonly T[] | undefined,
  now: number,
) {
  return selectDueTasks(pages, now).slice(0, UPCOMING_CAP);
}

export function selectOpenDated<T extends CourseCandidate>(pages: readonly T[] | undefined) {
  if (!pages) return [];
  const databases = new Set(
    pages.filter((page) => page.kind === "database").map((page) => page._id),
  );
  return pages
    .filter((page) => {
      if (typeof page.dueAt !== "number") return false;
      if ((page.status ?? "not_started") === "done") return false;
      return page.parentId !== null && databases.has(page.parentId);
    })
    .sort((a, b) => a.dueAt! - b.dueAt! || a.title.localeCompare(b.title));
}

export function courseTitleFor<T extends CourseCandidate>(pages: readonly T[], row: T) {
  const byId = new Map(pages.map((page) => [page._id, page]));
  const database = row.parentId ? byId.get(row.parentId) : undefined;
  if (!database || database.kind !== "database" || !database.parentId) return null;
  const folder = byId.get(database.parentId);
  if (!folder || !isCourse(folder)) return null;
  const title = folder.title.trim();
  return title || "Untitled";
}

export function startOfLocalDay(time: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dateInputToLocalMidnight(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

export function localMidnightToDateInput(time: number) {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function examBoardIds<T extends CourseCandidate>(pages: readonly T[]) {
  return new Set(
    pages
      .filter((page) => page.kind === "database" && page.section === "exams")
      .map((page) => page._id),
  );
}

function localDayNumber(time: number) {
  const date = new Date(time);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
