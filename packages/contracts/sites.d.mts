export type RegisteredSite = { id: string; slug: string; name_en: string; name_ko: string; lat: number | null; lon: number | null; reference_depth_m: number | null; geometry_status: "unverified" | "coordinates_verified" | "coordinates_depth_verified" | "reference_geometry" | "verified" };
export const sites: RegisteredSite[];
export function resolveSiteId(value: unknown): string | null;
