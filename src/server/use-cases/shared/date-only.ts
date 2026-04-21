const DEFAULT_APP_TIME_ZONE = "Asia/Shanghai";

function getAppTimeZone() {
  return process.env.APP_TIME_ZONE?.trim() || DEFAULT_APP_TIME_ZONE;
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "");

  return { year, month, day };
}

export function getStartOfTodayInAppTimeZone(now = new Date()) {
  const timeZone = getAppTimeZone();
  const { year, month, day } = getDatePartsInTimeZone(now, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
}

export function normalizeDateOnlyUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getEndOfDayFromDateOnlyUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function addDaysDateOnlyUtc(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
