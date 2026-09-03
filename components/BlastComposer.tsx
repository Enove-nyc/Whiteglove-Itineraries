"use client";

import { useActionState, useState } from "react";
import {
  deleteBlastAction,
  saveBlastAction,
  sendBlastAction,
  setBlastOpenAction,
  setBlastSenderAction,
  testBlastAction,
} from "@/app/admin/alerts/send/actions";
import BlastBlocks from "@/components/BlastBlocks";
import { ALERT_TOPIC_BLURBS, ALERT_TOPIC_LABELS, ALERT_TOPICS, type AlertTopic } from "@/lib/email-alerts";
import {
  type BlastBlock,
  blocksOf,
  describeBlast,
  type EmailBlast,
  MAX_SUBJECT,
  becauseLine,
} from "@/lib/email-blast";
import { renderBlastHtml } from "@/lib/email-template";

/**
 * Writing and sending one message to the people who asked for it.
 *
 * THE ORDER ON THE SCREEN IS THE ORDER OF THE DECISION. Who it goes to and how
 * many that is, before the words — because the number is what tells you whether
 * the message you are about to write is worth writing, and finding out
 * afterwards that it reaches four people is how a morning gets wasted.
 *
 * SEND IS NEVER THE FIRST BUTTON. Save, then send one to yourself, then send.
 * The test uses the same code path as the real thing, so what lands in the
 * owner's inbox is what the list will get, footer and all.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const caption = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

function Note({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p
      className={`mt-3 rounded-md px-4 py-3 text-sm leading-6 ${
        state.ok ? "bg-emerald-50 text-emerald-900" : "border border-amber-200 bg-amber-50 text-amber-900"
      }`}
      role="status"
    >
      {state.message}
    </p>
  );
}

export default function BlastComposer({
  open,
  /** The address updates go out as. Blank means the site's usual sender. */
  fromEmail,
  /** What the site would send as with nothing set here — for the placeholder. */
  defaultFrom,
  storeReady,
  /** How many active signups have ticked each topic. */
  reachByTopic,
  /**
   * One number per active signup: a bitmask of which topics they ticked, in the
   * order of ALERT_TOPICS.
   *
   * NO ADDRESSES CROSS TO THE BROWSER, and none are needed — the only question
   * this screen asks is "how many people would this reach", and the answer has
   * to be the deduplicated count. Adding up the per-topic totals would count
   * somebody who ticked three topics three times and tell the owner he was
   * writing to ninety people when he was writing to forty.
   */
  audienceMasks,
  blasts,
  /** This deployment's own address, so the preview's crest and pictures load. */
  siteOrigin,
  /** Waiting counts per blast id — audience minus everybody already handled. */
  remaining,
  /** Why sending is impossible right now, whatever the switch says. Null if it is possible. */
  deliveryWarning,
}: {
  open: boolean;
  fromEmail: string;
  defaultFrom: string;
  storeReady: boolean;
  reachByTopic: Record<string, number>;
  audienceMasks: number[];
  blasts: EmailBlast[];
  siteOrigin: string;
  remaining: Record<string, number>;
  deliveryWarning: string | null;
}) {
  const [switchState, switchAct, switching] = useActionState(setBlastOpenAction, null);
  const [saveState, saveAct, saving] = useActionState(saveBlastAction, null);
  const [sendState, sendAct, sending] = useActionState(sendBlastAction, null);
  const [testState, testAct, testing] = useActionState(testBlastAction, null);
  const [deleteState, deleteAct, deleting] = useActionState(deleteBlastAction, null);
  const [senderState, senderAct, savingSender] = useActionState(setBlastSenderAction, null);

  const [chosen, setChosen] = useState<AlertTopic[]>([]);
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<BlastBlock[]>([{ kind: "text", text: "" }]);
  /** Which saved message is being edited, or "" for a new one. */
  const [editing, setEditing] = useState("");

  // The audience for what is being written, counted the same way the server
  // will count it: each person once, if they ticked ANY of the chosen topics.
  // Rendered by the very code that sends it, in an iframe so the email's own
  // styles cannot leak into the admin and the admin's cannot leak into it. A
  // preview drawn a second way is a preview of something else.
  const preview = renderBlastHtml({
    blast: { blocks, subject },
    origin: siteOrigin,
    becauseLine: becauseLine(chosen),
    unsubscribeUrl: `${siteOrigin}/api/alerts/unsubscribe?token=preview`,
  });

  const wantedMask = chosen.reduce((mask, topic) => mask | (1 << ALERT_TOPICS.indexOf(topic)), 0);
  const reach = wantedMask === 0 ? 0 : audienceMasks.filter((mask) => (mask & wantedMask) !== 0).length;

  const toggle = (topic: AlertTopic) =>
    setChosen((current) => (current.includes(topic) ? current.filter((t) => t !== topic) : [...current, topic]));

  return (
    <div className="space-y-8">
      {/* ---- the switch ---- */}
      <section className={card}>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Sending</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {open
            ? "On. Messages can be sent when you press send — nothing goes out on its own."
            : "Off. You can write and save messages; none of them can leave until you turn this on."}
        </p>
        <form action={switchAct} className="mt-4">
          <input type="hidden" name="open" value={open ? "off" : "on"} />
          <button
            type="submit"
            disabled={switching || !storeReady}
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50"
          >
            {switching ? "Saving…" : open ? "Turn sending off" : "Turn sending on"}
          </button>
        </form>
        <Note state={switchState} />

        <div className="mt-6 border-t border-[var(--gold-light)] pt-5">
          <h3 className="text-sm font-semibold text-[var(--navy)]">Who it comes from</h3>
          <p className="mt-1.5 text-sm leading-6 text-stone-600">
            Updates can come from their own address, separate from the one that sends verification codes and password
            resets. Somebody will reply to an update asking whether a hotel takes a family of six — that reply should
            land somewhere you read. Replies go back to whatever you put here.
          </p>
          <form action={senderAct} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-[16rem] flex-1">
              <span className={caption}>Sending address</span>
              <input
                name="fromEmail"
                defaultValue={fromEmail}
                placeholder={defaultFrom || "info@whiteglovekoshertravel.com"}
                className={input}
              />
            </label>
            <button
              type="submit"
              disabled={savingSender || !storeReady}
              className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50"
            >
              {savingSender ? "Saving…" : "Save address"}
            </button>
          </form>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            It has to be an address at whiteglovekoshertravel.com — that is the domain verified with Resend, and mail
            sent as anything else is refused or lands in spam. Leave it blank to use{" "}
            <code>{defaultFrom || "the site's usual sender"}</code>.
          </p>
          <Note state={senderState} />
        </div>

        {deliveryWarning && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {deliveryWarning}
          </p>
        )}
      </section>

      {/* ---- writing one ---- */}
      <section className={card}>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Write a message</h2>

        <form action={saveAct} className="mt-5 space-y-6">
          <fieldset>
            <legend className={caption}>Who it goes to</legend>
            <p className="mt-1.5 text-sm leading-6 text-stone-600">
              Anybody who ticked one of these when they signed up. Nobody else — an account on this site is not a
              subscription to email.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ALERT_TOPICS.map((topic) => (
                <label
                  key={topic}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm leading-6 ${
                    chosen.includes(topic) ? "border-[var(--gold)] bg-white" : "border-[var(--gold-light)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="topics"
                    value={topic}
                    checked={chosen.includes(topic)}
                    onChange={() => toggle(topic)}
                    className="mt-1.5"
                  />
                  <span>
                    <span className="font-semibold text-[var(--navy)]">{ALERT_TOPIC_LABELS[topic]}</span>
                    <span className="block text-xs leading-5 text-stone-500">{ALERT_TOPIC_BLURBS[topic]}</span>
                    <span className="mt-1 block text-xs font-semibold text-[var(--gold-ink)]">
                      {reachByTopic[topic] ?? 0} on the list
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--navy)]">
              {chosen.length === 0
                ? "Nobody chosen yet."
                : `${reach} ${reach === 1 ? "person" : "people"} would get this.`}
            </p>
          </fieldset>

          <label className="block">
            <span className={caption}>Subject</span>
            <input
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={MAX_SUBJECT}
              placeholder="Vienna is on the site"
              className={input}
            />
            <span className="mt-1 block text-xs text-stone-500">
              {subject.length}/{MAX_SUBJECT}. Most people will read this and nothing else.
            </span>
          </label>

          <div>
            <span className={caption}>The message</span>
            <p className="mt-1.5 text-sm leading-6 text-stone-600">
              Built out of pieces, the same way you edit a page. The crest, the gold rule and the footer are added
              around whatever you put here — you are writing the middle of the letter, not the whole of it.
            </p>
            {/* The blocks go up as one JSON field. A stack of pieces with
                pictures in it does not fit the flat name/value shape a form
                posts, and inventing "block-3-caption" names would be a second
                encoding to keep in step with the first. */}
            <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
            <input type="hidden" name="blastId" value={editing} />
            <div className="mt-3">
              <BlastBlocks blocks={blocks} onChange={setBlocks} />
            </div>
            <p className="mt-3 text-xs leading-5 text-stone-500">
              Why they are getting this and how to stop are added to every message and cannot be removed.
            </p>
          </div>

          {/* ---- what it will look like ---- */}
          <div>
            <span className={caption}>What they will see</span>
            <p className="mt-1.5 text-xs leading-5 text-stone-500">
              The real message, drawn by the same code that sends it — so this is not an impression of the email, it is
              the email.
            </p>
            <iframe
              title="Preview of the message"
              srcDoc={preview}
              className="mt-3 h-[32rem] w-full rounded-lg border border-[var(--gold-light)] bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !storeReady}
            className="bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Save it"}
          </button>
          <Note state={saveState} />
        </form>
      </section>

      {/* ---- what has been written ---- */}
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Messages</h2>
        {blasts.length === 0 ? (
          <p className={`${card} mt-3 text-sm leading-6 text-stone-600`}>Nothing written yet.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {blasts.map((blast) => {
              const left = remaining[blast.id] ?? 0;
              return (
                <li key={blast.id} className={card}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-[family-name:var(--font-display)] text-lg text-[var(--navy)]">{blast.subject}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {blast.topics.map((topic) => ALERT_TOPIC_LABELS[topic]).join(" · ")}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                      {blast.state === "draft" ? "Not sent" : blast.state === "sending" ? "Part sent" : "Sent"}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    {blocksOf(blast)
                      .map((block) =>
                        block.kind === "heading" || block.kind === "text"
                          ? block.text.trim().slice(0, 120)
                          : block.kind === "image"
                            ? "[picture]"
                            : block.kind === "button"
                              ? `[${block.label.trim() || "button"}]`
                              : "—",
                      )
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-[var(--navy)]">{describeBlast(blast, left)}</p>
                  {blast.lastError && (
                    <p className="mt-1 text-xs leading-5 text-amber-900">Last refusal: {blast.lastError}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <form action={testAct}>
                      <input type="hidden" name="blastId" value={blast.id} />
                      <button
                        type="submit"
                        disabled={testing}
                        className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50"
                      >
                        {testing ? "Sending…" : "Send one to me"}
                      </button>
                    </form>
                    {left > 0 && (
                      <form action={sendAct}>
                        <input type="hidden" name="blastId" value={blast.id} />
                        <button
                          type="submit"
                          disabled={sending || !open}
                          className="bg-[var(--navy)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
                          title={open ? undefined : "Sending is switched off."}
                        >
                          {sending ? "Sending…" : blast.state === "draft" ? `Send to ${left}` : `Continue — ${left} left`}
                        </button>
                      </form>
                    )}
                    {blast.state === "draft" && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(blast.id);
                          setSubject(blast.subject);
                          setChosen(blast.topics);
                          setBlocks(blocksOf(blast));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
                      >
                        Edit
                      </button>
                    )}
                    {blast.state === "draft" && (
                      <form action={deleteAct}>
                        <input type="hidden" name="blastId" value={blast.id} />
                        <button
                          type="submit"
                          disabled={deleting}
                          className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Note state={testState} />
        <Note state={sendState} />
        <Note state={deleteState} />
      </section>
    </div>
  );
}
