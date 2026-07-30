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
