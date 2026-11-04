"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { TripGroupMessage } from "@/lib/trip-group-store";

type ChatReply = { messages?: TripGroupMessage[]; member?: { id: string; name: string }; needsName?: boolean; error?: string };
function LiveTripGroupChat({ code }: { code: string }) {
  const id = useId();
  const [messages, setMessages] = useState<TripGroupMessage[]>([]);
  const [member, setMember] = useState<ChatReply["member"]>();
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const mutating = useRef(false);
  const request = useCallback(async (action: string, extra: Record<string, string> = {}) => {
    const response = await fetch("/api/trip-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action, ...extra }), cache: "no-store" });
    const data = await response.json() as ChatReply;
    if (!response.ok && !data.needsName) throw new Error(data.error || "Could not reach the trip chat.");
    return data;
  }, [code]);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const data = await request("read");
      if (current !== sequence.current) return;
      setNeedsName(Boolean(data.needsName));
      if (data.member) setMember(data.member);
      if (data.messages) setMessages(data.messages);
      setError("");
    } catch (problem) { if (current === sequence.current) setError(problem instanceof Error ? problem.message : "Could not load messages."); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [request]);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  useEffect(() => {
    const firstPoll = window.setTimeout(() => void refresh(), 0);
    const poll = () => { if (!mutating.current && document.visibilityState === "visible" && navigator.onLine) void refresh(); };
    const timer = window.setInterval(poll, 15000);
    window.addEventListener("online", poll); document.addEventListener("visibilitychange", poll);
    return () => { invalidate(); clearTimeout(firstPoll); clearInterval(timer); window.removeEventListener("online", poll); document.removeEventListener("visibilitychange", poll); };
  }, [refresh, invalidate]);
  async function join() {
    setBusy(true); setError(""); mutating.current = true;
    try { const data = await request("join", { name }); setMember(data.member); setNeedsName(false); await refresh(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Could not join the chat."); }
    finally { mutating.current = false; setBusy(false); }
  }
  async function send() {
    if (busy || !draft.trim()) return;
    const text = draft.trim(); setBusy(true); setError(""); mutating.current = true; ++sequence.current;
    try { const data = await request("send", { text }); if (data.needsName) { setNeedsName(true); return; } setMessages(data.messages ?? []); setDraft(""); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Your message was not sent. Try again."); }
    finally { mutating.current = false; setBusy(false); }
  }
  return <section className="flex min-h-0 flex-1 flex-col gap-3 p-4 text-[#102F35]" aria-labelledby={`${id}-heading`}>
    <div><h2 id={`${id}-heading`} className="text-lg font-semibold">Trip group chat</h2><p className="mt-1 text-sm leading-6 text-stone-600">A conversation for everyone with this trip’s code. Your display name is chosen by you.</p></div>
    {loading ? <p role="status">Opening the conversation…</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-white p-3 text-sm text-red-800">{error} <button type="button" onClick={() => void refresh()} className="min-h-11 px-2 font-semibold underline">Try again</button></p> : null}
    {needsName ? <form onSubmit={(event) => { event.preventDefault(); void join(); }} className="rounded-2xl bg-white p-4">
      <label htmlFor={`${id}-name`} className="block text-sm font-semibold">Your name in this trip</label><input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="given-name" required className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 px-3" />
      <button disabled={busy || !name.trim()} className="mt-3 min-h-11 rounded-xl bg-[#102F35] px-5 text-white disabled:opacity-50">Join the conversation</button>
    </form> : member ? <>
      <div className="text-sm text-stone-600">Chatting as {member.name} <button type="button" onClick={() => { setName(member.name); setNeedsName(true); }} className="min-h-11 px-2 underline">Change name</button></div>
      <ol aria-label="Trip messages" className="flex flex-col gap-3">{messages.map((message) => <li key={message.id} className={`max-w-[92%] rounded-2xl px-4 py-3 ${message.memberId === member.id ? "self-end bg-[#102F35] text-white" : "self-start bg-white"}`}>
        <p className="text-xs font-semibold">{message.memberId === member.id ? "You" : message.name}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p><time dateTime={message.at} className="mt-1 block text-xs opacity-80">{new Date(message.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
      </li>)}</ol>
      {!messages.length && !loading ? <p className="text-sm text-stone-600">No messages yet. Start the conversation with your travel group.</p> : null}
      <p className="text-xs text-stone-600">Showing the latest 500 messages.</p>
      <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="sticky bottom-0 mt-auto rounded-2xl bg-white p-3">
        <label htmlFor={`${id}-message`} className="sr-only">Message your trip group</label><textarea id={`${id}-message`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} disabled={busy} placeholder="Message your trip group…" className="min-h-20 w-full resize-y rounded-xl border border-stone-300 p-3 text-base" />
        <button disabled={busy || !draft.trim()} className="mt-2 min-h-11 rounded-xl bg-[#102F35] px-5 text-white disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
      </form>
    </> : null}
  </section>;
}

export default function TripGroupChat({ code, preview = false }: { code?: string; preview?: boolean }) {
  if (preview) return <section className="space-y-4 p-4 text-[#102F35]" aria-label="Sample trip group chat">
    <h2 className="text-lg font-semibold">Trip group chat</h2>
    <p className="text-sm leading-6 text-stone-600">Sample conversation between people on the same trip. Open your own trip code to send messages.</p>
    <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold">Miriam · Sample</p><p className="mt-1 text-sm leading-6">Let’s meet by the hotel entrance before we head out.</p></div>
    <div className="ml-6 rounded-2xl bg-[#102F35] p-4 text-white"><p className="text-xs font-semibold">David · Sample</p><p className="mt-1 text-sm leading-6">On my way. I have the tickets in my wallet.</p></div>
  </section>;
  return code ? <LiveTripGroupChat key={code} code={code} /> : null;
}
