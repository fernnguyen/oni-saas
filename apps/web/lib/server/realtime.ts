import Redis from 'ioredis';
import { getNotificationEventDefinition } from '../notifications/eventCatalog';
import { getSupabaseAdminClient } from './supabaseAdmin';

// ─────────────────────────────────────────────────────────────
// Expo Push Notification Helper
// ─────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Gửi push messages lên Expo theo từng chunk 100, tự deactivate token hết hạn.
 */
async function sendChunked(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  tokens: { id: string; token: string }[],
  msg: RealtimeMessage
): Promise<void> {
  const messages = tokens.map((t) => ({
    to: t.token,
    title: msg.title,
    body: msg.content,
    data: {
      type: msg.type,
      tenantId: msg.tenantId,
      branchId: msg.branchId || null,
      ...(msg.metadata || {}),
    },
    sound: 'default' as const,
    badge: 1,
  }));

  const CHUNK_SIZE = 100;
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };

    if (process.env.EXPO_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      console.error(`❌ Expo Push API HTTP Error ${response.status}:`, await response.text());
      continue;
    }

    const result = await response.json();

    const tokensToDeactivate: string[] = [];
    if (result.data && Array.isArray(result.data)) {
      result.data.forEach((ticket: any, idx: number) => {
        if (ticket.status === 'error') {
          console.error(`❌ Expo Push Ticket Error for ${chunk[idx].to}:`, ticket.message, ticket.details);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            tokensToDeactivate.push(chunk[idx].to);
          }
        }
      });
    }

    if (tokensToDeactivate.length > 0) {
      const { error: deactivateError } = await admin
        .from('push_tokens')
        .update({ is_active: false })
        .in('token', tokensToDeactivate);

      if (deactivateError) {
        console.error('⚠️ Failed to deactivate expired push tokens:', deactivateError.message);
      } else {
        console.log(`🗑️ Deactivated ${tokensToDeactivate.length} expired push token(s).`);
      }
    }
  }
}

/**
 * Queries active push tokens matching the notification scope and sends
 * push notifications via the Expo Push API.
 * Automatically deactivates tokens that are no longer registered.
 */
async function sendExpoPushNotifications(msg: RealtimeMessage): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    let restrictToUserIds: string[] | undefined;

    const resolveRoleUserIds = async (roleCodes: string[]): Promise<string[]> => {
      const uniqueRoleCodes = Array.from(new Set(roleCodes.filter(Boolean)));
      if (uniqueRoleCodes.length === 0) return [];

      const { data: rolesData, error: rolesError } = await admin
        .from('roles')
        .select('id')
        .in('code', uniqueRoleCodes)
        .or(`is_system.eq.true,tenant_id.eq.${msg.tenantId}`);
      if (rolesError) throw rolesError;

      const roleIds = (rolesData || []).map((role) => role.id);
      if (roleIds.length === 0) return [];

      const membershipQueries = [
        admin
          .from('user_tenants')
          .select('user_id')
          .eq('tenant_id', msg.tenantId)
          .in('role_id', roleIds),
      ];
      if (msg.branchId) {
        membershipQueries.push(
          admin
            .from('user_shops')
            .select('user_id')
            .eq('shop_id', msg.branchId)
            .in('role_id', roleIds),
        );
      }

      const memberships = await Promise.all(membershipQueries);
      const membershipError = memberships.find((result) => result.error)?.error;
      if (membershipError) throw membershipError;

      return Array.from(new Set(
        memberships.flatMap((result) => (result.data || []).map((row) => row.user_id)),
      ));
    };

    // ─── system_broadcast: bypass HOÀN TOÀN mọi điều kiện lọc ───
    // Gửi thẳng tới TẤT CẢ token active của tenant, không check
    // event config, role, shop, hay bất cứ điều kiện nào khác.
    if (msg.type === 'system_broadcast') {
      let broadcastQuery = admin
        .from('push_tokens')
        .select('id, token')
        .eq('tenant_id', msg.tenantId)
        .eq('is_active', true);

      if (msg.recipientId) {
        broadcastQuery = broadcastQuery.eq('user_id', msg.recipientId);
      }

      const { data: broadcastTokens, error: broadcastError } = await broadcastQuery;

      if (broadcastError) {
        console.error('❌ [system_broadcast] Failed to query push_tokens:', broadcastError.message);
        return;
      }

      if (!broadcastTokens || broadcastTokens.length === 0) {
        console.warn(`⚠️ [system_broadcast] No active push tokens for tenant ${msg.tenantId}`);
        return;
      }

      console.log(`📣 [system_broadcast] Sending to ${broadcastTokens.length} device(s) for tenant ${msg.tenantId}`);
      await sendChunked(admin, broadcastTokens, msg);
      return;
    }

    // ─── Regular events: check shop-level event settings ───
    if (msg.branchId) {
      // Map internal lowercase types → DB uppercase event names
      let dbEventName = msg.type;
      if (msg.type === 'qr_order') dbEventName = 'QR_ORDER_CREATED';
      else if (msg.type === 'qr_session') dbEventName = 'QR_SESSION_CREATED';
      else if (msg.type === 'low_stock') dbEventName = 'LOW_STOCK';

      const { data: eventConfig } = await admin
        .from('tenant_notification_events')
        .select('is_enabled, channels_config')
        .eq('tenant_id', msg.tenantId)
        .eq('shop_id', msg.branchId)
        .eq('event_name', dbEventName)
        .maybeSingle();

      const eventDefinition = getNotificationEventDefinition(dbEventName);
      const isEnabledByDefault = eventDefinition?.defaultEnabled ?? (
        msg.type === 'purchase_approval' ||
        msg.type === 'system' ||
        msg.type === 'debt_alert'
      );

      const isEnabled = eventConfig ? eventConfig.is_enabled : isEnabledByDefault;
      if (!isEnabled) return;

      if (eventConfig) {
        const config = eventConfig.channels_config;
        if (config && typeof config === 'object') {
          const pushConfig = (config as any).push;
          if (pushConfig) {
            if (pushConfig.enabled === false) return;

            const targetRoles = pushConfig.roles;
            if (Array.isArray(targetRoles) && targetRoles.length > 0) {
              restrictToUserIds = await resolveRoleUserIds(targetRoles);
              if (restrictToUserIds.length === 0) return;
            }
          }
        }
      }
    }

    if (msg.recipientRole) {
      const roleUserIds = await resolveRoleUserIds([msg.recipientRole]);
      if (roleUserIds.length === 0) return;
      restrictToUserIds = restrictToUserIds
        ? restrictToUserIds.filter((userId) => roleUserIds.includes(userId))
        : roleUserIds;
      if (restrictToUserIds.length === 0) return;
    }

    if (msg.recipientId && restrictToUserIds && !restrictToUserIds.includes(msg.recipientId)) {
      return;
    }

    // ─── Build token query ───
    let query = admin
      .from('push_tokens')
      .select('id, token')
      .eq('tenant_id', msg.tenantId)
      .eq('is_active', true);

    if (msg.recipientId) {
      query = query.eq('user_id', msg.recipientId);
    } else if (restrictToUserIds) {
      query = query.in('user_id', restrictToUserIds);
    }

    const { data: tokens, error } = await query;

    if (error) {
      console.error('❌ Failed to query push_tokens:', error.message);
      return;
    }

    if (!tokens || tokens.length === 0) return;

    await sendChunked(admin, tokens, msg);
  } catch (err) {
    console.error('❌ sendExpoPushNotifications failed:', err);
  }
}

export interface RealtimeMessage {
  tenantId: string;
  branchId?: string;       // null = broadcast to all branches of tenant
  recipientId?: string;    // null = broadcast to all users in scope
  recipientRole?: string;  // null = broadcast to all roles (owner/admin/staff)
  type: string;            // system | order_expiring | debt_alert | return_approval | purchase_approval | low_stock
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface RealtimeAdapter {
  publish(msg: RealtimeMessage): Promise<void>;
}

/**
 * 1. Supabase Cloud Adapter (Default)
 * Writes a lightweight notification record to Supabase primary PostgreSQL.
 * This triggers Supabase Realtime automatically via Postgres Changes.
 */
export class SupabaseRealtimeAdapter implements RealtimeAdapter {
  async publish(msg: RealtimeMessage): Promise<void> {
    const admin = getSupabaseAdminClient();
    
    const { error } = await admin.from('in_app_notifications').insert({
      tenant_id: msg.tenantId,
      branch_id: msg.branchId || null,
      recipient_id: msg.recipientId || null,
      recipient_role: msg.recipientRole || null,
      type: msg.type,
      title: msg.title,
      content: msg.content,
      metadata: msg.metadata || {},
    });

    if (error) {
      throw new Error(`Supabase real-time trigger failed: ${error.message}`);
    }

    // Await sending Expo push notifications to ensure completion in serverless environments
    await sendExpoPushNotifications(msg).catch((err) =>
      console.error('⚠️ Expo push (Supabase adapter) failed:', err),
    );
  }
}

/**
 * 2. Self-Hosted Redis Pub/Sub Adapter (Optional)
 * Publishes the notification to a local Redis channel.
 * A lightweight WebSocket microservice subscribes to Redis and pushes to clients.
 */
export class RedisSocketIoAdapter implements RealtimeAdapter {
  private client: Redis | null = null;
  private isReady = false;

  constructor(redisUrl: string) {
    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
        retryStrategy: (times) => Math.min(times * 1000, 10000),
      });

      this.client.on('connect', () => {
        this.isReady = true;
        console.log('🔌 Redis Realtime Adapter connected successfully.');
      });

      this.client.on('error', (err) => {
        this.isReady = false;
        console.error('❌ Redis Realtime Adapter connection error:', err.message);
      });

      this.client.on('end', () => {
        this.isReady = false;
        console.log('🔌 Redis Realtime Adapter connection closed.');
      });
    } catch (error) {
      console.error('❌ Failed to initialize Redis Realtime Adapter client:', error);
      this.client = null;
    }
  }

  async publish(msg: RealtimeMessage): Promise<void> {
    // 1. Persist notification log to PostgreSQL for read/unread history
    try {
      const admin = getSupabaseAdminClient();
      await admin.from('in_app_notifications').insert({
        tenant_id: msg.tenantId,
        branch_id: msg.branchId || null,
        recipient_id: msg.recipientId || null,
        recipient_role: msg.recipientRole || null,
        type: msg.type,
        title: msg.title,
        content: msg.content,
        metadata: msg.metadata || {},
      });
    } catch (dbErr) {
      console.error('⚠️ DB persistence failed for Redis notification:', dbErr);
    }

    // 2. Publish realtime alert to Redis Pub/Sub
    if (!this.client || !this.isReady) {
      throw new Error('Redis client is not connected or initialized.');
    }

    const channel = `tenant:${msg.tenantId}:notifications`;
    const payload = JSON.stringify({
      ...msg,
      created_at: new Date().toISOString(),
    });

    await this.client.publish(channel, payload);

    // Await sending Expo push notifications to ensure completion in serverless environments
    await sendExpoPushNotifications(msg).catch((err) =>
      console.error('⚠️ Expo push (Redis adapter) failed:', err),
    );
  }
}

/**
 * 3. Dynamic Realtime Engine (Singleton)
 * Chooses the appropriate adapter dynamically based on env variables.
 */
export class RealtimeEngine {
  private adapter: RealtimeAdapter;

  constructor() {
    const provider = process.env.REALTIME_PROVIDER || 'supabase';
    
    if (provider === 'socketio') {
      const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      this.adapter = new RedisSocketIoAdapter(redisUrl);
    } else {
      this.adapter = new SupabaseRealtimeAdapter();
    }
  }

  /**
   * Dispatches a realtime notification event to all targeted clients.
   */
  async sendNotification(msg: RealtimeMessage): Promise<void> {
    try {
      await this.adapter.publish(msg);
    } catch (error) {
      console.error(`❌ Realtime Engine failed to send notification of type ${msg.type}:`, error);
    }
  }
}

export const realtimeEngine = new RealtimeEngine();
