import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getOrSeedPaymentFunds } from '@/lib/server/paymentFunds'
import { invalidate } from '@/lib/server/cache'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { searchParams } = new URL(req.url)
    const execute = searchParams.get('execute') === 'true'

    // Secure it by requiring cashbook.manage permission
    const { connector } = await requireShopAccess(shopId, 'cashbook.manage')

    // 1. Fetch cashbook entries with category = 'inventory'
    const cashbookRes = await connector.list('cashbook', {
      limit: 10000,
      filters: { branch_id: shopId }
    })
    
    const transactions = cashbookRes.data as Record<string, any>[]
    const missingFundTxs = transactions.filter(
      tx => tx.category === 'inventory' && tx.type === 'payment' && (!tx.fund_id || tx.fund_id === '')
    )

    if (missingFundTxs.length === 0) {
      return NextResponse.json({
        ok: true,
        dry_run: !execute,
        message: 'Không tìm thấy giao dịch nhập hàng nào bị thiếu quỹ.',
        updated_transactions: []
      })
    }

    // 2. Fetch/seed funds
    let funds: Record<string, any>[] = []
    if (execute) {
      funds = await getOrSeedPaymentFunds(connector, shopId)
    } else {
      // For dry run, list available funds or simulate seeding
      const fundsRes = await connector.list('payment-funds', {
        filters: { branch_id: shopId },
        limit: 100
      })
      funds = fundsRes.data as Record<string, any>[]
      if (funds.length === 0) {
        funds = [
          { id: 'simulated-cash-id', name: 'Quỹ tiền mặt tại quầy (Sẽ tự động tạo khi chạy thật)', type: 'cash', current_balance: '0', is_default: 'TRUE' },
          { id: 'simulated-bank-id', name: 'Tài khoản ngân hàng mặc định (Sẽ tự động tạo khi chạy thật)', type: 'bank', current_balance: '0', is_default: 'FALSE' },
          { id: 'simulated-wallet-id', name: 'Ví điện tử (Momo, ZaloPay...) (Sẽ tự động tạo khi chạy thật)', type: 'wallet', current_balance: '0', is_default: 'FALSE' }
        ]
      }
    }

    const defaultCashFund = funds.find(f => f.type === 'cash' && f.is_default === 'TRUE') || funds.find(f => f.type === 'cash')
    const defaultBankFund = funds.find(f => f.type === 'bank' && f.is_default === 'TRUE') || funds.find(f => f.type === 'bank')
    const fallbackFund = funds.find(f => f.is_default === 'TRUE') || funds[0]

    // Keep track of fund balance updates locally during migration
    const fundBalanceMap = new Map<string, number>()
    funds.forEach(f => fundBalanceMap.set(f.id, parseFloat(f.current_balance || '0')))

    const updatedTransactionsList = []

    for (const tx of missingFundTxs) {
      const amt = parseFloat(tx.amount || '0')
      const method = tx.method || 'cash'
      
      // Find matching fund
      const targetFund = method === 'cash' || method?.startsWith('cash-')
        ? (defaultCashFund || fallbackFund)
        : (defaultBankFund || defaultCashFund || fallbackFund)

      if (!targetFund) {
        continue
      }

      const currentBal = fundBalanceMap.get(targetFund.id) ?? parseFloat(targetFund.current_balance || '0')
      const nextBal = currentBal - amt
      fundBalanceMap.set(targetFund.id, nextBal)

      if (execute) {
        // Update cashbook entry
        await connector.update('cashbook', tx.transaction_id || tx.id, {
          fund_id: targetFund.id,
          balance_after_transaction: String(nextBal)
        })
      }

      updatedTransactionsList.push({
        transaction_id: tx.transaction_id || tx.id,
        amount: amt,
        method,
        note: tx.note || '',
        created_at: tx.created_at || '',
        assigned_fund_id: targetFund.id,
        assigned_fund_name: targetFund.name,
        balance_before: currentBal,
        balance_after: nextBal
      })
    }

    if (execute) {
      // Update the actual database fund balances
      for (const [fundId, newBalance] of fundBalanceMap.entries()) {
        const originalFund = funds.find(f => f.id === fundId)
        const originalBalance = originalFund ? parseFloat(originalFund.current_balance || '0') : 0
        if (originalBalance !== newBalance) {
          await connector.update('payment-funds', fundId, {
            current_balance: String(newBalance)
          })
        }
      }

      // Invalidate caches
      invalidate(shopId, 'cashbook')
      invalidate(shopId, 'payment-funds')
    }

    return NextResponse.json({
      ok: true,
      dry_run: !execute,
      message: execute
        ? `Đã cập nhật thành công ${updatedTransactionsList.length} giao dịch bị thiếu quỹ cho chi nhánh.`
        : `[Dry Run] Phát hiện ${updatedTransactionsList.length} giao dịch bị thiếu quỹ cần được cập nhật.`,
      updated_transactions: updatedTransactionsList
    })

  } catch (e: any) {
    console.error('Migration API failed:', e)
    return NextResponse.json(
      { error: e.message || 'Lỗi hệ thống khi chạy API kiểm tra/cập nhật quỹ.' },
      { status: 500 }
    )
  }
}
