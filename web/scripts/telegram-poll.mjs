/**
 * LOCAL DEVELOPMENT ONLY.
 * Telegram can't reach http://localhost, so instead of a webhook this script
 * asks Telegram for new messages (long polling) and forwards each one to the
 * local Next.js webhook route.
 *
 *   Terminal 1:  npm run dev
 *   Terminal 2:  npm run telegram:poll
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
const LOCAL = process.env.LOCAL_WEBHOOK_URL || "http://localhost:3000/api/telegram/webhook";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

if (!TOKEN || TOKEN.startsWith("123456789:")) {
  console.error("Set TELEGRAM_BOT_TOKEN in .env first (get it from @BotFather).");
  process.exit(1);
}

const tg = (method, body = {}) =>
  fetch(`${API}/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const me = await tg("getMe");
if (!me.ok) {
  console.error("Telegram rejected the token:", me.description);
  process.exit(1);
}
// A bot can't use polling while a webhook is set
await tg("deleteWebhook");
console.log(`Polling as @${me.result.username}, forwarding to ${LOCAL}`);

let offset = 0;
for (;;) {
  try {
    const res = await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
    for (const update of res.result ?? []) {
      offset = update.update_id + 1;
      const text = update.message?.text ?? update.callback_query?.data ?? "";
      console.log(`→ update ${update.update_id}: ${text}`);
      await fetch(LOCAL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
        body: JSON.stringify(update),
      }).catch((e) => console.error("  local app not reachable:", e.message));
    }
  } catch (e) {
    console.error("poll error:", e.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
