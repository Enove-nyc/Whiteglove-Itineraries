"use client";

import Script from "next/script";
import { createElement, useState } from "react";

type AssistantWindow = Window & {
  openDuffelAssistant?: (options: { clientKey: string }) => void;
};

export default function BookingAssistant({ receipt }: { receipt: string }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function open() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/private-booking/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      });
      const result = await response.json();
      const assistant = (window as AssistantWindow).openDuffelAssistant;
      if (!response.ok || !assistant) throw new Error(result.message ?? "Booking support is unavailable.");
      assistant({ clientKey: result.clientKey });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Booking support is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5">
      <Script src="https://assets.duffel.com/assistant/custom-element.js" onReady={() => setReady(true)}
        onError={() => setMessage("Booking support is unavailable.")} />
      {createElement("duffel-assistant")}
      <button type="button" disabled={!ready || loading} onClick={open}
        className="rounded bg-[var(--navy)] px-4 py-3 font-semibold text-white disabled:opacity-50">
        {loading ? "Opening booking support…" : "Manage booking"}
      </button>
      {message && <p className="mt-2" role="alert">{message}</p>}
    </div>
  );
}
