import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface HrmRepositoryScope {
  tenantId: string;
  branchId: string;
}

export interface HrmOverview {
  employeeCount: number;
  presentToday: number;
  draftPayrollRuns: number | null;
}

export interface HrmEmployeeSummary {
  id: string;
  profileId: string | null;
  authUserId: string | null;
  employeeCode: string | null;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  employmentType: string;
  joinedAt: string | null;
  email: string | null;
  address: string | null;
  departmentId: string | null;
  departmentName: string | null;
  customData: Record<string, unknown>;
}

export interface HrmEmployeeList {
  data: HrmEmployeeSummary[];
  total: number;
}

export interface CreateHrmEmployeeInput {
  employeeId: string;
  profileId: string;
  employeeCode?: string;
  name: string;
  phone?: string;
  jobTitle?: string;
  employmentType: 'monthly' | 'daily' | 'hourly';
  joinedAt?: string;
  email?: string;
  address?: string;
  ethnicity?: string;
  taxCode?: string;
  insuranceCode?: string;
  bankName?: string;
  bankAccountCiphertext?: string;
  bankAccountLast4?: string;
  departmentId?: string;
  defaultShiftTemplateId?: string;
  customData?: Record<string, unknown>;
}

export interface HrmCustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  groupName: string | null;
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'upload';
  options: string[];
  newTab: boolean;
  required: boolean;
  active: boolean;
  sortOrder: number;
  metadata?: Record<string, unknown>;
  usageCount: number;
}

export interface HrmAttendanceRow {
  id: string | null;
  employeeId: string;
  profileId: string | null;
  employeeCode: string | null;
  employeeName: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  status: string | null;
}

export interface HrmShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  active: boolean;
  usageCount: number;
}


export interface HrmMonthlyAttendanceRow {
  attendanceId: string | null;
  employeeId: string;
  profileId: string | null;
  employeeCode: string | null;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  workDate: string;
  shiftTemplateId: string | null;
  shiftName: string | null;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: string | null;
  note: string | null;
  exceptions?: any;
  errors?: { type: string; minutes?: number; message: string }[];
}

export interface HrmAttendanceUpsertInput {
  attendanceId: string;
  profileId: string;
  auditId: string;
  employeeId: string;
  workDate: string;
  shiftTemplateId: string | null;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: 'present' | 'absent' | 'paid_leave' | 'unpaid_leave' | 'holiday';
  note: string | null;
  source: 'manual' | 'import';
  actorUserId: string;
}


export interface HrmRecurringAllowance {
  label: string;
  amount: number;
  /**
   * If true (default), the allowance is prorated by actual paid days worked.
   * If false, the full amount is always paid regardless of attendance.
   * Default is true when omitted for backward compatibility.
   */
  prorate?: boolean;
}

export interface HrmSalaryConfiguration {
  id: string;
  salaryType: 'monthly' | 'daily' | 'hourly';
  baseAmount: number;
  standardWorkDays: number | null;
  standardWorkHours: number | null;
  overtimeMultiplier: number;
  recurringAllowances: HrmRecurringAllowance[];
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface HrmEmployeeSalarySummary {
  employeeId: string;
  profileId: string | null;
  employeeCode: string | null;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  bankName: string | null;
  bankAccountMasked: string | null;
  configurations: HrmSalaryConfiguration[];
}

export interface CreateHrmSalaryConfigurationInput {
  id: string;
  profileId: string;
  assignmentId?: string;
  auditId: string;
  employeeId: string;
  salaryType: 'monthly' | 'daily' | 'hourly';
  baseAmount: number;
  standardWorkDays: number | null;
  standardWorkHours: number | null;
  overtimeMultiplier: number;
  recurringAllowances: HrmRecurringAllowance[];
  effectiveFrom: string;
  actorUserId: string;
}


export interface HrmSalaryGroup {
  id: string;
  name: string;
  salaryType: 'monthly' | 'daily' | 'hourly';
  baseAmount: number;
  standardWorkDays: number | null;
  standardWorkHours: number | null;
  overtimeMultiplier: number;
  recurringAllowances: HrmRecurringAllowance[];
  isDefault: boolean;
  active: boolean;
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HrmEmployeeSalaryAssignment {
  employeeId: string;
  profileId: string;
  salaryMode: 'custom' | 'group';
  salaryGroupId: string | null;
}

export interface SaveHrmSalaryGroupInput {
  id: string;
  auditId: string;
  name: string;
  salaryType: 'monthly' | 'daily' | 'hourly';
  baseAmount: number;
  standardWorkDays: number | null;
  standardWorkHours: number | null;
  overtimeMultiplier: number;
  recurringAllowances: HrmRecurringAllowance[];
  isDefault: boolean;
  active: boolean;
  actorUserId: string;
}

export interface AssignHrmSalaryPolicyInput {
  id: string;
  profileId: string;
  auditId: string;
  employeeId: string;
  salaryMode: 'custom' | 'group';
  salaryGroupId: string | null;
  actorUserId: string;
}

export type HrmPayrollRunStatus = 'draft' | 'finalized' | 'paid';

export interface HrmPayrollMoneyItem {
  label: string;
  amount: number;
}

export interface HrmPayrollStoredBreakdown {
  calculationInput: {
    salaryType: 'monthly' | 'daily' | 'hourly';
    baseAmount: number;
    standardWorkDays: number | null;
    standardWorkHoursMilli: number | null;
    paidWorkDaysMilli: number;
    workedMinutes: number;
    overtimeMinutes: number;
    overtimeMultiplierBasisPoints: number;
    recurringAllowances: HrmPayrollMoneyItem[];
  };
  adjustments: {
    additionalAllowances: HrmPayrollMoneyItem[];
    bonuses: HrmPayrollMoneyItem[];
    commissions: HrmPayrollMoneyItem[];
    deductions: HrmPayrollMoneyItem[];
  };
  lines: Array<{ code: string; label: string; amount: number }>;
}

export interface HrmPayrollItem {
  id: string;
  profileId: string;
  employeeName: string;
  employeeCode: string | null;
  departmentId: string | null;
  salaryType: 'monthly' | 'daily' | 'hourly';
  baseAmount: number;
  workUnits: number;
  regularPay: number;
  overtimePay: number;
  allowanceTotal: number;
  bonusTotal: number;
  commissionTotal: number;
  deductionTotal: number;
  netPay: number;
  breakdown: HrmPayrollStoredBreakdown;
  manualNote: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface HrmPayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: HrmPayrollRunStatus;
  standardWorkDays: number;
  totalGross: number;
  totalAllowances: number;
  totalDeductions: number;
  totalNet: number;
  version: number;
  calculatedAt: string | null;
  finalizedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HrmPayrollRunDetail extends HrmPayrollRun {
  items: HrmPayrollItem[];
}

export interface SaveHrmPayrollItemInput {
  id: string;
  profileId: string;
  employeeName: string;
  employeeCode: string | null;
  departmentId: string | null;
  salaryType: 'monthly' | 'daily' | 'hourly';
  baseAmount: number;
  workUnits: number;
  regularPay: number;
  overtimePay: number;
  allowanceTotal: number;
  bonusTotal: number;
  commissionTotal: number;
  deductionTotal: number;
  netPay: number;
  breakdown: HrmPayrollStoredBreakdown;
  manualNote: string | null;
}

export interface SaveHrmPayrollRunDraftInput {
  id: string;
  periodStart: string;
  periodEnd: string;
  standardWorkDays: number;
  expectedVersion: number | null;
  actorUserId: string;
  auditId: string;
  items: SaveHrmPayrollItemInput[];
}

export interface UpdateHrmPayrollItemInput {
  runId: string;
  itemId: string;
  expectedVersion: number;
  actorUserId: string;
  auditId: string;
  regularPay: number;
  overtimePay: number;
  allowanceTotal: number;
  bonusTotal: number;
  commissionTotal: number;
  deductionTotal: number;
  netPay: number;
  breakdown: HrmPayrollStoredBreakdown;
  manualNote: string;
}

export class HrmAttendanceStateError extends Error {
  readonly code = 'HRM_ATTENDANCE_INVALID_STATE';

  constructor(message: string) {
    super(message);
    this.name = 'HrmAttendanceStateError';
  }
}

export class HrmDepartmentScopeError extends Error {
  readonly code = 'HRM_DEPARTMENT_NOT_FOUND';

  constructor() {
    super('Phòng ban không tồn tại hoặc không thuộc cửa hàng này.');
    this.name = 'HrmDepartmentScopeError';
  }
}

export class HrmCustomFieldNotFoundError extends Error {
  readonly code = 'HRM_CUSTOM_FIELD_NOT_FOUND';

  constructor() {
    super('Trường tùy chỉnh không tồn tại trong phạm vi cửa hàng này.');
    this.name = 'HrmCustomFieldNotFoundError';
  }
}

export class HrmCustomFieldInUseError extends Error {
  readonly code = 'HRM_CUSTOM_FIELD_IN_USE';

  constructor() {
    super('Trường đang có dữ liệu và chỉ có thể ngừng sử dụng.');
    this.name = 'HrmCustomFieldInUseError';
  }
}

export class HrmShiftNotFoundError extends Error {
  readonly code = 'HRM_SHIFT_NOT_FOUND';

  constructor() {
    super('Ca làm không tồn tại trong cửa hàng này.');
    this.name = 'HrmShiftNotFoundError';
  }
}

export class HrmShiftInUseError extends Error {
  readonly code = 'HRM_SHIFT_IN_USE';

  constructor() {
    super('Ca làm đã được dùng trong bảng công và chỉ có thể ngừng sử dụng.');
    this.name = 'HrmShiftInUseError';
  }
}


export class HrmSalaryConfigConflictError extends Error {
  readonly code = 'HRM_SALARY_CONFIG_CONFLICT';

  constructor() {
    super('Nhân viên đã có cấu hình lương bắt đầu từ ngày này.');
    this.name = 'HrmSalaryConfigConflictError';
  }
}


export class HrmSalaryEmployeeNotFoundError extends Error {
  readonly code = 'HRM_SALARY_EMPLOYEE_NOT_FOUND';

  constructor() {
    super('Không tìm thấy nhân viên trong chi nhánh hiện tại.');
    this.name = 'HrmSalaryEmployeeNotFoundError';
  }
}


export class HrmSalaryGroupNotFoundError extends Error {
  readonly code = 'HRM_SALARY_GROUP_NOT_FOUND';

  constructor() {
    super('Không tìm thấy nhóm lương đang hoạt động trong chi nhánh hiện tại.');
    this.name = 'HrmSalaryGroupNotFoundError';
  }
}

export class HrmPayrollRunNotFoundError extends Error {
  readonly code = 'HRM_PAYROLL_RUN_NOT_FOUND';

  constructor() {
    super('Không tìm thấy kỳ lương trong chi nhánh hiện tại.');
    this.name = 'HrmPayrollRunNotFoundError';
  }
}

export class HrmPayrollRunStateError extends Error {
  readonly code = 'HRM_PAYROLL_INVALID_STATE';

  constructor(message = 'Trạng thái kỳ lương không cho phép thao tác này.') {
    super(message);
    this.name = 'HrmPayrollRunStateError';
  }
}

export class HrmPayrollVersionConflictError extends Error {
  readonly code = 'HRM_PAYROLL_VERSION_CONFLICT';

  constructor() {
    super('Kỳ lương đã được thay đổi. Vui lòng tải lại dữ liệu trước khi tiếp tục.');
    this.name = 'HrmPayrollVersionConflictError';
  }
}

export class HrmPayrollAlreadyPaidError extends Error {
  readonly code = 'HRM_PAYROLL_ALREADY_PAID';

  constructor() {
    super('Kỳ lương đã được thanh toán trước đó.');
    this.name = 'HrmPayrollAlreadyPaidError';
  }
}

export class HrmInsufficientFundBalanceError extends Error {
  readonly code = 'HRM_INSUFFICIENT_FUND_BALANCE';

  constructor(available: number, required: number) {
    super(
      `Số dư quỹ không đủ: hiện có ${available.toLocaleString('vi-VN')}đ, cần ${required.toLocaleString('vi-VN')}đ.`,
    );
    this.name = 'HrmInsufficientFundBalanceError';
  }
}

export class HrmFundNotFoundError extends Error {
  readonly code = 'HRM_FUND_NOT_FOUND';

  constructor() {
    super('Không tìm thấy quỹ thanh toán hoặc quỹ không còn hoạt động.');
    this.name = 'HrmFundNotFoundError';
  }
}

export interface HrmPaymentFund {
  id: string;
  name: string;
  type: string;
  currentBalance: number;
  isDefault: boolean;
}

export interface PayPayrollRunInput {
  runId: string;
  postingId: string;
  fundId: string;
  expectedVersion: number;
  actorUserId: string;
  auditId: string;
  periodLabel: string;
}

export interface PayPayrollRunResult {
  payrollRun: HrmPayrollRunDetail;
  posting: {
    id: string;
    cashbookTransactionId: string;
    fundId: string;
    amount: number;
    postedAt: string;
  };
}

interface HrmOverviewRow {
  employee_count: number | string;
  present_today: number | string;
  draft_payroll_runs: number | string | null;
}

export class PostgresHrmRepository {
  constructor(
    private readonly pool: Pool,
    private readonly scope: HrmRepositoryScope,
  ) {
    if (!scope.tenantId.trim() || !scope.branchId.trim()) {
      throw new Error('HRM repository requires tenant and branch scope.');
    }
  }

  getScope(): Readonly<HrmRepositoryScope> {
    return { ...this.scope };
  }

  async getSettings(): Promise<{ maxUploadSizeMb: number; attendanceRules?: Record<string, unknown> }> {
    const result = await this.pool.query(
      `
        select max_upload_size_mb, attendance_rules
        from hrm_settings
        where tenant_id = $1 and branch_id = $2
        limit 1
      `,
      [this.scope.tenantId, this.scope.branchId]
    );
    if (result.rowCount === 0) {
      return { maxUploadSizeMb: 10 };
    }
    return { 
      maxUploadSizeMb: result.rows[0].max_upload_size_mb,
      attendanceRules: result.rows[0].attendance_rules
    };
  }

  async updateSettings(input: { maxUploadSizeMb?: number; attendanceRules?: Record<string, unknown> }): Promise<void> {
    await this.pool.query(
      `
        insert into hrm_settings (tenant_id, branch_id, max_upload_size_mb, attendance_rules, created_at, updated_at)
        values ($1, $2, coalesce($3, 10), coalesce($4::jsonb, '{}'::jsonb), now(), now())
        on conflict (tenant_id, branch_id) do update set
          max_upload_size_mb = coalesce(excluded.max_upload_size_mb, hrm_settings.max_upload_size_mb),
          attendance_rules = coalesce(excluded.attendance_rules, hrm_settings.attendance_rules),
          updated_at = now()
      `,
      [
        this.scope.tenantId, 
        this.scope.branchId, 
        input.maxUploadSizeMb ?? null,
        input.attendanceRules ? JSON.stringify(input.attendanceRules) : null
      ]
    );
  }

  /**
   * Generate a human-readable cashbook transaction ID in the format:
   *   CB-{TENANT_HASH_8}-{SEQUENCE_5}
   * e.g. CB-E007393D-00042
   *
   * TENANT_HASH_8: first 8 hex chars of SHA-256(tenantId), uppercased.
   * SEQUENCE_5:    count of existing cashbook rows for this tenant+branch + 1,
   *                zero-padded to 5 digits (up to 99999 before overflow).
   *
   * Must be called inside the same transaction that inserts the cashbook row
   * to avoid race conditions — caller should pass the PoolClient.
   */
  private async generateCashbookId(client: PoolClient): Promise<string> {
    const tenantHash = createHash('sha256')
      .update(this.scope.tenantId)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

    const countResult = await client.query<{ n: string }>(
      `select count(*)::text as n from cashbook where tenant_id = $1 and branch_id = $2`,
      [this.scope.tenantId, this.scope.branchId],
    );
    const sequence = Number(countResult.rows[0]?.n ?? '0') + 1;
    const seq = String(sequence).padStart(5, '0');
    return `CB-${tenantHash}-${seq}`;
  }

  async listEmployees(input: {
    search?: string;
    limit?: number;
  } = {}): Promise<HrmEmployeeList> {
    const search = input.search?.trim() ?? '';
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const result = await this.pool.query<{
      id: string;
      employee_code: string | null;
      name: string | null;
      phone: string | null;
      job_title: string | null;
      employment_status: string | null;
      employment_type: string | null;
      joined_at: string | null;
      profile_id: string | null;
      auth_user_id: string | null;
      email: string | null;
      address: string | null;
      ethnicity: string | null;
      tax_code: string | null;
      insurance_code: string | null;
      bank_name: string | null;
      bank_account_ciphertext: string | null;
      department_id: string | null;
      department_name: string | null;
      default_shift_template_id: string | null;
      custom_data: Record<string, unknown> | null;
      total_count: number | string;
    }>(
      `
        select
          e.id,
          e.employee_code,
          coalesce(e.name, '') as name,
          e.phone,
          p.id as profile_id,
          p.auth_user_id,
          p.job_title,
          coalesce(p.employment_status, 'active') as employment_status,
          coalesce(p.employment_type, 'monthly') as employment_type,
          coalesce(p.joined_at::text, nullif(e.hire_date, '')) as joined_at,
          p.email,
          p.address,
          p.ethnicity,
          p.tax_code,
          p.insurance_code,
          p.bank_name,
          p.bank_account_ciphertext,
          p.department_id,
          d.name as department_name,
          coalesce(p.custom_data, '{}'::jsonb) as custom_data,
          p.default_shift_template_id,
          count(*) over()::integer as total_count
        from employees e
        left join hrm_employee_profiles p
          on p.tenant_id = e.tenant_id
          and p.source_employee_id = e.id
        left join departments d
          on d.id = p.department_id
          and d.tenant_id = e.tenant_id
          and d.branch_id = e.branch_id
        where e.tenant_id = $1
          and e.branch_id = $2
          and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
          and (
            $3 = ''
            or e.name ilike '%' || $3 || '%'
            or e.employee_code ilike '%' || $3 || '%'
            or e.phone ilike '%' || $3 || '%'
          )
        order by e.created_at desc nulls last, e.name asc
        limit $4
      `,
      [this.scope.tenantId, this.scope.branchId, search, limit],
    );

    return {
      data: result.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        authUserId: row.auth_user_id,
        employeeCode: row.employee_code,
        name: row.name ?? '',
        phone: row.phone,
        jobTitle: row.job_title,
        employmentStatus: row.employment_status ?? 'active',
        employmentType: row.employment_type ?? 'monthly',
        joinedAt: row.joined_at,
        email: row.email,
        address: row.address,
        ethnicity: row.ethnicity,
        taxCode: row.tax_code,
        insuranceCode: row.insurance_code,
        bankName: row.bank_name,
        bankAccount: row.bank_account_ciphertext,
        departmentId: row.department_id,
        departmentName: row.department_name,
        defaultShiftTemplateId: row.default_shift_template_id,
        customData: row.custom_data ?? {},
      })),
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }

  async createEmployee(input: CreateHrmEmployeeInput): Promise<{
    employeeId: string;
    profileId: string;
  }> {
    return this.withTransaction(async (client, scope) => {
      if (input.departmentId) {
        const department = await client.query(
          `
            select id
            from departments
            where id = $1 and tenant_id = $2 and branch_id = $3
              and coalesce(active, 'TRUE') not in ('FALSE', 'false', '0')
            limit 1
          `,
          [input.departmentId, scope.tenantId, scope.branchId],
        );
        if (department.rowCount !== 1) throw new HrmDepartmentScopeError();
      }

      await client.query(
        `
          insert into employees (
            id, tenant_id, branch_id, employee_code, name, phone, role,
            hire_date, commission_pct, active, created_at, updated_at
          )
          values (
            $1, $2, $3, nullif($4, ''), $5, nullif($6, ''),
            nullif($7, ''), nullif($8, ''), '0', 'TRUE', now(), now()
          )
        `,
        [
          input.employeeId,
          scope.tenantId,
          scope.branchId,
          input.employeeCode ?? '',
          input.name,
          input.phone ?? '',
          input.jobTitle ?? '',
          input.joinedAt ?? '',
        ],
      );

      await client.query(
        `
          insert into hrm_employee_profiles (
            id, tenant_id, branch_id, source_employee_id, department_id, job_title,
            employment_status, employment_type, joined_at, email, address,
            ethnicity, tax_code, insurance_code, bank_name, bank_account_ciphertext, bank_account_last4,
            default_shift_template_id, custom_data, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, nullif($5, ''), nullif($6, ''), 'active', $7,
            nullif($8, '')::date, nullif($9, ''), nullif($10, ''),
            nullif($11, ''), nullif($12, ''), nullif($13, ''), nullif($14, ''), nullif($15, ''), nullif($16, ''),
            nullif($17, ''), coalesce($18::jsonb, '{}'::jsonb), now(), now()
          )
        `,
        [
          input.profileId,
          scope.tenantId,
          scope.branchId,
          input.employeeId,
          input.departmentId ?? '',
          input.jobTitle ?? '',
          input.employmentType,
          input.joinedAt ?? '',
          input.email ?? '',
          input.address ?? '',
          input.ethnicity ?? '',
          input.taxCode ?? '',
          input.insuranceCode ?? '',
          input.bankName ?? '',
          input.bankAccountCiphertext ?? '',
          input.bankAccountLast4 ?? '',
          input.defaultShiftTemplateId ?? '',
          JSON.stringify(input.customData ?? {}),
        ],
      );

      return {
        employeeId: input.employeeId,
        profileId: input.profileId,
      };
    });
  }

  async updateEmployeeProfile(input: {
    employeeId: string;
    profileId: string;
    authUserId?: string | null;
    employeeCode?: string;
    name: string;
    phone?: string;
    jobTitle?: string;
    employmentStatus: 'active' | 'probation' | 'inactive';
    employmentType: 'monthly' | 'daily' | 'hourly';
    joinedAt?: string;
    email?: string;
    address?: string;
    ethnicity?: string;
    taxCode?: string;
    insuranceCode?: string;
    bankName?: string;
    bankAccountCiphertext?: string;
    bankAccountLast4?: string;
    departmentId?: string;
    defaultShiftTemplateId?: string;
    customData: Record<string, unknown>;
  }): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      if (input.departmentId) {
        const department = await client.query(
          `
            select id
            from departments
            where id = $1 and tenant_id = $2 and branch_id = $3
              and coalesce(active, 'TRUE') not in ('FALSE', 'false', '0')
            limit 1
          `,
          [input.departmentId, scope.tenantId, scope.branchId],
        );
        if (department.rowCount !== 1) throw new HrmDepartmentScopeError();
      }

      const employeeResult = await client.query(
        `
          update employees
          set employee_code = nullif($4, ''), name = $5, phone = nullif($6, ''),
              role = nullif($7, ''), hire_date = nullif($8, ''),
              active = case when $9 = 'inactive' then 'FALSE' else 'TRUE' end,
              updated_at = now()
          where id = $1 and tenant_id = $2 and branch_id = $3
          returning id
        `,
        [
          input.employeeId,
          scope.tenantId,
          scope.branchId,
          input.employeeCode ?? '',
          input.name,
          input.phone ?? '',
          input.jobTitle ?? '',
          input.joinedAt ?? '',
          input.employmentStatus,
        ],
      );
      if (employeeResult.rowCount !== 1) {
        throw new Error('HRM employee not found.');
      }

      await client.query(
        `
          insert into hrm_employee_profiles (
            id, tenant_id, branch_id, source_employee_id, auth_user_id, department_id,
            job_title, employment_status, employment_type, joined_at,
            email, address, ethnicity, tax_code, insurance_code,
            bank_name, bank_account_ciphertext, bank_account_last4,
            default_shift_template_id, custom_data, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, $5::uuid, nullif($6, ''), nullif($7, ''), $8, $9,
            nullif($10, '')::date, nullif($11, ''), nullif($12, ''),
            nullif($15, ''), nullif($16, ''), nullif($17, ''),
            nullif($18, ''), nullif($19, ''), nullif($20, ''),
            nullif($13, ''), $14::jsonb, now(), now()
          )
          on conflict (tenant_id, source_employee_id) do update set
            auth_user_id = excluded.auth_user_id,
            department_id = excluded.department_id,
            job_title = excluded.job_title,
            employment_status = excluded.employment_status,
            employment_type = excluded.employment_type,
            joined_at = excluded.joined_at,
            email = excluded.email,
            address = excluded.address,
            ethnicity = excluded.ethnicity,
            tax_code = excluded.tax_code,
            insurance_code = excluded.insurance_code,
            bank_name = excluded.bank_name,
            bank_account_ciphertext = excluded.bank_account_ciphertext,
            bank_account_last4 = excluded.bank_account_last4,
            default_shift_template_id = excluded.default_shift_template_id,
            custom_data = excluded.custom_data,
            updated_at = now()
        `,
        [
          input.profileId,
          scope.tenantId,
          scope.branchId,
          input.employeeId,
          input.authUserId ?? null,
          input.departmentId ?? '',
          input.jobTitle ?? '',
          input.employmentStatus,
          input.employmentType,
          input.joinedAt ?? '',
          input.email ?? '',
          input.address ?? '',
          input.defaultShiftTemplateId ?? '',
          JSON.stringify(input.customData),
          input.ethnicity ?? '',
          input.taxCode ?? '',
          input.insuranceCode ?? '',
          input.bankName ?? '',
          input.bankAccountCiphertext ?? '',
          input.bankAccountLast4 ?? '',
        ],
      );
    });
  }

  async listCustomFields(
    options: { includeInactive?: boolean } = {},
  ): Promise<HrmCustomFieldDefinition[]> {
    const result = await this.pool.query<{
      id: string;
      key: string;
      label: string;
      group_name: string | null;
      field_type: HrmCustomFieldDefinition['fieldType'];
      options: string[] | null;
      new_tab: number;
      required: number;
      active: number;
      sort_order: number;
      metadata: Record<string, unknown> | null;
      usage_count: number | string;
    }>(
      `
        select
          d.id, d.key, d.label, d.group_name, d.field_type, d.options,
          d.new_tab, d.required, d.active, d.sort_order, d.metadata,
          (
            select count(*)::integer
            from hrm_employee_profiles p
            where p.tenant_id = d.tenant_id
              and (d.branch_id is null or p.branch_id = d.branch_id)
              and p.custom_data ? d.key
          ) as usage_count
        from hrm_custom_field_definitions d
        where d.tenant_id = $1
          and ($3::boolean or d.active = 1)
          and (d.branch_id is null or d.branch_id = $2)
        order by d.active desc, d.sort_order asc, d.label asc
      `,
      [
        this.scope.tenantId,
        this.scope.branchId,
        options.includeInactive === true,
      ],
    );
    return result.rows.map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      groupName: row.group_name,
      fieldType: row.field_type,
      options: Array.isArray(row.options) ? row.options : [],
      newTab: row.new_tab === 1,
      required: row.required === 1,
      active: row.active === 1,
      sortOrder: row.sort_order,
      metadata: row.metadata ?? {},
      usageCount: Number(row.usage_count ?? 0),
    }));
  }

  async getEmployeeCustomData(
    employeeId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.pool.query<{
      custom_data: Record<string, unknown> | null;
    }>(
      `
        select p.custom_data
        from employees e
        left join hrm_employee_profiles p
          on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
        where e.id = $1 and e.tenant_id = $2 and e.branch_id = $3
        limit 1
      `,
      [employeeId, this.scope.tenantId, this.scope.branchId],
    );
    return result.rows[0]?.custom_data ?? {};
  }

  async createCustomField(input: {
    id: string;
    key: string;
    label: string;
    groupName?: string | null;
    fieldType: HrmCustomFieldDefinition['fieldType'];
    options: string[];
    newTab?: boolean;
    required: boolean;
    tenantWide: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
        insert into hrm_custom_field_definitions (
          id, tenant_id, branch_id, key, label, group_name, field_type, options,
          new_tab, required, active, sort_order, metadata, created_at, updated_at
        )
        values (
          $1, $2::varchar, $3::varchar, $4, $5, nullif($6, ''), $7, $8::jsonb,
          $9, $10, 1,
          coalesce((
            select max(sort_order) + 1
            from hrm_custom_field_definitions
            where tenant_id = $2::varchar
          ), 0),
          $11::jsonb,
          now(), now()
        )
      `,
      [
        input.id,
        this.scope.tenantId,
        input.tenantWide ? null : this.scope.branchId,
        input.key,
        input.label,
        input.groupName ?? '',
        input.fieldType,
        JSON.stringify(input.options),
        input.newTab ? 1 : 0,
        input.required ? 1 : 0,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async updateCustomField(input: {
    id: string;
    label: string;
    groupName?: string | null;
    options: string[];
    newTab?: boolean;
    required: boolean;
    active: boolean;
    sortOrder?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const result = await this.pool.query(
      `
        update hrm_custom_field_definitions
        set label = $4,
            group_name = nullif($5, ''),
            options = $6::jsonb,
            new_tab = $7,
            required = $8,
            active = $9,
            sort_order = coalesce($10, sort_order),
            metadata = coalesce($11::jsonb, metadata),
            updated_at = now()
        where id = $1
          and tenant_id = $2
          and (branch_id is null or branch_id = $3)
        returning id
      `,
      [
        input.id,
        this.scope.tenantId,
        this.scope.branchId,
        input.label,
        input.groupName ?? '',
        JSON.stringify(input.options),
        input.newTab ? 1 : 0,
        input.required ? 1 : 0,
        input.active ? 1 : 0,
        input.sortOrder ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    if (result.rowCount !== 1) throw new HrmCustomFieldNotFoundError();
  }

  async deleteUnusedCustomField(fieldId: string): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const field = await client.query<{
        key: string;
        branch_id: string | null;
        usage_count: number | string;
      }>(
        `
          select
            d.key,
            d.branch_id,
            (
              select count(*)::integer
              from hrm_employee_profiles p
              where p.tenant_id = d.tenant_id
                and (d.branch_id is null or p.branch_id = d.branch_id)
                and p.custom_data ? d.key
            ) as usage_count
          from hrm_custom_field_definitions d
          where d.id = $1
            and d.tenant_id = $2
            and (d.branch_id is null or d.branch_id = $3)
          limit 1
          for update of d
        `,
        [fieldId, scope.tenantId, scope.branchId],
      );
      const definition = field.rows[0];
      if (!definition) throw new HrmCustomFieldNotFoundError();
      if (Number(definition.usage_count) > 0) {
        throw new HrmCustomFieldInUseError();
      }

      await client.query(
        `
          delete from hrm_custom_field_definitions
          where id = $1 and tenant_id = $2
        `,
        [fieldId, scope.tenantId],
      );
    });
  }

  async getEmployeeIdForAuthUser(authUserId: string): Promise<string | null> {
    const result = await this.pool.query<{ source_employee_id: string }>(
      `
        select source_employee_id
        from hrm_employee_profiles
        where tenant_id = $1 and branch_id = $2 and auth_user_id = $3
        limit 1
      `,
      [this.scope.tenantId, this.scope.branchId, authUserId],
    );
    return result.rows[0]?.source_employee_id ?? null;
  }

  async listShiftTemplates(
    options: { includeInactive?: boolean } = {},
  ): Promise<HrmShiftTemplate[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      late_grace_minutes: number;
      active: number;
      usage_count: number | string;
    }>(
      `
        select
          s.id, s.name, s.start_time::text, s.end_time::text,
          s.break_minutes, s.late_grace_minutes, s.active,
          (
            select count(*)::integer
            from hrm_attendance_days a
            where a.tenant_id = s.tenant_id
              and a.branch_id = s.branch_id
              and a.shift_template_id = s.id
          ) as usage_count
        from hrm_shift_templates s
        where s.tenant_id = $1 and s.branch_id = $2
          and ($3::boolean or s.active = 1)
        order by s.active desc, s.start_time asc, s.name asc
      `,
      [
        this.scope.tenantId,
        this.scope.branchId,
        options.includeInactive === true,
      ],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      breakMinutes: row.break_minutes,
      lateGraceMinutes: row.late_grace_minutes,
      active: row.active === 1,
      usageCount: Number(row.usage_count ?? 0),
    }));
  }

  async createShiftTemplate(input: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    lateGraceMinutes: number;
  }): Promise<void> {
    await this.pool.query(
      `
        insert into hrm_shift_templates (
          id, tenant_id, branch_id, name, start_time, end_time,
          break_minutes, late_grace_minutes, active, created_at, updated_at
        )
        values (
          $1, $2::varchar, $3::varchar, $4, $5::time, $6::time,
          $7, $8, 1, now(), now()
        )
      `,
      [
        input.id,
        this.scope.tenantId,
        this.scope.branchId,
        input.name,
        input.startTime,
        input.endTime,
        input.breakMinutes,
        input.lateGraceMinutes,
      ],
    );
  }

  async updateShiftTemplate(input: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    lateGraceMinutes: number;
    active: boolean;
  }): Promise<void> {
    const result = await this.pool.query(
      `
        update hrm_shift_templates
        set name = $4,
            start_time = $5::time,
            end_time = $6::time,
            break_minutes = $7,
            late_grace_minutes = $8,
            active = $9,
            updated_at = now()
        where id = $1 and tenant_id = $2 and branch_id = $3
        returning id
      `,
      [
        input.id,
        this.scope.tenantId,
        this.scope.branchId,
        input.name,
        input.startTime,
        input.endTime,
        input.breakMinutes,
        input.lateGraceMinutes,
        input.active ? 1 : 0,
      ],
    );
    if (result.rowCount !== 1) throw new HrmShiftNotFoundError();
  }

  async deleteUnusedShiftTemplate(shiftId: string): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const shift = await client.query<{
        usage_count: number | string;
      }>(
        `
          select (
            select count(*)::integer
            from hrm_attendance_days a
            where a.tenant_id = s.tenant_id
              and a.branch_id = s.branch_id
              and a.shift_template_id = s.id
          ) as usage_count
          from hrm_shift_templates s
          where s.id = $1 and s.tenant_id = $2 and s.branch_id = $3
          limit 1
          for update of s
        `,
        [shiftId, scope.tenantId, scope.branchId],
      );
      const template = shift.rows[0];
      if (!template) throw new HrmShiftNotFoundError();
      if (Number(template.usage_count) > 0) throw new HrmShiftInUseError();

      await client.query(
        `
          delete from hrm_shift_templates
          where id = $1 and tenant_id = $2 and branch_id = $3
        `,
        [shiftId, scope.tenantId, scope.branchId],
      );
    });
  }

  async listTodayAttendance(): Promise<HrmAttendanceRow[]> {
    const result = await this.pool.query<{
      attendance_id: string | null;
      employee_id: string;
      profile_id: string | null;
      employee_code: string | null;
      employee_name: string | null;
      clock_in: Date | string | null;
      clock_out: Date | string | null;
      worked_minutes: number | string | null;
      status: string | null;
    }>(
      `
        select
          a.id as attendance_id, e.id as employee_id, p.id as profile_id,
          e.employee_code, coalesce(e.name, '') as employee_name,
          a.clock_in, a.clock_out, a.worked_minutes, a.status
        from employees e
        left join hrm_employee_profiles p
          on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
        left join hrm_attendance_days a
          on a.tenant_id = e.tenant_id
          and a.profile_id = p.id
          and a.work_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
        where e.tenant_id = $1 and e.branch_id = $2
          and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
        order by e.name asc
      `,
      [this.scope.tenantId, this.scope.branchId],
    );
    return result.rows.map((row) => ({
      id: row.attendance_id,
      employeeId: row.employee_id,
      profileId: row.profile_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name ?? '',
      clockIn: row.clock_in ? new Date(row.clock_in).toISOString() : null,
      clockOut: row.clock_out ? new Date(row.clock_out).toISOString() : null,
      workedMinutes: Number(row.worked_minutes ?? 0),
      status: row.status,
    }));
  }


  async listMonthlyAttendance(input: {
    periodStart: string;
    periodEnd: string;
    departmentId?: string | null;
  }): Promise<HrmMonthlyAttendanceRow[]> {
    const result = await this.pool.query<{
      attendance_id: string | null;
      employee_id: string;
      profile_id: string | null;
      employee_code: string | null;
      employee_name: string | null;
      department_id: string | null;
      department_name: string | null;
      work_date: string;
      shift_template_id: string | null;
      shift_name: string | null;
      shift_start_time: string | null;
      shift_end_time: string | null;
      shift_late_grace_minutes: number | null;
      shift_template_id_2: string | null;
      shift_name_2: string | null;
      clock_in: Date | string | null;
      clock_out: Date | string | null;
      clock_in_2: Date | string | null;
      clock_out_2: Date | string | null;
      worked_minutes: number | string | null;
      late_minutes: number | string | null;
      early_leave_minutes: number | string | null;
      overtime_minutes: number | string | null;
      status: string | null;
      note: string | null;
      exceptions: any;
      attendance_rules: any;
    }>(
      `
        with calendar as (
          select generate_series($3::date, $4::date, interval '1 day')::date as work_date
        )
        select
          a.id as attendance_id,
          e.id as employee_id,
          p.id as profile_id,
          e.employee_code,
          coalesce(e.name, '') as employee_name,
          coalesce(a.department_id_snapshot, p.department_id) as department_id,
          d.name as department_name,
          c.work_date::text,
          coalesce(a.shift_template_id, p.default_shift_template_id) as shift_template_id,
          s.name as shift_name,
          s.start_time::text as shift_start_time,
          s.end_time::text as shift_end_time,
          s.late_grace_minutes as shift_late_grace_minutes,
          a.shift_template_id_2,
          s2.name as shift_name_2,
          a.clock_in,
          a.clock_out,
          a.clock_in_2,
          a.clock_out_2,
          a.worked_minutes,
          a.late_minutes,
          a.early_leave_minutes,
          a.overtime_minutes,
          a.status,
          a.note,
          a.exceptions,
          hs.attendance_rules
        from employees e
        left join hrm_settings hs on hs.tenant_id = e.tenant_id and hs.branch_id = e.branch_id
        left join hrm_employee_profiles p
          on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
        cross join calendar c
        left join hrm_attendance_days a
          on a.tenant_id = e.tenant_id
          and a.branch_id = e.branch_id
          and a.profile_id = p.id
          and a.work_date = c.work_date
        left join departments d
          on d.id = coalesce(a.department_id_snapshot, p.department_id)
          and d.tenant_id = e.tenant_id
          and d.branch_id = e.branch_id
        left join hrm_shift_templates s
          on s.id = coalesce(a.shift_template_id, p.default_shift_template_id)
          and s.tenant_id = e.tenant_id
          and s.branch_id = e.branch_id
        left join hrm_shift_templates s2
          on s2.id = a.shift_template_id_2
          and s2.tenant_id = e.tenant_id
          and s2.branch_id = e.branch_id
        where e.tenant_id = $1 and e.branch_id = $2
          and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
          and ($5::varchar is null or coalesce(a.department_id_snapshot, p.department_id) = $5)
          and c.work_date >= coalesce(p.joined_at, '1900-01-01'::date)
        order by e.name asc, c.work_date asc
      `,
      [
        this.scope.tenantId,
        this.scope.branchId,
        input.periodStart,
        input.periodEnd,
        input.departmentId ?? null,
      ],
    );

    const now = new Date();

    return result.rows.map((row) => {
      let calculatedStatus = row.status;
      const errors: { type: string; minutes?: number; message: string }[] = [];
      const rules = row.attendance_rules || {};
      const autoAbsentMinutes = rules.auto_absent_minutes ?? 120;
      const lateThreshold = rules.late_threshold_for_half_day_minutes ?? 60;
      const earlyThreshold = rules.early_leave_threshold_for_half_day_minutes ?? 60;

      // 1. Auto-absent calculation
      if (!calculatedStatus && row.shift_start_time && !row.clock_in) {
        const shiftStartDateTime = new Date(`${row.work_date}T${row.shift_start_time}+07:00`);
        if (now.getTime() > shiftStartDateTime.getTime() + autoAbsentMinutes * 60000) {
          calculatedStatus = 'absent';
          errors.push({ type: 'AUTO_ABSENT', message: `Quá ${autoAbsentMinutes} phút chưa check-in` });
        }
      }

      // 2. Late calculation
      if (row.clock_in && row.shift_start_time) {
        const shiftStartDateTime = new Date(`${row.work_date}T${row.shift_start_time}+07:00`);
        const clockInTime = new Date(row.clock_in);
        const graceMs = (Number(row.shift_late_grace_minutes) || 0) * 60000;
        const diffMs = clockInTime.getTime() - shiftStartDateTime.getTime();
        
        if (diffMs > graceMs) {
          const lateMins = Math.floor(diffMs / 60000);
          errors.push({ 
            type: lateMins > lateThreshold ? 'LATE_CRITICAL' : 'LATE', 
            minutes: lateMins, 
            message: `Đi muộn ${lateMins} phút` 
          });
        }
      }

      // 3. Early leave calculation
      if (row.clock_out && row.shift_end_time) {
        const shiftEndDateTime = new Date(`${row.work_date}T${row.shift_end_time}+07:00`);
        const clockOutTime = new Date(row.clock_out);
        // If they end shift on the next day, shiftEndDateTime needs +1 day. 
        // For simplicity, assuming same day shifts.
        const diffMs = shiftEndDateTime.getTime() - clockOutTime.getTime();
        
        if (diffMs > 0) {
          const earlyMins = Math.floor(diffMs / 60000);
          errors.push({ 
            type: earlyMins > earlyThreshold ? 'EARLY_CRITICAL' : 'EARLY', 
            minutes: earlyMins, 
            message: `Về sớm ${earlyMins} phút` 
          });
        }
      }

      // 4. Missing clock_out if time passed
      if (row.clock_in && !row.clock_out && row.shift_end_time) {
        const shiftEndDateTime = new Date(`${row.work_date}T${row.shift_end_time}+07:00`);
        if (now.getTime() > shiftEndDateTime.getTime() + 120 * 60000) { // 2 hours after shift ends
          errors.push({ type: 'MISSING_OUT', message: `Quên check-out` });
        }
      }

      return {
        attendanceId: row.attendance_id,
        employeeId: row.employee_id,
        profileId: row.profile_id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name ?? '',
        departmentId: row.department_id,
        departmentName: row.department_name,
        workDate: row.work_date,
        shiftTemplateId: row.shift_template_id,
        shiftName: row.shift_name,
        shiftTemplateId2: row.shift_template_id_2,
        shiftName2: row.shift_name_2,
        clockIn: row.clock_in ? new Date(row.clock_in).toISOString() : null,
        clockOut: row.clock_out ? new Date(row.clock_out).toISOString() : null,
        clockIn2: row.clock_in_2 ? new Date(row.clock_in_2).toISOString() : null,
        clockOut2: row.clock_out_2 ? new Date(row.clock_out_2).toISOString() : null,
        workedMinutes: Number(row.worked_minutes ?? 0),
        lateMinutes: Number(row.late_minutes ?? 0),
        earlyLeaveMinutes: Number(row.early_leave_minutes ?? 0),
        overtimeMinutes: Number(row.overtime_minutes ?? 0),
        status: calculatedStatus,
        note: row.note,
        exceptions: row.exceptions,
        errors,
      };
    });
  }


  async listScopedAttendanceEmployeeIds(employeeIds: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(employeeIds)];
    if (uniqueIds.length === 0) return [];
    const result = await this.pool.query<{ id: string }>(
      `
        select id
        from employees
        where tenant_id = $1 and branch_id = $2
          and id = any($3::varchar[])
          and coalesce(active, 'TRUE') not in ('FALSE', 'false', '0')
      `,
      [this.scope.tenantId, this.scope.branchId, uniqueIds],
    );
    return result.rows.map((row) => row.id);
  }

  async upsertAttendanceDays(inputs: HrmAttendanceUpsertInput[]): Promise<void> {
    if (inputs.length === 0) return;
    await this.withTransaction(async (client, scope) => {
      for (const input of inputs) {
        const employee = await client.query<{
          profile_id: string | null;
          department_id: string | null;
        }>(
          `
            select p.id as profile_id, p.department_id
            from employees e
            left join hrm_employee_profiles p
              on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
            where e.id = $1 and e.tenant_id = $2 and e.branch_id = $3
              and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
            limit 1
            for update of e
          `,
          [input.employeeId, scope.tenantId, scope.branchId],
        );
        const scopedEmployee = employee.rows[0];
        if (!scopedEmployee) throw new Error('HRM employee not found in branch.');

        if (!scopedEmployee.profile_id) {
          await client.query(
            `
              insert into hrm_employee_profiles (
                id, tenant_id, branch_id, source_employee_id,
                employment_status, employment_type, custom_data,
                created_at, updated_at
              )
              values ($1, $2, $3, $4, 'active', 'monthly', '{}'::jsonb, now(), now())
              on conflict (tenant_id, source_employee_id) do nothing
            `,
            [input.profileId, scope.tenantId, scope.branchId, input.employeeId],
          );
        }
        const profile = await client.query<{ id: string; department_id: string | null }>(
          `
            select id, department_id
            from hrm_employee_profiles
            where tenant_id = $1 and source_employee_id = $2 and branch_id = $3
            limit 1
          `,
          [scope.tenantId, input.employeeId, scope.branchId],
        );
        const resolvedProfile = profile.rows[0];
        if (!resolvedProfile) throw new Error('HRM profile not found in branch.');

        if (input.shiftTemplateId) {
          const shift = await client.query(
            `
              select id from hrm_shift_templates
              where id = $1 and tenant_id = $2 and branch_id = $3
              limit 1
            `,
            [input.shiftTemplateId, scope.tenantId, scope.branchId],
          );
          if (shift.rowCount !== 1) throw new HrmShiftNotFoundError();
        }

        const previous = await client.query<{
          id: string;
          status: string;
          clock_in: Date | string | null;
          clock_out: Date | string | null;
        }>(
          `
            select id, status, clock_in, clock_out
            from hrm_attendance_days
            where tenant_id = $1 and branch_id = $2
              and profile_id = $3 and work_date = $4::date
            limit 1
            for update
          `,
          [scope.tenantId, scope.branchId, resolvedProfile.id, input.workDate],
        );
        const existing = previous.rows[0] ?? null;
        const saved = await client.query<{ id: string }>(
          `
            insert into hrm_attendance_days (
              id, tenant_id, branch_id, profile_id, department_id_snapshot,
              work_date, shift_template_id, clock_in, clock_out,
              worked_minutes, late_minutes, early_leave_minutes, overtime_minutes,
              status, source, note, updated_by, created_at, updated_at
            )
            values (
              $1, $2, $3, $4, $5,
              $6::date, $7, $8::timestamptz, $9::timestamptz,
              $10, $11, $12, $13,
              $14, $15, $16, $17, now(), now()
            )
            on conflict (tenant_id, profile_id, work_date) do update set
              branch_id = excluded.branch_id,
              department_id_snapshot = excluded.department_id_snapshot,
              shift_template_id = excluded.shift_template_id,
              clock_in = excluded.clock_in,
              clock_out = excluded.clock_out,
              worked_minutes = excluded.worked_minutes,
              late_minutes = excluded.late_minutes,
              early_leave_minutes = excluded.early_leave_minutes,
              overtime_minutes = excluded.overtime_minutes,
              status = excluded.status,
              source = excluded.source,
              note = excluded.note,
              updated_by = excluded.updated_by,
              updated_at = now()
            returning id
          `,
          [
            existing?.id ?? input.attendanceId,
            scope.tenantId,
            scope.branchId,
            resolvedProfile.id,
            resolvedProfile.department_id,
            input.workDate,
            input.shiftTemplateId,
            input.clockIn,
            input.clockOut,
            input.workedMinutes,
            input.lateMinutes,
            input.earlyLeaveMinutes,
            input.overtimeMinutes,
            input.status,
            input.source,
            input.note,
            input.actorUserId,
          ],
        );
        const attendanceId = saved.rows[0]?.id;
        if (!attendanceId) throw new Error('HRM attendance was not saved.');

        await client.query(
          `
            insert into hrm_audit_logs (
              id, tenant_id, branch_id, actor_user_id,
              event_type, entity_type, entity_id, summary, created_at
            )
            values ($1, $2, $3, $4, $5, 'attendance_day', $6, $7::jsonb, now())
          `,
          [
            input.auditId,
            scope.tenantId,
            scope.branchId,
            input.actorUserId,
            existing ? 'attendance.updated' : 'attendance.created',
            attendanceId,
            JSON.stringify({
              workDate: input.workDate,
              employeeId: input.employeeId,
              before: existing
                ? {
                    status: existing.status,
                    clockIn: existing.clock_in,
                    clockOut: existing.clock_out,
                  }
                : null,
              after: {
                status: input.status,
                clockIn: input.clockIn,
                clockOut: input.clockOut,
                shiftTemplateId: input.shiftTemplateId,
                source: input.source,
              },
            }),
          ],
        );
      }
    });
  }

  async clockIn(input: {
    attendanceId: string;
    profileId: string;
    employeeId: string;
    actorUserId: string;
    source: 'manual' | 'self';
    customTime?: string;
  }): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const employee = await client.query<{ department_id: string | null }>(
        `
          select p.department_id
          from employees e
          left join hrm_employee_profiles p
            on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
          where e.id = $1 and e.tenant_id = $2 and e.branch_id = $3
          for update of e
        `,
        [input.employeeId, scope.tenantId, scope.branchId],
      );
      if (employee.rowCount !== 1) throw new Error('HRM employee not found.');

      await client.query(
        `
          insert into hrm_employee_profiles (
            id, tenant_id, branch_id, source_employee_id,
            employment_status, employment_type, custom_data,
            created_at, updated_at
          )
          values ($1, $2, $3, $4, 'active', 'monthly', '{}'::jsonb, now(), now())
          on conflict (tenant_id, source_employee_id) do nothing
        `,
        [input.profileId, scope.tenantId, scope.branchId, input.employeeId],
      );
      const profile = await client.query<{ id: string; department_id: string | null }>(
        `
          select id, department_id
          from hrm_employee_profiles
          where tenant_id = $1 and source_employee_id = $2
          limit 1
        `,
        [scope.tenantId, input.employeeId],
      );
      const resolvedProfile = profile.rows[0];
      if (!resolvedProfile) throw new Error('HRM profile not found.');

      const inserted = await client.query(
        `
          insert into hrm_attendance_days (
            id, tenant_id, branch_id, profile_id, department_id_snapshot,
            work_date, clock_in, worked_minutes, late_minutes,
            early_leave_minutes, overtime_minutes, status, source,
            updated_by, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, $5,
            (coalesce($8::timestamp, now()) at time zone 'Asia/Ho_Chi_Minh')::date,
            coalesce($8::timestamp, now()), 0, 0, 0, 0, 'present', $6, $7, now(), now()
          )
          on conflict (tenant_id, profile_id, work_date) do nothing
          returning id
        `,
        [
          input.attendanceId,
          scope.tenantId,
          scope.branchId,
          resolvedProfile.id,
          resolvedProfile.department_id,
          input.source,
          input.actorUserId,
          input.customTime ?? null
        ],
      );
      if (inserted.rowCount !== 1) {
        throw new HrmAttendanceStateError('Nhân viên đã check-in hôm nay.');
      }
    });
  }

  async updateAttendanceDay(input: {
    employeeId: string;
    workDate: string;
    shiftTemplateId?: string | null;
    clockIn?: string | null;
    clockOut?: string | null;
    shiftTemplateId2?: string | null;
    clockIn2?: string | null;
    clockOut2?: string | null;
    note?: string | null;
    status?: string | null;
    actorUserId: string;
  }): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const profile = await client.query<{ id: string, department_id: string | null }>(
        `select id, department_id from hrm_employee_profiles where tenant_id = $1 and source_employee_id = $2`,
        [scope.tenantId, input.employeeId]
      );
      if (!profile.rows[0]) throw new HrmAttendanceStateError('Không tìm thấy nhân viên.');
      const profileId = profile.rows[0].id;
      
      const existing = await client.query<{ id: string }>(
        `select id from hrm_attendance_days where tenant_id = $1 and branch_id = $2 and profile_id = $3 and work_date = $4`,
        [scope.tenantId, scope.branchId, profileId, input.workDate]
      );

      if (existing.rows[0]) {
        // Update (dynamically build coalesce or use nulls if we want to clear them? Actually the modal will pass full state or undefined)
        // If undefined, don't update. If null, clear it.
        const setClauses = [];
        const values: any[] = [];
        let index = 1;

        if (input.shiftTemplateId !== undefined) {
          setClauses.push(`shift_template_id = $${index++}`);
          values.push(input.shiftTemplateId);
        }
        if (input.clockIn !== undefined) {
          setClauses.push(`clock_in = $${index++}::timestamp with time zone`);
          values.push(input.clockIn);
        }
        if (input.clockOut !== undefined) {
          setClauses.push(`clock_out = $${index++}::timestamp with time zone`);
          values.push(input.clockOut);
        }
        if (input.shiftTemplateId2 !== undefined) {
          setClauses.push(`shift_template_id_2 = $${index++}`);
          values.push(input.shiftTemplateId2);
        }
        if (input.clockIn2 !== undefined) {
          setClauses.push(`clock_in_2 = $${index++}::timestamp with time zone`);
          values.push(input.clockIn2);
        }
        if (input.clockOut2 !== undefined) {
          setClauses.push(`clock_out_2 = $${index++}::timestamp with time zone`);
          values.push(input.clockOut2);
        }
        if (input.note !== undefined) {
          setClauses.push(`note = $${index++}`);
          values.push(input.note);
        }
        if (input.status !== undefined) {
          setClauses.push(`status = $${index++}`);
          values.push(input.status);
        }

        if (setClauses.length > 0) {
          setClauses.push(`updated_by = $${index++}`, `updated_at = now()`);
          values.push(input.actorUserId);
          
          values.push(existing.rows[0].id);
          await client.query(`
            update hrm_attendance_days
            set ${setClauses.join(', ')}
            where id = $${index}
          `, values);
        }
      } else {
        // Insert
        await client.query(`
          insert into hrm_attendance_days (
            id, tenant_id, branch_id, profile_id, department_id_snapshot, work_date,
            shift_template_id, clock_in, clock_out,
            shift_template_id_2, clock_in_2, clock_out_2,
            note, status, source, updated_by, created_at, updated_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'manual', $15, now(), now()
          )
        `, [
          `HRMA-${crypto.randomUUID()}`, scope.tenantId, scope.branchId, profileId, profile.rows[0].department_id, input.workDate,
          input.shiftTemplateId ?? null, input.clockIn ?? null, input.clockOut ?? null,
          input.shiftTemplateId2 ?? null, input.clockIn2 ?? null, input.clockOut2 ?? null,
          input.note ?? null, input.status ?? 'present', input.actorUserId
        ]);
      }
    });
  }

  async clockOut(input: {
    employeeId: string;
    actorUserId: string;
    customTime?: string;
  }): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const workDateStr = input.customTime 
        ? `(coalesce($4::timestamp, now()) at time zone 'Asia/Ho_Chi_Minh')::date`
        : `(now() at time zone 'Asia/Ho_Chi_Minh')::date`;

      const openAttendance = await client.query<{ id: string }>(
        `
          select a.id
          from hrm_attendance_days a
          join hrm_employee_profiles p
            on p.id = a.profile_id and p.tenant_id = a.tenant_id
          where a.tenant_id = $1 and a.branch_id = $2
            and p.source_employee_id = $3
            and a.work_date = ${workDateStr}
            and a.clock_in is not null and a.clock_out is null
          order by a.work_date desc, a.clock_in desc
          limit 1
          for update of a
        `,
        input.customTime 
          ? [scope.tenantId, scope.branchId, input.employeeId, input.customTime]
          : [scope.tenantId, scope.branchId, input.employeeId],
      );
      const attendance = openAttendance.rows[0];
      if (!attendance) {
        throw new HrmAttendanceStateError(
          'Nhân viên chưa check-in hoặc đã check-out.',
        );
      }
      await client.query(
        `
          update hrm_attendance_days
          set clock_out = coalesce($3::timestamp, now()),
              worked_minutes = greatest(
                0,
                floor(extract(epoch from (coalesce($3::timestamp, now()) - clock_in)) / 60)::integer
              ),
              updated_by = $2,
              updated_at = now()
          where id = $1
        `,
        [attendance.id, input.actorUserId, input.customTime ?? null],
      );
    });
  }


  async listEmployeeSalaryConfigurations(): Promise<HrmEmployeeSalarySummary[]> {
    const result = await this.pool.query<{
      employee_id: string;
      profile_id: string | null;
      employee_code: string | null;
      employee_name: string | null;
      department_id: string | null;
      department_name: string | null;
      bank_name: string | null;
      bank_account_last4: string | null;
      config_id: string | null;
      salary_type: 'monthly' | 'daily' | 'hourly' | null;
      base_amount: string | number | bigint | null;
      standard_work_days: number | null;
      standard_work_hours: string | number | null;
      overtime_multiplier: string | number | null;
      recurring_allowances: unknown;
      effective_from: string | null;
      effective_to: string | null;
      config_created_at: Date | string | null;
    }>(
      `
        select
          e.id as employee_id,
          p.id as profile_id,
          e.employee_code,
          coalesce(e.name, '') as employee_name,
          p.department_id,
          d.name as department_name,
          p.bank_name,
          p.bank_account_last4,
          c.id as config_id,
          c.salary_type,
          c.base_amount,
          c.standard_work_days,
          c.standard_work_hours,
          c.overtime_multiplier,
          c.recurring_allowances,
          c.effective_from::text,
          c.effective_to::text,
          c.created_at as config_created_at
        from employees e
        left join hrm_employee_profiles p
          on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
        left join departments d
          on d.id = p.department_id
          and d.tenant_id = e.tenant_id
          and d.branch_id = e.branch_id
        left join hrm_salary_configs c
          on c.tenant_id = e.tenant_id and c.profile_id = p.id
        where e.tenant_id = $1 and e.branch_id = $2
          and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
        order by e.name asc, c.effective_from desc nulls last
      `,
      [this.scope.tenantId, this.scope.branchId],
    );

    const employees = new Map<string, HrmEmployeeSalarySummary>();
    for (const row of result.rows) {
      let employee = employees.get(row.employee_id);
      if (!employee) {
        employee = {
          employeeId: row.employee_id,
          profileId: row.profile_id,
          employeeCode: row.employee_code,
          employeeName: row.employee_name ?? '',
          departmentId: row.department_id ?? null,
          departmentName: row.department_name,
          bankName: row.bank_name,
          bankAccountMasked: row.bank_account_last4
            ? `****${row.bank_account_last4}`
            : null,
          configurations: [],
        };
        employees.set(row.employee_id, employee);
      }
      if (!row.config_id || !row.salary_type || !row.effective_from) continue;
      const allowanceRows = Array.isArray(row.recurring_allowances)
        ? row.recurring_allowances
        : [];
      employee.configurations.push({
        id: row.config_id,
        salaryType: row.salary_type,
        baseAmount: Number(row.base_amount ?? 0),
        standardWorkDays: row.standard_work_days,
        standardWorkHours:
          row.standard_work_hours === null
            ? null
            : Number(row.standard_work_hours),
        overtimeMultiplier: Number(row.overtime_multiplier ?? 1),
        recurringAllowances: allowanceRows
          .filter(
            (item): item is { label: string; amount: number } =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as { label?: unknown }).label === 'string' &&
              Number.isSafeInteger(
                Number((item as { amount?: unknown }).amount),
              ),
          )
          .map((item) => ({
            label: item.label,
            amount: Number(item.amount),
          })),
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
        createdAt: row.config_created_at
          ? new Date(row.config_created_at).toISOString()
          : '',
      });
    }
    return [...employees.values()];
  }

  async createSalaryConfiguration(
    input: CreateHrmSalaryConfigurationInput,
  ): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const employee = await client.query<{ profile_id: string | null }>(
        `
          select p.id as profile_id
          from employees e
          left join hrm_employee_profiles p
            on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
          where e.id = $1 and e.tenant_id = $2 and e.branch_id = $3
            and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
          limit 1
          for update of e
        `,
        [input.employeeId, scope.tenantId, scope.branchId],
      );
      const scopedEmployee = employee.rows[0];
      if (!scopedEmployee) throw new HrmSalaryEmployeeNotFoundError();

      if (!scopedEmployee.profile_id) {
        await client.query(
          `
            insert into hrm_employee_profiles (
              id, tenant_id, branch_id, source_employee_id,
              employment_status, employment_type, custom_data,
              created_at, updated_at
            )
            values ($1, $2, $3, $4, 'active', 'monthly', '{}'::jsonb, now(), now())
            on conflict (tenant_id, source_employee_id) do nothing
          `,
          [input.profileId, scope.tenantId, scope.branchId, input.employeeId],
        );
      }
      const profile = await client.query<{ id: string }>(
        `
          select id from hrm_employee_profiles
          where tenant_id = $1 and branch_id = $2 and source_employee_id = $3
          limit 1
        `,
        [scope.tenantId, scope.branchId, input.employeeId],
      );
      const resolvedProfileId = profile.rows[0]?.id;
      if (!resolvedProfileId) throw new HrmSalaryEmployeeNotFoundError();

      const configs = await client.query<{
        effective_from: string;
      }>(
        `
          select effective_from::text
          from hrm_salary_configs
          where tenant_id = $1 and profile_id = $2
          order by effective_from asc
          for update
        `,
        [scope.tenantId, resolvedProfileId],
      );
      if (
        configs.rows.some(
          (configuration) =>
            configuration.effective_from === input.effectiveFrom,
        )
      ) {
        throw new HrmSalaryConfigConflictError();
      }
      const nextEffectiveFrom = configs.rows.find(
        (configuration) =>
          configuration.effective_from > input.effectiveFrom,
      )?.effective_from;

      await client.query(
        `
          update hrm_salary_configs
          set effective_to = ($3::date - interval '1 day')::date
          where tenant_id = $1 and profile_id = $2
            and effective_from < $3::date
            and (effective_to is null or effective_to >= $3::date)
        `,
        [scope.tenantId, resolvedProfileId, input.effectiveFrom],
      );
      const inserted = await client.query<{ id: string }>(
        `
          insert into hrm_salary_configs (
            id, tenant_id, profile_id, salary_type, base_amount,
            standard_work_days, standard_work_hours, overtime_multiplier,
            recurring_allowances, effective_from, effective_to,
            created_by, created_at
          )
          values (
            $1, $2, $3, $4, $5::bigint,
            $6, $7, $8, $9::jsonb, $10::date,
            case when $11::date is null then null
              else ($11::date - interval '1 day')::date end,
            $12, now()
          )
          returning id
        `,
        [
          input.id,
          scope.tenantId,
          resolvedProfileId,
          input.salaryType,
          input.baseAmount,
          input.standardWorkDays,
          input.standardWorkHours,
          input.overtimeMultiplier,
          JSON.stringify(input.recurringAllowances),
          input.effectiveFrom,
          nextEffectiveFrom ?? null,
          input.actorUserId,
        ],
      );
      if (inserted.rowCount !== 1) {
        throw new Error('HRM salary configuration was not created.');
      }

      await client.query(
        `
          insert into hrm_employee_salary_assignments (
            id, tenant_id, branch_id, profile_id, salary_mode,
            salary_group_id, assigned_by, assigned_at, updated_at
          ) values ($1, $2, $3, $4, 'custom', null, $5, now(), now())
          on conflict (tenant_id, profile_id) do update
          set branch_id = excluded.branch_id,
              salary_mode = 'custom',
              salary_group_id = null,
              assigned_by = excluded.assigned_by,
              assigned_at = now(),
              updated_at = now()
        `,
        [
          input.assignmentId ?? `HRMSA-${resolvedProfileId}`,
          scope.tenantId,
          scope.branchId,
          resolvedProfileId,
          input.actorUserId,
        ],
      );

      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id,
            event_type, entity_type, entity_id, summary, created_at
          )
          values (
            $1, $2, $3, $4,
            'salary_config.created', 'salary_config', $5, $6::jsonb, now()
          )
        `,
        [
          input.auditId,
          scope.tenantId,
          scope.branchId,
          input.actorUserId,
          input.id,
          JSON.stringify({
            employeeId: input.employeeId,
            salaryType: input.salaryType,
            effectiveFrom: input.effectiveFrom,
          }),
        ],
      );
    });
  }

  async getOverview(options: { includePayroll?: boolean } = {}): Promise<HrmOverview> {
    const payrollCountSql = options.includePayroll
      ? `(
          select count(*)::integer
          from hrm_payroll_runs
          where tenant_id = $1
            and branch_id = $2
            and status = 'draft'
        )`
      : 'null::integer';
    const result = await this.pool.query<HrmOverviewRow>(
      `
        select
          (
            select count(*)::integer
            from employees
            where tenant_id = $1
              and branch_id = $2
              and coalesce(active, 'TRUE') not in ('FALSE', 'false', '0')
          ) as employee_count,
          (
            select count(*)::integer
            from hrm_attendance_days
            where tenant_id = $1
              and branch_id = $2
              and work_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
              and status = 'present'
          ) as present_today,
          ${payrollCountSql} as draft_payroll_runs
      `,
      [this.scope.tenantId, this.scope.branchId],
    );
    const row = result.rows[0];

    return {
      employeeCount: Number(row?.employee_count ?? 0),
      presentToday: Number(row?.present_today ?? 0),
      draftPayrollRuns:
        row?.draft_payroll_runs === null ||
        row?.draft_payroll_runs === undefined
          ? null
          : Number(row.draft_payroll_runs),
    };
  }

  async listSalaryGroups(): Promise<HrmSalaryGroup[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      salary_type: 'monthly' | 'daily' | 'hourly';
      base_amount: string | number | bigint;
      standard_work_days: number | null;
      standard_work_hours: string | number | null;
      overtime_multiplier: string | number;
      recurring_allowances: unknown;
      is_default: number;
      active: number;
      employee_count: number;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `
        select
          g.id,
          g.name,
          g.salary_type,
          g.base_amount,
          g.standard_work_days,
          g.standard_work_hours,
          g.overtime_multiplier,
          g.recurring_allowances,
          g.is_default,
          g.active,
          count(a.id)::integer as employee_count,
          g.created_at,
          g.updated_at
        from hrm_salary_groups g
        left join hrm_employee_salary_assignments a
          on a.tenant_id = g.tenant_id
          and a.branch_id = g.branch_id
          and a.salary_group_id = g.id
          and a.salary_mode = 'group'
        where g.tenant_id = $1 and g.branch_id = $2
        group by g.id
        order by g.active desc, g.is_default desc, g.name asc
      `,
      [this.scope.tenantId, this.scope.branchId],
    );

    return result.rows.map((row) => {
      const allowanceRows = Array.isArray(row.recurring_allowances)
        ? row.recurring_allowances
        : [];
      return {
        id: row.id,
        name: row.name,
        salaryType: row.salary_type,
        baseAmount: Number(row.base_amount),
        standardWorkDays: row.standard_work_days,
        standardWorkHours:
          row.standard_work_hours === null
            ? null
            : Number(row.standard_work_hours),
        overtimeMultiplier: Number(row.overtime_multiplier),
        recurringAllowances: allowanceRows
          .filter(
            (item): item is { label: string; amount: number } =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as { label?: unknown }).label === 'string' &&
              Number.isSafeInteger(Number((item as { amount?: unknown }).amount)),
          )
          .map((item) => ({ label: item.label, amount: Number(item.amount) })),
        isDefault: row.is_default === 1,
        active: row.active === 1,
        employeeCount: Number(row.employee_count),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  async listEmployeeSalaryAssignments(): Promise<
    HrmEmployeeSalaryAssignment[]
  > {
    const result = await this.pool.query<{
      employee_id: string;
      profile_id: string;
      salary_mode: 'custom' | 'group';
      salary_group_id: string | null;
    }>(
      `
        select
          e.id as employee_id,
          p.id as profile_id,
          a.salary_mode,
          a.salary_group_id
        from hrm_employee_salary_assignments a
        inner join hrm_employee_profiles p
          on p.tenant_id = a.tenant_id and p.id = a.profile_id
        inner join employees e
          on e.tenant_id = p.tenant_id
          and e.id = p.source_employee_id
          and e.branch_id = a.branch_id
        where a.tenant_id = $1 and a.branch_id = $2
          and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
      `,
      [this.scope.tenantId, this.scope.branchId],
    );
    return result.rows.map((row) => ({
      employeeId: row.employee_id,
      profileId: row.profile_id,
      salaryMode: row.salary_mode,
      salaryGroupId: row.salary_group_id,
    }));
  }

  async createSalaryGroup(input: SaveHrmSalaryGroupInput): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      if (input.isDefault) {
        await client.query(
          `
            update hrm_salary_groups
            set is_default = 0, updated_by = $3, updated_at = now()
            where tenant_id = $1 and branch_id = $2 and is_default = 1
          `,
          [scope.tenantId, scope.branchId, input.actorUserId],
        );
      }
      await client.query(
        `
          insert into hrm_salary_groups (
            id, tenant_id, branch_id, name, salary_type, base_amount,
            standard_work_days, standard_work_hours, overtime_multiplier,
            recurring_allowances, is_default, active,
            created_by, updated_by, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, $5, $6::bigint,
            $7, $8, $9, $10::jsonb, $11, $12,
            $13, $13, now(), now()
          )
        `,
        [
          input.id,
          scope.tenantId,
          scope.branchId,
          input.name,
          input.salaryType,
          input.baseAmount,
          input.standardWorkDays,
          input.standardWorkHours,
          input.overtimeMultiplier,
          JSON.stringify(input.recurringAllowances),
          input.isDefault ? 1 : 0,
          input.active ? 1 : 0,
          input.actorUserId,
        ],
      );
      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id,
            event_type, entity_type, entity_id, summary, created_at
          ) values ($1, $2, $3, $4, 'salary_group.created', 'salary_group', $5, $6::jsonb, now())
        `,
        [
          input.auditId,
          scope.tenantId,
          scope.branchId,
          input.actorUserId,
          input.id,
          JSON.stringify({ name: input.name, isDefault: input.isDefault }),
        ],
      );
    });
  }

  async updateSalaryGroup(input: SaveHrmSalaryGroupInput): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const existing = await client.query<{ id: string }>(
        `
          select id from hrm_salary_groups
          where id = $1 and tenant_id = $2 and branch_id = $3
          limit 1 for update
        `,
        [input.id, scope.tenantId, scope.branchId],
      );
      if (!existing.rows[0]) throw new HrmSalaryGroupNotFoundError();
      if (input.isDefault) {
        await client.query(
          `
            update hrm_salary_groups
            set is_default = 0, updated_by = $3, updated_at = now()
            where tenant_id = $1 and branch_id = $2
              and id <> $4 and is_default = 1
          `,
          [scope.tenantId, scope.branchId, input.actorUserId, input.id],
        );
      }
      await client.query(
        `
          update hrm_salary_groups
          set name = $4,
              salary_type = $5,
              base_amount = $6::bigint,
              standard_work_days = $7,
              standard_work_hours = $8,
              overtime_multiplier = $9,
              recurring_allowances = $10::jsonb,
              is_default = $11,
              active = $12,
              updated_by = $13,
              updated_at = now()
          where id = $1 and tenant_id = $2 and branch_id = $3
        `,
        [
          input.id,
          scope.tenantId,
          scope.branchId,
          input.name,
          input.salaryType,
          input.baseAmount,
          input.standardWorkDays,
          input.standardWorkHours,
          input.overtimeMultiplier,
          JSON.stringify(input.recurringAllowances),
          input.isDefault ? 1 : 0,
          input.active ? 1 : 0,
          input.actorUserId,
        ],
      );
      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id,
            event_type, entity_type, entity_id, summary, created_at
          ) values ($1, $2, $3, $4, 'salary_group.updated', 'salary_group', $5, $6::jsonb, now())
        `,
        [
          input.auditId,
          scope.tenantId,
          scope.branchId,
          input.actorUserId,
          input.id,
          JSON.stringify({
            name: input.name,
            active: input.active,
            isDefault: input.isDefault,
          }),
        ],
      );
    });
  }

  async assignSalaryPolicy(input: AssignHrmSalaryPolicyInput): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const employee = await client.query<{ profile_id: string | null }>(
        `
          select p.id as profile_id
          from employees e
          left join hrm_employee_profiles p
            on p.tenant_id = e.tenant_id and p.source_employee_id = e.id
          where e.id = $1 and e.tenant_id = $2 and e.branch_id = $3
            and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
          limit 1 for update of e
        `,
        [input.employeeId, scope.tenantId, scope.branchId],
      );
      const scopedEmployee = employee.rows[0];
      if (!scopedEmployee) throw new HrmSalaryEmployeeNotFoundError();
      if (input.salaryMode === 'group') {
        const group = await client.query<{ id: string }>(
          `
            select id from hrm_salary_groups
            where id = $1 and tenant_id = $2 and branch_id = $3 and active = 1
            limit 1
          `,
          [input.salaryGroupId, scope.tenantId, scope.branchId],
        );
        if (!group.rows[0]) throw new HrmSalaryGroupNotFoundError();
      }
      if (!scopedEmployee.profile_id) {
        await client.query(
          `
            insert into hrm_employee_profiles (
              id, tenant_id, branch_id, source_employee_id,
              employment_status, employment_type, custom_data,
              created_at, updated_at
            ) values ($1, $2, $3, $4, 'active', 'monthly', '{}'::jsonb, now(), now())
            on conflict (tenant_id, source_employee_id) do nothing
          `,
          [input.profileId, scope.tenantId, scope.branchId, input.employeeId],
        );
      }
      const profile = await client.query<{ id: string }>(
        `
          select id from hrm_employee_profiles
          where tenant_id = $1 and branch_id = $2 and source_employee_id = $3
          limit 1
        `,
        [scope.tenantId, scope.branchId, input.employeeId],
      );
      const resolvedProfileId = profile.rows[0]?.id;
      if (!resolvedProfileId) throw new HrmSalaryEmployeeNotFoundError();
      await client.query(
        `
          insert into hrm_employee_salary_assignments (
            id, tenant_id, branch_id, profile_id, salary_mode,
            salary_group_id, assigned_by, assigned_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, now(), now())
          on conflict (tenant_id, profile_id) do update
          set branch_id = excluded.branch_id,
              salary_mode = excluded.salary_mode,
              salary_group_id = excluded.salary_group_id,
              assigned_by = excluded.assigned_by,
              assigned_at = now(),
              updated_at = now()
        `,
        [
          input.id,
          scope.tenantId,
          scope.branchId,
          resolvedProfileId,
          input.salaryMode,
          input.salaryMode === 'group' ? input.salaryGroupId : null,
          input.actorUserId,
        ],
      );
      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id,
            event_type, entity_type, entity_id, summary, created_at
          ) values ($1, $2, $3, $4, 'salary_policy.assigned', 'employee_profile', $5, $6::jsonb, now())
        `,
        [
          input.auditId,
          scope.tenantId,
          scope.branchId,
          input.actorUserId,
          resolvedProfileId,
          JSON.stringify({
            employeeId: input.employeeId,
            salaryMode: input.salaryMode,
            salaryGroupId:
              input.salaryMode === 'group' ? input.salaryGroupId : null,
          }),
        ],
      );
    });
  }

  async listPayrollRuns(): Promise<HrmPayrollRun[]> {
    const result = await this.pool.query<{
      id: string;
      period_start: string;
      period_end: string;
      status: HrmPayrollRunStatus;
      standard_work_days: number;
      total_gross: string | number | bigint;
      total_allowances: string | number | bigint;
      total_deductions: string | number | bigint;
      total_net: string | number | bigint;
      version: number;
      calculated_at: Date | string | null;
      finalized_at: Date | string | null;
      paid_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `
        select id, period_start::text, period_end::text, status,
          standard_work_days, total_gross, total_allowances,
          total_deductions, total_net, version, calculated_at,
          finalized_at, paid_at, created_at, updated_at
        from hrm_payroll_runs
        where tenant_id = $1 and branch_id = $2
        order by period_start desc, created_at desc
      `,
      [this.scope.tenantId, this.scope.branchId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      standardWorkDays: Number(row.standard_work_days),
      totalGross: Number(row.total_gross),
      totalAllowances: Number(row.total_allowances),
      totalDeductions: Number(row.total_deductions),
      totalNet: Number(row.total_net),
      version: Number(row.version),
      calculatedAt: row.calculated_at
        ? new Date(row.calculated_at).toISOString()
        : null,
      finalizedAt: row.finalized_at
        ? new Date(row.finalized_at).toISOString()
        : null,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async getPayrollRun(runId: string): Promise<HrmPayrollRunDetail | null> {
    const runResult = await this.pool.query<{
      id: string;
      period_start: string;
      period_end: string;
      status: HrmPayrollRunStatus;
      standard_work_days: number;
      total_gross: string | number | bigint;
      total_allowances: string | number | bigint;
      total_deductions: string | number | bigint;
      total_net: string | number | bigint;
      version: number;
      calculated_at: Date | string | null;
      finalized_at: Date | string | null;
      paid_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `
        select id, period_start::text, period_end::text, status,
          standard_work_days, total_gross, total_allowances,
          total_deductions, total_net, version, calculated_at,
          finalized_at, paid_at, created_at, updated_at
        from hrm_payroll_runs
        where id = $1 and tenant_id = $2 and branch_id = $3
        limit 1
      `,
      [runId, this.scope.tenantId, this.scope.branchId],
    );
    const run = runResult.rows[0];
    if (!run) return null;

    const itemResult = await this.pool.query<{
      id: string;
      profile_id: string;
      employee_name_snapshot: string;
      employee_code_snapshot: string | null;
      department_id_snapshot: string | null;
      salary_type_snapshot: 'monthly' | 'daily' | 'hourly';
      base_amount_snapshot: string | number | bigint;
      work_units: string | number;
      regular_pay: string | number | bigint;
      overtime_pay: string | number | bigint;
      allowance_total: string | number | bigint;
      bonus_total: string | number | bigint;
      commission_total: string | number | bigint;
      deduction_total: string | number | bigint;
      net_pay: string | number | bigint;
      breakdown: unknown;
      manual_note: string | null;
      updated_by: string | null;
      updated_at: Date | string;
    }>(
      `
        select id, profile_id, employee_name_snapshot,
          employee_code_snapshot, department_id_snapshot,
          salary_type_snapshot, base_amount_snapshot, work_units,
          regular_pay, overtime_pay, allowance_total, bonus_total,
          commission_total, deduction_total, net_pay, breakdown,
          manual_note, updated_by, updated_at
        from hrm_payroll_items
        where tenant_id = $1 and payroll_run_id = $2
        order by employee_name_snapshot asc, id asc
      `,
      [this.scope.tenantId, runId],
    );

    return {
      id: run.id,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      status: run.status,
      standardWorkDays: Number(run.standard_work_days),
      totalGross: Number(run.total_gross),
      totalAllowances: Number(run.total_allowances),
      totalDeductions: Number(run.total_deductions),
      totalNet: Number(run.total_net),
      version: Number(run.version),
      calculatedAt: run.calculated_at
        ? new Date(run.calculated_at).toISOString()
        : null,
      finalizedAt: run.finalized_at
        ? new Date(run.finalized_at).toISOString()
        : null,
      paidAt: run.paid_at ? new Date(run.paid_at).toISOString() : null,
      createdAt: new Date(run.created_at).toISOString(),
      updatedAt: new Date(run.updated_at).toISOString(),
      items: itemResult.rows.map((item) => ({
        id: item.id,
        profileId: item.profile_id,
        employeeName: item.employee_name_snapshot,
        employeeCode: item.employee_code_snapshot,
        departmentId: item.department_id_snapshot,
        salaryType: item.salary_type_snapshot,
        baseAmount: Number(item.base_amount_snapshot),
        workUnits: Number(item.work_units),
        regularPay: Number(item.regular_pay),
        overtimePay: Number(item.overtime_pay),
        allowanceTotal: Number(item.allowance_total),
        bonusTotal: Number(item.bonus_total),
        commissionTotal: Number(item.commission_total),
        deductionTotal: Number(item.deduction_total),
        netPay: Number(item.net_pay),
        breakdown: item.breakdown as HrmPayrollStoredBreakdown,
        manualNote: item.manual_note,
        updatedBy: item.updated_by,
        updatedAt: new Date(item.updated_at).toISOString(),
      })),
    };
  }

  async savePayrollRunDraft(
    input: SaveHrmPayrollRunDraftInput,
  ): Promise<HrmPayrollRunDetail> {
    let runId: string;
    try {
      runId = await this.withTransaction(async (client, scope) => {
      const existingResult = await client.query<{
        id: string;
        status: HrmPayrollRunStatus;
        version: number;
      }>(
        `
          select id, status, version
          from hrm_payroll_runs
          where tenant_id = $1 and branch_id = $2
            and period_start = $3::date and period_end = $4::date
          limit 1
          for update
        `,
        [scope.tenantId, scope.branchId, input.periodStart, input.periodEnd],
      );
      const existing = existingResult.rows[0];
      const resolvedRunId = existing?.id ?? input.id;

      if (existing) {
        if (existing.status !== 'draft') {
          throw new HrmPayrollRunStateError(
            'Kỳ lương đã chốt nên không thể tính lại.',
          );
        }
        if (input.expectedVersion !== existing.version) {
          throw new HrmPayrollVersionConflictError();
        }
      } else if (input.expectedVersion !== null) {
        throw new HrmPayrollVersionConflictError();
      }

      const totals = input.items.reduce(
        (sum, item) => ({
          gross:
            sum.gross +
            item.regularPay +
            item.overtimePay +
            item.allowanceTotal +
            item.bonusTotal +
            item.commissionTotal,
          allowances: sum.allowances + item.allowanceTotal,
          deductions: sum.deductions + item.deductionTotal,
          net: sum.net + item.netPay,
        }),
        { gross: 0, allowances: 0, deductions: 0, net: 0 },
      );

      if (existing) {
        await client.query(
          `
            update hrm_payroll_runs
            set standard_work_days = $4, total_gross = $5,
              total_allowances = $6, total_deductions = $7,
              total_net = $8, version = version + 1,
              calculated_at = now(), updated_at = now()
            where id = $1 and tenant_id = $2 and branch_id = $3
          `,
          [
            resolvedRunId,
            scope.tenantId,
            scope.branchId,
            input.standardWorkDays,
            totals.gross,
            totals.allowances,
            totals.deductions,
            totals.net,
          ],
        );
        await client.query(
          `delete from hrm_payroll_items where tenant_id = $1 and payroll_run_id = $2`,
          [scope.tenantId, resolvedRunId],
        );
      } else {
        await client.query(
          `
            insert into hrm_payroll_runs (
              id, tenant_id, branch_id, period_start, period_end, status,
              standard_work_days, total_gross, total_allowances,
              total_deductions, total_net, version, calculated_at,
              created_by, created_at, updated_at
            ) values (
              $1, $2, $3, $4::date, $5::date, 'draft', $6,
              $7, $8, $9, $10, 1, now(), $11, now(), now()
            )
          `,
          [
            resolvedRunId,
            scope.tenantId,
            scope.branchId,
            input.periodStart,
            input.periodEnd,
            input.standardWorkDays,
            totals.gross,
            totals.allowances,
            totals.deductions,
            totals.net,
            input.actorUserId,
          ],
        );
      }

      for (const item of input.items) {
        await client.query(
          `
            insert into hrm_payroll_items (
              id, tenant_id, payroll_run_id, profile_id,
              employee_name_snapshot, employee_code_snapshot,
              department_id_snapshot, salary_type_snapshot,
              base_amount_snapshot, work_units, regular_pay, overtime_pay,
              allowance_total, bonus_total, commission_total,
              deduction_total, net_pay, breakdown, manual_note,
              updated_by, created_at, updated_at
            ) values (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18::jsonb,
              $19, $20, now(), now()
            )
          `,
          [
            item.id,
            scope.tenantId,
            resolvedRunId,
            item.profileId,
            item.employeeName,
            item.employeeCode,
            item.departmentId,
            item.salaryType,
            item.baseAmount,
            item.workUnits,
            item.regularPay,
            item.overtimePay,
            item.allowanceTotal,
            item.bonusTotal,
            item.commissionTotal,
            item.deductionTotal,
            item.netPay,
            JSON.stringify(item.breakdown),
            item.manualNote,
            input.actorUserId,
          ],
        );
      }

      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id, event_type,
            entity_type, entity_id, summary, created_at
          ) values ($1, $2, $3, $4, $5, 'payroll_run', $6, $7::jsonb, now())
        `,
        [
          input.auditId,
          scope.tenantId,
          scope.branchId,
          input.actorUserId,
          existing ? 'payroll.recalculated' : 'payroll.created',
          resolvedRunId,
          JSON.stringify({
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            employeeCount: input.items.length,
            totalNet: totals.net,
          }),
        ],
      );
        return resolvedRunId;
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new HrmPayrollVersionConflictError();
      }
      throw error;
    }

    const run = await this.getPayrollRun(runId);
    if (!run) throw new HrmPayrollRunNotFoundError();
    return run;
  }

  async updatePayrollItem(
    input: UpdateHrmPayrollItemInput,
  ): Promise<HrmPayrollRunDetail> {
    await this.withTransaction(async (client, scope) => {
      const runResult = await client.query<{
        status: HrmPayrollRunStatus;
        version: number;
      }>(
        `
          select status, version from hrm_payroll_runs
          where id = $1 and tenant_id = $2 and branch_id = $3
          limit 1 for update
        `,
        [input.runId, scope.tenantId, scope.branchId],
      );
      const run = runResult.rows[0];
      if (!run) throw new HrmPayrollRunNotFoundError();
      if (run.status !== 'draft') {
        throw new HrmPayrollRunStateError(
          'Chỉ kỳ lương nháp mới được điều chỉnh.',
        );
      }
      if (run.version !== input.expectedVersion) {
        throw new HrmPayrollVersionConflictError();
      }

      const updated = await client.query(
        `
          update hrm_payroll_items
          set regular_pay = $5, overtime_pay = $6,
            allowance_total = $7, bonus_total = $8,
            commission_total = $9, deduction_total = $10,
            net_pay = $11, breakdown = $12::jsonb,
            manual_note = $13, updated_by = $14, updated_at = now()
          where id = $1 and tenant_id = $2 and payroll_run_id = $3
            and exists (
              select 1 from hrm_payroll_runs r
              where r.id = $3 and r.tenant_id = $2 and r.branch_id = $4
            )
        `,
        [
          input.itemId,
          scope.tenantId,
          input.runId,
          scope.branchId,
          input.regularPay,
          input.overtimePay,
          input.allowanceTotal,
          input.bonusTotal,
          input.commissionTotal,
          input.deductionTotal,
          input.netPay,
          JSON.stringify(input.breakdown),
          input.manualNote,
          input.actorUserId,
        ],
      );
      if (updated.rowCount !== 1) throw new HrmPayrollRunNotFoundError();

      const totals = await client.query<{
        total_gross: string | number;
        total_allowances: string | number;
        total_deductions: string | number;
        total_net: string | number;
      }>(
        `
          select
            coalesce(sum(regular_pay + overtime_pay + allowance_total + bonus_total + commission_total), 0) as total_gross,
            coalesce(sum(allowance_total), 0) as total_allowances,
            coalesce(sum(deduction_total), 0) as total_deductions,
            coalesce(sum(net_pay), 0) as total_net
          from hrm_payroll_items
          where tenant_id = $1 and payroll_run_id = $2
        `,
        [scope.tenantId, input.runId],
      );
      const aggregate = totals.rows[0];
      await client.query(
        `
          update hrm_payroll_runs
          set total_gross = $4, total_allowances = $5,
            total_deductions = $6, total_net = $7,
            version = version + 1, updated_at = now()
          where id = $1 and tenant_id = $2 and branch_id = $3
        `,
        [
          input.runId,
          scope.tenantId,
          scope.branchId,
          Number(aggregate?.total_gross ?? 0),
          Number(aggregate?.total_allowances ?? 0),
          Number(aggregate?.total_deductions ?? 0),
          Number(aggregate?.total_net ?? 0),
        ],
      );
      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id, event_type,
            entity_type, entity_id, summary, created_at
          ) values ($1, $2, $3, $4, 'payroll.item_adjusted',
            'payroll_item', $5, $6::jsonb, now())
        `,
        [
          input.auditId,
          scope.tenantId,
          scope.branchId,
          input.actorUserId,
          input.itemId,
          JSON.stringify({
            payrollRunId: input.runId,
            reason: input.manualNote,
          }),
        ],
      );
    });

    const run = await this.getPayrollRun(input.runId);
    if (!run) throw new HrmPayrollRunNotFoundError();
    return run;
  }

  async finalizePayrollRun(input: {
    runId: string;
    expectedVersion: number;
    actorUserId: string;
    auditId: string;
  }): Promise<HrmPayrollRunDetail> {
    await this.withTransaction(async (client, scope) => {
      const result = await client.query<{ status: HrmPayrollRunStatus }>(
        `
          update hrm_payroll_runs
          set status = 'finalized', version = version + 1,
            finalized_at = now(), updated_at = now()
          where id = $1 and tenant_id = $2 and branch_id = $3
            and status = 'draft' and version = $4
            and exists (
              select 1 from hrm_payroll_items i
              where i.tenant_id = $2 and i.payroll_run_id = $1
            )
          returning status
        `,
        [
          input.runId,
          scope.tenantId,
          scope.branchId,
          input.expectedVersion,
        ],
      );
      if (result.rowCount !== 1) {
        const current = await client.query<{
          status: HrmPayrollRunStatus;
          version: number;
        }>(
          `
            select status, version from hrm_payroll_runs
            where id = $1 and tenant_id = $2 and branch_id = $3
            limit 1
          `,
          [input.runId, scope.tenantId, scope.branchId],
        );
        if (!current.rows[0]) throw new HrmPayrollRunNotFoundError();
        if (current.rows[0].version !== input.expectedVersion) {
          throw new HrmPayrollVersionConflictError();
        }
        throw new HrmPayrollRunStateError();
      }

      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id, event_type,
            entity_type, entity_id, summary, created_at
          ) values ($1, $2, $3, $4, 'payroll.finalized',
            'payroll_run', $5, $6::jsonb, now())
        `,
        [
          input.auditId,
          scope.tenantId,
          scope.branchId,
          input.actorUserId,
          input.runId,
          JSON.stringify({ expectedVersion: input.expectedVersion }),
        ],
      );
    });

    const run = await this.getPayrollRun(input.runId);
    if (!run) throw new HrmPayrollRunNotFoundError();
    return run;
  }

  async recordPayrollExport(input: {
    runId: string;
    actorUserId: string;
    auditId: string;
  }): Promise<void> {
    const result = await this.pool.query(
      `
        insert into hrm_audit_logs (
          id, tenant_id, branch_id, actor_user_id, event_type,
          entity_type, entity_id, summary, created_at
        )
        select $1, r.tenant_id, r.branch_id, $2,
          'payroll.exported', 'payroll_run', r.id,
          $3::jsonb, now()
        from hrm_payroll_runs r
        where r.id = $4 and r.tenant_id = $5 and r.branch_id = $6
      `,
      [
        input.auditId,
        input.actorUserId,
        JSON.stringify({ format: 'csv' }),
        input.runId,
        this.scope.tenantId,
        this.scope.branchId,
      ],
    );
    if (result.rowCount !== 1) throw new HrmPayrollRunNotFoundError();
  }

  /**
   * Lists active payment funds available for payroll disbursement.
   * Reads directly from shared PostgreSQL; does NOT call cashbook HTTP API.
   */
  async listPaymentFunds(): Promise<HrmPaymentFund[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      type: string;
      current_balance: string | null;
      is_default: string | null;
    }>(
      `
        select id, name, type, current_balance, is_default
        from payment_funds
        where tenant_id = $1
          and branch_id = $2
          and coalesce(active, 'TRUE') not in ('FALSE', 'false', '0')
        order by
          case when coalesce(is_default, 'FALSE') = 'TRUE' then 0 else 1 end,
          name asc
      `,
      [this.scope.tenantId, this.scope.branchId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      currentBalance: parseFloat(row.current_balance ?? '0') || 0,
      isDefault: row.is_default === 'TRUE',
    }));
  }

  /**
   * HRM-501: Pay a finalized payroll run.
   *
   * Executes atomically inside a single PostgreSQL transaction:
   *   1. SELECT ... FOR UPDATE on hrm_payroll_runs (ensures status=finalized and locks row)
   *   2. SELECT ... FOR UPDATE on payment_funds (locks fund balance)
   *   3. Validate status = 'finalized' and version matches expectedVersion
   *   4. Validate fund balance >= total_net
   *   5. INSERT into cashbook (consolidated salary payment voucher)
   *   6. UPDATE payment_funds SET current_balance = current_balance - amount
   *   7. INSERT into hrm_cashbook_postings
   *      (UNIQUE payroll_run_id = idempotency guard against double-submit)
   *   8. UPDATE hrm_payroll_runs SET status='paid', paid_at=now(), version=version+1
   *   9. INSERT into hrm_audit_logs
   *
   * If step 7 raises a unique_violation (23505), the posting already exists —
   * read it back and return idempotent result without modifying any balance.
   *
   * Does NOT call cashbook HTTP route, IDataConnector, RollbackContext,
   * or resolveAndRecordPayment(). No salary breakdown is written to cashbook.
   */
  async payPayrollRun(input: PayPayrollRunInput): Promise<PayPayrollRunResult> {
    const { tenantId, branchId } = this.scope;

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      // ── 1. Lock payroll run row ────────────────────────────────────────────
      const runResult = await client.query<{
        id: string;
        status: HrmPayrollRunStatus;
        total_net: string | number;
        version: number | string;
      }>(
        `
          select id, status, total_net, version
          from hrm_payroll_runs
          where id = $1
            and tenant_id = $2
            and branch_id = $3
          for update
        `,
        [input.runId, tenantId, branchId],
      );
      if (!runResult.rows[0]) {
        throw new HrmPayrollRunNotFoundError();
      }
      const runRow = runResult.rows[0];

      // ── 2. Validate state & version ───────────────────────────────────────
      if (runRow.status !== 'finalized') {
        // Already paid — idempotency: read and return existing posting
        if (runRow.status === 'paid') {
          const existingPosting = await client.query<{
            id: string;
            cashbook_transaction_id: string;
            fund_id: string;
            amount: string | number;
            posted_at: Date | string;
          }>(
            `
              select id, cashbook_transaction_id, fund_id, amount, posted_at
              from hrm_cashbook_postings
              where payroll_run_id = $1
              limit 1
            `,
            [input.runId],
          );
          if (existingPosting.rows[0]) {
            await client.query('rollback');
            client.release();

            const posting = existingPosting.rows[0];
            const run = await this.getPayrollRun(input.runId);
            if (!run) throw new HrmPayrollRunNotFoundError();
            return {
              payrollRun: run,
              posting: {
                id: posting.id,
                cashbookTransactionId: posting.cashbook_transaction_id,
                fundId: posting.fund_id,
                amount: Number(posting.amount),
                postedAt:
                  posting.posted_at instanceof Date
                    ? posting.posted_at.toISOString()
                    : String(posting.posted_at),
              },
            };
          }
        }
        throw new HrmPayrollRunStateError(
          'Kỳ lương phải ở trạng thái "Đã chốt" để thanh toán.',
        );
      }

      if (Number(runRow.version) !== input.expectedVersion) {
        throw new HrmPayrollVersionConflictError();
      }

      const totalNet = Number(runRow.total_net);

      // ── 3. Lock payment fund row ────────────────────────────────────────────
      const fundResult = await client.query<{
        id: string;
        current_balance: string | null;
        name: string;
      }>(
        `
          select id, current_balance, name
          from payment_funds
          where id = $1
            and tenant_id = $2
            and branch_id = $3
            and coalesce(active, 'TRUE') not in ('FALSE', 'false', '0')
          for update
        `,
        [input.fundId, tenantId, branchId],
      );
      if (!fundResult.rows[0]) {
        throw new HrmFundNotFoundError();
      }
      const fundRow = fundResult.rows[0];
      const currentBalance = parseFloat(fundRow.current_balance ?? '0') || 0;

      // ── 4. Check sufficient balance ────────────────────────────────────────
      if (currentBalance < totalNet) {
        throw new HrmInsufficientFundBalanceError(currentBalance, totalNet);
      }

      const newBalance = currentBalance - totalNet;
      const now = new Date();
      const balanceAfterStr = String(newBalance);

      // ── 5. Generate structured cashbook ID (CB-TENANTHASH-SEQUENCE) ──────────
      const cashbookTransactionId = await this.generateCashbookId(client);

      // ── 6. Create cashbook transaction (consolidated salary payment) ──────────
      // No per-employee breakdown to avoid exposing payroll details in cashbook.
      await client.query(
        `
          insert into cashbook (
            id, tenant_id, branch_id, type, amount, method, category,
            reference_id, reference_name, employee_id, note, fund_id,
            balance_after_transaction, is_virtual, created_at, updated_at, active
          ) values (
            $1, $2, $3, 'payment', $4, 'transfer', 'salary_payment',
            $5, $6, $7, $8, $9,
            $10, 'FALSE', $11, $11, 'TRUE'
          )
        `,
        [
          cashbookTransactionId,
          tenantId,
          branchId,
          String(totalNet),
          input.runId,
          input.periodLabel,
          input.actorUserId,
          `Chi lương ${input.periodLabel}`,
          input.fundId,
          balanceAfterStr,
          now,
        ],
      );

      // ── 6. Deduct from fund balance ────────────────────────────────────────
      await client.query(
        `
          update payment_funds
          set current_balance = $1, updated_at = $2
          where id = $3
            and tenant_id = $4
            and branch_id = $5
        `,
        [balanceAfterStr, now, input.fundId, tenantId, branchId],
      );

      // ── 7. Insert posting (UNIQUE payroll_run_id = double-submit guard) ────
      let postingId = input.postingId;
      let postingInserted = false;
      try {
        await client.query(
          `
            insert into hrm_cashbook_postings (
              id, tenant_id, branch_id, payroll_run_id,
              cashbook_transaction_id, fund_id, amount, posted_by, posted_at
            ) values (
              $1, $2, $3, $4, $5, $6, $7, $8::uuid, $9
            )
          `,
          [
            postingId,
            tenantId,
            branchId,
            input.runId,
            cashbookTransactionId,
            input.fundId,
            String(totalNet),
            input.actorUserId,
            now,
          ],
        );
        postingInserted = true;
      } catch (pgError: unknown) {
        // unique_violation on payroll_run_id → already posted (concurrent request)
        const isUniqueViolation =
          pgError &&
          typeof pgError === 'object' &&
          'code' in pgError &&
          (pgError as { code: string }).code === '23505';

        if (!isUniqueViolation) throw pgError;

        // Read the existing posting for idempotent return
        await client.query('rollback');
        client.release();

        const existingPosting = await this.pool.query<{
          id: string;
          cashbook_transaction_id: string;
          fund_id: string;
          amount: string | number;
          posted_at: Date | string;
        }>(
          `
            select id, cashbook_transaction_id, fund_id, amount, posted_at
            from hrm_cashbook_postings
            where payroll_run_id = $1
            limit 1
          `,
          [input.runId],
        );
        const existingRun = await this.getPayrollRun(input.runId);
        if (!existingRun || !existingPosting.rows[0]) {
          throw new HrmPayrollRunNotFoundError();
        }
        const ep = existingPosting.rows[0];
        return {
          payrollRun: existingRun,
          posting: {
            id: ep.id,
            cashbookTransactionId: ep.cashbook_transaction_id,
            fundId: ep.fund_id,
            amount: Number(ep.amount),
            postedAt:
              ep.posted_at instanceof Date
                ? ep.posted_at.toISOString()
                : String(ep.posted_at),
          },
        };
      }

      if (!postingInserted) {
        // Should not reach here — safety net
        throw new HrmPayrollRunStateError('Không thể ghi nhận phiếu chi lương.');
      }

      // ── 8. Transition payroll run to paid ──────────────────────────────────
      await client.query(
        `
          update hrm_payroll_runs
          set status = 'paid',
              paid_at = $1,
              version = version + 1,
              updated_at = $1
          where id = $2
            and tenant_id = $3
            and branch_id = $4
            and status = 'finalized'
        `,
        [now, input.runId, tenantId, branchId],
      );

      // ── 9. Audit log ───────────────────────────────────────────────────────
      await client.query(
        `
          insert into hrm_audit_logs (
            id, tenant_id, branch_id, actor_user_id, event_type,
            entity_type, entity_id, summary, created_at
          ) values ($1, $2, $3, $4::uuid, 'payroll.paid',
            'payroll_run', $5, $6::jsonb, $7)
        `,
        [
          input.auditId,
          tenantId,
          branchId,
          input.actorUserId,
          input.runId,
          JSON.stringify({
            postingId,
            cashbookTransactionId,
            fundId: input.fundId,
            amount: totalNet,
          }),
          now,
        ],
      );

      await client.query('commit');

      const run = await this.getPayrollRun(input.runId);
      if (!run) throw new HrmPayrollRunNotFoundError();

      return {
        payrollRun: run,
        posting: {
          id: postingId,
          cashbookTransactionId: cashbookTransactionId,
          fundId: input.fundId,
          amount: totalNet,
          postedAt: now.toISOString(),
        },
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      // Only release if not already released in idempotency branches
      try {
        client.release();
      } catch {
        // Already released
      }
    }
  }

  async withTransaction<T>(
    operation: (
      client: PoolClient,
      scope: Readonly<HrmRepositoryScope>,
    ) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const result = await operation(client, this.getScope());
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listHolidays(year: number): Promise<{ id: string; date: string; name: string }[]> {
    const result = await this.pool.query(
      `
        select id, date, name
        from hrm_holidays
        where tenant_id = $1 and branch_id = $2
          and extract(year from date) = $3
        order by date asc
      `,
      [this.scope.tenantId, this.scope.branchId, year]
    );
    return result.rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      name: r.name,
    }));
  }

  async createHoliday(input: { id: string; date: string; name: string }): Promise<void> {
    await this.pool.query(
      `
        insert into hrm_holidays (id, tenant_id, branch_id, date, name, created_at, updated_at)
        values ($1, $2, $3, $4, $5, now(), now())
      `,
      [input.id, this.scope.tenantId, this.scope.branchId, input.date, input.name]
    );
  }

  async deleteHoliday(id: string): Promise<void> {
    await this.pool.query(
      `delete from hrm_holidays where id = $1 and tenant_id = $2 and branch_id = $3`,
      [id, this.scope.tenantId, this.scope.branchId]
    );
  }
}
