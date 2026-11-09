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
  state: "synced" | "unchanged";
  message: string;
  branch: string;
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
  updatedAt?: string;
}

export interface FileChange {
  path: string;
  content: string | Uint8Array | null;
}
