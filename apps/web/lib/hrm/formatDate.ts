const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/;

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!;
}

export function formatHrmDate(
  value: string | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  const match = ISO_DATE_PREFIX.exec(value);
  if (!match) return value;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isValidCalendarDate(year, month, day)) return value;

  return `${dayText}/${monthText}/${yearText}`;
}
