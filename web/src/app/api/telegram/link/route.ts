import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { randomDigits } from "@/lib/crypto";
import { error, json } from "@/lib/http";

/** Create a one-time link code. The owner opens t.me/<bot>?start=<code> to connect. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return error("Not logged in", 401);
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return error("TELEGRAM_BOT_USERNAME is not set on the server", 500);

  const code = randomDigits(8);
  await db
    .update(users)
    .set({ linkCode: code, linkCodeExpires: new Date(Date.now() + 15 * 60 * 1000) })
    .where(eq(users.id, user.id));
  return json({ code, url: `https://t.me/${bot.replace(/^@/, "")}?start=${code}` });
}

/** Disconnect Telegram. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return error("Not logged in", 401);
  await db.update(users).set({ telegramChatId: null, telegramUsername: null }).where(eq(users.id, user.id));
  return json({ ok: true });
}
