export function SearchBar({ placeholder = 'Tìm kiếm...' }: { placeholder?: string }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="flex-1">
        <input
          className="w-full rounded border border-slate-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-[#0F766E]"
          placeholder={placeholder}
        />
      </div>
      <button className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Bộ lọc khác</button>
    </div>
  );
}
