import { CalculationMethod, Coordinates, PrayerTimes } from "npm:adhan@4.4.6";
import { localDate, type PrayerTime } from "./schedule.ts";

/** Today's five prayer times (Egyptian General Authority method) for a location, in the person's local day. */
export function prayerTimesFor(latitude: number, longitude: number, timeZone: string, now: Date): PrayerTime[] {
  const [y, m, d] = localDate(now, timeZone).split("-").map(Number);
  // adhan reads the calendar date from the Date's local fields; the edge runtime runs in UTC.
  const t = new PrayerTimes(new Coordinates(latitude, longitude), new Date(y, m - 1, d), CalculationMethod.Egyptian());
  return [
    { name: "fajr", at: t.fajr },
    { name: "dhuhr", at: t.dhuhr },
    { name: "asr", at: t.asr },
    { name: "maghrib", at: t.maghrib },
    { name: "isha", at: t.isha },
  ];
}
