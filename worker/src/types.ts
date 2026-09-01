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

export interface JournalRelatedTask {
  id: string;
  code: string;
  title: string;
  project: {
    id: string;
    key: string;
    title: string;
    color: string;
  };
}

export interface JournalEntry {
  id: string;
  publishedAt: string;
  content: string;
  images: JournalImage[];
  relatedWriting: { id: string; title: string } | null;
  relatedTask: JournalRelatedTask | null;
  updatedAt?: string;
}

export interface TaskProject {
  id: string;
  key: string;
  title: string;
  description: string;
  color: string;
  status: "active" | "paused" | "completed";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
}

export interface TaskItem {
  id: string;
  code: string;
  projectId: string;
  title: string;
  objective: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
}

export interface TaskDay {
  id: string;
  taskId: string;
  date: string;
  plan: string;
  outcome: string;
  state: "planned" | "completed" | "partial" | "no_progress";
  position: number;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
}

export interface TaskContribution {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  projectId: string;
  projectKey: string;
  projectTitle: string;
  projectColor: string;
  completedAt: string;
}

export interface TaskState {
  schemaVersion: 4;
  revision: string;
  updatedAt: string;
  projects: TaskProject[];
  tasks: TaskItem[];
  taskDays: TaskDay[];
  contributions: TaskContribution[];
}

export interface FileChange {
  path: string;
  content: string | Uint8Array | null;
}
