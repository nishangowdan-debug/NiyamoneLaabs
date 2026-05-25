import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import type {
  Branch,
  BranchUpdate,
  Permission,
  Role,
  RolePermission,
  Service,
  ServiceInsert,
  ServiceUpdate,
} from './settings.types';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private supabase = inject(SupabaseService);

  async listBranches(): Promise<Branch[]> {
    const { data, error } = await this.supabase.client
      .from('branches').select('*').order('name');
    if (error) throw error;
    return data ?? [];
  }

  async updateBranch(id: string, patch: BranchUpdate): Promise<Branch> {
    const { data, error } = await this.supabase.client
      .from('branches').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  async listServices(branchId: string): Promise<Service[]> {
    const { data, error } = await this.supabase.client
      .from('services').select('*').eq('branch_id', branchId).order('category').order('name');
    if (error) throw error;
    return data ?? [];
  }

  async addService(input: ServiceInsert): Promise<Service> {
    const { data, error } = await this.supabase.client
      .from('services').insert(input).select('*').single();
    if (error) throw error;
    return data;
  }

  async updateService(id: string, patch: ServiceUpdate): Promise<Service> {
    const { data, error } = await this.supabase.client
      .from('services').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  async deactivateService(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('services').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  }

  async reactivateService(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('services').update({ is_active: true }).eq('id', id);
    if (error) throw error;
  }

  /**
   * Seed a comprehensive lab + radiology services catalog for the active branch.
   * Idempotent: uses upsert on (branch_id, code).
   */
  async seedLabImagingCatalog(branchId: string): Promise<{ inserted: number; errors: string[] }> {
    const STARTER = [
      // ── Haematology
      ['LAB-CBC',          'Complete Blood Count (CBC)',           'lab',     30000, 0, '999316'],
      ['LAB-ESR',          'Erythrocyte Sedimentation Rate',       'lab',     15000, 0, '999316'],
      ['LAB-PT-INR',       'Prothrombin Time / INR',               'lab',     40000, 0, '999316'],
      ['LAB-APTT',         'Activated Partial Thromboplastin',     'lab',     45000, 0, '999316'],
      ['LAB-DDIMER',       'D-Dimer',                              'lab',    100000, 0, '999316'],
      ['LAB-PERIPH',       'Peripheral Smear',                     'lab',     30000, 0, '999316'],
      ['LAB-RETIC',        'Reticulocyte Count',                   'lab',     25000, 0, '999316'],
      ['LAB-BLOODGROUP',   'Blood Group & Rh Typing',              'lab',     15000, 0, '999316'],
      // ── Biochemistry
      ['LAB-FBS',          'Fasting Blood Sugar',                  'lab',     10000, 0, '999316'],
      ['LAB-PPBS',         'Post-prandial Blood Sugar',            'lab',     10000, 0, '999316'],
      ['LAB-RBS',          'Random Blood Sugar',                   'lab',     10000, 0, '999316'],
      ['LAB-HBA1C',        'HbA1c',                                'lab',     50000, 0, '999316'],
      ['LAB-LFT',          'Liver Function Test panel (LFT)',      'lab',     60000, 0, '999316'],
      ['LAB-KFT',          'Kidney Function Test panel (KFT/RFT)', 'lab',     60000, 0, '999316'],
      ['LAB-LIPID',        'Lipid Profile',                        'lab',     50000, 0, '999316'],
      ['LAB-ELECTRO',      'Electrolytes (Na/K/Cl)',               'lab',     40000, 0, '999316'],
      ['LAB-CRP',          'C-Reactive Protein',                   'lab',     40000, 0, '999316'],
      ['LAB-CALCIUM',      'Serum Calcium',                        'lab',     20000, 0, '999316'],
      ['LAB-MAGNESIUM',    'Serum Magnesium',                      'lab',     25000, 0, '999316'],
      ['LAB-URIC',         'Serum Uric Acid',                      'lab',     20000, 0, '999316'],
      ['LAB-AMYLASE',      'Serum Amylase',                        'lab',     35000, 0, '999316'],
      ['LAB-LIPASE',       'Serum Lipase',                         'lab',     40000, 0, '999316'],
      ['LAB-IRON',         'Serum Iron / TIBC',                    'lab',     45000, 0, '999316'],
      ['LAB-FERRITIN',     'Serum Ferritin',                       'lab',     65000, 0, '999316'],
      ['LAB-B12',          'Vitamin B12',                          'lab',     85000, 0, '999316'],
      ['LAB-VITD',         'Vitamin D (25-OH)',                    'lab',    140000, 0, '999316'],
      ['LAB-TROPI',        'Troponin I (qualitative)',             'lab',     80000, 0, '999316'],
      ['LAB-CPK',          'CPK-MB',                               'lab',     45000, 0, '999316'],
      ['LAB-PROBNP',       'Pro-BNP',                              'lab',    200000, 0, '999316'],
      // ── Endocrine
      ['LAB-TSH',          'Thyroid Stimulating Hormone (TSH)',    'lab',     30000, 0, '999316'],
      ['LAB-T3T4',         'T3 / T4',                              'lab',     40000, 0, '999316'],
      ['LAB-FT3FT4',       'Free T3 / Free T4',                    'lab',     60000, 0, '999316'],
      ['LAB-CORTISOL',     'Cortisol (AM)',                        'lab',     80000, 0, '999316'],
      ['LAB-PROLACTIN',    'Prolactin',                            'lab',     60000, 0, '999316'],
      ['LAB-HCG',          'Beta-hCG (quantitative)',              'lab',     65000, 0, '999316'],
      ['LAB-INSULIN',      'Insulin (fasting)',                    'lab',     80000, 0, '999316'],
      ['LAB-PSA',          'PSA (total)',                          'lab',     90000, 0, '999316'],
      // ── Microbiology / Serology
      ['LAB-URINE-RM',     'Urine Routine & Microscopy',           'lab',     12000, 0, '999316'],
      ['LAB-URINE-CS',     'Urine Culture & Sensitivity',          'lab',     45000, 0, '999316'],
      ['LAB-BLOOD-CS',     'Blood Culture & Sensitivity',          'lab',     80000, 0, '999316'],
      ['LAB-SPUTUM-CS',    'Sputum Culture & Sensitivity',         'lab',     60000, 0, '999316'],
      ['LAB-STOOL-RM',     'Stool Routine & Microscopy',           'lab',     20000, 0, '999316'],
      ['LAB-MALARIA',      'Malaria Antigen (RDT)',                'lab',     20000, 0, '999316'],
      ['LAB-DENGUE-NS1',   'Dengue NS1 Antigen',                   'lab',     50000, 0, '999316'],
      ['LAB-DENGUE-AB',    'Dengue IgM/IgG Antibody',              'lab',     70000, 0, '999316'],
      ['LAB-TYPHIDOT',     'Typhoid (Typhidot IgM/IgG)',           'lab',     40000, 0, '999316'],
      ['LAB-WIDAL',        'Widal Test',                           'lab',     20000, 0, '999316'],
      ['LAB-HIV',          'HIV I & II (Rapid)',                   'lab',     40000, 0, '999316'],
      ['LAB-HBSAG',        'HBsAg (Rapid)',                        'lab',     25000, 0, '999316'],
      ['LAB-HCV',          'Anti-HCV (Rapid)',                     'lab',     35000, 0, '999316'],
      ['LAB-VDRL',         'VDRL / RPR',                           'lab',     20000, 0, '999316'],
      ['LAB-COVID-RTPCR',  'COVID-19 RT-PCR',                      'lab',    100000, 0, '999316'],
      ['LAB-COVID-RAT',    'COVID-19 Rapid Antigen Test',          'lab',     30000, 0, '999316'],
      // ── Common panels
      ['LAB-HEALTHCHK-B',  'Basic Health Check-up Package',        'lab',    100000, 0, '999316'],
      ['LAB-HEALTHCHK-C',  'Comprehensive Health Check-up',        'lab',    250000, 0, '999316'],
      ['LAB-DIABETIC-PKG', 'Diabetic Profile Package',             'lab',    150000, 0, '999316'],
      ['LAB-CARDIAC-PKG',  'Cardiac Risk Package',                 'lab',    220000, 0, '999316'],
      ['LAB-THYROID-PKG',  'Thyroid Profile Package',              'lab',     80000, 0, '999316'],
      ['LAB-ANC-PKG',      'Antenatal Care Package',               'lab',    180000, 0, '999316'],
      ['LAB-PRE-OP',       'Pre-Operative Workup',                 'lab',    120000, 0, '999316'],
      // ── Radiology / Imaging
      ['IMG-XRAY-CHEST',     'X-ray Chest PA',                     'imaging',  30000, 0, '999316'],
      ['IMG-XRAY-CHEST-LAT', 'X-ray Chest Lateral',                'imaging',  30000, 0, '999316'],
      ['IMG-XRAY-ABD',       'X-ray Abdomen',                      'imaging',  40000, 0, '999316'],
      ['IMG-XRAY-SKULL',     'X-ray Skull',                        'imaging',  40000, 0, '999316'],
      ['IMG-XRAY-SPINE-C',   'X-ray Cervical Spine',               'imaging',  45000, 0, '999316'],
      ['IMG-XRAY-SPINE-L',   'X-ray Lumbar Spine',                 'imaging',  50000, 0, '999316'],
      ['IMG-XRAY-PELVIS',    'X-ray Pelvis',                       'imaging',  45000, 0, '999316'],
      ['IMG-XRAY-LIMB',      'X-ray Limb (per view)',              'imaging',  35000, 0, '999316'],
      ['IMG-USG-ABD',        'USG Abdomen',                        'imaging',  80000, 0, '999316'],
      ['IMG-USG-KUB',        'USG KUB',                            'imaging',  70000, 0, '999316'],
      ['IMG-USG-PELVIS',     'USG Pelvis',                         'imaging',  70000, 0, '999316'],
      ['IMG-USG-TVS',        'USG Transvaginal',                   'imaging',  90000, 0, '999316'],
      ['IMG-USG-OBS',        'USG Obstetric / Anomaly scan',       'imaging', 150000, 0, '999316'],
      ['IMG-USG-THYR',       'USG Thyroid',                        'imaging',  90000, 0, '999316'],
      ['IMG-USG-BREAST',     'USG Breast (bilateral)',             'imaging', 120000, 0, '999316'],
      ['IMG-USG-NECK',       'USG Neck / Soft tissue',             'imaging',  90000, 0, '999316'],
      ['IMG-DOPPLER-LL',     'Doppler — Lower limb venous',        'imaging', 200000, 0, '999316'],
      ['IMG-DOPPLER-CAR',    'Doppler — Carotid',                  'imaging', 250000, 0, '999316'],
      ['IMG-DOPPLER-RENAL',  'Doppler — Renal',                    'imaging', 220000, 0, '999316'],
      ['IMG-ECHO',           '2D Echocardiogram',                  'imaging', 300000, 0, '999316'],
      ['IMG-ECG',            'ECG (12-lead)',                      'imaging',  25000, 0, '999316'],
      ['IMG-TMT',            'TMT (Treadmill stress test)',        'imaging', 350000, 0, '999316'],
      ['IMG-HOLTER',         'Holter Monitor (24-hr)',             'imaging', 450000, 0, '999316'],
      ['IMG-CT-HEAD',        'CT — Head / Brain',                  'imaging', 350000, 0, '999316'],
      ['IMG-CT-CHEST',       'CT — Chest',                         'imaging', 550000, 0, '999316'],
      ['IMG-CT-ABD',         'CT — Abdomen & Pelvis',              'imaging', 700000, 0, '999316'],
      ['IMG-CT-KUB',         'CT — KUB',                           'imaging', 550000, 0, '999316'],
      ['IMG-CT-ANGIO',       'CT Angiography',                     'imaging',1000000, 0, '999316'],
      ['IMG-MRI-BRAIN',      'MRI — Brain (plain)',                'imaging', 600000, 0, '999316'],
      ['IMG-MRI-SPINE',      'MRI — Spine (per region)',           'imaging', 650000, 0, '999316'],
      ['IMG-MRI-KNEE',       'MRI — Knee',                         'imaging', 600000, 0, '999316'],
      ['IMG-MAMMO',          'Mammography (bilateral)',            'imaging', 250000, 0, '999316'],
      ['IMG-DEXA',           'DEXA Bone Density Scan',             'imaging', 350000, 0, '999316'],
      ['IMG-EEG',            'EEG',                                'imaging', 250000, 0, '999316'],
      ['IMG-PFT',            'Pulmonary Function Test',            'imaging', 150000, 0, '999316'],
    ] as const;

    const rows = STARTER.map(([code, name, category, unit_price_cents, gst_rate, hsn_sac]) => ({
      branch_id: branchId,
      code, name, category,
      unit_price_cents,
      gst_rate,
      hsn_sac,
      is_active: true,
    }));

    const errors: string[] = [];
    const { data, error } = await (this.supabase.client as any)
      .from('services')
      .upsert(rows, { onConflict: 'branch_id,code', ignoreDuplicates: false })
      .select('id');
    if (error) {
      errors.push(error.message ?? String(error));
      return { inserted: 0, errors };
    }
    return { inserted: (data ?? []).length, errors };
  }

  // ── Roles & permissions ─────────────────────────────────────────
  async listRoles(): Promise<Role[]> {
    const { data, error } = await this.supabase.client
      .from('roles').select('*').order('name');
    if (error) throw error;
    return data ?? [];
  }

  async listPermissions(): Promise<Permission[]> {
    const { data, error } = await this.supabase.client
      .from('permissions').select('*').order('slug');
    if (error) throw error;
    return data ?? [];
  }

  async listRolePermissions(): Promise<RolePermission[]> {
    const { data, error } = await this.supabase.client
      .from('role_permissions').select('*');
    if (error) throw error;
    return data ?? [];
  }

  async grantPermission(roleSlug: string, permissionSlug: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('role_permissions')
      .insert({ role_slug: roleSlug, permission_slug: permissionSlug });
    if (error) throw error;
  }

  async revokePermission(roleSlug: string, permissionSlug: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('role_permissions')
      .delete()
      .eq('role_slug', roleSlug)
      .eq('permission_slug', permissionSlug);
    if (error) throw error;
  }

  // ── Logo upload ─────────────────────────────────────────────────
  async uploadLogo(branchId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${branchId}/logo.${ext}`;
    const { error } = await this.supabase.client.storage
      .from('branch-assets')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = this.supabase.client.storage
      .from('branch-assets')
      .getPublicUrl(path);
    // Cache-bust so new logo renders immediately without hard-reload
    return `${data.publicUrl}?t=${Date.now()}`;
  }
}
