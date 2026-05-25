import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IdentityService } from '../data/identity.service';
import {
  CONTEXT_LABELS, METHOD_LABELS, RESULT_LABELS, WRISTBAND_TYPE_LABELS,
  type CheckMethod, type IdentityLookup, type IdentityVerification,
  type PatientWristband, type VerificationContext, type VerificationResult,
  type WristbandType,
} from '../data/identity.types';

type Tab = 'scan' | 'wristbands' | 'verifications' | 'issue';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Patient Identity (NABH IPSG-1)</h1>
    <p class="text-[12px] text-ink-soft">Wristbands · two-identifier verification at point-of-care · audit trail</p>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}<span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- SCAN -->
  @if (tab() === 'scan') {
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
        <h3 class="text-sm font-semibold">Scan Wristband</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Wristband UID / Barcode / RFID *</span>
          <input #scanInput [(ngModel)]="scanValue"
                 (keydown.enter)="lookup()"
                 placeholder="Scan or type and press Enter"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2 text-sm font-mono" />
        </label>
        <div class="flex gap-2">
          <button (click)="lookup()" [disabled]="!scanValue.trim() || lookupBusy()"
                  class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ lookupBusy() ? 'Looking up…' : 'Lookup' }}
          </button>
          <button (click)="clearLookup()" class="px-3 py-1.5 text-sm rounded-md border border-border">Clear</button>
        </div>
        @if (lookupError()) { <p class="text-[12px] text-danger-fg">{{ lookupError() }}</p> }
      </div>

      @if (lookupResult(); as r) {
        <div class="rounded-md border-2 p-4 space-y-2"
             [class.border-good-fg]="!r.has_allergy_alert && !r.has_dnr_alert"
             [class.border-danger-fg]="r.has_allergy_alert"
             [class.border-warn-fg]="r.has_dnr_alert && !r.has_allergy_alert">
          <h3 class="text-base font-bold">{{ r.full_name }}</h3>
          <div class="grid grid-cols-2 gap-2 text-[12px]">
            <div><span class="text-ink-soft">UHID:</span> <strong>{{ r.uhid }}</strong></div>
            <div><span class="text-ink-soft">DOB:</span> <strong>{{ r.date_of_birth || '—' }}</strong></div>
            <div><span class="text-ink-soft">Blood:</span> <strong>{{ r.blood_group || '—' }}</strong></div>
            <div><span class="text-ink-soft">Wristband:</span> <strong class="font-mono">{{ r.wristband_uid }}</strong></div>
          </div>
          @if (r.has_allergy_alert) {
            <div class="rounded-md bg-danger-fg text-white px-3 py-2 text-[12px] font-bold">
              ⚠ ALLERGY ALERT — check active allergies before any medication
            </div>
          }
          @if (r.has_dnr_alert) {
            <div class="rounded-md bg-warn-fg text-white px-3 py-2 text-[12px] font-bold">
              ⚠ DNR ON FILE — check active directive before resuscitation
            </div>
          }
          @if (r.has_fall_risk_alert) {
            <div class="rounded-md bg-amber-500 text-white px-3 py-2 text-[12px] font-bold">
              ⚠ FALL RISK
            </div>
          }
          <hr class="border-border" />
          <p class="text-[11px] text-ink-soft">Quick verify (NABH IPSG-1: ≥2 identifiers required)</p>
          <div class="flex flex-wrap gap-1">
            @for (id of identifierOptions; track id) {
              <label class="flex items-center gap-1 text-[11px] border border-border rounded px-2 py-0.5">
                <input type="checkbox"
                       [checked]="quickIdentifiers().includes(id)"
                       (change)="toggleIdentifier(id, $event)" />
                {{ id }}
              </label>
            }
          </div>
          <select [(ngModel)]="quickContext"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (c of contextOptions; track c) { <option [value]="c">{{ contextLabel(c) }}</option> }
          </select>
          <input [(ngModel)]="quickPerformedBy" placeholder="Your name"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          <button (click)="quickVerify(r)"
                  [disabled]="quickIdentifiers().length < 2 || !quickPerformedBy.trim()"
                  class="w-full px-3 py-2 text-sm rounded-md bg-good-fg text-white disabled:opacity-50">
            ✓ Confirm Identity ({{ quickIdentifiers().length }} identifiers)
          </button>
        </div>
      }
    </div>
  }

  <!-- WRISTBANDS -->
  @if (tab() === 'wristbands') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">UID</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Type</th><th class="px-3 py-2">Issued</th>
              <th class="px-3 py-2">Alerts</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (w of wristbands(); track w.id) {
            <tr class="border-t border-border" [class.opacity-60]="w.status !== 'active'">
              <td class="px-3 py-2 font-mono text-[11px]">{{ w.wristband_uid }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ w.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ wristbandTypeLabel(w.wristband_type) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ w.issued_at | date:'short' }}</td>
              <td class="px-3 py-2 text-[11px]">
                @if (w.has_allergy_alert) { <span class="text-danger-fg">A</span> }
                @if (w.has_dnr_alert)     { <span class="text-warn-fg">D</span> }
                @if (w.has_fall_risk_alert) { <span class="text-amber-500">F</span> }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ w.status }}</td>
              <td class="px-3 py-2 text-right">
                @if (w.status === 'active') {
                  <button (click)="removeWb(w)" class="text-[11px] text-danger-fg hover:underline">Remove</button>
                }
              </td>
            </tr>
          }
          @if (wristbands().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No wristbands.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- VERIFICATIONS -->
  @if (tab() === 'verifications') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Context</th><th class="px-3 py-2">Method</th>
              <th class="px-3 py-2">Result</th><th class="px-3 py-2">Identifiers</th>
              <th class="px-3 py-2">By</th></tr>
        </thead>
        <tbody>
          @for (v of verifications(); track v.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="v.result === 'mismatch'"
                [class.bg-warn-fg]="v.result === 'manual_override' || v.result === 'wristband_missing'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 text-[11px]">{{ v.performed_at | date:'short' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ v.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ contextLabel(v.context) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ methodLabel(v.method) }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="v.result === 'confirmed'"
                      [class.bg-danger-fg]="v.result === 'mismatch'"
                      [class.bg-warn-fg]="v.result === 'manual_override' || v.result === 'wristband_missing' || v.result === 'wristband_damaged'"
                      [class.text-white]="true">
                  {{ resultLabel(v.result) }}
                </span>
              </td>
              <td class="px-3 py-2 text-[10px] font-mono">{{ v.identifiers_used.join(', ') }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.performed_by_name || '—' }}</td>
            </tr>
          }
          @if (verifications().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No verifications logged.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- ISSUE WRISTBAND -->
  @if (tab() === 'issue') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-xl space-y-2">
      <h3 class="text-sm font-semibold">+ Issue Wristband</h3>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
        <input [(ngModel)]="iPatientId" placeholder="UUID"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
        <input [(ngModel)]="iAdmissionId" placeholder="UUID (optional)"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Wristband UID *</span>
        <input [(ngModel)]="iUid" placeholder="WB-001234"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Type</span>
        <select [(ngModel)]="iType"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          @for (t of wristbandTypeOptions; track t) { <option [value]="t">{{ wristbandTypeLabel(t) }}</option> }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">RFID Tag ID</span>
        <input [(ngModel)]="iRfid"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Barcode value</span>
        <input [(ngModel)]="iBarcode"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Printed data</span>
        <textarea rows="2" [(ngModel)]="iPrinted" placeholder="Name | UHID | DOB | Allergies"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Issued by (your name)</span>
        <input [(ngModel)]="iBy"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      @if (iError()) { <p class="text-[12px] text-danger-fg">{{ iError() }}</p> }
      @if (iSuccess()) { <p class="text-[12px] text-good-fg">{{ iSuccess() }}</p> }
      <div class="flex justify-end">
        <button (click)="issueWristband()"
                [disabled]="iBusy() || !iPatientId.trim() || !iUid.trim()"
                class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ iBusy() ? 'Issuing…' : 'Issue Wristband' }}
        </button>
      </div>
    </div>
  }
</section>
  `,
})
export class IdentityPage implements OnInit {
  private svc = inject(IdentityService);

  protected tab = signal<Tab>('scan');
  protected wristbands = signal<PatientWristband[]>([]);
  protected verifications = signal<IdentityVerification[]>([]);

  // Scan / lookup
  protected scanValue = '';
  protected lookupResult = signal<IdentityLookup | null>(null);
  protected lookupBusy = signal(false);
  protected lookupError = signal<string | null>(null);
  protected quickIdentifiers = signal<string[]>([]);
  protected quickContext: VerificationContext = 'medication';
  protected quickPerformedBy = '';

  // Issue form
  protected iPatientId = '';
  protected iAdmissionId = '';
  protected iUid = '';
  protected iType: WristbandType = 'barcode';
  protected iRfid = '';
  protected iBarcode = '';
  protected iPrinted = '';
  protected iBy = '';
  protected iBusy = signal(false);
  protected iError = signal<string | null>(null);
  protected iSuccess = signal<string | null>(null);

  protected wristbandTypeOptions: WristbandType[] = ['barcode','rfid','qr','printed_only','allergy_red','dnr_purple','fall_risk_yellow'];
  protected contextOptions: VerificationContext[] = ['admission','medication','blood_transfusion','procedure','specimen_collection','surgery','transfer','discharge','imaging','other'];
  protected identifierOptions = ['name','dob','uhid','wristband_uid','phone','aadhaar'];

  protected wristbandTypeLabel = (t: WristbandType) => WRISTBAND_TYPE_LABELS[t];
  protected contextLabel = (c: VerificationContext) => CONTEXT_LABELS[c];
  protected methodLabel = (m: CheckMethod) => METHOD_LABELS[m];
  protected resultLabel = (r: VerificationResult) => RESULT_LABELS[r];

  protected tabs = [
    { id: 'scan'          as Tab, label: 'Scan / Verify',  count: () => 0 },
    { id: 'wristbands'    as Tab, label: 'Wristbands',     count: () => this.wristbands().length },
    { id: 'verifications' as Tab, label: 'Audit Log',      count: () => this.verifications().length },
    { id: 'issue'         as Tab, label: '+ Issue',        count: () => 0 },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [w, v] = await Promise.all([
        this.svc.listWristbands({}),
        this.svc.listVerifications({}),
      ]);
      this.wristbands.set(w);
      this.verifications.set(v);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected toggleIdentifier(id: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    const set = new Set(this.quickIdentifiers());
    checked ? set.add(id) : set.delete(id);
    this.quickIdentifiers.set([...set]);
  }

  protected async lookup() {
    if (!this.scanValue.trim()) return;
    this.lookupBusy.set(true); this.lookupError.set(null); this.lookupResult.set(null);
    try {
      const r = await this.svc.lookup(this.scanValue.trim());
      if (!r) {
        this.lookupError.set('No active wristband found for this scan value.');
      } else {
        this.lookupResult.set(r);
      }
    } catch (e: any) { this.lookupError.set(e?.message ?? 'Failed'); }
    finally { this.lookupBusy.set(false); }
  }

  protected clearLookup() {
    this.scanValue = '';
    this.lookupResult.set(null);
    this.lookupError.set(null);
    this.quickIdentifiers.set([]);
  }

  protected async quickVerify(r: IdentityLookup) {
    if (this.quickIdentifiers().length < 2) return;
    try {
      await this.svc.verify({
        patientId: r.patient_id,
        context: this.quickContext,
        method: 'wristband_scan',
        result: 'confirmed',
        identifiersUsed: this.quickIdentifiers(),
        performedByName: this.quickPerformedBy.trim() || null,
        admissionId: r.admission_id,
        wristbandId: r.wristband_id,
      });
      alert('✓ Identity confirmed and logged.');
      this.quickIdentifiers.set([]);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async issueWristband() {
    if (!this.iPatientId.trim() || !this.iUid.trim()) return;
    this.iBusy.set(true); this.iError.set(null); this.iSuccess.set(null);
    try {
      await this.svc.issueWristband({
        patientId: this.iPatientId.trim(),
        wristbandUid: this.iUid.trim(),
        wristbandType: this.iType,
        admissionId: this.iAdmissionId.trim() || null,
        rfidTagId: this.iRfid.trim() || null,
        barcodeValue: this.iBarcode.trim() || null,
        printedData: this.iPrinted.trim() || null,
        issuedByName: this.iBy.trim() || null,
      });
      this.iSuccess.set('Wristband issued.');
      this.iPatientId = ''; this.iAdmissionId = ''; this.iUid = '';
      this.iRfid = ''; this.iBarcode = ''; this.iPrinted = '';
      await this.refresh();
      setTimeout(() => this.iSuccess.set(null), 3000);
    } catch (e: any) { this.iError.set(e?.message ?? 'Failed'); }
    finally { this.iBusy.set(false); }
  }

  protected async removeWb(w: PatientWristband) {
    const reason = prompt('Removal reason?');
    if (!reason) return;
    try { await this.svc.removeWristband(w.id, reason); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
