/**
 * Minimal Telegram Bot API client (no extra dependencies).
 * TELEGRAM_API_BASE can be overridden for testing with a mock server.
 */
const base = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn(`[telegram] TELEGRAM_BOT_TOKEN not set; skipped ${method}`);
    return null;
  }
  try {
    const res = await fetch(`${base()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      console.error(`[telegram] ${method} failed: ${data.description}`);
      return null;
    }
    return data.result ?? null;
  } catch (err) {
    console.error(`[telegram] ${method} error:`, err);
    return null;
  }
}

export async function sendMessage(chatId: string, text: string, keyboard?: InlineKeyboard) {
  const result = await call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  return result?.message_id ?? null;
}

export async function editMessage(chatId: string, messageId: number, text: string) {
  return call("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" });
}

export async function answerCallback(callbackQueryId: string, text: string) {
  return call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
