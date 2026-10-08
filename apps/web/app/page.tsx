import { DashboardPage, type DashboardQuery } from "@/src/public/dashboard-page";

export default async function RootPage({searchParams}: {searchParams: Promise<DashboardQuery>}) {
  return <DashboardPage query={await searchParams}/>;
}
