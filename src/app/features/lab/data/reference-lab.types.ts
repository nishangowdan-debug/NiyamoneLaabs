// Front-end types for the reference-lab outsourcing module.

export type ReferenceDispatchStatus =
  | 'dispatched' | 'in_transit' | 'received' | 'reported' | 'cancelled';

export interface ReferenceLab {
  id: string;
  branch_id: string | null;
  code: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  accreditation: string | null;
  default_tat_hours: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferenceDispatch {
  id: string;
  branch_id: string;
  lab_order_id: string;
  reference_lab_id: string;
  dispatch_no: string;
  status: ReferenceDispatchStatus;

  dispatched_at: string;
  dispatched_by_staff_id: string | null;
  courier_name: string | null;
  awb_number: string | null;
  expected_return_at: string | null;

  acknowledged_at: string | null;
  received_at: string | null;
  received_by_staff_id: string | null;

  reported_at: string | null;
  result_summary: string | null;
  result_pdf_url: string | null;

  cancelled_at: string | null;
  cancelled_reason: string | null;

  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Joined view used by the list — includes lab name + minimal patient/order context. */
export interface ReferenceDispatchRow extends ReferenceDispatch {
  reference_lab: { id: string; name: string; code: string } | null;
  lab_order: {
    id: string;
    sample_id: string | null;
    ordered_at: string;
    patient: { id: string; uhid: string; full_name: string | null } | null;
  } | null;
}
