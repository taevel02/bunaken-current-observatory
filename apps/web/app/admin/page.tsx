import { redirect } from "next/navigation";
import { getAdminAuthConfig } from "../../src/server/admin-config.mjs";
import { getAdminSession } from "../../src/server/admin-session.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!getAdminAuthConfig().enabled || !await getAdminSession()) redirect("/admin/login");
  return <main style={{ fontFamily: "system-ui", margin: "3rem auto", maxWidth: 720, padding: "0 1rem" }}>
    <h1>관리자</h1>
    <p>인증된 관리자 세션</p>
  </main>;
}
