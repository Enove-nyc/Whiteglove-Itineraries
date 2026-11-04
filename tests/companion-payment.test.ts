// Legacy advisor gates remain tested below. The self-service companion
// is exercised against real APIs and browser contexts in traveler-companion-journeys.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("the client app's payment surfaces keep the same fences everything else does", () => {
  const APP = readFileSync("components/companion/CompanionApp.tsx", "utf8");
  const CHECKOUT = readFileSync("components/companion/PaymentCheckout.tsx", "utf8");
  const WHOLE_TRIP_PAGE = readFileSync("app/i/[shareId]/app/page.tsx", "utf8");
  const TRAVELER_PAGE = readFileSync("app/t/[shareId]/app/page.tsx", "utf8");
  const COMPANION_PAYMENT_LIB = readFileSync("lib/companion-payment.ts", "utf8");
  const PKG = readFileSync("package.json", "utf8");

  it("does not add a sixth tab — Pay is a screen reached from a button, not a tab of its own", () => {
    const tabsBlock = APP.slice(APP.indexOf("const tabs ="), APP.indexOf("const tabs =") + 600);
    assert.doesNotMatch(tabsBlock, /"pay"/);
  });

  it("the home screen's balance-due card disappears once nothing is owed", () => {
    const card = APP.slice(APP.indexOf("Money due gets one prominent card"), APP.indexOf("Money due gets one prominent card") + 900);
    assert.match(card, /trip\.payment && trip\.payment\.remainingCents > 0/);
  });

  it("the Pay screen re-fetches live numbers rather than trusting what the page rendered with", () => {
    const screen = APP.slice(APP.indexOf("function PayScreen"), APP.indexOf("export default function CompanionApp"));
    assert.match(screen, /fetch\(`\/api\/pay\/\$\{shareId\}`/);
  });

  it("a traveler-scoped link always resolves its OWN unit, never a client-supplied one", () => {
    assert.match(TRAVELER_PAGE, /travelerUnitKey\(shared\.traveler\)/);
  });

  it("both app pages redact/attach payment before CompanionApp ever renders, not inside it", () => {
    // The self-service whole-trip companion has no payment surface.
    assert.doesNotMatch(WHOLE_TRIP_PAGE, /trip\.payment = payment/);
    assert.match(TRAVELER_PAGE, /trip\.payment = payment/);
  });

  it("paymentForUnit is the one place a payment is computed — both the pay route and the app pages import it", () => {
    assert.match(COMPANION_PAYMENT_LIB, /export async function paymentForUnit/);
  });

  it("the checkout never touches a card number itself — Stripe Elements collects it", () => {
    assert.doesNotMatch(CHECKOUT, /cardNumber|card_number/i);
    assert.match(CHECKOUT, /PaymentElement/);
    assert.match(CHECKOUT, /confirmPayment/);
  });

  it("a payment is only ever shown as done after Stripe itself confirms it — the UI never invents a receipt", () => {
    assert.doesNotMatch(CHECKOUT, /status:\s*"succeeded"(?!\s*\|\|)/); // never hand-set "succeeded" — only ever read from Stripe's own response
    assert.match(CHECKOUT, /paymentIntent\?\.status === "succeeded"/);
  });

  it("Stripe's browser library is a real dependency, not assumed to already be there", () => {
    const pkg = JSON.parse(PKG);
    assert.ok(pkg.dependencies["@stripe/stripe-js"]);
    assert.ok(pkg.dependencies["@stripe/react-stripe-js"]);
  });
});
