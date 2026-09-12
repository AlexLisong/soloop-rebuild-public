import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hashPassword, now, openStore, secret } from "./store.mjs";

const [command, handoff, username = "admin"] = process.argv.slice(2);
if (
  !["provision", "reset-password"].includes(command) ||
  !handoff ||
  !/^[a-z0-9_.-]{3,64}$/.test(username)
) {
  console.error(
    "Usage: node server/admin.mjs provision|reset-password /private/new-login.json [username]",
  );
  process.exit(1);
}
const store = openStore(process.env.SOLOOP_DB || ".data/soloop.db");
try {
  const existing = store.get("SELECT id FROM users WHERE username=?", username);
  if (existing && command === "provision")
    throw new Error(
      "Account exists. Use reset-password explicitly to rotate access.",
    );
  if (!existing && command === "reset-password")
    throw new Error("Account does not exist.");
  const password = secret();
  const hash = await hashPassword(password);
  mkdirSync(dirname(resolve(handoff)), { recursive: true, mode: 0o700 });
  // Fail on an existing handoff file, so recovery never silently overwrites credentials.
  writeFileSync(
    handoff,
    JSON.stringify(
      {
        url: process.env.APP_ORIGIN || "http://localhost:5173",
        username,
        password,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  store.transaction(() => {
    if (existing) {
      store.run(
        "UPDATE users SET password_hash=? WHERE id=?",
        hash,
        existing.id,
      );
      store.run("DELETE FROM sessions WHERE user_id=?", existing.id);
    } else
      store.run(
        "INSERT INTO users VALUES(?,?,?,?)",
        randomUUID(),
        username,
        hash,
        now(),
      );
  });
  console.log(
    `Account ready. Private login details saved to ${resolve(handoff)}.`,
  );
} finally {
  store.close();
}
