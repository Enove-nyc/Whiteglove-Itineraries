"use client";

import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { CompanionPayment } from "@/data/companion-demo";

const GOLD = "#b78a4a";
const serif = "Georgia,'Times New Roman',serif";

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

function CardStep({ onPaid, onBack }: { onPaid: () => void; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError("");
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message || "That card could not be charged.");
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onPaid();
    } else {
      setError("The payment did not go through. Try another card.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PaymentElement />
      {error && <p style={{ margin: 0, fontSize: 13, color: "#b42318" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={submit}
          disabled={!stripe || submitting}
          className="wg-press"
          style={{ flex: 1, border: 0, cursor: "pointer", background: GOLD, color: "#fffaf0", font: `400 15px/1 ${serif}`, padding: "13px 0", borderRadius: 14, opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "Paying…" : "Pay"}
        </button>
        <button onClick={onBack} disabled={submitting} style={{ border: "1px solid rgba(38,50,58,.15)", background: "none", cursor: "pointer", color: "#57534e", font: "600 13px/1 Inter,sans-serif", padding: "13px 16px", borderRadius: 14 }}>
          Back
        </button>
      </div>
    </div>
  );
}

/**
 * One traveler/family's payment screen — pick an amount, then pay it with a
 * real card via Stripe Elements. No card number is ever seen by this site;
 * Elements collects it directly in the browser against a PaymentIntent's
 * client secret from app/api/pay/[shareId]/route.ts, and the payment is only
 * ever recorded once Stripe's own webhook confirms it succeeded — this
 * screen shows "Paying…" and then a plain thank-you, not a receipt it
 * invented on the spot.
 */
export default function PaymentCheckout({ payment, publishableKey, onDone }: { payment: CompanionPayment; publishableKey: string; onDone: () => void }) {
  const [amountCents, setAmountCents] = useState(payment.nextDue ? Math.min(payment.nextDue.amountCents, payment.remainingCents) : payment.remainingCents);
  const [customOpen, setCustomOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);

  async function start() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/pay/${payment.shareId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.clientSecret) {
        setError(data?.error || "Could not start that payment.");
        return;
      }
      setClientSecret(data.clientSecret);
    } catch {
      // A network rejection creating the PaymentIntent used to be a silent
      // no-op — the button twitched and nothing happened. Say so instead.
      setError("Could not reach the payment service. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  if (paid) {
    return (
      <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, font: `400 20px/1.3 ${serif}`, color: "#0b2437" }}>Thank you.</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#57534e" }}>
          Your payment is on its way to being confirmed — it will show here once it has gone through.
        </p>
        <button onClick={onDone} className="wg-press" style={{ alignSelf: "flex-start", marginTop: 6, border: 0, cursor: "pointer", background: GOLD, color: "#fffaf0", font: `400 14px/1 ${serif}`, padding: "12px 20px", borderRadius: 14 }}>
          Done
        </button>
      </div>
    );
  }

  if (clientSecret) {
    return (
      <Elements stripe={getStripe(publishableKey)} options={{ clientSecret }}>
        <CardStep onPaid={() => setPaid(true)} onBack={() => setClientSecret("")} />
      </Elements>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p style={{ margin: 0, fontSize: 13, color: "#78716c" }}>Amount to pay</p>
        <p style={{ margin: "2px 0 0", font: `400 26px/1.2 ${serif}`, color: "#0b2437" }}>{formatCents(amountCents, payment.currency)}</p>
      </div>
      {!customOpen ? (
        <button onClick={() => setCustomOpen(true)} style={{ alignSelf: "flex-start", border: 0, background: "none", cursor: "pointer", color: "#765321", font: "600 13px/1 Inter,sans-serif", padding: 0 }}>
          Enter another amount
        </button>
      ) : (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ font: "600 11px/1 Inter,sans-serif", letterSpacing: ".08em", textTransform: "uppercase", color: "#78716c" }}>Amount</span>
          <input
            type="number"
            min="1"
            max={payment.remainingCents / 100}
            step="0.01"
            defaultValue={(amountCents / 100).toFixed(2)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) setAmountCents(Math.min(Math.round(n * 100), payment.remainingCents));
            }}
            style={{ border: "1px solid rgba(38,50,58,.15)", borderRadius: 10, padding: "10px 12px", fontSize: 15 }}
          />
        </label>
      )}
      {error && <p style={{ margin: 0, fontSize: 13, color: "#b42318" }}>{error}</p>}
      <button
        onClick={start}
        disabled={starting || amountCents <= 0}
        className="wg-press"
        style={{ border: 0, cursor: "pointer", background: GOLD, color: "#fffaf0", font: `400 15px/1 ${serif}`, padding: "13px 0", borderRadius: 14, opacity: starting ? 0.7 : 1 }}
      >
        {starting ? "One moment…" : "Continue"}
      </button>
    </div>
  );
}
