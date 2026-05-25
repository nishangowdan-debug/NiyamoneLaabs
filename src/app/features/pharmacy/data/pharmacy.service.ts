import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { TablesInsert } from '../../../core/supabase/supabase.types';
import type {
  CatalogItem,
  DispenseRecord,
  PrescriptionItem,
  RxQueueItem,
  RxQueueRow,
} from './pharmacy.types';

interface RawRow {
  id: string;
  branch_id: string;
  encounter_id: string | null;
  notes: string | null;
  patient_id: string;
  prescribed_at: string;
  prescribed_by_staff_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  patient: RxQueueRow['patient'];
  doctor: RxQueueRow['doctor'];
  items: PrescriptionItem[];
}

@Injectable({ providedIn: 'root' })
export class PharmacyService {
  private supabase = inject(SupabaseService);

  /**
   * Fetch active prescriptions with their items, patient, doctor, and per-item dispensed totals.
   * Filters out prescriptions with zero items (drafts that never had anything added).
   */
  async listActive(): Promise<RxQueueRow[]> {
    const { data: rxRows, error } = await this.supabase.client
      .from('prescriptions')
      .select(`
        id, branch_id, encounter_id, notes, patient_id, prescribed_at,
        prescribed_by_staff_id, status, created_at, updated_at,
        patient:patient_id(id, uhid, full_name, first_name, last_name, date_of_birth, gender, mobile),
        doctor:prescribed_by_staff_id(id, full_name),
        items:prescription_items(*)
      `)
      .eq('status', 'active')
      .order('prescribed_at', { ascending: false })
      .limit(50)
      .returns<RawRow[]>();
    if (error) throw error;

    const rows = rxRows ?? [];
    if (rows.length === 0) return [];

    const itemIds = rows.flatMap((r) => r.items.map((i) => i.id));
    const dispensedByItem = await this.fetchDispensedTotals(itemIds);
    const allergiesByPatient = await this.fetchAllergies(rows.map((r) => r.patient_id));

    return rows.map((r) => this.assemble(r, dispensedByItem, allergiesByPatient));
  }

  private async fetchDispensedTotals(itemIds: string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const { data, error } = await this.supabase.client
      .from('dispense_records')
      .select('prescription_item_id, qty_dispensed, status')
      .in('prescription_item_id', itemIds)
      .neq('status', 'cancelled');
    if (error) throw error;
    const map = new Map<string, number>();
    for (const row of data ?? []) {
      map.set(row.prescription_item_id, (map.get(row.prescription_item_id) ?? 0) + row.qty_dispensed);
    }
    return map;
  }

  private async fetchAllergies(patientIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (patientIds.length === 0) return map;
    const { data, error } = await (this.supabase.client as any)
      .from('patient_allergies')
      .select('patient_id, allergen_name, severity')
      .in('patient_id', patientIds)
      .in('severity', ['severe', 'life_threatening']);
    if (error) return map;
    for (const row of (data ?? []) as { patient_id: string; allergen_name: string }[]) {
      const list = map.get(row.patient_id) ?? [];
      list.push(row.allergen_name);
      map.set(row.patient_id, list);
    }
    return map;
  }

  private assemble(r: RawRow, dispensed: Map<string, number>, allergies: Map<string, string[]>): RxQueueRow {
    const items: RxQueueItem[] = r.items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((it) => {
        const dispensedQty = dispensed.get(it.id) ?? 0;
        const remainingQty = it.qty == null ? null : Math.max(0, it.qty - dispensedQty);
        const fullyDispensed = it.qty != null && remainingQty === 0;
        return { ...it, dispensedQty, remainingQty, fullyDispensed };
      });

    const totals = items.reduce(
      (acc, it) => {
        if (it.fullyDispensed) acc.fully++;
        else if (it.dispensedQty > 0) acc.partial++;
        else acc.pending++;
        return acc;
      },
      { items: items.length, fully: 0, partial: 0, pending: 0 },
    );

    return {
      id: r.id,
      branch_id: r.branch_id,
      encounter_id: r.encounter_id,
      notes: r.notes,
      patient_id: r.patient_id,
      prescribed_at: r.prescribed_at,
      prescribed_by_staff_id: r.prescribed_by_staff_id,
      status: r.status as Exclude<RxQueueRow['status'], string> | RxQueueRow['status'],
      created_at: r.created_at,
      updated_at: r.updated_at,
      patient: r.patient,
      doctor: r.doctor,
      items,
      totals,
      patientAllergies: allergies.get(r.patient_id) ?? [],
    };
  }

  async dispense(input: {
    branchId: string;
    pharmacistStaffId: string;
    prescriptionId: string;
    itemId: string;
    qty: number;
    status: 'dispensed' | 'partial';
    notes?: string;
  }): Promise<DispenseRecord> {
    const insert: TablesInsert<'dispense_records'> = {
      branch_id: input.branchId,
      pharmacist_staff_id: input.pharmacistStaffId,
      prescription_id: input.prescriptionId,
      prescription_item_id: input.itemId,
      qty_dispensed: input.qty,
      status: input.status,
      notes: input.notes ?? null,
    };
    const { data, error } = await this.supabase.client
      .from('dispense_records')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async completePrescription(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('prescriptions')
      .update({ status: 'completed' })
      .eq('id', id);
    if (error) throw error;
  }

  /** Subscribe to changes on prescriptions and dispense_records. */
  subscribe(onChange: () => void): () => void {
    const ch1 = this.supabase.client
      .channel('pharmacy-rx')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, () => onChange())
      .subscribe();
    const ch2 = this.supabase.client
      .channel('pharmacy-dispense')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispense_records' }, () => onChange())
      .subscribe();
    return () => {
      this.supabase.client.removeChannel(ch1);
      this.supabase.client.removeChannel(ch2);
    };
  }

  // ── Billing helpers ──────────────────────────────────────────────────
  /** Walk-in OP pharmacy bill: creates an invoice + dispense rows in one shot. */
  async opDispense(input: {
    patientId: string;
    doctorStaffId: string | null;
    items: { drug_name: string; strength?: string | null; qty: number; unit_price_cents: number; prescription_item_id?: string | null }[];
    notes?: string | null;
    prescriptionId?: string | null;
  }): Promise<{ invoice_id: string; invoice_number: string; total_cents: number; patient_id: string }> {
    const { data, error } = await (this.supabase.client as any).rpc('pharmacy_op_dispense', {
      p_patient_id:      input.patientId,
      p_doctor_staff_id: input.doctorStaffId,
      p_items:           input.items,
      p_notes:           input.notes ?? null,
      p_prescription_id: input.prescriptionId ?? null,
    });
    if (error) throw error;
    return data;
  }

  /** IP dispense: adds rows to admission account. Billed at discharge. */
  async ipDispense(input: {
    admissionId: string;
    items: { drug_name: string; strength?: string | null; qty: number; unit_price_cents: number; prescription_item_id?: string | null }[];
    prescriptionId?: string | null;
  }): Promise<{ admission_id: string; items_added: number; total_cents: number }> {
    const { data, error } = await (this.supabase.client as any).rpc('pharmacy_ip_dispense', {
      p_admission_id:    input.admissionId,
      p_items:           input.items,
      p_prescription_id: input.prescriptionId ?? null,
    });
    if (error) throw error;
    return data;
  }

  // ── Catalog (drugs) ──────────────────────────────────────────────────
  /** Search active medication items by generic, brand (array), name, SKU, or therapeutic class. */
  async searchCatalog(term: string, limit = 12): Promise<CatalogItem[]> {
    const t = term.trim();
    if (t.length < 1) return [];
    // Prefer the SECURITY-DEFINER RPC (handles brand_names array search).
    const { data, error } = await (this.supabase.client as any)
      .rpc('pharmacy_search_catalog', { p_term: t, p_limit: limit });
    if (error) throw error;
    return (data ?? []) as CatalogItem[];
  }

  /** Full catalog list (paginated, for the catalog grid). */
  async listCatalog(input: { search?: string; offset?: number; limit?: number } = {}): Promise<{ items: CatalogItem[]; total: number }> {
    const t = (input.search ?? '').trim();
    let q = (this.supabase.client as any)
      .from('inventory_items')
      .select('id, sku, name, generic_name, brand_names, forms, strengths, primary_use, gst_rate, default_unit_price_cents, default_unit_cost_cents, therapeutic_class', { count: 'exact' })
      .eq('category', 'medication').eq('is_active', true)
      .order('generic_name', { ascending: true });
    if (t.length) q = q.or(`generic_name.ilike.%${t}%,name.ilike.%${t}%,sku.ilike.%${t}%,therapeutic_class.ilike.%${t}%`);
    const lim = input.limit ?? 50;
    const off = input.offset ?? 0;
    q = q.range(off, off + lim - 1);
    const { data, error, count } = await q;
    if (error) throw error;
    return { items: (data ?? []) as CatalogItem[], total: count ?? 0 };
  }

  /** Patient picker for the POS page. */
  async searchPatients(term: string, limit = 8): Promise<{ id: string; uhid: string; full_name: string; mobile: string }[]> {
    const t = term.trim();
    if (t.length < 2) return [];
    const { data, error } = await this.supabase.client
      .from('patients')
      .select('id, uhid, full_name, first_name, last_name, mobile')
      .is('archived_at', null)
      .or(`full_name.ilike.%${t}%,uhid.ilike.%${t}%,mobile.ilike.%${t}%`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      id: p.id, uhid: p.uhid,
      full_name: p.full_name || `${p.first_name} ${p.last_name}`,
      mobile: p.mobile,
    }));
  }

  async listDoctors(): Promise<{ id: string; full_name: string }[]> {
    const { data, error } = await this.supabase.client
      .from('staff').select('id, full_name')
      .eq('role_slug', 'doctor').eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    return data ?? [];
  }

  /** Find the patient's open admission, if any. */
  async findActiveAdmission(patientId: string): Promise<{ id: string; admitted_at: string } | null> {
    const { data, error } = await this.supabase.client
      .from('admissions')
      .select('id, admitted_at')
      .eq('patient_id', patientId)
      .eq('status', 'active')
      .order('admitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as any) ?? null;
  }
}
