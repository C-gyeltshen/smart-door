"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function TelegramCard({ connected, username }: { connected: boolean; username: string | null }) {
  const router = useRouter();
  const [link, setLink] = useState<{ url: string; code: string } | null>(null);
  const [err, setErr] = useState("");

  async function connect() {
    setErr("");
    const res = await fetch("/api/telegram/link", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setErr(data.error);
    setLink(data);
    window.open(data.url, "_blank", "noopener");
  }

  async function disconnect() {
    if (!confirm("Stop receiving OTPs on Telegram? Visitors won't be able to get in until you reconnect.")) return;
    await fetch("/api/telegram/link", { method: "DELETE" });
    setLink(null);
    router.refresh();
  }

  return (
    <section className={`card telegram ${connected ? "is-on" : ""}`}>
      <div className="card-head">
        <h2>Telegram</h2>
        <span className={`pill ${connected ? "ok" : "warn"}`}>{connected ? "Connected" : "Not connected"}</span>
      </div>
      {connected ? (
        <>
          <p className="muted">
            OTPs and alerts go to {username ? <b>@{username}</b> : "your Telegram"}. Send <code>/open</code> to the bot to unlock remotely.
          </p>
          <button className="btn ghost small" onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <>
          <p className="muted">Connect Telegram so you receive the OTP when someone is at your door. Without it, nobody can get in.</p>
          <button className="btn primary" onClick={connect}>Connect Telegram</button>
          {link && (
            <p className="small hint">
              Telegram should open and show a <b>Start</b> button – press it. Didn&apos;t open?{" "}
              <a href={link.url} target="_blank" rel="noopener">Open link</a> or send <code>/start {link.code}</code> to the bot.
              This page updates by itself once connected.
            </p>
          )}
        </>
      )}
      {err && <p className="error">{err}</p>}
    </section>
  );
}
