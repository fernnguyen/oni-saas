'use client';

import React from 'react';
import { 
  Store, 
  Utensils, 
  Target, 
  Trophy, 
  Hotel, 
  Shirt, 
  Clock,
  BedDouble,
  Monitor,
  ShoppingBag,
  HelpCircle
} from 'lucide-react';
import type { IndustryType } from '@oni/core';

// Maps IndustryType keys to Lucide icons
export const INDUSTRY_ICONS: Record<IndustryType, React.ComponentType<{ className?: string }>> = {
  retail: Store,
  fnb: Utensils,
  billiards: Target,
  sports_court: Trophy,
  lodging: Hotel,
  fashion: Shirt,
  service_hourly: Clock,
};

// Maps raw resource emojis or types to Lucide icons
export const RESOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '🍽': Utensils,
  '🎱': Target,
  '🏸': Trophy,
  '🛏': BedDouble,
  '🛏️': BedDouble,
  '🖥': Monitor,
  '🛍': ShoppingBag,
};

interface IndustryIconProps {
  type: string | IndustryType;
  className?: string;
}

export function IndustryIcon({ type, className }: IndustryIconProps) {
  const IconComponent = INDUSTRY_ICONS[type as IndustryType] || HelpCircle;
  return <IconComponent className={className} />;
}

interface ResourceIconProps {
  icon: string;
  type?: string;
  className?: string;
}

export function ResourceIcon({ icon, type, className }: ResourceIconProps) {
  // Try mapping by emoji first
  if (icon && RESOURCE_ICONS[icon]) {
    const IconComponent = RESOURCE_ICONS[icon];
    return <IconComponent className={className} />;
  }

  // Fallback to type mapping
  if (type) {
    if (type === 'room') return <BedDouble className={className} />;
    if (type === 'court') return <Trophy className={className} />;
    if (type === 'table') return <Utensils className={className} />;
  }

  return <HelpCircle className={className} />;
}
