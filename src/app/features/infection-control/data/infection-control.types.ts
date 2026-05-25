export type HaiType =
  | 'clabsi' | 'cauti' | 'vap' | 'ssi' | 'cdi' | 'blood_stream'
  | 'uti' | 'pneumonia' | 'meningitis' | 'endometritis'
  | 'gi_infection' | 'skin_soft_tissue' | 'other';

export type OrganismClass =
  | 'gram_positive_cocci' | 'gram_positive_bacilli' | 'gram_negative_cocci' | 'gram_negative_bacilli'
  | 'mycobacterium' | 'fungal' | 'viral' | 'parasitic' | 'anaerobic' | 'unknown';

export type HaiStatus = 'suspected' | 'confirmed' | 'ruled_out' | 'closed';

export type IsolationType =
  | 'contact' | 'droplet' | 'airborne' | 'protective'
  | 'enhanced_contact' | 'combined';

export type WhoMoment =
  | 'before_patient_contact' | 'before_aseptic_task' | 'after_body_fluid_exposure'
  | 'after_patient_contact' | 'after_patient_surroundings';

export const HAI_TYPE_LABELS: Record<HaiType, string> = {
  clabsi: 'CLABSI (Central Line Bloodstream Infection)',
  cauti: 'CAUTI (Catheter-Associated UTI)',
  vap: 'VAP (Ventilator-Associated Pneumonia)',
  ssi: 'SSI (Surgical Site Infection)',
  cdi: 'CDI (C. difficile)',
  blood_stream: 'Bloodstream Infection',
  uti: 'UTI (general)',
  pneumonia: 'Pneumonia (general)',
  meningitis: 'Meningitis',
  endometritis: 'Endometritis',
  gi_infection: 'GI Infection',
  skin_soft_tissue: 'Skin / Soft tissue',
  other: 'Other',
};

export const ORGANISM_CLASS_LABELS: Record<OrganismClass, string> = {
  gram_positive_cocci: 'Gram +ve cocci',
  gram_positive_bacilli: 'Gram +ve bacilli',
  gram_negative_cocci: 'Gram -ve cocci',
  gram_negative_bacilli: 'Gram -ve bacilli',
  mycobacterium: 'Mycobacterium',
  fungal: 'Fungal',
  viral: 'Viral',
  parasitic: 'Parasitic',
  anaerobic: 'Anaerobic',
  unknown: 'Unknown',
};

export const ISOLATION_TYPE_LABELS: Record<IsolationType, string> = {
  contact: 'Contact', droplet: 'Droplet', airborne: 'Airborne',
  protective: 'Protective (reverse)', enhanced_contact: 'Enhanced Contact',
  combined: 'Combined precautions',
};

export const WHO_MOMENT_LABELS: Record<WhoMoment, string> = {
  before_patient_contact: '1 · Before patient contact',
  before_aseptic_task: '2 · Before aseptic task',
  after_body_fluid_exposure: '3 · After body fluid exposure',
  after_patient_contact: '4 · After patient contact',
  after_patient_surroundings: '5 · After patient surroundings',
};

export const HAI_STATUS_LABELS: Record<HaiStatus, string> = {
  suspected: 'Suspected', confirmed: 'Confirmed',
  ruled_out: 'Ruled out', closed: 'Closed',
};

export interface InfectionEvent {
  id: string;
  event_no: string;
  patient_id: string;
  admission_id: string | null;
  hai_type: HaiType;
  custom_name: string | null;
  onset_date: string;
  days_after_admission: number | null;
  source_device: string | null;
  device_inserted_at: string | null;
  device_removed_at: string | null;
  device_indwelling_days: number | null;
  causative_organism: string | null;
  organism_class: OrganismClass | null;
  resistance: Record<string, unknown>;
  reported_by_name: string | null;
  reported_at: string;
  investigated_at: string | null;
  root_cause_analysis: string | null;
  corrective_actions: string | null;
  status: HaiStatus;
  closed_at: string | null;
  notes: string | null;
}

export interface HandHygieneAudit {
  id: string;
  audit_date: string;
  location: string;
  ward_id: string | null;
  role_observed: string | null;
  method: string;
  moments_observed: WhoMoment[];
  opportunities_total: number;
  opportunities_complied: number;
  compliance_pct: number;
  audited_by_name: string;
  notes: string | null;
}

export interface IsolationPrecaution {
  id: string;
  patient_id: string;
  admission_id: string | null;
  isolation_type: IsolationType;
  reason: string;
  organism_suspected: string | null;
  started_at: string;
  ended_at: string | null;
  ordered_by_doctor_name: string | null;
  ended_reason: string | null;
  related_infection_id: string | null;
  notes: string | null;
  days_in_isolation?: number;
}
