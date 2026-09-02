import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localDateTime, roundedCurrentSlot, sessionFragment, weekDates, weekRangeLabel, weekStart } from "../../site/tasks.js";

test("weeks always run Monday through Sunday", () => {
  assert.equal(weekStart("2026-09-02"), "2026-08-31");
  assert.equal(weekStart("2026-09-06"), "2026-08-31");
  assert.deepEqual(weekDates("2026-09-02"), [
    "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
  ]);
});

test("week range labels stay compact across month and year boundaries", () => {
  assert.equal(weekRangeLabel("2026-09-07"), "Sep 7–13, 2026");
  assert.equal(weekRangeLabel("2026-09-02"), "Aug 31 – Sep 6, 2026");
  assert.equal(weekRangeLabel("2026-01-01"), "Dec 29, 2025 – Jan 4, 2026");
});

test("cross-midnight Sessions become two connected day fragments", () => {
  const session = { startsAt: localDateTime("2026-09-02", 23 * 60 + 30), endsAt: localDateTime("2026-09-03", 60) };
  assert.deepEqual(sessionFragment(session, "2026-09-02"), {
    date: "2026-09-02", startMinute: 1410, endMinute: 1440, continuesFromPrevious: false, continuesNext: true,
  });
  assert.deepEqual(sessionFragment(session, "2026-09-03"), {
    date: "2026-09-03", startMinute: 0, endMinute: 60, continuesFromPrevious: true, continuesNext: false,
  });
});

test("default scheduling rounds forward to the next Singapore quarter hour", () => {
  const now = Date.parse("2026-09-02T11:07:00.000Z");
  assert.deepEqual(roundedCurrentSlot(now), { date: "2026-09-02", minute: 19 * 60 + 15 });
});

test("Tasks ships one weekly calendar path with no legacy day controls or Project color input", async () => {
  const source = await readFile(new URL("../../site/tasks.js", import.meta.url), "utf8");
  for (const legacy of ["selectedDate", "dateHeading", '"previous-day"', '"next-day"', "task-calendar-canvas", 'name="color"']) {
    assert.equal(source.includes(legacy), false, `legacy token remains: ${legacy}`);
  }
  for (const current of ["selectedWeekStart", "previous-week", "next-week", "task-week-grid", "This week"]) {
    assert.equal(source.includes(current), true, `weekly token is missing: ${current}`);
  }
  assert.equal(source.includes("schemaVersion: 5"), false);
  assert.equal(source.includes("schemaVersion: 6"), true);
});
