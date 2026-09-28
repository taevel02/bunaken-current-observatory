import { notFound } from "next/navigation";
import { AdminLoginForm } from "@/app/admin/login/login-form";

export default async function LocalizedAdminLogin({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { locale } = await params;
  if (locale !== "ko" && locale !== "en") notFound();
  const query = await searchParams;
  const candidate = query.returnTo ?? `/${locale}/admin`;
  const returnTo = candidate.startsWith(`/${locale}/admin`) && !candidate.startsWith(`/${locale}/admin/login`) ? candidate : `/${locale}/admin`;
  return <AdminLoginForm locale={locale} returnTo={returnTo} />;
}
