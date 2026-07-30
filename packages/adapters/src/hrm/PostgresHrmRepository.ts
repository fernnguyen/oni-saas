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
  departmentId?: string;
}

export interface HrmCustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  options: string[];
  required: boolean;
  active: boolean;
  sortOrder: number;
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
      department_id: string | null;
      department_name: string | null;
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
          p.department_id,
          d.name as department_name,
          coalesce(p.custom_data, '{}'::jsonb) as custom_data,
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
        departmentId: row.department_id,
        departmentName: row.department_name,
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
            custom_data, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, nullif($5, ''), nullif($6, ''), 'active', $7,
            nullif($8, '')::date, nullif($9, ''), nullif($10, ''),
            '{}'::jsonb, now(), now()
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
    departmentId?: string;
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
            email, address, custom_data, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, $5::uuid, nullif($6, ''), nullif($7, ''), $8, $9,
            nullif($10, '')::date, nullif($11, ''), nullif($12, ''),
            $13::jsonb, now(), now()
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
          JSON.stringify(input.customData),
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
      field_type: HrmCustomFieldDefinition['fieldType'];
      options: string[] | null;
      required: number;
      active: number;
      sort_order: number;
      usage_count: number | string;
    }>(
      `
        select
          d.id, d.key, d.label, d.field_type, d.options, d.required,
          d.active, d.sort_order,
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
      fieldType: row.field_type,
      options: Array.isArray(row.options) ? row.options : [],
      required: row.required === 1,
      active: row.active === 1,
      sortOrder: row.sort_order,
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
    fieldType: HrmCustomFieldDefinition['fieldType'];
    options: string[];
    required: boolean;
    tenantWide: boolean;
  }): Promise<void> {
    await this.pool.query(
      `
        insert into hrm_custom_field_definitions (
          id, tenant_id, branch_id, key, label, field_type, options,
          required, active, sort_order, created_at, updated_at
        )
        values (
          $1, $2::varchar, $3::varchar, $4, $5, $6, $7::jsonb, $8, 1,
          coalesce((
            select max(sort_order) + 1
            from hrm_custom_field_definitions
            where tenant_id = $2::varchar
          ), 0),
          now(), now()
        )
      `,
      [
        input.id,
        this.scope.tenantId,
        input.tenantWide ? null : this.scope.branchId,
        input.key,
        input.label,
        input.fieldType,
        JSON.stringify(input.options),
        input.required ? 1 : 0,
      ],
    );
  }

  async updateCustomField(input: {
    id: string;
    label: string;
    options: string[];
    required: boolean;
    active: boolean;
  }): Promise<void> {
    const result = await this.pool.query(
      `
        update hrm_custom_field_definitions
        set label = $4,
            options = $5::jsonb,
            required = $6,
            active = $7,
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
        JSON.stringify(input.options),
        input.required ? 1 : 0,
        input.active ? 1 : 0,
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
      clock_in: Date | string | null;
      clock_out: Date | string | null;
      worked_minutes: number | string | null;
      late_minutes: number | string | null;
      early_leave_minutes: number | string | null;
      overtime_minutes: number | string | null;
      status: string | null;
      note: string | null;
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
          a.shift_template_id,
          s.name as shift_name,
          a.clock_in,
          a.clock_out,
          a.worked_minutes,
          a.late_minutes,
          a.early_leave_minutes,
          a.overtime_minutes,
          a.status,
          a.note
        from employees e
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
          on s.id = a.shift_template_id
          and s.tenant_id = a.tenant_id
          and s.branch_id = a.branch_id
        where e.tenant_id = $1 and e.branch_id = $2
          and coalesce(e.active, 'TRUE') not in ('FALSE', 'false', '0')
          and ($5::varchar is null or coalesce(a.department_id_snapshot, p.department_id) = $5)
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

    return result.rows.map((row) => ({
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
      clockIn: row.clock_in ? new Date(row.clock_in).toISOString() : null,
      clockOut: row.clock_out ? new Date(row.clock_out).toISOString() : null,
      workedMinutes: Number(row.worked_minutes ?? 0),
      lateMinutes: Number(row.late_minutes ?? 0),
      earlyLeaveMinutes: Number(row.early_leave_minutes ?? 0),
      overtimeMinutes: Number(row.overtime_minutes ?? 0),
      status: row.status,
      note: row.note,
    }));
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
            (now() at time zone 'Asia/Ho_Chi_Minh')::date,
            now(), 0, 0, 0, 0, 'present', $6, $7, now(), now()
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
        ],
      );
      if (inserted.rowCount !== 1) {
        throw new HrmAttendanceStateError('Nhân viên đã check-in hôm nay.');
      }
    });
  }

  async clockOut(input: {
    employeeId: string;
    actorUserId: string;
  }): Promise<void> {
    await this.withTransaction(async (client, scope) => {
      const openAttendance = await client.query<{ id: string }>(
        `
          select a.id
          from hrm_attendance_days a
          join hrm_employee_profiles p
            on p.id = a.profile_id and p.tenant_id = a.tenant_id
          where a.tenant_id = $1 and a.branch_id = $2
            and p.source_employee_id = $3
            and a.work_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
            and a.clock_in is not null and a.clock_out is null
          order by a.work_date desc, a.clock_in desc
          limit 1
          for update of a
        `,
        [scope.tenantId, scope.branchId, input.employeeId],
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
          set clock_out = now(),
              worked_minutes = greatest(
                0,
                floor(extract(epoch from (now() - clock_in)) / 60)::integer
              ),
              updated_by = $2,
              updated_at = now()
          where id = $1
        `,
        [attendance.id, input.actorUserId],
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
}
