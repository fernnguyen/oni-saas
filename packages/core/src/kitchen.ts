/**
 * Bar/Bếp (kitchen & bar routing) — shared types and pure helpers.
 * See docs/KITCHEN-BAR-PLAN.md. K0 = stations + category routing only.
 */

import { getVerticalConfig } from './verticals';

export const PREP_STATION_KINDS = ['kitchen', 'bar', 'other'] as const;
export type PrepStationKind = (typeof PREP_STATION_KINDS)[number];

export const PREP_STATION_OUTPUTS = ['print', 'screen', 'both'] as const;
export type PrepStationOutput = (typeof PREP_STATION_OUTPUTS)[number];

export const PREP_STATION_KIND_LABELS: Record<PrepStationKind, string> = {
  kitchen: 'Bếp',
  bar: 'Bar / Pha chế',
  other: 'Khác',
};

export const PREP_STATION_OUTPUT_LABELS: Record<PrepStationOutput, string> = {
  print: 'In phiếu',
  screen: 'Màn hình',
  both: 'In phiếu + Màn hình',
};

export interface PrepStation {
  id: string;
  name: string;
  kind: PrepStationKind;
  output: PrepStationOutput;
  is_default: boolean;
  sort_order: number;
}

export interface PrepStationRoute {
  station_id: string;
  target_type: 'category' | 'product';
  target_id: string;
}

export interface PrepStationPreset {
  name: string;
  kind: PrepStationKind;
  output: PrepStationOutput;
  is_default: boolean;
}

/**
 * Bar/Bếp is offered to every vertical with a table/room map whose registry enables
 * `kitchen_display`; retail-like verticals (product_grid) never see it.
 */
export function isKitchenEligibleIndustry(industryType: string): boolean {
  const v = getVerticalConfig(industryType);
  return v.posLayout !== 'product_grid' && v.features.kitchen_display;
}

/** Suggested starter stations per vertical (Q3 in the plan). */
export function getPrepStationPresets(industryType: string): PrepStationPreset[] {
  if (!isKitchenEligibleIndustry(industryType)) return [];
  if (industryType === 'fnb') {
    return [
      { name: 'Bếp', kind: 'kitchen', output: 'print', is_default: true },
      { name: 'Bar', kind: 'bar', output: 'print', is_default: false },
    ];
  }
  return [{ name: 'Quầy nước', kind: 'bar', output: 'print', is_default: true }];
}

const truthy = (v: unknown) => v === true || String(v ?? '').toUpperCase() === 'TRUE';

/** Normalise a raw connector row (all strings) into a PrepStation. */
export function toPrepStation(row: Record<string, unknown>): PrepStation {
  const kind = PREP_STATION_KINDS.includes(row.kind as PrepStationKind) ? (row.kind as PrepStationKind) : 'kitchen';
  const output = PREP_STATION_OUTPUTS.includes(row.output as PrepStationOutput) ? (row.output as PrepStationOutput) : 'print';
  const sort = Number(row.sort_order);
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    kind,
    output,
    is_default: truthy(row.is_default),
    sort_order: Number.isFinite(sort) ? sort : 0,
  };
}

/**
 * Pick the station an item goes to: product route › category route › default station.
 * Returns null when the branch has no matching or default station (item is not sent).
 * Only active stations should be passed in.
 */
export function resolvePrepStation(
  item: { product_id?: string | null; category_id?: string | null },
  stations: PrepStation[],
  routes: PrepStationRoute[],
): PrepStation | null {
  if (stations.length === 0) return null;
  const byId = new Map(stations.map((s) => [s.id, s]));
  const find = (type: 'product' | 'category', id?: string | null) => {
    if (!id) return undefined;
    const r = routes.find((x) => x.target_type === type && x.target_id === id);
    return r ? byId.get(r.station_id) : undefined;
  };
  return find('product', item.product_id) ?? find('category', item.category_id) ?? stations.find((s) => s.is_default) ?? null;
}
