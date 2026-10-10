import { DashboardPage, type DashboardQuery } from "@/src/public/dashboard-page";
import { publicMetadata } from "@/src/public/metadata";

export async function generateMetadata({searchParams}: {searchParams: Promise<DashboardQuery>}) {
  const query = await searchParams;
  return publicMetadata(query.lang === "en" ? "en" : "ko");
}

export default async function RootPage({searchParams}: {searchParams: Promise<DashboardQuery>}) {
  const query = await searchParams;
  return <DashboardPage query={query}/>;
}
