import { calculateHotelRoomBilling, HotelPricingConfig } from '../packages/core/src/hotelBillingEngine'

describe('Hotel Room Billing Engine tests', () => {
  const mockConfig: HotelPricingConfig = {
    hourly_rate: 80000,
    overnight_rate: 350000,
    daily_rate: 600000,
    standard_checkin_time: '14:00',
    standard_checkout_time: '12:00',
    early_checkin_rules: {
      enabled: true,
      rules: [
        { before_hour: '06:00', surcharge_pct: 100 },
        { before_hour: '09:00', surcharge_pct: 50 },
        { before_hour: '12:00', surcharge_pct: 30 }
      ]
    },
    late_checkout_rules: {
      enabled: true,
      rules: [
        { after_hour: '12:00', surcharge_pct: 30 },
        { after_hour: '15:00', surcharge_pct: 50 },
        { after_hour: '18:00', surcharge_pct: 100 }
      ]
    }
  }

  test('Standard stay: 1 night, no surcharges', () => {
    const checkIn = new Date('2026-06-01T14:00:00')
    const checkOut = new Date('2026-06-02T12:00:00')
    
    const result = calculateHotelRoomBilling({
      checkIn,
      checkOut,
      rentalType: 'daily',
      config: mockConfig
    })

    expect(result.baseRoomFee).toBe(600000)
    expect(result.earlyCheckInSurcharge).toBe(0)
    expect(result.lateCheckOutSurcharge).toBe(0)
    expect(result.totalRoomFee).toBe(600000)
  })

  test('Early Check-in Surcharge: check-in at 08:30 AM (+50% surcharge)', () => {
    const checkIn = new Date('2026-06-01T08:30:00')
    const checkOut = new Date('2026-06-02T12:00:00')
    
    const result = calculateHotelRoomBilling({
      checkIn,
      checkOut,
      rentalType: 'daily',
      config: mockConfig
    })

    expect(result.baseRoomFee).toBe(600000)
    expect(result.earlyCheckInSurcharge).toBe(300000) // 50% of 600,000
    expect(result.totalRoomFee).toBe(900000)
  })

  test('Late Check-out Surcharge: check-out at 16:15 PM (+100% surcharge based on after 18h or +50% after 15h)', () => {
    const checkIn = new Date('2026-06-01T14:00:00')
    const checkOut = new Date('2026-06-02T16:15:00')
    
    const result = calculateHotelRoomBilling({
      checkIn,
      checkOut,
      rentalType: 'daily',
      config: mockConfig
    })

    expect(result.baseRoomFee).toBe(600000)
    expect(result.lateCheckOutSurcharge).toBe(300000) // 50% of 600,000 for checking out after 15:00
    expect(result.totalRoomFee).toBe(900000)
  })

  test('Auditor manual override of surcharges', () => {
    const checkIn = new Date('2026-06-01T08:00:00') // Standard: +50% early check-in (300,000đ)
    const checkOut = new Date('2026-06-02T16:00:00') // Standard: +50% late check-out (300,000đ)
    
    const result = calculateHotelRoomBilling({
      checkIn,
      checkOut,
      rentalType: 'daily',
      config: mockConfig,
      overrideSurcharges: {
        earlyCheckIn: 100000, // manual discount
        lateCheckOut: 0 // completely waived
      },
      overrideReason: 'VIP khách hàng thân thiết'
    })

    expect(result.baseRoomFee).toBe(600000)
    expect(result.earlyCheckInSurcharge).toBe(100000)
    expect(result.lateCheckOutSurcharge).toBe(0)
    expect(result.totalRoomFee).toBe(700000)
    expect(result.isOverridden).toBe(true)
    expect(result.overrideReason).toBe('VIP khách hàng thân thiết')
  })
})
