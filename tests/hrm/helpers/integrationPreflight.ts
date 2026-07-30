import { assertSafeHrmTestDatabaseUrl } from './databaseSafety';

const configuredProductionUrls = [
  process.env.LOCAL_PG_URI,
  process.env.DATABASE_URL,
  process.env.POSTGRES_URL,
  process.env.PG_URI,
];

const configuredAllowedHosts = process.env.HRM_TEST_DATABASE_ALLOWED_HOSTS
  ?.split(',')
  .map((host) => host.trim())
  .filter(Boolean);

assertSafeHrmTestDatabaseUrl(process.env.HRM_TEST_DATABASE_URL, {
  disposableConfirmation: process.env.HRM_TEST_DATABASE_DISPOSABLE,
  allowedHosts: configuredAllowedHosts,
  productionUrls: configuredProductionUrls,
});
