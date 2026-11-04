import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createAccountSession, parseAccountSession } from "../lib/account-session";

function withEnvironment(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const production = { NODE_ENV: "production", WHITE_GLOVE_SESSION_SECRET: undefined, ADMIN_PASSWORD: undefined };
const email = "person.with.dots@example.test";

test("production refuses to mint or accept sessions without configured secrets", () => {
  withEnvironment(production, () => {
    const signature = createHmac("sha256", "white-glove-development-secret").update(email).digest("base64url");
    assert.equal(parseAccountSession(`${encodeURIComponent(email)}.${signature}`), null);
    assert.throws(() => createAccountSession(email), /not set/);
  });
});

test("whitespace does not count as a configured production secret", () => {
  withEnvironment({ ...production, WHITE_GLOVE_SESSION_SECRET: "  ", ADMIN_PASSWORD: " " }, () => {
    assert.throws(() => createAccountSession(email), /not set/);
  });
});

test("configured production sessions still round-trip and reject tampering", () => {
  withEnvironment({ ...production, WHITE_GLOVE_SESSION_SECRET: "test-session-secret-only" }, () => {
    const session = createAccountSession(" Person.With.Dots@Example.Test ");
    assert.equal(parseAccountSession(session), email);
    assert.equal(parseAccountSession(session.replace("person", "someone")), null);
  });
});

test("the admin password remains a supported configured fallback", () => {
  withEnvironment({ ...production, ADMIN_PASSWORD: "test-admin-password-only" }, () => {
    assert.equal(parseAccountSession(createAccountSession(email)), email);
  });
});

test("malformed percent encoding is rejected without throwing", () => {
  withEnvironment({ ...production, WHITE_GLOVE_SESSION_SECRET: "test-session-secret-only" }, () => {
    for (const invalid of ["%", "%ZZ", "%E0%A4%A"]) {
      assert.equal(parseAccountSession(`${invalid}.${"a".repeat(43)}`), null);
    }
  });
});

test("invalid signature encoding and lengths are rejected without throwing", () => {
  withEnvironment({ ...production, WHITE_GLOVE_SESSION_SECRET: "test-session-secret-only" }, () => {
    for (const signature of ["é".repeat(43), "a".repeat(42), "a".repeat(44), "!".repeat(43)]) {
      assert.equal(parseAccountSession(`${encodeURIComponent(email)}.${signature}`), null);
    }
    assert.equal(parseAccountSession(), null);
    assert.equal(parseAccountSession(""), null);
  });
});

test("local development retains its fallback", () => {
  withEnvironment({ ...production, NODE_ENV: "development" }, () => {
    assert.equal(parseAccountSession(createAccountSession(email)), email);
  });
});
