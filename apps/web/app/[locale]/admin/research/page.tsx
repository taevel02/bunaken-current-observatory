import { notFound,redirect } from "next/navigation";
import { getAdminAuthConfig } from "@/src/server/admin-config.mjs";
import { getAdminSession } from "@/src/server/admin-session.mjs";
import { ResearchWorkspace } from "@/src/admin/research-workspace";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export default async function ResearchAdmin({params}:{params:Promise<{locale:string}>}) {
  const {locale}=await params;if(locale!=="ko"&&locale!=="en")notFound();
  if(!getAdminAuthConfig().enabled||!await getAdminSession())redirect(`/${locale}/admin/login`);
  return <ResearchWorkspace locale={locale} observerAlias={process.env.PUBLIC_OBSERVER_ID??""}/>;
}
