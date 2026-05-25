import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { format, parseISO } from 'date-fns';

import { ToastService } from '../../../shared/ui/toast/toast.service';
import { DischargeBillingService } from '../data/discharge-billing.service';

interface LabResult {
  test_name: string; test_code: string; panel_group: string;
  technology: string | null; methodology: string | null;
  value_numeric: number | null; value_text: string | null;
  unit: string | null; ref_min: number | null; ref_max: number | null;
  reference_text: string | null; clinical_significance: string | null;
  flag: string | null; report_position: number;
}

interface LabOrder {
  id: string; ordered_at: string; collected_at: string | null;
  reported_at: string | null; status: string; sample_id: string | null;
  is_radiology: boolean; ordering_doctor_name: string | null;
  reported_by_name: string | null; results: LabResult[];
}

const KIND_LABEL: Record<string, string> = {
  pharmacy_dispense: 'Pharmacy', pharmacy_indents: 'Pharmacy',
  lab_order: 'Lab investigations', doctor_visit: 'Doctor visit',
  doctor_visits: 'Doctor visit', blood_unit: 'Blood', blood_request: 'Blood',
  bed_assignment: 'Room / bed', bed_assignments: 'Room / bed',
  consolidated: 'Consolidated', ledger_backfill: 'Backfill',
  manual: 'Other charges',
};

@Component({
  selector: 'app-discharge-print',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
@if (loading()) {
  <p class="p-8 text-center text-[12px] text-ink-muted">Loading discharge package…</p>
} @else if (b(); as bundle) {
  <!-- Screen-only toolbar -->
  <div class="screen-only sticky top-0 z-30 bg-surface-card border-b border-border px-4 py-2 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a [routerLink]="['/discharge-billing']" class="text-[12px] text-ink-soft hover:text-ink">← Back</a>
      <span class="text-ink-faint">·</span>
      <p class="text-[12px] text-ink">
        Discharge package — {{ bundle.patient?.full_name }} ·
        IP {{ bundle.invoice?.invoice_number ?? '—' }}
      </p>
      @if (!signed()) { <span class="text-[10px] text-warn-fg font-semibold">DRAFT</span> }
    </div>
    <div class="flex items-center gap-2">
      <label class="inline-flex items-center gap-1 text-[11px]">
        <input type="checkbox" [checked]="includeSummary()" (change)="includeSummary.set($any($event.target).checked)"/> Summary
      </label>
      <label class="inline-flex items-center gap-1 text-[11px]">
        <input type="checkbox" [checked]="includeLabs()" (change)="includeLabs.set($any($event.target).checked)"/> Labs
      </label>
      <label class="inline-flex items-center gap-1 text-[11px]">
        <input type="checkbox" [checked]="includeBill()" (change)="includeBill.set($any($event.target).checked)"/> Bill
      </label>
      <button type="button" (click)="print()"
              class="h-8 px-3 rounded-md text-[12px] font-semibold bg-primary text-on-primary hover:bg-primary-strong">
        Print / Save as PDF
      </button>
    </div>
  </div>

  <main class="print-root">
    @if (!signed()) { <div class="draft-watermark" aria-hidden="true">DRAFT</div> }

    <!-- ───────── Section A: Discharge Summary ───────── -->
    @if (includeSummary()) {
    <section class="page">
      <header class="doc-header">
        <p class="dept-line">DEPARTMENT OF {{ deptOf(bundle.doctor) }}</p>
        <h1>DISCHARGE SUMMARY</h1>
        <table class="kv-table">
          <tbody>
            <tr><th>MRN</th><td>{{ bundle.patient?.uhid }}</td><th>AGE / GENDER</th><td>{{ patientAgeSex(bundle.patient) }}</td></tr>
            <tr><th>PATIENT NAME</th><td>{{ bundle.patient?.full_name }}</td><th>IP No.</th><td>{{ bundle.invoice?.invoice_number ?? '—' }}</td></tr>
            <tr><th>PRIMARY DOCTOR</th><td>{{ bundle.doctor?.full_name ?? '—' }}</td><th>DATE OF ADMISSION</th><td>{{ longDateTime(bundle.admission?.admitted_at) }}</td></tr>
            <tr><th>DEPARTMENT</th><td>{{ deptOf(bundle.doctor) }}</td><th>DATE OF DISCHARGE</th><td>{{ longDateTime(bundle.admission?.discharged_at) }}</td></tr>
          </tbody>
        </table>
      </header>

      <div class="section">
        <h3>Diagnosis</h3>
        <p>{{ summary().discharge_diagnosis_icd10 ? (summary().discharge_diagnosis_icd10 + ' — ') : '' }}{{ primaryDxLabel() }}</p>
        @for (d of summary().secondary_diagnoses ?? []; track d) { <p>{{ d }},</p> }
      </div>

      <div class="section">
        <h3>Chief Complaint</h3>
        <p class="multiline">{{ summary().presenting_complaint || '—' }}</p>
      </div>

      @if (summary().history_of_present_illness) {
        <div class="section">
          <h3>History of Present Illness</h3>
          <p class="multiline">{{ summary().history_of_present_illness }}</p>
        </div>
      }

      <div class="section">
        <h3>Past Medical History</h3>
        <p class="multiline">{{ summary().past_medical_history || '—' }}</p>
      </div>

      <div class="section">
        <h3>Clinical Finding on Admission</h3>
        <p class="multiline">{{ summary().examination_findings || '—' }}</p>
      </div>

      @if (keyInvestigations().length) {
        <div class="section">
          <h3>Investigation</h3>
          <p class="muted small">Selected key investigations summarised below. Full reports follow on subsequent pages.</p>
          <table class="data-table">
            <thead>
              <tr><th>Test</th><th>Value</th><th>Units</th><th>Ref. range</th><th>Date</th></tr>
            </thead>
            <tbody>
              @for (lo of keyInvestigations(); track lo.id) {
                @for (r of lo.results; track r.test_code) {
                  <tr [class.abnormal]="abnormal(r)">
                    <td>{{ r.test_name }}</td>
                    <td>{{ formatResultValue(r) }}{{ r.flag ? ' ' + r.flag : '' }}</td>
                    <td>{{ r.unit ?? '' }}</td>
                    <td>{{ formatRefRange(r) }}</td>
                    <td>{{ shortDate(lo.collected_at ?? lo.ordered_at) }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }

      <div class="section">
        <h3>Course in the Hospital</h3>
        <p class="multiline">{{ summary().course_in_hospital || '—' }}</p>
      </div>

      @if (summary().procedures_performed) {
        <div class="section">
          <h3>Procedures Performed</h3>
          <p class="multiline">{{ summary().procedures_performed }}</p>
        </div>
      }

      <div class="section">
        <h3>Condition on Discharge</h3>
        @if (summary().condition_status) {
          <p><strong>{{ conditionLabel(summary().condition_status) }}</strong></p>
        }
        @if (summary().condition_at_discharge) { <p class="multiline">{{ summary().condition_at_discharge }}</p> }
        @if (summary().receiving_facility) {
          <p class="muted small">Receiving facility: {{ summary().receiving_facility }}</p>
        }
      </div>

      @if (isLama()) {
        <div class="section disclaimer">
          <h3>Discharge Against Medical Advice — Disclaimer</h3>
          <p class="multiline">
            The patient/attendant has been counselled regarding the medical condition, prognosis,
            recommended treatment, and possible consequences of leaving against medical advice
            including risk of deterioration, complications and death. They have chosen to leave on
            their own responsibility. The hospital and treating team shall not be held liable for
            adverse outcomes following this decision.
          </p>
          <p class="muted small">Acknowledged at {{ longDateTime(summary().lama_disclaimer_acknowledged_at) }}.
            Witness staff ID: {{ summary().lama_witness_staff_id }}.</p>
        </div>
      }

      <div class="section">
        <h3>Discharge Advice</h3>
        @if (takeHomeMeds().length) {
          <ul class="meds-list">
            @for (m of takeHomeMeds(); track m.id) {
              <li>
                {{ formatTakeHome(m) }}
                @if (m.is_external) { <span class="ext-tag">[external]</span> }
              </li>
            }
          </ul>
        } @else if (summary().discharge_medications) {
          <p class="multiline">{{ summary().discharge_medications }}</p>
        } @else {
          <p class="muted">No discharge medications.</p>
        }
        @if (summary().diet_advice) {
          <p class="mt-1"><strong>Diet:</strong> {{ summary().diet_advice }}</p>
        }
        @if (summary().activity_advice) {
          <p><strong>Activity:</strong> {{ summary().activity_advice }}</p>
        }
        @if (summary().follow_up_instructions) {
          <p class="mt-1 multiline">{{ summary().follow_up_instructions }}</p>
        }
        @if (summary().next_review_at) {
          <p class="mt-1"><strong>Next review:</strong> {{ longDateTime(summary().next_review_at) }}</p>
        }
      </div>

      <footer class="signatures">
        <div>
          <p class="sig-line">Prepared By</p>
          <p>{{ summary().signed_by ? bundle.doctor?.full_name : '________________' }}</p>
        </div>
        <div>
          <p class="sig-line">Checked By</p>
          <p>{{ bundle.doctor?.full_name }}</p>
        </div>
        <div class="text-right">
          <p><strong>{{ bundle.doctor?.full_name }}</strong></p>
          <p>{{ deptOf(bundle.doctor) }}</p>
        </div>
      </footer>
    </section>
    }

    <!-- ───────── Section B: Lab Investigations ───────── -->
    @if (includeLabs() && labOrders().length) {
      @for (lo of labOrders(); track lo.id) {
        @if (lo.results.length) {
          <section class="page">
            <header class="lab-header">
              <div>
                <p class="brand">{{ bundle.branch?.name ?? 'Sree Diagnostics' }}</p>
                <p class="address small muted">{{ bundle.branch?.address ?? '' }}</p>
              </div>
              <div class="text-right small">
                <p><strong>Patient:</strong> {{ bundle.patient?.full_name }} ({{ patientAgeSex(bundle.patient) }})</p>
                <p><strong>UHID:</strong> {{ bundle.patient?.uhid }} · <strong>IP:</strong> {{ bundle.invoice?.invoice_number ?? '—' }}</p>
                <p><strong>Sample collected:</strong> {{ longDateTime(lo.collected_at ?? lo.ordered_at) }}</p>
                @if (lo.reported_at) { <p><strong>Report released:</strong> {{ longDateTime(lo.reported_at) }}</p> }
                @if (lo.sample_id)   { <p><strong>Barcode:</strong> {{ lo.sample_id }}</p> }
                <p><strong>Referred by:</strong> {{ lo.ordering_doctor_name ?? bundle.doctor?.full_name }}</p>
              </div>
            </header>

            @for (group of resultGroups(lo); track group.name) {
              <div class="section">
                <h3>{{ group.name }}</h3>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Test name</th>
                      <th>Technology</th>
                      <th class="num">Value</th>
                      <th>Units</th>
                      <th>Bio. ref. interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of group.results; track r.test_code) {
                      <tr [class.abnormal]="abnormal(r)">
                        <td>{{ r.test_name }}</td>
                        <td class="small">{{ r.technology ?? '' }}</td>
                        <td class="num"><strong>{{ formatResultValue(r) }}</strong>{{ r.flag ? ' ' + r.flag : '' }}</td>
                        <td>{{ r.unit ?? '' }}</td>
                        <td class="small">{{ formatRefRange(r) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
                @if (group.methodology) {
                  <p class="small muted"><strong>Method:</strong> {{ group.methodology }}</p>
                }
                @if (group.clinicalSignificance) {
                  <p class="small muted clinical-note"><strong>Clinical significance:</strong> {{ group.clinicalSignificance }}</p>
                }
              </div>
            }

            <footer class="lab-footer small muted">
              <p>Reported by: {{ lo.reported_by_name ?? '—' }}</p>
              <p>This report is for clinical correlation only. Results may vary by laboratory technology / methodology.</p>
            </footer>
          </section>
        }
      }
    }

    <!-- ───────── Section C: Hospital Bill ───────── -->
    @if (includeBill() && bundle.invoice) {
      <section class="page">
        <header class="doc-header">
          <p class="dept-line">{{ bundle.branch?.name ?? 'Sree Diagnostics' }}</p>
          <h1>HOSPITAL BILL — TAX INVOICE</h1>
          <table class="kv-table">
            <tbody>
              <tr><th>Invoice No.</th><td>{{ bundle.invoice.invoice_number }}</td><th>Date</th><td>{{ shortDate(bundle.invoice.invoice_date ?? bundle.invoice.created_at) }}</td></tr>
              <tr><th>Patient</th><td>{{ bundle.patient?.full_name }}</td><th>UHID</th><td>{{ bundle.patient?.uhid }}</td></tr>
              <tr><th>IP No.</th><td>{{ bundle.invoice.invoice_number }}</td><th>Mobile</th><td>{{ bundle.patient?.mobile }}</td></tr>
              <tr><th>Doctor</th><td>{{ bundle.doctor?.full_name ?? '—' }}</td><th>Department</th><td>{{ deptOf(bundle.doctor) }}</td></tr>
              <tr><th>Admitted</th><td>{{ longDateTime(bundle.admission?.admitted_at) }}</td><th>Discharged</th><td>{{ longDateTime(bundle.admission?.discharged_at) }}</td></tr>
            </tbody>
          </table>
        </header>

        @for (g of billGroups(); track g.label) {
          <div class="section">
            <h3>{{ g.label }}</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th class="num">Qty</th>
                  <th class="num">Unit ₹</th>
                  <th class="num">Discount ₹</th>
                  <th class="num">Total ₹</th>
                </tr>
              </thead>
              <tbody>
                @for (it of g.items; track it.id; let idx = $index) {
                  <tr>
                    <td>{{ idx + 1 }}</td>
                    <td>{{ it.description }}</td>
                    <td class="num">{{ it.qty }}</td>
                    <td class="num">{{ rupees(it.unit_price_cents) }}</td>
                    <td class="num">{{ rupees(it.discount_cents) }}</td>
                    <td class="num">{{ rupees(it.total_cents) }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr><td colspan="5" class="num"><strong>Group subtotal</strong></td><td class="num"><strong>{{ rupees(g.subtotal) }}</strong></td></tr>
              </tfoot>
            </table>
          </div>
        }

        <div class="section bill-totals">
          <table class="data-table">
            <tbody>
              <tr><td>Subtotal</td><td class="num">{{ rupees(bundle.invoice.subtotal_cents) }}</td></tr>
              <tr><td>Discount</td><td class="num">− {{ rupees(bundle.invoice.discount_cents) }}</td></tr>
              <tr><td>CGST</td><td class="num">{{ rupees(bundle.invoice.cgst_cents) }}</td></tr>
              <tr><td>SGST</td><td class="num">{{ rupees(bundle.invoice.sgst_cents) }}</td></tr>
              <tr class="grand"><td><strong>Grand total</strong></td><td class="num"><strong>{{ rupees(bundle.invoice.total_cents) }}</strong></td></tr>
              <tr><td>Insurance / TPA</td><td class="num">− {{ rupees(insuranceCents()) }}</td></tr>
              <tr><td>Paid</td><td class="num">− {{ rupees(bundle.invoice.paid_cents) }}</td></tr>
              <tr class="grand"><td><strong>Balance due</strong></td><td class="num"><strong>{{ rupees(bundle.invoice.balance_cents) }}</strong></td></tr>
            </tbody>
          </table>
        </div>

        @if ((bundle.invoice_payments ?? []).length) {
          <div class="section">
            <h3>Payments received</h3>
            <table class="data-table">
              <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount ₹</th></tr></thead>
              <tbody>
                @for (p of bundle.invoice_payments; track p.id) {
                  <tr>
                    <td>{{ shortDateTime(p.paid_at) }}</td>
                    <td>{{ p.method }}</td>
                    <td>{{ p.reference ?? '—' }}</td>
                    <td class="num">{{ rupees(p.amount_cents) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <footer class="signatures">
          <div>
            <p class="sig-line">Patient / Attendant</p>
            <p>________________</p>
          </div>
          <div>
            <p class="sig-line">Billing officer</p>
            <p>________________</p>
          </div>
          <div class="text-right">
            <p>{{ bundle.branch?.name }}</p>
            <p class="small muted">Generated {{ longDateTime(now()) }}</p>
          </div>
        </footer>
      </section>
    }
  </main>
} @else {
  <p class="p-8 text-center text-[12px] text-danger-fg">Could not load discharge package.</p>
}
  `,
  styles: [`
    /* ─── Screen layout ─── */
    .screen-only { /* visible on screen, hidden on print */ }
    .print-root { background: #fff; color: #111; padding: 24px; max-width: 900px; margin: 0 auto; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; line-height: 1.45; }
    .page { page-break-after: always; padding: 16px 0; }
    .page:last-child { page-break-after: auto; }

    .doc-header { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #111; margin-bottom: 14px; }
    .doc-header h1 { font-size: 16px; font-weight: 700; letter-spacing: 0.05em; margin: 4px 0; }
    .dept-line { font-size: 13px; font-weight: 600; }
    .kv-table { width: 100%; margin-top: 8px; border-collapse: collapse; text-align: left; }
    .kv-table th { font-weight: 600; width: 18%; padding: 2px 6px; vertical-align: top; }
    .kv-table td { padding: 2px 6px; vertical-align: top; }

    .section { margin: 10px 0; page-break-inside: avoid; }
    .section h3 { font-size: 12px; font-weight: 700; margin: 0 0 4px 0; }
    .section p { margin: 0 0 4px 0; }
    .multiline { white-space: pre-wrap; }
    .small { font-size: 10px; }
    .muted { color: #555; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .text-right { text-align: right; }
    .clinical-note { margin-top: 4px; padding-left: 8px; border-left: 2px solid #ddd; }

    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { border-top: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
    .data-table thead th { background: #f3f4f6; border-top: 1px solid #999; border-bottom: 1px solid #999; font-weight: 600; font-size: 11px; }
    .data-table tfoot td { border-top: 2px solid #999; font-weight: 600; }
    .data-table tr.abnormal td { background: #fff7ed; }
    .data-table tr.abnormal td:nth-child(3) { color: #b45309; font-weight: 700; }

    .meds-list { padding-left: 18px; margin: 0; }
    .meds-list li { margin: 2px 0; }
    .ext-tag { color: #b45309; font-size: 10px; margin-left: 4px; }

    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 28px; }
    .sig-line { border-top: 1px solid #888; padding-top: 4px; font-size: 10px; color: #666; }

    .lab-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 2px solid #111; margin-bottom: 12px; }
    .lab-header .brand { font-size: 14px; font-weight: 700; }
    .lab-footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ddd; }

    .bill-totals .data-table td { border-top: none; padding: 3px 6px; }
    .bill-totals .data-table tr.grand td { border-top: 1px solid #999; padding-top: 5px; }

    .disclaimer { border-left: 4px solid #b45309; padding-left: 8px; background: #fff7ed; }

    .draft-watermark {
      position: fixed; inset: 0; pointer-events: none; z-index: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 180px; font-weight: 900; color: rgba(0,0,0,0.06);
      transform: rotate(-30deg); letter-spacing: 0.2em;
    }
    .print-root > section { position: relative; z-index: 1; }

    /* ─── Print rules ─── */
    @media print {
      .screen-only { display: none !important; }
      body { background: #fff; }
      .print-root { padding: 0; max-width: none; margin: 0; font-size: 10.5pt; }
      .page { padding: 0; }

      /* Repeat headers/footers across page breaks, never slice rows */
      table { page-break-inside: auto; border-collapse: collapse; }
      tr    { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }

      .draft-watermark { font-size: 220px; color: rgba(0,0,0,0.07); }
    }

    @page { size: A4; margin: 14mm 12mm; }
  `],
})
export class DischargePrintPage implements OnInit {
  private svc   = inject(DischargeBillingService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  protected loading = signal<boolean>(true);
  protected b       = signal<any | null>(null);

  protected includeSummary = signal(true);
  protected includeLabs    = signal(true);
  protected includeBill    = signal(true);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('admissionId');
    if (!id) { this.toast.error('Missing admission id'); return; }
    try {
      const bundle: any = await this.svc.getBundle(id);
      this.b.set(bundle);
    } catch (e) {
      this.toast.error('Could not load', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected summary       = computed<any>(() => this.b()?.summary ?? {});
  protected signed        = computed(() => !!this.summary()?.signed_at);
  protected labOrders     = computed<LabOrder[]>(() => this.b()?.lab_orders ?? []);
  protected takeHomeMeds  = computed<any[]>(() => this.b()?.take_home_meds ?? []);
  protected isLama        = computed(() => {
    const c = this.summary()?.condition_status;
    return c === 'lama' || c === 'dama';
  });

  protected keyInvestigations = computed<LabOrder[]>(() => {
    const ids = new Set(this.summary()?.key_investigation_lab_order_ids ?? []);
    return this.labOrders().filter((lo) => ids.has(lo.id));
  });

  protected resultGroups(lo: LabOrder): Array<{
    name: string; results: LabResult[]; methodology: string | null; clinicalSignificance: string | null;
  }> {
    const groups = new Map<string, LabResult[]>();
    for (const r of lo.results) {
      const k = r.panel_group || 'Other';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return Array.from(groups.entries()).map(([name, results]) => ({
      name, results,
      methodology: results.find((r) => r.methodology)?.methodology ?? null,
      clinicalSignificance: results.find((r) => r.clinical_significance)?.clinical_significance ?? null,
    }));
  }

  protected billGroups(): Array<{ label: string; items: any[]; subtotal: number }> {
    const items = (this.b()?.invoice_items ?? []) as any[];
    const map = new Map<string, any[]>();
    for (const it of items) {
      const key = KIND_LABEL[it.related_entity_type ?? ''] ?? 'Other charges';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).map(([label, gItems]) => ({
      label, items: gItems,
      subtotal: gItems.reduce((s, it) => s + Number(it.total_cents ?? 0), 0),
    }));
  }

  protected insuranceCents(): number {
    return Number(this.summary()?.insurance_claim_cents ?? 0);
  }

  protected print() { window.print(); }

  // ── Format helpers ────────────────────────────────────
  protected longDateTime(s?: string | null): string {
    if (!s) return '—';
    try { return format(parseISO(s), 'dd-MM-yyyy / HH:mm:ss'); } catch { return s; }
  }
  protected shortDateTime(s?: string | null): string {
    if (!s) return '';
    try { return format(parseISO(s), 'dd-MM-yyyy HH:mm'); } catch { return s; }
  }
  protected shortDate(s?: string | null): string {
    if (!s) return '';
    try { return format(parseISO(s), 'dd-MM-yyyy'); } catch { return s; }
  }
  protected now(): string { return new Date().toISOString(); }
  protected rupees(cents?: number | null): string {
    const v = Number(cents ?? 0) / 100;
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  protected formatResultValue(r: LabResult): string {
    if (r.value_numeric != null) return String(r.value_numeric);
    return r.value_text ?? '—';
  }
  protected formatRefRange(r: LabResult): string {
    if (r.reference_text) return r.reference_text;
    if (r.ref_min != null && r.ref_max != null) return `${r.ref_min} – ${r.ref_max}`;
    if (r.ref_min != null) return `> ${r.ref_min}`;
    if (r.ref_max != null) return `< ${r.ref_max}`;
    return '';
  }
  protected abnormal(r: LabResult): boolean {
    if (r.flag && r.flag.toUpperCase() !== 'N' && r.flag.toUpperCase() !== 'NORMAL') return true;
    if (r.value_numeric != null) {
      if (r.ref_min != null && r.value_numeric < r.ref_min) return true;
      if (r.ref_max != null && r.value_numeric > r.ref_max) return true;
    }
    return false;
  }
  protected patientAgeSex(p: any): string {
    if (!p) return '';
    const dob = p.date_of_birth ? new Date(p.date_of_birth) : null;
    const age = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : '';
    return `${age}${age ? 'Y' : ''} / ${(p.gender ?? '').toUpperCase()}`;
  }
  protected deptOf(d: any): string {
    return ((d?.metadata?.department as string) ?? d?.metadata?.specialty ?? 'GENERAL MEDICINE').toUpperCase();
  }
  protected primaryDxLabel(): string {
    return this.b()?.admission?.primary_diagnosis_icd10 ?? '';
  }
  protected conditionLabel(c: string | null | undefined): string {
    const m: Record<string, string> = {
      cured: 'Cured', relieved: 'Relieved', status_quo: 'Status quo',
      transferred: 'Transferred', referred: 'Referred',
      lama: 'Left Against Medical Advice (LAMA)',
      dama: 'Discharged Against Medical Advice (DAMA)',
      deceased: 'Deceased',
    };
    return c ? (m[c] ?? c) : '—';
  }
  protected formatTakeHome(m: any): string {
    const parts: string[] = [];
    if (m.form) parts.push(m.form === 'tab' ? 'Tab' : m.form === 'cap' ? 'Cap' : m.form === 'inj' ? 'Inj' : m.form);
    parts.push(m.drug_name);
    if (m.strength) parts.push(m.strength);
    if (m.dose) parts.push(m.dose);
    if (m.frequency) parts.push(m.frequency);
    if (m.is_continuous) parts.push('× continue');
    else if (m.duration_days) parts.push(`× ${m.duration_days} days`);
    let s = parts.join(' ');
    if (m.instructions) s += ` — ${m.instructions}`;
    return s + '.';
  }
}
