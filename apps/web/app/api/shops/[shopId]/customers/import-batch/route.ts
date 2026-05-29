import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'customers.create')

    const body = await req.json() as {
      customers: any[]
      conflict_strategy: 'skip' | 'overwrite'
      balance_strategy: 'overwrite' | 'accumulate'
    }

    const { customers: importList, conflict_strategy = 'skip', balance_strategy = 'accumulate' } = body

    if (!Array.isArray(importList) || importList.length === 0) {
      return NextResponse.json({ error: 'Danh sách import không hợp lệ' }, { status: 400 })
    }

    // 1. Fetch current customers to detect duplicates
    const currentRes = await connector.list('customers', { limit: 10000 })
    const currentList = currentRes.data as Record<string, string>[]

    // Create maps for O(1) duplicate checking
    const phoneMap = new Map<string, Record<string, string>>()
    const codeMap = new Map<string, Record<string, string>>()

    for (const c of currentList) {
      if (c.phone) phoneMap.set(c.phone.trim(), c)
      if (c.customer_code) codeMap.set(c.customer_code.trim().toUpperCase(), c)
    }

    const toCreate: Record<string, string>[] = []
    const toUpdate: { id: string; data: Record<string, string> }[] = []
    const cashbookToCreate: Record<string, string>[] = []

    let skippedCount = 0
    let createdCount = 0
    let updatedCount = 0

    // GMT+7 time for timestamps
    const nowTime = getGMT7Time()

    for (const item of importList) {
      const name = (item.name || '').trim()
      if (!name) {
        skippedCount++
        continue // Skip records without name
      }

      const phone = (item.phone || '').trim()
      const customer_code = (item.customer_code || '').trim().toUpperCase()

      // Find if customer already exists in DB
      let existingCustomer: Record<string, string> | null = null
      if (phone && phoneMap.has(phone)) {
        existingCustomer = phoneMap.get(phone)!
      } else if (customer_code && codeMap.has(customer_code)) {
        existingCustomer = codeMap.get(customer_code)!
      }

      // Extract custom metadata (dynamic fields)
      const metadata: Record<string, any> = {
        zalo: item.zalo || '',
        facebook: item.facebook || '',
        tax_code: item.tax_code || '',
        id_card: item.id_card || '',
        gender: item.gender || '',
        company: item.company || '',
        original_created_by: item.created_by || '',
        shipping_area: item.shipping_area || '',
        ward: item.ward || '',
        customer_group: item.customer_group || '',
      }

      const note = item.note || ''
      const email = item.email || ''
      const address = item.address || ''
      const birthday = item.birthday || ''
      const customer_type = item.customer_type || 'retail'
      const credit_limit = String(item.credit_limit || '0')

      // Numeric inputs
      const importDebt = parseFloat(String(item.debt_amount || '0'))
      const importPoints = parseFloat(String(item.loyalty_points || '0'))
      const importPrepaid = parseFloat(String(item.prepaid_balance || '0'))

      if (existingCustomer) {
        // --- DUPLICATE DETECTED ---
        if (conflict_strategy === 'skip') {
          skippedCount++
          continue
        }

        // Conflict strategy is 'overwrite': Update existing customer
        const oldDebt = parseFloat(existingCustomer.debt_amount || '0')
        const oldPoints = parseFloat(existingCustomer.loyalty_points || '0')
        const oldPrepaid = parseFloat(existingCustomer.prepaid_balance || '0')

        let finalDebt = oldDebt
        let finalPoints = oldPoints
        let finalPrepaid = oldPrepaid

        let diffDebt = 0
        let diffPrepaid = 0

        if (balance_strategy === 'overwrite') {
          finalDebt = importDebt
          finalPoints = importPoints
          finalPrepaid = importPrepaid

          diffDebt = importDebt - oldDebt
          diffPrepaid = importPrepaid - oldPrepaid
        } else {
          // balance_strategy === 'accumulate'
          finalDebt = oldDebt + importDebt
          finalPoints = oldPoints + importPoints
          finalPrepaid = oldPrepaid + importPrepaid

          diffDebt = importDebt
          diffPrepaid = importPrepaid
        }

        // Parse existing metadata to merge with new
        let existingMeta: Record<string, any> = {}
        try {
          if (existingCustomer.metadata) {
            existingMeta = typeof existingCustomer.metadata === 'string'
              ? JSON.parse(existingCustomer.metadata)
              : existingCustomer.metadata
          }
        } catch (e) {
          console.error('Failed to parse existing metadata:', e)
        }

        const mergedMetadata = { ...existingMeta, ...metadata }

        toUpdate.push({
          id: existingCustomer.id,
          data: {
            name,
            phone: phone || existingCustomer.phone || '',
            email: email || existingCustomer.email || '',
            address: address || existingCustomer.address || '',
            birthday: birthday || existingCustomer.birthday || '',
            customer_type: customer_type || existingCustomer.customer_type || 'retail',
            credit_limit,
            debt_amount: String(finalDebt),
            loyalty_points: String(finalPoints),
            prepaid_balance: String(finalPrepaid),
            note: note || existingCustomer.note || '',
            metadata: JSON.stringify(mergedMetadata),
          }
        })

        // Create virtual cashbook logs for diff balance nợ
        if (diffDebt !== 0) {
          cashbookToCreate.push({
            type:           'receipt', // Receipt type representing debt update
            amount:         String(Math.abs(diffDebt)),
            method:         'debt',
            category:       'debt_collection',
            reference_id:   existingCustomer.id,
            reference_name: name,
            note:           diffDebt > 0 
              ? `Điều chỉnh tăng công nợ đầu kỳ khi import (Chênh lệch: +${diffDebt.toLocaleString('vi-VN')}đ)`
              : `Điều chỉnh giảm công nợ đầu kỳ khi import (Chênh lệch: ${diffDebt.toLocaleString('vi-VN')}đ)`,
            employee_id:    user.id,
            is_virtual:     'TRUE', // Flag virtual so it does not affect actual cash book totals
          })
        }

        // Create virtual cashbook logs for diff balance ví trả trước
        if (diffPrepaid !== 0) {
          cashbookToCreate.push({
            type:           'receipt',
            amount:         String(Math.abs(diffPrepaid)),
            method:         'bank_transfer',
            category:       'sales',
            reference_id:   existingCustomer.id,
            reference_name: name,
            note:           diffPrepaid > 0
              ? `Điều chỉnh tăng ví trả trước đầu kỳ khi import (Chênh lệch: +${diffPrepaid.toLocaleString('vi-VN')}đ)`
              : `Điều chỉnh giảm ví trả trước đầu kỳ khi import (Chênh lệch: ${diffPrepaid.toLocaleString('vi-VN')}đ)`,
            employee_id:    user.id,
            is_virtual:     'TRUE',
          })
        }

        updatedCount++
      } else {
        // --- NEW CUSTOMER ---
        toCreate.push({
          name,
          phone,
          email,
          address,
          customer_code,
          birthday,
          customer_type,
          credit_limit,
          debt_amount: String(importDebt),
          loyalty_points: String(importPoints),
          prepaid_balance: String(importPrepaid),
          note,
          metadata: JSON.stringify(metadata),
        })

        createdCount++
      }
    }

    // 2. Perform database write operations
    // Create new customers
    let createdCustomers: Record<string, string>[] = []
    if (toCreate.length > 0) {
      createdCustomers = await connector.batchCreate('customers', toCreate)
    }

    // Perform updates for duplicate customers
    for (const item of toUpdate) {
      await connector.update('customers', item.id, item.data)
    }

    // Match created customers back to generate their cashbook records for debt/prepaid balance
    for (const cc of createdCustomers) {
      const debt = parseFloat(cc.debt_amount || '0')
      const prepaid = parseFloat(cc.prepaid_balance || '0')

      if (debt > 0) {
        cashbookToCreate.push({
          type:           'receipt',
          amount:         String(debt),
          method:         'debt',
          category:       'debt_collection',
          reference_id:   cc.customer_id || cc.id,
          reference_name: cc.name,
          note:           `Số dư công nợ đầu kỳ ghi nhận khi chuyển đổi hệ thống (Import KiotViet)`,
          employee_id:    user.id,
          is_virtual:     'TRUE',
        })
      }

      if (prepaid > 0) {
        cashbookToCreate.push({
          type:           'receipt',
          amount:         String(prepaid),
          method:         'bank_transfer',
          category:       'sales',
          reference_id:   cc.customer_id || cc.id,
          reference_name: cc.name,
          note:           `Số dư Ví trả trước đầu kỳ ghi nhận khi chuyển đổi hệ thống (Import KiotViet)`,
          employee_id:    user.id,
          is_virtual:     'TRUE',
        })
      }
    }

    // Insert all virtual cashbook records at once for extreme performance
    if (cashbookToCreate.length > 0) {
      await connector.batchCreate('cashbook', cashbookToCreate)
    }

    // Invalidate caches to refresh screens instantly
    invalidate(shopId, 'customers')
    if (cashbookToCreate.length > 0) {
      invalidate(shopId, 'cashbook')
    }

    return NextResponse.json({
      success: true,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      total_processed: createdCount + updatedCount + skippedCount
    })
  } catch (e) {
    return handleApiError(e, 'POST customers/import-batch')
  }
}
