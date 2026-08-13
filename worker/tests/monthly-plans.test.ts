import assert from "node:assert/strict";
import test from "node:test";
import {
  monthlyPlansResponse,
  saveMonthlyPlan,
  saveMonthlyPlanCheckIns,
} from "../src/monthly-plans.ts";
import { HttpError, singaporeTimestamp } from "../src/utils.ts";

function dateAfter(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function monthEnd(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

function environment() {
  const objects = new Map<string, { value: string; etag: string }>();
  let version = 0;
  const content = {
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        etag: object.etag,
        async json<T>() { return JSON.parse(object.value) as T; },
      };
    },
    async put(key: string, value: unknown, options: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } } = {}) {
      const current = objects.get(key);
      if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
      if (options.onlyIf?.etagDoesNotMatch === "*" && current) return null;
      version += 1;
      const stored = typeof value === "string" ? value : new TextDecoder().decode(value as Uint8Array);
      const result = { value: stored, etag: `etag-${version}` };
      objects.set(key, result);
      return { etag: result.etag };
    },
    async head() { return null; },
    async list() { return { objects: [], truncated: false }; },
    async delete() {},
  };
  return {
    env: {
      CONTENT: content,
      GITHUB_OWNER: "owner",
      GITHUB_REPO: "repo",
      GITHUB_BRANCH: "master",
      PUBLIC_SITE_ORIGIN: "https://xayah.me",
      DICTIONARY_ORIGIN: "https://dictionary.xayah.me",
      DICTIONARY_GITHUB_REPO: "dictionary",
      DICTIONARY_GITHUB_BRANCH: "master",
      MEDIA_ORIGIN: "https://media.xayah.me",
    } as never,
    objects,
  };
}

test("Monthly Plans create, check in, and expose a public monthly projection", async () => {
  const { env, objects } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const month = today.slice(0, 7);
  const created = await saveMonthlyPlan(env, {
    mode: "create",
    month,
    baseRevision: "0",
    plan: {
      title: "每日练琴",
      startDate: `${month}-01`,
      endDate: monthEnd(month),
      schedule: { type: "daily" },
    },
  });
  assert.equal(created.status, "created");
  assert.equal(created.plans.length, 1);
  assert.equal(created.plans[0].title, "每日练琴");
  assert.equal(created.plans[0].total, Number(monthEnd(month).slice(-2)));
  assert.equal(created.plans[0].completed, 0);
  assert.match(created.revision, /^[a-f0-9]{32}$/);

  const checked = await saveMonthlyPlanCheckIns(env, {
    month,
    baseRevision: created.revision,
    changes: [{ planId: created.plans[0].id, date: today, completed: true }],
  });
  assert.equal(checked.status, "updated");
  assert.deepEqual(checked.plans[0].completedDates, [today]);
  assert.equal(checked.plans[0].completed, 1);
  assert.ok(objects.has("published/monthly-plans/state.json"));
  assert.ok([...objects.keys()].some((key) => key.startsWith("private/monthly-plans/history/")));

  const response = await monthlyPlansResponse(
    env,
    new Request(`https://xayah.me/data/monthly-plans/${month}`),
    month,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  const publicData = await response.json() as typeof checked;
  assert.equal(response.headers.get("etag"), `"${publicData.revision}-${publicData.today}"`);
  assert.equal(publicData.plans[0].title, "每日练琴");
  assert.deepEqual(publicData.plans[0].completedDates, [today]);

  const unchanged = await monthlyPlansResponse(
    env,
    new Request(`https://xayah.me/data/monthly-plans/${month}`, {
      headers: { "If-None-Match": response.headers.get("etag")! },
    }),
    month,
  );
  assert.equal(unchanged.status, 304);

  const weakUnchanged = await monthlyPlansResponse(
    env,
    new Request(`https://xayah.me/data/monthly-plans/${month}`, {
      headers: { "If-None-Match": `W/${response.headers.get("etag")!}` },
    }),
    month,
  );
  assert.equal(weakUnchanged.status, 304);
});

test("Monthly Plans reject stale revisions, future check-ins, and schedule exclusions", async () => {
  const { env } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const month = today.slice(0, 7);
  const endDate = dateAfter(today, 31);
  const created = await saveMonthlyPlan(env, {
    mode: "create",
    month,
    baseRevision: "0",
    plan: {
      title: "Practice piano",
      startDate: today,
      endDate,
      schedule: { type: "daily" },
    },
  });
  const plan = created.plans[0];

  await assert.rejects(
    saveMonthlyPlan(env, {
      mode: "edit",
      month,
      baseRevision: "0",
      plan: { ...plan, title: "Changed" },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );

  await assert.rejects(
    saveMonthlyPlanCheckIns(env, {
      month,
      baseRevision: created.revision,
      changes: [{ planId: plan.id, date: dateAfter(today, 1), completed: true }],
    }),
    (error: unknown) => error instanceof HttpError && error.status === 400 && /Future/i.test(error.message),
  );

  const checked = await saveMonthlyPlanCheckIns(env, {
    month,
    baseRevision: created.revision,
    changes: [{ planId: plan.id, date: today, completed: true }],
  });
  const weekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const excludedWeekday = weekday === 1 ? 2 : 1;
  await assert.rejects(
    saveMonthlyPlan(env, {
      mode: "edit",
      month,
      baseRevision: checked.revision,
      plan: {
        id: plan.id,
        title: plan.title,
        startDate: today,
        endDate,
        schedule: { type: "weekdays", weekdays: [excludedWeekday] },
      },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 409 && /excludes 1/i.test(error.message),
  );
});

test("Monthly Plans calculate weekday-only denominators and archive future dates", async () => {
  const { env } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const month = today.slice(0, 7);
  const weekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const weekdays = [weekday, (weekday % 7) + 1, ((weekday + 1) % 7) + 1].sort((left, right) => left - right);
  const created = await saveMonthlyPlan(env, {
    mode: "create",
    month,
    baseRevision: "0",
    plan: {
      title: "Weekday practice",
      startDate: `${month}-01`,
      endDate: dateAfter(monthEnd(month), 31),
      schedule: { type: "weekdays", weekdays },
    },
  });
  assert.ok(created.plans[0].total >= 12 && created.plans[0].total <= 15);
  assert.ok(created.plans[0].total < Number(monthEnd(month).slice(-2)));

  const archived = await saveMonthlyPlan(env, {
    mode: "archive",
    month,
    baseRevision: created.revision,
    plan: { id: created.plans[0].id },
  });
  assert.equal(archived.status, "archived");
  assert.ok(archived.plans[0].archivedAt);
  assert.ok(archived.plans[0].scheduledDates.every((date) => date <= today));
});

test("an archived plan remains manageable when it has no completed schedule dates", async () => {
  const { env } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const month = today.slice(0, 7);
  const created = await saveMonthlyPlan(env, {
    mode: "create",
    month,
    baseRevision: "0",
    plan: {
      title: "Future practice",
      startDate: dateAfter(today, 1),
      endDate: dateAfter(today, 8),
      schedule: { type: "daily" },
    },
  });
  const archived = await saveMonthlyPlan(env, {
    mode: "archive",
    month,
    baseRevision: created.revision,
    plan: { id: created.plans[0].id },
  });
  assert.equal(archived.plans.length, 1);
  assert.equal(archived.plans[0].total, 0);

  const restored = await saveMonthlyPlan(env, {
    mode: "restore",
    month,
    baseRevision: archived.revision,
    plan: { id: archived.plans[0].id },
  });
  assert.ok(restored.plans[0].total > 0);
});

test("Monthly Plans reject duplicate archive and restore transitions", async () => {
  const { env } = environment();
  const today = singaporeTimestamp().slice(0, 10);
  const month = today.slice(0, 7);
  const created = await saveMonthlyPlan(env, {
    mode: "create",
    month,
    baseRevision: "0",
    plan: { title: "Practice", startDate: today, endDate: dateAfter(today, 7), schedule: { type: "daily" } },
  });
  await assert.rejects(
    saveMonthlyPlan(env, {
      mode: "restore",
      month,
      baseRevision: created.revision,
      plan: { id: created.plans[0].id },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 409 && /not archived/i.test(error.message),
  );
  const archived = await saveMonthlyPlan(env, {
    mode: "archive",
    month,
    baseRevision: created.revision,
    plan: { id: created.plans[0].id },
  });
  await assert.rejects(
    saveMonthlyPlan(env, {
      mode: "archive",
      month,
      baseRevision: archived.revision,
      plan: { id: archived.plans[0].id },
    }),
    (error: unknown) => error instanceof HttpError && error.status === 409 && /already archived/i.test(error.message),
  );
});
