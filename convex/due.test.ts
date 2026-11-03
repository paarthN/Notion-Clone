import { expect, test } from "vitest";

import {
  dueWeekLabel,
  groupDueTasks,
  selectDueTasks,
  type DueCandidate,
} from "../src/lib/documents/due";

const now = new Date(2026, 10, 3, 15, 0, 0).getTime();

function day(offset: number) {
  return new Date(2026, 10, 3 + offset).getTime();
}

function page(
  id: string,
  fields: Partial<DueCandidate> & Pick<DueCandidate, "kind">,
): DueCandidate {
  return {
    _id: id,
    title: fields.title ?? id,
    parentId: fields.parentId ?? null,
    kind: fields.kind,
    status: fields.status,
    dueAt: fields.dueAt,
  };
}

function board(id: string, title = id) {
  return page(id, { kind: "database", title });
}

function task(
  id: string,
  parentId: string,
  dueAt: number,
  title = id,
  status?: DueCandidate["status"],
) {
  return page(id, { kind: "page", parentId, dueAt, title, status });
}

test("overdue task stays in the week list", () => {
  const parent = board("board");
  const late = task("late", parent._id, day(-2), "Late");
  const selected = selectDueTasks([parent, late], now);

  expect(selected.map((item) => item._id)).toEqual(["late"]);
});

test("task due six days out stays", () => {
  const parent = board("board");
  const soon = task("soon", parent._id, day(6), "Soon");
  const selected = selectDueTasks([parent, soon], now);

  expect(selected.map((item) => item._id)).toEqual(["soon"]);
});

test("task due seven days out is excluded", () => {
  const parent = board("board");
  const later = task("later", parent._id, day(7), "Later");
  const selected = selectDueTasks([parent, later], now);

  expect(selected).toEqual([]);
});

test("done task is excluded", () => {
  const parent = board("board");
  const finished = task("finished", parent._id, day(0), "Finished", "done");
  const selected = selectDueTasks([parent, finished], now);

  expect(selected).toEqual([]);
});

test("dated page whose parent is not a database is excluded", () => {
  const parent = page("notes", { kind: "page", title: "Notes" });
  const child = task("child", parent._id, day(1), "Child");
  const selected = selectDueTasks([parent, child], now);

  expect(selected).toEqual([]);
});

test("row whose parent is missing is excluded", () => {
  const orphan = task("orphan", "hidden-board", day(0), "Orphan");
  const selected = selectDueTasks([orphan], now);

  expect(selected).toEqual([]);
});

test("groups follow the earliest task", () => {
  const soon = board("soon", "Alpha");
  const mid = board("mid", "Beta");
  const later = board("later", "Gamma");
  const pages = [
    later,
    mid,
    soon,
    task("far", later._id, day(6), "Far"),
    task("now", soon._id, day(0), "Now"),
    task("late", soon._id, day(-1), "Late"),
    task("tomorrow", mid._id, day(1), "Tomorrow task"),
  ];
  const groups = groupDueTasks(selectDueTasks(pages, now), pages);

  expect(groups.map((group) => group.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  expect(groups[0]?.tasks.map((item) => item.title)).toEqual(["Late", "Now"]);
});

test("cap keeps the 30 soonest", () => {
  const parent = board("board");
  const tasks = Array.from({ length: 31 }, (_, index) =>
    task(`t${index}`, parent._id, day(0) + index, `Task ${index}`),
  );
  const selected = selectDueTasks([parent, ...tasks], now);

  expect(selected.map((item) => item._id)).toEqual(
    Array.from({ length: 30 }, (_, index) => `t${index}`),
  );
});

test("date labels are overdue, today, tomorrow, or a weekday", () => {
  expect(dueWeekLabel(day(-1), now)).toBe("Overdue");
  expect(dueWeekLabel(day(0), now)).toBe("Today");
  expect(dueWeekLabel(day(1), now)).toBe("Tomorrow");
  expect(dueWeekLabel(day(3), now)).toBe("Fri, Nov 6");
});
