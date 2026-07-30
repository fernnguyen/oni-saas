import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PAGE_PATH = new URL(
  '../../../apps/web/app/t/[slug]/[branch]/hrm/page.tsx',
  import.meta.url,
);
const LANDING_PATH = new URL(
  '../../../apps/web/app/components/hrm/HrmModuleLanding.tsx',
  import.meta.url,
);
const BOUNDARY_PATH = new URL(
  '../../../apps/web/app/t/[slug]/[branch]/BranchDataPlaneBoundary.tsx',
  import.meta.url,
);

test('entitlement-ui: direct HRM route contains no connector or data-plane access', async () => {
  const source = `${await readFile(PAGE_PATH, 'utf8')}\n${await readFile(LANDING_PATH, 'utf8')}`;
  const boundarySource = await readFile(BOUNDARY_PATH, 'utf8');

  assert.doesNotMatch(source, /requireShopAccess|createConnector|PostgresConnector|hrm_/);
  assert.match(source, /data-hrm-state="locked"/);
  assert.match(source, /requestPlanUpgrade\('hrm'\)/);
  assert.match(boundarySource, /isLockedHrmPath\(pathname,\s*hrmEnabled\)/);
  assert.match(boundarySource, /return children;/);
});
