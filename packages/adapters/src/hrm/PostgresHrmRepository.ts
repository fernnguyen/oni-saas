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
