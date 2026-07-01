import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.funds.manage')

    // 1. Fetch all payment funds
    const fundsRes = await connector.list('payment-funds', { limit: 1000, filters: { branch_id: shopId } })
    const funds = fundsRes.data as any[]

    // 2. Filter duplicate "Quỹ tiền mặt mặc định"
    const defaultFunds = funds.filter(f => f.name === 'Quỹ tiền mặt mặc định' && f.type === 'cash')
    
    if (defaultFunds.length <= 1) {
      return NextResponse.json({ message: 'Không tìm thấy quỹ trùng lặp nào.', count: 0 })
    }

    // 3. Identify the primary fund (prefer is_default = TRUE, or oldest)
    defaultFunds.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
    let primaryFund = defaultFunds.find(f => f.is_default === 'TRUE')
    if (!primaryFund) {
      primaryFund = defaultFunds[0]
      // Make it default
      await connector.update('payment-funds', primaryFund.id, { is_default: 'TRUE' })
      primaryFund.is_default = 'TRUE'
    }

    const duplicates = defaultFunds.filter(f => f.id !== primaryFund.id)

    let mergedTransactionsCount = 0
    let primaryBalance = parseFloat(primaryFund.current_balance || '0')

    for (const dup of duplicates) {
      const dupBalance = parseFloat(dup.current_balance || '0')
      
      // Find all transactions for this duplicate fund directly to avoid 100k limit issues
      const dupCbRes = await connector.list('cashbook', { limit: 10000, filters: { fund_id: dup.id } })
      const dupTxs = dupCbRes.data as any[]
      
      // Migrate each transaction to the primary fund
      for (const tx of dupTxs) {
        await connector.update('cashbook', tx.id || tx.transaction_id, {
          fund_id: primaryFund.id
        })
        mergedTransactionsCount++
      }

      // Add balance to primary (use Math.round to avoid JS floating point issues like .000000001)
      primaryBalance = Math.round(primaryBalance + dupBalance)

      // Delete the duplicate fund
      await connector.delete('payment-funds', dup.id)
    }

    // Update primary fund balance
    await connector.update('payment-funds', primaryFund.id, {
      current_balance: String(primaryBalance)
    })

    invalidate(shopId, 'payment-funds')
    invalidate(shopId, 'cashbook')

    return NextResponse.json({
      message: 'Gộp quỹ thành công',
      primary_fund_id: primaryFund.id,
      duplicates_removed: duplicates.length,
      transactions_migrated: mergedTransactionsCount,
      new_balance: primaryBalance
    })

  } catch (error: any) {
    console.error('Heal funds error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
