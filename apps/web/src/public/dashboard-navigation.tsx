"use client";

import {createContext, useContext, useState, useTransition, type ReactNode} from "react";
import {useRouter} from "next/navigation";

type Navigation = {pendingDay: string | null; navigate: (href: string, day: string) => void};
const NavigationContext = createContext<Navigation | null>(null);

/** Native history remains for Site/model changes; dates require fresh server data. */
export function DashboardNavigation({children}: {children: ReactNode}) {
  const router = useRouter();
  const [requestedDay, setRequestedDay] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const navigate = (href: string, day: string) => {
    setRequestedDay(day);
    startTransition(() => router.push(href));
  };
  return <NavigationContext.Provider value={{pendingDay: pending ? requestedDay : null, navigate}}>{children}</NavigationContext.Provider>;
}

export function useDashboardNavigation() {
  return useContext(NavigationContext);
}
