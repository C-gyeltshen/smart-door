"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import KeyReveal from "./KeyReveal";

type Props = { id: string; name: string; location: string; online: boolean; lastSeen: string | null; pending: boolean; appUrl: string };

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default function DeviceCard({ id, name, location, online, lastSeen, pending, appUrl }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function act(path: string, method = "POST") {
    setBusy(true);
    const res = await fetch(`/api/devices/${id}${path}`, { method });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    router.refresh();
    return data;
  }

  return (
    <div className="device">
      <div className="device-main">
        <span className={`status-dot ${online ? "on" : ""}`} title={online ? "Online" : "Offline"} />
        <div>
          <div className="device-name">{name}</div>
          <div className="muted small" suppressHydrationWarning>
            {location ? `${location} · ` : ""}{online ? "Online" : `Offline · last seen ${ago(lastSeen)}`}
          </div>
        </div>
      </div>
      <div className="row gap-sm wrap">
        <button className="btn primary small" disabled={busy || pending} onClick={() => act("/unlock")}>
          {pending ? "Unlocking…" : "Remote unlock"}
        </button>
        <details className="menu">
          <summary className="btn ghost small">More</summary>
          <div className="menu-body">
            <button
              className="btn ghost small"
              onClick={async () => {
                if (!confirm("Create a new key? The ESP32 must be re-flashed with it.")) return;
                const d = await act("/rotate-key");
                if (d.apiKey) setNewKey(d.apiKey);
              }}
            >
              New API key
            </button>
            <button
              className="btn ghost small danger"
              onClick={() => confirm(`Delete "${name}" and its history?`) && act("", "DELETE")}
            >
              Delete door
            </button>
          </div>
        </details>
      </div>
      {newKey && <KeyReveal apiKey={newKey} appUrl={appUrl} onClose={() => setNewKey(null)} />}
    </div>
  );
}
