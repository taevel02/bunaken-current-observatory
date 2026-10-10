import type { MetadataRoute } from "next";
import { publicMetadata } from "@/src/public/metadata";
export default function sitemap(): MetadataRoute.Sitemap {
  return (["ko", "en"] as const).flatMap(locale => [publicMetadata(locale), publicMetadata(locale, true, "guide"), publicMetadata(locale, true, "technical")].map(metadata => ({url: String(metadata.alternates!.canonical)})));
}
