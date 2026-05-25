import type { Tables } from '../../../core/supabase/supabase.types';

export type Prescription = Tables<'prescriptions'>;
export type PrescriptionItem = Tables<'prescription_items'>;
export type DispenseRecord = Tables<'dispense_records'>;

export interface RxQueueItem extends PrescriptionItem {
  dispensedQty: number;
  remainingQty: number | null; // null when item.qty is null
  fullyDispensed: boolean;
}

export interface RxQueueRow extends Prescription {
  patient: {
    id: string;
    uhid: string;
    full_name: string | null;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    mobile: string;
  } | null;
  doctor: { id: string; full_name: string } | null;
  items: RxQueueItem[];
  totals: {
    items: number;
    fully: number;
    partial: number;
    pending: number;
  };
  patientAllergies: string[];
}

export type QueueFilter = 'pending' | 'partial' | 'completed' | 'all';

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  generic_name: string | null;
  brand_names: string[] | null;
  forms: string[] | null;
  strengths: string[] | null;
  primary_use: string | null;
  therapeutic_class: string | null;
  gst_rate: number;
  default_unit_price_cents: number;
  default_unit_cost_cents: number;
}

export interface PosCartItem {
  catalog_id: string | null;          // null when manually added (off-catalog)
  sku: string | null;
  drug_name: string;                  // generic + brand for display
  generic_name: string | null;
  strength: string | null;
  form: string | null;
  qty: number;
  unit_price_cents: number;
  gst_rate: number;
  line_total_cents: number;
  is_manual: boolean;
}
