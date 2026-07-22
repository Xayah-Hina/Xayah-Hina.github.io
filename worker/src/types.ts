export interface Env {
  CONTENT: R2Bucket;
  GITHUB_TOKEN?: string;
  BUILD_CALLBACK_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  PUBLIC_SITE_ORIGIN: string;
  EDITOR_ORIGIN: string;
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
  summary?: string;
  pdf?: WritingPdf;
}

export interface WritingPdf {
  url: string;
  sourceHash: string;
  compiler: string;
}

export interface WritingDraft extends WritingEntry {
  source: string;
  sourceHash: string;
  savedAt: string;
}

export interface BuildStatus {
  id: string;
  jobId: string;
  sourceHash: string;
  state: "queued" | "running" | "succeeded" | "failed";
  log: string;
  createdAt: string;
  finishedAt?: string;
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

export interface FileChange {
  path: string;
  content: string | Uint8Array | null;
}
