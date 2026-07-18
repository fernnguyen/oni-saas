export const dynamic = 'force-dynamic'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCacheService } from '@oni/adapters'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { handleApiError } from '../../../_helpers'

const HEALING_CATEGORY_NAME = 'Uncategorized (Recovered)'
const HEALING_SUPPLIER_NAME = 'Recovered Supplier'

type DbRow = Record<string, string | null>
type MainBranchRow = { branch_id: string; branch_slug: string; tenant_slug: string }
type ExistsRow = { exists: boolean }
type CountRow = { total: string }
type CategoryRow = DbRow & {
  id: string
  tenant_id: string
  branch_id: string | null
  name: string | null
  parent_id: string | null
  sort_order: string | null
  description: string | null
  tax_rate: string | null
  tax_group: string | null
  active: string | null
}
type ProductCategoryRefRow = DbRow & {
  id: string
  tenant_id: string
  branch_id: string
  category_id: string
}
type SupplierRow = DbRow & {
  id: string
  tenant_id: string
  branch_id: string | null
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
  payment_terms: string | null
  debt_amount: string | null
  note: string | null
  active: string | null
}
type SupplierUsageRefRow = DbRow & {
  id: string
  supplier_id: string
}
type PgLikePool = {
  connect: () => Promise<{
    query: (sql: string, params?: unknown[]) => Promise<unknown>
    release: () => void
  }>
}

function buildEntityId(prefix: string, tenantId: string) {
  const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase()
  const randomIdSuffix = crypto.randomUUID().substring(0, 8).toUpperCase()
  return `${prefix}-${tenantHash}-${randomIdSuffix}`
}

function toBool(value: string | null, fallback: boolean) {
  if (value == null) return fallback
  return value.toLowerCase() === 'true'
}

function unwrapConnector(connector: unknown): Record<string, unknown> | null {
  let current = connector as Record<string, unknown> | null
  const seen = new Set<unknown>()

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if ('pool' in current) return current
    current = ('inner' in current ? current.inner as Record<string, unknown> | null : null)
  }

  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, permissions, shop } = await requireShopAccess(shopId)

    if (!permissions.includes('owner') && !permissions.includes('admin')) {
      return NextResponse.json({ error: 'Only owner/admin can run branch-scope healing' }, { status: 403 })
    }

    const rawConnector = unwrapConnector(connector)
    const pool = rawConnector?.pool as PgLikePool | undefined
    if (!pool) {
      return NextResponse.json({ error: 'Branch-scope healing currently requires PostgreSQL connector access' }, { status: 501 })
    }

    const sp = req.nextUrl.searchParams
    const dryRun = sp.get('dry_run') !== 'false'
    const includeCategories = toBool(sp.get('include_categories'), true)
    const includeSuppliers = toBool(sp.get('include_suppliers'), true)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const queryRows = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
        const result = await client.query(sql, params) as { rows: T[] }
        return result.rows
      }

      const report = {
        dry_run: dryRun,
        tenant_id: shop.tenant_id as string,
        shop_id: shopId,
        include_categories: includeCategories,
        include_suppliers: includeSuppliers,
        schema: [] as Array<{ table: string; action: string }>,
        normalization: [] as Array<{ table: string; matched: number; target_branch_id: string }>,
        categories: {
          main_branch_id: '',
          main_branch_slug: '',
          tenant_slug: '',
          missing_refs: 0,
          broken_parent_links: 0,
          healing_categories_created: 0,
          reassigned_products: 0,
          cloned_categories: 0,
          reused_categories: 0,
        },
        suppliers: {
          missing_refs: 0,
          healing_suppliers_created: 0,
          reassigned_refs: 0,
          cloned_suppliers: 0,
          reused_suppliers: 0,
          historical_debt_kept_on_source_suppliers: 0,
          matched_refs_by_table: {} as Record<string, number>,
          reassigned_refs_by_table: {} as Record<string, number>,
        },
        warnings: [] as string[],
      }

      const admin = getSupabaseAdminClient()
      const { data: tenantRow, error: tenantError } = await admin
        .from('tenants')
        .select('slug')
        .eq('id', shop.tenant_id)
        .maybeSingle()
      if (tenantError) throw tenantError

      let mainBranch: MainBranchRow | undefined
      if (tenantRow?.slug) {
        const { data: branchRow, error: branchError } = await admin
          .from('shops')
          .select('id, slug')
          .eq('tenant_id', shop.tenant_id)
          .eq('slug', tenantRow.slug)
          .maybeSingle()
        if (branchError) throw branchError

        if (branchRow) {
          mainBranch = {
            branch_id: branchRow.id,
            branch_slug: branchRow.slug,
            tenant_slug: tenantRow.slug,
          }
        }
      }

      if (!mainBranch) {
        report.warnings.push('No main branch found where shops.slug = tenants.slug; falling back to current shop.')
      }
      const mainBranchId = mainBranch?.branch_id || shopId
      report.categories.main_branch_id = mainBranchId
      report.categories.main_branch_slug = mainBranch?.branch_slug || String(shop.slug || shopId)
      report.categories.tenant_slug = mainBranch?.tenant_slug || ''

      const ensureColumn = async (table: string): Promise<boolean> => {
        const existsRows = await queryRows<ExistsRow>(
          `
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = ANY(current_schemas(false))
                AND table_name = $1
                AND column_name = 'branch_id'
            ) AS exists
          `,
          [table]
        )
        if (!existsRows[0]?.exists) {
          report.schema.push({ table, action: 'add branch_id column' })
          if (!dryRun) {
            await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS branch_id varchar(255)`)
            return true
          }
          return false
        }
        return true
      }

      const categoryHasBranchId = await ensureColumn('categories')
      const supplierHasBranchId = await ensureColumn('suppliers')

      const normalizeBranchless = async (table: string, hasBranchId = true) => {
        const matchedRows = await queryRows<CountRow>(
          `
            SELECT COUNT(*) AS total
            FROM ${table}
            WHERE tenant_id = $1
              ${hasBranchId ? "AND (branch_id IS NULL OR branch_id = '')" : ''}
          `,
          [shop.tenant_id]
        )
        const matched = parseInt(matchedRows[0]?.total || '0', 10)
        report.normalization.push({ table, matched, target_branch_id: mainBranchId })
        if (!dryRun && matched > 0) {
          await client.query(
            `
              UPDATE ${table}
              SET branch_id = $1
              WHERE tenant_id = $2
                AND (branch_id IS NULL OR branch_id = '')
            `,
            [mainBranchId, shop.tenant_id]
          )
        }
      }

      const normalizationTargets: Array<[string, boolean]> = [
        ['products', true],
        ['inventory', true],
        ['inventory_batches', true],
        ['stock_movements', true],
        ['categories', categoryHasBranchId],
        ['suppliers', supplierHasBranchId],
      ]
      for (const [table, hasBranchId] of normalizationTargets) {
        await normalizeBranchless(table, hasBranchId)
      }

      if (includeCategories) {
        const categoryRows = await queryRows<CategoryRow>(
          `
            SELECT id, tenant_id, ${categoryHasBranchId ? 'branch_id' : 'NULL::varchar AS branch_id'}, name, parent_id, sort_order, description, tax_rate, tax_group, active
            FROM categories
            WHERE tenant_id = $1
          `,
          [shop.tenant_id]
        )
        const productRefRows = await queryRows<ProductCategoryRefRow>(
          `
            SELECT id, tenant_id, COALESCE(NULLIF(branch_id, ''), $3) AS branch_id, category_id
            FROM products
            WHERE tenant_id = $1
              AND (
                branch_id = $2
                OR ($2 = $3 AND (branch_id IS NULL OR branch_id = ''))
              )
              AND category_id IS NOT NULL
              AND category_id != ''
          `,
          [shop.tenant_id, shopId, mainBranchId]
        )

        // Dry-run does not execute normalization, so mirror its result in memory to
        // keep category reuse/clone decisions identical to a real run.
        const categoriesById = new Map<string, CategoryRow>(categoryRows.map((row) => [
          String(row.id),
          {
            ...row,
            branch_id: row.branch_id || mainBranchId,
          },
        ]))
        const branchUsage = new Map<string, Set<string>>()
        for (const row of productRefRows) {
          const key = `${row.tenant_id}::${row.category_id}`
          if (!branchUsage.has(key)) branchUsage.set(key, new Set())
          branchUsage.get(key)!.add(String(row.branch_id))
        }
        const canonicalIds = new Map<string, string>()

        const ensureHealingCategory = async (tenantId: string, branchId: string, reasonCategoryId: string | null) => {
          const cacheKey = `healing-category::${tenantId}::${branchId}`
          const cached = canonicalIds.get(cacheKey)
          if (cached) return cached

          const existing = Array.from(categoriesById.values()).find((row) =>
            row.tenant_id === tenantId &&
            row.branch_id === branchId &&
            row.name === HEALING_CATEGORY_NAME &&
            !row.parent_id
          )
          if (existing?.id) {
            canonicalIds.set(cacheKey, String(existing.id))
            return String(existing.id)
          }

          const newId = buildEntityId('CAT', tenantId)
          const newRow: CategoryRow = {
            id: newId,
            tenant_id: tenantId,
            branch_id: branchId,
            name: HEALING_CATEGORY_NAME,
            parent_id: null,
            sort_order: null,
            description: reasonCategoryId
              ? `Auto-created while recovering missing category reference ${reasonCategoryId}.`
              : 'Auto-created while recovering orphaned category references.',
            tax_rate: null,
            tax_group: null,
            active: 'TRUE',
          }
          categoriesById.set(newId, newRow)
          canonicalIds.set(cacheKey, newId)
          report.categories.healing_categories_created += 1
          if (!dryRun) {
            await client.query(
              `
                INSERT INTO categories (
                  id, tenant_id, branch_id, name, parent_id, sort_order, description, tax_rate, tax_group, active, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, NULL, NULL, $5, NULL, NULL, 'TRUE', NOW(), NOW()
                )
              `,
              [newId, tenantId, branchId, HEALING_CATEGORY_NAME, newRow.description]
            )
          }
          return newId
        }

        const ensureCategoryForBranch = async (
          categoryId: string,
          tenantId: string,
          branchId: string,
          visited = new Set<string>()
        ): Promise<string> => {
          const cacheKey = `${categoryId}::${branchId}`
          const cached = canonicalIds.get(cacheKey)
          if (cached) return cached

          const category = categoriesById.get(categoryId)
          if (!category) {
            report.categories.missing_refs += 1
            return ensureHealingCategory(tenantId, branchId, categoryId)
          }

          if (visited.has(categoryId)) {
            report.categories.broken_parent_links += 1
            return ensureHealingCategory(tenantId, branchId, categoryId)
          }
          visited.add(categoryId)

          let targetParentId: string | null = null
          if (category.parent_id) {
            if (!categoriesById.has(String(category.parent_id))) {
              report.categories.broken_parent_links += 1
            } else {
              targetParentId = await ensureCategoryForBranch(String(category.parent_id), String(category.tenant_id), branchId, new Set(visited))
            }
          }

          const exact = Array.from(categoriesById.values()).find((row) =>
            row.tenant_id === tenantId &&
            row.branch_id === branchId &&
            row.name === category.name &&
            String(row.parent_id || '') === String(targetParentId || '')
          )
          if (exact?.id) {
            canonicalIds.set(cacheKey, String(exact.id))
            return String(exact.id)
          }

          const usageKey = `${category.tenant_id}::${category.id}`
          const usedBranches = Array.from(branchUsage.get(usageKey) ?? [])
          const canReuseOriginal =
            (!category.branch_id || category.branch_id === branchId) &&
            usedBranches.length <= 1

          if (canReuseOriginal) {
            categoriesById.set(categoryId, { ...category, branch_id: branchId, parent_id: targetParentId })
            canonicalIds.set(cacheKey, categoryId)
            report.categories.reused_categories += 1
            if (!dryRun) {
              await client.query(
                `
                  UPDATE categories
                  SET branch_id = $1, parent_id = $2
                  WHERE id = $3
                    AND tenant_id = $4
                    AND (branch_id = $1 OR branch_id IS NULL OR branch_id = '')
                `,
                [branchId, targetParentId, categoryId, tenantId]
              )
            }
            return categoryId
          }

          const clonedId = buildEntityId('CAT', tenantId)
          const clonedRow: CategoryRow = {
            ...category,
            id: clonedId,
            branch_id: branchId,
            parent_id: targetParentId,
          }
          categoriesById.set(clonedId, clonedRow)
          canonicalIds.set(cacheKey, clonedId)
          report.categories.cloned_categories += 1
          if (!dryRun) {
            await client.query(
              `
                INSERT INTO categories (
                  id, tenant_id, branch_id, name, parent_id, sort_order, description, tax_rate, tax_group, active, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'TRUE'), NOW(), NOW()
                )
              `,
              [
                clonedId,
                tenantId,
                branchId,
                clonedRow.name,
                clonedRow.parent_id,
                clonedRow.sort_order,
                clonedRow.description,
                clonedRow.tax_rate,
                clonedRow.tax_group,
                clonedRow.active,
              ]
            )
          }
          return clonedId
        }

        for (const row of productRefRows) {
          const currentCategoryId = String(row.category_id)
          const scopedCategoryId = await ensureCategoryForBranch(currentCategoryId, String(row.tenant_id), String(row.branch_id))
          if (scopedCategoryId !== currentCategoryId) {
            report.categories.reassigned_products += 1
            if (!dryRun) {
              await client.query(
                `
                  UPDATE products
                  SET category_id = $1
                  WHERE id = $2
                    AND tenant_id = $3
                    AND branch_id = $4
                    AND category_id = $5
                `,
                [scopedCategoryId, row.id, shop.tenant_id, shopId, currentCategoryId]
              )
            }
          }
        }
      }

      if (includeSuppliers) {
        const supplierRows = await queryRows<SupplierRow>(
          `
            SELECT id, tenant_id, ${supplierHasBranchId ? 'branch_id' : 'NULL::varchar AS branch_id'}, name, phone, email, address, payment_terms, debt_amount, note, active
            FROM suppliers
            WHERE tenant_id = $1
          `,
          [shop.tenant_id]
        )
        const usageRows: Array<{ table: string; id: string; supplier_id: string }> = []

        const [stockMovementsRes, purchaseOrdersRes, assetsRes, cashbookRes, historyRes] = await Promise.all([
          queryRows<SupplierUsageRefRow>(
            `
              SELECT id, supplier_id
              FROM stock_movements
              WHERE tenant_id = $1
                AND (
                  branch_id = $2
                  OR ($2 = $3 AND (branch_id IS NULL OR branch_id = ''))
                )
                AND supplier_id IS NOT NULL
                AND supplier_id != ''
            `,
            [shop.tenant_id, shopId, mainBranchId]
          ),
          queryRows<SupplierUsageRefRow>(
            `
              SELECT id, supplier_id
              FROM purchase_orders
              WHERE tenant_id = $1 AND branch_id = $2 AND supplier_id IS NOT NULL AND supplier_id != ''
            `,
            [shop.tenant_id, shopId]
          ),
          queryRows<SupplierUsageRefRow>(
            `
              SELECT id, supplier_id
              FROM assets
              WHERE tenant_id = $1 AND branch_id = $2 AND supplier_id IS NOT NULL AND supplier_id != ''
            `,
            [shop.tenant_id, shopId]
          ),
          queryRows<SupplierUsageRefRow>(
            `
              SELECT id, reference_id AS supplier_id
              FROM cashbook
              WHERE tenant_id = $1
                AND branch_id = $2
                AND category = 'debt_payment'
                AND type = 'payment'
                AND reference_id IS NOT NULL
                AND reference_id != ''
            `,
            [shop.tenant_id, shopId]
          ),
          queryRows<SupplierUsageRefRow>(
            `
              SELECT pph.id, pph.supplier_id
              FROM product_purchase_history pph
              INNER JOIN products p ON p.id = pph.product_id
              WHERE pph.tenant_id = $1
                AND p.tenant_id = $1
                AND (
                  p.branch_id = $2
                  OR ($2 = $3 AND (p.branch_id IS NULL OR p.branch_id = ''))
                )
                AND pph.supplier_id IS NOT NULL
                AND pph.supplier_id != ''
            `,
            [shop.tenant_id, shopId, mainBranchId]
          ),
        ])

        for (const row of stockMovementsRes) usageRows.push({ table: 'stock_movements', id: String(row.id), supplier_id: String(row.supplier_id) })
        for (const row of purchaseOrdersRes) usageRows.push({ table: 'purchase_orders', id: String(row.id), supplier_id: String(row.supplier_id) })
        for (const row of assetsRes) usageRows.push({ table: 'assets', id: String(row.id), supplier_id: String(row.supplier_id) })
        for (const row of cashbookRes) usageRows.push({ table: 'cashbook', id: String(row.id), supplier_id: String(row.supplier_id) })
        for (const row of historyRes) usageRows.push({ table: 'product_purchase_history', id: String(row.id), supplier_id: String(row.supplier_id) })
        for (const usage of usageRows) {
          report.suppliers.matched_refs_by_table[usage.table] =
            (report.suppliers.matched_refs_by_table[usage.table] || 0) + 1
        }

        // Match the branchless-to-main normalization during dry-run as well.
        const suppliersById = new Map<string, SupplierRow>(supplierRows.map((row) => [
          String(row.id),
          {
            ...row,
            branch_id: row.branch_id || mainBranchId,
          },
        ]))
        const supplierUsage = new Map<string, number>()
        for (const row of usageRows) {
          supplierUsage.set(row.supplier_id, (supplierUsage.get(row.supplier_id) || 0) + 1)
        }
        const canonicalSuppliers = new Map<string, string>()
        const historicalDebtSourceIds = new Set<string>()

        const ensureHealingSupplier = async (tenantId: string, branchId: string, reasonSupplierId: string | null) => {
          const cacheKey = `healing-supplier::${tenantId}::${branchId}`
          const cached = canonicalSuppliers.get(cacheKey)
          if (cached) return cached

          const existing = Array.from(suppliersById.values()).find((row) =>
            row.tenant_id === tenantId &&
            row.branch_id === branchId &&
            row.name === HEALING_SUPPLIER_NAME
          )
          if (existing?.id) {
            canonicalSuppliers.set(cacheKey, String(existing.id))
            return String(existing.id)
          }

          const newId = buildEntityId('SUP', tenantId)
          const newRow: SupplierRow = {
            id: newId,
            tenant_id: tenantId,
            branch_id: branchId,
            name: HEALING_SUPPLIER_NAME,
            phone: null,
            email: null,
            address: null,
            payment_terms: null,
            debt_amount: '0',
            note: reasonSupplierId
              ? `Auto-created while recovering missing supplier reference ${reasonSupplierId}.`
              : 'Auto-created while recovering orphaned supplier references.',
            active: 'TRUE',
          }
          suppliersById.set(newId, newRow)
          canonicalSuppliers.set(cacheKey, newId)
          report.suppliers.healing_suppliers_created += 1
          if (!dryRun) {
            await client.query(
              `
                INSERT INTO suppliers (
                  id, tenant_id, branch_id, name, phone, email, address, payment_terms, debt_amount, note, active, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, NULL, NULL, NULL, NULL, '0', $5, 'TRUE', NOW(), NOW()
                )
              `,
              [newId, tenantId, branchId, HEALING_SUPPLIER_NAME, newRow.note]
            )
          }
          return newId
        }

        const ensureSupplierForBranch = async (supplierId: string, tenantId: string, branchId: string): Promise<string> => {
          const cacheKey = `${supplierId}::${branchId}`
          const cached = canonicalSuppliers.get(cacheKey)
          if (cached) return cached

          const supplier = suppliersById.get(supplierId)
          if (!supplier) {
            report.suppliers.missing_refs += 1
            return ensureHealingSupplier(tenantId, branchId, supplierId)
          }

          const exact = Array.from(suppliersById.values()).find((row) =>
            row.tenant_id === tenantId &&
            row.branch_id === branchId &&
            row.name === supplier.name &&
            String(row.phone || '') === String(supplier.phone || '') &&
            String(row.email || '') === String(supplier.email || '')
          )
          if (exact?.id) {
            canonicalSuppliers.set(cacheKey, String(exact.id))
            return String(exact.id)
          }

          const canReuseOriginal =
            (!supplier.branch_id || supplier.branch_id === branchId) &&
            (supplierUsage.get(supplierId) || 0) <= 1

          if (canReuseOriginal) {
            suppliersById.set(supplierId, { ...supplier, branch_id: branchId })
            canonicalSuppliers.set(cacheKey, supplierId)
            report.suppliers.reused_suppliers += 1
            if (!dryRun) {
              await client.query(
                `
                  UPDATE suppliers
                  SET branch_id = $1
                  WHERE id = $2
                    AND tenant_id = $3
                    AND (branch_id = $1 OR branch_id IS NULL OR branch_id = '')
                `,
                [branchId, supplierId, tenantId]
              )
            }
            return supplierId
          }

          const clonedId = buildEntityId('SUP', tenantId)
          const clonedRow: SupplierRow = {
            ...supplier,
            id: clonedId,
            branch_id: branchId,
            // Historical debt cannot be safely split by branch from a tenant-level
            // balance. Keep it on the source record instead of duplicating it.
            debt_amount: '0',
          }
          suppliersById.set(clonedId, clonedRow)
          canonicalSuppliers.set(cacheKey, clonedId)
          report.suppliers.cloned_suppliers += 1
          if (!dryRun) {
            await client.query(
              `
                INSERT INTO suppliers (
                  id, tenant_id, branch_id, name, phone, email, address, payment_terms, debt_amount, note, active, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, '0'), $10, COALESCE($11, 'TRUE'), NOW(), NOW()
                )
              `,
              [
                clonedId,
                tenantId,
                branchId,
                clonedRow.name,
                clonedRow.phone,
                clonedRow.email,
                clonedRow.address,
                clonedRow.payment_terms,
                clonedRow.debt_amount,
                clonedRow.note,
                clonedRow.active,
              ]
            )
          }
          return clonedId
        }

        for (const usage of usageRows) {
          const scopedSupplierId = await ensureSupplierForBranch(usage.supplier_id, String(shop.tenant_id), shopId)
          if (scopedSupplierId === usage.supplier_id) continue

          const sourceSupplier = suppliersById.get(usage.supplier_id)
          if ((parseFloat(sourceSupplier?.debt_amount || '0') || 0) !== 0) {
            historicalDebtSourceIds.add(usage.supplier_id)
          }

          report.suppliers.reassigned_refs += 1
          report.suppliers.reassigned_refs_by_table[usage.table] =
            (report.suppliers.reassigned_refs_by_table[usage.table] || 0) + 1
          if (!dryRun) {
            if (usage.table === 'cashbook') {
              await client.query(
                `
                  UPDATE cashbook
                  SET reference_id = $1
                  WHERE id = $2
                    AND tenant_id = $3
                    AND branch_id = $4
                    AND category = 'debt_payment'
                    AND type = 'payment'
                    AND reference_id = $5
                `,
                [scopedSupplierId, usage.id, shop.tenant_id, shopId, usage.supplier_id]
              )
            } else {
              const isBranchScopedTable = usage.table !== 'product_purchase_history'
              await client.query(
                `
                  UPDATE ${usage.table}
                  SET supplier_id = $1
                  WHERE id = $2
                    AND tenant_id = $3
                    ${isBranchScopedTable ? 'AND branch_id = $4' : ''}
                    AND supplier_id = ${isBranchScopedTable ? '$5' : '$4'}
                `,
                isBranchScopedTable
                  ? [scopedSupplierId, usage.id, shop.tenant_id, shopId, usage.supplier_id]
                  : [scopedSupplierId, usage.id, shop.tenant_id, usage.supplier_id]
              )
            }
          }
        }
        report.suppliers.historical_debt_kept_on_source_suppliers = historicalDebtSourceIds.size
      }

      if (report.suppliers.historical_debt_kept_on_source_suppliers > 0) {
        report.warnings.push(
          'Historical supplier debt was kept on source supplier records because tenant-level balances cannot be safely split by branch; cloned suppliers start with zero debt.'
        )
      }

      if (dryRun) {
        await client.query('ROLLBACK')
      } else {
        await client.query('COMMIT')
        try {
          const affectedBranchIds = new Set([shopId, mainBranchId])
          const cacheService = getCacheService()
          for (const affectedBranchId of affectedBranchIds) {
            invalidate(affectedBranchId, 'products')
            invalidate(affectedBranchId, 'categories')
            invalidate(affectedBranchId, 'suppliers')
            invalidate(affectedBranchId, 'inventory')
            invalidate(affectedBranchId, 'stock-movements')
            invalidate(affectedBranchId, 'cashbook')
            await cacheService.deletePattern(`oni:data:${shop.tenant_id}:${affectedBranchId}:*`)
          }
        } catch {
          report.warnings.push('Healing committed, but cache invalidation failed; cached reads may remain stale until TTL expiry.')
        }
      }

      return NextResponse.json({
        success: true,
        message: dryRun
          ? 'Dry run completed. No data was changed.'
          : 'Branch-scope healing completed successfully.',
        report,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (e) {
    return handleApiError(e, 'GET master-data/heal-branch-scope')
  }
}
