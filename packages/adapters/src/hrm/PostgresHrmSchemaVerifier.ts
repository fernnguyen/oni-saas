import type { Pool } from 'pg';
import {
  HRM_EXPECTED_COLUMNS,
  HRM_EXPECTED_TABLES,
} from './schemaContract';

export interface HrmSchemaVerification {
  ready: boolean;
  missingTables: string[];
  missingColumns: string[];
}

export async function verifyHrmSchema(
  pool: Pool,
): Promise<HrmSchemaVerification> {
  const tableResult = await pool.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [HRM_EXPECTED_TABLES],
  );
  const existingTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = HRM_EXPECTED_TABLES.filter(
    (tableName) => !existingTables.has(tableName),
  );

  const columnResult = await pool.query<{
    table_name: string;
    column_name: string;
  }>(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [HRM_EXPECTED_TABLES],
  );
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of columnResult.rows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }

  const missingColumns = Object.entries(HRM_EXPECTED_COLUMNS).flatMap(
    ([tableName, expectedColumns]) => {
      if (!existingTables.has(tableName)) return [];
      const actualColumns = columnsByTable.get(tableName) ?? new Set<string>();
      return expectedColumns
        .filter((columnName) => !actualColumns.has(columnName))
        .map((columnName) => `${tableName}.${columnName}`);
    },
  );
  const ready = missingTables.length === 0 && missingColumns.length === 0;

  return {
    ready,
    missingTables: [...missingTables],
    missingColumns,
  };
}
