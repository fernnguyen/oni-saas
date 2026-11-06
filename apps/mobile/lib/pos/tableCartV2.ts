// Pure helpers for the mobile table cart on table sync v2 (no React / React Native imports, so
// they are unit-tested in tests/table-sync/mobileCartV2.test.ts).
//
// Root fix for absolute-quantity overwrites (plan E1–E3, mobile audit #4): the cart shown to the
// cashier is "server lines + this device's pending ops", and every edit is sent as the DIFFERENCE
// between the cart the user started from and the cart they ended with — never as absolute values.

import { projectTableLines, tableSyncLineKey, isTimeChargeProduct, type ClientTableOp } from '@oni/core';

export interface MobileCartLine {
  productId: string;
  name: string;
  price: number;
  original_price?: number;
  discount_amount?: number;
  discount_pct?: number;
  quantity: number;
  tax_rate?: string;
  input_tax_rate?: string;
  tax_group?: string;
  variant_label?: string;
  modifier_total?: number;
  modifiers?: any[];
  sku?: string;
  /** server order_items id when the line is confirmed by the server */
  _serverItemId?: string;
  /** true while some of this line's change is still queued on this device */
  _pending?: boolean;
  /** Bar/Bếp: note for the kitchen typed on the draft ("ít đá"); sent with the add, never stored */
  kitchen_note?: string;
}

export type MobileCart = Record<string, MobileCartLine>;

const parseModifiers = (raw: unknown): any[] | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/** Same key format the legacy mobile cart uses (useTableManager syncActiveTableSession) */
export function mobileCartKey(productId: string, variantLabel?: string, modifiers?: unknown): string {
  const mods = parseModifiers(modifiers);
  const modKey = mods ? `_${mods.map((m: any) => m.option || m.name || '').join(',')}` : '';
  return `${productId}${variantLabel ? `_${variantLabel}` : ''}${modKey}`;
}

const lineKeyOf = (line: Pick<MobileCartLine, 'productId' | 'variant_label' | 'modifiers'>) =>
  tableSyncLineKey(line.productId, line.variant_label || '', line.modifiers && line.modifiers.length ? line.modifiers : '');

/**
 * Cart = server lines (time charge excluded) with this device's pending ops applied on top.
 * `productLookup` optionally enriches tax fields from the local catalogue.
 */
export function v2LinesToCart(
  serverItems: Record<string, any>[],
  pendingOps: ClientTableOp[],
  productLookup?: (productId: string) => Record<string, any> | undefined
): MobileCart {
  const base = (serverItems || []).filter((it) => !isTimeChargeProduct(it.product_id, it.product_name));
  const byId = new Map(base.map((it) => [String(it.item_id || it.id || ''), it]));
  const cart: MobileCart = {};
  for (const l of projectTableLines(base, pendingOps)) {
    const orig = l.item_id ? byId.get(l.item_id) : undefined;
    const product = productLookup?.(l.product_id);
    const unitPrice = Number(orig?.unit_price ?? l.unit_price) || 0;
    const originalPrice = Number(orig?.original_price) || Number(product?.sell_price) || unitPrice;
    const modifiers = parseModifiers(l.modifiers);
    const key = mobileCartKey(l.product_id, l.variant_label, modifiers);
    const existing = cart[key];
    if (existing) {
      existing.quantity += l.qty;
      existing._pending = existing._pending || l.pending;
      continue;
    }
    cart[key] = {
      productId: l.product_id,
      name: l.product_name,
      price: unitPrice,
      original_price: originalPrice,
      discount_amount: Number(orig?.discount_amount) || Math.max(0, originalPrice - unitPrice),
      discount_pct: Number(orig?.discount_pct) || 0,
      quantity: l.qty,
      tax_rate: orig?.tax_rate || product?.tax_rate || '0',
      input_tax_rate: orig?.input_tax_rate || product?.input_tax_rate || '0',
      tax_group: orig?.tax_group || product?.tax_group || '',
      variant_label: l.variant_label || '',
      modifier_total: l.modifier_total || 0,
      ...(modifiers ? { modifiers } : {}),
      sku: orig?.sku || '',
      ...(l.item_id ? { _serverItemId: l.item_id } : {}),
      _pending: l.pending,
    };
  }
  return cart;
}

/**
 * Ops that turn `base` (the cart the user started editing from) into `next` (the cart they saved).
 * Unchanged lines produce nothing; a line edited by another device meanwhile is only moved by the
 * delta this user actually made.
 */
export function diffCartToOps(base: MobileCart, next: MobileCart): ClientTableOp[] {
  const ops: ClientTableOp[] = [];
  const keys = Array.from(new Set([...Object.keys(base || {}), ...Object.keys(next || {})]));
  for (const key of keys) {
    const before = base?.[key];
    const after = next?.[key];
    const beforeQty = Math.max(0, Number(before?.quantity) || 0);
    const afterQty = Math.max(0, Number(after?.quantity) || 0);
    if (beforeQty === afterQty) continue;
    const line = (after || before)!;
    const ref = before?._serverItemId
      ? { item_id: before._serverItemId }
      : { line_key: lineKeyOf(line) };

    if (beforeQty === 0) {
      ops.push({
        type: 'add_item',
        product_id: line.productId,
        product_name: line.name,
        unit_price: Number(line.price) || 0,
        qty: afterQty,
        sku: line.sku || '',
        variant_label: line.variant_label || '',
        modifiers: line.modifiers && line.modifiers.length ? line.modifiers : '',
        modifier_total: Number(line.modifier_total) || 0,
        tax_rate: line.tax_rate || '0',
        tax_group: line.tax_group || '',
        ...(after?.kitchen_note ? { note: after.kitchen_note } : {}),
      });
    } else if (afterQty === 0) {
      ops.push({ type: 'remove_item', ...ref });
    } else {
      const delta = afterQty - beforeQty;
      ops.push({ type: 'change_qty', ...ref, delta, ...(delta > 0 && after?.kitchen_note ? { note: after.kitchen_note } : {}) });
    }
  }
  return ops;
}

/** Sum the cart as the server will (line_total = (price + modifier_total) × qty) */
export function mobileCartSubtotal(cart: MobileCart): number {
  return Object.values(cart || {}).reduce(
    (sum, l) => sum + ((Number(l.price) || 0) + (Number(l.modifier_total) || 0)) * (Number(l.quantity) || 0),
    0
  );
}

/** Drop draft-only kitchen notes before a cart is kept as the table's state. */
export function withoutKitchenNotes(cart: MobileCart): MobileCart {
  const out: MobileCart = {};
  for (const [k, line] of Object.entries(cart || {})) {
    if (line && 'kitchen_note' in line) {
      const { kitchen_note: _drop, ...rest } = line;
      out[k] = rest;
    } else out[k] = line;
  }
  return out;
}
