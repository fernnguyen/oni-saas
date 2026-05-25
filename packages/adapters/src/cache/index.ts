import type { ICacheService } from './ICacheService'
import { MemoryCacheService } from './MemoryCacheService'
import { RedisCacheService } from './RedisCacheService'

export * from './ICacheService'
export * from './MemoryCacheService'
export * from './RedisCacheService'
export * from './CachedDataConnector'

let cacheServiceInstance: ICacheService | null = null

/**
 * Lấy ra thực thể Caching (Singleton) duy nhất dựa vào biến môi trường hệ thống.
 * Cực kỳ an toàn, giúp chia sẻ một kết nối Redis duy nhất trên toàn ứng dụng.
 */
export function getCacheService(): ICacheService {
  if (cacheServiceInstance) return cacheServiceInstance

  const provider = process.env.CACHE_PROVIDER || 'memory'
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

  if (provider === 'redis') {
    cacheServiceInstance = new RedisCacheService(redisUrl)
  } else {
    cacheServiceInstance = new MemoryCacheService()
  }

  return cacheServiceInstance
}

/**
 * Đóng kết nối cache và giải phóng bộ nhớ (phục vụ tắt server hoặc dọn dẹp môi trường test).
 */
export async function closeCacheService(): Promise<void> {
  if (cacheServiceInstance) {
    if (cacheServiceInstance instanceof RedisCacheService) {
      await cacheServiceInstance.close()
    }
    cacheServiceInstance = null
  }
}
