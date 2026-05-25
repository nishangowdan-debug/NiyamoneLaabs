import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthStore } from '../../../core/auth/auth.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { HospitalSettingsService, type HospitalSettings } from '../services/hospital-settings.service';
import type { PosCartItem } from '../data/pharmacy.types';
import { BranchStore } from '../../../core/branches/branch.store';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface PharmInvoiceExportRow {
  invoice_number: string;
  created_at: string;
  patient_name: string;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  status: string;
}

interface PharmacyInvoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  total_cents: number;
  created_at: string;
  status: string;
  paid_cents: number;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  patient_uhid?: string;
  patient_mobile?: string;
  patient_age?: string;
  doctor_name?: string;
  total_cents: number;
  subtotal_cents: number;
  discount_cents: number;
  cgst_cents: number;
  sgst_cents: number;
  igst_cents: number;
  created_at: string;
  status: string;
  paid_cents: number;
  items: PosCartItem[];
  payment_method?: string;
}

@Component({
  selector: 'app-pharmacy-billing-history-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, ExportMenuComponent],
  template: `
<header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
  <div>
    <h1 class="font-display text-[26px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Pharmacy</h1>
    <nav class="mt-2 flex gap-1">
      <a routerLink="/pharmacy" [routerLinkActiveOptions]="{exact:true}" routerLinkActive #qa="routerLinkActive"
         [class]="tabCls(qa.isActive)">📋 Queue</a>
      <a routerLink="/pharmacy/pos" routerLinkActive #pa="routerLinkActive"
         [class]="tabCls(pa.isActive)">🧾 POS / Walk-in</a>
      <a routerLink="/pharmacy/stock" routerLinkActive #sa="routerLinkActive"
         [class]="tabCls(sa.isActive)">📦 Stock</a>
      <a routerLink="/pharmacy/history" routerLinkActive #ha="routerLinkActive"
         [class]="tabCls(ha.isActive)">🧾 History</a>
      <a routerLink="/pharmacy/settings" routerLinkActive #se="routerLinkActive"
         [class]="tabCls(se.isActive)">⚙️ Settings</a>
    </nav>
  </div>
  <div class="flex items-center gap-3">
    <div class="text-right text-[11px] text-ink-muted">
      <p>Total Records: <strong>{{ invoices().length }}</strong></p>
    </div>
    <app-export-menu [disabled]="filteredInvoices().length === 0" (pick)="onExport($event)"/>
  </div>
</header>

<div class="bg-surface-card border border-border rounded-[12px] overflow-hidden">
  <!-- Search & Filter Header -->
  <header class="px-4 py-3 border-b border-border">
    <p class="text-[12px] uppercase text-ink-muted tracking-[0.06em] font-medium">Search & Filter</p>
    <div class="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
      <input [formControl]="searchCtrl" type="text"
             placeholder="Invoice #, patient name, or UHID"
             class="h-10 px-3 text-[14px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      <input type="date" [(ngModel)]="startDate" (ngModelChange)="onDateChange()"
             class="h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600" />
      <input type="date" [(ngModel)]="endDate" (ngModelChange)="onDateChange()"
             class="h-10 px-3 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600" />
    </div>
  </header>

  <!-- Results -->
  @if (loading()) {
    <div class="px-6 py-12 text-center text-[12px] text-ink-muted">Loading invoices…</div>
  } @else if (filteredInvoices().length === 0) {
    <div class="px-6 py-12 text-center">
      <p class="text-[12px] text-ink-muted">No pharmacy invoices found.</p>
    </div>
  } @else {
    <div class="overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead class="bg-surface-muted border-b border-border">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-ink">Invoice #</th>
            <th class="px-4 py-3 text-left font-semibold text-ink">Patient Name</th>
            <th class="px-4 py-3 text-left font-semibold text-ink">Date</th>
            <th class="px-4 py-3 text-right font-semibold text-ink">Amount</th>
            <th class="px-4 py-3 text-center font-semibold text-ink">Status</th>
            <th class="px-4 py-3 text-center font-semibold text-ink">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (inv of filteredInvoices(); track inv.id) {
            <tr class="border-b border-border hover:bg-surface-muted transition-colors">
              <td class="px-4 py-3 font-mono font-semibold text-primary-700">{{ inv.invoice_number }}</td>
              <td class="px-4 py-3 text-ink">{{ inv.patient_name }}</td>
              <td class="px-4 py-3 text-ink-muted">{{ formatDate(inv.created_at) }}</td>
              <td class="px-4 py-3 text-right font-semibold">{{ formatINR(inv.total_cents) }}</td>
              <td class="px-4 py-3 text-center">
                <span class="inline-block px-2 py-1 rounded text-[11px] font-semibold"
                      [class]="getStatusClass(inv.status)">
                  {{ inv.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  <button (click)="viewInvoice(inv.id)"
                          title="View invoice"
                          class="px-2 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 rounded transition-colors">
                    👁️ View
                  </button>
                  <button (click)="reprintInvoice(inv.id)"
                          title="Reprint invoice PDF"
                          class="px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface-subtle rounded transition-colors">
                    🖨️ Print
                  </button>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</div>
  `,
})
export class PharmacyBillingHistoryPage implements OnInit {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private pdfSvc = inject(InvoicePdfService);
  private settingsSvc = inject(HospitalSettingsService);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  invoices = signal<PharmacyInvoice[]>([]);
  loading = signal(false);
  searchCtrl = new FormControl('');
  startDate: string | null = null;
  endDate: string | null = null;
  hospitalSettings = signal<HospitalSettings | null>(null);

  filteredInvoices = computed(() => {
    const search = this.searchCtrl.value?.toLowerCase() || '';
    const start = this.startDate ? new Date(this.startDate).getTime() : 0;
    const end = this.endDate ? new Date(this.endDate).getTime() + 86400000 : Infinity;

    return this.invoices().filter(inv => {
      const matchesSearch = !search ||
        inv.invoice_number.toLowerCase().includes(search) ||
        inv.patient_name.toLowerCase().includes(search);

      const invDate = new Date(inv.created_at).getTime();
      const matchesDate = invDate >= start && invDate <= end;

      return matchesSearch && matchesDate;
    });
  });

  constructor() {
    this.searchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed()
      )
      .subscribe();
  }

  ngOnInit() {
    this.loadInvoices();
    const branchId = (this.auth.claims().branch_id as string | undefined) ?? null;
    if (branchId) {
      void this.settingsSvc.loadSettings(branchId).then(settings => {
        this.hospitalSettings.set(settings);
      });
    }
  }

  private async loadInvoices() {
    this.loading.set(true);
    try {
      const branchId = (this.auth.claims().branch_id as string | undefined) ?? null;
      if (!branchId) {
        this.toast.error('Error', 'No active branch');
        return;
      }

      const { data, error } = await (this.supabase as any).client
        .from('invoices')
        .select(`
          id,
          invoice_number,
          patient_id,
          total_cents,
          created_at,
          status,
          paid_cents,
          patients(full_name)
        `)
        .eq('branch_id', branchId)
        .eq('bill_type', 'pharmacy_op')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const invoices = (data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        patient_id: inv.patient_id,
        patient_name: inv.patients?.full_name || 'Unknown',
        total_cents: inv.total_cents,
        created_at: inv.created_at,
        status: inv.status || 'FINALIZED',
        paid_cents: inv.paid_cents || 0,
      }));

      this.invoices.set(invoices);
      console.log('✅ [HISTORY] Loaded', invoices.length, 'pharmacy invoices');
    } catch (error) {
      console.error('❌ [HISTORY] Error loading invoices:', error);
      this.toast.error('Error', 'Failed to load billing history');
    } finally {
      this.loading.set(false);
    }
  }

  onDateChange() {
    // Trigger reactivity
    this.invoices.set([...this.invoices()]);
  }

  async viewInvoice(id: string) {
    try {
      const { data, error } = await (this.supabase as any).client
        .from('invoices')
        .select(`
          id,
          invoice_number,
          patient_id,
          total_cents,
          subtotal_cents,
          discount_cents,
          cgst_cents,
          sgst_cents,
          igst_cents,
          created_at,
          status,
          paid_cents,
          doctor_staff_id,
          notes,
          patient:patient_id(full_name, uhid, mobile, date_of_birth, gender),
          doctor:doctor_staff_id(full_name),
          invoice_items(description, qty, unit_price_cents, total_cents, gst_rate, position)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Map invoice_items rows → the shape the PDF service expects (PosCartItem-like)
      const items = ((data.invoice_items ?? []) as any[])
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((it) => {
          const desc: string = it.description ?? '';
          // Description is built as "Drug · Strength" by the dispense RPC; split if present
          const parts = desc.split(' · ');
          return {
            catalog_id: null,
            sku: null,
            drug_name: parts[0] ?? desc,
            generic_name: parts[0] ?? desc,
            strength: parts[1] ?? null,
            form: null,
            qty: it.qty ?? 0,
            unit_price_cents: it.unit_price_cents ?? 0,
            gst_rate: it.gst_rate ?? 0,
            line_total_cents: it.total_cents ?? 0,
            is_manual: false,
          };
        });

      const invoiceData = {
        invoice_number: data.invoice_number,
        invoice_date: new Date(data.created_at).toLocaleDateString('en-IN'),
        invoice_type: 'OP' as const,
        patient_name: data.patient?.full_name || 'Unknown',
        patient_uhid: data.patient?.uhid || 'N/A',
        patient_mobile: data.patient?.mobile || 'N/A',
        patient_age: this.computeAge(data.patient?.date_of_birth, data.patient?.gender),
        doctor_name: data.doctor?.full_name
          || (data.notes ? this.extractDoctorFromNotes(data.notes) : ''),
        items,
        subtotal_cents: data.subtotal_cents ?? 0,
        discount_cents: data.discount_cents ?? 0,
        cgst_cents: data.cgst_cents ?? 0,
        sgst_cents: data.sgst_cents ?? 0,
        igst_cents: data.igst_cents ?? 0,
        total_cents: data.total_cents ?? 0,
        payment_method: this.extractPaymentFromNotes(data.notes) ?? 'Cash',
        notes: data.notes ?? '',
        settings: this.hospitalSettings() ?? {
          hospital_name: 'Sree Diagnostics',
          hospital_address: 'Vijayawada, Andhra Pradesh',
          hospital_phone: '8008331234',
          hospital_email: 'info@sreediagnostics.in',
          hospital_website: 'www.sreediagnostics.in',
          pharmacy_name: 'Sree Diagnostics',
          gst_number: 'GST11211233',
          branch_id: '',
        },
      };

      this.pdfSvc.generatePDF(invoiceData, false);
    } catch (error: any) {
      console.error('❌ [HISTORY] Error loading invoice:', error);
      this.toast.error('Error', error?.message || 'Failed to load invoice');
    }
  }

  private computeAge(dob?: string | null, gender?: string | null): string {
    if (!dob) return '';
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
    const g = gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : '';
    return g ? `${age} yrs / ${g}` : `${age} yrs`;
  }

  private extractDoctorFromNotes(notes: string): string {
    const m = notes.match(/^Dr\.?\s*[^·]+/i);
    return m ? m[0].trim() : '';
  }

  private extractPaymentFromNotes(notes: string | null | undefined): string | null {
    if (!notes) return null;
    const m = notes.match(/POS\s*·\s*(\w+)/i);
    return m ? m[1].toUpperCase() : null;
  }

  reprintInvoice(id: string) {
    this.viewInvoice(id);
  }

  protected formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IN');
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
      .format(cents / 100);
  }

  protected getStatusClass(status: string): string {
    const statusMap: Record<string, string> = {
      'FINALIZED': 'bg-green-100 text-green-800',
      'PAID': 'bg-blue-100 text-blue-800',
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'CANCELLED': 'bg-red-100 text-red-800',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800';
  }

  protected tabCls(active: boolean) {
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-700 text-white shadow-card` : `${base} text-ink-soft hover:bg-surface-subtle`;
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const list = this.filteredInvoices();
    if (list.length === 0) return;

    const exportRows: PharmInvoiceExportRow[] = list.map(inv => ({
      invoice_number: inv.invoice_number,
      created_at:     inv.created_at,
      patient_name:   inv.patient_name,
      total_cents:    inv.total_cents,
      paid_cents:     inv.paid_cents,
      balance_cents:  inv.total_cents - inv.paid_cents,
      status:         inv.status,
    }));

    const columns: ExportColumn<PharmInvoiceExportRow>[] = [
      { key: 'invoice_number', header: 'Invoice #',   width: 16, align: 'left' },
      { key: 'created_at',     header: 'Date / time', width: 18, align: 'center', format: 'datetime' },
      { key: 'patient_name',   header: 'Patient',     width: 26, align: 'left' },
      { key: 'total_cents',    header: 'Total (₹)',   width: 16, align: 'right', format: 'inr_cents' },
      { key: 'paid_cents',     header: 'Paid (₹)',    width: 16, align: 'right', format: 'inr_cents' },
      { key: 'balance_cents',  header: 'Balance (₹)', width: 16, align: 'right', format: 'inr_cents' },
      { key: 'status',         header: 'Status',      width: 12, align: 'left' },
    ];

    const totalCents   = exportRows.reduce((s, r) => s + r.total_cents,   0);
    const paidCents    = exportRows.reduce((s, r) => s + r.paid_cents,    0);
    const balanceCents = totalCents - paidCents;

    const filters: { label: string; value: string }[] = [];
    if (this.searchCtrl.value) filters.push({ label: 'Search', value: this.searchCtrl.value });
    if (this.startDate)        filters.push({ label: 'From',   value: this.startDate });
    if (this.endDate)          filters.push({ label: 'To',     value: this.endDate });

    const report: ExportableReport<PharmInvoiceExportRow> = {
      filename: `PharmacySales_${this.branch.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
      title: 'Pharmacy Sales History',
      subtitle: `${exportRows.length} invoice${exportRows.length === 1 ? '' : 's'}`,
      meta: { filters },
      columns,
      rows: exportRows,
      grandTotals: {
        patient_name:  'TOTAL',
        total_cents:   totalCents,
        paid_cents:    paidCents,
        balance_cents: balanceCents,
      },
      footer: 'Sree Diagnostics · Pharmacy Sales Register',
    };

    await this.exportSvc.export(fmt, report);
  }
}
