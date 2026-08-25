import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PLATFORM_FEE_BPS, platformFeeBps, platformFeeCents } from "@/lib/platform-fee";

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env.PLATFORM_FEE_BPS;
  if (value === undefined) delete process.env.PLATFORM_FEE_BPS;
  else process.env.PLATFORM_FEE_BPS = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.PLATFORM_FEE_BPS;
    else process.env.PLATFORM_FEE_BPS = prev;
  }
}

test("the default take rate is 0.1%", () => {
  withEnv(undefined, () => {
    assert.equal(platformFeeBps(), DEFAULT_PLATFORM_FEE_BPS);
    assert.equal(DEFAULT_PLATFORM_FEE_BPS, 10);
    // 0.1% of a $1,000 trip is $1.00.
    assert.equal(platformFeeCents(100_000), 100);
  });
});

test("PLATFORM_FEE_BPS overrides the rate", () => {
  withEnv("25", () => {
    assert.equal(platformFeeBps(), 25); // 0.25%
    assert.equal(platformFeeCents(100_000), 250);
  });
  withEnv("0", () => {
    assert.equal(platformFeeCents(100_000), 0); // take nothing
  });
});

test("a nonsense rate falls back to the default", () => {
  for (const bad of ["", "abc", "-5", "20000"]) {
    withEnv(bad, () => assert.equal(platformFeeBps(), DEFAULT_PLATFORM_FEE_BPS, bad));
  }
});

test("the fee is a whole number of cents and never takes the whole charge", () => {
  withEnv(undefined, () => {
    assert.equal(platformFeeCents(500), 1); // 0.1% of $5 = 0.5c -> rounds to 1c
    assert.equal(platformFeeCents(100), 0); // 0.1% of $1 = 0.1c -> nothing
    assert.equal(platformFeeCents(0), 0);
    assert.equal(platformFeeCents(-100), 0);
    assert.ok(Number.isInteger(platformFeeCents(123_456)));
  });
  withEnv("10000", () => {
    // Even at a (clamped) 100%, it can never equal or exceed the amount.
    assert.equal(platformFeeCents(100), 99);
  });
});
