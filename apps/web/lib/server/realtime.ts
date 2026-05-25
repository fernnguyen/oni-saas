import Redis from 'ioredis';
import { getSupabaseAdminClient } from './supabaseAdmin';

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
