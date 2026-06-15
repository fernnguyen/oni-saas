import Redis from 'ioredis';
import { getSupabaseAdminClient } from './supabaseAdmin';

// ─────────────────────────────────────────────────────────────
// Expo Push Notification Helper
// ─────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Queries active push tokens matching the notification scope and sends
 * push notifications via the Expo Push API.
 * Automatically deactivates tokens that are no longer registered.
 */
async function sendExpoPushNotifications(msg: RealtimeMessage): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();

    // 1. Check shop level notification settings for this event type
    if (msg.branchId) {
      const { data: eventConfig } = await admin
        .from('tenant_notification_events')
        .select('is_enabled, channels_config')
        .eq('shop_id', msg.branchId)
        .eq('event_name', msg.type)
        .maybeSingle();

      if (eventConfig) {
        // If event is disabled globally
        if (eventConfig.is_enabled === false) return;

        const config = eventConfig.channels_config;
        if (config && typeof config === 'object') {
          const pushConfig = (config as any).push;
          if (pushConfig) {
            // If push is explicitly disabled for this event
            if (pushConfig.enabled === false) return;

            // If specific roles are targeted
            const targetRoles = pushConfig.roles;
            if (Array.isArray(targetRoles) && targetRoles.length > 0) {
              // Get role IDs for codes
              const { data: rolesData } = await admin
                .from('roles')
                .select('id')
                .in('code', targetRoles);

              const roleIds = (rolesData || []).map(r => r.id);

              if (roleIds.length > 0) {
                const { data: shopUsers } = await admin
                  .from('user_shops')
                  .select('user_id')
                  .eq('shop_id', msg.branchId)
                  .in('role_id', roleIds);

                const { data: tenantUsers } = await admin
                  .from('user_tenants')
                  .select('user_id')
                  .eq('tenant_id', msg.tenantId)
                  .in('role_id', roleIds);

                const allowedUserIds = Array.from(new Set([
                  ...(shopUsers || []).map(u => u.user_id),
                  ...(tenantUsers || []).map(u => u.user_id)
                ]));

                // If nobody has these roles, we don't send anything
                if (allowedUserIds.length === 0) return;

                // Restrict the recipient list
                if (msg.recipientId) {
                  if (!allowedUserIds.includes(msg.recipientId)) return; // Recipient doesn't have the required role
                } else {
                  // We will restrict the query below to these user IDs
                  (msg as any)._restrictToUserIds = allowedUserIds;
                }
              }
            }
          }
        }
      }
    }

    // Build query for active tokens within the tenant scope
    let query = admin
      .from('push_tokens')
      .select('id, token')
      .eq('tenant_id', msg.tenantId)
      .eq('is_active', true);

    // Narrow to specific recipient if provided
    if (msg.recipientId) {
      query = query.eq('user_id', msg.recipientId);
    } else if ((msg as any)._restrictToUserIds) {
      query = query.in('user_id', (msg as any)._restrictToUserIds);
    }

    const { data: tokens, error } = await query;

    if (error) {
      console.error('❌ Failed to query push_tokens:', error.message);
      return;
    }

    if (!tokens || tokens.length === 0) return;

    // Build Expo push messages
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

    // Expo recommends chunks of up to 100 messages
    const CHUNK_SIZE = 100;
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        console.error(`❌ Expo Push API returned ${response.status}:`, await response.text());
        continue;
      }

      const result = await response.json();

      // Deactivate tokens that are no longer registered
      const tokensToDeactivate: string[] = [];
      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((ticket: any, idx: number) => {
          if (
            ticket.status === 'error' &&
            ticket.details?.error === 'DeviceNotRegistered'
          ) {
            tokensToDeactivate.push(chunk[idx].to);
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

    // Fire-and-forget: send Expo push notifications
    sendExpoPushNotifications(msg).catch((err) =>
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
    // 1. We STILL want to persist the notification log in PostgreSQL,
    // so users can fetch their read/unread history later when they reload.
    // We write to PostgreSQL in the background.
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

    // 2. We publish the realtime alert payload to Redis Pub/Sub
    if (!this.client || !this.isReady) {
      throw new Error('Redis client is not connected or initialized.');
    }

    const channel = `tenant:${msg.tenantId}:notifications`;
    const payload = JSON.stringify({
      ...msg,
      created_at: new Date().toISOString(),
    });

    await this.client.publish(channel, payload);

    // Fire-and-forget: send Expo push notifications
    sendExpoPushNotifications(msg).catch((err) =>
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
