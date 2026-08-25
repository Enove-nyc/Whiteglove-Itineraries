"use client";

import { useMemo, useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import AreaMap from "@/components/AreaMap";
import { MAP_STYLE } from "@/lib/map-icons";
import { pointFrom, withinArea, type MapMarker, type Point } from "@/lib/map-markers";

export type MapKever = {
  slug: string;
  name: string;
  city: string;
  country: string;
  coordinates: string;
  /** External link for a locator-only bais hachaim; defaults to its /cemeteries page. */
  href?: string;
};

export type MapAirport = { code: string; name: string; city: string; lat: number; lng: number; size: string };
export type MapAttraction = { slug: string; name: string; city: string; country: string; kind: string; coordinates?: string };
export type MapStay = { slug: string; name: string; city: string; country: string; kind: string; coordinates?: string; season?: string };
export type MapShul = { id: string; name: string; city: string; country: string; href: string; coordinates?: string | null };

const RADII = [10, 25, 50, 100, 200];

export default function MapExplorer({
  kevarim,
  airports,
  attractions,
  stays,
  shuls,
}: {
  kevarim: MapKever[];
  airports: MapAirport[];
  attractions: MapAttraction[];
  stays: MapStay[];
  shuls: MapShul[];
}) {
  // Null means nobody has searched, and the map opens on everything.
  //
  // It used to open on Kraków at 50 km, which showed a handful of the site's
  // content and none of the rest — somebody who did not already know to type a
  // town saw one corner of Poland and concluded that was all there was.
  const [center, setCenter] = useState<Point | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(50);
  const [status, setStatus] = useState("");

  function search(value: string, coords?: string) {
    const label = value.trim();
    if (!label) return;
    setStatus("Finding that listing…");

    const normalized = label.toLocaleLowerCase("en");
    const locations = [
      ...kevarim.map((place) => ({
        name: place.name,
        city: place.city,
        country: place.country,
        coordinates: place.coordinates,
      })),
      ...attractions.flatMap((place) => place.coordinates ? [{
        name: place.name,
        city: place.city,
        country: place.country,
        coordinates: place.coordinates,
      }] : []),
      ...stays.flatMap((place) => place.coordinates ? [{
        name: place.name,
        city: place.city,
        country: place.country,
        coordinates: place.coordinates,
      }] : []),
      ...shuls.flatMap((place) => place.coordinates ? [{
        name: place.name,
        city: place.city,
        country: place.country,
        coordinates: place.coordinates,
      }] : []),
      ...airports.map((place) => ({
        name: place.name,
        city: place.city,
        country: "",
        coordinates: `${place.lat}, ${place.lng}`,
      })),
    ];
    const ours = locations.find((place) => place.city.toLocaleLowerCase("en") === normalized)
      ?? locations.find((place) => `${place.name} ${place.city} ${place.country}`.toLocaleLowerCase("en").includes(normalized));
    const fromPicker = coords ? pointFrom(coords) : null;
    const point = fromPicker ?? (ours ? pointFrom(ours.coordinates) : null);

    if (!point) {
      setStatus(`Could not find “${label}”. Try a listed destination or place name.`);
      return;
    }
    setCenter(point);
    setName(ours?.city || label);
    setStatus("");
  }

  function showEverything() {
    setCenter(null);
    setName(null);
    setQuery("");
    setStatus("");
  }

  /** Everything the site can plot, before any search narrows it. */
  const everything = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const k of kevarim) {
      const p = pointFrom(k.coordinates);
      if (!p) continue;
      out.push({
        id: `kever-${k.slug}`,
        name: k.name,
        subtitle: `${k.city} · ${k.country}`,
        lat: p.lat,
        lng: p.lng,
        href: k.href ?? `/cemeteries/${k.slug}`,
        kind: "kever",
      });
    }
    for (const a of attractions) {
      const p = pointFrom(a.coordinates);
      if (!p) continue;
      out.push({
        id: `attraction-${a.slug}`,
        name: a.name,
        subtitle: `${a.city} · ${a.country} · ${a.kind}`,
        lat: p.lat,
        lng: p.lng,
        href: `/attractions#${a.slug}`,
        kind: "attraction",
      });
    }
    for (const s of stays) {
      const p = pointFrom(s.coordinates);
      if (!p) continue;
      out.push({
        id: `stay-${s.slug}`,
        name: s.name,
        subtitle: [`${s.city} · ${s.country}`, s.kind, s.season].filter(Boolean).join(" · "),
        lat: p.lat,
        lng: p.lng,
        href: `/kosher-stays#${s.slug}`,
        kind: "stay",
      });
    }
    for (const s of shuls) {
      const p = pointFrom(s.coordinates);
      if (!p) continue;
      out.push({
        id: `shul-${s.id}`,
        name: s.name,
        subtitle: `${s.city} · ${s.country}`,
        lat: p.lat,
        lng: p.lng,
        href: s.href,
        kind: "shul",
      });
    }
    for (const a of airports) {
      out.push({
        id: `airport-${a.code}`,
        name: `${a.city} (${a.code})`,
        subtitle: `${a.name} · ${a.size === "major" ? "major hub" : "regional"}`,
        lat: a.lat,
        lng: a.lng,
        kind: "airport",
      });
    }
    return out;
  }, [kevarim, attractions, stays, shuls, airports]);

  const markers = useMemo<MapMarker[]>(() => {
    const inArea = withinArea(everything, center, radius);
    if (!center || !name) return inArea;
    return [
      { id: "center", name, lat: center.lat, lng: center.lng, kind: "center", subtitle: "What you searched for" },
      ...inArea,
    ];
  }, [everything, center, name, radius]);

  const nearby = useMemo(
    () => markers.filter((m) => m.kind === "kever" || m.kind === "attraction" || m.kind === "stay" || m.kind === "shul").sort((a, b) => (a.km ?? 0) - (b.km ?? 0)),
    [markers],
  );

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-[1.6fr_auto_auto] sm:items-end">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Search</span>
          <AddressAutocomplete
            value={query}
            onChange={(value, coords) => {
              setQuery(value);
              if (coords) void search(value, coords);
            }}
            placeholder="Destination, kever or listing name…"
            className="mt-1.5 w-full border border-[var(--gold-light)] px-3 py-3 text-base text-[var(--navy)] outline-none transition focus:border-[var(--gold)]"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Within</span>
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            disabled={!center}
            className="mt-1.5 w-full border border-[var(--gold-light)] px-3 py-3 text-base text-[var(--navy)] outline-none disabled:bg-stone-50 disabled:text-stone-400"
          >
            {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void search(query)}
          className="min-h-[50px] border border-[var(--navy)] bg-[var(--navy)] px-6 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
        >
          Show me
        </button>
      </div>

      {center && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={showEverything}
            className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            ← Back to everything
          </button>
        </div>
      )}

      {status && <p className="mt-3 text-sm font-semibold text-[var(--navy)]">{status}</p>}

      <div className="mt-5">
        <AreaMap
          center={center}
          centerName={name}
          markers={markers}
          radiusKm={Math.min(radius, 50)}
          loadKosher
          height={520}
        />
      </div>

      {center && (
        <div className="mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            {nearby.length
              ? `${nearby.length} ${nearby.length === 1 ? "place" : "places"} within ${radius} km of ${name}`
              : `Nothing within ${radius} km of ${name}`}
          </h2>
          {nearby.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-stone-600">Widen the radius above, or search a different town.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {nearby.map((m) => (
                <li key={m.id} className="wg-card border border-[var(--gold-light)] bg-[#fcfaf6] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: MAP_STYLE[m.kind].color }}>
                    {MAP_STYLE[m.kind].label}
                  </p>
                  <a href={m.href} className="mt-1 block font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
                    {m.name}
                  </a>
                  <p className="mt-1 text-xs text-stone-500">{m.subtitle}</p>
                  {/* Show the distance line only when a distance exists —
                      `{m.km?.toFixed(1)}` left a stray " km away" when km was
                      undefined. */}
                  {m.km != null ? <p className="mt-2 text-sm font-semibold text-[var(--gold-ink)]">{m.km.toFixed(1)} km away</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
