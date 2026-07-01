'use client';

import { useState, useMemo } from 'react';

export default function MigrateClient({ tenants, shops }: { tenants: any[], shops: any[] }) {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedShop, setSelectedShop] = useState('');
  const [loading, setLoading] = useState(false);
  const [batchSize, setBatchSize] = useState(20);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ success: number; skip: number; fail: number; errors: any[] } | null>(null);

  const availableShops = useMemo(() => {
    return shops.filter((s) => s.tenant_id === selectedTenant);
  }, [selectedTenant, shops]);

  const handleFetchAndRun = async () => {
    if (!selectedTenant || !selectedShop) return;

    setLoading(true);
    setStatus('Đang lấy danh sách sản phẩm cần migrate...');
    setResults(null);
    setProgress({ current: 0, total: 0 });

    try {
      // Step 1: Fetch IDs that need migration
      const res = await fetch(`/api/super/tools/migrate-images?tenantId=${selectedTenant}&shopId=${selectedShop}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch products');
      }

      const totalNeedMigration = data.needMigrationCount;
      const productIdsToMigrate: string[] = data.productIds;

      if (totalNeedMigration === 0) {
        setStatus(`Tuyệt vời! Không có sản phẩm nào cần migrate ảnh trong ${data.total} sản phẩm.`);
        setLoading(false);
        return;
      }

      setStatus(`Bắt đầu migrate ${totalNeedMigration} sản phẩm...`);
      setProgress({ current: 0, total: totalNeedMigration });

      // Step 2: Chunk the array into batches of the user-defined size
      const BATCH_SIZE = Math.max(1, batchSize);
      let success = 0;
      let skip = 0;
      let fail = 0;
      let allErrors: any[] = [];

      for (let i = 0; i < productIdsToMigrate.length; i += BATCH_SIZE) {
        const batch = productIdsToMigrate.slice(i, i + BATCH_SIZE);
        
        const migrateRes = await fetch('/api/super/tools/migrate-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: selectedTenant,
            shopId: selectedShop,
            productIds: batch
          })
        });

        const migrateData = await migrateRes.json();

        if (migrateRes.ok) {
          success += migrateData.successCount || 0;
          skip += migrateData.skipCount || 0;
          fail += migrateData.failCount || 0;
          if (migrateData.errors) allErrors = [...allErrors, ...migrateData.errors];
        } else {
          fail += batch.length;
          allErrors.push({ error: migrateData.error || 'Batch failed completely' });
        }

        setProgress({ current: Math.min(i + BATCH_SIZE, totalNeedMigration), total: totalNeedMigration });
      }

      setStatus('Hoàn tất migrate!');
      setResults({ success, skip, fail, errors: allErrors });

    } catch (err: any) {
      setStatus(`Lỗi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Chọn Tổ chức (Tenant)</label>
          <select
            value={selectedTenant}
            onChange={(e) => {
              setSelectedTenant(e.target.value);
              setSelectedShop('');
            }}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">-- Chọn tổ chức --</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Chọn Chi nhánh (Shop)</label>
          <select
            value={selectedShop}
            onChange={(e) => setSelectedShop(e.target.value)}
            disabled={!selectedTenant || loading}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            <option value="">-- Chọn chi nhánh --</option>
            {availableShops.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Kích thước lô (Batch Size)</label>
          <input
            type="number"
            min="1"
            max="100"
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value) || 20)}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            placeholder="Mặc định: 20"
          />
        </div>
      </div>

      <button
        onClick={handleFetchAndRun}
        disabled={!selectedShop || loading}
        className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Đang xử lý...
          </>
        ) : (
          'Tiến hành Migrate'
        )}
      </button>

      {status && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700">
          {status}
        </div>
      )}

      {progress.total > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-slate-500">
            <span>Tiến độ</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-primary h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%` }}
            ></div>
          </div>
        </div>
      )}

      {results && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-2">
          <h3 className="font-bold text-green-800 text-sm">Báo cáo kết quả:</h3>
          <ul className="text-sm text-green-700 list-disc list-inside">
            <li>Thành công: <strong>{results.success}</strong></li>
            <li>Thất bại: <strong>{results.fail}</strong></li>
          </ul>
          
          {results.errors.length > 0 && (
            <div className="mt-4 pt-4 border-t border-green-200">
              <p className="text-sm font-bold text-red-600 mb-2">Chi tiết lỗi ({results.errors.length}):</p>
              <div className="max-h-40 overflow-y-auto bg-white rounded border border-red-100 p-2 text-xs font-mono text-red-500">
                {results.errors.map((e, idx) => (
                  <div key={idx}>- Product {e.productId}: {e.error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
