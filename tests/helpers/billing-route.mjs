import { registerHooks } from 'node:module';
const unsupported = 'async function unavailable() { throw new Error("Unexpected subscription/agency operation in Trip Pass test"); }';
const modules = {
 'next/server': 'export const NextRequest = Request; export const NextResponse = Response;',
 '@/lib/account-plan-store': `${unsupported} export { unavailable as getPlan, unavailable as setPlan };`,
 '@/lib/agency-store': `${unsupported} export { unavailable as agencyIdFor, unavailable as deleteInvite, unavailable as listOpenInvites, unavailable as readAgency, unavailable as setAccountAgency, unavailable as writeAgency };`,
 '@/lib/agency': 'export function isOwner() { return false; }',
 '@/lib/email': 'export async function sendSubscriptionNotification() { return globalThis[Symbol.for("whiteglove.payment-test")].notify(); }',
 '@/lib/plan-billing-store': `${unsupported} export async function rememberCustomer() { return true; } export async function accountForCustomer() { return null; } export { unavailable as ownEntitledPlan, unavailable as readSubscription, unavailable as writeSubscription };`,
};
export function mockBillingRouteDependencies() {
 return registerHooks({resolve(specifier, context, nextResolve) {
  if(context.parentURL?.endsWith('/app/api/billing/webhook/route.ts') && modules[specifier]) {
   return { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true };
  }
  return nextResolve(specifier,context);
 }});
}
