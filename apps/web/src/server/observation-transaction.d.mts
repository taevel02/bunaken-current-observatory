export class ObservationStorageError extends Error {
  code: string;
  retryable: boolean;
  status: number;
  constructor(code: string, retryable?: boolean, status?: number);
}

export function createIdempotencyDigest(key: string | null, secret?: string): string;
export function hashCanonicalPayload(value: unknown): string;

export function commitObservationTransaction(args: {
  store: unknown;
  requestKeyDigest: string;
  requestHash: string;
  requestType?: string;
  observationId: string;
  expectedRevision?: number | null;
  revisionDocument: Record<string, unknown>;
  actorAlias: string;
  now?: string;
  createEventId: () => string;
  pause?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}): Promise<{ id: string; revision: number; record_status: string; revision_path: string; commit_sha: string; idempotent_replay: boolean }>;
