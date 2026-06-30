'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createTenantOnBehalf } from './actions';
import { INDUSTRY_TYPES, VERTICAL_REGISTRY } from '@oni/core';

export default function CreateTenantPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createTenantOnBehalf(formData);
      if (!result.success) {
        if (result.fieldErrors) {
          const errors: Record<string, string> = {};
          for (const [key, val] of Object.entries(result.fieldErrors)) {
            if (val && val.length > 0) errors[key] = val[0];
          }
          setFieldErrors(errors);
        }
        if (result.error) setError(result.error);
        if (result.field && result.error) {
          setFieldErrors(prev => ({ ...prev, [result.field!]: result.error! }));
        }
      } else {
        router.push(`/super/tenants/${result.data?.tenantId}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/super/tenants" className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tạo mới tổ chức</h1>
          <p className="text-sm text-slate-500 mt-0.5">Tạo tài khoản khách hàng trực tiếp, bỏ qua mọi giới hạn đăng ký.</p>
        </div>
      </div>

      <form action={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Tên tổ chức */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên tổ chức / Đơn vị</label>
            <input
              name="name"
              placeholder="Nhập tên tổ chức..."
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
              onChange={() => setFieldErrors(prev => ({ ...prev, name: '' }))}
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name[0] || fieldErrors.name}</p>}
          </div>

          {/* Slug */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Đường dẫn truy cập (Slug)</label>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
              <input
                name="slug"
                placeholder="ten-to-chuc"
                className="w-full px-4 py-2.5 text-sm focus:outline-none"
                required
                onChange={() => setFieldErrors(prev => ({ ...prev, slug: '' }))}
              />
              <span className="flex items-center bg-slate-50 px-3 text-sm text-slate-400 border-l border-slate-200">
                .oni.vn
              </span>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">Chữ không dấu, số và dấu gạch ngang.</p>
            {fieldErrors.slug && <p className="mt-1 text-xs text-red-500">{fieldErrors.slug[0] || fieldErrors.slug}</p>}
          </div>

          {/* Email Admin */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email quản trị</label>
            <input
              name="email"
              type="text"
              placeholder="email@example.com hoặc số điện thoại"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
              onChange={() => setFieldErrors(prev => ({ ...prev, email: '' }))}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email[0] || fieldErrors.email}</p>}
          </div>

          {/* Mật khẩu */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <input
              name="password"
              type="text"
              placeholder="Nhập mật khẩu (tối thiểu 8 ký tự)"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
              minLength={8}
              onChange={() => setFieldErrors(prev => ({ ...prev, password: '' }))}
            />
            {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password[0] || fieldErrors.password}</p>}
          </div>

          {/* Ngành nghề */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngành nghề</label>
            <select
              name="industry_type"
              defaultValue="retail"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {INDUSTRY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VERTICAL_REGISTRY[type].label}
                </option>
              ))}
            </select>
          </div>

          {/* Gói dịch vụ */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Gói dịch vụ</label>
            <select
              name="plan_code"
              defaultValue="plan_mini"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="plan_mini">Gói Starter (Mặc định)</option>
              <option value="plan_pro">Gói Pro</option>
              <option value="plan_enterprise">Gói Enterprise</option>
            </select>
            <p className="mt-1.5 text-[10px] text-slate-400">Tài khoản tạo hộ sẽ được tặng 30 ngày sử dụng theo gói đã chọn.</p>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <Link
            href="/super/tenants"
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Hủy
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPending ? 'Đang tạo...' : 'Tạo tổ chức'}
          </button>
        </div>
      </form>
    </div>
  );
}
