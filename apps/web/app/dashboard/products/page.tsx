import { PageHeader } from '@/app/components/ui/PageHeader';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { DataTable } from '@/app/components/ui/DataTable';

const products = [
  { id: 1, name: 'Áo Hoodie', createdAt: '07/08/2023 22:34', stock: 100, active: true },
  { id: 2, name: 'Áo thun basic', createdAt: '08/08/2023 08:32', stock: 0, active: true },
  { id: 3, name: 'Quần jean', createdAt: '08/08/2023 10:12', stock: 42, active: false },
];

export default function ProductsPage() {
  const columns = [
    { key: 'name', header: 'Sản phẩm', render: (p: any) => <span className="font-medium text-slate-800">{p.name}</span> },
    { key: 'createdAt', header: 'Ngày tạo', render: (p: any) => <span className="text-slate-600">{p.createdAt}</span> },
    { key: 'stock', header: 'Tồn kho', render: (p: any) => <span className="text-slate-600">{p.stock}</span> },
    {
      key: 'active',
      header: 'Trạng thái',
      render: (p: any) => (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {p.active ? 'Đang bán' : 'Tạm tắt'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý sản phẩm"
        subtitle="Sản phẩm / Danh sách sản phẩm"
        actions={
          <>
            <button className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">Import danh sách sản phẩm</button>
            <button className="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">Xuất Excel</button>
            <button className="rounded bg-[#0F766E] px-4 py-2 text-sm text-white hover:bg-[#115E59]">+ Thêm mới</button>
          </>
        }
      />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <SearchBar placeholder="Tìm kiếm theo Mã/SKU/Tên sản phẩm" />
        <DataTable columns={columns} rows={products} />
      </div>
    </div>
  );
}
