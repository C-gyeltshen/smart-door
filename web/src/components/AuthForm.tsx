"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? "Something went wrong");
    router.push("/dashboard");
    router.refresh();
  }

  const isLogin = mode === "login";
  return (
    <main className="auth">
      <form className="card auth-card" onSubmit={onSubmit}>
        <Link href="/" className="muted small">← Smart Door</Link>
        <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
        {!isLogin && (
          <label>Name<input name="name" required autoComplete="name" placeholder="Karma Dorji" /></label>
        )}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>
          Password
          <input name="password" type="password" required minLength={8} autoComplete={isLogin ? "current-password" : "new-password"} />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}</button>
        <p className="muted small">
          {isLogin ? <>No account? <Link href="/register">Register</Link></> : <>Have an account? <Link href="/login">Log in</Link></>}
        </p>
      </form>
    </main>
  );
}
