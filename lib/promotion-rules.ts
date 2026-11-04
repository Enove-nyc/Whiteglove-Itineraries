import type { Promotion, PromotionDevice, PromotionPlacement } from "@/lib/admin-content";

export function parsePromotionTargets(targetPaths: string) {
  return targetPaths
    .split(/\r?\n|,/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function matchesPromotionPath(promotion: Promotion, pathname: string) {
  const targets = parsePromotionTargets(promotion.targetPaths);
  if (targets.length === 0 || targets.includes("*")) return true;
  return targets.some((target) => pathname === target || pathname.startsWith(target.endsWith("/") ? target : `${target}/`));
}

function matchesPromotionDevice(promotion: Promotion, device: PromotionDevice) {
  return promotion.device === "all" || promotion.device === device;
}

function isPromotionActive(promotion: Promotion) {
  const now = new Date();
  if (promotion.startDate) {
    const start = new Date(promotion.startDate);
    if (Number.isFinite(start.getTime()) && start > now) return false;
  }
  if (promotion.endDate) {
    const end = new Date(promotion.endDate);
    if (Number.isFinite(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (end < now) return false;
    }
  }
  return true;
}

export function selectActivePromotions(promotions: Promotion[], placement: PromotionPlacement, pathname: string, device: PromotionDevice) {
  return promotions
    .filter((promotion) => promotion.enabled)
    .filter((promotion) => promotion.placements.includes(placement))
    .filter((promotion) => matchesPromotionDevice(promotion, device))
    .filter((promotion) => matchesPromotionPath(promotion, pathname))
    .filter(isPromotionActive)
    .sort((left, right) => right.priority - left.priority || right.updatedAt.localeCompare(left.updatedAt));
}
