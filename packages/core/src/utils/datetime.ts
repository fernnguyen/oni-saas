/**
 * GMT+7 (Asia/Ho_Chi_Minh) DateTime Utilities
 */

/**
 * Generates a string in "yyyy-MM-dd HH:mm:ss" or "yyyy-MM-ddTHH:mm:ss" format representing the time in GMT+7.
 * This is timezone-naive and matches the database's local timestamp expectations.
 */
export function getGMT7Time(date?: Date | string): string {
  const d = date ? new Date(date) : new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

/**
 * Safely parses a Date object, ISO string, or timezone-naive date string
 * into a browser Date object aligned to GMT+7.
 */
export function parseGMT7Date(dateInput: Date | string | null | undefined): Date {
  if (!dateInput) return new Date()
  if (dateInput instanceof Date) return dateInput
  
  let str = dateInput.trim()
  if (!str.includes('T') && str.includes(' ')) {
    str = str.replace(' ', 'T')
  }
  
  // If it's a timezone-naive ISO string (contains T but doesn't end with Z or + offset),
  // we append 'Z' to treat it as UTC, which the browser will then correctly convert
  // to local GMT+7 time when local methods (like getHours()) are called.
  if (str.includes('T') && !str.endsWith('Z') && !str.includes('+')) {
    return new Date(str + 'Z')
  }
  return new Date(str)
}
