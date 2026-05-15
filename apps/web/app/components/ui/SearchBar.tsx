interface SearchBarProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  hideFilter?: boolean
}

export function SearchBar({ value, onChange, placeholder = 'Tìm kiếm...', hideFilter }: SearchBarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center w-full">
      <div className="flex-1">
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-[#0F766E]"
          placeholder={placeholder}
        />
      </div>
      {!hideFilter && (
        <button className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 shrink-0">
          Bộ lọc khác
        </button>
      )}
    </div>
  );
}
