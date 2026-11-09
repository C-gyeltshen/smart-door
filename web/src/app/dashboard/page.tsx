import { desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, devices, events } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import AutoRefresh from "@/components/AutoRefresh";
import TelegramCard from "@/components/TelegramCard";
import AddDevice from "@/components/AddDevice";
import DeviceCard from "@/components/DeviceCard";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

const EVENT_STYLE: Record<string, { icon: string; tone: string }> = {
  PRESENCE: { icon: "👤", tone: "neutral" },
  CHALLENGE_OK: { icon: "🔢", tone: "neutral" },
  CHALLENGE_FAIL: { icon: "🔢", tone: "warn" },
  OTP_SENT: { icon: "📨", tone: "info" },
  OTP_FAIL: { icon: "⚠️", tone: "warn" },
  UNLOCKED: { icon: "🔓", tone: "ok" },
  REMOTE_UNLOCK: { icon: "🔓", tone: "ok" },
  DENIED: { icon: "🚫", tone: "bad" },
  LOCKOUT: { icon: "🚨", tone: "bad" },
  EXPIRED: { icon: "⌛", tone: "neutral" },
  ERROR: { icon: "❗", tone: "bad" },
};

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const myDevices = await db.query.devices.findMany({
    where: eq(devices.ownerId, user.id),
    orderBy: desc(devices.createdAt),
  });
  const ids = myDevices.map((d) => d.id);
  const recent = ids.length
    ? await db.query.events.findMany({
        where: inArray(events.deviceId, ids),
        orderBy: desc(events.createdAt),
        limit: 40,
      })
    : [];
  const nameOf = Object.fromEntries(myDevices.map((d) => [d.id, d.name]));
  const now = Date.now();

  const today = recent.filter((e) => now - e.createdAt.getTime() < 86_400_000);
  const stats = {
    visitors: today.filter((e) => e.type === "PRESENCE").length,
    opened: today.filter((e) => e.type === "UNLOCKED" || e.type === "REMOTE_UNLOCK").length,
    alerts: today.filter((e) => ["OTP_FAIL", "LOCKOUT", "DENIED"].includes(e.type)).length,
  };

  return (
    <main className="dash">
      <AutoRefresh seconds={5} />
      <header className="topbar">
        <div className="row gap-sm">
          <span className="brand-dot" />
          <strong>Smart Door</strong>
        </div>
        <div className="row gap-sm">
          <span className="muted small hide-sm">{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <section className="greeting">
        <h1>Hello, {user.name.split(" ")[0]}</h1>
        <div className="stats">
          <div><b>{stats.visitors}</b><span>visitors today</span></div>
          <div><b>{stats.opened}</b><span>door opens</span></div>
          <div className={stats.alerts ? "alert" : ""}><b>{stats.alerts}</b><span>alerts</span></div>
        </div>
      </section>

      <div className="grid">
        <div className="col">
          <TelegramCard connected={Boolean(user.telegramChatId)} username={user.telegramUsername} />

          <section className="card">
            <div className="card-head">
              <h2>Doors</h2>
              <AddDevice appUrl={process.env.APP_URL ?? ""} />
            </div>
            {myDevices.length === 0 ? (
              <p className="muted">No doors yet. Add one to get the API key for your ESP32.</p>
            ) : (
              <div className="stack">
                {myDevices.map((d) => (
                  <DeviceCard
                    key={d.id}
                    id={d.id}
                    name={d.name}
                    location={d.location}
                    online={Boolean(d.lastSeenAt && now - d.lastSeenAt.getTime() < config.onlineWindowMs)}
                    lastSeen={d.lastSeenAt?.toISOString() ?? null}
                    pending={d.pendingCommand === "unlock"}
                    appUrl={process.env.APP_URL ?? ""}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="card col">
          <div className="card-head"><h2>Activity</h2><span className="muted small">live</span></div>
          {recent.length === 0 ? (
            <p className="muted">Nothing yet. Events from your doors will appear here.</p>
          ) : (
            <ul className="events">
              {recent.map((e) => {
                const s = EVENT_STYLE[e.type] ?? { icon: "•", tone: "neutral" };
                return (
                  <li key={e.id} className={`tone-${s.tone}`}>
                    <span className="ev-icon">{s.icon}</span>
                    <div>
                      <div>{e.message}</div>
                      <div className="muted small">
                        {nameOf[e.deviceId]} · <time suppressHydrationWarning>{e.createdAt.toLocaleString("en-GB", { timeZone: process.env.TZ_DISPLAY || "Asia/Thimphu", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
