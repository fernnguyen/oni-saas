'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface Props {
  shopId: string
}

export function TaxProfileForm({ shopId }: Props) {
  const queryClient = useQueryClient()
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ['shop-settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) throw new Error('Lỗi tải cài đặt')
      return res.json()
    }
  })

  const [formData, setFormData] = useState({
    tax_owner_name: '',
    tax_id: '',
    tax_email: '',
    phone: '',
    address: '',
    tax_industry_group: 'phan_phoi',
    tax_period_type: 'annual',
    tax_method_tncn: 'rate_on_revenue'
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        tax_owner_name: settings.tax_owner_name || '',
        tax_id: settings.tax_id || '',
        tax_email: settings.tax_email || '',
        phone: settings.phone || '',
        address: settings.address || '',
        tax_industry_group: settings.tax_industry_group || 'phan_phoi',
        tax_period_type: settings.tax_period_type || 'annual',
        tax_method_tncn: settings.tax_method_tncn || 'rate_on_revenue'
      })
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/shops/${shopId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Lưu thất bại')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-settings', shopId] })
      alert('Đã lưu thông tin thuế thành công!')
    },
    onError: (e: any) => {
      alert(e.message)
    }
  })

  if (isLoading) return <div className="p-4 text-sm text-slate-500">Đang tải thông tin...</div>

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
      <h3 className="font-semibold text-slate-800">Thông tin người nộp thuế</h3>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tên người nộp thuế (Chủ hộ KD)</label>
          <input 
            type="text" 
            value={formData.tax_owner_name}
            onChange={(e) => setFormData(s => ({ ...s, tax_owner_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            placeholder="Nguyễn Văn A"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Mã số thuế</label>
          <input 
            type="text" 
            value={formData.tax_id}
            onChange={(e) => setFormData(s => ({ ...s, tax_id: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Địa chỉ kinh doanh</label>
          <input 
            type="text" 
            value={formData.address}
            onChange={(e) => setFormData(s => ({ ...s, address: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Điện thoại liên hệ</label>
          <input 
            type="text" 
            value={formData.phone}
            onChange={(e) => setFormData(s => ({ ...s, phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email nhận thông báo thuế</label>
          <input 
            type="email" 
            value={formData.tax_email}
            onChange={(e) => setFormData(s => ({ ...s, tax_email: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Ngành nghề tính thuế</label>
          <select
            value={formData.tax_industry_group}
            onChange={(e) => setFormData(s => ({ ...s, tax_industry_group: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="phan_phoi">Phân phối, cung cấp hàng hóa (1.5%)</option>
            <option value="dich_vu">Dịch vụ, xây dựng không bao thầu (7%)</option>
            <option value="san_xuat">Sản xuất, vận tải, dịch vụ kèm hàng hóa (4.5%)</option>
            <option value="cho_thue">Cho thuê tài sản (7%)</option>
            <option value="noi_dung_so">Nội dung số (4.5%)</option>
            <option value="khac">Hoạt động kinh doanh khác (3%)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kỳ khai thuế</label>
          <select
            value={formData.tax_period_type}
            onChange={(e) => setFormData(s => ({ ...s, tax_period_type: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="annual">Khai theo năm</option>
            <option value="monthly">Khai theo tháng</option>
            <option value="quarterly">Khai theo quý</option>
          </select>
        </div>
      </div>
      
      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button 
          onClick={() => mutation.mutate(formData)}
          disabled={mutation.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
        </button>
      </div>
    </div>
  )
}
