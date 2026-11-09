/**
 * Telegram bot behaviour.
 *
 * Commands:
 *   /start <code>  - link this Telegram chat to a web account (from the dashboard button)
 *   /status        - list your doors and whether they are online
 *   /open          - remotely open one of your doors
 *   /unlink        - stop receiving notifications here
 * Buttons:
 *   deny:<sessionId>  - cancel an OTP someone is waiting for
 *   open:<deviceId>   - remote unlock
 */
import { and, eq, gt } from "drizzle-orm";
import { db, devices, users } from "@/db";
import { config } from "./config";
import { denySession, logEvent } from "./door";
import { answerCallback, escapeHtml, sendMessage } from "./telegram";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { username?: string; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
    from: { id: number };
  };
};

const HELP =
  "🚪 <b>Smart Door bot</b>\n\n" +
  "/status – your doors and whether they are online\n" +
  "/open – open a door remotely\n" +
  "/unlink – stop notifications in this chat\n\n" +
  "When someone passes the door's number check, I'll send you a 4-digit OTP here.";

async function ownerByChat(chatId: string) {
  return (await db.query.users.findFirst({ where: eq(users.telegramChatId, chatId) })) ?? null;
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);

  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const [command, arg] = msg.text.trim().split(/\s+/, 2);
  const cmd = command.toLowerCase().replace(/@.*$/, "");

  if (cmd === "/start") {
    if (!arg) {
      const owner = await ownerByChat(chatId);
      return sendMessage(
        chatId,
        owner
          ? `Hi ${escapeHtml(owner.name)}! This chat is connected.\n\n${HELP}`
          : "👋 To connect, log in to the Smart Door web app and press <b>Connect Telegram</b>."
      );
    }
    const user = await db.query.users.findFirst({
      where: and(eq(users.linkCode, arg), gt(users.linkCodeExpires, new Date())),
    });
    if (!user) return sendMessage(chatId, "❌ This link has expired. Press <b>Connect Telegram</b> on the dashboard again.");

    // A chat can belong to only one account
    await db.update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
    await db
      .update(users)
      .set({
        telegramChatId: chatId,
        telegramUsername: msg.from?.username ?? msg.from?.first_name ?? null,
        linkCode: null,
        linkCodeExpires: null,
      })
      .where(eq(users.id, user.id));
    return sendMessage(chatId, `✅ Connected! Hi ${escapeHtml(user.name)}, door OTPs and alerts will arrive here.\n\n${HELP}`);
  }

  const owner = await ownerByChat(chatId);
  if (!owner) {
    return sendMessage(chatId, "This chat isn't connected yet. Log in to the web app and press <b>Connect Telegram</b>.");
  }

  if (cmd === "/status") {
    const list = await db.query.devices.findMany({ where: eq(devices.ownerId, owner.id) });
    if (!list.length) return sendMessage(chatId, "You haven't added any doors yet.");
    const lines = list.map((d) => {
      const online = d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < config.onlineWindowMs;
      return `${online ? "🟢" : "🔴"} <b>${escapeHtml(d.name)}</b>${d.location ? ` – ${escapeHtml(d.location)}` : ""}`;
    });
    return sendMessage(chatId, `<b>Your doors</b>\n${lines.join("\n")}`);
  }

  if (cmd === "/open") {
    const list = await db.query.devices.findMany({ where: eq(devices.ownerId, owner.id) });
    if (!list.length) return sendMessage(chatId, "You haven't added any doors yet.");
    return sendMessage(chatId, "Which door should I open?", {
      inline_keyboard: list.map((d) => [{ text: `🔓 ${d.name}`, callback_data: `open:${d.id}` }]),
    });
  }

  if (cmd === "/unlink") {
    await db.update(users).set({ telegramChatId: null, telegramUsername: null }).where(eq(users.id, owner.id));
    return sendMessage(chatId, "🔕 Disconnected. You won't receive OTPs here any more.");
  }

  return sendMessage(chatId, HELP);
}

async function handleCallback(cb: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = String(cb.message?.chat.id ?? cb.from.id);
  const [action, id] = (cb.data ?? "").split(":", 2);

  if (action === "deny" && id) {
    const res = await denySession(chatId, id);
    return answerCallback(cb.id, res.text);
  }

  if (action === "open" && id) {
    const owner = await ownerByChat(chatId);
    if (!owner) return answerCallback(cb.id, "Not connected");
    const updated = await db
      .update(devices)
      .set({ pendingCommand: "unlock" })
      .where(and(eq(devices.id, id), eq(devices.ownerId, owner.id)))
      .returning({ name: devices.name });
    if (!updated.length) return answerCallback(cb.id, "Door not found");
    await logEvent(id, "REMOTE_UNLOCK", "Owner unlocked the door from Telegram");
    await answerCallback(cb.id, "Opening…");
    return sendMessage(chatId, `🔓 Unlock sent to <b>${escapeHtml(updated[0].name)}</b>. It opens within a few seconds.`);
  }

  return answerCallback(cb.id, "Unknown action");
}
