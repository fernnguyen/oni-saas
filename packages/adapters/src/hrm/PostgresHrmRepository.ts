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
  employeeCode: string | null;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  joinedAt: string | null;
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
      joined_at: string | null;
      total_count: number | string;
    }>(
      `
        select
          e.id,
          e.employee_code,
          coalesce(e.name, '') as name,
          e.phone,
          p.job_title,
          coalesce(p.employment_status, 'active') as employment_status,
          coalesce(p.joined_at::text, nullif(e.hire_date, '')) as joined_at,
          count(*) over()::integer as total_count
        from employees e
        left join hrm_employee_profiles p
          on p.tenant_id = e.tenant_id
          and p.source_employee_id = e.id
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
        employeeCode: row.employee_code,
        name: row.name ?? '',
        phone: row.phone,
        jobTitle: row.job_title,
        employmentStatus: row.employment_status ?? 'active',
        joinedAt: row.joined_at,
      })),
      total: Number(result.rows[0]?.total_count ?? 0),
    };
  }

  async createEmployee(input: CreateHrmEmployeeInput): Promise<{
    employeeId: string;
    profileId: string;
  }> {
    return this.withTransaction(async (client, scope) => {
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
            id, tenant_id, branch_id, source_employee_id, job_title,
            employment_status, employment_type, joined_at, email, address,
            custom_data, created_at, updated_at
          )
          values (
            $1, $2, $3, $4, nullif($5, ''), 'active', $6,
            nullif($7, '')::date, nullif($8, ''), nullif($9, ''),
            '{}'::jsonb, now(), now()
          )
        `,
        [
          input.profileId,
          scope.tenantId,
          scope.branchId,
          input.employeeId,
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
