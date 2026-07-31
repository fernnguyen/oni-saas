import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  primaryKey,
} from 'drizzle-orm/pg-core';

const tenantId = () => varchar('tenant_id', { length: 255 }).notNull();
const branchId = () => varchar('branch_id', { length: 255 }).notNull();
const auditTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const hrmEmployeeProfiles = pgTable(
  'hrm_employee_profiles',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: branchId(),
    source_employee_id: varchar('source_employee_id', { length: 255 }).notNull(),
    auth_user_id: uuid('auth_user_id'),
    department_id: varchar('department_id', { length: 255 }),
    job_title: text('job_title'),
    employment_status: varchar('employment_status', { length: 20 })
      .default('active')
      .notNull(),
    employment_type: varchar('employment_type', { length: 20 })
      .default('monthly')
      .notNull(),
    joined_at: date('joined_at'),
    ended_at: date('ended_at'),
    email: text('email'),
    address: text('address'),
    bank_name: text('bank_name'),
    bank_account_last4: varchar('bank_account_last4', { length: 4 }),
    bank_account_ciphertext: text('bank_account_ciphertext'),
    default_shift_template_id: varchar('default_shift_template_id', { length: 255 }),
    custom_data: jsonb('custom_data').default(sql`'{}'::jsonb`).notNull(),
    created_at: auditTimestamp('created_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_profiles_tenant_employee').on(
      table.tenant_id,
      table.source_employee_id,
    ),
    uniqueIndex('uq_hrm_profiles_tenant_auth_user')
      .on(table.tenant_id, table.auth_user_id)
      .where(sql`${table.auth_user_id} is not null`),
    index('idx_hrm_profiles_tenant_branch_status').on(
      table.tenant_id,
      table.branch_id,
      table.employment_status,
    ),
    check(
      'ck_hrm_profiles_employment_status',
      sql`${table.employment_status} in ('active', 'probation', 'inactive')`,
    ),
    check(
      'ck_hrm_profiles_employment_type',
      sql`${table.employment_type} in ('monthly', 'daily', 'hourly')`,
    ),
    check(
      'ck_hrm_profiles_bank_last4',
      sql`${table.bank_account_last4} is null or length(${table.bank_account_last4}) = 4`,
    ),
  ],
);

export const hrmEmployeeTransfers = pgTable(
  'hrm_employee_transfers',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    profile_id: varchar('profile_id', { length: 255 }).notNull(),
    from_branch_id: varchar('from_branch_id', { length: 255 }).notNull(),
    to_branch_id: varchar('to_branch_id', { length: 255 }).notNull(),
    from_department_id: varchar('from_department_id', { length: 255 }),
    to_department_id: varchar('to_department_id', { length: 255 }),
    effective_at: timestamp('effective_at', { withTimezone: true }).notNull(),
    transferred_by: uuid('transferred_by').notNull(),
    note: text('note'),
    created_at: auditTimestamp('created_at'),
  },
  (table) => [
    index('idx_hrm_transfers_tenant_profile_effective').on(
      table.tenant_id,
      table.profile_id,
      table.effective_at,
    ),
    index('idx_hrm_transfers_tenant_target_branch').on(
      table.tenant_id,
      table.to_branch_id,
      table.effective_at,
    ),
  ],
);

export const hrmCustomFieldDefinitions = pgTable(
  'hrm_custom_field_definitions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: varchar('branch_id', { length: 255 }),
    key: varchar('key', { length: 100 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    group_name: varchar('group_name', { length: 255 }),
    field_type: varchar('field_type', { length: 30 }).notNull(),
    options: jsonb('options').default(sql`'[]'::jsonb`).notNull(),
    new_tab: integer('new_tab').default(0).notNull(),
    required: integer('required').default(0).notNull(),
    active: integer('active').default(1).notNull(),
    sort_order: integer('sort_order').default(0).notNull(),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
    created_at: auditTimestamp('created_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_custom_fields_scope_key').on(
      table.tenant_id,
      sql`coalesce(${table.branch_id}, '')`,
      table.key,
    ),
    index('idx_hrm_custom_fields_tenant_branch_active').on(
      table.tenant_id,
      table.branch_id,
      table.active,
      table.sort_order,
    ),
    check(
      'ck_hrm_custom_fields_type',
      sql`${table.field_type} in ('text', 'number', 'date', 'boolean', 'select', 'multiselect', 'upload')`,
    ),
    check('ck_hrm_custom_fields_new_tab', sql`${table.new_tab} in (0, 1)`),
    check('ck_hrm_custom_fields_required', sql`${table.required} in (0, 1)`),
    check('ck_hrm_custom_fields_active', sql`${table.active} in (0, 1)`),
  ],
);

export const hrmSettings = pgTable('hrm_settings', {
  tenant_id: tenantId(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  max_upload_size_mb: integer('max_upload_size_mb').default(10).notNull(),
  created_at: auditTimestamp('created_at'),
  updated_at: auditTimestamp('updated_at'),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.branch_id] }),
]);

export const hrmShiftTemplates = pgTable(
  'hrm_shift_templates',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: branchId(),
    name: varchar('name', { length: 255 }).notNull(),
    start_time: time('start_time').notNull(),
    end_time: time('end_time').notNull(),
    break_minutes: integer('break_minutes').default(0).notNull(),
    late_grace_minutes: integer('late_grace_minutes').default(0).notNull(),
    active: integer('active').default(1).notNull(),
    created_at: auditTimestamp('created_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    index('idx_hrm_shifts_tenant_branch_active').on(
      table.tenant_id,
      table.branch_id,
      table.active,
    ),
    check('ck_hrm_shifts_break', sql`${table.break_minutes} >= 0`),
    check('ck_hrm_shifts_grace', sql`${table.late_grace_minutes} >= 0`),
    check('ck_hrm_shifts_active', sql`${table.active} in (0, 1)`),
  ],
);

export const hrmAttendanceDays = pgTable(
  'hrm_attendance_days',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: branchId(),
    profile_id: varchar('profile_id', { length: 255 }).notNull(),
    department_id_snapshot: varchar('department_id_snapshot', { length: 255 }),
    work_date: date('work_date').notNull(),
    shift_template_id: varchar('shift_template_id', { length: 255 }),
    clock_in: timestamp('clock_in', { withTimezone: true }),
    clock_out: timestamp('clock_out', { withTimezone: true }),
    shift_template_id_2: varchar('shift_template_id_2', { length: 255 }),
    clock_in_2: timestamp('clock_in_2', { withTimezone: true }),
    clock_out_2: timestamp('clock_out_2', { withTimezone: true }),
    worked_minutes: integer('worked_minutes').default(0).notNull(),
    late_minutes: integer('late_minutes').default(0).notNull(),
    early_leave_minutes: integer('early_leave_minutes').default(0).notNull(),
    overtime_minutes: integer('overtime_minutes').default(0).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    source: varchar('source', { length: 30 }).default('manual').notNull(),
    note: text('note'),
    updated_by: uuid('updated_by'),
    created_at: auditTimestamp('created_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_attendance_tenant_profile_date').on(
      table.tenant_id,
      table.profile_id,
      table.work_date,
    ),
    index('idx_hrm_attendance_tenant_branch_date').on(
      table.tenant_id,
      table.branch_id,
      table.work_date,
    ),
    index('idx_hrm_attendance_tenant_status_date').on(
      table.tenant_id,
      table.status,
      table.work_date,
    ),
    check(
      'ck_hrm_attendance_status',
      sql`${table.status} in ('present', 'absent', 'paid_leave', 'unpaid_leave', 'holiday')`,
    ),
    check(
      'ck_hrm_attendance_minutes',
      sql`${table.worked_minutes} >= 0 and ${table.late_minutes} >= 0 and ${table.early_leave_minutes} >= 0 and ${table.overtime_minutes} >= 0`,
    ),
    check(
      'ck_hrm_attendance_clock_order',
      sql`${table.clock_out} is null or ${table.clock_in} is null or ${table.clock_out} >= ${table.clock_in}`,
    ),
  ],
);

export const hrmSalaryConfigs = pgTable(
  'hrm_salary_configs',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    profile_id: varchar('profile_id', { length: 255 }).notNull(),
    salary_type: varchar('salary_type', { length: 20 }).notNull(),
    base_amount: bigint('base_amount', { mode: 'bigint' }).notNull(),
    standard_work_days: integer('standard_work_days'),
    standard_work_hours: numeric('standard_work_hours', {
      precision: 10,
      scale: 2,
    }),
    overtime_multiplier: numeric('overtime_multiplier', {
      precision: 8,
      scale: 4,
    })
      .default('1')
      .notNull(),
    recurring_allowances: jsonb('recurring_allowances')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    effective_from: date('effective_from').notNull(),
    effective_to: date('effective_to'),
    created_by: uuid('created_by').notNull(),
    created_at: auditTimestamp('created_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_salary_configs_effective').on(
      table.tenant_id,
      table.profile_id,
      table.effective_from,
    ),
    index('idx_hrm_salary_configs_tenant_profile_period').on(
      table.tenant_id,
      table.profile_id,
      table.effective_from,
      table.effective_to,
    ),
    check(
      'ck_hrm_salary_configs_type',
      sql`${table.salary_type} in ('monthly', 'daily', 'hourly')`,
    ),
    check('ck_hrm_salary_configs_base', sql`${table.base_amount} >= 0`),
    check(
      'ck_hrm_salary_configs_period',
      sql`${table.effective_to} is null or ${table.effective_to} >= ${table.effective_from}`,
    ),
  ],
);


export const hrmSalaryGroups = pgTable(
  'hrm_salary_groups',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: branchId(),
    name: varchar('name', { length: 160 }).notNull(),
    salary_type: varchar('salary_type', { length: 20 }).notNull(),
    base_amount: bigint('base_amount', { mode: 'bigint' }).notNull(),
    standard_work_days: integer('standard_work_days'),
    standard_work_hours: numeric('standard_work_hours', {
      precision: 10,
      scale: 2,
    }),
    overtime_multiplier: numeric('overtime_multiplier', {
      precision: 8,
      scale: 4,
    })
      .default('1')
      .notNull(),
    recurring_allowances: jsonb('recurring_allowances')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    is_default: integer('is_default').default(0).notNull(),
    active: integer('active').default(1).notNull(),
    created_by: uuid('created_by').notNull(),
    updated_by: uuid('updated_by').notNull(),
    created_at: auditTimestamp('created_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_salary_groups_name').on(
      table.tenant_id,
      table.branch_id,
      table.name,
    ),
    uniqueIndex('uq_hrm_salary_groups_default')
      .on(table.tenant_id, table.branch_id)
      .where(sql`${table.is_default} = 1 and ${table.active} = 1`),
    index('idx_hrm_salary_groups_scope_active').on(
      table.tenant_id,
      table.branch_id,
      table.active,
    ),
    check(
      'ck_hrm_salary_groups_type',
      sql`${table.salary_type} in ('monthly', 'daily', 'hourly')`,
    ),
    check('ck_hrm_salary_groups_base', sql`${table.base_amount} >= 0`),
    check(
      'ck_hrm_salary_groups_flags',
      sql`${table.is_default} in (0, 1) and ${table.active} in (0, 1)`,
    ),
  ],
);

export const hrmEmployeeSalaryAssignments = pgTable(
  'hrm_employee_salary_assignments',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: branchId(),
    profile_id: varchar('profile_id', { length: 255 }).notNull(),
    salary_mode: varchar('salary_mode', { length: 20 }).notNull(),
    salary_group_id: varchar('salary_group_id', { length: 255 }),
    assigned_by: uuid('assigned_by').notNull(),
    assigned_at: auditTimestamp('assigned_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_employee_salary_assignments_profile').on(
      table.tenant_id,
      table.profile_id,
    ),
    index('idx_hrm_employee_salary_assignments_group').on(
      table.tenant_id,
      table.branch_id,
      table.salary_group_id,
    ),
    check(
      'ck_hrm_employee_salary_assignments_mode',
      sql`${table.salary_mode} in ('custom', 'group')`,
    ),
    check(
      'ck_hrm_employee_salary_assignments_group_mode',
      sql`(${table.salary_mode} = 'group' and ${table.salary_group_id} is not null) or (${table.salary_mode} = 'custom' and ${table.salary_group_id} is null)`,
    ),
  ],
);

export const hrmPayrollRuns = pgTable(
  'hrm_payroll_runs',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: branchId(),
    period_start: date('period_start').notNull(),
    period_end: date('period_end').notNull(),
    status: varchar('status', { length: 20 }).default('draft').notNull(),
    standard_work_days: integer('standard_work_days').notNull(),
    total_gross: bigint('total_gross', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    total_allowances: bigint('total_allowances', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    total_deductions: bigint('total_deductions', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    total_net: bigint('total_net', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    version: integer('version').default(1).notNull(),
    calculated_at: timestamp('calculated_at', { withTimezone: true }),
    finalized_at: timestamp('finalized_at', { withTimezone: true }),
    paid_at: timestamp('paid_at', { withTimezone: true }),
    created_by: uuid('created_by').notNull(),
    created_at: auditTimestamp('created_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_payroll_runs_period').on(
      table.tenant_id,
      table.branch_id,
      table.period_start,
      table.period_end,
    ),
    index('idx_hrm_payroll_runs_tenant_branch_status').on(
      table.tenant_id,
      table.branch_id,
      table.status,
      table.period_start,
    ),
    check(
      'ck_hrm_payroll_runs_status',
      sql`${table.status} in ('draft', 'finalized', 'paid')`,
    ),
    check(
      'ck_hrm_payroll_runs_period',
      sql`${table.period_end} >= ${table.period_start}`,
    ),
    check('ck_hrm_payroll_runs_version', sql`${table.version} >= 1`),
    check(
      'ck_hrm_payroll_runs_totals',
      sql`${table.total_gross} >= 0 and ${table.total_allowances} >= 0 and ${table.total_deductions} >= 0 and ${table.total_net} >= 0`,
    ),
  ],
);

export const hrmPayrollItems = pgTable(
  'hrm_payroll_items',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    payroll_run_id: varchar('payroll_run_id', { length: 255 }).notNull(),
    profile_id: varchar('profile_id', { length: 255 }).notNull(),
    employee_name_snapshot: text('employee_name_snapshot').notNull(),
    employee_code_snapshot: varchar('employee_code_snapshot', { length: 255 }),
    department_id_snapshot: varchar('department_id_snapshot', { length: 255 }),
    salary_type_snapshot: varchar('salary_type_snapshot', { length: 20 }).notNull(),
    base_amount_snapshot: bigint('base_amount_snapshot', { mode: 'bigint' }).notNull(),
    work_units: numeric('work_units', { precision: 12, scale: 4 })
      .default('0')
      .notNull(),
    regular_pay: bigint('regular_pay', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    overtime_pay: bigint('overtime_pay', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    allowance_total: bigint('allowance_total', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    bonus_total: bigint('bonus_total', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    commission_total: bigint('commission_total', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    deduction_total: bigint('deduction_total', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    net_pay: bigint('net_pay', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    breakdown: jsonb('breakdown').default(sql`'{}'::jsonb`).notNull(),
    manual_note: text('manual_note'),
    updated_by: uuid('updated_by'),
    created_at: auditTimestamp('created_at'),
    updated_at: auditTimestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_payroll_items_run_profile').on(
      table.payroll_run_id,
      table.profile_id,
    ),
    index('idx_hrm_payroll_items_tenant_profile').on(
      table.tenant_id,
      table.profile_id,
      table.payroll_run_id,
    ),
    check(
      'ck_hrm_payroll_items_salary_type',
      sql`${table.salary_type_snapshot} in ('monthly', 'daily', 'hourly')`,
    ),
    check(
      'ck_hrm_payroll_items_amounts',
      sql`${table.base_amount_snapshot} >= 0 and ${table.regular_pay} >= 0 and ${table.overtime_pay} >= 0 and ${table.allowance_total} >= 0 and ${table.bonus_total} >= 0 and ${table.commission_total} >= 0 and ${table.deduction_total} >= 0 and ${table.net_pay} >= 0`,
    ),
  ],
);

export const hrmCashbookPostings = pgTable(
  'hrm_cashbook_postings',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: branchId(),
    payroll_run_id: varchar('payroll_run_id', { length: 255 }).notNull(),
    cashbook_transaction_id: varchar('cashbook_transaction_id', {
      length: 255,
    }).notNull(),
    fund_id: varchar('fund_id', { length: 255 }).notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    posted_by: uuid('posted_by').notNull(),
    posted_at: auditTimestamp('posted_at'),
  },
  (table) => [
    uniqueIndex('uq_hrm_cashbook_postings_payroll_run').on(
      table.payroll_run_id,
    ),
    uniqueIndex('uq_hrm_cashbook_postings_cashbook_transaction').on(
      table.tenant_id,
      table.cashbook_transaction_id,
    ),
    index('idx_hrm_cashbook_postings_tenant_branch_posted').on(
      table.tenant_id,
      table.branch_id,
      table.posted_at,
    ),
    check('ck_hrm_cashbook_postings_amount', sql`${table.amount} >= 0`),
  ],
);

export const hrmAuditLogs = pgTable(
  'hrm_audit_logs',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    tenant_id: tenantId(),
    branch_id: varchar('branch_id', { length: 255 }),
    actor_user_id: uuid('actor_user_id').notNull(),
    event_type: varchar('event_type', { length: 100 }).notNull(),
    entity_type: varchar('entity_type', { length: 100 }).notNull(),
    entity_id: varchar('entity_id', { length: 255 }).notNull(),
    summary: jsonb('summary').default(sql`'{}'::jsonb`).notNull(),
    created_at: auditTimestamp('created_at'),
  },
  (table) => [
    index('idx_hrm_audit_tenant_branch_created').on(
      table.tenant_id,
      table.branch_id,
      table.created_at,
    ),
    index('idx_hrm_audit_tenant_entity').on(
      table.tenant_id,
      table.entity_type,
      table.entity_id,
    ),
  ],
);
