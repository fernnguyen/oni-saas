export interface HrmSchemaErrorPayload {
  code: 'HRM_SCHEMA_OUTDATED';
  message: string;
}

export function getHrmSchemaError(
  error: unknown,
): HrmSchemaErrorPayload | null {
  if (!error || typeof error !== 'object') return null;

  const databaseError = error as { code?: unknown; message?: unknown };
  const message =
    typeof databaseError.message === 'string' ? databaseError.message : '';

  if (
    databaseError.code !== '42703' ||
    !message.toLowerCase().includes('disbursed_by')
  ) {
    return null;
  }

  return {
    code: 'HRM_SCHEMA_OUTDATED',
    message:
      'PostgreSQL HRM chưa có cột disbursed_by. Vui lòng chạy pnpm db:push:pg trước khi thực hiện chi tiền.',
  };
}
