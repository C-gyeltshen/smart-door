"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import KeyReveal from "./KeyReveal";

export default function AddDevice({ appUrl }: { appUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    const data = await res.json();
    if (!res.ok) return setErr(data.error);
    setKey(data.apiKey);
    router.refresh();
  }

  if (!open) return <button className="btn small" onClick={() => setOpen(true)}>+ Add door</button>;

  return (
    <div className="modal-backdrop" onClick={() => !key && setOpen(false)}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>{key ? "Door added" : "Add a door"}</h2>
        {key ? (
          <KeyReveal apiKey={key} appUrl={appUrl} onClose={() => { setKey(null); setOpen(false); }} />
        ) : (
          <form onSubmit={onSubmit} className="stack">
            <label>Name<input name="name" required placeholder="Front Door" maxLength={60} /></label>
            <label>Location <span className="muted">(optional)</span><input name="location" placeholder="Main entrance" maxLength={80} /></label>
            {err && <p className="error">{err}</p>}
            <div className="row gap-sm">
              <button className="btn primary">Create</button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
