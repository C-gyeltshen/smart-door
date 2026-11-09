/*
 * ============================================================================
 *  Smart Door – ESP32 firmware (Arduino IDE)
 * ============================================================================
 *  1. Ultrasonic sensor detects a person          → ask server for a challenge
 *  2. OLED shows a random number, visitor types it → server sends OTP to the
 *                                                    owner's Telegram
 *  3. OTP typed on the keypad                      → server says granted / wrong
 *  4. Granted → MG90S servo turns to unlock, then locks again after a few seconds
 *  Also: owner can "Remote unlock" from the dashboard or Telegram (/open).
 *
 *  Keypad:  0-9 type   |  #  submit  |  *  delete last  |  C  clear  |  D  cancel
 *
 *  Board:     "ESP32 Dev Module"  (Boards Manager → esp32 by Espressif)
 *  Libraries: Adafruit SSD1306, Adafruit GFX Library, Keypad (Mark Stanley),
 *             ArduinoJson (Benoit Blanchon, v7), ESP32Servo (Kevin Harrington)
 *  Settings:  edit config.h
 * ============================================================================
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Keypad.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "config.h"

// ---------------------------------------------------------------- hardware
Adafruit_SSD1306 display(128, 64, &Wire, -1);

const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};
byte rowPins[ROWS] = KEYPAD_ROW_PINS;
byte colPins[COLS] = KEYPAD_COL_PINS;
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ---------------------------------------------------------------- state
enum State { IDLE, CHALLENGE, OTP, UNLOCKED, NOTICE, COOLDOWN };
State state = IDLE;

String sessionId;
String challenge;
String input;
unsigned long stateSince = 0;
unsigned long noticeMs = 0;      // how long a NOTICE stays on screen
unsigned long unlockMs = 5000;   // how long the door stays unlocked
unsigned long lastHeartbeat = 0;
unsigned long lastSensorRead = 0;
unsigned long lastStatusPoll = 0;
int closeReadings = 0;

Servo lockServo;
unsigned long servoMovedAt = 0;
bool servoAttached = false;

// ================================================================ helpers
/** Turn the servo arm to the locked or unlocked position. */
void setLock(bool open) {
  if (!servoAttached) {
    lockServo.attach(PIN_SERVO, 500, 2400);  // MG90S pulse range in µs
    servoAttached = true;
  }
  lockServo.write(open ? SERVO_UNLOCKED_ANGLE : SERVO_LOCKED_ANGLE);
  servoMovedAt = millis();
}

/** Switch the servo off a moment after it has reached its position. */
void servoIdle() {
  if (SERVO_DETACH_MS > 0 && servoAttached && millis() - servoMovedAt > SERVO_DETACH_MS) {
    lockServo.detach();
    servoAttached = false;
  }
}

void beep(int ms) {
  if (PIN_BUZZER < 0) return;  // no buzzer fitted
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}
void beepOk()    { beep(80); delay(60); beep(80); }
void beepError() { beep(400); }

void enter(State s) {
  state = s;
  stateSince = millis();
  input = "";
}

/** Draw a screen: small title, big main text, small footer. */
void screen(const String &title, const String &big, const String &footer = "", uint8_t bigSize = 2) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(title);
  display.drawFastHLine(0, 10, 128, SSD1306_WHITE);
  display.setTextSize(bigSize);
  display.setCursor(0, 18);
  display.println(big);
  if (footer.length()) {
    display.setTextSize(1);
    display.setCursor(0, 56);
    display.print(footer);
  }
  display.display();
}

/** Show a message for a while, then go to cooldown. */
void notice(const String &title, const String &big, unsigned long ms = 3000, const String &footer = "") {
  screen(title, big, footer);
  noticeMs = ms;
  enter(NOTICE);
}

void idleScreen() {
  bool online = WiFi.status() == WL_CONNECTED;
  screen(online ? "Smart Door   online" : "Smart Door  OFFLINE", "Welcome", "Please come closer");
}

String masked(const String &s, bool hide) {
  if (!hide) return s;
  String m;
  for (unsigned i = 0; i < s.length(); i++) m += '*';
  return m;
}

void inputScreen() {
  if (state == CHALLENGE) {
    screen("Type: " + challenge + "  then #", input.length() ? input : "_", "*=del  D=cancel", 3);
  } else {
    screen("Enter OTP from owner", input.length() ? masked(input, true) : "_", "#=OK *=del D=cancel", 3);
  }
}

// ================================================================ sensor
long readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, 25000);  // 25 ms ≈ 4 m max
  if (us == 0) return -1;                              // nothing in range
  return us / 58;
}

// ================================================================ network
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  screen("Smart Door", "Wi-Fi...", WIFI_SSID, 2);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi failed – will retry");
  }
}

/**
 * Call the web app. Returns HTTP status (or <0 on network error) and fills `out`.
 * method: "POST" or "GET". body: JSON string for POST.
 */
int api(const char *method, const String &path, const String &body, JsonDocument &out) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  String url = String(SERVER_URL) + path;
  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure secure;
  if (url.startsWith("https")) {
    // Simplest option for student projects. For real deployments, use
    // secure.setCACert(rootCA) with your host's root certificate instead.
    secure.setInsecure();
    http.begin(secure, url);
  } else {
    http.begin(plain, url);
  }
  http.setTimeout(10000);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_KEY);
  http.addHeader("Content-Type", "application/json");

  int code = strcmp(method, "GET") == 0 ? http.GET() : http.POST(body);
  if (code > 0) {
    String payload = http.getString();
    DeserializationError err = deserializeJson(out, payload);
    if (err) Serial.printf("JSON error on %s: %s\n", path.c_str(), err.c_str());
  } else {
    Serial.printf("HTTP error on %s: %s\n", path.c_str(), http.errorToString(code).c_str());
  }
  http.end();
  return code;
}

void serverError(int code) {
  if (code == 401) notice("Setup error", "Bad key", 5000, "Check DEVICE_KEY");
  else notice("Network error", "Try again", 4000, "Server unreachable");
  beepError();
}

// ================================================================ door actions
void openDoor(unsigned long ms, const String &why) {
  Serial.println("UNLOCK: " + why);
  unlockMs = ms;
  setLock(true);
  beepOk();
  screen("ACCESS GRANTED", "Door open", why);
  enter(UNLOCKED);
}

void startSession() {
  screen("Smart Door", "Hello!", "Please wait...");
  JsonDocument res;
  int code = api("POST", "/api/device/session/start", "{}", res);
  if (code != 200) return serverError(code);
  sessionId = res["sessionId"].as<String>();
  challenge = res["challenge"].as<String>();
  beep(60);
  enter(CHALLENGE);
  inputScreen();
}

void submitChallenge() {
  screen("Checking...", input, "");
  JsonDocument req, res;
  req["sessionId"] = sessionId;
  req["code"] = input;
  String body;
  serializeJson(req, body);
  int code = api("POST", "/api/device/session/challenge", body, res);
  if (code != 200) return serverError(code);

  String result = res["result"].as<String>();
  if (result == "otp_sent") {
    beepOk();
    enter(OTP);
    screen("Owner notified", "Enter OTP", "Ask the owner for it");
    delay(1500);
    inputScreen();
  } else if (result == "wrong") {
    beepError();
    int left = res["attemptsLeft"] | 0;
    screen("Wrong number", "Try again", String(left) + " tries left");
    delay(1500);
    input = "";
    inputScreen();
  } else if (result == "no_telegram") {
    notice("Sorry", "Owner not", 4000, "connected to Telegram");
  } else if (result == "locked") {
    notice("Too many tries", "Locked", 4000);
  } else {
    notice("Session ended", "Timeout", 3000, result);
  }
}

void submitOtp() {
  screen("Verifying...", masked(input, true), "");
  JsonDocument req, res;
  req["sessionId"] = sessionId;
  req["otp"] = input;
  String body;
  serializeJson(req, body);
  int code = api("POST", "/api/device/session/otp", body, res);
  if (code != 200) return serverError(code);

  String result = res["result"].as<String>();
  if (result == "granted") {
    openDoor((res["unlockSeconds"] | 5) * 1000UL, "Welcome!");
  } else if (result == "wrong") {
    beepError();
    int left = res["attemptsLeft"] | 0;
    screen("Wrong OTP", "Try again", String(left) + " tries left");
    delay(1500);
    input = "";
    inputScreen();
  } else if (result == "denied") {
    beepError();
    notice("Owner denied", "No entry", 4000);
  } else if (result == "locked") {
    beepError();
    notice("Too many tries", "Locked", 5000, "Owner alerted");
  } else if (result == "expired") {
    notice("OTP expired", "Timeout", 3000);
  } else {
    notice("Session ended", "Sorry", 3000, result);
  }
}

/** While waiting for the OTP, check if the owner tapped "Deny" in Telegram. */
void pollSessionStatus() {
  if (millis() - lastStatusPoll < 4000) return;
  lastStatusPoll = millis();
  JsonDocument res;
  if (api("GET", "/api/device/session/status?sessionId=" + sessionId, "", res) == 200) {
    String st = res["status"].as<String>();
    if (st == "DENIED") {
      beepError();
      notice("Owner denied", "No entry", 4000);
    }
  }
}

void heartbeat() {
  if (millis() - lastHeartbeat < HEARTBEAT_MS) return;
  lastHeartbeat = millis();
  connectWiFi();
  JsonDocument res;
  int code = api("POST", "/api/device/heartbeat", "{}", res);
  if (code == 401) {
    screen("Setup error", "Bad key", "Check DEVICE_KEY in config.h");
    return;
  }
  if (code == 200 && res["command"] == "unlock") {
    openDoor((res["unlockSeconds"] | 5) * 1000UL, "Remote unlock");
  } else if (state == IDLE) {
    idleScreen();
  }
}

// ================================================================ keypad
void handleKey(char k) {
  if (state != CHALLENGE && state != OTP) return;
  beep(25);
  if (k >= '0' && k <= '9') {
    if (input.length() < 6) input += k;
  } else if (k == '*') {
    if (input.length()) input.remove(input.length() - 1);
  } else if (k == 'C') {
    input = "";
  } else if (k == 'D') {
    notice("Cancelled", "Bye!", 1500);
    return;
  } else if (k == '#') {
    if (input.length() == 0) return;
    if (state == CHALLENGE) submitChallenge();
    else submitOtp();
    return;
  }
  inputScreen();
}

// ================================================================ setup / loop
void setup() {
  Serial.begin(115200);
  ESP32PWM::allocateTimer(0);  // servo uses its own PWM timer
  lockServo.setPeriodHertz(50);
  setLock(false);  // make sure the door is locked at boot
  if (PIN_BUZZER >= 0) {
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);
  }
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  Wire.begin(PIN_SDA, PIN_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED not found – check wiring / OLED_ADDRESS");
  }
  display.clearDisplay();
  display.display();

  connectWiFi();
  enter(IDLE);
  lastHeartbeat = 0;
  heartbeat();
}

void loop() {
  char k = keypad.getKey();
  if (k) handleKey(k);
  servoIdle();

  unsigned long now = millis();
  unsigned long inState = now - stateSince;

  switch (state) {
    case IDLE:
      heartbeat();
      if (state != IDLE) break;  // heartbeat may have triggered remote unlock
      if (now - lastSensorRead >= 150) {
        lastSensorRead = now;
        long cm = readDistanceCm();
        closeReadings = (cm > 0 && cm < PRESENCE_CM) ? closeReadings + 1 : 0;
        if (closeReadings >= PRESENCE_READINGS) {
          closeReadings = 0;
          Serial.printf("Presence detected at %ld cm\n", cm);
          if (WiFi.status() == WL_CONNECTED) startSession();
          else notice("Offline", "No Wi-Fi", 3000);
        }
      }
      break;

    case CHALLENGE:
      if (inState > CHALLENGE_TIMEOUT_MS) notice("Timeout", "Bye!", 2000);
      break;

    case OTP:
      if (inState > OTP_TIMEOUT_MS) notice("OTP timeout", "Bye!", 2000);
      else pollSessionStatus();
      break;

    case UNLOCKED:
      if (inState > unlockMs) {
        setLock(false);
        Serial.println("Locked again");
        notice("Smart Door", "Locked", 1500);
      }
      break;

    case NOTICE:
      if (inState > noticeMs) enter(COOLDOWN);
      break;

    case COOLDOWN:
      if (inState > COOLDOWN_MS) {
        enter(IDLE);
        sessionId = "";
        challenge = "";
        idleScreen();
      }
      break;
  }
}
