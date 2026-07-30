import {
  createPostgresHrmRepository,
  HrmPostgresRequiredError,
  HrmSchemaNotReadyError,
  isPostgresConnectorType,
  type CreatePostgresHrmRepositoryInput,
  type PostgresHrmRepository,
} from '@oni/adapters';
import { getSupabaseAdminClient } from '../supabaseAdmin';
import { getSupabaseServerClient } from '../supabaseServer';
import { getUserPermissions } from '../permissions';
import { assertUserShopAccess } from '../shops';
import { getHrmEntitlement } from './entitlement';

export type HrmAccessErrorCode =
  | 'HRM_UNAUTHORIZED'
  | 'HRM_SHOP_NOT_FOUND'
  | 'HRM_PERMISSION_DENIED'
  | 'HRM_MODULE_NOT_ENABLED'
  | 'HRM_POSTGRES_REQUIRED'
  | 'HRM_SCHEMA_NOT_READY'
  | 'HRM_DATA_PLANE_UNAVAILABLE';

export class HrmAccessError extends Error {
  constructor(
    readonly status: number,
    readonly code: HrmAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HrmAccessError';
  }
}

export interface HrmControlPlaneContext {
  userId: string;
  tenantId: string;
  shopId: string;
  permissions: string[];
}

interface HrmShopRecord {
  id: string;
  tenant_id: string;
}

interface HrmConnectorMetadata {
  type: string;
  config: Record<string, unknown>;
}

export interface HrmAccessDependencies {
  getAuthenticatedUserId(): Promise<string | null>;
  getShop(shopId: string): Promise<HrmShopRecord | null>;
  hasShopAccess(
    userId: string,
    shopId: string,
    shop: HrmShopRecord,
  ): Promise<boolean>;
  getPermissions(
    userId: string,
    tenantId: string,
    shopId: string,
  ): Promise<string[]>;
  isHrmEnabled(tenantId: string): Promise<boolean>;
  getConnectorMetadata(tenantId: string): Promise<HrmConnectorMetadata | null>;
  createRepository(
    input: CreatePostgresHrmRepositoryInput,
  ): Promise<PostgresHrmRepository>;
}

const defaultDependencies: HrmAccessDependencies = {
  async getAuthenticatedUserId() {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    return error ? null : (data.user?.id ?? null);
  },
  async getShop(shopId) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('shops')
      .select('id, tenant_id')
      .eq('id', shopId)
      .maybeSingle();

    if (error) throw error;
    return data as HrmShopRecord | null;
  },
  hasShopAccess: assertUserShopAccess,
  getPermissions: getUserPermissions,
  async isHrmEnabled(tenantId) {
    const entitlement = await getHrmEntitlement(tenantId);
    return entitlement.enabled;
  },
  async getConnectorMetadata(tenantId) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('connectors')
      .select('type, config')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      type: data.type,
      config: (data.config ?? {}) as Record<string, unknown>,
    };
  },
  createRepository: createPostgresHrmRepository,
};

function requiredPermissionsOf(
  requiredPermission: string | string[],
): string[] {
  return Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];
}

export async function authorizeHrmControlPlane(
  shopId: string,
  requiredPermission: string | string[] = 'hrm.view',
  dependencies: HrmAccessDependencies = defaultDependencies,
): Promise<HrmControlPlaneContext> {
  const normalizedShopId = shopId.trim();
  if (!normalizedShopId) {
    throw new TypeError('shopId is required');
  }

  const userId = await dependencies.getAuthenticatedUserId();
  if (!userId) {
    throw new HrmAccessError(401, 'HRM_UNAUTHORIZED', 'Unauthorized');
  }

  const shop = await dependencies.getShop(normalizedShopId);
  if (!shop) {
    throw new HrmAccessError(
      404,
      'HRM_SHOP_NOT_FOUND',
      'Không tìm thấy chi nhánh.',
    );
  }

  const hasAccess = await dependencies.hasShopAccess(
    userId,
    normalizedShopId,
    shop,
  );
  if (!hasAccess) {
    throw new HrmAccessError(
      403,
      'HRM_PERMISSION_DENIED',
      'Bạn không có quyền truy cập chi nhánh này.',
    );
  }

  const permissions = await dependencies.getPermissions(
    userId,
    shop.tenant_id,
    normalizedShopId,
  );
  const hasRequiredPermissions = requiredPermissionsOf(requiredPermission).every(
    (permission) => permissions.includes(permission),
  );
  if (!hasRequiredPermissions) {
    throw new HrmAccessError(
      403,
      'HRM_PERMISSION_DENIED',
      'Bạn không có quyền xem dữ liệu HRM.',
    );
  }

  const enabled = await dependencies.isHrmEnabled(shop.tenant_id);
  if (!enabled) {
    throw new HrmAccessError(
      402,
      'HRM_MODULE_NOT_ENABLED',
      'Module HRM chưa được bật cho tenant này.',
    );
  }

  return {
    userId,
    tenantId: shop.tenant_id,
    shopId: normalizedShopId,
    permissions,
  };
}

function resolveConnectionUri(connector: HrmConnectorMetadata): string | undefined {
  if (connector.type === 'postgres_local') {
    return (
      process.env.LOCAL_PG_URI ??
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      process.env.PG_URI
    );
  }

  const connectionUri = connector.config.connection_uri;
  return typeof connectionUri === 'string' && connectionUri.trim()
    ? connectionUri
    : undefined;
}

export interface HrmAccessContext extends HrmControlPlaneContext {
  repository: PostgresHrmRepository;
}

export async function requireHrmAccess(
  shopId: string,
  requiredPermission: string | string[] = 'hrm.view',
  dependencies: HrmAccessDependencies = defaultDependencies,
): Promise<HrmAccessContext> {
  const controlPlane = await authorizeHrmControlPlane(
    shopId,
    requiredPermission,
    dependencies,
  );

  try {
    const connector = await dependencies.getConnectorMetadata(
      controlPlane.tenantId,
    );
    if (!connector || !isPostgresConnectorType(connector.type)) {
      throw new HrmPostgresRequiredError();
    }

    const connectionUri = resolveConnectionUri(connector);
    if (!connectionUri) {
      throw new HrmPostgresRequiredError();
    }

    const repository = await dependencies.createRepository({
      connectorType: connector.type,
      connectionUri,
      tenantId: controlPlane.tenantId,
      branchId: controlPlane.shopId,
    });

    return { ...controlPlane, repository };
  } catch (error) {
    if (error instanceof HrmPostgresRequiredError) {
      throw new HrmAccessError(
        409,
        'HRM_POSTGRES_REQUIRED',
        'HRM cần PostgreSQL connector đang hoạt động.',
      );
    }
    if (error instanceof HrmSchemaNotReadyError) {
      throw new HrmAccessError(
        503,
        'HRM_SCHEMA_NOT_READY',
        'Schema HRM trên PostgreSQL chưa sẵn sàng.',
      );
    }
    if (error instanceof HrmAccessError) throw error;

    throw new HrmAccessError(
      503,
      'HRM_DATA_PLANE_UNAVAILABLE',
      'Không thể kết nối kho dữ liệu HRM.',
    );
  }
}
