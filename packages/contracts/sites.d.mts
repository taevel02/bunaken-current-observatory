export type RegisteredSite = { id: string; slug: string; name_en: string; name_ko: string; lat: null; lon: null; geometry_status: "unverified" };
export const sites: RegisteredSite[];
export function resolveSiteId(value: unknown): string | null;
