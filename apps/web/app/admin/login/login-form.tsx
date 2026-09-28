"use client";

import { FormEvent, useState } from "react";
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

  return <main lang={locale} style={{ fontFamily: "system-ui", margin: "3rem auto", maxWidth: 420, padding: "0 1rem" }}>
    <a href="/ko">Bunaken Current Observatory</a>
    <nav aria-label={copy.language} style={{ marginTop: "1rem" }}>
      <a href="/ko/admin/login" aria-current={locale === "ko" ? "page" : undefined}>한국어</a>
      {" · "}
      <a href="/en/admin/login" aria-current={locale === "en" ? "page" : undefined}>English</a>
    </nav>
    <h1>{auth.loginTitle}</h1>
    <p>{auth.loginDescription}</p>
    <form onSubmit={submit}>
      <label htmlFor="username">{auth.username}</label>
      <input id="username" name="username" autoComplete="username" required style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 48, margin: "0.4rem 0 1rem", padding: "0.6rem", fontSize: 16 }} />
      <label htmlFor="password">{auth.password}</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 48, margin: "0.4rem 0 1rem", padding: "0.6rem", fontSize: 16 }} />
      <button type="submit" disabled={busy} style={{ minHeight: 48, padding: "0.7rem 1rem", fontSize: 16 }}>
        {busy ? auth.checking : auth.login}
      </button>
      <p aria-live="polite" role="status">{message}</p>
    </form>
  </main>;
}
