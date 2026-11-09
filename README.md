# Smart Door – IoT door lock with Telegram OTP

An ESP32 door unit + a Next.js web app + a Telegram bot.

```
 Visitor walks up          OLED: "Type 4821"         Correct number
 (ultrasonic < 50 cm) ───▶  keypad entry      ───▶   server generates OTP
                                                            │
                                                            ▼
 Servo unlocks (5 s)   ◀── correct OTP typed ◀──  OTP sent to owner's Telegram
                             wrong OTP ──────────▶  owner gets ⚠️ alert
                             3 wrong   ──────────▶  🚨 lockout + alert
                             owner taps "Deny" ──▶  door shows "No entry"
```

Extra features: remote unlock (dashboard button or `/open` in Telegram), live activity log,
online/offline status per door, multiple doors per owner, per-door API keys you can rotate.

---

## 1. What's in the folder

```
smart-door/
├── firmware/SmartDoor/
│   ├── SmartDoor.ino        ESP32 sketch (open this in Arduino IDE)
│   └── config.h             Wi-Fi, server URL, device key, pins  ← edit this
└── web/                     Next.js 15 app (App Router, TypeScript)
    ├── src/app/             pages + API routes
    │   ├── api/device/...   endpoints the ESP32 calls
    │   ├── api/telegram/... bot webhook + "Connect Telegram"
    │   └── dashboard/       owner dashboard
    ├── src/lib/door.ts      ★ core logic: challenge → OTP → unlock
    ├── src/lib/bot.ts       Telegram commands and buttons
    ├── src/db/schema.ts     database tables (Drizzle ORM, SQLite)
    └── scripts/             telegram-poll, set-webhook, simulate-device
```

---

## 2. Hardware

| Part | Notes |
|---|---|
| ESP32 DevKit V1 (30/38-pin) | Has Wi-Fi. A plain Arduino Uno has no Wi-Fi, so it can't talk to the web app. |
| HC-SR04 ultrasonic sensor | Presence detection |
| 0.96" SSD1306 OLED, I²C (128×64) | Shows messages / the random number |
| 4×4 membrane keypad | Number + OTP entry |
| MG90S servo motor | The lock: its arm swings in front of the door like a latch |
| 1 kΩ + 2 kΩ resistors | Voltage divider for the ultrasonic ECHO pin |
| Breadboard + jumper wires | |
| Cardboard / foam board / MDF | For the model door and frame (see section 2b) |
| Active buzzer *(optional)* | Not needed – the OLED shows all feedback. Add later by setting `PIN_BUZZER` |

### Wiring

| Component pin | ESP32 pin |
|---|---|
| **HC-SR04** VCC | VIN (5 V) |
| HC-SR04 GND | GND |
| HC-SR04 TRIG | GPIO 5 |
| HC-SR04 ECHO | GPIO 18 **through divider**: ECHO → 1 kΩ → GPIO18 → 2 kΩ → GND |
| **OLED** VCC / GND | 3V3 / GND |
| OLED SDA / SCL | GPIO 21 / GPIO 22 |
| **Keypad** R1 R2 R3 R4 | GPIO 13, 4, 14, 27 |
| Keypad C1 C2 C3 C4 | GPIO 26, 25, 33, 32 |
| **MG90S** orange (signal) | GPIO 23 |
| MG90S red (+) | VIN (5 V) |
| MG90S brown (−) | GND |

> ⚠️ The ECHO pin outputs 5 V and the ESP32 is 3.3 V only — always use the divider.
> Keypad pins are listed left → right as they appear on the ribbon connector (R1…R4, C1…C4).
> If keys come out wrong, swap the row/column arrays in `config.h`.
> **Servo power:** VIN gives 5 V straight from the USB cable, which is enough for one MG90S on a
> good USB port or power bank. If the ESP32 restarts or Wi-Fi drops when the servo moves, power
> the servo from a separate 5 V supply (phone charger / power bank / 4×AA) and **connect its
> GND to the ESP32 GND**. Never power the servo from the 3V3 pin.

### 2b. Building the model door

Like most prototype videos, a model door is easiest:

1. Cut a base (~30 × 20 cm) and an upright **frame** wall from cardboard or foam board, with a
   **door** panel (~15 × 22 cm) hinged to the frame with tape or two small hinges.
2. Glue the **servo** to the frame, on the inside, next to the edge of the door that opens
   (the side opposite the hinges). Fit the long single arm on the servo.
3. Upload the sketch once with nothing attached to the arm. At boot the servo goes to
   `SERVO_LOCKED_ANGLE` (0°). With the door closed, press the arm onto the servo so it points
   across the door edge, blocking it, like a bolt.
4. When access is granted the servo turns to `SERVO_UNLOCKED_ANGLE` (90°), the arm swings clear,
   and the door can be pushed open. After `UNLOCK_SECONDS` (5 s) it turns back and locks.
5. Mount the **OLED** and **keypad** on the outside face of the frame, and the **ultrasonic
   sensor** facing outwards at "visitor" height. The ESP32 and breadboard sit behind the frame.

Tip: if the arm swings the wrong way or not far enough, change the two angles in `config.h`
(e.g. `0` and `100`, or swap them) — no rewiring needed.

---

## 3. Create the Telegram bot (2 min)

1. In Telegram, open **@BotFather** → send `/newbot` → pick a name and a username ending in `bot`.
2. Copy the **token** it gives you (looks like `7412345678:AAH...`).
3. Optional: send `/setcommands` to BotFather, choose your bot, and paste:
   ```
   status - Your doors and whether they are online
   open - Open a door remotely
   unlink - Stop notifications in this chat
   ```

---

## 4. Run the web app

Needs **Node.js 20+**.

```bash
cd web
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env`:

```env
AUTH_SECRET="<long random string>"          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TELEGRAM_BOT_TOKEN="7412345678:AAH..."      # from BotFather
TELEGRAM_BOT_USERNAME="YourDoorBot"         # without @
TELEGRAM_WEBHOOK_SECRET="<another random string>"
APP_URL="http://192.168.1.20:3000"          # your PC's LAN IP (see below)
```

Create the database and start:

```bash
npm run db:push        # creates smartdoor.db (run again after changing schema.ts)
npm run dev -- -H 0.0.0.0     # -H 0.0.0.0 lets the ESP32 reach your PC over Wi-Fi
```

In a **second terminal** (local development only — Telegram can't reach `localhost`, so this
script fetches bot messages and passes them to your app):

```bash
npm run telegram:poll
```

Then open http://localhost:3000:

1. **Create account**
2. **Connect Telegram** → Telegram opens → press **Start**. The dashboard shows "Connected".
3. **+ Add door** → name it → copy the two `#define` lines it shows (the key is shown once).

**Find your PC's IP:** Windows `ipconfig` (IPv4 Address) · macOS `ipconfig getifaddr en0` ·
Linux `hostname -I`. The ESP32 and PC must be on the same Wi-Fi. If the ESP32 can't connect,
allow Node.js / port 3000 through your firewall.

---

## 5. Test without hardware (simulator)

Before wiring anything, run the full flow from a terminal:

```bash
npm run simulate -- sd_yourDeviceKeyFromTheDashboard
```

Press Enter ("person walks up") → type the number shown → you receive the OTP on Telegram →
type it → `ACCESS GRANTED`. Try wrong OTPs and the **Deny** button too, and watch the dashboard.

---

## 6. Flash the ESP32 (Arduino IDE)

1. **File → Preferences → Additional Boards Manager URLs:**
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. **Tools → Board → Boards Manager** → install **esp32 by Espressif Systems**.
3. **Sketch → Include Library → Manage Libraries** → install:
   - **Adafruit SSD1306** (accept "install all" so Adafruit GFX comes too)
   - **Keypad** by Mark Stanley, Alexander Brevig
   - **ArduinoJson** by Benoit Blanchon (version 7.x)
   - **ESP32Servo** by Kevin Harrington
4. Open `firmware/SmartDoor/SmartDoor.ino`. Edit the `config.h` tab: Wi-Fi name/password,
   `SERVER_URL` and `DEVICE_KEY` (paste the lines from the dashboard).
5. **Tools → Board → ESP32 Dev Module**, pick the COM port, **Upload**.
   If upload stalls at `Connecting....`, hold the **BOOT** button until it starts.
6. Open **Serial Monitor** at 115200 baud to see what it's doing.

**Keypad:** `0–9` type · `#` submit · `*` delete · `C` clear · `D` cancel

The dashboard shows the door as 🟢 online within a few seconds.

---

## 7. Deploy online (optional, free)

Running on your laptop is fine for a demo. To make it permanent:

1. **Database:** create a free DB at [turso.tech](https://turso.tech) →
   `DATABASE_URL="libsql://<db>.turso.io"`, `DATABASE_AUTH_TOKEN="<token>"` → `npm run db:push`.
   (SQLite files don't persist on Vercel, so you need this step.)
2. **Hosting:** push `web/` to GitHub → import in [vercel.com](https://vercel.com) → add every
   `.env` variable in Project Settings → Environment Variables. Set `APP_URL` to the Vercel URL.
3. **Webhook:** stop `telegram:poll`, then run once locally with the production values in `.env`:
   `npm run telegram:webhook` (should print `"ok": true`).
4. **ESP32:** set `SERVER_URL "https://your-app.vercel.app"` and re-upload.

---

## 8. Device API (what the ESP32 calls)

All requests send `Authorization: Bearer <DEVICE_KEY>`.

| Method & path | Body | Response |
|---|---|---|
| `POST /api/device/heartbeat` | – | `{ command: "unlock" \| null, unlockSeconds, name }` |
| `POST /api/device/session/start` | – | `{ sessionId, challenge: "4821", expiresIn }` |
| `POST /api/device/session/challenge` | `{ sessionId, code }` | `{ result: "otp_sent" }` · `{ result: "wrong", attemptsLeft }` · `locked` · `expired` · `no_telegram` |
| `POST /api/device/session/otp` | `{ sessionId, otp }` | `{ result: "granted", unlockSeconds }` · `{ result: "wrong", attemptsLeft }` · `locked` · `denied` · `expired` |
| `GET /api/device/session/status?sessionId=` | – | `{ status: "OTP_SENT" \| "DENIED" \| ... }` |

---

## 9. Security design (good to explain in your report)

- **Two factors:** the random on-screen number proves a person is physically at the door; the
  OTP proves the owner approved it.
- **OTP never stored in plain text** — it's an HMAC hash; only the owner's Telegram ever sees it.
- **Short-lived:** challenge expires in 60 s, OTP in 120 s; each OTP works **once**.
- **Attempt limits:** 3 wrong numbers or 3 wrong OTPs closes the session; the owner is alerted.
- **Per-device API keys**, stored hashed; rotate from the dashboard if a board is lost.
- **Webhook secret** stops anyone else from faking Telegram button presses.
- **Fail-safe:** the servo is forced to the locked position at boot; network errors never open the door.
- Passwords are bcrypt-hashed; dashboard sessions are signed, httpOnly cookies.

All limits are adjustable in `.env` (`OTP_TTL_SECONDS`, `CHALLENGE_TTL_SECONDS`, `MAX_ATTEMPTS`, `UNLOCK_SECONDS`).

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| OLED blank | Check SDA/SCL; set `OLED_ADDRESS 0x3D` in `config.h` |
| OLED says **Bad key** | `DEVICE_KEY` wrong or rotated — add the door again / New API key |
| **Network error** on OLED | `SERVER_URL` must be your PC's IP (not `localhost`); started with `-H 0.0.0.0`? Firewall? |
| Detects people constantly | Lower `PRESENCE_CM`, raise `PRESENCE_READINGS`; check ECHO divider |
| Never detects | Sensor needs 5 V on VCC; check TRIG/ECHO not swapped |
| "Owner not connected to Telegram" | Press **Connect Telegram** on the dashboard and **Start** in the bot |
| No OTP arrives | Is `npm run telegram:poll` running (local) / webhook set (deployed)? Check the server terminal for `[telegram]` errors |
| Servo turns the wrong way / not far enough | Swap or adjust `SERVO_LOCKED_ANGLE` / `SERVO_UNLOCKED_ANGLE` |
| Servo doesn't move at all | Check orange wire on GPIO 23, red on VIN (not 3V3), brown on GND |
| Servo jitters or buzzes | Normal while holding; it switches off after 0.7 s (`SERVO_DETACH_MS`) |
| ESP32 resets / Wi-Fi drops when the servo moves | Power the servo from a separate 5 V supply, GND shared with the ESP32 |
| Upload fails | Hold BOOT while uploading; try a data-capable USB cable |




<!-- #define SERVER_URL  "http://localhost:3000"
#define DEVICE_KEY  "sd_b982d31275e96b2d74e3d4681f68470fc45d6870bd940743" -->
