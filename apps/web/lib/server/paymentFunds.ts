import { RollbackContext } from '@oni/adapters'
import { invalidate } from './cache'

export async function getOrSeedPaymentFunds(
  connector: any,
  branchId: string
): Promise<Record<string, string>[]> {
  const fundsRes = await connector.list('payment-funds', {
    filters: { branch_id: branchId },
    limit: 100
  })
  let funds = fundsRes.data as Record<string, string>[]

  if (funds.length === 0) {
    const defaultCash = await connector.create('payment-funds', {
      branch_id: branchId,
      name: 'Quỹ tiền mặt tại quầy',
      type: 'cash',
      account_number: '',
      bank_name: '',
      initial_balance: '0',
      current_balance: '0',
      is_default: 'TRUE',
      active: 'TRUE',
    }) as Record<string, string>

    const defaultBank = await connector.create('payment-funds', {
      branch_id: branchId,
      name: 'Tài khoản ngân hàng mặc định',
      type: 'bank',
      account_number: '',
      bank_name: '',
      initial_balance: '0',
      current_balance: '0',
      is_default: 'FALSE',
      active: 'TRUE',
    }) as Record<string, string>

    const defaultWallet = await connector.create('payment-funds', {
      branch_id: branchId,
      name: 'Ví điện tử (Momo, ZaloPay...)',
      type: 'wallet',
      account_number: '',
      bank_name: '',
      initial_balance: '0',
      current_balance: '0',
      is_default: 'FALSE',
      active: 'TRUE',
    }) as Record<string, string>

    funds = [defaultCash, defaultBank, defaultWallet]
    invalidate(branchId, 'payment-funds')
  }

  return funds
}

export interface PaymentItem {
  amount: string | number
  method?: string
  fund_id?: string
}

/**
 * Resolves the appropriate payment fund for a given payment method,
 * updates the fund's balance in the database, and registers a transaction rollback.
 * 
 * @param connector The database connector
 * @param branchId The branch ID (shopId)
 * @param payment The payment details (amount, method, fund_id)
 * @param isExpense True if money flows OUT of the fund (e.g. supplier payment, customer refund),
 *                  False if money flows IN (e.g. installment payment receipt)
 * @param tx The RollbackContext for atomic transaction rollback
 * @returns Object containing resolved fundId and balanceAfter
 */
export async function resolveAndRecordPayment(
  connector: any,
  branchId: string,
  payment: PaymentItem,
  isExpense: boolean,
  tx?: RollbackContext
): Promise<{ fundId: string; balanceAfter: string }> {
  const funds = await getOrSeedPaymentFunds(connector, branchId)

  const defaultCashFund = funds.find(f => f.type === 'cash' && f.is_default === 'TRUE') || funds.find(f => f.type === 'cash')
  const defaultBankFund = funds.find(f => f.type === 'bank' && f.is_default === 'TRUE') || funds.find(f => f.type === 'bank')
  const defaultWalletFund = funds.find(f => f.type === 'wallet' && f.is_default === 'TRUE') || funds.find(f => f.type === 'wallet')
  const fallbackFund = funds.find(f => f.is_default === 'TRUE') || funds[0]

  const method = payment.method || 'cash'
  
  // Match the fund: explicit fund_id first, then smart match by payment method type
  const targetFund = payment.fund_id
    ? (funds.find(f => f.id === payment.fund_id) || fallbackFund)
    : (method === 'cash' || method?.startsWith('cash-')
        ? (defaultCashFund || fallbackFund)
        : (['momo', 'zalopay', 'vnpay', 'wallet'].includes(method) || method?.startsWith('momo-') || method?.startsWith('zalopay-') || method?.startsWith('vnpay-') || method?.startsWith('prepaid-')
            ? (defaultWalletFund || defaultBankFund || defaultCashFund || fallbackFund)
            : (defaultBankFund || defaultCashFund || fallbackFund)))

  if (!targetFund) {
    throw new Error('Không tìm thấy tài khoản quỹ thanh toán phù hợp.')
  }

  const amount = Math.abs(Number(payment.amount || 0))
  const currentBalance = parseFloat(targetFund.current_balance || '0')
  const nextBalance = isExpense ? currentBalance - amount : currentBalance + amount
  const balanceAfter = String(nextBalance)

  // Update fund balance in the database
  await connector.update('payment-funds', targetFund.id, {
    current_balance: balanceAfter
  })

  // Register rollback to restore the original balance on failure
  if (tx) {
    tx.add(async () => {
      await connector.update('payment-funds', targetFund.id, {
        current_balance: String(currentBalance)
      }).catch(() => {})
    })
  }

  invalidate(branchId, 'payment-funds')

  return {
    fundId: targetFund.id,
    balanceAfter
  }
}
