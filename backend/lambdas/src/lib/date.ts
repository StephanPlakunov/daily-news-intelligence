export const APP_TIMEZONE = "Europe/Berlin";
export const EARLIEST_SUPPORTED_DIGEST_DATE = "2026-04-01";

function formatDateParts(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(now);
}

export function getTodayDateString(now: Date = new Date()): string {
  return formatDateParts(now);
}

export function normalizeRequestedDate(input: string | undefined, now: Date = new Date()): string {
  if (!input) {
    return getTodayDateString(now);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error("The date query parameter must use YYYY-MM-DD format.");
  }

  if (input < EARLIEST_SUPPORTED_DIGEST_DATE) {
    throw new Error(`The earliest supported digest date is ${EARLIEST_SUPPORTED_DIGEST_DATE}.`);
  }

  const today = getTodayDateString(now);

  if (input > today) {
    throw new Error("The requested digest date cannot be in the future.");
  }

  return input;
}
