"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { FileText, Folder, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";

import { startButtonClass } from "@/components/workspace/start-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  countOpenTasksDueThisWeek,
  countUpcomingExams,
  courseFolders,
  courseSections,
  courseTitleFor,
  dateInputToLocalMidnight,
  localMidnightToDateInput,
  selectUpcoming,
  termWeekLabel,
} from "@/lib/documents/courses";
import { dueWeekLabel } from "@/lib/documents/due";
import type { PageDoc } from "@/lib/documents/tree";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const pageTitleClass =
  "w-full px-2 text-[40px] leading-[48px] font-bold break-words text-[#2c2c2b] dark:text-[#f0efed]";
const sectionTitleClass = "text-[16px] font-semibold leading-6 text-[#2c2c2b] dark:text-[#f0efed]";
const rowClass = "flex min-h-10 items-center gap-2.5 rounded-[6px] px-2 hover:bg-accent";
const cardClass =
  "rounded-[8px] border border-[#e6e5e3] bg-white px-3 py-2.5 dark:border-[#2f2f2f] dark:bg-[#202020]";
const quietClass = "text-[14px] leading-5 text-[#5f5e59] dark:text-[#bcbab6]";
const metaClass = "text-[12px] leading-4 text-[#a19e99] dark:text-[#7d7a75]";
const dateChipClass =
  "inline-flex h-5 shrink-0 items-center rounded-[4px] bg-[#e6e5e3] px-1.5 text-[12px] leading-none text-[#2c2c2b] dark:bg-white/10 dark:text-[#f0efed]";
const fieldClass =
  "h-8 min-w-0 rounded-md border border-[#e6e5e3] bg-white px-2 text-[14px] text-[#2c2c2b] outline-none placeholder:text-[#a19e99] dark:border-[#383836] dark:bg-[#202020] dark:text-[#f0efed] dark:placeholder:text-[#7d7a75]";

export function StudentHome({ pages }: { pages: PageDoc[] | undefined }) {
  const { isLoaded, user } = useUser();
  const termStart = useQuery(api.documents.termStart);
  const setTermStart = useMutation(api.documents.setTermStart);
  const [now, setNow] = useState<number | null>(null);
  const [savingWeek, setSavingWeek] = useState(false);
  const [weekDraft, setWeekDraft] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const focusAdd = useRef(false);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!focusAdd.current) return;
    focusAdd.current = false;
    nameRef.current?.focus();
  }, [adding, pages]);

  const name = user?.firstName?.trim() || "there";
  const courses = pages ? courseFolders(pages) : [];
  const showAdd = pages !== undefined && (courses.length === 0 || adding);

  const askForCourse = () => {
    if (nameRef.current) {
      nameRef.current.focus();
      return;
    }
    focusAdd.current = true;
    setAdding(true);
  };

  const saveWeek = async (value: string) => {
    const termStartsOn = dateInputToLocalMidnight(value);
    if (termStartsOn === null || savingWeek) return;
    setWeekDraft(value);
    setSavingWeek(true);
    try {
      await setTermStart({ termStartsOn });
    } catch {
      setWeekDraft(null);
      toast.error("Couldn't save week 1");
    } finally {
      setSavingWeek(false);
    }
  };

  return (
    <>
      {now === null || !isLoaded ? (
        <Skeleton className="mx-2 mb-3 h-12 w-72" />
      ) : (
        <h1 className={pageTitleClass}>
          {`${greetingForHour(new Date(now).getHours())}, ${name}`}
        </h1>
      )}

      <div className="mt-3 mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 px-2">
        {termStart === undefined || now === null ? (
          <Skeleton className="h-7 w-44" />
        ) : (
          <Property label="Week">
            <span>{termWeekLabel(termStart, now)}</span>
            <input
              type="date"
              aria-label="Week 1 start"
              value={
                weekDraft ??
                (termStart === null ? "" : localMidnightToDateInput(termStart))
              }
              disabled={savingWeek}
              onChange={(event) => void saveWeek(event.target.value)}
              className="h-7 w-[132px] bg-transparent text-[13px] text-[#5f5e59] outline-none dark:text-[#bcbab6] dark:[color-scheme:dark]"
            />
          </Property>
        )}
        {pages === undefined || now === null ? (
          <Skeleton className="h-7 w-72" />
        ) : (
          <>
            <Property label="Due this week">{countOpenTasksDueThisWeek(pages, now)}</Property>
            <Property label="Courses">{courses.length}</Property>
            <Property label="Upcoming exams">{countUpcomingExams(pages, now)}</Property>
          </>
        )}
      </div>

      <section className="mb-10">
        <div className="mb-1 flex min-h-9 items-center px-2">
          <h2 className={sectionTitleClass}>Your courses</h2>
        </div>
        {pages === undefined ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            {courses.length > 0 ? (
              <ul>
                {courses.map((course) => {
                  const sections = courseSections(pages, course._id);
                  return (
                    <li key={course._id} className="mb-2">
                      <div className={cn(cardClass, "flex min-h-14 items-center gap-2.5")}>
                        {course.icon ? (
                          <span className="shrink-0 text-[18px] leading-none">{course.icon}</span>
                        ) : (
                          <Folder className="size-[18px] shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 truncate text-[16px] leading-6 text-foreground">
                          {course.title || "Untitled"}
                        </span>
                        <span className={cn("shrink-0", metaClass)}>{course.courseCode}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-3 pl-3">
                          <SectionLink page={sections.notes} label="Notes" />
                          <SectionLink page={sections.tasks} label="Tasks" />
                          <SectionLink page={sections.exams} label="Exams" />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {showAdd ? (
              <AddCourseForm
                nameRef={nameRef}
                onDone={() => setAdding(false)}
              />
            ) : (
              <button type="button" onClick={askForCourse} className={cn(rowClass, "w-full text-left", quietClass)}>
                <Plus className="size-[18px] shrink-0" />
                <span className="text-[16px] leading-6">Add a course</span>
              </button>
            )}
          </>
        )}
      </section>

      <section className="mb-10">
        <div className="mb-1 flex min-h-9 items-center justify-between gap-3 px-2">
          <h2 className={sectionTitleClass}>Upcoming</h2>
          {pages === undefined || now === null ? null : (
            <div className="flex items-center gap-2">
              <CalendarLink />
              <NewTask pages={pages} onNeedCourse={askForCourse} />
            </div>
          )}
        </div>
        {pages === undefined || now === null ? (
          <div className="flex flex-col gap-1">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-4/5" />
          </div>
        ) : (
          <Upcoming pages={pages} now={now} />
        )}
      </section>
    </>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="text-[14px] leading-5 text-[#a19e99] dark:text-[#7d7a75]">{label}</span>
      <span className="flex items-center gap-2 text-[14px] leading-5 text-[#2c2c2b] dark:text-[#f0efed]">
        {children}
      </span>
    </div>
  );
}

function CalendarLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/app/calendar")}
      className={cn(quietClass, "rounded-[6px] px-2 py-1 hover:bg-accent hover:text-foreground")}
    >
      View calendar
    </button>
  );
}

function SectionLink({ page, label }: { page: PageDoc | undefined; label: string }) {
  const router = useRouter();
  if (!page) return null;
  return (
    <button
      type="button"
      onClick={() => router.push(`/app/p/${page._id}`)}
      className={cn(quietClass, "hover:text-foreground")}
    >
      {label}
    </button>
  );
}

function AddCourseForm({
  nameRef,
  onDone,
}: {
  nameRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const createCourse = useMutation(api.documents.createCourse);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = title.trim().length > 0 && code.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      await createCourse({ title: title.trim(), courseCode: code.trim() });
      setTitle("");
      setCode("");
      onDone();
    } catch {
      toast.error("Couldn't add course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex min-h-10 flex-wrap items-center gap-2 px-2 py-1">
      <span className="shrink-0 text-[16px] leading-6 text-foreground">Add a course</span>
      <input
        ref={nameRef}
        aria-label="Course name"
        placeholder="Name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className={cn(fieldClass, "flex-1")}
      />
      <input
        aria-label="Course code"
        placeholder="Code"
        value={code}
        spellCheck={false}
        onChange={(event) => setCode(event.target.value)}
        className={cn(fieldClass, "w-24")}
      />
      <button type="submit" disabled={!ready || saving} className={cn(startButtonClass, "shrink-0")}>
        {saving ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

function NewTask({ pages, onNeedCourse }: { pages: PageDoc[]; onNeedCourse: () => void }) {
  const router = useRouter();
  const create = useMutation(api.documents.create);
  const [creating, setCreating] = useState(false);
  const targets = courseFolders(pages).flatMap((course) => {
    const tasks = courseSections(pages, course._id).tasks;
    return tasks ? [{ course, tasksId: tasks._id }] : [];
  });

  const createTask = async (tasksId: PageDoc["_id"]) => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await create({ parentId: tasksId, title: "Untitled", kind: "page" });
      router.push(`/app/p/${id}`);
    } catch {
      toast.error("Couldn't create task");
      setCreating(false);
    }
  };

  if (targets.length === 0) {
    return (
      <button type="button" onClick={onNeedCourse} className={startButtonClass}>
        New task
      </button>
    );
  }

  if (targets.length === 1) {
    const target = targets[0];
    return (
      <button
        type="button"
        disabled={creating}
        onClick={() => void createTask(target.tasksId)}
        className={startButtonClass}
      >
        {creating ? "Creating…" : "New task"}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={creating}
        render={<button type="button" disabled={creating} className={startButtonClass} />}
      >
        {creating ? "Creating…" : "New task"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {targets.map(({ course, tasksId }) => (
          <DropdownMenuItem key={course._id} onClick={() => void createTask(tasksId)}>
            <span className="truncate">{course.title || "Untitled"}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Upcoming({ pages, now }: { pages: PageDoc[]; now: number }) {
  const router = useRouter();
  const setProperties = useMutation(api.documents.setProperties);
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = selectUpcoming(pages, now);

  const markDone = async (page: PageDoc) => {
    if (busyId) return;
    setBusyId(page._id);
    try {
      await setProperties({ id: page._id, status: "done" });
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  const nowItems = items.filter((page) => isSoon(page.dueAt, now));
  const laterItems = items.filter((page) => !isSoon(page.dueAt, now));

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <TaskColumn
        title="Now"
        items={nowItems}
        pages={pages}
        now={now}
        busyId={busyId}
        onOpen={(id) => router.push(`/app/p/${id}`)}
        onDone={(page) => void markDone(page)}
      />
      <TaskColumn
        title="Later"
        items={laterItems}
        pages={pages}
        now={now}
        busyId={busyId}
        onOpen={(id) => router.push(`/app/p/${id}`)}
        onDone={(page) => void markDone(page)}
      />
    </div>
  );
}

function isSoon(dueAt: number | undefined, now: number) {
  if (typeof dueAt !== "number") return false;
  const label = dueWeekLabel(dueAt, now);
  return label === "Overdue" || label === "Today" || label === "Tomorrow";
}

function TaskColumn({
  title,
  items,
  pages,
  now,
  busyId,
  onOpen,
  onDone,
}: {
  title: string;
  items: PageDoc[];
  pages: PageDoc[];
  now: number;
  busyId: string | null;
  onOpen: (id: string) => void;
  onDone: (page: PageDoc) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex h-7 items-center gap-2 px-1">
        <span className="text-[14px] font-medium text-foreground">{title}</span>
        <span className={metaClass}>{items.length}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((page) => {
          const courseName = courseTitleFor(pages, page);
          const taskTitle = page.title || "Untitled";
          return (
            <li key={page._id} className={cardClass}>
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Mark ${taskTitle} done`}
                  disabled={busyId === page._id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDone(page);
                  }}
                  className="mt-1 size-4 shrink-0 rounded-[3px] border border-[#a19e99] disabled:opacity-40 dark:border-[#7d7a75]"
                />
                <button
                  type="button"
                  onClick={() => onOpen(page._id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[15px] leading-6 text-foreground">{taskTitle}</span>
                  {courseName ? <span className={cn("block truncate", metaClass)}>{courseName}</span> : null}
                </button>
              </div>
              {typeof page.dueAt === "number" ? (
                <div className="mt-2 pl-6">
                  <span className={dateChipClass}>{dueWeekLabel(page.dueAt, now)}</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function errorText(error: unknown) {
  if (!(error instanceof Error)) return "Couldn't update this page";
  const message = error.message.split("Uncaught Error: ").pop()?.trim();
  return message || "Couldn't update this page";
}
