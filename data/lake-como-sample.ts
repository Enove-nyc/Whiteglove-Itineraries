import { emptyItinerary, type Itinerary } from "@/data/itinerary";
import { datePlus } from "@/lib/trip-setup";

const stops = [
  { id: "como-old-town", name: "Como old town", address: "Piazza del Duomo, Como", coordinates: "45.8114,9.0838", startTime: "10:00", notes: "Start in the cathedral square and walk to the waterfront." },
  { id: "villa-melzi", name: "Villa Melzi gardens", address: "Via Lungo Lario Manzoni, Bellagio", coordinates: "45.9784,9.2543", startTime: "10:30", notes: "Check seasonal hours before heading over." },
  { id: "villa-monastero", name: "Villa Monastero", address: "Viale Giovanni Polvani, Varenna", coordinates: "46.0081,9.2864", startTime: "11:00", notes: "Leave time for a lakeside walk after the gardens." },
];

export function lakeComoSample(startDate = ""): Itinerary {
  return {
    ...emptyItinerary(),
    title: "Three days on Lake Como",
    startDate,
    endDate: datePlus(startDate, stops.length - 1),
    activities: stops.map((stop, index) => ({
      ...stop,
      date: datePlus(startDate, index),
      durationMins: 90,
      country: "Italy",
    })),
  };
}

export const LAKE_COMO_PREVIEW = lakeComoSample("2027-05-17");
