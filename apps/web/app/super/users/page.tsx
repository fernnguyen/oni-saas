'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, RefreshCw, Wifi, Clock, WifiOff, Building2,
  Store, ShieldCheck, ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  onlineStatus: 'online' | 'recent' | 'inactive' | 'never';
  isSuperAdmin: boolean;
  tenants: { tenantId: string; tenantName: string | null; tenantSlug: string | null; role: string | null }[];
  shops:   { shopId:  string; shopName:  string | null; shopSlug:  string | null; role: string | null }[];
}

interface ActiveUsersData {
  users: ActiveUser[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return 'Chưa bao giờ';
  const diff  = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'Vừa xong';
  if (mins < 60)  return `${mins} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 30)  return `${days} ngày trước`;
  return new Date(isoStr).toLocaleDateString('vi-VN');
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ONLINE_CONFIG = {
  online:   { label: 'Online',            dot: 'bg-emerald-500 animate-pulse', badge: 'bg-emerald-100 text-emerald-700', Icon: Wifi },
  recent:   { label: 'Gần đây',           dot: 'bg-amber-400',                  badge: 'bg-amber-100 text-amber-700',    Icon: Clock },
  inactive: { label: 'Không hoạt động',  dot: 'bg-slate-300',                  badge: 'bg-slate-100 text-slate-500',    Icon: WifiOff },
  never:    { label: 'Chưa đăng nhập',   dot: 'bg-slate-200',                  badge: 'bg-slate-100 text-slate-400',    Icon: WifiOff },
} as const;

// ─── Search panel (client-side) ───────────────────────────────────────────────

function SearchPanel({ users }: { users: ActiveUser[] }) {
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const lq = q.toLowerCase().trim();
    if (!lq) return [];
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(lq) ||
        u.phone?.includes(lq) ||
        u.displayName?.toLowerCase().includes(lq) ||
        u.id.toLowerCase().includes(lq) ||
        u.tenants.some((t) => t.tenantSlug?.toLowerCase().includes(lq) || t.tenantName?.toLowerCase().includes(lq)),
    );
  }, [users, q]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 font-semibold text-slate-800">Tìm kiếm người dùng</h2>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Email, số điện thoại, tên, user ID, tên cửa hàng..."
          className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {q.trim() && (
        <div className="mt-3 space-y-2">
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Không tìm thấy người dùng nào</p>
          ) : (
            results.map((u) => {
              const cfg  = ONLINE_CONFIG[u.onlineStatus];
              const name = u.displayName || u.email || u.phone || u.id.slice(0, 8);
              return (
                <div key={u.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="relative shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${cfg.dot}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-800">{name}</span>
                      {u.isSuperAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                          <ShieldCheck className="h-3 w-3" /> super_admin
                        </span>
                      )}
                      {u.tenants.map((t) => (
                        <span key={t.tenantId} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600">
                          <Building2 className="h-2.5 w-2.5" />
                          {t.tenantName ?? t.tenantSlug}
                          {t.role && <span className="text-indigo-300">·{t.role}</span>}
                        </span>
                      ))}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{u.id}</p>
                    <p className="text-xs text-slate-400">
                      {u.email && <span className="mr-2">{u.email}</span>}
                      {u.phone && <span>{u.phone}</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                      <cfg.Icon className="h-3 w-3" /> {cfg.label}
                    </span>
                    <p className="mt-1 text-xs text-slate-400">{relativeTime(u.lastSignInAt)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── User row in the list ─────────────────────────────────────────────────────

function UserRow({ u }: { u: ActiveUser }) {
  const cfg  = ONLINE_CONFIG[u.onlineStatus];
  const name = u.displayName || u.email || u.phone || u.id.slice(0, 8);

  return (
    <tr className="group transition-colors hover:bg-slate-50">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
              {name.charAt(0).toUpperCase()}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${cfg.dot}`} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-slate-900">{name}</span>
              {u.isSuperAdmin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                  <ShieldCheck className="h-3 w-3" /> super
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-slate-400">{u.email ?? u.phone ?? u.id.slice(0, 16)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {u.tenants.map((t) => (
            <span key={t.tenantId} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600">
              <Building2 className="h-2.5 w-2.5" />
              {t.tenantName ?? t.tenantSlug ?? t.tenantId.slice(0, 8)}
              {t.role && <span className="text-indigo-300">·{t.role}</span>}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {u.shops.slice(0, 3).map((s) => (
            <span key={s.shopId} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
              <Store className="h-2.5 w-2.5" />
              {s.shopName ?? s.shopSlug ?? s.shopId.slice(0, 8)}
              {s.role && <span className="text-blue-300">·{s.role}</span>}
            </span>
          ))}
          {u.shops.length > 3 && <span className="text-xs text-slate-400">+{u.shops.length - 3}</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
          <cfg.Icon className="h-3 w-3" /> {cfg.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">
        {relativeTime(u.lastSignInAt)}
      </td>
      <td className="px-4 py-3 text-right text-xs text-slate-400">
        {new Date(u.createdAt).toLocaleDateString('vi-VN')}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperUsersPage() {
  const [filter,       setFilter]       = useState<'all' | 'online' | 'recent'>('all');
  const [tenantFilter, setTenantFilter] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const url = '/api/super/active-users?limit=100';

  const { data, isLoading, refetch, isFetching } = useQuery<ActiveUsersData>({
    queryKey: ['super-users-page'],
    queryFn:  async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Unique tenant list for filter dropdown
  const allTenants = useMemo(() => {
    if (!data?.users) return [];
    const seen = new Map<string, string>();
    for (const u of data.users) {
      for (const t of u.tenants) {
        if (!seen.has(t.tenantId)) seen.set(t.tenantId, t.tenantName ?? t.tenantSlug ?? t.tenantId.slice(0, 8));
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const displayedUsers = useMemo(() => {
    if (!data?.users) return [];
    let list = data.users;
    if (filter === 'online') list = list.filter((u) => u.onlineStatus === 'online');
    if (filter === 'recent') list = list.filter((u) => u.onlineStatus === 'online' || u.onlineStatus === 'recent');
    if (tenantFilter) list = list.filter((u) => u.tenants.some((t) => t.tenantId === tenantFilter));
    return list;
  }, [data, filter, tenantFilter]);

  const counts = useMemo(() => {
    const all = data?.users ?? [];
    return {
      online: all.filter((u) => u.onlineStatus === 'online').length,
      recent: all.filter((u) => u.onlineStatus === 'recent').length,
      total:  all.length,
    };
  }, [data]);

  const selectedTenantName = allTenants.find((t) => t.id === tenantFilter)?.name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Người dùng hệ thống</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {counts.total} người dùng gần nhất ·{' '}
            {counts.online > 0 && (
              <span className="font-medium text-emerald-600">{counts.online} online</span>
            )}
            {counts.online === 0 && <span>không có ai online</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter pills */}
          {(['all', 'online', 'recent'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f === 'all' ? 'Tất cả' : f === 'online' ? `Online (${counts.online})` : `24h (${counts.online + counts.recent})`}
            </button>
          ))}

          {/* Tenant filter */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:bg-slate-50"
            >
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span>{selectedTenantName ?? 'Tất cả cửa hàng'}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <button
                  onClick={() => { setTenantFilter(''); setDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${!tenantFilter ? 'font-medium text-indigo-600' : 'text-slate-700'}`}
                >
                  Tất cả cửa hàng
                </button>
                {allTenants.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setTenantFilter(t.id); setDropdownOpen(false); }}
                    className={`w-full truncate px-3 py-2 text-left text-xs hover:bg-slate-50 ${tenantFilter === t.id ? 'font-medium text-indigo-600' : 'text-slate-700'}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search */}
      {data && <SearchPanel users={data.users} />}

      {/* User table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-800">
            {filter === 'all' ? 'Tất cả người dùng' : filter === 'online' ? 'Đang online' : 'Hoạt động trong 24h'}
            {tenantFilter && selectedTenantName && (
              <span className="ml-2 text-sm font-normal text-slate-500">· {selectedTenantName}</span>
            )}
          </h2>
          <span className="text-xs text-slate-400">{displayedUsers.length} người dùng</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : displayedUsers.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-400">
            Không có người dùng nào khớp bộ lọc
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Người dùng</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Cửa hàng</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Chi nhánh</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Trạng thái</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Lần cuối</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedUsers.map((u) => <UserRow key={u.id} u={u} />)}
              </tbody>
            </table>
          </div>
        )}

        {data && data.users.length >= 100 && (
          <div className="border-t border-slate-100 px-6 py-3 text-center text-xs text-slate-400">
            Hiển thị 100 người dùng gần nhất — dùng tính năng tìm kiếm để tìm thêm
          </div>
        )}
      </div>
    </div>
  );
}
