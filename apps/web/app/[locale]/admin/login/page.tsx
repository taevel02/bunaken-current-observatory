import { notFound } from "next/navigation";
import { AdminLoginForm } from "../../../admin/login/login-form";

export default async function LocalizedAdminLogin({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "ko" && locale !== "en") notFound();
  return <AdminLoginForm locale={locale} />;
}
