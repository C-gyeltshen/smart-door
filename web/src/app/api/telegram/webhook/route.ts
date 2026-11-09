import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/bot";
import { error, json } from "@/lib/http";

/**
 * Telegram calls this URL for every message / button press sent to the bot.
 * In local development, `npm run telegram:poll` forwards updates here instead.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return error("Forbidden", 403);
  }
  try {
    await handleTelegramUpdate((await req.json()) as TelegramUpdate);
  } catch (err) {
    console.error("[telegram] failed to handle update", err);
  }
  // Always 200 so Telegram doesn't retry the same update forever.
  return json({ ok: true });
}
