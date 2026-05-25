import type {
  InventoryCategory,
  Tables,
} from '../../../core/supabase/supabase.types';

export type InventoryItem = Tables<'inventory_items'>;
export type InventoryBatch = Tables<'inventory_batches'>;
export type StockMovement = Tables<'stock_movements'>;

export interface InventoryItemView extends InventoryItem {
  batches: InventoryBatch[];
  totalOnHand: number;
  totalCostCents: number;
  earliestExpiry: string | null;        // ISO date of soonest non-expired batch with stock
  expiryDays: number | null;            // days until earliestExpiry (null if none)
  status: ItemStatus;
}

export type ItemStatus = 'in_stock' | 'low' | 'out' | 'expiring' | 'expired';

export type InventoryFilter = 'all' | 'low' | 'expiring' | 'out';

export const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  medication: 'Medication',
  disposable: 'Disposable',
  consumable: 'Consumable',
  equipment: 'Equipment',
  reagent: 'Reagent',
  other: 'Other',
};

export const CATEGORY_TONE: Record<InventoryCategory, string> = {
  medication: 'bg-info-bg text-info-fg',
  disposable: 'bg-surface-subtle text-ink-soft',
  consumable: 'bg-surface-subtle text-ink-soft',
  equipment:  'bg-warn-bg text-warn-fg',
  reagent:    'bg-good-bg text-good-fg',
  other:      'bg-surface-subtle text-ink-muted',
};
