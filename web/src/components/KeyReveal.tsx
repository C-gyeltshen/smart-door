"use client";
import { useState } from "react";

/** Shows a freshly created device key with the exact lines to paste into config.h. */
export default function KeyReveal({ apiKey, appUrl, onClose }: { apiKey: string; appUrl: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const snippet = `#define SERVER_URL  "${appUrl || "http://YOUR-PC-IP:3000"}"\n#define DEVICE_KEY  "${apiKey}"`;
  return (
    <div className="key-reveal">
      <p className="small"><b>Copy this now</b> – the key is shown only once. Paste it into <code>firmware/SmartDoor/config.h</code>:</p>
      <pre>{snippet}</pre>
      <div className="row gap-sm">
        <button
          className="btn small"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button className="btn ghost small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
