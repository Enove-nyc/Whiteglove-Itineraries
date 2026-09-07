"use client";

import { useEffect, useMemo, useState } from "react";
import { allHechsherim, UNVERIFIED, type Hechsher, type HechsherStatus } from "@/data/hechsherim";

/**
 * What the owner has confirmed about each of these places.
 *
 * Results are limited to White Glove listing IDs. Until a recorded status
 * arrives, callers get the neutral default instead of a made-up certification.
 */
export function useHechsherim(placeIds: string[]): { statuses: Record<string, HechsherStatus>; agencies: Hechsher[] } {
  const key = useMemo(() => [...new Set(placeIds.filter(Boolean))].sort().join(","), [placeIds]);
  const [loaded, setLoaded] = useState<{ key: string; map: Record<string, HechsherStatus>; agencies: Hechsher[] }>({
    key: "",
    map: {},
    agencies: allHechsherim(),
  });

  useEffect(() => {
    if (!key) return;
    let live = true;
    (async () => {
      try {
        // POST, WITH THE IDS IN THE BODY. They used to go in the query string,
        // and a page with a few hundred kosher places nearby built a URL longer
        // than Node's request-line limit — the server answered 431 and no
        // hechsher badge on that page ever loaded, silently, because a failed
        // lookup is treated as "nothing confirmed". Found on /admin/hechsherim
        // with the full directory seeded; the same hook serves KosherNearby on
        // the public destination pages.
        const res = await fetch("/api/kosher/hechsherim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: key.split(",") }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (live && data?.hechsherim) setLoaded({ key, map: data.hechsherim, agencies: allHechsherim(data.agencies) });
      } catch {
        /* everything stays unverified, which is the safe reading */
      }
    })();
    return () => {
      live = false;
    };
  }, [key]);

  return loaded.key === key ? { statuses: loaded.map, agencies: loaded.agencies } : { statuses: {}, agencies: loaded.agencies };
}

/**
 * One White Glove listing's stored hechsher, or the neutral default when no
 * editorial status has been recorded.
 */
export function hechsherOf(
  confirmed: Record<string, HechsherStatus>,
  place: { id: string },
  _agencies?: Hechsher[],
): HechsherStatus {
  return confirmed[place.id] ?? UNVERIFIED;
}
