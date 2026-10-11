export async function releaseChanged(releaseId: string | null, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch("/api/public/status", {cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(10000)])});
    if (!response.ok) return false;
    const state: unknown = await response.json();
    return typeof state === "object" && state !== null && "release_id" in state &&
      typeof state.release_id === "string" && state.release_id !== releaseId;
  } catch {
    return false;
  }
}
