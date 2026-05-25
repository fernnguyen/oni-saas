export interface ICacheService {
  /**
   * Lấy dữ liệu từ cache theo key.
   * Nếu không tồn tại hoặc lỗi kết nối, trả về null.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Lưu dữ liệu vào cache theo key kèm thời gian sống (TTL) tính bằng giây.
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Xóa một key cụ thể khỏi cache.
   */
  delete(key: string): Promise<void>;

  /**
   * Xóa các key khớp với biểu thức pattern (ví dụ: "oni:data:tenant_1:list:*").
   */
  deletePattern(pattern: string): Promise<void>;
}
