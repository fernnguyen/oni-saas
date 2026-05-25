'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EditFeaturesDialogProps {
  tenantId: string;
  currentFeatures: { key: string; enabled: boolean }[];
  availableModules: { code: string; name: string; description: string | null }[];
}

export function EditFeaturesDialog({
  tenantId,
  currentFeatures,
  availableModules,
}: EditFeaturesDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Map initial enabled state into a set for quick lookups
  const initialEnabled = currentFeatures.filter((f) => f.enabled).map((f) => f.key);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(initialEnabled);

  function handleToggle(code: string) {
    setSelectedFeatures((prev) =>
      prev.includes(code) ? prev.filter((k) => k !== code) : [...prev, code]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const response = await fetch(`/api/super/tenants/${tenantId}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabledFeatures: selectedFeatures }),
    });

    setLoading(false);

    if (response.ok) {
      setIsOpen(false);
      router.refresh();
    } else {
      const data = await response.json();
      alert(`Error: ${data.error || 'Failed to update features'}`);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setSelectedFeatures(currentFeatures.filter((f) => f.enabled).map((f) => f.key));
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Cấu hình Features
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Cấu hình Feature Add-ons</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <p className="text-xs text-slate-500 mb-2">
                Bật hoặc tắt các Add-on doanh nghiệp cao cấp cho Tenant này. Trạng thái sẽ được đồng bộ và áp dụng ngay lập tức.
              </p>

              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto pr-1">
                {availableModules.map((m) => {
                  const checked = selectedFeatures.includes(m.code);
                  return (
                    <label
                      key={m.code}
                      className="flex items-start gap-3 py-3 cursor-pointer hover:bg-slate-50 rounded-lg px-2 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggle(m.code)}
                        className="mt-1 h-4 w-4 rounded border-slate-350 text-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-slate-800">{m.name}</span>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{m.code}</p>
                        {m.description && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.description}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60"
                >
                  {loading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
