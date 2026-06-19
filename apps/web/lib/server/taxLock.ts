import { getGMT7Time } from '@oni/core'

/**
 * Checks if a given date/time string falls within a locked tax period.
 * 
 * @param connector The database connector
 * @param branchId The shop/branch ID
 * @param dateStr The date string (e.g. YYYY-MM-DD, ISO string, etc.)
 */
export async function isDateLocked(
  connector: any,
  branchId: string,
  dateStr?: string
): Promise<boolean> {
  const checkDate = (dateStr || getGMT7Time()).split('T')[0] // Get YYYY-MM-DD

  // Query locked periods for this branch
  const lockedRes = await connector.list('tax-locked-periods', {
    filters: { branch_id: branchId, status: 'locked' },
    limit: 200,
  })

  const periods = lockedRes.data as Array<{
    start_date: string
    end_date: string
  }>

  for (const period of periods) {
    if (checkDate >= period.start_date && checkDate <= period.end_date) {
      return true
    }
  }

  return false
}
