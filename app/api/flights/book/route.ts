import { NextResponse, type NextRequest } from "next/server";
import { duffelRefusal } from "@/lib/duffel-guard";
import { duffelBearer } from "@/lib/duffel-token";

import { DUFFEL_API_ORIGIN, duffelApiHeaders } from "@/lib/duffel-api";
import { bookingSignature, isBookingHost } from "@/lib/private-booking";

type Traveler = { firstName?: string; lastName?: string; email?: string; bornOn?: string; title?: string; gender?: string; phone?: string; passportNumber?: string; passportCountry?: string; passportExpires?: string };

const duffelHeaders = (token: string, request?: Request) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  "Duffel-Version": "v2",
  Authorization: `Bearer ${token}`,
  ...(request ? {
    "x-duffel-device-ip": request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
    "x-duffel-device-user-agent": request.headers.get("user-agent") ?? "White Glove Itineraries checkout",
  } : {}),
});

export async function POST(request: NextRequest) {
  const refused = await duffelRefusal(request, { privateBooking: true });
  if (refused) return NextResponse.json({ message: refused.error }, { status: refused.status });


  const access = duffelBearer();
  if (!access.ok) return NextResponse.json({ message: access.message, detail: access.detail }, { status: 503 });
  const token = access.token;

  const { offerId, threeDSecureSessionId, traveler } = await request.json() as { offerId?: string; threeDSecureSessionId?: string; traveler?: Traveler };
  if (!offerId || !threeDSecureSessionId || !traveler?.firstName || !traveler.lastName || !traveler.email || !traveler.bornOn || !traveler.title || !traveler.gender || !traveler.phone) {
    return NextResponse.json({ message: "Please complete every traveler detail before booking." }, { status: 400 });
  }

  const offerResponse = await fetch(`https://api.duffel.com/air/offers/${encodeURIComponent(offerId)}`, { headers: duffelHeaders(token), cache: "no-store" });
  if (!offerResponse.ok) return NextResponse.json({ message: "This flight is no longer available. Please search again for a current price." }, { status: 409 });
  const offer = (await offerResponse.json()).data;
  if (offer.passenger_identity_documents_required && (!traveler.passportNumber || !traveler.passportCountry || !traveler.passportExpires)) return NextResponse.json({ message: "This flight requires passport number, issuing country, and expiry date before it can be booked." }, { status: 422 });

  const passenger = {
    ...(offer.passengers?.[0]?.id ? { id: offer.passengers[0].id } : {}),
    given_name: traveler.firstName.trim(), family_name: traveler.lastName.trim(), email: traveler.email.trim(), born_on: traveler.bornOn,
    title: traveler.title, gender: traveler.gender, phone_number: traveler.phone.trim(),
    ...(traveler.passportNumber && traveler.passportCountry && traveler.passportExpires ? { identity_documents: [{ type: "passport", unique_identifier: traveler.passportNumber.trim(), issuing_country_code: traveler.passportCountry.trim().toUpperCase(), expires_on: traveler.passportExpires }] } : {}),
  };
  let customerUserId: string | undefined;
  if (isBookingHost(request.headers) && (access.kind === "test" || process.env.DUFFEL_ASSISTANT_LIVE === "1")) {
    const customer = await fetch(`${DUFFEL_API_ORIGIN}/identity/customer/users`, {
      method: "POST",
      headers: duffelApiHeaders(token),
      cache: "no-store",
      body: JSON.stringify({ data: {
        email: passenger.email, given_name: passenger.given_name, family_name: passenger.family_name,
      } }),
    }).catch(() => null);
    if (customer?.ok) {
      const details = await customer.json().catch(() => null);
      customerUserId = details?.data?.id;
    }
  }
  const orderResponse = await fetch("https://api.duffel.com/air/orders", {
    method: "POST", headers: duffelHeaders(token, request), cache: "no-store",
    body: JSON.stringify({ data: {
      type: "instant", selected_offers: [offer.id], passengers: [passenger],
      ...(customerUserId ? { users: [customerUserId] } : {}),
      payments: [{ type: "card", currency: offer.total_currency, amount: offer.total_amount, three_d_secure_session_id: threeDSecureSessionId }],
    } }),
  });
  const result = await orderResponse.json().catch(() => ({}));
  if (!orderResponse.ok) {
    const reason = result.errors?.[0]?.message ?? result.errors?.[0]?.title;
    return NextResponse.json({ message: reason ?? "Duffel could not complete the booking. No ticket has been issued." }, { status: 422 });
  }
  let assistantReceipt: string | undefined;
  if (customerUserId && result.data?.users?.includes(customerUserId)) {
    const expires = Math.floor(Date.now() / 1000) + 30 * 60;
    const payload = `${customerUserId}.${expires}`;
    const signature = await bookingSignature(`assistant:${payload}`).catch(() => null);
    if (signature) assistantReceipt = `${payload}.${signature}`;
  }
  return NextResponse.json({ assistantReceipt, bookingReference: result.data?.booking_reference, orderId: result.data?.id, airline: result.data?.owner?.name, totalAmount: result.data?.total_amount, totalCurrency: result.data?.total_currency });
}
