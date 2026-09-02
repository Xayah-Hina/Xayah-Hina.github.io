export interface Env {
  CONTENT: R2Bucket;
  GITHUB_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_KEY?: string;
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

export interface TaskSession {
  id: string;
  taskId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  plan: string;
  outcome: string;
  state: "scheduled" | "done" | "partial" | "no_progress";
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
  schemaVersion: 5;
  revision: string;
  updatedAt: string;
  projects: TaskProject[];
  tasks: TaskItem[];
  sessions: TaskSession[];
  contributions: TaskContribution[];
}

export interface GoogleCalendarEventLink {
  googleUpdatedAt: string;
  taskUpdatedAt: string;
}

export interface GoogleCalendarConnection {
  schemaVersion: 1;
  calendarId: string;
  refreshTokenCiphertext: string;
  refreshTokenIv: string;
  syncToken?: string;
  links: Record<string, GoogleCalendarEventLink>;
  connectedAt: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface GoogleOAuthState {
  schemaVersion: 1;
  value: string;
  expiresAt: string;
}

export interface FileChange {
  path: string;
  content: string | Uint8Array | null;
}
