"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type BusinessBrand, MAX_BRAND_LINE, MAX_BRAND_NAME } from "@/lib/business-brand";
import { BRAND_DOMAIN, BRAND_NAME, type SiteBrand } from "@/lib/site-brand-core";

/**
 * An Advisor Pro account putting its own name on the itineraries it prints.
 *
 * ONLY DRAWN FOR AN ACCOUNT THAT CAN USE IT. Somebody on a lower plan does not
 * see a locked version of this with an upgrade button on it — a panel whose
 * only purpose is to advertise something is an advertisement, and this is a
 * person's own account page. What they get instead is the sentence in the plan
 * panel above, which says what Advisor Pro is for.
 *
 * THE PREVIEW IS OF THE REAL THING. What this shows — logo, name, the line
 * under it — is exactly what PrintableItinerary puts on the cover, including
 * the credit line, so nothing about the finished document is a surprise.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] transition focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

/** Comfortably inside what the store will take, once base64 has grown it. */
const MAX_UPLOAD_BYTES = 600 * 1024;

export default function BusinessBrandPanel({ brand, siteBrand }: { brand: BusinessBrand; siteBrand: SiteBrand }) {
  const router = useRouter();
  const siteName = BRAND_NAME[siteBrand];
  const siteDomain = BRAND_DOMAIN[siteBrand];
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(brand.name);
  const [contactLine, setContactLine] = useState(brand.contactLine);
  const [enabled, setEnabled] = useState(brand.enabled);
  const [logoUrl, setLogoUrl] = useState(brand.logoMediaId ? `/api/media?id=${encodeURIComponent(brand.logoMediaId)}` : "");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * TYPING YOUR NAME IS ASKING FOR YOUR NAME ON IT.
   *
   * The switch above these fields decides whether the cover carries the
   * business's own name, and it starts off. So somebody typed their name,
   * chose their logo, watched the preview go on showing the White Glove cover,
   * and had no way to tell whether the preview was broken or they were. The
   * switch was three inches away and read as a heading rather than as the
   * thing standing between them and what they were doing.
   *
   * Filling either field now turns it on, because that is unambiguously what
   * the person is asking for. Turning it OFF stays an explicit act — nothing
   * here ever quietly takes a business's name off its own itineraries.
   */
  function turnOwnBrandOn() {
    setEnabled(true);
  }

  function pickLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage({ ok: false, text: `That picture is ${Math.round(file.size / 1024)}KB. Keep a logo under ${Math.round(MAX_UPLOAD_BYTES / 1024)}KB.` });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      setLogoDataUrl(result);
      setLogoUrl(result);
      setRemoveLogo(false);
      turnOwnBrandOn();
    };
    reader.readAsDataURL(file);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/account/branding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contactLine, enabled, logoDataUrl: logoDataUrl || undefined, removeLogo }),
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setMessage({ ok: false, text: data?.error || "That could not be saved." });
      return;
    }
    setLogoDataUrl("");
    setRemoveLogo(false);
    setMessage({ ok: true, text: data?.summary || "Saved." });
    router.refresh();
  }

  return (
    <section className="mt-10 border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Advisor Pro</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Your name on the itinerary</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
        Plan the trip here and hand your client a document with your logo on the cover and your name in the header of
        every page. One line at the bottom says the itinerary was planned with {siteDomain}; everything
        else on it is yours.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
        Two things in the planner come with this. Each trip can say who it is for, so twenty of them do not all read
        &ldquo;Italy&rdquo; — and that name goes on the cover the client receives. And when the trip is finished you can
        send it to them from the planner: they get a link to read and print, the email comes from your name, and replies
        come back to you.
      </p>

      <form onSubmit={save} className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5">
          <label className="flex cursor-pointer gap-3 text-sm leading-7 text-stone-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-2" />
            <span>
              <span className="font-semibold text-[var(--navy)]">Use my own name and logo</span>
              <span className="block text-stone-500">
                Off, and your itineraries look like everybody else&rsquo;s. Turning it off later changes new printouts
                only — anything already printed is already printed.
              </span>
            </span>
          </label>

          <label className="block">
            <span className={captionClass}>Name on the cover</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) turnOwnBrandOn();
              }}
              maxLength={MAX_BRAND_NAME}
              placeholder="Kesser Travel"
            />
          </label>

          <label className="block">
            <span className={captionClass}>One line under it (optional)</span>
            <input
              className={inputClass}
              value={contactLine}
              onChange={(e) => setContactLine(e.target.value)}
              maxLength={MAX_BRAND_LINE}
              placeholder="718 555 0134 · trips@kessertravel.com"
            />
          </label>

          <div>
            <span className={captionClass}>Logo</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={pickLogo}
              className="mt-1.5 block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border file:border-[var(--gold-light)] file:bg-white file:px-4 file:py-2.5 file:text-xs file:font-bold file:uppercase file:tracking-[0.12em] file:text-[var(--navy)]"
            />
            <p className="mt-1.5 text-xs leading-5 text-stone-500">
              PNG, JPG or WEBP, under {Math.round(MAX_UPLOAD_BYTES / 1024)}KB. A wide logo on a plain background prints
              best. A name with no logo is a perfectly good letterhead.
            </p>
            {logoUrl && (
              <button
                type="button"
                onClick={() => {
                  setLogoUrl("");
                  setLogoDataUrl("");
                  setRemoveLogo(true);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="mt-2 text-xs font-semibold text-stone-500 underline"
              >
                Use no logo
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {message && (
              <span className={`text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</span>
            )}
          </div>
        </div>

        {/* The cover, roughly to scale. */}
        <div className="rounded-lg border border-[var(--gold-light)] bg-white p-5 text-center">
          <p className={`${captionClass} text-left`}>The cover</p>
          <div className="mt-3 flex min-h-40 flex-col items-center justify-center border border-[var(--gold-light)] px-4 py-6">
            {enabled && logoUrl ? (
              // A local file the visitor just chose, or a blob from /api/media.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="max-h-16 max-w-full object-contain" />
            ) : enabled && name.trim() ? (
              <p className="font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--navy)]">{name}</p>
            ) : (
              // The hand and the name as words, which is what the printed
              // cover does — /logo.png has "White Glove Itineraries" drawn
              // into the artwork, so it cannot be corrected by a label.
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-hand-navy.png" alt="" className="h-12 w-auto object-contain" />
                <p className="mt-2 font-[family-name:var(--font-display)] text-lg leading-none text-[var(--navy)]">
                  White Glove
                </p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
                  {siteBrand === "itineraries" ? "Itineraries" : "Kosher Travel"}
                </p>
              </>
            )}
            <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">
              {enabled && name.trim() ? `Prepared by ${name}` : `A ${siteName} journey`}
            </p>
            {enabled && contactLine.trim() && <p className="mt-1.5 text-[10px] text-stone-500">{contactLine}</p>}
            <p className="mt-4 font-[family-name:var(--font-display)] text-base text-[var(--navy)]">Your client&rsquo;s trip</p>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-stone-500">
            {enabled && name.trim() ? `Planned with ${siteDomain}` : siteDomain}
          </p>
          {/* The one case where the preview is right and looks wrong: the
              switch is off and there is something to show. Said here rather
              than left as a silent contradiction. */}
          {!enabled && (name.trim() || logoUrl) ? (
            <p className="mt-2 text-xs leading-5 text-amber-800">
              &ldquo;Use my own name and logo&rdquo; is off, so this is what prints.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
