// ============================================================================
//  Smart Door – your settings. Edit this file before uploading.
// ============================================================================
#pragma once

// ---- Wi-Fi --------------------------------------------------------------
#define WIFI_SSID      "YourWiFiName"
#define WIFI_PASSWORD  "YourWiFiPassword"

// ---- Web app ------------------------------------------------------------
// Local testing:  the IP of the PC running `npm run dev`, e.g. "http://192.168.1.20:3000"
//                 (NOT localhost – localhost would mean the ESP32 itself)
// Deployed:       e.g. "https://smart-door.vercel.app"
#define SERVER_URL  "http://10.2.36.191:3000"

// From the dashboard: Doors → + Add door (shown once)
#define DEVICE_KEY  "sd_b982d31275e96b2d74e3d4681f68470fc45d6870bd940743"

// ---- Behaviour ----------------------------------------------------------
#define PRESENCE_CM          50     // person counts as "at the door" closer than this
#define PRESENCE_READINGS    3      // consecutive close readings needed (filters noise)
#define CHALLENGE_TIMEOUT_MS 60000  // visitor has this long to type the number
#define OTP_TIMEOUT_MS       120000 // and this long to type the OTP
#define COOLDOWN_MS          8000   // pause after a session before detecting again
#define HEARTBEAT_MS         5000   // how often to check in with the server while idle

// ---- Pins (ESP32 DevKit V1) ---------------------------------------------
#define PIN_TRIG    5
#define PIN_ECHO    18   // HC-SR04 ECHO is 5 V → use a voltage divider (see README)
#define PIN_SERVO   23   // MG90S signal wire (orange)
#define PIN_BUZZER  -1   // no buzzer: -1. If you add an active buzzer later, put its pin here (e.g. 19)
#define PIN_SDA     21   // OLED
#define PIN_SCL     22   // OLED

// ---- Servo lock (MG90S) -------------------------------------------------
// Angle of the servo arm when the door is locked / unlocked.
// Test once and adjust: if it turns the wrong way, swap the two numbers.
#define SERVO_LOCKED_ANGLE    0
#define SERVO_UNLOCKED_ANGLE  90
// After moving, the servo is switched off (detached) so it doesn't buzz,
// jitter or drain power while holding still. Set to 0 to keep it powered.
#define SERVO_DETACH_MS       700

// 4x4 keypad, pins left → right on the keypad connector: R1 R2 R3 R4 C1 C2 C3 C4
#define KEYPAD_ROW_PINS { 13, 4, 14, 27 }
#define KEYPAD_COL_PINS { 26, 25, 33, 32 }

#define OLED_ADDRESS 0x3C   // try 0x3D if the screen stays blank
