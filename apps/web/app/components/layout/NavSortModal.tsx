'use client';

import React, { useEffect, useState } from 'react';
import { Settings2, RotateCcw, X, Eye, EyeOff } from 'lucide-react';
import type { NavGroupPref } from './useNavPreference';

interface NavSortModalProps {
  open: boolean;
  onClose: () => void;
  groupPrefs: NavGroupPref[];
  onSave: (prefs: NavGroupPref[]) => void;
  onReset: () => void;
}

export function NavSortModal({
  open,
  onClose,
  groupPrefs,
  onSave,
  onReset,
}: NavSortModalProps) {
  const [draft, setDraft] = useState<NavGroupPref[]>([]);

  // Sync draft whenever modal opens
  useEffect(() => {
    if (open) {
      // Sort by current order for display
      setDraft([...groupPrefs].sort((a, b) => a.order - b.order));
    }
  }, [open, groupPrefs]);

  if (!open) return null;

  function handleOrderChange(label: string, rawValue: string) {
    const value = parseInt(rawValue, 10);
    if (isNaN(value) || value < 1) return;
    setDraft((prev) =>
      prev.map((g) => (g.label === label ? { ...g, order: value } : g)),
    );
  }

  function handleVisibleToggle(label: string) {
    setDraft((prev) =>
      prev.map((g) => (g.label === label ? { ...g, visible: !g.visible } : g)),
    );
  }

  function handleSave() {
    // Normalize orders: re-assign 1..N based on current order values to avoid gaps
    const sorted = [...draft].sort((a, b) => a.order - b.order);
    const normalized = sorted.map((g, i) => ({ ...g, order: i + 1 }));
    onSave(normalized);
    onClose();
  }

  function handleReset() {
    onReset();
    onClose();
  }

  const visibleCount = draft.filter((g) => g.visible).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Settings2 className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Tùy chỉnh menu</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chọn nhóm hiển thị trên menu chính · còn lại vào "Thêm"
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Group list */}
        <div className="p-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {draft.map((group) => (
            <div
              key={group.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                group.visible
                  ? 'bg-slate-50 hover:bg-slate-100'
                  : 'bg-slate-50/50 opacity-60 hover:opacity-80'
              }`}
            >
              {/* Visibility toggle */}
              <button
                onClick={() => handleVisibleToggle(group.label)}
                className={`shrink-0 p-1 rounded-md transition-colors cursor-pointer ${
                  group.visible
                    ? 'text-primary hover:bg-primary/10'
                    : 'text-slate-400 hover:bg-slate-200'
                }`}
                title={group.visible ? 'Ẩn khỏi menu chính' : 'Hiện trên menu chính'}
              >
                {group.visible ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>

              {/* Group label */}
              <span
                className={`flex-1 text-sm font-medium ${
                  group.visible ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'
                }`}
              >
                {group.label}
              </span>

              {/* Badge: in "Thêm" */}
              {!group.visible && (
                <span className="text-[10px] font-semibold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full shrink-0">
                  Thêm
                </span>
              )}

              {/* Order input */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-slate-400">Vị trí</span>
                <input
                  type="number"
                  min={1}
                  max={draft.length}
                  value={group.order}
                  onChange={(e) => handleOrderChange(group.label, e.target.value)}
                  className="w-12 text-center text-sm border border-slate-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="px-5 pb-1">
          <p className="text-[11px] text-slate-400">
            {visibleCount} nhóm hiển thị trên menu chính · {draft.length - visibleCount} nhóm trong "Thêm"
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Đặt lại mặc định
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 font-medium transition-colors cursor-pointer shadow-sm"
            >
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
