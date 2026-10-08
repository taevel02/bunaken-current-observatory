import { notFound, redirect } from "next/navigation";
import { publicUrl } from "@/src/public/urls";
export default async function LegacySection({params, searchParams}: {params: Promise<{locale: string; section: string}>; searchParams: Promise<Record<string, string>>}) {
  const {locale, section} = await params;
  if ((locale !== "ko" && locale !== "en") || !["research", "observations", "pci", "methodology", "status"].includes(section)) notFound();
  redirect(publicUrl(section === "observations" ? "" : "/research", locale, await searchParams));
}
