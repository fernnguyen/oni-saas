import { HrmPayrollRunNotFoundError } from '@oni/adapters';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const vnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);

const dateVi = (iso: string | null) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso));
};

function salaryTypeLabel(type: string) {
  if (type === 'monthly') return 'Lương tháng';
  if (type === 'daily') return 'Lương ngày';
  return 'Lương giờ';
}

function row(label: string, value: string, bold = false, negative = false) {
  const valueClass = negative ? 'text-rose-700' : bold ? 'font-bold' : '';
  const labelClass = bold ? 'font-semibold' : '';
  return `
    <tr>
      <td class="py-2 pr-4 text-slate-600 ${labelClass}">${label}</td>
      <td class="py-2 text-right ${valueClass}">${value}</td>
    </tr>`;
}

function sectionHeader(title: string) {
  return `
    <tr>
      <td colspan="2" class="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200">
        ${title}
      </td>
    </tr>`;
}

/**
 * GET /api/shops/[shopId]/hrm/payroll-runs/[runId]/payslip/[itemId]
 *
 * Returns an HTML payslip for a single employee in a payroll run.
 * Designed to be printed as PDF via browser Ctrl+P.
 *
 * Permission: hrm.payroll.view
 */
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; runId: string; itemId: string }> },
) {
  try {
    const { shopId, runId, itemId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.view');
    const run = await access.repository.getPayrollRun(runId);
    if (!run) throw new HrmPayrollRunNotFoundError();

    const item = run.items.find((i) => i.id === itemId);
    if (!item) {
      return new Response('Không tìm thấy nhân viên trong kỳ lương này.', {
        status: 404,
      });
    }

    // Fetch shop name from Supabase control plane
    const admin = getSupabaseAdminClient();
    const { data: shopData } = await admin
      .from('shops')
      .select('name')
      .eq('id', shopId)
      .maybeSingle();
    const shopName: string = (shopData as { name?: string } | null)?.name ?? 'ONI';

    const [periodYear, periodMonth] = run.periodStart.split('-');
    const periodLabel = `Tháng ${periodMonth}/${periodYear}`;

    // Build breakdown line items
    const breakdown = item.breakdown;
    const recurringAllowances = breakdown.calculationInput.recurringAllowances ?? [];
    const additionalAllowances = breakdown.adjustments.additionalAllowances ?? [];
    const bonuses = breakdown.adjustments.bonuses ?? [];
    const commissions = breakdown.adjustments.commissions ?? [];
    const deductions = breakdown.adjustments.deductions ?? [];

    const statusLabel =
      run.status === 'paid'
        ? 'Đã thanh toán'
        : run.status === 'finalized'
          ? 'Đã chốt'
          : 'Bản nháp';

    const workUnitLabel =
      item.salaryType === 'hourly'
        ? `${item.workUnits.toFixed(2)} giờ`
        : `${item.workUnits} ngày`;

    const paidAt = run.paidAt ? dateVi(run.paidAt) : null;

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Phiếu lương — ${item.employeeName} — ${periodLabel}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      color: #1e293b;
      background: #f8fafc;
      padding: 24px;
    }

    .page {
      max-width: 640px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }

    /* ── Header ── */
    .header {
      padding: 28px 32px 20px;
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: #fff;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .company-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .payslip-title {
      font-size: 11px;
      font-weight: 500;
      opacity: 0.8;
      margin-top: 2px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border: 1px solid rgba(255,255,255,0.4);
      color: #fff;
    }
    .badge.paid { background: rgba(16,185,129,0.25); }
    .badge.finalized { background: rgba(251,191,36,0.25); }
    .badge.draft { background: rgba(148,163,184,0.25); }

    .header-meta {
      display: flex;
      gap: 24px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.2);
      font-size: 12px;
    }
    .meta-item { opacity: 0.85; }
    .meta-item strong { display: block; font-size: 13px; font-weight: 600; opacity: 1; }

    /* ── Employee ── */
    .employee-section {
      padding: 20px 32px 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      gap: 24px;
    }
    .employee-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #dbeafe;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      color: #1d4ed8;
      flex-shrink: 0;
    }
    .employee-name { font-size: 16px; font-weight: 700; color: #0f172a; }
    .employee-sub { font-size: 12px; color: #64748b; margin-top: 2px; }

    /* ── Net pay hero ── */
    .net-hero {
      padding: 24px 32px;
      text-align: center;
      border-bottom: 1px solid #e2e8f0;
      background: #fff;
    }
    .net-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; }
    .net-amount { font-size: 36px; font-weight: 800; color: #0f172a; letter-spacing: -1px; margin-top: 4px; }
    .net-sub { font-size: 12px; color: #94a3b8; margin-top: 4px; }

    /* ── Breakdown table ── */
    .breakdown {
      padding: 0 32px 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td { font-size: 13px; line-height: 1.6; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .text-slate-600 { color: #475569; }
    .text-slate-400 { color: #94a3b8; }
    .text-rose-700 { color: #be123c; }
    .text-right { text-align: right; }
    .py-2 { padding-top: 6px; padding-bottom: 6px; }
    .pr-4 { padding-right: 16px; }
    .pt-4 { padding-top: 16px; }
    .pb-1 { padding-bottom: 4px; }
    .border-b { border-bottom: 1px solid #e2e8f0; }
    .text-xs { font-size: 11px; }
    .uppercase { text-transform: uppercase; }
    .tracking-wider { letter-spacing: 0.08em; }

    .divider {
      margin: 0 32px;
      border: none;
      border-top: 2px solid #e2e8f0;
    }

    /* ── Footer ── */
    .footer {
      padding: 16px 32px 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer-note { font-size: 11px; color: #94a3b8; line-height: 1.5; }
    .sign-block { text-align: center; }
    .sign-line { width: 120px; border-top: 1px solid #94a3b8; margin-top: 48px; }
    .sign-label { font-size: 11px; color: #94a3b8; margin-top: 4px; }

    /* ── Print ── */
    @media print {
      body { background: #fff; padding: 0; }
      .page { border: none; border-radius: 0; box-shadow: none; max-width: 100%; }
      .no-print { display: none !important; }
    }

    /* ── Print button (screen only) ── */
    .print-btn {
      display: block;
      max-width: 640px;
      margin: 16px auto 0;
      padding: 10px;
      background: #1e40af;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      text-align: center;
    }
    .print-btn:hover { background: #1d4ed8; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ In / Lưu PDF</button>

  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <div>
          <div class="company-name">${escHtml(shopName)}</div>
          <div class="payslip-title">Phiếu lương</div>
        </div>
        <span class="badge ${run.status}">
          ${statusLabel}
        </span>
      </div>
      <div class="header-meta">
        <div class="meta-item">
          <span>Kỳ lương</span>
          <strong>${periodLabel}</strong>
        </div>
        <div class="meta-item">
          <span>Từ ngày</span>
          <strong>${dateVi(run.periodStart)}</strong>
        </div>
        <div class="meta-item">
          <span>Đến ngày</span>
          <strong>${dateVi(run.periodEnd)}</strong>
        </div>
        ${paidAt ? `<div class="meta-item"><span>Ngày chi</span><strong>${paidAt}</strong></div>` : ''}
      </div>
    </div>

    <!-- Employee -->
    <div class="employee-section">
      <div class="employee-avatar">${escHtml(item.employeeName.charAt(0).toUpperCase())}</div>
      <div>
        <div class="employee-name">${escHtml(item.employeeName)}</div>
        <div class="employee-sub">
          ${item.employeeCode ? `Mã: ${escHtml(item.employeeCode)} · ` : ''}${salaryTypeLabel(item.salaryType)}
        </div>
      </div>
    </div>

    <!-- Net pay hero -->
    <div class="net-hero">
      <div class="net-label">Thực nhận</div>
      <div class="net-amount">${vnd(item.netPay)}</div>
      <div class="net-sub">Số công: ${workUnitLabel}</div>
    </div>

    <!-- Breakdown -->
    <div class="breakdown">
      <table>
        <!-- Lương cơ bản -->
        ${sectionHeader('Lương theo công')}
        ${row('Lương cơ bản', vnd(item.baseAmount))}
        ${row('Số công tính lương', workUnitLabel)}
        ${row('Lương theo công', vnd(item.regularPay), true)}
        ${item.overtimePay > 0 ? row('Lương tăng ca', vnd(item.overtimePay)) : ''}

        <!-- Phụ cấp định kỳ -->
        ${
          recurringAllowances.length > 0
            ? sectionHeader('Phụ cấp định kỳ') +
              recurringAllowances
                .map((a) => row(escHtml(a.label), vnd(Number(a.amount))))
                .join('')
            : ''
        }

        <!-- Phụ cấp / thưởng điều chỉnh -->
        ${
          additionalAllowances.length > 0 || bonuses.length > 0 || commissions.length > 0
            ? sectionHeader('Khoản cộng khác') +
              [...additionalAllowances, ...bonuses, ...commissions]
                .map((a) => row(escHtml(a.label), vnd(Number(a.amount))))
                .join('')
            : ''
        }

        <!-- Tổng cộng -->
        ${sectionHeader('Tổng hợp')}
        ${item.allowanceTotal > 0 ? row('Tổng phụ cấp', vnd(item.allowanceTotal)) : ''}
        ${item.overtimePay > 0 ? row('Tổng tăng ca', vnd(item.overtimePay)) : ''}
        ${item.bonusTotal + item.commissionTotal > 0 ? row('Thưởng / Hoa hồng', vnd(item.bonusTotal + item.commissionTotal)) : ''}

        <!-- Khấu trừ -->
        ${
          deductions.length > 0
            ? sectionHeader('Khấu trừ') +
              deductions.map((d) => row(escHtml(d.label), `– ${vnd(Number(d.amount))}`, false, true)).join('') +
              row('Tổng khấu trừ', `– ${vnd(item.deductionTotal)}`, true, true)
            : ''
        }

        <!-- Thực nhận -->
        ${sectionHeader('Kết quả')}
        ${row('Thu nhập gộp', vnd(item.regularPay + item.overtimePay + item.allowanceTotal + item.bonusTotal + item.commissionTotal))}
        ${row('Khấu trừ', `– ${vnd(item.deductionTotal)}`, false, item.deductionTotal > 0)}
        ${row('✦ Thực nhận', vnd(item.netPay), true)}
      </table>

      ${
        item.manualNote
          ? `<div style="margin-top:16px;padding:10px 14px;background:#f8fafc;border-left:3px solid #3b82f6;border-radius:4px;font-size:12px;color:#475569;">
              <strong style="color:#0f172a;">Ghi chú:</strong> ${escHtml(item.manualNote)}
             </div>`
          : ''
      }
    </div>

    <hr class="divider" />

    <!-- Footer -->
    <div class="footer">
      <div class="footer-note">
        Phiếu lương được tạo bởi hệ thống ONI.<br />
        Xuất lúc ${new Intl.DateTimeFormat('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(new Date())}.
      </div>
      <div class="sign-block">
        <div class="sign-line"></div>
        <div class="sign-label">Chữ ký xác nhận</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return respondPayrollError(error);
  }
}

/** Escape HTML special characters to prevent XSS in interpolated payslip data */
function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
