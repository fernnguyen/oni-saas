export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const resource_id = sp.get('resource_id')
    const employee_id = sp.get('employee_id')

    const filters: Record<string, string> = { branch_id: shopId }
    if (resource_id) filters.resource_id = resource_id
    if (employee_id) filters.employee_id = employee_id

    const result = await connector.list('housekeeping-logs', {
      page,
      limit,
      filters,
      sortDesc: true
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET housekeeping-logs')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const { action, resource_id, employee_id, employee_name, note, global_sla } = body

    if (!action) {
      return NextResponse.json({ error: 'Missing action parameter' }, { status: 400 })
    }

    if (!resource_id) {
      return NextResponse.json({ error: 'Missing resource_id parameter' }, { status: 400 })
    }

    // 1. Fetch room resource
    const room = await connector.findById('location-resources', resource_id)
    if (!room || room.branch_id !== shopId) {
      return NextResponse.json({ error: 'Room resource not found' }, { status: 404 })
    }

    const nowStr = getGMT7Time()

    if (action === 'start_cleaning') {
      // Update room status to 'cleaning'
      await connector.update('location-resources', resource_id, {
        status: 'cleaning'
      })

      const resolvedEmpName = employee_name || user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'System'
      const resolvedEmpId = employee_id || user.id || 'system'

      // Create housekeeping log
      const newLog = await connector.create('housekeeping-logs', {
        branch_id: shopId,
        resource_id,
        employee_id: resolvedEmpId,
        employee_name: resolvedEmpName,
        status: 'cleaning',
        started_at: nowStr,
        note: note || `Bắt đầu dọn phòng.`
      })

      invalidate(shopId, 'location-resources')
      invalidate(shopId, 'housekeeping-logs')

      return NextResponse.json({ success: true, log: newLog })
    } 
    
    if (action === 'finish_cleaning') {
      // Find the active cleaning log for this room
      const activeLogs = await connector.list('housekeeping-logs', {
        filters: { resource_id, status: 'cleaning', branch_id: shopId },
        limit: 1,
        sortDesc: true
      })

      let activeLog = activeLogs.data && activeLogs.data[0]
      let durationMins = 30 // Fallback
      let startedAt = nowStr

      if (activeLog) {
        startedAt = activeLog.started_at || nowStr
        const startTime = new Date(startedAt + 'Z').getTime() // parse as UTC since replace('Z') was done
        const endTime = new Date(nowStr + 'Z').getTime()
        const diffMs = endTime - startTime
        durationMins = Math.max(0, Math.round(diffMs / 60000))
      }

      // Calculate room SLA threshold
      let roomSlaLimit = 30 // default fallback
      if (global_sla) {
        const parsedGlobal = parseInt(String(global_sla), 10)
        if (!isNaN(parsedGlobal) && parsedGlobal > 0) {
          roomSlaLimit = parsedGlobal
        }
      }

      if (room.metadata) {
        try {
          const meta = typeof room.metadata === 'string' ? JSON.parse(room.metadata) : room.metadata
          if (meta && meta.sla_mins) {
            const parsedRoomSla = parseInt(String(meta.sla_mins), 10)
            if (!isNaN(parsedRoomSla) && parsedRoomSla > 0) {
              roomSlaLimit = parsedRoomSla
            }
          }
        } catch (e) {
          console.error('Failed to parse room metadata for SLA calculation:', e)
        }
      }

      const slaStatus = durationMins <= roomSlaLimit ? 'ontime' : 'overtime'

      const updatedFields: Record<string, any> = {
        status: 'completed',
        completed_at: nowStr,
        duration_mins: String(durationMins),
        sla_status: slaStatus,
        note: note || `Hoàn tất dọn dẹp. Thời gian dọn: ${durationMins} phút (${slaStatus === 'ontime' ? 'Đạt SLA' : 'Quá hạn SLA'}).`
      }

      // If we don't have active log, create a direct completed log
      let finalLog
      const resolvedEmpName = employee_name || user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'System'
      const resolvedEmpId = employee_id || user.id || 'system'

      if (activeLog) {
        finalLog = await connector.update('housekeeping-logs', activeLog.id, updatedFields)
      } else {
        finalLog = await connector.create('housekeeping-logs', {
          branch_id: shopId,
          resource_id,
          employee_id: resolvedEmpId,
          employee_name: resolvedEmpName,
          started_at: nowStr,
          ...updatedFields
        })
      }

      // Update room status to 'available'
      await connector.update('location-resources', resource_id, {
        status: 'available'
      })

      invalidate(shopId, 'location-resources')
      invalidate(shopId, 'housekeeping-logs')

      return NextResponse.json({ success: true, log: finalLog })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e) {
    return handleApiError(e, 'POST housekeeping-logs')
  }
}
