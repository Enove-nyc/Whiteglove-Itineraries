import assert from "node:assert/strict";
import { test } from "node:test";
import { ANDROID_APP_PACKAGE, isAndroidAppHeaders } from "@/lib/android-app";

/** Build a header accessor from a plain object, case-insensitive like Headers. */
function headers(map: Record<string, string>): (name: string) => string | null {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return (name) => lower.get(name.toLowerCase()) ?? null;
}

test("the app's X-Requested-With package is recognised", () => {
  assert.equal(isAndroidAppHeaders(headers({ "X-Requested-With": ANDROID_APP_PACKAGE })), true);
});

test("surrounding whitespace on the package name is tolerated", () => {
  assert.equal(isAndroidAppHeaders(headers({ "x-requested-with": `  ${ANDROID_APP_PACKAGE}  ` })), true);
});

test("the launch navigation's android-app referrer is recognised", () => {
  assert.equal(
    isAndroidAppHeaders(headers({ referer: `android-app://${ANDROID_APP_PACKAGE}/` })),
    true,
  );
});

test("an ordinary browser is not treated as the app", () => {
  assert.equal(isAndroidAppHeaders(headers({})), false);
  assert.equal(isAndroidAppHeaders(headers({ "x-requested-with": "XMLHttpRequest" })), false);
  assert.equal(
    isAndroidAppHeaders(headers({ referer: "https://whitegloveitineraries.com/" })),
    false,
  );
});

test("a different app's package is not treated as ours", () => {
  assert.equal(isAndroidAppHeaders(headers({ "x-requested-with": "com.example.other" })), false);
  assert.equal(
    isAndroidAppHeaders(headers({ referer: "android-app://com.example.other/" })),
    false,
  );
});
