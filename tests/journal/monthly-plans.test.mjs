import assert from "node:assert/strict";
import test from "node:test";
import {
  monthBounds,
  planState,
  validateMonthData,
} from "../../site/monthly-plans.js";

function sample(month = "2026-08") {
  return {
    month,
    today: `${month}-13`,
    revision: "a".repeat(32),
    updatedAt: `${month}-13T10:00:00.000Z`,
    plans: [{
      id: "plan-" + "b".repeat(24),
      title: "每天练琴",
      startDate: `${month}-01`,
      endDate: `${month}-31`,
      schedule: { type: "daily" },
      scheduledDates: Array.from({ length: 31 }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
      completedDates: [`${month}-01`, `${month}-02`],
      completed: 2,
      total: 31,
      overallCompleted: 2,
      overallTotal: 31,
    }],
  };
}

test("month bounds support 31-day months and leap years", () => {
  assert.deepEqual(monthBounds("2026-08"), { start: "2026-08-01", end: "2026-08-31", days: 31 });
  assert.deepEqual(monthBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29", days: 29 });
});

test("Monthly Plan projections preserve Chinese titles and derive day states", () => {
  const data = validateMonthData(sample(), "2026-08");
  const plan = data.plans[0];
  assert.equal(plan.title, "每天练琴");
  assert.equal(planState(plan, "2026-08-01", data.today), "done");
  assert.equal(planState(plan, "2026-08-03", data.today), "missed");
  assert.equal(planState(plan, "2026-08-13", data.today), "today");
  assert.equal(planState(plan, "2026-08-14", data.today), "future");
});

test("Monthly Plan validation rejects duplicate ids and off-schedule completions", () => {
  const duplicate = sample();
  duplicate.plans.push(structuredClone(duplicate.plans[0]));
  assert.throws(() => validateMonthData(duplicate, "2026-08"), /duplicate/i);

  const invalid = sample();
  invalid.plans[0].scheduledDates = invalid.plans[0].scheduledDates.filter((date) => date !== "2026-08-02");
  assert.throws(() => validateMonthData(invalid, "2026-08"), /invalid dates/i);
});
