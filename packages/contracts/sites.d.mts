export type RegisteredSite = { id: string; slug: string; name_en: string; name_ko: string; lat: number | null; lon: number | null; geometry_status: "unverified" | "coordinates_verified" | "verified" };
export const sites: RegisteredSite[];
export function resolveSiteId(value: unknown): string | null;
