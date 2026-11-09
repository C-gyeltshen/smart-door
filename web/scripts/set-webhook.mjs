/**
 * PRODUCTION: tell Telegram to send updates to your deployed app.
 * Requires APP_URL to be a public https:// address (e.g. your Vercel URL).
 *   npm run telegram:webhook
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN missing");
if (!APP_URL.startsWith("https://")) throw new Error("APP_URL must be a public https:// URL for webhooks");

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${APP_URL}/api/telegram/webhook`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  }),
}).then((r) => r.json());
console.log(res);
