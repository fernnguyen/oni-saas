-- Migration: Add oa_notified and notified_at to qr_order_requests
-- Purpose: Track whether an OA push notification was sent for each pending order

ALTER TABLE public.qr_order_requests
  ADD COLUMN IF NOT EXISTS oa_notified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Index for fast cron job query
CREATE INDEX IF NOT EXISTS idx_qr_order_requests_pending_notify
  ON public.qr_order_requests(branch_id, status, oa_notified, created_at)
  WHERE status = 'pending' AND oa_notified = false;
