"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("인증 설정을 사용할 수 없습니다.");
      const { data: csrf } = await csrfResponse.json();
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf.csrf_token },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "아이디 또는 비밀번호를 확인하세요." : "로그인할 수 없습니다. 다시 시도하세요.");
      window.location.assign("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인할 수 없습니다. 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  }

  return <main style={{ fontFamily: "system-ui", margin: "3rem auto", maxWidth: 420, padding: "0 1rem" }}>
    <a href="/ko">Bunaken Current Observatory</a>
    <h1>관리자 로그인</h1>
    <p>관리자 전용 화면. 자격 증명은 서버에서만 확인합니다.</p>
    <form onSubmit={submit}>
      <label htmlFor="username">아이디</label>
      <input id="username" name="username" autoComplete="username" required style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 48, margin: "0.4rem 0 1rem", padding: "0.6rem", fontSize: 16 }} />
      <label htmlFor="password">비밀번호</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 48, margin: "0.4rem 0 1rem", padding: "0.6rem", fontSize: 16 }} />
      <button type="submit" disabled={busy} style={{ minHeight: 48, padding: "0.7rem 1rem", fontSize: 16 }}>
        {busy ? "확인 중…" : "로그인"}
      </button>
      <p aria-live="polite" role="status">{message}</p>
    </form>
  </main>;
}
