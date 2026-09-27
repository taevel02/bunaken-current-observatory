import { notFound } from "next/navigation";
import { messages } from "../../i18n/messages";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "ko" && locale !== "en") notFound();
  const copy = messages[locale];
  return <main lang={locale} style={{ fontFamily: "system-ui", margin: "3rem auto", maxWidth: 720, padding: "0 1rem" }}>
    <p>{copy.project}</p><h1>{copy.title}</h1><p>{copy.description}</p>
    <nav aria-label={copy.language}><a href="/ko">한국어</a> · <a href="/en">English</a></nav>
  </main>;
}
