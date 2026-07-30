const SAFE_DATABASE_NAME = /(?:_test|_ci)$/i;

const DEFAULT_ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]', 'postgres'];

export interface HrmTestDatabaseSafetyOptions {
  disposableConfirmation?: string;
  allowedHosts?: readonly string[];
  productionUrls?: readonly (string | undefined)[];
}

function databaseIdentity(url: URL): string {
  const port = url.port || '5432';
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  return `${url.hostname.toLowerCase()}:${port}/${databaseName}`;
}

export function assertSafeHrmTestDatabaseUrl(
  rawUrl: string | undefined,
  options: HrmTestDatabaseSafetyOptions = {},
): URL {
  if (!rawUrl) {
    throw new Error('HRM_TEST_DATABASE_URL is required for HRM integration tests.');
  }

  if (options.disposableConfirmation !== 'true') {
    throw new Error('HRM_TEST_DATABASE_DISPOSABLE=true is required for integration tests.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('HRM_TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('HRM_TEST_DATABASE_URL must use the PostgreSQL protocol.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error('HRM integration database name must end with _test or _ci.');
  }

  const allowedHosts = new Set(
    (options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS).map((host) => host.trim().toLowerCase()),
  );
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error('HRM integration database host is not allowlisted.');
  }

  const candidateIdentity = databaseIdentity(parsed);
  for (const productionUrl of options.productionUrls ?? []) {
    if (!productionUrl) continue;
    let parsedProductionUrl: URL;
    try {
      parsedProductionUrl = new URL(productionUrl);
    } catch {
      continue;
    }

    if (databaseIdentity(parsedProductionUrl) === candidateIdentity) {
      throw new Error('HRM integration database matches a configured production database.');
    }
  }

  return parsed;
}
