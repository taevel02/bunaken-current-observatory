"use client";

import { FormEvent, useState } from "react";
import { controlClass, primaryButtonClass } from "@/src/ui/form-styles";
import { messages } from "@/i18n/messages";

type Locale = keyof typeof messages;

export function AdminLoginForm({ locale, returnTo = `/${locale}/admin` }: { locale: Locale; returnTo?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = messages[locale];
  const auth = copy.auth;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error(auth.unavailable);
      const { data: csrf } = await csrfResponse.json();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf.csrf_token },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error.message_key === "auth.invalidCredentials" ? auth.invalidCredentials : auth.unavailable);
      }
      window.location.assign(returnTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : auth.unavailable);
    } finally {
      setBusy(false);
    }
  }

  return <main lang={locale} className="mx-auto my-6 box-border grid w-full max-w-md gap-4 px-4 text-base leading-6 text-[#18302d] [font-family:system-ui,sans-serif]">
    <a className="inline-flex min-h-11 items-center text-[#155f53]" href="/ko">Bunaken Current Observatory</a>
    <nav aria-label={copy.language} className="flex gap-4">
      <a className="inline-flex min-h-11 items-center text-[#155f53] aria-[current=page]:font-bold" href="/ko/admin/login" aria-current={locale === "ko" ? "page" : undefined}>한국어</a>
      <a className="inline-flex min-h-11 items-center text-[#155f53] aria-[current=page]:font-bold" href="/en/admin/login" aria-current={locale === "en" ? "page" : undefined}>English</a>
    </nav>
    <h1 className="m-0 text-2xl leading-tight">{auth.loginTitle}</h1>
    <p className="m-0">{auth.loginDescription}</p>
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor="username">{auth.username}</label>
        <input className={controlClass} id="username" name="username" autoComplete="username" required />
      </div>
      <div className="grid gap-2">
        <label htmlFor="password">{auth.password}</label>
        <input className={controlClass} id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? auth.checking : auth.login}
      </button>
      <p className="m-0" aria-live="polite" role="status">{message}</p>
    </form>
  </main>;
}
