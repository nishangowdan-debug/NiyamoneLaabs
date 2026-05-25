import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { BehaviorSubject, Observable } from 'rxjs';

export type SealCategory = 'iso' | 'nabl' | 'qa' | 'custom';

export interface SealAsset {
  name: string;
  url: string;
  category?: SealCategory;
  valid_until?: string | null;
}

export interface Accreditation {
  label: string;
  number?: string;
}

export interface FooterLayout {
  columns: 1 | 2 | 3;
  alignment: 'left' | 'center';
  show_thankyou: boolean;
  show_generated_at: boolean;
  show_qr: boolean;
  show_signatures: boolean;
}

export interface HospitalSettings {
  id?: string;
  hospital_name: string;
  hospital_address?: string;
  hospital_phone?: string;
  hospital_email?: string;
  hospital_website?: string;
  pharmacy_name: string;
  pharmacy_license?: string;
  gst_number?: string;
  registration_number?: string;
  branch_id: string;
  created_at?: string;
  updated_at?: string;

  // Optional Sree-template fields (populated by select('*') when present in DB).
  hospital_tagline?: string | null;
  logo_url?: string | null;
  customer_logo_url?: string | null;
  hospital_logo_url?: string | null;
  header_seal_urls?: SealAsset[];
  footer_seal_urls?: SealAsset[];
  accreditations?: Accreditation[];
  header_html?: string | null;
  footer_html?: string | null;
  watermark_text?: string | null;
  show_medico_legal_note?: boolean;
  receipt_footer_note?: string | null;
  receipt_terms_and_conditions?: string | null;

  // Footer builder (Settings → Print Settings)
  footer_layout?: FooterLayout;
  footer_signature_staff_ids?: string[];
  invoice_footer_note?: string | null;
  invoice_footer_terms?: string | null;
  payslip_footer_note?: string | null;
  payslip_footer_terms?: string | null;
  report_footer_note?: string | null;
  report_footer_terms?: string | null;

  lab_report_print_mode?: {
    headerMode?: 'with-header' | 'no-header';
    footerMode?: 'with-footer' | 'no-footer';
    letterheadTopMm?: number;
    letterheadBottomMm?: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class HospitalSettingsService {
  private supabase = inject(SupabaseService);
  private settingsSubject = new BehaviorSubject<HospitalSettings | null>(null);

  settings$ = this.settingsSubject.asObservable();

  async loadSettings(branchId: string): Promise<HospitalSettings> {
    try {
      // Fetch hospital_settings + the matching branch's logo_url so the invoice
      // PDF can show the logo even if only the Lab Profile (branches.logo_url)
      // has been uploaded — without requiring the user to also re-save it under
      // Lab Report Settings → Branding.
      const [{ data, error }, { data: branchRow }] = await Promise.all([
        (this.supabase as any).client
          .from('hospital_settings')
          .select('*')
          .eq('branch_id', branchId)
          .maybeSingle(),
        (this.supabase as any).client
          .from('branches')
          .select('logo_url, name, tagline, phone, email, website, gstin, address')
          .eq('id', branchId)
          .maybeSingle(),
      ]);

      if (error) throw error;

      const merged: HospitalSettings = {
        ...(data ?? {}),
        branch_id: branchId,
        logo_url: data?.logo_url || branchRow?.logo_url || null,
        hospital_logo_url: data?.hospital_logo_url || branchRow?.logo_url || null,
        // Fill basics from branches when hospital_settings doesn't carry them
        hospital_name:    data?.hospital_name    || branchRow?.name    || 'Sree Diagnostics',
        hospital_phone:   data?.hospital_phone   || branchRow?.phone   || null,
        hospital_email:   data?.hospital_email   || branchRow?.email   || null,
        hospital_website: data?.hospital_website || branchRow?.website || null,
        gst_number:       data?.gst_number       || branchRow?.gstin   || null,
      } as HospitalSettings;

      this.settingsSubject.next(merged);
      return merged;
    } catch (error) {
      const defaults: HospitalSettings = {
        hospital_name: 'Sree Diagnostics',
        hospital_address: 'High Tension Road, APIIC Colony, Bharathi Nagar, Vijayawada, Andhra Pradesh 520007',
        hospital_phone: '8008331234',
        hospital_email: 'sreediagnostics9@gmail.com',
        hospital_website: 'sreediagnostics.in',
        pharmacy_name: 'Sree Diagnostics',
        gst_number: '',
        branch_id: branchId,
      };
      this.settingsSubject.next(defaults);
      return defaults;
    }
  }

  async saveSettings(settings: HospitalSettings): Promise<HospitalSettings> {
    try {
      const { data, error } = await (this.supabase as any).client
        .from('hospital_settings')
        .upsert(settings)
        .select()
        .single();

      if (error) throw error;
      this.settingsSubject.next(data);
      return data;
    } catch (error) {
      console.error('Error saving hospital settings:', error);
      throw error;
    }
  }

  getSettings(): HospitalSettings | null {
    return this.settingsSubject.value;
  }
}
