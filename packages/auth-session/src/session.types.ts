export interface SessionSchema {
  [key: string]: unknown;
}

export interface SessionData {
  [key: string]: unknown;
}

export interface SessionMetadata {
  createdAt: number;
  expiresAt: number;
}

export interface StoredSession {
  data: SessionSchema;
  meta: SessionMetadata;
}
