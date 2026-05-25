import type { IDataConnector, ListOptions, ListResult } from '../DataSource'
import type { ICacheService } from './ICacheService'
import crypto from 'crypto'

/**
 * Lớp Decorator (Wrapper) triển khai interface IDataConnector.
 * Tự động bọc ngoài bất kỳ adapter cơ sở dữ liệu thực tế nào (như Postgres/MySQL/GoogleSheets)
 * để áp dụng tính năng Caching mà không làm thay đổi hay ô nhiễm logic nghiệp vụ gốc.
 */
export class CachedDataConnector implements IDataConnector {
  // Danh sách các thực thể giao dịch có tần suất biến động cực cao, KHÔNG được phép cache để bảo vệ tính toàn vẹn dữ liệu
  private readonly EXCLUDED_ENTITIES = new Set([
    'cashbook',
    'orders',
    'order-items',
    'payments',
    'stock-movements',
    'shop-shifts',
    'fund-audits',
    'returns',
    'return-items'
  ])

  constructor(
    private readonly inner: IDataConnector,
    private readonly cache: ICacheService,
    private readonly tenantId?: string,
    private readonly branchId?: string
  ) {}

  /**
   * Tạo tiền tố Key Cache chuẩn hóa cho Tenant và Branch hiện tại.
   * Cấu trúc: oni:data:{tenant_id}:{branch_id}:{entity}:{suffix}
   */
  private getCacheKey(entity: string, suffix: string): string {
    const tId = this.tenantId || 'global'
    const bId = this.branchId || 'all'
    return `oni:data:${tId}:${bId}:${entity}:${suffix}`
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    // Nếu thuộc danh sách loại trừ -> Bỏ qua cache, truy vấn trực tiếp DB
    if (this.EXCLUDED_ENTITIES.has(entity)) {
      return this.inner.findById(entity, id)
    }

    const key = this.getCacheKey(entity, `id:${id}`)

    // 1. Đọc thử từ cache
    const cached = await this.cache.get<Record<string, string>>(key)
    if (cached) return cached

    // 2. Cache Miss -> Truy vấn dữ liệu thực tế từ Adapter gốc
    const result = await this.inner.findById(entity, id)

    // 3. Nạp lại dữ liệu vào Cache (TTL: 30 phút = 1800 giây)
    if (result) {
      await this.cache.set(key, result, 1800)
    }

    return result
  }

  async list(entity: string, options?: ListOptions): Promise<ListResult> {
    // Nếu thuộc danh sách loại trừ -> Bỏ qua cache, truy vấn trực tiếp DB
    if (this.EXCLUDED_ENTITIES.has(entity)) {
      return this.inner.list(entity, options)
    }

    // Mã hóa danh sách bộ lọc và phân trang thành mã hash duy nhất để phân biệt các truy vấn
    const optionsString = JSON.stringify(options || {})
    const optionsHash = crypto.createHash('sha256').update(optionsString).digest('hex').substring(0, 16)
    const key = this.getCacheKey(entity, `list:${optionsHash}`)

    // 1. Đọc thử từ cache
    const cached = await this.cache.get<ListResult>(key)
    if (cached) return cached

    // 2. Cache Miss -> Truy vấn danh sách từ Adapter gốc
    const result = await this.inner.list(entity, options)

    // 3. Nạp vào cache danh sách (TTL: 5 phút = 300 giây)
    if (result) {
      await this.cache.set(key, result, 300)
    }

    return result
  }

  // ─── THAO TÁC GHI: THU HỒI CACHE CHỦ ĐỘNG (CACHE INVALIDATION / EVICTION-ONLY) ───

  async create(entity: string, data: Record<string, string>): Promise<Record<string, string>> {
    // 1. Gọi adapter gốc để ghi nhận vào Database
    const result = await this.inner.create(entity, data)

    // 2. Xóa toàn bộ cache danh sách liên quan (chỉ khi thực thể đó được phép cache)
    if (!this.EXCLUDED_ENTITIES.has(entity)) {
      await this.invalidateEntityCache(entity)
    }

    return result
  }

  async update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>> {
    // 1. Gọi adapter gốc để cập nhật cơ sở dữ liệu
    const result = await this.inner.update(entity, id, data)

    // 2. Xóa toàn bộ cache danh sách và cache ID trực tiếp liên quan (chỉ khi được phép cache)
    if (!this.EXCLUDED_ENTITIES.has(entity)) {
      await this.invalidateEntityCache(entity, id)
    }

    return result
  }

  async delete(entity: string, id: string): Promise<void> {
    // 1. Gọi adapter gốc để đánh dấu xóa mềm / xóa cứng
    await this.inner.delete(entity, id)

    // 2. Xóa toàn bộ cache danh sách và cache ID trực tiếp liên quan (chỉ khi được phép cache)
    if (!this.EXCLUDED_ENTITIES.has(entity)) {
      await this.invalidateEntityCache(entity, id)
    }
  }

  async batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]> {
    // 1. Gọi adapter gốc để thực hiện ghi hàng loạt
    const results = await this.inner.batchCreate(entity, rows)

    // 2. Xóa toàn bộ cache danh sách liên quan để nạp lại chính xác (chỉ khi được phép cache)
    if (!this.EXCLUDED_ENTITIES.has(entity)) {
      await this.invalidateEntityCache(entity)
    }

    return results
  }

  /**
   * Thu hồi dọn dẹp cache thông minh theo phạm vi của Tenant hiện tại.
   * Xóa cache ID cụ thể (nếu có id) và xóa toàn bộ các key danh sách (list:*).
   */
  private async invalidateEntityCache(entity: string, id?: string): Promise<void> {
    try {
      if (id) {
        const idKey = this.getCacheKey(entity, `id:${id}`)
        await this.cache.delete(idKey)
      }

      // Xóa tất cả các kết quả phân trang, lọc danh sách của thực thể này
      const listPattern = this.getCacheKey(entity, 'list:*')
      await this.cache.deletePattern(listPattern)
    } catch (err) {
      console.error(`❌ Cache invalidation error for entity ${entity}:`, err)
    }
  }
}
