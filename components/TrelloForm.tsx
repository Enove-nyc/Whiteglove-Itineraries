"use client";

import { useActionState, useState } from "react";
import { saveTrelloAction, testTrelloAction } from "@/app/admin/settings/trello/actions";
import { assigneeFor, CARD_KINDS, type CardKind, describeTrello, keyProblem, listProblem, settingsProblem, tokenProblem, type TrelloSettings } from "@/lib/trello";

/**
 * The three values, and what raises a card.
 *
 * THE TEST BUTTON IS NOT DECORATION. Saving stores what was typed; it says
 * nothing about whether Trello agrees. A token generated against a different
 * key, a list ID that is really a board ID, a token that expired last month —
 * all three store perfectly and all three fail silently at the moment a visitor
 * sends something in. The only way to know is to make Trello answer.
 *
 * The token box is a password field. It is a working credential to somebody's
 * whole Trello account, and an admin screen is often open on a shared screen.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 font-mono text-xs text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

function TestButton() {
  const [state, act, busy] = useActionState(testTrelloAction, null);
  return (
    <form action={act} className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--gold-light)] pt-6">
      <button
        type="submit"
        disabled={busy}
        className="border border-[var(--gold)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50"
      >
        {busy ? "Asking Trello…" : "Send a test card"}
      </button>
      <span className="text-sm text-stone-600">Uses what is saved, not what is typed above.</span>
      {state && <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
    </form>
  );
}

export default function TrelloForm({ current, storeReady }: { current: TrelloSettings; storeReady: boolean }) {
  const [settings, setSettings] = useState<TrelloSettings>(current);
  const [state, act, busy] = useActionState(saveTrelloAction, null);
  const problem = settingsProblem(settings);

  const toggle = (kind: CardKind) =>
    setSettings({
      ...settings,
      kinds: settings.kinds.includes(kind) ? settings.kinds.filter((k) => k !== kind) : [...settings.kinds, kind],
    });

  return (
    <>
      <form action={act} className="mt-6 space-y-6">
        {!storeReady && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            The private store is not connected, so nothing here can be saved yet.
          </p>
        )}

        <p className="text-sm leading-6 text-stone-600">{describeTrello(settings)}</p>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={label}>API key</span>
            <input name="key" type="text" value={settings.key} onChange={(e) => setSettings({ ...settings, key: e.target.value })} className={input} />
            <span className={`mt-1 block text-xs leading-5 ${keyProblem(settings.key) ? "text-red-700" : "text-stone-500"}`}>
              {keyProblem(settings.key) ?? "From trello.com/power-ups/admin."}
            </span>
          </label>
          <label className="block">
            <span className={label}>Token</span>
            {/* A password field: this is a working credential to a whole Trello
                account, and an admin screen is often open on a shared screen. */}
            <input name="token" type="password" value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} className={input} />
            <span className={`mt-1 block text-xs leading-5 ${tokenProblem(settings.token) ? "text-red-700" : "text-stone-500"}`}>
              {tokenProblem(settings.token) ?? "Generated against that key. Much longer than the key."}
            </span>
          </label>
          <label className="block">
            <span className={label}>List ID</span>
            <input name="listId" type="text" value={settings.listId} onChange={(e) => setSettings({ ...settings, listId: e.target.value })} className={input} />
            <span className={`mt-1 block text-xs leading-5 ${listProblem(settings.listId) ? "text-red-700" : "text-stone-500"}`}>
              {listProblem(settings.listId) ?? "The list cards land in — usually “To do”."}
            </span>
          </label>
        </div>

        <fieldset>
          <legend className={label}>Who the card goes on</legend>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Optional. Every card already says which of the two it is in its own description; these only add the avatar,
            so the board can be filtered by it. A Trello member id is on your profile page, or in the board&rsquo;s
            <code className="mx-1 rounded bg-[var(--cream)] px-1">.json</code>.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Your member id</span>
              <input
                name="ownerMemberId"
                type="text"
                value={settings.ownerMemberId}
                onChange={(e) => setSettings({ ...settings, ownerMemberId: e.target.value })}
                className={input}
              />
              <span className="mt-1 block text-xs leading-5 text-stone-500">Everything except a site fault.</span>
            </label>
            <label className="block">
              <span className={label}>The bot&rsquo;s member id</span>
              <input
                name="botMemberId"
                type="text"
                value={settings.botMemberId}
                onChange={(e) => setSettings({ ...settings, botMemberId: e.target.value })}
                className={input}
              />
              <span className="mt-1 block text-xs leading-5 text-stone-500">Site faults only — the one kind that can be checked from the code.</span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className={label}>What should make a card</legend>
          <div className="mt-3 space-y-2">
            {CARD_KINDS.map((k) => (
              <label key={k.kind} className="flex items-start gap-3 rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] p-3">
                <input
                  type="checkbox"
                  name={`kind-${k.kind}`}
                  checked={settings.kinds.includes(k.kind)}
                  onChange={() => toggle(k.kind)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--navy)]">
                    {k.label}
                    {/* Whose card it is, said on the row that switches it on,
                        so the one queue that behaves differently cannot be a
                        surprise later. */}
                    <span
                      className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                        assigneeFor(k.kind) === "bot"
                          ? "border-sky-700 bg-sky-50 text-sky-800"
                          : "border-[var(--gold)] bg-[var(--cream)] text-[var(--navy)]"
                      }`}
                    >
                      {assigneeFor(k.kind) === "bot" ? "Bot" : "You"}
                    </span>
                  </span>
                  <span className="block text-xs leading-5 text-stone-500">{k.why}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !storeReady || Boolean(problem)}
            className="bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {problem && <span className="text-sm font-semibold text-red-700">{problem}</span>}
          {state && !problem && (
            <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>
          )}
        </div>
      </form>

      {/* OUTSIDE the form above. A <form> inside a <form> is not valid HTML —
          the browser drops the inner one, and the test button would submit the
          save instead. */}
      <TestButton />
    </>
  );
}
