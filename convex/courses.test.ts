import { expect, test } from "vitest";

import {
  countOpenTasksDueThisWeek,
  countUpcomingExams,
  courseSections,
  courseTitleFor,
  isCourse,
  selectUpcoming,
  termWeekLabel,
  type CourseCandidate,
  type CourseSection,
} from "../src/lib/documents/courses";

const now = new Date(2026, 10, 3, 15, 0, 0).getTime();
const start = new Date(2026, 10, 3).getTime();

function addDays(time: number, days: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

function doc(
  id: string,
  fields: Partial<CourseCandidate> & Pick<CourseCandidate, "kind">,
): CourseCandidate {
  return {
    _id: id,
    title: fields.title ?? id,
    parentId: fields.parentId ?? null,
    kind: fields.kind,
    status: fields.status,
    dueAt: fields.dueAt,
    courseCode: fields.courseCode,
    section: fields.section,
    position: fields.position,
  };
}

function board(id: string, parentId: string | null = null, section?: CourseSection) {
  return doc(id, { kind: "database", parentId, section, title: id });
}

function row(
  id: string,
  parentId: string,
  dueAt: number,
  status?: CourseCandidate["status"],
) {
  return doc(id, { kind: "page", parentId, dueAt, status, title: id });
}

test("week 1 is the start day", () => {
  expect(termWeekLabel(start, now)).toBe("Week 1");
  expect(termWeekLabel(start, addDays(start, 6))).toBe("Week 1");
});

test("day 7 is week 2", () => {
  expect(termWeekLabel(start, addDays(start, 7))).toBe("Week 2");
});

test("a dated exam is not counted as an ordinary due task", () => {
  const tasks = board("tasks", "course", "tasks");
  const exams = board("exams", "course", "exams");
  const plain = board("plain");
  const task = row("task", tasks._id, start);
  const exam = row("exam", exams._id, start);
  const loose = row("loose", plain._id, start);
  const pages = [tasks, exams, plain, task, exam, loose];

  expect(countOpenTasksDueThisWeek(pages, now)).toBe(2);
  expect(selectUpcoming(pages, now).map((item) => item._id)).toEqual(["exam", "loose", "task"]);
});

test("an exam due today counts as upcoming", () => {
  const exams = board("exams", "course", "exams");
  const exam = row("exam", exams._id, start);
  const pages = [exams, exam];

  expect(selectUpcoming(pages, now).map((item) => item._id)).toEqual(["exam"]);
  expect(countUpcomingExams(pages, now)).toBe(1);
});

test("a done exam does not", () => {
  const exams = board("exams", "course", "exams");
  const exam = row("exam", exams._id, start, "done");
  const pages = [exams, exam];

  expect(selectUpcoming(pages, now)).toEqual([]);
  expect(countUpcomingExams(pages, now)).toBe(0);
});

test("a folder with a course code is a course and one without is not", () => {
  expect(isCourse({ kind: "folder", courseCode: "MATH 20C" })).toBe(true);
  expect(isCourse({ kind: "folder" })).toBe(false);
  expect(isCourse({ kind: "folder", courseCode: "  " })).toBe(false);
  expect(isCourse({ kind: "page", courseCode: "MATH 20C" })).toBe(false);
});

test("renaming a child keeps its section", () => {
  const notes = doc("notes", {
    kind: "page",
    parentId: "course",
    section: "notes",
    title: "Lecture notes",
    position: 0,
  });
  const tasks = doc("tasks", {
    kind: "database",
    parentId: "course",
    section: "tasks",
    title: "Homework",
    position: 1,
  });
  const exams = doc("exams", {
    kind: "database",
    parentId: "course",
    section: "exams",
    title: "Quizzes",
    position: 2,
  });
  const sections = courseSections([notes, tasks, exams], "course");

  expect(sections.notes?._id).toBe("notes");
  expect(sections.tasks?._id).toBe("tasks");
  expect(sections.exams?._id).toBe("exams");
});

test("course name comes from the coded folder", () => {
  const course = doc("course", { kind: "folder", title: "Linear Algebra", courseCode: "MATH 20C" });
  const plain = doc("plain", { kind: "folder", title: "Archive" });
  const tasks = board("tasks", course._id, "tasks");
  const loose = board("loose", plain._id);
  const task = row("task", tasks._id, start);
  const other = row("other", loose._id, start);
  const pages = [course, plain, tasks, loose, task, other];

  expect(courseTitleFor(pages, task)).toBe("Linear Algebra");
  expect(courseTitleFor(pages, other)).toBeNull();
});
