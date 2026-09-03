"use client";

import { useActionState } from "react";
import { type ContactMessage, kindOf, waitingFor } from "@/lib/contact-messages";
import { type ActionResult, markAnsweredAction, markWaitingAction } from "@/app/admin/messages/actions";

/**
 * What people have written in, and whether anybody has dealt with it.
 *
 * THE WHOLE MESSAGE IS ON THE SCREEN. Not a preview with "open to read the
 * rest": these are short, and a queue that makes somebody click ten times to
 * find out which one matters is a queue that gets left. A flight request runs
 * to a dozen lines and every one of them is the answer to a question the owner
 * would otherwise have to ask.
 *
 * ANSWERED IS A NOTE, NOT A REPLY. Pressing it records that the owner has
 * dealt with the message; the reply itself happens in his email, where it
 * always did. Nothing on this screen sends anything to anybody, and it does
 * not pretend otherwise — the button beside it opens his mail client with the
 * address already in it, which is the honest version of "reply".
 *
 * `now` comes from the server, so "6 days ago" is worked out once rather than
 * by every row reaching for a clock while it renders.
 */

function Row({ message, now }: { message: ContactMessage; now: string }) {
  const [answered, answer, answering] = useActionState(markAnsweredAction, null);
  const [reopened, reopen, reopening] = useActionState(markWaitingAction, null);
  const said: ActionResult | null = answered ?? reopened;
  const waiting = message.state === "waiting";

  const mailto =
    `mailto:${encodeURIComponent(message.email)}` +
    `?subject=${encodeURIComponent(`Re: ${message.subject || "your message to White Glove Kosher Travel"}`)}`;

  return (
    <div className={`border p-5 ${waiting ? "border-[var(--gold-light)] bg-white" : "border-stone-200 bg-[#FAF8F3]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{message.name}</p>
          <p className="mt-1 text-xs text-stone-500">
            <a href={mailto} className="underline decoration-[var(--gold)] underline-offset-2">{message.email}</a>
            {message.phone ? ` · ${message.phone}` : ""} · {waitingFor(message.at, now)}
          </p>
        </div>
        <span className="shrink-0 border border-[var(--gold)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
          {kindOf(message)}
        </span>
      </div>

      {message.subject && <p className="mt-3 text-sm font-semibold text-[var(--navy)]">{message.subject}</p>}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-600">{message.message}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={mailto}
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--navy)]"
        >
          Reply by email
        </a>
        {waiting ? (
          <form action={answer}>
            <input type="hidden" name="id" value={message.id} />
            <button
              type="submit"
              disabled={answering || reopening}
              className="min-h-11 rounded-md bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
            >
              {answering ? "Saving…" : "Mark answered"}
            </button>
          </form>
        ) : (
          <form action={reopen}>
            <input type="hidden" name="id" value={message.id} />
            <button
              type="submit"
              disabled={answering || reopening}
              className="min-h-11 rounded-md border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:border-[var(--gold)] disabled:opacity-50"
            >
              {reopening ? "Saving…" : "Still needs an answer"}
            </button>
          </form>
        )}
        {!waiting && message.answeredBy && (
          <span className="text-xs text-stone-500">Answered by {message.answeredBy}</span>
        )}
        {said && (
          <span className={`text-sm font-semibold ${said.ok ? "text-emerald-700" : "text-red-700"}`}>{said.message}</span>
        )}
      </div>
    </div>
  );
}

export default function ContactMessages({ messages, now }: { messages: ContactMessage[]; now: string }) {
  const waiting = messages.filter((m) => m.state === "waiting");
  // Enough history to answer "did we ever hear from this person before"
  // without turning the screen into an archive nobody scrolls.
  const answered = messages.filter((m) => m.state !== "waiting").slice(0, 20);

  return (
    <>
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Waiting for you</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
          {waiting.length === 0 ? "Nothing waiting" : `${waiting.length} to answer`}
        </h2>

        {waiting.length === 0 ? (
          <div className="mt-6 border border-dashed border-[var(--gold-light)] p-10 text-center">
            <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Nobody is waiting.</p>
            <p className="mt-2 text-sm text-stone-600">
              Messages from the contact page, the trip enquiry and the flight request all arrive here.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {waiting.map((message) => (
              <Row key={message.id} message={message} now={now} />
            ))}
          </div>
        )}
      </section>

      {answered.length > 0 && (
        <section className="mt-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">Already answered</p>
          <div className="mt-4 space-y-4">
            {answered.map((message) => (
              <Row key={message.id} message={message} now={now} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
