"use client";

import {createContext, useContext, useEffect, useState, useTransition, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {releaseChanged} from "@/src/public/release-refresh";

export function DashboardReleaseRefresh({releaseId}: {releaseId: string | null}) {
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        if (await releaseChanged(releaseId, controller.signal) && !controller.signal.aborted) router.refresh();
      } finally { checking = false; }
    };
    const timer = window.setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [releaseId, router]);
  return null;
}

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
