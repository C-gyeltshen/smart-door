/**
 * Pretend to be the ESP32 door from your terminal - useful before the hardware is wired.
 *
 *   npm run simulate -- sd_yourDeviceKey
 *
 * It does exactly what the firmware does: "detects" a visitor, shows the
 * challenge number, lets you type it, then asks for the OTP from Telegram.
 */
import readline from "node:readline/promises";

const KEY = process.argv[2] || process.env.DEVICE_KEY;
const BASE = (process.env.SIM_SERVER || "http://localhost:3000").replace(/\/$/, "");
if (!KEY) {
  console.error("Usage: npm run simulate -- <device key from the dashboard>");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("close", () => { console.log("\nBye"); process.exit(0); });
const api = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
};
const oled = (...lines) => console.log(`\n┌──────── OLED ────────┐\n${lines.map((l) => "  " + l).join("\n")}\n└──────────────────────┘`);

const hb = await api("/api/device/heartbeat");
console.log(`Connected as door "${hb.name}"`);

for (;;) {
  await rl.question("\n[Press Enter to simulate a person walking up to the door] ");
  const s = await api("/api/device/session/start");
  oled("Welcome!", `Type this number: ${s.challenge}`, "then press #");

  let stage = "challenge";
  while (stage === "challenge") {
    const code = (await rl.question("keypad> ")).trim();
    const r = await api("/api/device/session/challenge", { sessionId: s.sessionId, code });
    if (r.result === "otp_sent") { oled("Owner notified.", "Enter the OTP", "from Telegram:"); stage = "otp"; }
    else if (r.result === "wrong") oled("Wrong number", `${r.attemptsLeft} tries left`);
    else { oled(`Stopped: ${r.result}`); stage = "done"; }
  }
  while (stage === "otp") {
    const otp = (await rl.question("keypad> ")).trim();
    const r = await api("/api/device/session/otp", { sessionId: s.sessionId, otp });
    if (r.result === "granted") { oled("ACCESS GRANTED", `Door open ${r.unlockSeconds}s`); stage = "done"; }
    else if (r.result === "wrong") oled("Wrong OTP", `${r.attemptsLeft} tries left`);
    else { oled(`Stopped: ${r.result}`); stage = "done"; }
  }
}
