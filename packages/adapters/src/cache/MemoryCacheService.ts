import type { ICacheService } from './ICacheService'

interface CacheEntry<T> {
  value: T
  expiresAt: number | null
}

/**
 * Triển khai lớp ICacheService chạy trực tiếp trên bộ nhớ đệm RAM của ứng dụng.
 * Hỗ trợ tự động quản lý thời hạn sống (TTL) và xóa cache theo mẫu (glob-like pattern).
 */
export class MemoryCacheService implements ICacheService {
  private cache = new Map<string, CacheEntry<any>>()

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Kiểm tra thời hạn sống (TTL) của cache
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    this.cache.set(key, { value, expiresAt })
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async deletePattern(pattern: string): Promise<void> {
    // Chuyển đổi ký tự đại diện "*" thành biểu thức chính quy (Regex) để khớp chuỗi
    const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    
    for (const key of this.cache.keys()) {
      if (regexPattern.test(key)) {
        this.cache.delete(key)
      }
    }
  }

  /** Xóa toàn bộ dữ liệu cache trong bộ nhớ (phục vụ viết unit test) */
  clearAll(): void {
    this.cache.clear()
  }
}
