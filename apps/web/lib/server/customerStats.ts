import { RollbackContext } from '@oni/adapters'

interface CustomerStatsUpdate {
  debt_amount?: string
  loyalty_points?: string
  prepaid_balance?: string
  note?: string
  customer_type?: string
}

/**
 * Updates a customer's CRM/accounting statistics (debt, loyalty points, prepaid balance)
 * in both the main `customers` table and the branch-specific `customer-branch-stats` table.
 * 
 * Supports transaction rollback if a RollbackContext is provided.
 */
export async function updateCustomerStats(
  connector: any,
  customerId: string,
  branchId: string,
  updates: CustomerStatsUpdate,
  tx?: RollbackContext
) {
  if (customerId === 'C-DEFAULT-RETAIL') return

  // 1. Fetch current values for rollback
  const customer = await connector.findById('customers', customerId)
  if (!customer) throw new Error(`Customer not found: ${customerId}`)

  const currentCustomerDebt = customer.debt_amount || '0'
  const currentCustomerPoints = customer.loyalty_points || '0'
  const currentCustomerPrepaid = customer.prepaid_balance || '0'
  const currentCustomerType = customer.customer_type || 'retail'

  // Fetch branch-specific stats
  const statsRes = await connector.list('customer-branch-stats', {
    filters: { customer_id: customerId, branch_id: branchId }
  })
  const stats = statsRes.data[0]

  const currentStatsDebt = stats?.debt_amount || '0'
  const currentStatsPoints = stats?.loyalty_points || '0'
  const currentStatsPrepaid = stats?.prepaid_balance || '0'
  const currentStatsNote = stats?.note || ''

  // 2. Perform updates to the main customers table
  const mainUpdates: Record<string, string> = {}
  if (updates.debt_amount !== undefined) mainUpdates.debt_amount = updates.debt_amount
  if (updates.loyalty_points !== undefined) mainUpdates.loyalty_points = updates.loyalty_points
  if (updates.prepaid_balance !== undefined) mainUpdates.prepaid_balance = updates.prepaid_balance
  if (updates.customer_type !== undefined) mainUpdates.customer_type = updates.customer_type
  
  if (Object.keys(mainUpdates).length > 0) {
    await connector.update('customers', customerId, mainUpdates)
  }

  // 3. Perform updates to the customer-branch-stats table
  const statsUpdates: Record<string, string> = {}
  if (updates.debt_amount !== undefined) statsUpdates.debt_amount = updates.debt_amount
  if (updates.loyalty_points !== undefined) statsUpdates.loyalty_points = updates.loyalty_points
  if (updates.prepaid_balance !== undefined) statsUpdates.prepaid_balance = updates.prepaid_balance
  if (updates.note !== undefined) statsUpdates.note = updates.note

  let createdStatsId: string | null = null

  if (stats) {
    if (Object.keys(statsUpdates).length > 0) {
      await connector.update('customer-branch-stats', stats.id, statsUpdates)
    }
  } else {
    // Create new stats record inheriting from the main customer profile if no updates provided
    const createdStats = await connector.create('customer-branch-stats', {
      customer_id: customerId,
      branch_id: branchId,
      debt_amount: updates.debt_amount !== undefined ? updates.debt_amount : currentCustomerDebt,
      loyalty_points: updates.loyalty_points !== undefined ? updates.loyalty_points : currentCustomerPoints,
      prepaid_balance: updates.prepaid_balance !== undefined ? updates.prepaid_balance : currentCustomerPrepaid,
      note: updates.note !== undefined ? updates.note : ''
    })
    createdStatsId = createdStats.id
  }

  // 4. Register rollbacks if context is provided
  if (tx) {
    tx.add(async () => {
      // Rollback customers table
      const mainRollback: Record<string, string> = {}
      if (updates.debt_amount !== undefined) mainRollback.debt_amount = currentCustomerDebt
      if (updates.loyalty_points !== undefined) mainRollback.loyalty_points = currentCustomerPoints
      if (updates.prepaid_balance !== undefined) mainRollback.prepaid_balance = currentCustomerPrepaid
      if (updates.customer_type !== undefined) mainRollback.customer_type = currentCustomerType

      if (Object.keys(mainRollback).length > 0) {
        await connector.update('customers', customerId, mainRollback).catch(() => {})
      }

      // Rollback customer-branch-stats table
      if (createdStatsId) {
        // Delete the newly created stats row
        await connector.delete('customer-branch-stats', createdStatsId).catch(() => {})
      } else if (stats) {
        const statsRollback: Record<string, string> = {}
        if (updates.debt_amount !== undefined) statsRollback.debt_amount = currentStatsDebt
        if (updates.loyalty_points !== undefined) statsRollback.loyalty_points = currentStatsPoints
        if (updates.prepaid_balance !== undefined) statsRollback.prepaid_balance = currentStatsPrepaid
        if (updates.note !== undefined) statsRollback.note = currentStatsNote

        if (Object.keys(statsRollback).length > 0) {
          await connector.update('customer-branch-stats', stats.id, statsRollback).catch(() => {})
        }
      }
    })
  }
}
