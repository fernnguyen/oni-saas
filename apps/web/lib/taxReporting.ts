export const TAX_EXEMPT_REVENUE_THRESHOLD = 1_000_000_000

export type TaxPeriodType = 'monthly' | 'quarterly' | 'annual'
export type TaxIndustryGroup =
  | 'phan_phoi'
  | 'dich_vu'
  | 'san_xuat'
  | 'cho_thue'
  | 'noi_dung_so'
  | 'khac'

export interface TaxPeriod {
  type: TaxPeriodType
  from: string
  to: string
  year: number
  month?: number
  quarter?: number
  label: string
}

export interface TaxProfile {
  shop_name?: string
  tax_owner_name?: string
  tax_id?: string
  tax_email?: string
  phone?: string
  address?: string
  tax_industry_group?: string
  tax_period_type?: string
}

export interface AnnualTaxData {
  year: number
  monthlyRevenue: Record<string, number>
  yearToDateRevenue: number
  totalReturns?: number
}

export const TAX_INDUSTRY_CONFIG: Record<
  TaxIndustryGroup,
  { name: string; shortName: string; templateKey: string; vatRate: number; pitRate: number }
> = {
  phan_phoi: {
    name: 'Phân phối, cung cấp hàng hóa',
    shortName: 'Phân phối',
    templateKey: 'pp',
    vatRate: 0.01,
    pitRate: 0.005,
  },
  dich_vu: {
    name: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu',
    shortName: 'Dịch vụ',
    templateKey: 'dv',
    vatRate: 0.05,
    pitRate: 0.02,
  },
  san_xuat: {
    name: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa',
    shortName: 'Sản xuất',
    templateKey: 'sx',
    vatRate: 0.03,
    pitRate: 0.015,
  },
  cho_thue: {
    name: 'Hoạt động cho thuê tài sản (trừ bất động sản)',
    shortName: 'Cho thuê',
    templateKey: 'ct',
    vatRate: 0.05,
    pitRate: 0.02,
  },
  noi_dung_so: {
    name: 'Nội dung thông tin số',
    shortName: 'Nội dung số',
    templateKey: 'nds',
    vatRate: 0.03,
    pitRate: 0.015,
  },
  khac: {
    name: 'Hoạt động kinh doanh khác',
    shortName: 'Khác',
    templateKey: 'k',
    vatRate: 0.02,
    pitRate: 0.01,
  },
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function asTaxPeriodType(value: string | null | undefined): TaxPeriodType {
  return value === 'monthly' || value === 'quarterly' || value === 'annual'
    ? value
    : 'annual'
}

export function getTaxPeriodRange(type: TaxPeriodType, anchorDate: string): TaxPeriod {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchorDate)
  const now = new Date()
  const year = match ? Number(match[1]) : now.getFullYear()
  const month = match ? Math.min(12, Math.max(1, Number(match[2]))) : now.getMonth() + 1

  if (type === 'annual') {
    return {
      type,
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      year,
      label: `Năm ${year}`,
    }
  }

  if (type === 'quarterly') {
    const quarter = Math.floor((month - 1) / 3) + 1
    const firstMonth = (quarter - 1) * 3 + 1
    const finalMonth = firstMonth + 2
    return {
      type,
      from: `${year}-${pad2(firstMonth)}-01`,
      to: `${year}-${pad2(finalMonth)}-${pad2(lastDayOfMonth(year, finalMonth))}`,
      year,
      quarter,
      label: `Quý ${quarter}/${year}`,
    }
  }

  return {
    type,
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`,
    year,
    month,
    label: `Tháng ${pad2(month)}/${year}`,
  }
}

export function getTaxIndustryGroup(value: string | undefined): TaxIndustryGroup {
  return value && value in TAX_INDUSTRY_CONFIG
    ? (value as TaxIndustryGroup)
    : 'khac'
}

export function formatDocxNumber(value: number | undefined) {
  if (!value || value <= 0) return ''
  return Math.round(value).toLocaleString('vi-VN')
}

export function requiresPeriodicCnkd(annualRevenue: number) {
  return annualRevenue > TAX_EXEMPT_REVENUE_THRESHOLD
}

export function getMissingTaxProfileFields(
  profile: TaxProfile,
  options: { requireAddress?: boolean } = {}
) {
  const missing: string[] = []
  if (!profile.tax_owner_name && !profile.shop_name) missing.push('Tên người nộp thuế')
  if (!profile.tax_id) missing.push('Mã số thuế')
  if (!profile.tax_industry_group) missing.push('Ngành nghề tính thuế')
  if (options.requireAddress && !profile.address) missing.push('Trụ sở kinh doanh')
  return missing
}

export function buildCnkdTemplateData(
  profile: TaxProfile,
  revenue: number,
  period: TaxPeriod
) {
  const industry = getTaxIndustryGroup(profile.tax_industry_group)
  const config = TAX_INDUSTRY_CONFIG[industry]
  const result: Record<string, string> = {
    tax_owner_name: profile.tax_owner_name || profile.shop_name || '',
    tax_id: profile.tax_id || '',
    tru_so_kinh_doanh: profile.address || '',
    tax_industry_group_name: config.name,
    tax_period_label: period.label,
    tax_month: period.type === 'monthly' ? String(period.month) : '',
    tax_month_year: period.type === 'monthly' ? String(period.year) : '',
    tax_quarter: period.type === 'quarterly' ? String(period.quarter) : '',
    tax_quarter_year: period.type === 'quarterly' ? String(period.year) : '',
    tax_annual_year: period.type === 'annual' ? String(period.year) : '',
  }

  for (const item of Object.values(TAX_INDUSTRY_CONFIG)) {
    result[`gtgt_${item.templateKey}`] = ''
    result[`gtgt_${item.templateKey}_tax`] = ''
    result[`tncn_${item.templateKey}`] = ''
    result[`tncn_${item.templateKey}_tax`] = ''
  }

  result[`gtgt_${config.templateKey}`] = formatDocxNumber(revenue)
  result[`gtgt_${config.templateKey}_tax`] = formatDocxNumber(revenue * config.vatRate)
  result[`tncn_${config.templateKey}`] = formatDocxNumber(revenue)
  result[`tncn_${config.templateKey}_tax`] = formatDocxNumber(revenue * config.pitRate)

  return result
}

export function buildTknTemplateData(profile: TaxProfile, annualData: AnnualTaxData) {
  const industry = getTaxIndustryGroup(profile.tax_industry_group)
  const config = TAX_INDUSTRY_CONFIG[industry]
  const result: Record<string, string> = {
    tax_owner_name: profile.tax_owner_name || profile.shop_name || '',
    tax_id: profile.tax_id || '',
    tax_year: String(annualData.year),
    tax_industry_group_name: config.shortName,
    tkn_08_total_revenue: formatDocxNumber(annualData.yearToDateRevenue),
    tkn_13_1_total_revenue: formatDocxNumber(annualData.yearToDateRevenue),
  }

  for (let indicator = 2; indicator <= 15; indicator += 1) {
    result[`tkn_13_${indicator}`] = ''
  }

  return result
}
