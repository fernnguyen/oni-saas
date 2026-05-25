'use client'

import React from 'react'

export type TagColor = 'green' | 'red' | 'blue' | 'yellow' | 'gray' | 'purple' | 'orange' | 'indigo'

export interface TagBadgeProps {
  label: string
  color?: TagColor
  size?: 'sm' | 'md'
}

const colorClasses: Record<TagColor, string> = {
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  gray: 'bg-slate-100 text-slate-600',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  indigo: 'bg-purple-100 text-purple-600',
}

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5 rounded-md',
  md: 'text-sm px-2.5 py-1 rounded-lg',
}

const GREEN_VALUES = new Set([
  'active', 'true', 'hoạt động', 'completed', 'paid',
])
const RED_VALUES = new Set([
  'inactive', 'false', 'ngừng', 'cancelled', 'error',
])
const YELLOW_VALUES = new Set(['pending', 'draft'])
const BLUE_VALUES = new Set(['owner', 'admin', 'manager'])
const PURPLE_VALUES = new Set(['staff', 'cashier', 'sales'])
const GRAY_VALUES = new Set(['viewer', 'warehouse'])

function detectColor(label: string): TagColor {
  const normalized = label.toLowerCase()
  if (GREEN_VALUES.has(normalized)) return 'green'
  if (RED_VALUES.has(normalized)) return 'red'
  if (YELLOW_VALUES.has(normalized)) return 'yellow'
  if (BLUE_VALUES.has(normalized)) return 'blue'
  if (PURPLE_VALUES.has(normalized)) return 'purple'
  if (GRAY_VALUES.has(normalized)) return 'gray'
  return 'gray'
}

export function TagBadge({ label, color, size = 'sm' }: TagBadgeProps) {
  const resolvedColor = color ?? detectColor(label)
  return (
    <span
      className={[
        'inline-flex items-center font-medium',
        sizeClasses[size],
        colorClasses[resolvedColor],
      ].join(' ')}
    >
      {label}
    </span>
  )
}
