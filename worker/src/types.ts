export interface Env {
  CONTENT: R2Bucket;
  GITHUB_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  PUBLIC_SITE_ORIGIN: string;
  DICTIONARY_ORIGIN: string;
  DICTIONARY_GITHUB_REPO: string;
  DICTIONARY_GITHUB_BRANCH: string;
  MEDIA_ORIGIN: string;
}

export interface SyncStatus {
  enabled: true;
  state: "ready" | "synced" | "pending" | "unchanged" | "failed";
  message: string;
  branch: string;
  writingPending: boolean;
}

export interface WritingEntry {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  status: "complete" | "incomplete";
  article?: WritingArticle;
}

export interface WritingArticle {
  url: string;
  sourceHash: string;
}

export interface WritingDraft extends Omit<WritingEntry, "article"> {
  body: string;
  savedAt: string;
  sourceHash: string;
}

export interface JournalImage {
  src: string;
  alt: string;
}

export interface JournalEntry {
  id: string;
  publishedAt: string;
  content: string;
  images: JournalImage[];
  relatedWriting: { id: string; title: string } | null;
  updatedAt?: string;
}

export interface MonthlyNote {
  note: string;
  reportImage: JournalImage | null;
  updatedAt?: string;
}

export type MonthlyPlanSchedule =
  | { type: "daily" }
  | { type: "weekdays"; weekdays: number[] };

export interface MonthlyPlan {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  schedule: MonthlyPlanSchedule;
  completedDates: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface MonthlyPlanState {
  schemaVersion: 1;
  revision: string;
  updatedAt: string;
  plans: MonthlyPlan[];
}

export interface FileChange {
  path: string;
  content: string | Uint8Array | null;
}
