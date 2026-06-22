'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface Category {
  id: string
  category_id: string
  name: string
  tax_rate?: string
  tax_group?: string
}

interface Product {
  id: string
  product_id: string
  name: string
  sku?: string
  sell_price: string
  cost_price: string
  tax_rate?: string
  input_tax_rate?: string
  tax_group?: string
}

interface LockPeriod {
  period_name: string
  start_date: string
  end_date: string
  key: string
  status: 'locked' | 'unlocked'
  locked_at: string | null
  locked_by: string | null
}

interface Props {
  shopId: string
  slug: string
  branch: string
  categories: Category[]
  products: Product[]
  permissions?: string[]
}

const mapGroupToCode = (val?: string) => {
  if (!val) return ''
  if (val === 'Phân phối, cung cấp hàng hóa') return 'phan_phoi'
  if (val === 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu') return 'dich_vu'
  if (val === 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu') return 'san_xuat'
  if (val === 'Hoạt động kinh doanh khác') return 'khac'
  return val
}

export function TaxSettingsClient({ shopId, slug, branch, categories: initialCategories, products: initialProducts, permissions }: Props) {
  const [activeTab, setActiveTab] = useState<'lockdown' | 'recalculate' | 'categories' | 'products'>('lockdown')

  // Dynamic system tax groups
  const [taxGroups, setTaxGroups] = useState<any[]>([])
  const [loadingTaxGroups, setLoadingTaxGroups] = useState(false)

  // Lockdown Periods States
  const [periods, setPeriods] = useState<LockPeriod[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(false)
  const [lockingPeriod, setLockingPeriod] = useState<LockPeriod | null>(null)
  const [unlockingPeriod, setUnlockingPeriod] = useState<LockPeriod | null>(null)
  const [unlockReason, setUnlockReason] = useState('')

  // Recalculation States
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [recalculating, setRecalculating] = useState(false)
  const [recalcResult, setRecalcResult] = useState<any>(null)
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false)

  // Category States
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [catTaxRate, setCatTaxRate] = useState('')
  const [catTaxGroup, setCatTaxGroup] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)

  // Product States
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [productSearch, setProductSearch] = useState('')
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [prodTaxRate, setProdTaxRate] = useState('')
  const [prodInputTaxRate, setProdInputTaxRate] = useState('')
  const [prodTaxGroup, setProdTaxGroup] = useState('')
  const [savingProduct, setSavingProduct] = useState(false)

  // Bulk Product States
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [bulkTaxRate, setBulkTaxRate] = useState('')
  const [bulkInputTaxRate, setBulkInputTaxRate] = useState('')
  const [bulkTaxGroup, setBulkTaxGroup] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // Fetch lockdown periods
  const fetchPeriods = async () => {
    setLoadingPeriods(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/reports/tax/lockdown`)
      if (res.ok) {
        const data = await res.json()
        setPeriods(data)
      } else {
        toast.error('Không thể lấy danh sách kỳ khóa sổ')
      }
    } catch (e) {
      toast.error('Lỗi kết nối khi lấy dữ liệu kỳ khóa sổ')
    } finally {
      setLoadingPeriods(false)
    }
  }

  // Fetch system tax groups
  const fetchTaxGroups = async () => {
    setLoadingTaxGroups(true)
    try {
      const res = await fetch('/api/tax-groups')
      if (res.ok) {
        const data = await res.json()
        if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
          setTaxGroups(data.data)
          return
        }
      }
      // Fallback
      setTaxGroups([
        { code: 'phan_phoi', name: 'Phân phối, cung cấp hàng hóa', vat_rate: 1.0, pit_rate: 0.5 },
        { code: 'dich_vu', name: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu', vat_rate: 5.0, pit_rate: 2.0 },
        { code: 'san_xuat', name: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu', vat_rate: 3.0, pit_rate: 1.5 },
        { code: 'khac', name: 'Hoạt động kinh doanh khác', vat_rate: 2.0, pit_rate: 1.0 }
      ])
    } catch (e) {
      console.error('Lỗi nạp nhóm ngành thuế:', e)
      setTaxGroups([
        { code: 'phan_phoi', name: 'Phân phối, cung cấp hàng hóa', vat_rate: 1.0, pit_rate: 0.5 },
        { code: 'dich_vu', name: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu', vat_rate: 5.0, pit_rate: 2.0 },
        { code: 'san_xuat', name: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu', vat_rate: 3.0, pit_rate: 1.5 },
        { code: 'khac', name: 'Hoạt động kinh doanh khác', vat_rate: 2.0, pit_rate: 1.0 }
      ])
    } finally {
      setLoadingTaxGroups(false)
    }
  }

  useEffect(() => {
    fetchPeriods()
    fetchTaxGroups()
  }, [])

  // Lock a period
  const handleLockPeriod = async (period: LockPeriod) => {
    try {
      const res = await fetch(`/api/shops/${shopId}/reports/tax/lockdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_name: period.period_name,
          start_date: period.start_date,
          end_date: period.end_date,
          action: 'lock',
        }),
      })

      if (res.ok) {
        toast.success(`Đã khóa thành công kỳ ${period.period_name}`)
        fetchPeriods()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Lỗi khi khóa kỳ thuế')
      }
    } catch (e) {
      toast.error('Lỗi hệ thống khi khóa kỳ thuế')
    }
  }

  // Unlock a period
  const handleUnlockPeriodSubmit = async () => {
    if (!unlockingPeriod) return
    if (!unlockReason.trim()) {
      toast.error('Vui lòng nhập lý do mở khóa')
      return
    }

    try {
      const res = await fetch(`/api/shops/${shopId}/reports/tax/lockdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_name: unlockingPeriod.period_name,
          start_date: unlockingPeriod.start_date,
          end_date: unlockingPeriod.end_date,
          action: 'unlock',
          reason: unlockReason,
        }),
      })

      if (res.ok) {
        toast.success(`Đã mở khóa thành công kỳ ${unlockingPeriod.period_name}`)
        setUnlockingPeriod(null)
        setUnlockReason('')
        fetchPeriods()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Lỗi khi mở khóa kỳ thuế')
      }
    } catch (e) {
      toast.error('Lỗi hệ thống khi mở khóa kỳ thuế')
    }
  }

  // Recalculate Tax History
  const handleRecalculateStart = () => {
    if (!fromDate || !toDate) {
      toast.error('Vui lòng chọn đầy đủ khoảng thời gian!')
      return
    }
    if (permissions && !permissions.includes('settings.manage')) {
      toast.error('Bạn không có quyền thực hiện chức năng này.')
      return
    }
    setShowRecalcConfirm(true)
  }

  const handleRecalculate = async () => {
    setShowRecalcConfirm(false)
    setRecalculating(true)
    setRecalcResult(null)
    try {
      const res = await fetch(`/api/shops/${shopId}/reports/tax/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Đồng bộ lại lịch sử thuế thành công!')
        setRecalcResult(data.details)
      } else {
        toast.error(data.error || 'Đồng bộ lại lịch sử thuế thất bại!')
      }
    } catch (e) {
      toast.error('Lỗi kết nối máy chủ!')
    } finally {
      setRecalculating(false)
    }
  }

  // Save Category Tax Settings
  const handleSaveCategory = async (cat: Category) => {
    setSavingCategory(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/categories/${cat.category_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cat.name,
          tax_rate: catTaxRate,
          tax_group: catTaxGroup,
        }),
      })

      if (res.ok) {
        toast.success('Đã lưu cấu hình thuế danh mục')
        setCategories(
          categories.map((c) =>
            c.category_id === cat.category_id
              ? { ...c, tax_rate: catTaxRate, tax_group: catTaxGroup }
              : c
          )
        )
        setEditingCategory(null)
      } else {
        toast.error('Lỗi lưu cấu hình thuế danh mục')
      }
    } catch (e) {
      toast.error('Lỗi kết nối máy chủ')
    } finally {
      setSavingCategory(false)
    }
  }

  // Save Product Tax Settings
  const handleSaveProduct = async (prod: Product) => {
    setSavingProduct(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/products/${prod.product_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: prod.name,
          tax_rate: prodTaxRate,
          input_tax_rate: prodInputTaxRate,
          tax_group: prodTaxGroup,
        }),
      })

      if (res.ok) {
        toast.success('Đã lưu cấu hình thuế sản phẩm')
        setProducts(
          products.map((p) =>
            p.product_id === prod.product_id
              ? { ...p, tax_rate: prodTaxRate, input_tax_rate: prodInputTaxRate, tax_group: prodTaxGroup }
              : p
          )
        )
        setEditingProduct(null)
      } else {
        toast.error('Lỗi lưu cấu hình thuế sản phẩm')
      }
    } catch (e) {
      toast.error('Lỗi kết nối máy chủ')
    } finally {
      setSavingProduct(false)
    }
  }

  // Bulk Product Tax Update
  const handleBulkUpdate = async () => {
    if (selectedProductIds.length === 0) {
      toast.error('Chưa chọn sản phẩm nào!')
      return
    }

    setBulkSaving(true)
    let successCount = 0

    try {
      for (const id of selectedProductIds) {
        const prod = products.find((p) => p.product_id === id)
        if (!prod) continue

        const res = await fetch(`/api/shops/${shopId}/products/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: prod.name,
            tax_rate: bulkTaxRate !== '' ? bulkTaxRate : prod.tax_rate,
            input_tax_rate: bulkInputTaxRate !== '' ? bulkInputTaxRate : prod.input_tax_rate,
            tax_group: bulkTaxGroup !== '' ? bulkTaxGroup : prod.tax_group,
          }),
        })

        if (res.ok) {
          successCount++
        }
      }

      toast.success(`Cập nhật thành công cấu hình thuế cho ${successCount} sản phẩm`)
      
      // Update local state
      setProducts(
        products.map((p) => {
          if (selectedProductIds.includes(p.product_id)) {
            return {
              ...p,
              tax_rate: bulkTaxRate !== '' ? bulkTaxRate : p.tax_rate,
              input_tax_rate: bulkInputTaxRate !== '' ? bulkInputTaxRate : p.input_tax_rate,
              tax_group: bulkTaxGroup !== '' ? bulkTaxGroup : p.tax_group,
            }
          }
          return p
        })
      )

      setSelectedProductIds([])
      setBulkTaxRate('')
      setBulkInputTaxRate('')
      setBulkTaxGroup('')
    } catch (e) {
      toast.error('Đã xảy ra lỗi khi cập nhật hàng loạt')
    } finally {
      setBulkSaving(false)
    }
  }

  // Filter products by search
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const toggleSelectProduct = (id: string) => {
    if (selectedProductIds.includes(id)) {
      setSelectedProductIds(selectedProductIds.filter((pId) => pId !== id))
    } else {
      setSelectedProductIds([...selectedProductIds, id])
    }
  }

  const toggleSelectAllProducts = () => {
    if (selectedProductIds.length === filteredProducts.length) {
      setSelectedProductIds([])
    } else {
      setSelectedProductIds(filteredProducts.map((p) => p.product_id))
    }
  }

  return (
    <div className="space-y-6">
      {/* Navigation tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('lockdown')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'lockdown'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Kỳ khóa sổ Thuế
        </button>
        <button
          onClick={() => setActiveTab('recalculate')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'recalculate'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Đồng bộ lại Lịch sử Thuế
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'categories'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Thuế Danh mục
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'products'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Thuế Sản phẩm
        </button>
      </div>

      {/* Tab: Lockdown Periods */}
      {activeTab === 'lockdown' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Danh sách kỳ khóa sổ kế toán</h2>
              <p className="text-xs text-slate-500">Mỗi kỳ đại diện cho 1 tháng. Khi kỳ bị Khóa sổ, toàn bộ đơn hàng trong tháng đó sẽ bị đóng băng.</p>
            </div>
            <button
              onClick={fetchPeriods}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Làm mới
            </button>
          </div>

          {loadingPeriods ? (
            <div className="py-8 text-center text-sm text-slate-400">Đang tải trạng thái kỳ khóa sổ...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Kỳ báo cáo</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Thời gian kỳ</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Chi tiết khóa</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periods.map((p) => (
                    <tr key={p.period_name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{p.period_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {p.start_date} → {p.end_date}
                      </td>
                      <td className="px-4 py-3">
                        {p.status === 'locked' ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                            Đã khóa sổ
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            Mở
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {p.status === 'locked' && p.locked_at ? (
                          <div>
                            <div>Bởi: {p.locked_by}</div>
                            <div>Lúc: {new Date(p.locked_at).toLocaleString('vi-VN')}</div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === 'locked' ? (
                          <button
                            onClick={() => setUnlockingPeriod(p)}
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors"
                          >
                            Mở khóa
                          </button>
                        ) : (
                          <button
                            onClick={() => setLockingPeriod(p)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Khóa sổ
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Recalculate */}
      {activeTab === 'recalculate' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Đồng bộ lại lịch sử thuế của Đơn hàng</h2>
            <p className="text-xs text-slate-500 mt-1">
              Tính năng này cho phép cập nhật lại thông tin `tax_rate`, `tax_group`, và `tax_amount` của toàn bộ đơn hàng trong quá khứ 
              dựa trên cấu hình hiện tại của sản phẩm/danh mục. Hệ thống sẽ bỏ qua các kỳ thuế đã bị Khóa sổ.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Từ ngày</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Đến ngày</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
              />
            </div>
          </div>

          <div>
            <button
              onClick={handleRecalculateStart}
              disabled={recalculating}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
            >
              {recalculating ? 'Đang xử lý đồng bộ...' : 'Bắt đầu đồng bộ lịch sử thuế'}
            </button>
          </div>

          {recalcResult && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 max-w-xl text-sm space-y-2">
              <h3 className="font-semibold text-slate-800">Kết quả đồng bộ lại lịch sử thuế:</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-500">Số đơn hàng quét:</div>
                <div className="font-semibold text-slate-800">{recalcResult.ordersChecked}</div>
                <div className="text-slate-500">Số đơn hàng được cập nhật:</div>
                <div className="font-semibold text-slate-800 text-emerald-600">{recalcResult.ordersUpdated}</div>
                <div className="text-slate-500">Số lượng chi tiết items cập nhật:</div>
                <div className="font-semibold text-slate-800 text-emerald-600">{recalcResult.itemsUpdated}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Categories */}
      {activeTab === 'categories' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Thuế theo Danh mục Sản phẩm</h2>
            <p className="text-xs text-slate-500">Cấu hình thuế mặc định cho danh mục. Khi sản phẩm không được cài đặt thuế suất riêng, nó sẽ thừa hưởng cấu hình này.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Tên danh mục</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Thuế suất (%)</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Nhóm ngành thuế HKD</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((cat) => {
                  const isEditing = editingCategory === cat.category_id
                  return (
                    <tr key={cat.category_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{cat.name}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={catTaxRate}
                            onChange={(e) => setCatTaxRate(e.target.value)}
                            placeholder="Mặc định: 0"
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                          />
                        ) : (
                          <span className="font-mono">{cat.tax_rate || '0'}%</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={catTaxGroup}
                            onChange={(e) => {
                              const groupCode = e.target.value
                              setCatTaxGroup(groupCode)
                              const matched = taxGroups.find((g) => g.code === groupCode)
                              if (matched) {
                                setCatTaxRate(String(matched.vat_rate))
                              }
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs w-full max-w-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          >
                            <option value="">-- Không áp dụng --</option>
                            {taxGroups.map((g) => (
                              <option key={g.code} value={g.code}>
                                {g.name} (VAT {g.vat_rate}%, TNCN {g.pit_rate}%)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-600 text-xs">
                            {taxGroups.find((g) => g.code === mapGroupToCode(cat.tax_group))?.name || cat.tax_group || 'Chưa thiết lập'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="space-x-2">
                            <button
                              onClick={() => handleSaveCategory(cat)}
                              disabled={savingCategory}
                              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
                            >
                              Lưu
                            </button>
                            <button
                              onClick={() => setEditingCategory(null)}
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingCategory(cat.category_id)
                              setCatTaxRate(cat.tax_rate || '0')
                              setCatTaxGroup(mapGroupToCode(cat.tax_group || ''))
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Chỉnh sửa
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Products */}
      {activeTab === 'products' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Thuế suất Sản phẩm</h2>
              <p className="text-xs text-slate-500">Cấu hình chi tiết mức thuế cho từng sản phẩm riêng biệt.</p>
            </div>
            
            <input
              type="text"
              placeholder="Tìm sản phẩm (Tên, SKU)..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Bulk Update Controls */}
          {selectedProductIds.length > 0 && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-700">
                Đang chọn <span className="text-primary font-bold">{selectedProductIds.length}</span> sản phẩm. Thiết lập nhanh cho các mục đã chọn:
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Thuế bán hàng (%)"
                  value={bulkTaxRate}
                  onChange={(e) => setBulkTaxRate(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                />
                <input
                  type="text"
                  placeholder="Thuế đầu vào mua hàng (%)"
                  value={bulkInputTaxRate}
                  onChange={(e) => setBulkInputTaxRate(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                />
                <select
                  value={bulkTaxGroup}
                  onChange={(e) => {
                    const groupCode = e.target.value
                    setBulkTaxGroup(groupCode)
                    const matched = taxGroups.find((g) => g.code === groupCode)
                    if (matched) {
                      setBulkTaxRate(String(matched.vat_rate))
                    }
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs max-w-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">-- Giữ nguyên / Chọn nhóm thuế --</option>
                  {taxGroups.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name} (VAT {g.vat_rate}%, TNCN {g.pit_rate}%)
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={handleBulkUpdate}
                  disabled={bulkSaving}
                  className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors shadow-sm disabled:opacity-50"
                >
                  {bulkSaving ? 'Đang lưu...' : 'Áp dụng đồng loạt'}
                </button>
                <button
                  onClick={() => setSelectedProductIds([])}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left w-12">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0}
                      onChange={toggleSelectAllProducts}
                      className="rounded border-slate-300 text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Sản phẩm / SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Thuế suất bán (%)</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Thuế suất mua (%)</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Nhóm ngành thuế HKD</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((prod) => {
                  const isEditing = editingProduct === prod.product_id
                  const isSelected = selectedProductIds.includes(prod.product_id)
                  return (
                    <tr
                      key={prod.product_id}
                      className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectProduct(prod.product_id)}
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{prod.name}</div>
                        {prod.sku && <div className="text-[10px] text-slate-400 font-mono">{prod.sku}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={prodTaxRate}
                            onChange={(e) => setProdTaxRate(e.target.value)}
                            placeholder="0"
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs w-20 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                          />
                        ) : (
                          <span>{prod.tax_rate || '0'}%</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={prodInputTaxRate}
                            onChange={(e) => setProdInputTaxRate(e.target.value)}
                            placeholder="0"
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs w-20 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                          />
                        ) : (
                          <span>{prod.input_tax_rate || '0'}%</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {isEditing ? (
                          <select
                            value={prodTaxGroup}
                            onChange={(e) => {
                              const groupCode = e.target.value
                              setProdTaxGroup(groupCode)
                              const matched = taxGroups.find((g) => g.code === groupCode)
                              if (matched) {
                                setProdTaxRate(String(matched.vat_rate))
                              }
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          >
                            <option value="">-- Không áp dụng --</option>
                            {taxGroups.map((g) => (
                              <option key={g.code} value={g.code}>
                                {g.name} (VAT {g.vat_rate}%, TNCN {g.pit_rate}%)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>
                            {taxGroups.find((g) => g.code === mapGroupToCode(prod.tax_group))?.name || prod.tax_group || 'Chưa thiết lập'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="space-x-2">
                            <button
                              onClick={() => handleSaveProduct(prod)}
                              disabled={savingProduct}
                              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
                            >
                              Lưu
                            </button>
                            <button
                              onClick={() => setEditingProduct(null)}
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingProduct(prod.product_id)
                              setProdTaxRate(prod.tax_rate || '0')
                              setProdInputTaxRate(prod.input_tax_rate || '0')
                              setProdTaxGroup(mapGroupToCode(prod.tax_group || ''))
                            }}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Chỉnh sửa
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unlock Reason Dialog */}
      {unlockingPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Mở khóa kỳ thuế {unlockingPeriod.period_name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Yêu cầu nhập lý do giải trình để thực hiện mở khóa. Hành động này sẽ được ghi nhận vào nhật ký kiểm toán (Audit Log) của hệ thống.
              </p>
            </div>

            <textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Nhập lý do diễn giải..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => {
                  setUnlockingPeriod(null)
                  setUnlockReason('')
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleUnlockPeriodSubmit}
                className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Xác nhận mở khóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock Confirmation Dialog */}
      {lockingPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Khóa sổ kỳ thuế {lockingPeriod.period_name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Khi kỳ thuế đã bị khóa sổ, toàn bộ đơn hàng trong thời gian này ({lockingPeriod.start_date} → {lockingPeriod.end_date}) sẽ bị đóng băng. Không thể tạo mới, chỉnh sửa, xóa hoặc đồng bộ hóa đơn trong kỳ này.
              </p>
            </div>

            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setLockingPeriod(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={async () => {
                  await handleLockPeriod(lockingPeriod)
                  setLockingPeriod(null)
                }}
                className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Xác nhận khóa sổ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recalculate Confirmation Dialog */}
      {showRecalcConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="text-red-600 mt-0.5">
                <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-slate-900">Xác nhận đồng bộ lại lịch sử thuế</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  CẢNH BÁO: Hành động này sẽ tính toán và ghi đè lại toàn bộ thông tin thuế (bao gồm tỷ lệ VAT/TNCN khoán snapshot, số tiền thuế) của tất cả đơn hàng trong khoảng thời gian từ <strong className="font-semibold">{fromDate}</strong> đến <strong className="font-semibold">{toDate}</strong>.
                </p>
                <ul className="text-xs text-slate-500 list-disc pl-4 space-y-1">
                  <li>Các kỳ thuế đã bị <strong>KHÓA SỔ</strong> trong khoảng thời gian này sẽ tự động bị bỏ qua và giữ nguyên dữ liệu.</li>
                  <li>Hành động này có thể làm thay đổi các báo cáo doanh thu và báo cáo thuế lịch sử.</li>
                </ul>
                <p className="text-xs text-slate-500 font-semibold">Bạn có chắc chắn muốn tiếp tục?</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowRecalcConfirm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleRecalculate}
                className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 transition-colors shadow-sm"
              >
                Xác nhận đồng bộ lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
