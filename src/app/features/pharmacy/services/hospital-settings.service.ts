import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { BehaviorSubject } from 'rxjs';

export type SealCategory = 'iso' | 'nabl' | 'qa' | 'custom';

export interface SealAsset {
  name: string;
  url: string;
  category?: SealCategory;
  valid_until?: string | null;
}

export interface FooterLayout {
  columns: 1 | 2 | 3;
  alignment: 'left' | 'center';
  show_thankyou: boolean;
  show_generated_at: boolean;
  show_qr: boolean;
  show_signatures: boolean;
}

export const DEFAULT_FOOTER_LAYOUT: FooterLayout = {
  columns: 3,
  alignment: 'center',
  show_thankyou: true,
  show_generated_at: true,
  show_qr: false,
  show_signatures: true,
};

export interface InstructionSection {
  title: string;
  bullets: string[];
}

export interface Accreditation {
  label: string;
  number?: string;
}

export type PrintHeaderMode = 'with-header' | 'no-header';
export type PrintFooterMode = 'with-footer' | 'no-footer';

export interface LabReportPrintMode {
  headerMode: PrintHeaderMode;
  footerMode: PrintFooterMode;
  includeInstructions: boolean;
  includeInfographics: boolean;
  letterheadTopMm: number;
  letterheadBottomMm: number;
}

export type LabReportTemplate = 'standard' | 'sree';

export interface HospitalSettings {
  id?: string;
  branch_id: string;

  // Hospital identity
  hospital_name: string;
  hospital_tagline?: string | null;
  hospital_address_line1?: string | null;
  hospital_address_line2?: string | null;
  hospital_city?: string | null;
  hospital_state?: string | null;
  hospital_pincode?: string | null;
  hospital_country?: string | null;
  hospital_phone?: string | null;
  hospital_alt_phone?: string | null;
  hospital_email?: string | null;
  hospital_website?: string | null;
  hospital_logo_url?: string | null;

  // Pharmacy identity
  pharmacy_name: string;
  pharmacy_address?: string | null;
  pharmacy_phone?: string | null;
  pharmacy_email?: string | null;

  // Drug license
  drug_license_retail_number?: string | null;
  drug_license_wholesale_number?: string | null;
  drug_license_issuing_authority?: string | null;
  drug_license_issued_on?: string | null;
  drug_license_valid_until?: string | null;

  // Pharmacist
  pharmacist_name?: string | null;
  pharmacist_qualification?: string | null;
  pharmacist_registration_number?: string | null;
  pharmacist_registration_council?: string | null;

  // Tax & legal
  gst_number?: string | null;
  pan_number?: string | null;
  fssai_number?: string | null;
  cin_number?: string | null;
  hospital_registration_number?: string | null;

  // Bank
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  upi_id?: string | null;

  // Receipt footer
  receipt_footer_note?: string | null;
  receipt_terms_and_conditions?: string | null;

  // Lab-report branding
  logo_url?: string | null;
  customer_logo_url?: string | null;
  header_seal_urls?: SealAsset[];
  footer_seal_urls?: SealAsset[];
  header_tagline_lab?: string | null;
  header_html?: string | null;
  footer_html?: string | null;

  // Footer builder (Settings → Print Settings)
  footer_layout?: FooterLayout;
  footer_signature_staff_ids?: string[];
  invoice_footer_note?: string | null;
  invoice_footer_terms?: string | null;
  payslip_footer_note?: string | null;
  payslip_footer_terms?: string | null;
  report_footer_note?: string | null;
  report_footer_terms?: string | null;

  // Lab-report content
  general_instructions?: InstructionSection[];
  report_disclaimer?: string | null;
  terms_overleaf?: string | null;
  accreditations?: Accreditation[];

  // Lab-report print mode
  lab_report_template?: LabReportTemplate;
  lab_report_print_mode?: LabReportPrintMode;
  watermark_text?: string | null;
  show_medico_legal_note?: boolean;

  // Legacy fields (kept for backwards compat with existing PDF service)
  hospital_address?: string;
  pharmacy_license?: string;
  registration_number?: string;

  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_PRINT_MODE: LabReportPrintMode = {
  headerMode: 'with-header',
  footerMode: 'with-footer',
  includeInstructions: true,
  includeInfographics: true,
  letterheadTopMm: 38,
  letterheadBottomMm: 30,
};

export const DEFAULT_INSTRUCTIONS: InstructionSection[] = [
  {
    title: 'Follow Medical Advice',
    bullets: [
      'Please consult your physician for proper interpretation of this report.',
      'Do not start or stop any medication without medical guidance.',
    ],
  },
  {
    title: 'Maintain a Balanced Diet',
    bullets: [
      'Include fresh fruits and vegetables daily.',
      'Reduce excess salt, sugar, and oily foods.',
      'Stay hydrated (6-8 glasses of water per day unless advised otherwise).',
    ],
  },
  {
    title: 'Regular Physical Activity',
    bullets: [
      'Engage in at least 30 minutes of moderate exercise (walking, cycling, yoga, etc.) at least 5 days a week, as advised by your doctor.',
    ],
  },
  {
    title: 'Monitor Key Health Parameters',
    bullets: [
      'Check blood pressure regularly.',
      'Monitor blood sugar levels.',
      'Track weight and BMI.',
    ],
  },
  {
    title: 'Adequate Rest & Stress Management',
    bullets: [
      'Sleep 6-8 hours daily.',
      'Practice relaxation techniques like meditation or breathing exercises.',
    ],
  },
  {
    title: 'Avoid Harmful Habits',
    bullets: ['Avoid smoking and tobacco use.', 'Limit alcohol consumption.'],
  },
  {
    title: 'Periodic Health Checkups',
    bullets: [
      'Routine health screenings help detect issues early and prevent complications.',
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class HospitalSettingsService {
  private supabase = inject(SupabaseService);
  private settingsSubject = new BehaviorSubject<HospitalSettings | null>(null);
  settings$ = this.settingsSubject.asObservable();

  async loadSettings(branchId: string): Promise<HospitalSettings> {
    try {
      // Pull hospital_settings AND the matching branch's logo/identity in one
      // round-trip. Lab-profile uploads land on branches.logo_url; the lab
      // report PDF reads hospital_settings.logo_url. We merge so either path
      // populates the printed report.
      const [{ data, error }, { data: branchRow }] = await Promise.all([
        (this.supabase.client as any)
          .from('hospital_settings')
          .select('*')
          .eq('branch_id', branchId)
          .maybeSingle(),
        (this.supabase.client as any)
          .from('branches')
          .select('logo_url, name, tagline, phone, email, website, gstin, address')
          .eq('id', branchId)
          .maybeSingle(),
      ]);

      if (error) throw error;

      const base = (data ?? this.defaults(branchId)) as HospitalSettings;
      const merged: HospitalSettings = {
        ...base,
        branch_id: branchId,
        logo_url: base.logo_url || branchRow?.logo_url || null,
        hospital_logo_url: base.hospital_logo_url || branchRow?.logo_url || null,
        hospital_name:    base.hospital_name    || branchRow?.name    || 'Sree Diagnostics',
        hospital_phone:   base.hospital_phone   || branchRow?.phone   || null,
        hospital_email:   base.hospital_email   || branchRow?.email   || null,
        hospital_website: base.hospital_website || branchRow?.website || null,
        gst_number:       base.gst_number       || branchRow?.gstin   || null,
      };
      const hydrated = this.hydrate(merged);
      this.settingsSubject.next(hydrated);
      return hydrated;
    } catch {
      const defaults = this.defaults(branchId);
      this.settingsSubject.next(defaults);
      return defaults;
    }
  }

  async saveSettings(settings: HospitalSettings): Promise<HospitalSettings> {
    const payload = this.stripDerivedFields(settings);
    const { data, error } = await (this.supabase.client as any)
      .from('hospital_settings')
      .upsert(payload, { onConflict: 'branch_id' })
      .select('*')
      .single();
    if (error) throw error;
    const hydrated = this.hydrate(data as HospitalSettings);
    this.settingsSubject.next(hydrated);
    return hydrated;
  }

  getSettings(): HospitalSettings | null {
    return this.settingsSubject.value;
  }

  private defaults(branchId: string): HospitalSettings {
    return {
      branch_id: branchId,
      hospital_name: 'Sree Diagnostics',
      hospital_tagline: 'Leading the way Professionaly · Advanced Health Analytics. Simplified for You.',
      hospital_address_line1: 'High Tension Road, APIIC Colony',
      hospital_address_line2: 'Bharathi Nagar (adjacent to Anuradha Hospital)',
      hospital_city: 'Vijayawada',
      hospital_state: 'Andhra Pradesh',
      hospital_pincode: '520007',
      hospital_country: 'India',
      hospital_phone: '8008331234',
      hospital_email: 'sreediagnostics9@gmail.com',
      hospital_website: 'sreediagnostics.in',
      pharmacy_name: 'Sree Diagnostics',
      receipt_footer_note: 'Software Developed by * Vein Software Solutions',
      hospital_address: 'High Tension Road, APIIC Colony, Bharathi Nagar, Vijayawada, Andhra Pradesh 520007',
      header_seal_urls: [],
      footer_seal_urls: [],
      general_instructions: DEFAULT_INSTRUCTIONS,
      accreditations: [],
      lab_report_template: 'standard',
      lab_report_print_mode: DEFAULT_PRINT_MODE,
      show_medico_legal_note: true,
      report_disclaimer:
        'This report is intended solely for patient education and informational purposes and does not constitute a final medical diagnosis. All findings must be clinically correlated by a qualified medical practitioner. This report is not valid for medico-legal purposes.',
      terms_overleaf:
        'All investigations are limited by the sensitivity and speciality of the assay and the condition of the specimen received by the laboratory. Assay result should be interpreted only in the context of other clinical findings and the clinical status of the patient.',
    };
  }

  /** Compose `hospital_address` (single-line) and normalise new optional fields. */
  private hydrate(s: HospitalSettings): HospitalSettings {
    const parts = [
      s.hospital_address_line1,
      s.hospital_address_line2,
      s.hospital_city,
      s.hospital_state ? `${s.hospital_state}${s.hospital_pincode ? ' ' + s.hospital_pincode : ''}` : '',
    ].filter((p) => !!p && p.toString().trim().length);
    return {
      ...s,
      hospital_address: parts.join(', ') || s.hospital_address || '',
      pharmacy_license: s.drug_license_retail_number ?? s.pharmacy_license ?? '',
      registration_number: s.hospital_registration_number ?? s.registration_number ?? '',
      header_seal_urls: Array.isArray(s.header_seal_urls) ? s.header_seal_urls : [],
      footer_seal_urls: Array.isArray(s.footer_seal_urls) ? s.footer_seal_urls : [],
      general_instructions: Array.isArray(s.general_instructions) && s.general_instructions.length
        ? s.general_instructions
        : DEFAULT_INSTRUCTIONS,
      accreditations: Array.isArray(s.accreditations) ? s.accreditations : [],
      lab_report_template: (s.lab_report_template ?? 'standard') as LabReportTemplate,
      lab_report_print_mode: { ...DEFAULT_PRINT_MODE, ...(s.lab_report_print_mode ?? {}) },
      show_medico_legal_note: s.show_medico_legal_note ?? true,
    };
  }

  /** Drop fields that are computed/derived before persisting. */
  private stripDerivedFields(s: HospitalSettings): HospitalSettings {
    const { hospital_address, pharmacy_license, registration_number, created_at, updated_at, ...rest } = s as any;
    return rest;
  }
}
