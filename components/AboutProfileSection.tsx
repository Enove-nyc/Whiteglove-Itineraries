import { ABOUT_HEADING, aboutIntroFor, type AboutProfile } from "@/data/about-profile";
import { LISTING_AUDIENCE_ABOUT } from "@/data/listing-audience";
import { isSafeAboutPhotoUrl } from "@/lib/about-profile";
import { BRAND_NAME, type SiteBrand } from "@/lib/site-brand-core";

/**
 * The top of the About page.
 *
 * WRITTEN FOR A PAGE WITH NO BIOGRAPHY ON IT. The owner has decided it carries
 * no personal facts at all — no name, no background, and no location either,
 * because White Glove is not based anywhere: it is a website. The old shape
 * asked "Who you are dealing with." and then answered with nobody, in a
 * two-column grid built for a photograph and a career history that are never
 * coming.
 *
 * So the intro paragraphs ARE the page. They stand on their own and are not
 * waiting on anything: what the site is for, and what its information is
 * worth, which is what a family deciding whether to trust it is actually
 * asking. Nothing below is missing when every field is blank — blank is the
 * expected state.
 *
 * The personal grid is still here and still works. Nothing about this decision
 * is irreversible: fill any of those fields in and they appear, exactly as
 * before. What has gone is the page implying they are missing.
 */
export default function AboutProfileSection({ profile, siteBrand }: { profile: AboutProfile; siteBrand: SiteBrand }) {
  // Location is deliberately not in this list. It is shown in the paragraphs
  // below, so counting it here would open an empty grid beside them.
  const hasBio = Boolean(
    profile.name ||
      profile.experience ||
      profile.languages ||
      profile.whyCreated ||
      (profile.photoUrl && profile.photoAlt && isSafeAboutPhotoUrl(profile.photoUrl)),
  );

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">About White Glove</p>
      <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
        {ABOUT_HEADING[siteBrand]}
      </h1>

      <div className="mt-6 max-w-3xl space-y-5">
        {aboutIntroFor(siteBrand).map((line, index) => (
          <p key={line} className={index === 0 ? "text-lg leading-8 text-stone-600" : "leading-7 text-stone-600"}>
            {line}
          </p>
        ))}
        {/* WHAT THIS SITE LISTS — and it only lists anything on the kosher
            side. That paragraph describes how places are chosen for the
            directory, which the itineraries site does not have: it holds
            somebody's own trip, not a curated list of anywhere. Printing it
            there would have the planner explaining an editorial standard it
            does not apply to anything. */}
        {siteBrand === "kosher" && <p className="leading-7 text-stone-600">{LISTING_AUDIENCE_ABOUT}</p>}
        {/* Normally absent, and that is correct: a website is not based
            anywhere. Kept for the day there is a place worth naming, and shown
            as a sentence rather than a label so it reads as part of the
            paragraph above rather than as a field somebody filled in. */}
        {profile.location && (
          <p className="leading-7 text-stone-600">
            {BRAND_NAME[siteBrand]} is based in {profile.location}.
          </p>
        )}
      </div>

      {hasBio && (
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:items-start">
          {profile.photoUrl && profile.photoAlt && isSafeAboutPhotoUrl(profile.photoUrl) && (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded blob via /api/media
            <img
              src={profile.photoUrl}
              alt={profile.photoAlt}
              className="aspect-[4/5] w-full max-w-[220px] object-cover"
            />
          )}
          <div className="space-y-5">
            {profile.name && (
              <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{profile.name}</p>
            )}
            {profile.experience && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Experience</p>
                <p className="mt-1 leading-7 text-stone-600">{profile.experience}</p>
              </div>
            )}
            {profile.languages && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Languages</p>
                <p className="mt-1 leading-7 text-stone-600">{profile.languages}</p>
              </div>
            )}
            {profile.whyCreated && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Why White Glove</p>
                <p className="mt-1 leading-7 text-stone-600">{profile.whyCreated}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
