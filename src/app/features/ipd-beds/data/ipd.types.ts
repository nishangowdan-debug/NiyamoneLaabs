import type { BedAcuity, BedStatus, Tables, WardType } from '../../../core/supabase/supabase.types';

export type Ward = Tables<'wards'>;
export type Bed = Tables<'beds'>;
export type Admission = Tables<'admissions'>;
export type BedAssignment = Tables<'bed_assignments'>;

export type DischargeWorkflowStatus =
  | 'none' | 'requested' | 'nurse_handoff' | 'ready_for_billing'
  | 'insurance_processing' | 'finalized' | 'cancelled';

export const DISCHARGE_WF_TONE: Record<DischargeWorkflowStatus, { chip: string; label: string }> = {
  none:                 { chip: '',                                          label: '' },
  requested:            { chip: 'bg-warn-bg text-warn-fg',                  label: 'Discharge requested' },
  nurse_handoff:        { chip: 'bg-warn-bg text-warn-fg',                  label: 'Nurse handoff' },
  ready_for_billing:    { chip: 'bg-info-bg text-info-fg',                  label: 'Ready for billing' },
  insurance_processing: { chip: 'bg-info-bg text-info-fg',                  label: 'Insurance' },
  finalized:            { chip: 'bg-good-bg text-good-fg',                  label: 'Finalized' },
  cancelled:            { chip: 'bg-surface-subtle text-ink-muted',         label: 'Cancelled' },
};

export interface BedView extends Bed {
  ward: { id: string; code: string; name: string; ward_type: WardType };
  patient: {
    id: string; uhid: string; full_name: string | null;
    first_name: string; last_name: string;
    date_of_birth: string; gender: string; mobile: string;
  } | null;
  admission: {
    id: string;
    admitted_at: string;
    reason: string | null;
    attending_doctor_staff_id: string | null;
    discharge_workflow_status: DischargeWorkflowStatus;
    discharge_request_reason: string | null;
    discharge_requested_at: string | null;
  } | null;
  doctor: { id: string; full_name: string } | null;
}

export interface WardView extends Ward {
  beds: BedView[];
  totals: {
    total: number;
    available: number;
    occupied: number;
    cleaning: number;
    maintenance: number;
    blocked: number;
    critical: number;
    preDischarge: number;
  };
}

export const STATUS_TONE: Record<BedStatus, { card: string; chip: string; label: string }> = {
  available:   { card: 'bg-good-bg border-good-fg/30 text-good-strong',       chip: 'bg-good-bg text-good-fg',       label: 'Available' },
  occupied:    { card: 'bg-info-bg border-info-fg/30 text-info-strong',       chip: 'bg-info-bg text-info-fg',       label: 'Occupied' },
  cleaning:    { card: 'bg-surface-subtle border-border text-ink-muted',      chip: 'bg-surface-subtle text-ink-muted', label: 'Cleaning' },
  maintenance: { card: 'bg-surface-subtle border-border text-ink-muted',      chip: 'bg-surface-subtle text-ink-muted', label: 'Maintenance' },
  blocked:     { card: 'bg-surface-subtle border-border text-ink-muted line-through', chip: 'bg-surface-subtle text-ink-muted', label: 'Blocked' },
};

export const ACUITY_TONE: Record<BedAcuity, { card: string; chip: string; label: string }> = {
  stable:        { card: 'bg-info-bg border-info-fg/30 text-info-strong',     chip: 'bg-info-bg text-info-fg',       label: 'Stable' },
  watch:         { card: 'bg-warn-bg border-warn-fg/30 text-warn-strong',     chip: 'bg-warn-bg text-warn-fg',       label: 'Watch' },
  critical:      { card: 'bg-danger-bg border-danger-fg/30 text-danger-strong', chip: 'bg-danger-bg text-danger-fg', label: 'Critical' },
  pre_discharge: { card: 'bg-warn-bg border-warn-fg/30 text-warn-strong',     chip: 'bg-warn-bg text-warn-fg',       label: 'Pre-discharge' },
};
