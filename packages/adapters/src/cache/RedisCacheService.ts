import Redis from 'ioredis'
import type { ICacheService } from './ICacheService'

/**
 * Triển khai lớp ICacheService kết nối tới Redis Server sử dụng thư viện `ioredis`.
 * Được thiết kế chịu lỗi (Fault-tolerant): Nếu Redis bị ngắt kết nối hoặc gặp sự cố,
 * dịch vụ sẽ tự động bỏ qua cache (Bypass) để ứng dụng Next.js tiếp tục chạy trực tiếp với DB.
 */
export class RedisCacheService implements ICacheService {
  private client: Redis | null = null
  private isReady = false

  constructor(redisUrl: string) {
    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true, // Hàng đợi lệnh ngoại tuyến khi mất kết nối ngắn
        retryStrategy: (times) => {
          // Thử kết nối lại sau 2s, tối đa sau 10s
          return Math.min(times * 1000, 10000)
        }
      })

      this.client.on('connect', () => {
        this.isReady = true
        console.log('🔌 Redis Cache Client connected successfully.')
      })

      this.client.on('error', (err) => {
        this.isReady = false
        console.error('❌ Redis Cache Client connection error:', err.message)
      })

      this.client.on('end', () => {
        this.isReady = false
        console.log('🔌 Redis Cache Client connection closed.')
      })
    } catch (error) {
      console.error('❌ Failed to initialize Redis client:', error)
      this.client = null
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isReady) return null

    try {
      const data = await this.client.get(key)
      if (!data) return null
      return JSON.parse(data) as T
    } catch (error) {
      console.error(`❌ Redis [GET] key error for ${key}:`, error)
      return null // Fallback: coi như Cache Miss để Next.js lấy từ DB
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isReady) return

    try {
      const serialized = JSON.stringify(value)
      if (ttlSeconds) {
        await this.client.set(key, serialized, 'EX', ttlSeconds)
      } else {
        await this.client.set(key, serialized)
      }
    } catch (error) {
      console.error(`❌ Redis [SET] key error for ${key}:`, error)
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client || !this.isReady) return

    try {
      await this.client.del(key)
    } catch (error) {
      console.error(`❌ Redis [DEL] key error for ${key}:`, error)
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    if (!this.client || !this.isReady) return

    return new Promise<void>((resolve) => {
      // Sử dụng SCAN thay thế cho KEYS * để không gây khóa single-thread của Redis
      const stream = this.client!.scanStream({
        match: pattern,
        count: 100 // Mỗi lô duyệt 100 keys để tránh treo CPU
      })

      stream.on('data', async (keys: string[]) => {
        if (keys.length > 0) {
          try {
            // Sử dụng Pipeline để xóa hàng loạt các keys trong một network round-trip
            const pipeline = this.client!.pipeline()
            keys.forEach((k) => pipeline.del(k))
            await pipeline.exec()
          } catch (err) {
            console.error(`❌ Redis deletePattern pipeline error for ${pattern}:`, err)
          }
        }
      })

      stream.on('end', () => {
        resolve()
      })

      stream.on('error', (err) => {
        console.error(`❌ Redis scanStream error for pattern ${pattern}:`, err)
        resolve() // Tiếp tục resolve để Next.js không bị treo hoặc sập
      })
    })
  }

  /** Đóng kết nối Redis (phục vụ tắt server hoặc dọn dẹp môi trường test) */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.client = null
      this.isReady = false
    }
  }
}
