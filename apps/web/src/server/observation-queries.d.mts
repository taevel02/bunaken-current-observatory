export type ObservationRevision = Record<string, unknown> & {
  id: string;
  revision: number;
  record_status: string;
  updated_at: string;
  created_at: string;
  observer_id: string;
  rubric_version: string;
  label_scope: string;
};
export function readObservation(store: unknown, id: string, head: string): Promise<{ revision: ObservationRevision; etag: string } | null>;
export function listObservations(store: unknown, args?: { limit?: number; cursor?: string | null }): Promise<{ items: ObservationRevision[]; next_cursor: string | null; data_commit_sha: string }>;
export function readRequestStatus(store: unknown, requestKeyDigest: string, requestHash?: string | null): Promise<Record<string, unknown> & { found: boolean }>;
