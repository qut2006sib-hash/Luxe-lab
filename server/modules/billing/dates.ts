export function getBillingPeriod(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getDueDate(
  year: number,
  monthIndex: number,
  dueDay: number
): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, monthIndex, Math.min(Math.max(dueDay, 1), lastDay))
  );
}

export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateInTimeZone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );
  return new Date(
    Date.UTC(values.year, values.month - 1, values.day, 12, 0, 0, 0)
  );
}
