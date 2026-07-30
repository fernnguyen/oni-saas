import { Pool } from 'pg';
import { PostgresHrmRepository } from './PostgresHrmRepository';
import {
  verifyHrmSchema,
  type HrmSchemaVerification,
} from './PostgresHrmSchemaVerifier';

export type HrmPostgresConnectorType = 'postgres_local' | 'postgres_remote';

export interface CreatePostgresHrmRepositoryInput {
  connectorType: string;
  connectionUri?: string;
  tenantId: string;
  branchId: string;
  pool?: Pool;
}

export class HrmPostgresRequiredError extends Error {
  readonly code = 'HRM_POSTGRES_REQUIRED';

  constructor() {
    super('HRM requires a PostgreSQL connector.');
    this.name = 'HrmPostgresRequiredError';
  }
}

export class HrmSchemaNotReadyError extends Error {
  readonly code = 'HRM_SCHEMA_NOT_READY';

  constructor() {
    super('HRM PostgreSQL schema is not ready.');
    this.name = 'HrmSchemaNotReadyError';
  }
}

const poolCache = new Map<string, Pool>();

export function isPostgresConnectorType(
  connectorType: string,
): connectorType is HrmPostgresConnectorType {
  return (
    connectorType === 'postgres_local' ||
    connectorType === 'postgres_remote'
  );
}

function getOrCreatePool(connectionUri: string): Pool {
  const cachedPool = poolCache.get(connectionUri);
  if (cachedPool) return cachedPool;

  const pool = new Pool({
    connectionString: connectionUri,
    max: 5,
  });
  poolCache.set(connectionUri, pool);
  return pool;
}

function resolvePostgresPool(
  input: Pick<
    CreatePostgresHrmRepositoryInput,
    'connectorType' | 'connectionUri' | 'pool'
  >,
): Pool {
  if (!isPostgresConnectorType(input.connectorType)) {
    throw new HrmPostgresRequiredError();
  }

  const pool =
    input.pool ??
    (input.connectionUri ? getOrCreatePool(input.connectionUri) : undefined);

  if (!pool) {
    throw new HrmPostgresRequiredError();
  }

  return pool;
}

export async function verifyPostgresHrmModule(
  input: Pick<
    CreatePostgresHrmRepositoryInput,
    'connectorType' | 'connectionUri' | 'pool'
  >,
): Promise<HrmSchemaVerification> {
  return verifyHrmSchema(resolvePostgresPool(input));
}

export async function createPostgresHrmRepository(
  input: CreatePostgresHrmRepositoryInput,
): Promise<PostgresHrmRepository> {
  const pool = resolvePostgresPool(input);

  const verification = await verifyHrmSchema(pool);
  if (!verification.ready) {
    throw new HrmSchemaNotReadyError();
  }

  return new PostgresHrmRepository(pool, {
    tenantId: input.tenantId,
    branchId: input.branchId,
  });
}
