import { notFound, redirect } from "next/navigation";
import { publicUrl } from "@/src/public/urls";
export default async function LegacyHome({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<Record<string, string>>}) {
  const {locale} = await params;
  if (locale !== "ko" && locale !== "en") notFound();
  redirect(publicUrl("", locale, await searchParams));
}
