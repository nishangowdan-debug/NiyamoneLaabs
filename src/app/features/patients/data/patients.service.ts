import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type { AllergySeverity, CareTeamRole, TablesInsert, TablesUpdate } from '../../../core/supabase/supabase.types';
import type {
  InsurancePolicy,
  InsurancePolicyInsert,
  Patient,
  PatientAllergy,
  PatientDetail,
  PatientFilters,
  PatientListResult,
} from './patients.types';

@Injectable({ providedIn: 'root' })
export class PatientsService {
  private supabase = inject(SupabaseService);

  async list(filters: PatientFilters): Promise<PatientListResult> {
    const from = filters.page * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let query = this.supabase.client
      .from('patients')
      .select('*', { count: 'exact' })
      .is('archived_at', null);

    if (filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }

    if (filters.search.trim()) {
      const term = filters.search.trim();
      query = query.or(
        `full_name.ilike.%${term}%,uhid.ilike.%${term}%,mobile.ilike.%${term}%`,
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  }

  async findByMobile(mobile: string): Promise<Patient[]> {
    const { data, error } = await this.supabase.client
      .from('patients')
      .select('*')
      .is('archived_at', null)
      .eq('mobile', mobile)
      .limit(5);
    if (error) throw error;
    return data ?? [];
  }

  async getDetail(id: string): Promise<PatientDetail> {
    const [patientResp, addrResp, allergyResp, insuranceResp, teamResp, vitalsResp] = await Promise.all([
      this.supabase.client.from('patients').select('*').eq('id', id).single(),
      this.supabase.client.from('patient_addresses').select('*').eq('patient_id', id).order('is_primary', { ascending: false }),
      this.supabase.client.from('patient_allergies').select('*').eq('patient_id', id).order('recorded_at', { ascending: false }),
      this.supabase.client.from('patient_insurance_policies').select('*').eq('patient_id', id).order('is_primary', { ascending: false }).order('valid_from', { ascending: false }),
      this.supabase.client
        .from('patient_care_team')
        .select('patient_id, staff_id, role, assigned_at, staff:staff_id(full_name, role_slug)')
        .eq('patient_id', id)
        .returns<Array<{
          patient_id: string;
          staff_id: string;
          role: CareTeamRole;
          assigned_at: string;
          staff: { full_name: string; role_slug: string } | null;
        }>>(),
      this.supabase.client
        .from('vitals')
        .select('*')
        .eq('patient_id', id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (patientResp.error) throw patientResp.error;
    if (addrResp.error) throw addrResp.error;
    if (allergyResp.error) throw allergyResp.error;
    if (insuranceResp.error) throw insuranceResp.error;
    if (teamResp.error) throw teamResp.error;
    if (vitalsResp.error) throw vitalsResp.error;

    const careTeam = (teamResp.data ?? []).map((row) => ({
      patient_id: row.patient_id,
      staff_id: row.staff_id,
      role: row.role,
      assigned_at: row.assigned_at,
      staff_full_name: row.staff?.full_name,
      staff_role: row.staff?.role_slug,
    }));

    return {
      patient: patientResp.data,
      addresses: addrResp.data ?? [],
      allergies: allergyResp.data ?? [],
      insurance: insuranceResp.data ?? [],
      careTeam,
      latestVitals: vitalsResp.data ?? null,
    };
  }

  // ── Patient profile updates ─────────────────────────────────────
  async updatePatient(id: string, patch: TablesUpdate<'patients'>): Promise<Patient> {
    const { data, error } = await this.supabase.client
      .from('patients')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  // ── Allergies CRUD ──────────────────────────────────────────────
  async addAllergy(input: {
    patientId: string;
    allergen: string;
    severity: AllergySeverity;
    reaction?: string | null;
  }): Promise<PatientAllergy> {
    const { data, error } = await (this.supabase.client as any)
      .from('patient_allergies')
      .insert({
        patient_id: input.patientId,
        allergen_name: input.allergen.trim(),
        severity: input.severity,
        reaction_description: input.reaction?.trim() || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as PatientAllergy;
  }

  async removeAllergy(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('patient_allergies')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ── Insurance CRUD ──────────────────────────────────────────────
  async addInsurance(input: Omit<InsurancePolicyInsert, 'created_by_staff_id'>): Promise<InsurancePolicy> {
    const { data, error } = await this.supabase.client
      .from('patient_insurance_policies')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async updateInsurance(id: string, patch: TablesUpdate<'patient_insurance_policies'>): Promise<InsurancePolicy> {
    const { data, error } = await this.supabase.client
      .from('patient_insurance_policies')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async removeInsurance(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('patient_insurance_policies')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async create(input: {
    patient: Omit<TablesInsert<'patients'>, 'branch_id' | 'uhid' | 'created_by_staff_id'>;
    branchId: string;
    createdByStaffId: string | null;
    address?: Omit<TablesInsert<'patient_addresses'>, 'patient_id' | 'id'>;
  }): Promise<Patient> {
    const { data, error } = await this.supabase.client
      .from('patients')
      .insert({
        ...input.patient,
        branch_id: input.branchId,
        created_by_staff_id: input.createdByStaffId,
      })
      .select('*')
      .single();
    if (error) throw error;

    if (input.address) {
      const { error: addrErr } = await this.supabase.client
        .from('patient_addresses')
        .insert({ ...input.address, patient_id: data.id });
      if (addrErr) throw addrErr;
    }

    return data;
  }

  async archive(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('patients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  /** Subscribe to inserts/updates on the patients table for the user's branch. */
  subscribe(onChange: () => void): () => void {
    const channel = this.supabase.client
      .channel('patients-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients' },
        () => onChange(),
      )
      .subscribe();
    return () => {
      this.supabase.client.removeChannel(channel);
    };
  }
}
