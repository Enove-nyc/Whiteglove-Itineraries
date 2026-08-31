"use client";

import { useEffect, useRef, useState } from "react";
import type { AdvisorWelcome } from "@/data/advisor-welcome";
import { Button } from "@/components/ui/Button";

/**
 * The advisor's short welcome video for this trip — the first thing a
 * client sees on the proposal, before they've said yes. Reads and writes
 * whichever trip is currently open, the same convention Payments and the
 * Proposal builder already use.
 */
export default function AdvisorWelcomeUploader() {
  const [tripId, setTripId] = useState("");
  const [welcome, setWelcome] = useState<AdvisorWelcome | null>(null);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/welcome-video?trip=current", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(data?.error || "Could not load the welcome video.");
        else {
          setTripId(data?.tripId || "");
          setWelcome(data?.welcome ?? null);
          setCaption(data?.welcome?.caption ?? "");
        }
      } catch {
        if (active) setError("Could not reach the account service.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function pickFile(file: File | undefined) {
    if (!file || !tripId) return;
    setUploading(true);
    setError("");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/account/welcome-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, dataUrl: reader.result, caption }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.welcome) setWelcome(data.welcome);
        else setError(data?.error || "Could not upload that video.");
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setUploading(false);
      setError("Could not read that file.");
    };
    reader.readAsDataURL(file);
  }

  async function remove() {
    if (!tripId) return;
    const previous = welcome;
    setWelcome(null);
    try {
      const res = await fetch(`/api/account/welcome-video?trip=${encodeURIComponent(tripId)}`, { method: "DELETE" });
      if (!res.ok) {
        setWelcome(previous);
        setError("Could not remove that video.");
      }
    } catch {
      setWelcome(previous);
      setError("Could not reach the account service.");
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!tripId) return <p className="text-sm text-stone-500">Open a trip in the planner first.</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}

      {welcome ? (
        <div className="flex flex-col gap-3">
          <video src={`/api/media?id=${encodeURIComponent(welcome.mediaId)}`} controls className="w-full max-w-sm rounded-xl border border-[var(--gold-light)]" />
          {welcome.caption && <p className="text-sm text-stone-600">{welcome.caption}</p>}
          <div>
            <Button type="button" variant="secondary" onClick={remove}>
              Remove video
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--gold-light)] p-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600">
            Caption (optional)
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Looking forward to Rome!"
              className="rounded-lg border border-[var(--gold-light)] px-3 py-2 text-sm text-[var(--navy)]"
            />
          </label>
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload a welcome video"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
