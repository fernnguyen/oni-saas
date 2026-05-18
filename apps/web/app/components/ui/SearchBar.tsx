interface SearchBarProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  hideFilter?: boolean
}

export function SearchBar({ value, onChange, placeholder = 'Tìm kiếm...', hideFilter }: SearchBarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center w-full">
      <div className="relative flex-1 max-w-md">
        <input
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 pr-8 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder={placeholder}
        />
        {value && (
          <button 
            onClick={() => onChange?.('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        )}
      </div>
      {!hideFilter && (
        <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 shrink-0 text-slate-600 font-medium transition-colors">
          Bộ lọc khác
        </button>
      )}
    </div>
  );
}
