"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { TripGroupMessage } from "@/lib/trip-group-store";
import { TRIP_CHAT_CHANNELS, type TripChatChannel } from "@/lib/trip-chat-channels";

type ChatReply = { messages?: TripGroupMessage[]; member?: { id: string; name: string }; needsName?: boolean; error?: string };
function ChannelButtons({ channel, onChange }: { channel: TripChatChannel; onChange: (value: TripChatChannel) => void }) {
  return <div role="group" aria-label="Chat channels" className="grid grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-4">
    {TRIP_CHAT_CHANNELS.map(item => <button key={item.id} type="button" aria-pressed={channel === item.id}
      onClick={() => onChange(item.id)}
      className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium ${channel === item.id ? "border-[#102F35] bg-[#102F35] text-white" : "border-stone-300 bg-white text-[#102F35]"}`}>{item.label}</button>)}
  </div>;
}
function LiveTripGroupChat({ code }: { code: string }) {
  const [channel, setChannel] = useState<TripChatChannel>("general");
  const [drafts, setDrafts] = useState<Partial<Record<TripChatChannel, string>>>({});
  return <div className="flex min-h-0 flex-1 flex-col">
    <ChannelButtons channel={channel} onChange={setChannel} />
    <ChannelTripGroupChat key={channel} code={code} channel={channel} draft={drafts[channel] ?? ""}
      onDraftChange={draft => setDrafts(previous => ({ ...previous, [channel]: draft }))} />
  </div>;
}
function ChannelTripGroupChat({ code, channel, draft, onDraftChange }: { code: string; channel: TripChatChannel; draft: string; onDraftChange: (value: string) => void }) {
  const id = useId();
  const [messages, setMessages] = useState<TripGroupMessage[]>([]);
  const [member, setMember] = useState<ChatReply["member"]>();
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const label = TRIP_CHAT_CHANNELS.find(item => item.id === channel)!.label;
  const cursor = useRef<string | undefined>(undefined);
  const joined = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const mutating = useRef(false);
  const request = useCallback(async (action: string, extra: Record<string, string> = {}) => {
    const response = await fetch("/api/trip-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action, channel, ...extra }), cache: "no-store" });
    const data = await response.json() as ChatReply;
    if (!response.ok && !data.needsName) throw new Error(data.error || "Could not reach the trip chat.");
    return data;
  }, [code, channel]);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const data = await request("read", cursor.current ? { after: cursor.current } : {});
      if (current !== sequence.current) return;
      setNeedsName(Boolean(data.needsName));
      joined.current = Boolean(data.member);
      if (data.member) setMember(data.member);
      if (data.messages) { setMessages(data.messages); cursor.current = data.messages.at(-1)?.id; }
      setError("");
    } catch (problem) { if (current === sequence.current) setError(problem instanceof Error ? problem.message : "Could not load messages."); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [request]);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  useEffect(() => {
    const firstPoll = window.setTimeout(() => void refresh(), 0);
    const poll = () => { if (joined.current && !mutating.current && document.visibilityState === "visible" && navigator.onLine) void refresh(); };
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
    try { const data = await request("send", { text }); if (data.needsName) { setNeedsName(true); return; } setMessages(data.messages ?? []); cursor.current = data.messages?.at(-1)?.id; onDraftChange(""); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Your message was not sent. Try again."); }
    finally { mutating.current = false; setBusy(false); }
  }
  return <section className="flex min-h-0 flex-1 flex-col gap-3 p-4 text-[#102F35]" aria-labelledby={`${id}-heading`}>
    <div><h2 id={`${id}-heading`} className="text-lg font-semibold">{label}</h2><p className="mt-1 text-sm leading-6 text-stone-600">A conversation for everyone with this trip’s code. Your display name is chosen by you.</p></div>
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
      <p className="text-xs text-stone-600">Showing the latest 500 messages in this channel.</p>
      <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="sticky bottom-0 mt-auto rounded-2xl bg-white p-3">
        <label htmlFor={`${id}-message`} className="sr-only">Message your trip group</label><textarea id={`${id}-message`} value={draft} onChange={(event) => onDraftChange(event.target.value)} maxLength={2000} rows={2} disabled={busy} placeholder="Message your trip group…" className="min-h-20 w-full resize-y rounded-xl border border-stone-300 p-3 text-base" />
        <button disabled={busy || !draft.trim()} className="mt-2 min-h-11 rounded-xl bg-[#102F35] px-5 text-white disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
      </form>
    </> : null}
  </section>;
}

function SampleTripGroupChat() {
  const [channel, setChannel] = useState<TripChatChannel>("general");
  const samples: Record<TripChatChannel, [string, string]> = {
    general: ["Let’s meet by the hotel entrance before we head out.", "On my way. I have the tickets in my wallet."],
    hotels: ["Our rooms are booked under the family name.", "I’ll ask reception about the connecting rooms."],
    flights: ["Our flight leaves at 10:30 tomorrow.", "Let’s meet at the check-in desk at 07:30."],
    plans: ["Shall we visit the gardens after breakfast?", "Sounds good. I’ll bring the walking map."],
  };
  return <section className="space-y-4 p-4 text-[#102F35]" aria-label="Sample trip group chat">
    <h2 className="text-lg font-semibold">Trip group chat</h2>
    <p className="text-sm leading-6 text-stone-600">Sample conversation between people on the same trip. Open your own trip code to send messages.</p>
    <ChannelButtons channel={channel} onChange={setChannel} />
    <h3 className="text-sm font-semibold">{TRIP_CHAT_CHANNELS.find(item => item.id === channel)!.label}</h3>
    <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold">Miriam · Sample</p><p className="mt-1 text-sm leading-6">{samples[channel][0]}</p></div>
    <div className="ml-6 rounded-2xl bg-[#102F35] p-4 text-white"><p className="text-xs font-semibold">David · Sample</p><p className="mt-1 text-sm leading-6">{samples[channel][1]}</p></div>
  </section>;
}
export default function TripGroupChat({ code, preview = false }: { code?: string; preview?: boolean }) {
  if (preview) return <SampleTripGroupChat />;
  return code ? <LiveTripGroupChat key={code} code={code} /> : null;
}
