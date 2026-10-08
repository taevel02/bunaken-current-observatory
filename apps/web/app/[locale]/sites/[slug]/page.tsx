import { notFound, redirect } from "next/navigation";
import { sites } from "@bunaken/contracts/sites";
import { publicUrl } from "@/src/public/urls";
export default async function LegacySite({params, searchParams}: {params: Promise<{locale: string; slug: string}>; searchParams: Promise<Record<string, string>>}) {
  const {locale, slug} = await params;
  const site = sites.find(row => row.slug === slug);
  if ((locale !== "ko" && locale !== "en") || !site) notFound();
  redirect(publicUrl("", locale, {...await searchParams, site: site.id}));
}
