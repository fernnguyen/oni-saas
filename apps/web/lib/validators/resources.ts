import { z } from 'zod'

/**
 * Resource Create schema — used when creating a new location resource (table/court/room).
 * 
 * Extended attributes are stored in the `metadata` JSONB field to support
 * industry-specific needs without schema migrations:
 * 
 * ── F&B (table) ──
 *   floor: string (tầng)
 *   min_spend: string (chi tiêu tối thiểu)
 *   is_vip: boolean
 *
 * ── Billiards / Sports (table/court) ──
 *   equipment_type: string (loại bàn: carom, pool, snooker / sân: 5v5, 7v7)
 *   surface: string (mặt sân: cỏ nhân tạo, sàn gỗ, etc.)
 *
 * ── Lodging (room) ──
 *   room_class: string (standard / deluxe / vip / suite)
 *   bed_type: string (single / double / twin / king)
 *   has_ac: boolean
 *   has_hot_water: boolean
 *   has_wifi: boolean
 *   has_window: boolean
 *   has_tv: boolean
 *   amenities: string[] (tủ lạnh, két sắt, bồn tắm, etc.)
 *   floor: string (tầng)
 *   surcharge_pct: number (phụ thu %, default 0)
 *   weekend_rate: string (giá cuối tuần, override hourly_rate)
 *   holiday_rate: string (giá lễ tết)
 *   overnight_rate: string (giá qua đêm)
 *   block_hours: number (block tối thiểu, ví dụ 2 = tối thiểu 2h)
 *   early_checkin_fee: string (phí nhận phòng sớm)
 *   late_checkout_fee: string (phí trả phòng muộn)
 *   checkin_time: string (giờ nhận phòng mặc định, HH:mm)
 *   checkout_time: string (giờ trả phòng mặc định, HH:mm)
 *   deposit_amount: string (tiền đặt cọc)
 *   extra_bed_fee: string (phí giường phụ)
 *   extra_person_fee: string (phí người thêm)
 *   max_persons: number (số người tối đa)
 *   images: string[] (URLs ảnh phòng)
 *   notes: string (ghi chú nội bộ)
 */
export const resourceCreateSchema = z.object({
  name: z.string().min(1, 'Tên không được để trống').max(100),
  type: z.enum(['table', 'court', 'room']).default('table'),
  zone: z.string().max(100).optional().default(''),
  capacity: z.string().optional().default(''),
  hourly_rate: z.string().optional().default('0'),
  sort_order: z.string().optional().default('0'),
  metadata: z.string().optional().default('{}'),
}).transform((data) => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value)
    }
  }
  // Ensure metadata is valid JSON, fallback to '{}'
  if (!result.metadata || result.metadata.trim() === '') {
    result.metadata = '{}'
  }
  // Newly created resources default to available
  result.status = 'available'
  return result
})

export const resourceUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['table', 'court', 'room']).optional(),
  status: z.enum(['available', 'occupied', 'cleaning', 'reserved', 'deleted']).optional(),
  current_order_id: z.string().optional(),
  zone: z.string().max(100).optional(),
  capacity: z.string().optional(),
  hourly_rate: z.string().optional(),
  sort_order: z.string().optional(),
  metadata: z.string().optional(),
}).transform((data) => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value)
    }
  }
  // Ensure metadata is valid JSON if present
  if (result.metadata !== undefined && result.metadata.trim() === '') {
    result.metadata = '{}'
  }
  return result
})

export type ResourceCreate = z.input<typeof resourceCreateSchema>
export type ResourceUpdate = z.input<typeof resourceUpdateSchema>
