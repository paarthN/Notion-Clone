"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { selectOpenDated, startOfLocalDay } from "@/lib/documents/courses";
import type { PageDoc } from "@/lib/documents/tree";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const navClass =
  "rounded-[6px] px-2 py-1 text-[14px] text-[#5f5e59] hover:bg-accent dark:text-[#bcbab6]";

export default function CalendarPage() {
  const router = useRouter();
  const pages = useQuery(api.documents.list) as PageDoc[] | undefined;
  const [cursor, setCursor] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  const cells = monthCells(cursor.year, cursor.month);
  const today = startOfLocalDay(Date.now());
  const byDay = new Map<number, PageDoc[]>();
  if (pages) {
    for (const item of selectOpenDated(pages)) {
      if (typeof item.dueAt !== "number") continue;
      const key = startOfLocalDay(item.dueAt);
      const list = byDay.get(key);
      if (list) list.push(item);
      else byDay.set(key, [item]);
    }
  }

  const shift = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-12 pt-16 pb-24">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h1 className="min-w-0 px-2 text-[40px] leading-[48px] font-bold break-words text-[#2c2c2b] dark:text-[#f0efed]">
            {title}
          </h1>
          <div className="mb-1 flex shrink-0 items-center">
            <button type="button" onClick={() => shift(-1)} className={navClass}>
              Prev
            </button>
            <button type="button" onClick={() => shift(1)} className={navClass}>
              Next
            </button>
          </div>
        </div>
        {pages === undefined ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="pb-2 pl-1 text-[12px] font-medium text-[#a19e99] dark:text-[#7d7a75]"
              >
                {day}
              </div>
            ))}
            {cells.map((cell) => {
              const items = byDay.get(cell.time) ?? [];
              return (
                <div
                  key={cell.time}
                  className="min-h-[108px] min-w-0 border-t border-[#e6e5e3] px-0.5 py-1.5 dark:border-[#2c2c2b]"
                >
                  <div className={cn("mb-1 flex", !cell.inMonth && "opacity-40")}>
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-[13px] leading-none",
                        cell.time === today
                          ? "bg-[#2c2c2b] font-medium text-white dark:bg-[#f0efed] dark:text-[#191919]"
                          : "text-[#2c2c2b] dark:text-[#f0efed]",
                      )}
                    >
                      {new Date(cell.time).getDate()}
                    </span>
                  </div>
                  {items.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      title={item.title || "Untitled"}
                      onClick={() => router.push(`/app/p/${item._id}`)}
                      className="mt-0.5 block w-full truncate rounded-[4px] px-1 py-0.5 text-left text-[13px] leading-[18px] text-[#2c2c2b] hover:bg-accent dark:text-[#f0efed]"
                    >
                      {item.title || "Untitled"}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function monthCells(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: { time: number; inMonth: boolean }[] = [];
  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      time: new Date(year, month, 1 - (firstWeekday - index)).getTime(),
      inMonth: false,
    });
  }
  for (let day = 1; day <= count; day += 1) {
    cells.push({ time: new Date(year, month, day).getTime(), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = new Date(cells[cells.length - 1].time);
    cells.push({
      time: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime(),
      inMonth: false,
    });
  }
  return cells;
}
