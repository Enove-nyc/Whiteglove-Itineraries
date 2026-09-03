"use client";

import { useActionState, useState } from "react";
import { removeTeamMemberAction, saveTeamMemberAction, type ActionResult } from "@/app/admin/team/actions";
import { ADMIN_AREAS, AREA_LABELS, describeAreas, grantedAreas } from "@/lib/admin-permissions";
import type { TeamMember } from "@/lib/admin-roles";

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const submitClass =
  "min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p role="status" className={`mt-3 text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
      {state.message}
    </p>
  );
}

export default function TeamEditor({ members, storageReady }: { members: TeamMember[]; storageReady: boolean }) {
  const [saveState, saveAction, savePending] = useActionState<ActionResult | null, FormData>(saveTeamMemberAction, null);
  const [removeState, removeAction] = useActionState<ActionResult | null, FormData>(removeTeamMemberAction, null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Which parts to offer is only a question once they are being made an
  // administrator at all, so the list appears with the tick rather than
  // sitting there greyed out asking to be understood.
  const [adminChecked, setAdminChecked] = useState(false);

  return (
    <div className="space-y-8">
      {!storageReady && (
        <p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Giving other people access needs the private store connected. Until then you are the only person who can get
          in, which is safe — nothing is broken.
        </p>
      )}

      <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Who has access</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">Nobody yet. You are the only one who can get in.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--gold-light)]">
            {members.map((m) => (
              <li key={m.email} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--navy)]">
                    {m.name ? `${m.name} · ` : ""}
                    {m.email}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    {m.owner
                      ? "You — full access, and it cannot be taken away here."
                      : [m.admin ? "Can run the admin area" : null, m.siteAccess && !m.admin ? "Can see the site while it is closed" : null]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>
                  {/* What they may actually open, spelled out. "Can run the
                      admin area" on its own hid whether that meant the whole
                      thing or one corner of it. */}
                  {!m.owner && m.admin && (
                    <p className="mt-1 text-sm text-stone-500">{describeAreas(grantedAreas(m.areas))}</p>
                  )}
                  {m.note && <p className="mt-1 text-sm text-stone-500">{m.note}</p>}
                </div>
                {!m.owner && (
                  <div className="flex shrink-0 items-center gap-2">
                    {confirming === m.email ? (
                      <form action={removeAction} className="flex items-center gap-2">
                        <input type="hidden" name="email" value={m.email} />
                        <span className="text-sm text-stone-600">Take away their access?</span>
                        <button
                          type="submit"
                          className="min-h-[36px] border border-red-400 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-red-700 transition hover:bg-red-50"
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500"
                        >
                          Keep
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(m.email)}
                        className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Status state={removeState} />
      </section>

      <form action={saveAction} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Give someone access</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          They need a White Glove account with this email address — they sign in normally and their access follows
          their account. Entering the same address again updates what they can do.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={captionClass}>Their email *</span>
            <input name="email" type="email" required className={inputClass} placeholder="name@example.com" />
          </label>
          <label className="block">
            <span className={captionClass}>Their name</span>
            <input name="name" className={inputClass} placeholder="So you remember who it is" />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className={captionClass}>What may they do?</legend>
          <label className="mt-3 flex items-start gap-3 border border-[var(--gold-light)] bg-white p-4">
            <input type="checkbox" name="siteAccess" className="mt-1 h-4 w-4 accent-[var(--navy)]" defaultChecked />
            <span>
              <span className="block font-semibold text-[var(--navy)]">See the site while it is closed</span>
              <span className="block text-sm text-stone-600">
                They can browse the website when the public cannot, without being told the shared password.
              </span>
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3 border border-[var(--gold-light)] bg-white p-4">
            <input
              type="checkbox"
              name="admin"
              checked={adminChecked}
              onChange={(e) => setAdminChecked(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--navy)]"
            />
            <span>
              <span className="block font-semibold text-[var(--navy)]">Run the admin area</span>
              <span className="block text-sm text-stone-600">
                They can sign in and change the site. Choose below which parts — somebody helping with kevarim does not
                need your finances or your passwords.
              </span>
            </span>
          </label>
        </fieldset>

        {adminChecked && (
          <fieldset className="mt-5 border border-[var(--gold-light)] bg-white p-4">
            <legend className={captionClass}>Which parts of the admin?</legend>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Untick anything they should not reach. Leave all five ticked and they can do everything you can, except
              taking away your own access.
            </p>
            <div className="mt-3 space-y-2">
              {ADMIN_AREAS.map((area) => (
                <label key={area} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="areas"
                    value={area}
                    defaultChecked
                    className="mt-1 h-4 w-4 accent-[var(--navy)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--navy)]">{AREA_LABELS[area].label}</span>
                    <span className="block text-sm text-stone-600">{AREA_LABELS[area].blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="mt-5 block">
          <span className={captionClass}>Note to yourself</span>
          <input name="note" className={inputClass} placeholder="Why they have access, when to review it" />
        </label>

        <div className="mt-5">
          <button type="submit" disabled={savePending || !storageReady} className={submitClass}>
            {savePending ? "Saving…" : "Give access"}
          </button>
        </div>
        <Status state={saveState} />
      </form>
    </div>
  );
}
