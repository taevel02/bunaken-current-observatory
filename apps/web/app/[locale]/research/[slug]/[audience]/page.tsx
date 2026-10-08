import { notFound, redirect } from "next/navigation";
import { publicUrl } from "@/src/public/urls";
export default async function LegacyResearch({params, searchParams}: {params: Promise<{locale: string; slug: string; audience: string}>; searchParams: Promise<Record<string, string>>}) {
  const {locale, slug, audience} = await params;
  if ((locale !== "ko" && locale !== "en") || (audience !== "technical" && audience !== "guide")) notFound();
  redirect(publicUrl("/research", locale, {...await searchParams, slug, audience}));
}
