export interface SessionData {
  [key: string]: unknown;
}

export interface SessionMetadata {
  createdAt: number;
  expiresAt: number;
}

export interface StoredSession<T extends SessionData = SessionData> {
  data: T;
  meta: SessionMetadata;
}
