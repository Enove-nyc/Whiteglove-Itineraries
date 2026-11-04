export const TRIP_CHAT_CHANNELS = [
  { id: "general", label: "General" },
  { id: "hotels", label: "Hotels & rooms" },
  { id: "flights", label: "Flights" },
  { id: "plans", label: "Trip plans" },
] as const;
export type TripChatChannel = typeof TRIP_CHAT_CHANNELS[number]["id"];
export function isTripChatChannel(value: unknown): value is TripChatChannel {
  return typeof value === "string" && TRIP_CHAT_CHANNELS.some(channel => channel.id === value);
}
