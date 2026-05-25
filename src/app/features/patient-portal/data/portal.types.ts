import type { Tables } from '../../../core/supabase/supabase.types';

export type MyPatient = Tables<'patients'>;

export type MyAppointment = Tables<'appointments'> & {
  doctor_name: string | null;
};

export type MyPrescription = Tables<'prescriptions'> & {
  doctor_name: string | null;
  items: Tables<'prescription_items'>[];
};

export type LabResultWithTest = Tables<'lab_results'> & {
  test: Pick<Tables<'lab_tests'>, 'code' | 'name' | 'unit' | 'ref_min' | 'ref_max' | 'critical_low' | 'critical_high'> | null;
};

export type MyLabOrder = Tables<'lab_orders'> & {
  results: LabResultWithTest[];
};

export type MyInvoice = Tables<'invoices'> & {
  items: Tables<'invoice_items'>[];
};
