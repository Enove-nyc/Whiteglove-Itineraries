import type { Promotion, PromotionDevice, PromotionPlacement, PublicPromotion } from "@/lib/admin-content";
import { selectActivePromotions } from "@/lib/promotion-rules";

/** Public promotion reads avoid constructing the administrative location directory. */
async function readPromotions(): Promise<Promotion[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];
  try {
    const response = await fetch(url.replace(/\/$/, "") + "/get/" + encodeURIComponent("white-glove:content"), {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { result?: string | null };
    if (!payload.result) return [];
    const bundle = JSON.parse(payload.result) as { promotions?: unknown };
    return Array.isArray(bundle.promotions) ? bundle.promotions as Promotion[] : [];
  } catch {
    // An optional advertisement must not make a page unavailable.
    return [];
  }
}

export async function readActivePromotions(placement: PromotionPlacement, pathname: string, device: PromotionDevice) {
  return selectActivePromotions(await readPromotions(), placement, pathname, device).map(toPublicPromotion);
}

function toPublicPromotion(promotion: Promotion): PublicPromotion {
  const { id, title, description, buttonText, targetHref, imageUrl, pdfUrl, videoUrl, maxViewsPerVisitor, placements } = promotion;
  return { id, title, description, buttonText, targetHref, imageUrl, pdfUrl, videoUrl, maxViewsPerVisitor, placements };
}

/** One current store read supplies all slots, excluding advertiser contacts and internal counters. */
export async function getPublicPromotionSlots(pathname: string, device: PromotionDevice) {
  const promotions = await readPromotions();
  const first = (placement: PromotionPlacement) => {
    const promotion = selectActivePromotions(promotions, placement, pathname, device)[0];
    return promotion ? toPublicPromotion(promotion) : null;
  };
  return { topBanner: first("fixed-top-banner"), popup: first("popup"), bottomBanner: first("sticky-bottom-banner") };
}
