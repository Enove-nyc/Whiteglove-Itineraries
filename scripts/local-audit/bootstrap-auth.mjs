// Makes the local app usable as the owner: creates the account, verifies it,
// signs in, opens an admin session, seeds the database from data/*.ts, and
// saves the cookies as a Playwright storageState.
//
// Verification is the awkward step. The account record keeps only a HASH of
// the code (`verificationCodeHash`), and locally no mail is sent, so the code
// itself is unrecoverable. Rather than reimplement the HMAC, this marks the
// record verified directly in the Redis stand-in — which is exactly what
// pressing the emailed link would have amounted to.
//
//   node scripts/local-audit/bootstrap-auth.mjs http://127.0.0.1:3003
import { writeFileSync } from "node:fs";

const APP = process.argv[2] ?? "http://127.0.0.1:3003";
const REDIS = process.argv[3] ?? "http://127.0.0.1:6380";
const EMAIL = process.env.AUDIT_EMAIL ?? "owner@audit.local";
const PASSWORD = process.env.AUDIT_PASSWORD ?? "Audit-local-pass-1!";

const jar = new Map();
function cookiesFrom(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (v === "" || /Max-Age=0/i.test(c)) jar.delete(k);
    else jar.set(k, v);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(path, body) {
  // Origin and Referer matter: the write routes check sameOrigin().
  const res = await fetch(APP + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", origin: APP, referer: `${APP}/`, cookie: cookieHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  cookiesFrom(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text: text.slice(0, 200) };
}
const step = (name, r) => console.log(`${name}: ${r.status} ${JSON.stringify(r.json ?? r.text).slice(0, 150)}`);

const redisGet = async (key) => (await (await fetch(`${REDIS}/get/${encodeURIComponent(key)}`)).json()).result;
const redisSet = (key, value) => fetch(`${REDIS}/set/${encodeURIComponent(key)}`, { method: "POST", body: value });

let r = await api("/api/account/register", { email: EMAIL, password: PASSWORD, name: "Owner" });
step("register", r);

const key = `white-glove:account:${EMAIL}`;
const raw = await redisGet(key);
if (!raw) {
  console.error(`no account at ${key} — is redis-mock.mjs running on ${REDIS}?`);
  process.exit(1);
}
const record = JSON.parse(raw);
if (!record.verifiedAt) {
  delete record.verificationCodeHash;
  delete record.verificationCodeExpiresAt;
  record.verifiedAt = new Date().toISOString();
  await redisSet(key, JSON.stringify(record));
  console.log("verify: marked verified in the store");
}

r = await api("/api/account/login", { email: EMAIL, password: PASSWORD });
step("login", r);
if (r.status !== 200) process.exit(1);

// OWNER_EMAIL must match EMAIL for this to be allowed.
r = await api("/api/admin/session", {});
step("admin session", r);

// reimport: true replaces every built-in record from data/*.ts. Safe here,
// destructive against anything real — never point this at production.
r = await api("/api/admin/db-setup", { reimport: true });
step("db-setup (seed)", r);

const state = {
  cookies: [...jar].map(([name, value]) => ({ name, value, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" })),
  origins: [],
};
writeFileSync(new URL("./auth-state.json", import.meta.url), JSON.stringify(state, null, 2));
console.log("cookies saved to auth-state.json:", [...jar.keys()].join(", "));
