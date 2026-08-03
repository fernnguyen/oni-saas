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

export function formatHrmDateTime(
  value: string | Date | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : fallback;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get('hour')}:${values.get('minute')}:${values.get('second')} ${values.get('day')}/${values.get('month')}/${values.get('year')}`;
}
