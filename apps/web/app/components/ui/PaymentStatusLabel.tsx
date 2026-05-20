export type PaymentStatus = 'paid' | 'partial' | 'unpaid'

interface Props {
  status: PaymentStatus
  amount: number
  className?: string
}

export function PaymentStatusLabel({ status, amount, className }: Props) {
  const formatAmount = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val)
  }

  const getStatusStyles = () => {
    switch (status) {
      case 'paid':
        return {
          bg: 'bg-emerald-50 text-emerald-900',
          prefix: '',
          icon: (
            <div className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-emerald-500">
            </div>
          )
        }
      case 'partial':
        return {
          bg: 'bg-orange-50 text-orange-900',
          prefix: '',
          icon: (
            <div className="flex h-[14px] w-[14px] shrink-0 overflow-hidden rounded-full border border-orange-400 bg-white">
              <div className="h-full w-1/2 bg-orange-400"></div>
            </div>
          )
        }
      case 'unpaid':
        return {
          bg: 'bg-red-50 text-red-900',
          prefix: '',
          icon: (
            <div className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-red-500">
            </div>
          )
        }
      default:
        return {
          bg: 'bg-slate-50 text-slate-900',
          prefix: '',
          icon: <div className="h-[14px] w-[14px] shrink-0 rounded-full bg-slate-400"></div>
        }
    }
  }

  const styles = getStatusStyles()

  return (
    <div className={['inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 border border-current/10', styles.bg, className].filter(Boolean).join(' ')}>
      {styles.icon}
      <span className="text-xs font-semibold whitespace-nowrap">
        {styles.prefix} {formatAmount(amount)} <span className="border-b border-dashed border-current">đ</span>
      </span>
    </div>
  )
}
