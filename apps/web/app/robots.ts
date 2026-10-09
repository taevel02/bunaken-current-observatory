import type { MetadataRoute } from "next";
import { publicOrigin } from "@/src/public/metadata";
export default function robots(): MetadataRoute.Robots {
  return {rules: {userAgent: "*", allow: "/", disallow: ["/admin", "/ko/admin", "/en/admin", "/api/"]}, sitemap: `${publicOrigin}/sitemap.xml`};
}
