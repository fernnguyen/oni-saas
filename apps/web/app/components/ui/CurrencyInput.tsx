'use client';

import type { InputHTMLAttributes } from 'react';

const VND_FORMATTER = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

export function normalizeCurrencyDigits(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  return digits.replace(/^0+(?=\d)/, '');
}

export function formatCurrencyDigits(value: string): string {
  const digits = normalizeCurrencyDigits(value);
  return digits ? VND_FORMATTER.format(Number(digits)) : '';
}

interface CurrencyInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange'
  > {
  value: string;
  onValueChange: (value: string) => void;
  currencyLabel?: string;
}

export function CurrencyInput({
  value,
  onValueChange,
  currencyLabel = '₫',
  className = '',
  ...props
}: CurrencyInputProps) {
  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatCurrencyDigits(value)}
        onChange={(event) =>
          onValueChange(normalizeCurrencyDigits(event.target.value))
        }
        className={`w-full rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-11 text-right tabular-nums text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${className}`}
      />
      <span
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-400"
        aria-hidden="true"
      >
        {currencyLabel}
      </span>
    </div>
  );
}
