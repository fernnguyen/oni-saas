'use client';

export function UpgradeButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-plan-modal'))}
      className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-dark transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 active:scale-95"
    >
      Nâng cấp gói dịch vụ
    </button>
  );
}
