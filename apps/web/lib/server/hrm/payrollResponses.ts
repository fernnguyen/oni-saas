import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  HrmPayrollRunNotFoundError,
  HrmPayrollRunStateError,
  HrmPayrollVersionConflictError,
} from '@oni/adapters';
import { HrmAccessError } from './access';
import { HrmPayrollValidationError } from './payrollService';

export function respondPayrollError(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'HRM_VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof HrmPayrollValidationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 422 },
    );
  }
  if (error instanceof HrmPayrollRunNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  if (
    error instanceof HrmPayrollRunStateError ||
    error instanceof HrmPayrollVersionConflictError
  ) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể xử lý kỳ lương.',
      },
    },
    { status: 503 },
  );
}
