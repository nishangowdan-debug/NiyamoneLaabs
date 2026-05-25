export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_at: string;
          branch_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          checked_in_at: string | null;
          chief_complaint: string | null;
          completed_at: string | null;
          created_at: string;
          doctor_staff_id: string;
          duration_minutes: number;
          id: string;
          patient_id: string;
          room: string | null;
          scheduled_by_staff_id: string | null;
          status: AppointmentStatus;
          token_number: number | null;
          updated_at: string;
          visit_type: VisitType;
        };
        Insert: {
          appointment_at: string;
          branch_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          chief_complaint?: string | null;
          completed_at?: string | null;
          created_at?: string;
          doctor_staff_id: string;
          duration_minutes?: number;
          id?: string;
          patient_id: string;
          room?: string | null;
          scheduled_by_staff_id?: string | null;
          status?: AppointmentStatus;
          token_number?: number | null;
          updated_at?: string;
          visit_type?: VisitType;
        };
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>;
        Relationships: [];
      };
      admissions: {
        Row: {
          attending_doctor_staff_id: string | null;
          admitted_at: string;
          branch_id: string;
          created_at: string;
          discharged_at: string | null;
          id: string;
          notes: string | null;
          patient_id: string;
          reason: string | null;
          status: AdmissionStatus;
          updated_at: string;
        };
        Insert: {
          attending_doctor_staff_id?: string | null;
          admitted_at?: string;
          branch_id: string;
          created_at?: string;
          discharged_at?: string | null;
          id?: string;
          notes?: string | null;
          patient_id: string;
          reason?: string | null;
          status?: AdmissionStatus;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['admissions']['Insert']>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string; actor_staff_id: string | null; actor_user_id: string | null;
          branch_id: string | null; entity: string | null; entity_id: string | null;
          id: number; occurred_at: string; payload: Json;
          request_ip: unknown; user_agent: string | null;
        };
        Insert: { action: string; actor_staff_id?: string | null; actor_user_id?: string | null;
          branch_id?: string | null; entity?: string | null; entity_id?: string | null;
          id?: never; occurred_at?: string; payload?: Json; request_ip?: unknown; user_agent?: string | null; };
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>;
        Relationships: [];
      };
      bed_assignments: {
        Row: {
          admission_id: string;
          assigned_at: string;
          bed_id: string;
          id: string;
          released_at: string | null;
          released_reason: BedReleaseReason | null;
        };
        Insert: {
          admission_id: string;
          assigned_at?: string;
          bed_id: string;
          id?: string;
          released_at?: string | null;
          released_reason?: BedReleaseReason | null;
        };
        Update: Partial<Database['public']['Tables']['bed_assignments']['Insert']>;
        Relationships: [];
      };
      beds: {
        Row: {
          acuity: BedAcuity | null;
          branch_id: string;
          code: string;
          created_at: string;
          current_admission_id: string | null;
          id: string;
          notes: string | null;
          position: number;
          status: BedStatus;
          updated_at: string;
          ward_id: string;
        };
        Insert: {
          acuity?: BedAcuity | null;
          branch_id: string;
          code: string;
          created_at?: string;
          current_admission_id?: string | null;
          id?: string;
          notes?: string | null;
          position?: number;
          status?: BedStatus;
          updated_at?: string;
          ward_id: string;
        };
        Update: Partial<Database['public']['Tables']['beds']['Insert']>;
        Relationships: [];
      };
      branches: {
        Row: {
          address: Json | null;
          code: string;
          created_at: string;
          currency_code: string;
          email: string | null;
          gstin: string | null;
          id: string;
          is_active: boolean;
          logo_url: string | null;
          name: string;
          phone: string | null;
          prescription_footer: string | null;
          prescription_header: string | null;
          registration_no: string | null;
          tagline: string | null;
          tax_state: string | null;
          timezone: string;
          website: string | null;
        };
        Insert: {
          address?: Json | null;
          code: string;
          created_at?: string;
          currency_code?: string;
          email?: string | null;
          gstin?: string | null;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          name: string;
          phone?: string | null;
          prescription_footer?: string | null;
          prescription_header?: string | null;
          registration_no?: string | null;
          tagline?: string | null;
          tax_state?: string | null;
          timezone?: string;
          website?: string | null;
        };
        Update: Partial<Database['public']['Tables']['branches']['Insert']>;
        Relationships: [];
      };
      dispense_records: {
        Row: {
          branch_id: string;
          dispensed_at: string;
          id: string;
          notes: string | null;
          pharmacist_staff_id: string;
          prescription_id: string;
          prescription_item_id: string;
          qty_dispensed: number;
          status: DispenseStatus;
        };
        Insert: {
          branch_id: string;
          dispensed_at?: string;
          id?: string;
          notes?: string | null;
          pharmacist_staff_id: string;
          prescription_id: string;
          prescription_item_id: string;
          qty_dispensed: number;
          status?: DispenseStatus;
        };
        Update: Partial<Database['public']['Tables']['dispense_records']['Insert']>;
        Relationships: [];
      };
      drug_interactions: {
        Row: {
          created_at: string; drug_a: string; drug_b: string; id: string;
          message: string; severity: InteractionSeverity; source: string | null;
        };
        Insert: { created_at?: string; drug_a: string; drug_b: string; id?: string; message: string; severity: InteractionSeverity; source?: string | null; };
        Update: Partial<Database['public']['Tables']['drug_interactions']['Insert']>;
        Relationships: [];
      };
      encounters: {
        Row: {
          appointment_id: string | null; assessment: string | null; branch_id: string;
          created_at: string; doctor_staff_id: string; encounter_type: EncounterType;
          ended_at: string | null; history: string | null; id: string;
          patient_id: string; physical_examination: string | null; plan: string | null;
          presenting_complaint: string | null; started_at: string;
          status: EncounterStatus; updated_at: string;
        };
        Insert: {
          appointment_id?: string | null; assessment?: string | null; branch_id: string;
          created_at?: string; doctor_staff_id: string; encounter_type?: EncounterType;
          ended_at?: string | null; history?: string | null; id?: string;
          patient_id: string; physical_examination?: string | null; plan?: string | null;
          presenting_complaint?: string | null; started_at?: string; status?: EncounterStatus; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['encounters']['Insert']>;
        Relationships: [];
      };
      invoices: {
        Row: {
          admission_id: string | null;
          balance_cents: number;
          branch_id: string;
          cgst_cents: number;
          created_at: string;
          created_by_staff_id: string | null;
          discount_cents: number;
          due_date: string | null;
          encounter_id: string | null;
          id: string;
          igst_cents: number;
          invoice_date: string;
          invoice_number: string;
          notes: string | null;
          paid_cents: number;
          patient_id: string;
          sgst_cents: number;
          status: InvoiceStatus;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        Insert: {
          admission_id?: string | null;
          balance_cents?: number;
          branch_id: string;
          cgst_cents?: number;
          created_at?: string;
          created_by_staff_id?: string | null;
          discount_cents?: number;
          due_date?: string | null;
          encounter_id?: string | null;
          id?: string;
          igst_cents?: number;
          invoice_date?: string;
          invoice_number: string;
          notes?: string | null;
          paid_cents?: number;
          patient_id: string;
          sgst_cents?: number;
          status?: InvoiceStatus;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
        Relationships: [];
      };
      invoice_items: {
        Row: {
          cgst_cents: number;
          created_at: string;
          description: string;
          discount_cents: number;
          gst_rate: number;
          id: string;
          igst_cents: number;
          invoice_id: string;
          position: number;
          qty: number;
          related_entity_id: string | null;
          related_entity_type: string | null;
          service_id: string | null;
          sgst_cents: number;
          taxable_cents: number;
          total_cents: number;
          unit_price_cents: number;
        };
        Insert: {
          cgst_cents?: number;
          created_at?: string;
          description: string;
          discount_cents?: number;
          gst_rate?: number;
          id?: string;
          igst_cents?: number;
          invoice_id: string;
          position?: number;
          qty?: number;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          service_id?: string | null;
          sgst_cents?: number;
          taxable_cents?: number;
          total_cents?: number;
          unit_price_cents: number;
        };
        Update: Partial<Database['public']['Tables']['invoice_items']['Insert']>;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          approved_at: string | null;
          approved_by_staff_id: string | null;
          branch_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          category: VendorCategory;
          cgst_cents: number;
          created_at: string;
          created_by_staff_id: string | null;
          delivery_address: Json | null;
          discount_cents: number;
          expected_delivery_date: string | null;
          freight_cents: number;
          freight_terms: PoFreightTerms;
          id: string;
          igst_cents: number;
          notes: string | null;
          payment_method: VendorPaymentMethod | null;
          payment_terms: VendorPaymentTerms;
          po_date: string;
          po_number: string;
          po_type: PoType;
          qc_requirements: string[];
          returns_policy: PoReturnsPolicy | null;
          sent_at: string | null;
          sent_by_staff_id: string | null;
          sgst_cents: number;
          special_instructions: string | null;
          status: PoStatus;
          subtotal_cents: number;
          tds_cents: number;
          total_cents: number;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by_staff_id?: string | null;
          branch_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          category: VendorCategory;
          cgst_cents?: number;
          created_at?: string;
          created_by_staff_id?: string | null;
          delivery_address?: Json | null;
          discount_cents?: number;
          expected_delivery_date?: string | null;
          freight_cents?: number;
          freight_terms?: PoFreightTerms;
          id?: string;
          igst_cents?: number;
          notes?: string | null;
          payment_method?: VendorPaymentMethod | null;
          payment_terms?: VendorPaymentTerms;
          po_date?: string;
          po_number: string;
          po_type?: PoType;
          qc_requirements?: string[];
          returns_policy?: PoReturnsPolicy | null;
          sent_at?: string | null;
          sent_by_staff_id?: string | null;
          sgst_cents?: number;
          special_instructions?: string | null;
          status?: PoStatus;
          subtotal_cents?: number;
          tds_cents?: number;
          total_cents?: number;
          updated_at?: string;
          vendor_id: string;
        };
        Update: Partial<Database['public']['Tables']['purchase_orders']['Insert']>;
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          cgst_cents: number;
          created_at: string;
          description: string;
          discount_cents: number;
          gst_rate: number;
          id: string;
          inventory_item_id: string | null;
          po_id: string;
          position: number;
          qty_ordered: number;
          qty_received: number;
          sgst_cents: number;
          taxable_cents: number;
          total_cents: number;
          unit_price_cents: number;
          uom: string;
        };
        Insert: {
          cgst_cents?: number;
          created_at?: string;
          description: string;
          discount_cents?: number;
          gst_rate?: number;
          id?: string;
          inventory_item_id?: string | null;
          po_id: string;
          position?: number;
          qty_ordered: number;
          qty_received?: number;
          sgst_cents?: number;
          taxable_cents?: number;
          total_cents?: number;
          unit_price_cents: number;
          uom?: string;
        };
        Update: Partial<Database['public']['Tables']['purchase_order_items']['Insert']>;
        Relationships: [];
      };
      goods_receipts: {
        Row: {
          branch_id: string;
          created_at: string;
          grn_number: string;
          id: string;
          notes: string | null;
          po_id: string;
          qc_notes: string | null;
          qc_status: GrnQcStatus;
          received_at: string;
          received_by_staff_id: string | null;
          status: GrnStatus;
          updated_at: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          grn_number: string;
          id?: string;
          notes?: string | null;
          po_id: string;
          qc_notes?: string | null;
          qc_status?: GrnQcStatus;
          received_at?: string;
          received_by_staff_id?: string | null;
          status?: GrnStatus;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goods_receipts']['Insert']>;
        Relationships: [];
      };
      goods_receipt_items: {
        Row: {
          batch_number: string | null;
          condition: GrnCondition;
          created_at: string;
          description: string;
          expiry_date: string | null;
          grn_id: string;
          id: string;
          inventory_item_id: string | null;
          mfg_date: string | null;
          notes: string | null;
          po_item_id: string;
          qty_received: number;
          unit_cost_cents: number;
          uom: string;
        };
        Insert: {
          batch_number?: string | null;
          condition?: GrnCondition;
          created_at?: string;
          description: string;
          expiry_date?: string | null;
          grn_id: string;
          id?: string;
          inventory_item_id?: string | null;
          mfg_date?: string | null;
          notes?: string | null;
          po_item_id: string;
          qty_received: number;
          unit_cost_cents?: number;
          uom?: string;
        };
        Update: Partial<Database['public']['Tables']['goods_receipt_items']['Insert']>;
        Relationships: [];
      };
      vendor_bills: {
        Row: {
          approved_at: string | null;
          approved_by_staff_id: string | null;
          bill_date: string;
          bill_number_internal: string;
          branch_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cgst_cents: number;
          created_at: string;
          created_by_staff_id: string | null;
          discount_cents: number;
          due_date: string;
          freight_cents: number;
          id: string;
          igst_cents: number;
          match_status: VendorBillMatchStatus;
          matched_total_cents: number;
          notes: string | null;
          paid_in_full_at: string | null;
          paid_total_cents: number;
          payment_method: string | null;
          payment_terms: string;
          po_id: string | null;
          received_date: string;
          sgst_cents: number;
          status: VendorBillStatus;
          subtotal_cents: number;
          tds_cents: number;
          total_cents: number;
          updated_at: string;
          variance_cents: number;
          variance_pct: number;
          vendor_bill_number: string;
          vendor_id: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by_staff_id?: string | null;
          bill_date: string;
          bill_number_internal: string;
          branch_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cgst_cents?: number;
          created_at?: string;
          created_by_staff_id?: string | null;
          discount_cents?: number;
          due_date: string;
          freight_cents?: number;
          id?: string;
          igst_cents?: number;
          match_status?: VendorBillMatchStatus;
          matched_total_cents?: number;
          notes?: string | null;
          paid_in_full_at?: string | null;
          paid_total_cents?: number;
          payment_method?: string | null;
          payment_terms?: string;
          po_id?: string | null;
          received_date?: string;
          sgst_cents?: number;
          status?: VendorBillStatus;
          subtotal_cents?: number;
          tds_cents?: number;
          total_cents?: number;
          updated_at?: string;
          variance_cents?: number;
          variance_pct?: number;
          vendor_bill_number: string;
          vendor_id: string;
        };
        Update: Partial<Database['public']['Tables']['vendor_bills']['Insert']>;
        Relationships: [];
      };
      vendor_bill_items: {
        Row: {
          bill_id: string;
          cgst_cents: number;
          created_at: string;
          description: string;
          discount_cents: number;
          gst_rate: number;
          id: string;
          po_item_id: string | null;
          po_qty_received_at_bill: number | null;
          po_unit_price_cents: number | null;
          position: number;
          qty_billed: number;
          sgst_cents: number;
          taxable_cents: number;
          total_cents: number;
          unit_price_cents: number;
          uom: string;
        };
        Insert: {
          bill_id: string;
          cgst_cents?: number;
          created_at?: string;
          description: string;
          discount_cents?: number;
          gst_rate?: number;
          id?: string;
          po_item_id?: string | null;
          po_qty_received_at_bill?: number | null;
          po_unit_price_cents?: number | null;
          position?: number;
          qty_billed: number;
          sgst_cents?: number;
          taxable_cents?: number;
          total_cents?: number;
          unit_price_cents: number;
          uom?: string;
        };
        Update: Partial<Database['public']['Tables']['vendor_bill_items']['Insert']>;
        Relationships: [];
      };
      vendor_debit_notes: {
        Row: {
          applied_at: string | null;
          applied_by_staff_id: string | null;
          applied_to_bill_id: string | null;
          applied_to_payment_id: string | null;
          bill_id: string | null;
          branch_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cgst_cents: number;
          created_at: string;
          created_by_staff_id: string | null;
          dn_date: string;
          dn_number: string;
          grn_id: string | null;
          id: string;
          notes: string | null;
          reason: string;
          sgst_cents: number;
          status: DebitNoteStatus;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          applied_at?: string | null;
          applied_by_staff_id?: string | null;
          applied_to_bill_id?: string | null;
          applied_to_payment_id?: string | null;
          bill_id?: string | null;
          branch_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cgst_cents?: number;
          created_at?: string;
          created_by_staff_id?: string | null;
          dn_date?: string;
          dn_number: string;
          grn_id?: string | null;
          id?: string;
          notes?: string | null;
          reason: string;
          sgst_cents?: number;
          status?: DebitNoteStatus;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
          vendor_id: string;
        };
        Update: Partial<Database['public']['Tables']['vendor_debit_notes']['Insert']>;
        Relationships: [];
      };
      vendor_debit_note_items: {
        Row: {
          cgst_cents: number;
          created_at: string;
          debit_note_id: string;
          description: string;
          grn_item_id: string | null;
          gst_rate: number;
          id: string;
          inventory_item_id: string | null;
          po_item_id: string | null;
          position: number;
          qty: number;
          reason_code: DebitNoteReason;
          sgst_cents: number;
          taxable_cents: number;
          total_cents: number;
          unit_price_cents: number;
          uom: string;
        };
        Insert: {
          cgst_cents?: number;
          created_at?: string;
          debit_note_id: string;
          description: string;
          grn_item_id?: string | null;
          gst_rate?: number;
          id?: string;
          inventory_item_id?: string | null;
          po_item_id?: string | null;
          position?: number;
          qty: number;
          reason_code: DebitNoteReason;
          sgst_cents?: number;
          taxable_cents?: number;
          total_cents?: number;
          unit_price_cents?: number;
          uom?: string;
        };
        Update: Partial<Database['public']['Tables']['vendor_debit_note_items']['Insert']>;
        Relationships: [];
      };
      vendor_payments: {
        Row: {
          amount_cents: number;
          bill_id: string;
          branch_id: string;
          created_at: string;
          id: string;
          is_void: boolean;
          method: VendorPaymentMethodAp;
          notes: string | null;
          paid_at: string;
          performed_by_staff_id: string | null;
          reference: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by_staff_id: string | null;
        };
        Insert: {
          amount_cents: number;
          bill_id: string;
          branch_id: string;
          created_at?: string;
          id?: string;
          is_void?: boolean;
          method: VendorPaymentMethodAp;
          notes?: string | null;
          paid_at?: string;
          performed_by_staff_id?: string | null;
          reference?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by_staff_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendor_payments']['Insert']>;
        Relationships: [];
      };
      payments: {
        Row: {
          amount_cents: number;
          branch_id: string;
          created_at: string;
          id: string;
          invoice_id: string;
          is_void: boolean;
          method: PaymentMethod;
          notes: string | null;
          paid_at: string;
          received_by_staff_id: string | null;
          reference: string | null;
        };
        Insert: {
          amount_cents: number;
          branch_id: string;
          created_at?: string;
          id?: string;
          invoice_id: string;
          is_void?: boolean;
          method: PaymentMethod;
          notes?: string | null;
          paid_at?: string;
          received_by_staff_id?: string | null;
          reference?: string | null;
        };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
        Relationships: [];
      };
      services: {
        Row: {
          branch_id: string;
          category: ServiceCategory;
          code: string;
          created_at: string;
          gst_rate: number;
          hsn_sac: string | null;
          id: string;
          is_active: boolean;
          name: string;
          unit_price_cents: number;
        };
        Insert: {
          branch_id: string;
          category: ServiceCategory;
          code: string;
          created_at?: string;
          gst_rate?: number;
          hsn_sac?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          unit_price_cents?: number;
        };
        Update: Partial<Database['public']['Tables']['services']['Insert']>;
        Relationships: [];
      };
      inventory_items: {
        Row: {
          branch_id: string;
          category: InventoryCategory;
          created_at: string;
          default_unit_cost_cents: number;
          default_unit_price_cents: number;
          id: string;
          is_active: boolean;
          max_stock: number | null;
          name: string;
          notes: string | null;
          reorder_point: number;
          sku: string;
          unit_of_measure: string;
          updated_at: string;
        };
        Insert: {
          branch_id: string;
          category: InventoryCategory;
          created_at?: string;
          default_unit_cost_cents?: number;
          default_unit_price_cents?: number;
          id?: string;
          is_active?: boolean;
          max_stock?: number | null;
          name: string;
          notes?: string | null;
          reorder_point?: number;
          sku: string;
          unit_of_measure?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['inventory_items']['Insert']>;
        Relationships: [];
      };
      inventory_batches: {
        Row: {
          batch_number: string;
          created_at: string;
          expiry_date: string | null;
          id: string;
          is_expired: boolean;
          item_id: string;
          mfg_date: string | null;
          notes: string | null;
          qty_on_hand: number;
          qty_received: number;
          received_at: string;
          received_by_staff_id: string | null;
          unit_cost_cents: number;
          vendor_name: string | null;
        };
        Insert: {
          batch_number: string;
          created_at?: string;
          expiry_date?: string | null;
          id?: string;
          is_expired?: boolean;
          item_id: string;
          mfg_date?: string | null;
          notes?: string | null;
          qty_on_hand: number;
          qty_received: number;
          received_at?: string;
          received_by_staff_id?: string | null;
          unit_cost_cents?: number;
          vendor_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['inventory_batches']['Insert']>;
        Relationships: [];
      };
      stock_movements: {
        Row: {
          batch_id: string | null;
          branch_id: string;
          id: string;
          item_id: string;
          movement_type: StockMovementType;
          performed_at: string;
          performed_by_staff_id: string | null;
          qty_delta: number;
          reason: string | null;
          related_entity_id: string | null;
          related_entity_type: string | null;
        };
        Insert: {
          batch_id?: string | null;
          branch_id: string;
          id?: string;
          item_id: string;
          movement_type: StockMovementType;
          performed_at?: string;
          performed_by_staff_id?: string | null;
          qty_delta: number;
          reason?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
        };
        Update: Partial<Database['public']['Tables']['stock_movements']['Insert']>;
        Relationships: [];
      };
      lab_orders: {
        Row: {
          branch_id: string;
          collected_at: string | null;
          collected_by_staff_id: string | null;
          created_at: string;
          encounter_id: string | null;
          id: string;
          notes: string | null;
          ordered_at: string;
          ordering_doctor_staff_id: string;
          patient_id: string;
          priority: LabPriority;
          rejection_reason: string | null;
          sample_id: string | null;
          sample_status: LabSampleStatus;
          status: LabOrderStatus;
          updated_at: string;
          reported_by_staff_id: string | null;
          reported_at: string | null;
        };
        Insert: {
          branch_id: string;
          collected_at?: string | null;
          collected_by_staff_id?: string | null;
          created_at?: string;
          encounter_id?: string | null;
          id?: string;
          notes?: string | null;
          ordered_at?: string;
          ordering_doctor_staff_id: string;
          patient_id: string;
          priority?: LabPriority;
          rejection_reason?: string | null;
          sample_id?: string | null;
          sample_status?: LabSampleStatus;
          status?: LabOrderStatus;
          updated_at?: string;
          reported_by_staff_id?: string | null;
          reported_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['lab_orders']['Insert']>;
        Relationships: [];
      };
      lab_results: {
        Row: {
          created_at: string;
          entered_at: string | null;
          entered_by_staff_id: string | null;
          flag: LabResultFlag | null;
          id: string;
          lab_order_id: string;
          lab_test_id: string;
          notes: string | null;
          status: LabResultStatus;
          updated_at: string;
          value_numeric: number | null;
          value_text: string | null;
          verified_at: string | null;
          verified_by_staff_id: string | null;
        };
        Insert: {
          created_at?: string;
          entered_at?: string | null;
          entered_by_staff_id?: string | null;
          flag?: LabResultFlag | null;
          id?: string;
          lab_order_id: string;
          lab_test_id: string;
          notes?: string | null;
          status?: LabResultStatus;
          updated_at?: string;
          value_numeric?: number | null;
          value_text?: string | null;
          verified_at?: string | null;
          verified_by_staff_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['lab_results']['Insert']>;
        Relationships: [];
      };
      lab_tests: {
        Row: {
          category: LabCategory;
          code: string;
          created_at: string;
          critical_high: number | null;
          critical_low: number | null;
          id: string;
          is_active: boolean;
          name: string;
          ref_max: number | null;
          ref_min: number | null;
          specimen_type: LabSpecimenType;
          turnaround_hours: number | null;
          unit: string | null;
          method: string | null;
          clinical_significance: string | null;
          patient_instructions: Json | null;
          pre_test_preparation: string | null;
          infographic: Json | null;
        };
        Insert: {
          category: LabCategory;
          code: string;
          created_at?: string;
          critical_high?: number | null;
          critical_low?: number | null;
          id?: string;
          is_active?: boolean;
          name: string;
          ref_max?: number | null;
          ref_min?: number | null;
          specimen_type: LabSpecimenType;
          turnaround_hours?: number | null;
          unit?: string | null;
          method?: string | null;
          clinical_significance?: string | null;
          patient_instructions?: Json | null;
          pre_test_preparation?: string | null;
          infographic?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['lab_tests']['Insert']>;
        Relationships: [];
      };
      hospital_settings: {
        Row: {
          id: string;
          branch_id: string;
          hospital_name: string;
          hospital_tagline: string | null;
          hospital_address_line1: string | null;
          hospital_address_line2: string | null;
          hospital_city: string | null;
          hospital_state: string | null;
          hospital_pincode: string | null;
          hospital_country: string | null;
          hospital_phone: string | null;
          hospital_alt_phone: string | null;
          hospital_email: string | null;
          hospital_website: string | null;
          hospital_logo_url: string | null;
          hospital_address: string | null;
          pharmacy_name: string | null;
          pharmacy_address: string | null;
          pharmacy_phone: string | null;
          pharmacy_email: string | null;
          pharmacy_license: string | null;
          drug_license_retail_number: string | null;
          drug_license_wholesale_number: string | null;
          drug_license_issuing_authority: string | null;
          drug_license_issued_on: string | null;
          drug_license_valid_until: string | null;
          pharmacist_name: string | null;
          pharmacist_qualification: string | null;
          pharmacist_registration_number: string | null;
          pharmacist_registration_council: string | null;
          gst_number: string | null;
          pan_number: string | null;
          fssai_number: string | null;
          cin_number: string | null;
          registration_number: string | null;
          hospital_registration_number: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_ifsc: string | null;
          upi_id: string | null;
          receipt_footer_note: string | null;
          receipt_terms_and_conditions: string | null;
          logo_url: string | null;
          header_seal_urls: Json;
          footer_seal_urls: Json;
          header_tagline_lab: string | null;
          header_html: string | null;
          footer_html: string | null;
          general_instructions: Json;
          report_disclaimer: string | null;
          terms_overleaf: string | null;
          accreditations: Json;
          lab_report_template: string;
          lab_report_print_mode: Json;
          watermark_text: string | null;
          show_medico_legal_note: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['hospital_settings']['Row']> & { branch_id: string };
        Update: Partial<Database['public']['Tables']['hospital_settings']['Row']>;
        Relationships: [];
      };
      lab_test_catalog_settings: {
        Row: {
          id: string;
          branch_id: string;
          category: string;
          general_instructions: Json | null;
          interpretation_template: string | null;
          cover_page_html: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          category: string;
          general_instructions?: Json | null;
          interpretation_template?: string | null;
          cover_page_html?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['lab_test_catalog_settings']['Insert']>;
        Relationships: [];
      };
      patient_addresses: {
        Row: {
          city: string; country: string; created_at: string; id: string;
          is_primary: boolean; line1: string; line2: string | null;
          patient_id: string; pincode: string | null; state: string;
        };
        Insert: { city: string; country?: string; created_at?: string; id?: string; is_primary?: boolean; line1: string; line2?: string | null; patient_id: string; pincode?: string | null; state: string; };
        Update: Partial<Database['public']['Tables']['patient_addresses']['Insert']>;
        Relationships: [];
      };
      patient_allergies: {
        Row: { allergen: string; id: string; patient_id: string; reaction: string | null; recorded_at: string; recorded_by_staff_id: string | null; severity: AllergySeverity; };
        Insert: { allergen: string; id?: string; patient_id: string; reaction?: string | null; recorded_at?: string; recorded_by_staff_id?: string | null; severity: AllergySeverity; };
        Update: Partial<Database['public']['Tables']['patient_allergies']['Insert']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          action_url: string | null;
          body: string | null;
          branch_id: string;
          category: NotificationCategory;
          created_at: string;
          dedup_key: string | null;
          dismissed_at: string | null;
          expires_at: string | null;
          id: string;
          read_at: string | null;
          recipient_staff_id: string;
          related_entity_id: string | null;
          related_entity_type: string | null;
          severity: NotificationSeverity;
          title: string;
        };
        Insert: {
          action_url?: string | null;
          body?: string | null;
          branch_id: string;
          category: NotificationCategory;
          created_at?: string;
          dedup_key?: string | null;
          dismissed_at?: string | null;
          expires_at?: string | null;
          id?: string;
          read_at?: string | null;
          recipient_staff_id: string;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          severity: NotificationSeverity;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
      patient_insurance_policies: {
        Row: {
          copay_pct: number;
          created_at: string;
          created_by_staff_id: string | null;
          group_number: string | null;
          id: string;
          is_primary: boolean;
          notes: string | null;
          patient_id: string;
          payer_name: string;
          policy_number: string;
          status: InsuranceStatus;
          sum_assured_cents: number;
          updated_at: string;
          valid_from: string | null;
          valid_to: string | null;
        };
        Insert: {
          copay_pct?: number;
          created_at?: string;
          created_by_staff_id?: string | null;
          group_number?: string | null;
          id?: string;
          is_primary?: boolean;
          notes?: string | null;
          patient_id: string;
          payer_name: string;
          policy_number: string;
          status?: InsuranceStatus;
          sum_assured_cents?: number;
          updated_at?: string;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Update: Partial<Database['public']['Tables']['patient_insurance_policies']['Insert']>;
        Relationships: [];
      };
      patient_care_team: {
        Row: { assigned_at: string; patient_id: string; role: CareTeamRole; staff_id: string; };
        Insert: { assigned_at?: string; patient_id: string; role?: CareTeamRole; staff_id: string; };
        Update: Partial<Database['public']['Tables']['patient_care_team']['Insert']>;
        Relationships: [];
      };
      patients: {
        Row: {
          aadhaar_last4: string | null; abha: string | null; alt_mobile: string | null;
          archived_at: string | null; balance_cents: number; blood_group: BloodGroup | null;
          branch_id: string; created_at: string; created_by_staff_id: string | null;
          date_of_birth: string; email: string | null;
          emergency_contact_name: string | null; emergency_contact_phone: string | null;
          emergency_contact_relation: string | null; first_name: string;
          full_name: string | null; gender: Gender; id: string; last_name: string;
          marital_status: MaritalStatus | null; mobile: string; notes: string | null;
          referred_by: string | null; salutation: Salutation | null;
          status: PatientStatus; tags: string[]; uhid: string; updated_at: string;
        };
        Insert: {
          aadhaar_last4?: string | null; abha?: string | null; alt_mobile?: string | null;
          archived_at?: string | null; balance_cents?: number; blood_group?: BloodGroup | null;
          branch_id: string; created_at?: string; created_by_staff_id?: string | null;
          date_of_birth: string; email?: string | null;
          emergency_contact_name?: string | null; emergency_contact_phone?: string | null;
          emergency_contact_relation?: string | null; first_name: string;
          full_name?: string | null; gender: Gender; id?: string; last_name: string;
          marital_status?: MaritalStatus | null; mobile: string; notes?: string | null;
          referred_by?: string | null; salutation?: Salutation | null;
          status?: PatientStatus; tags?: string[]; uhid?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['patients']['Insert']>;
        Relationships: [];
      };
      permissions: {
        Row: { description: string | null; slug: string };
        Insert: { description?: string | null; slug: string };
        Update: Partial<Database['public']['Tables']['permissions']['Insert']>;
        Relationships: [];
      };
      prescriptions: {
        Row: {
          branch_id: string; created_at: string; encounter_id: string | null;
          id: string; notes: string | null; patient_id: string;
          prescribed_at: string; prescribed_by_staff_id: string;
          status: PrescriptionStatus; updated_at: string;
        };
        Insert: {
          branch_id: string; created_at?: string; encounter_id?: string | null;
          id?: string; notes?: string | null; patient_id: string;
          prescribed_at?: string; prescribed_by_staff_id: string;
          status?: PrescriptionStatus; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['prescriptions']['Insert']>;
        Relationships: [];
      };
      prescription_items: {
        Row: {
          created_at: string; dosage: string | null; drug_name: string;
          duration_days: number | null; form: DrugForm | null; frequency: string | null;
          id: string; instructions: string | null; position: number;
          prescription_id: string; qty: number | null;
          route: DrugRoute | null; strength: string | null;
        };
        Insert: {
          created_at?: string; dosage?: string | null; drug_name: string;
          duration_days?: number | null; form?: DrugForm | null; frequency?: string | null;
          id?: string; instructions?: string | null; position?: number;
          prescription_id: string; qty?: number | null;
          route?: DrugRoute | null; strength?: string | null;
        };
        Update: Partial<Database['public']['Tables']['prescription_items']['Insert']>;
        Relationships: [];
      };
      role_permissions: {
        Row: { permission_slug: string; role_slug: string };
        Insert: { permission_slug: string; role_slug: string };
        Update: Partial<Database['public']['Tables']['role_permissions']['Insert']>;
        Relationships: [];
      };
      roles: {
        Row: { description: string | null; name: string; slug: string };
        Insert: { description?: string | null; name: string; slug: string };
        Update: Partial<Database['public']['Tables']['roles']['Insert']>;
        Relationships: [];
      };
      staff: {
        Row: {
          created_at: string; email: string; full_name: string; id: string;
          is_active: boolean; joined_at: string | null; metadata: Json;
          phone: string | null; primary_branch_id: string;
          role_slug: string; staff_code: string; updated_at: string; user_id: string;
          signature_data_url: string | null;
          signature_role: string | null;
          signature_uploaded_at: string | null;
        };
        Insert: {
          created_at?: string; email: string; full_name: string; id?: string;
          is_active?: boolean; joined_at?: string | null; metadata?: Json;
          phone?: string | null; primary_branch_id: string;
          role_slug: string; staff_code: string; updated_at?: string; user_id: string;
          signature_data_url?: string | null;
          signature_role?: string | null;
          signature_uploaded_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['staff']['Insert']>;
        Relationships: [];
      };
      staff_branches: {
        Row: { branch_id: string; staff_id: string };
        Insert: { branch_id: string; staff_id: string };
        Update: Partial<Database['public']['Tables']['staff_branches']['Insert']>;
        Relationships: [];
      };
      wards: {
        Row: {
          branch_id: string;
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          position: number;
          ward_type: WardType;
        };
        Insert: {
          branch_id: string;
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          position?: number;
          ward_type: WardType;
        };
        Update: Partial<Database['public']['Tables']['wards']['Insert']>;
        Relationships: [];
      };
      vendors: {
        Row: {
          address: Json | null;
          branch_id: string;
          category: VendorCategory;
          code: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          default_payment_method: VendorPaymentMethod | null;
          gstn: string | null;
          id: string;
          is_active: boolean;
          name: string;
          notes: string | null;
          pan: string | null;
          payment_terms: VendorPaymentTerms;
          updated_at: string;
        };
        Insert: {
          address?: Json | null;
          branch_id: string;
          category: VendorCategory;
          code: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          default_payment_method?: VendorPaymentMethod | null;
          gstn?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          notes?: string | null;
          pan?: string | null;
          payment_terms?: VendorPaymentTerms;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['vendors']['Insert']>;
        Relationships: [];
      };
      vitals: {
        Row: {
          blood_sugar_mgdl: number | null; bp_diastolic: number | null;
          bp_systolic: number | null; encounter_id: string | null;
          height_cm: number | null; id: string; notes: string | null;
          patient_id: string; pulse: number | null; recorded_at: string;
          recorded_by_staff_id: string | null; spo2_pct: number | null;
          temp_celsius: number | null; weight_kg: number | null;
        };
        Insert: {
          blood_sugar_mgdl?: number | null; bp_diastolic?: number | null;
          bp_systolic?: number | null; encounter_id?: string | null;
          height_cm?: number | null; id?: string; notes?: string | null;
          patient_id: string; pulse?: number | null; recorded_at?: string;
          recorded_by_staff_id?: string | null; spo2_pct?: number | null;
          temp_celsius?: number | null; weight_kg?: number | null;
        };
        Update: Partial<Database['public']['Tables']['vitals']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      bootstrap_super_admin: { Args: { p_email: string }; Returns: Database['public']['Tables']['staff']['Row'] };
      check_drug_interaction: { Args: { d1: string; d2: string }; Returns: { severity: InteractionSeverity; message: string; source: string | null }[] };
      create_role_user: {
        Args: { p_branch_code?: string; p_email: string; p_full_name: string; p_password: string; p_role_slug: string; p_staff_code: string };
        Returns: Database['public']['Tables']['staff']['Row'];
      };
      current_branch_ids: { Args: Record<string, never>; Returns: string[] };
      current_role_slug: { Args: Record<string, never>; Returns: string };
      current_staff_id: { Args: Record<string, never>; Returns: string };
      generate_uhid: { Args: Record<string, never>; Returns: string };
      has_permission: { Args: { p: string }; Returns: boolean };
      is_in_care_team: { Args: { p_patient_id: string }; Returns: boolean };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      log_audit: { Args: { p_action: string; p_entity?: string; p_entity_id?: string; p_payload?: Json }; Returns: void };
      rx_item_dispensed_qty: { Args: { p_item_id: string }; Returns: number };
      admit_patient_to_bed: {
        Args: { p_patient_id: string; p_bed_id: string; p_attending_doctor_staff_id?: string; p_reason?: string; p_notes?: string };
        Returns: Database['public']['Tables']['admissions']['Row'];
      };
      discharge_admission: {
        Args: { p_admission_id: string; p_reason?: string };
        Returns: Database['public']['Tables']['admissions']['Row'];
      };
      set_bed_status: {
        Args: { p_bed_id: string; p_status: string };
        Returns: Database['public']['Tables']['beds']['Row'];
      };
      set_bed_acuity: {
        Args: { p_bed_id: string; p_acuity: string | null };
        Returns: Database['public']['Tables']['beds']['Row'];
      };
      next_lab_sample_id: { Args: Record<string, never>; Returns: string };
      place_lab_order: {
        Args: { p_patient_id: string; p_test_codes: string[]; p_encounter_id?: string; p_priority?: LabPriority; p_notes?: string };
        Returns: Database['public']['Tables']['lab_orders']['Row'];
      };
      collect_lab_sample: {
        Args: { p_order_id: string; p_sample_id?: string };
        Returns: Database['public']['Tables']['lab_orders']['Row'];
      };
      start_lab_sample: {
        Args: { p_order_id: string };
        Returns: Database['public']['Tables']['lab_orders']['Row'];
      };
      reject_lab_sample: {
        Args: { p_order_id: string; p_reason: string };
        Returns: Database['public']['Tables']['lab_orders']['Row'];
      };
      enter_lab_result: {
        Args: { p_result_id: string; p_value_numeric?: number; p_value_text?: string; p_notes?: string };
        Returns: Database['public']['Tables']['lab_results']['Row'];
      };
      verify_lab_result: {
        Args: { p_result_id: string };
        Returns: Database['public']['Tables']['lab_results']['Row'];
      };
      receive_inventory: {
        Args: {
          p_item_sku: string;
          p_batch_number: string;
          p_qty: number;
          p_mfg_date?: string;
          p_expiry_date?: string;
          p_unit_cost_cents?: number;
          p_vendor_name?: string;
          p_notes?: string;
        };
        Returns: Database['public']['Tables']['inventory_batches']['Row'];
      };
      adjust_inventory: {
        Args: { p_batch_id: string; p_qty_delta: number; p_reason: string };
        Returns: Database['public']['Tables']['inventory_batches']['Row'];
      };
      expire_inventory_batch: {
        Args: { p_batch_id: string; p_reason?: string };
        Returns: Database['public']['Tables']['inventory_batches']['Row'];
      };
      next_invoice_number: { Args: Record<string, never>; Returns: string };
      create_invoice: {
        Args: {
          p_patient_id: string;
          p_items: Json;
          p_encounter_id?: string;
          p_admission_id?: string;
          p_due_days?: number;
          p_notes?: string;
          p_issue?: boolean;
        };
        Returns: Database['public']['Tables']['invoices']['Row'];
      };
      record_payment: {
        Args: {
          p_invoice_id: string;
          p_amount_cents: number;
          p_method: PaymentMethod;
          p_reference?: string;
          p_notes?: string;
        };
        Returns: Database['public']['Tables']['payments']['Row'];
      };
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string };
        Returns: Database['public']['Tables']['invoices']['Row'];
      };
      void_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: Database['public']['Tables']['payments']['Row'];
      };
      next_po_number: { Args: Record<string, never>; Returns: string };
      create_purchase_order: {
        Args: {
          p_vendor_id: string;
          p_items: Json;
          p_category: VendorCategory;
          p_po_type?: PoType;
          p_payment_terms?: VendorPaymentTerms;
          p_payment_method?: VendorPaymentMethod;
          p_freight_terms?: PoFreightTerms;
          p_freight_cents?: number;
          p_tds_cents?: number;
          p_qc_requirements?: string[];
          p_returns_policy?: PoReturnsPolicy;
          p_expected_delivery_date?: string;
          p_delivery_address?: Json;
          p_notes?: string;
          p_special_instructions?: string;
          p_submit?: boolean;
        };
        Returns: Database['public']['Tables']['purchase_orders']['Row'];
      };
      submit_purchase_order: { Args: { p_po_id: string }; Returns: Database['public']['Tables']['purchase_orders']['Row'] };
      approve_purchase_order: { Args: { p_po_id: string }; Returns: Database['public']['Tables']['purchase_orders']['Row'] };
      send_purchase_order: { Args: { p_po_id: string }; Returns: Database['public']['Tables']['purchase_orders']['Row'] };
      cancel_purchase_order: { Args: { p_po_id: string; p_reason: string }; Returns: Database['public']['Tables']['purchase_orders']['Row'] };
      close_purchase_order: { Args: { p_po_id: string }; Returns: Database['public']['Tables']['purchase_orders']['Row'] };
      next_grn_number: { Args: Record<string, never>; Returns: string };
      receive_goods_against_po: {
        Args: {
          p_po_id: string;
          p_items: Json;
          p_qc_status?: GrnQcStatus;
          p_qc_notes?: string;
          p_notes?: string;
        };
        Returns: Database['public']['Tables']['goods_receipts']['Row'];
      };
      next_bill_number: { Args: Record<string, never>; Returns: string };
      create_vendor_bill: {
        Args: {
          p_vendor_id: string;
          p_po_id: string | null;
          p_vendor_bill_number: string;
          p_bill_date: string;
          p_due_date: string;
          p_items: Json;
          p_payment_terms?: string;
          p_payment_method?: string;
          p_freight_cents?: number;
          p_tds_cents?: number;
          p_notes?: string;
          p_submit?: boolean;
        };
        Returns: Database['public']['Tables']['vendor_bills']['Row'];
      };
      submit_vendor_bill:  { Args: { p_bill_id: string }; Returns: Database['public']['Tables']['vendor_bills']['Row'] };
      approve_vendor_bill: { Args: { p_bill_id: string }; Returns: Database['public']['Tables']['vendor_bills']['Row'] };
      cancel_vendor_bill:  { Args: { p_bill_id: string; p_reason: string }; Returns: Database['public']['Tables']['vendor_bills']['Row'] };
      override_bill_match: { Args: { p_bill_id: string; p_reason: string }; Returns: Database['public']['Tables']['vendor_bills']['Row'] };
      record_vendor_payment: {
        Args: {
          p_bill_id: string;
          p_amount_cents: number;
          p_method: VendorPaymentMethodAp;
          p_paid_at?: string;
          p_reference?: string;
          p_notes?: string;
        };
        Returns: Database['public']['Tables']['vendor_payments']['Row'];
      };
      void_vendor_payment: { Args: { p_payment_id: string; p_reason: string }; Returns: Database['public']['Tables']['vendor_payments']['Row'] };
      next_dn_number: { Args: Record<string, never>; Returns: string };
      propose_debit_note_from_grn: { Args: { p_grn_id: string }; Returns: Json };
      create_debit_note: {
        Args: {
          p_vendor_id: string;
          p_items: Json;
          p_reason: string;
          p_grn_id?: string | null;
          p_bill_id?: string | null;
          p_notes?: string;
          p_issue?: boolean;
        };
        Returns: Database['public']['Tables']['vendor_debit_notes']['Row'];
      };
      issue_debit_note:  { Args: { p_dn_id: string }; Returns: Database['public']['Tables']['vendor_debit_notes']['Row'] };
      apply_debit_note:  { Args: { p_dn_id: string; p_bill_id: string }; Returns: Database['public']['Tables']['vendor_debit_notes']['Row'] };
      cancel_debit_note: { Args: { p_dn_id: string; p_reason: string }; Returns: Database['public']['Tables']['vendor_debit_notes']['Row'] };
      report_kpis: { Args: Record<string, never>; Returns: Json };
      report_ap_aging: {
        Args: Record<string, never>;
        Returns: { bucket: string; sort_order: number; bill_count: number; outstanding_cents: number }[];
      };
      report_procurement_spend: {
        Args: { p_days?: number };
        Returns: { category: string; po_count: number; total_cents: number }[];
      };
      report_expiry_risk: {
        Args: Record<string, never>;
        Returns: { bucket: string; sort_order: number; batch_count: number; qty_at_risk: number; cost_at_risk_cents: number }[];
      };
      report_vendor_scorecard: {
        Args: { p_days?: number };
        Returns: {
          vendor_id: string;
          vendor_code: string;
          vendor_name: string;
          po_count: number;
          total_spend_cents: number;
          bill_count: number;
          matched_bill_count: number;
          on_time_grn_count: number;
          total_grn_count: number;
        }[];
      };
      report_revenue: {
        Args: { p_days?: number };
        Returns: { category: string; invoice_count: number; line_count: number; revenue_cents: number }[];
      };
      generate_notifications: { Args: Record<string, never>; Returns: number };
      unread_notification_count: { Args: Record<string, never>; Returns: number };
      mark_notification_read: { Args: { p_id: string }; Returns: Database['public']['Tables']['notifications']['Row'] };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: number };
      dismiss_notification: { Args: { p_id: string }; Returns: Database['public']['Tables']['notifications']['Row'] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ── Domain enums (mirror SQL CHECK constraints) ───────────────────────
export type AppointmentStatus =
  | 'scheduled' | 'checked_in' | 'in_consultation' | 'completed' | 'no_show' | 'cancelled' | 'rescheduled';
export type VisitType = 'new' | 'follow_up' | 'walk_in' | 'telehealth';

export type EncounterType = 'opd' | 'ipd' | 'emergency' | 'telehealth';
export type EncounterStatus = 'draft' | 'finalised' | 'amended' | 'cancelled';

export type PrescriptionStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type DispenseStatus = 'dispensed' | 'partial' | 'cancelled';

export type WardType = 'general' | 'icu' | 'maternity' | 'pediatric' | 'private' | 'daycare' | 'emergency';
export type BedStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'blocked';
export type BedAcuity = 'stable' | 'watch' | 'critical' | 'pre_discharge';
export type BedReleaseReason = 'discharge' | 'transfer' | 'death' | 'cleaning';
export type AdmissionStatus = 'active' | 'discharged' | 'transferred' | 'expired';

export type LabCategory = 'haematology' | 'biochemistry' | 'microbiology' | 'endocrinology' | 'immunology' | 'urinalysis' | 'imaging' | 'other';
export type LabSpecimenType = 'blood' | 'serum' | 'plasma' | 'urine' | 'stool' | 'sputum' | 'swab' | 'tissue' | 'imaging' | 'other';
export type LabPriority = 'routine' | 'urgent' | 'stat';
export type LabSampleStatus = 'pending' | 'collected' | 'running' | 'verified' | 'rejected' | 'cancelled';
export type LabOrderStatus = 'active' | 'completed' | 'cancelled';
export type LabResultStatus = 'pending' | 'entered' | 'verified' | 'amended';
export type LabResultFlag = 'low' | 'high' | 'critical_low' | 'critical_high' | 'normal';

export type InventoryCategory = 'medication' | 'disposable' | 'consumable' | 'equipment' | 'reagent' | 'other';
export type StockMovementType = 'receipt' | 'dispense' | 'adjust' | 'transfer' | 'return' | 'expire' | 'write_off';

export type ServiceCategory = 'consultation' | 'ipd_room' | 'procedure' | 'lab' | 'pharmacy' | 'imaging' | 'other';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'net_banking' | 'cheque' | 'insurance' | 'adjustment';

export type VendorCategory = 'pharmacy' | 'disposables' | 'equipment' | 'consumables' | 'reagents' | 'services' | 'f_and_b' | 'stationery' | 'other';
export type VendorPaymentTerms = 'immediate' | 'net_15' | 'net_30' | 'net_45' | 'net_60' | 'advance';
export type VendorPaymentMethod = 'neft' | 'rtgs' | 'imps' | 'upi' | 'cheque' | 'cash' | 'loc';

export type PoStatus = 'draft' | 'awaiting_approval' | 'approved' | 'sent' | 'partially_received' | 'fully_received' | 'closed' | 'cancelled';
export type PoType = 'standard' | 'blanket' | 'emergency' | 'service';
export type PoFreightTerms = 'vendor' | 'hospital' | 'split';
export type PoReturnsPolicy = '30_day' | '15_day' | 'none';
export type GrnQcStatus = 'pending' | 'passed' | 'failed';
export type GrnStatus = 'draft' | 'posted' | 'rejected';
export type GrnCondition = 'good' | 'damaged' | 'short' | 'expired';
export type InsuranceStatus = 'active' | 'expired' | 'cancelled' | 'pending';
export type NotificationCategory = 'appointment' | 'billing' | 'inventory' | 'procurement' | 'lab' | 'ipd' | 'system';
export type NotificationSeverity = 'info' | 'warn' | 'danger' | 'success';
export type VendorBillStatus = 'draft' | 'awaiting_approval' | 'approved' | 'partially_paid' | 'paid' | 'cancelled';
export type VendorBillMatchStatus = 'matched' | 'mismatch' | 'pending_review' | 'manual_override';
export type VendorPaymentMethodAp = 'neft' | 'rtgs' | 'imps' | 'upi' | 'cheque' | 'cash' | 'adjustment';
export type DebitNoteStatus = 'draft' | 'issued' | 'applied' | 'cancelled';
export type DebitNoteReason = 'damaged' | 'short' | 'expired' | 'price_variance' | 'qty_variance' | 'other';
export type DrugForm = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'inhaler' | 'drops' | 'cream' | 'ointment' | 'suspension' | 'other';
export type DrugRoute = 'oral' | 'iv' | 'im' | 'sc' | 'topical' | 'inhaled' | 'sublingual' | 'rectal' | 'ophthalmic' | 'otic' | 'nasal';
export type InteractionSeverity = 'moderate' | 'severe' | 'contraindicated';

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';
export type CareTeamRole = 'primary' | 'attending' | 'consulting' | 'nurse' | 'observer';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type Gender = 'male' | 'female' | 'other';
export type MaritalStatus = 'single' | 'married' | 'widowed' | 'divorced' | 'other';
export type Salutation = 'Mr' | 'Ms' | 'Mrs' | 'Dr' | 'Master';
export type PatientStatus = 'active' | 'inactive' | 'pending_payment';

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
