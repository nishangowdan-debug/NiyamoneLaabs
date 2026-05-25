import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OtService } from '../data/ot.service';
import {
  STATUS_LABELS, TEAM_ROLE_LABELS, WHO_CHECKLIST,
  type ChecklistPhase, type OtRecord, type OtRecordStatus, type OtTeamMember, type OtTeamRole,
} from '../data/ot.types';
import { ConsentCaptureComponent } from '../../consent/components/consent-capture.component';
import { SupabaseService } from '../../../core/supabase/supabase.service';

@Component({
  selector: 'app-ot-record-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ConsentCaptureComponent],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" (document:keydown.escape)="close()">
  <div class="w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <div>
        <h3 class="text-base font-semibold">{{ record.record_no }} · {{ statusLabel(record.status) }}</h3>
        <p class="text-[11px] text-ink-soft">{{ record.procedure_name }} · {{ record.ot_room || 'OT' }} · {{ record.primary_surgeon_name }}</p>
      </div>
      <button (click)="close()">✕</button>
    </div>

    <div class="p-4 space-y-4 text-sm">
      <!-- Consents banner -->
      <div class="grid grid-cols-2 gap-2">
        <button type="button" (click)="openConsent('SURGERY')"
                [attr.title]="record.consent_surgery_id ? 'Replace SURGERY consent' : 'Capture SURGERY consent'"
                class="rounded-md border px-3 py-2 text-[12px] text-left hover:opacity-80 transition-opacity"
                [class.border-good-fg]="record.consent_surgery_id"
                [class.bg-good-fg]="record.consent_surgery_id"
                [class.bg-opacity-10]="record.consent_surgery_id"
                [class.border-warn-fg]="!record.consent_surgery_id"
                [class.bg-warn-fg]="!record.consent_surgery_id">
          {{ record.consent_surgery_id ? '✓ SURGERY consent on file' : '⚠ SURGERY consent missing — click to capture' }}
        </button>
        <button type="button" (click)="openConsent('ANAESTHESIA')"
                [attr.title]="record.consent_anaesthesia_id ? 'Replace ANAESTHESIA consent' : 'Capture ANAESTHESIA consent'"
                class="rounded-md border px-3 py-2 text-[12px] text-left hover:opacity-80 transition-opacity"
                [class.border-good-fg]="record.consent_anaesthesia_id"
                [class.bg-good-fg]="record.consent_anaesthesia_id"
                [class.bg-opacity-10]="record.consent_anaesthesia_id"
                [class.border-warn-fg]="!record.consent_anaesthesia_id"
                [class.bg-warn-fg]="!record.consent_anaesthesia_id">
          {{ record.consent_anaesthesia_id ? '✓ ANAESTHESIA consent on file' : '⚠ ANAESTHESIA consent missing — click to capture' }}
        </button>
      </div>

      @if (consentOpen(); as code) {
        <app-consent-capture
          [patientId]="record.patient_id"
          [patientName]="patientName()"
          [admissionId]="record.admission_id ?? null"
          [encounterId]="record.encounter_id ?? null"
          [prefillFormCode]="code"
          [relatedEntityType]="'ot_surgical_record'"
          [relatedEntityId]="record.id"
          (closed)="consentOpen.set(null)"
          (saved)="onConsentSaved()" />
      }

      <!-- WHO Checklist -->
      <section>
        <h4 class="text-[12px] font-semibold uppercase text-ink-soft mb-2">WHO Surgical Safety Checklist</h4>
        <div class="grid lg:grid-cols-3 gap-3">
          @for (phase of phases; track phase) {
            <div class="rounded-md border border-border p-3 bg-surface-subtle">
              <div class="flex items-center justify-between mb-2">
                <h5 class="text-[11px] font-bold uppercase">{{ phase.replace('_', ' ') }}</h5>
                @if (phaseTime(phase); as ts) {
                  <span class="text-[10px] text-good-fg">✓ {{ ts | date:'shortTime' }}</span>
                }
              </div>
              @for (item of items(phase); track item.key) {
                <label class="flex items-start gap-1.5 text-[12px] py-0.5">
                  <input type="checkbox"
                         [checked]="isChecked(phase, item.key)"
                         (change)="toggleItem(phase, item.key, $event)"
                         class="mt-0.5" />
                  {{ item.label }}
                </label>
              }
              @if (record.status !== 'completed' && record.status !== 'cancelled') {
                <div class="mt-2 flex items-center gap-2">
                  <input [(ngModel)]="completedByName"
                         placeholder="Your name"
                         class="flex-1 text-[11px] rounded border border-border bg-surface px-1.5 py-1" />
                  <button (click)="savePhase(phase)" [disabled]="phaseBusy() === phase"
                          class="px-2 py-1 text-[10px] rounded bg-brand text-white disabled:opacity-50">
                    {{ phaseBusy() === phase ? '…' : (record[phaseTimeKey(phase)] ? 'Update' : 'Save') }}
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </section>

      <!-- Timing -->
      <section>
        <h4 class="text-[12px] font-semibold uppercase text-ink-soft mb-2">Timing</h4>
        <div class="grid grid-cols-3 md:grid-cols-6 gap-2 text-[12px]">
          @for (m of milestones; track m.field) {
            <div class="rounded-md border border-border p-2 bg-surface-subtle text-center">
              <p class="text-[10px] text-ink-soft uppercase">{{ m.label }}</p>
              <p class="font-semibold">{{ tsValue(m.field) ? (tsValue(m.field) | date:'mediumTime') : '—' }}</p>
              @if (record.status !== 'completed' && record.status !== 'cancelled' && !tsValue(m.field)) {
                <button (click)="markNow(m.field)" class="text-[10px] text-brand hover:underline">Mark now</button>
              }
            </div>
          }
        </div>
      </section>

      <!-- Team -->
      <section>
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Team ({{ team().length }})</h4>
          @if (record.status !== 'completed' && record.status !== 'cancelled') {
            <div class="flex gap-1.5">
              <input [(ngModel)]="newTeamName" placeholder="Name"
                     class="text-[11px] rounded border border-border bg-surface px-1.5 py-1" />
              <select [(ngModel)]="newTeamRole"
                      class="text-[11px] rounded border border-border bg-surface px-1.5 py-1">
                @for (r of teamRoles; track r) { <option [value]="r">{{ teamRoleLabel(r) }}</option> }
              </select>
              <button (click)="addTeam()" [disabled]="!newTeamName.trim()"
                      class="px-2 py-1 text-[11px] rounded bg-brand text-white disabled:opacity-50">+ Add</button>
            </div>
          }
        </div>
        <div class="flex flex-wrap gap-1.5">
          @for (m of team(); track m.id) {
            <span class="px-2 py-0.5 rounded-full bg-surface-subtle text-[11px]">
              <strong>{{ m.staff_name }}</strong> · {{ teamRoleLabel(m.role) }}
            </span>
          }
        </div>
      </section>

      <!-- Implants & specimens -->
      <section class="grid lg:grid-cols-2 gap-3">
        <div class="rounded-md border border-border p-3">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Implants ({{ record.implants_used.length }})</h4>
            @if (record.status !== 'completed' && record.status !== 'cancelled') {
              <button (click)="addImplant()" class="text-[11px] text-brand hover:underline">+ Add</button>
            }
          </div>
          <ul class="text-[11px] space-y-1">
            @for (i of record.implants_used; track $index) {
              <li class="border-l-2 border-brand pl-2">{{ i.name }} · {{ i.lot }} · exp {{ i.expiry || '—' }}</li>
            }
          </ul>
        </div>
        <div class="rounded-md border border-border p-3">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Specimens ({{ record.specimens_sent.length }})</h4>
            @if (record.status !== 'completed' && record.status !== 'cancelled') {
              <button (click)="addSpecimen()" class="text-[11px] text-brand hover:underline">+ Add</button>
            }
          </div>
          <ul class="text-[11px] space-y-1">
            @for (s of record.specimens_sent; track $index) {
              <li class="border-l-2 border-brand pl-2">{{ s.name }} · → {{ s.sent_to || '—' }}</li>
            }
          </ul>
        </div>
      </section>

      <!-- Close-out -->
      @if (record.status !== 'completed' && record.status !== 'cancelled') {
        <section class="rounded-md border border-border p-3 bg-surface-subtle">
          <h4 class="text-[12px] font-semibold uppercase text-ink-soft mb-2">Close-out</h4>
          <div class="grid md:grid-cols-2 gap-2">
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Post-op Diagnosis *</span>
              <input [(ngModel)]="closePostOp"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Procedure Performed *</span>
              <input [(ngModel)]="closeProcPerformed"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Operative Findings</span>
              <textarea rows="2" [(ngModel)]="closeFindings"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Complications</span>
              <textarea rows="1" [(ngModel)]="closeComplications"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Estimated Blood Loss (ml)</span>
              <input type="number" [(ngModel)]="closeBloodLoss"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <div class="grid grid-cols-3 gap-2">
              <label class="flex flex-col items-center text-[11px]">
                <span class="text-[10px] uppercase text-ink-soft">Sponge</span>
                <input type="checkbox" [(ngModel)]="spongeOk" />
              </label>
              <label class="flex flex-col items-center text-[11px]">
                <span class="text-[10px] uppercase text-ink-soft">Needle</span>
                <input type="checkbox" [(ngModel)]="needleOk" />
              </label>
              <label class="flex flex-col items-center text-[11px]">
                <span class="text-[10px] uppercase text-ink-soft">Instrument</span>
                <input type="checkbox" [(ngModel)]="instrumentOk" />
              </label>
            </div>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Debrief Notes (mandatory if any count is wrong)</span>
              <textarea rows="2" [(ngModel)]="closeDebrief"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
          </div>
          @if (closeError()) { <p class="text-[12px] text-danger-fg">{{ closeError() }}</p> }
          <div class="flex justify-end gap-2 mt-3">
            <button (click)="cancelRecord()" class="text-[12px] text-danger-fg hover:underline">Cancel record</button>
            <button (click)="completeRecord()" [disabled]="closeBusy()"
                    class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
              {{ closeBusy() ? 'Closing…' : 'Complete & Close' }}
            </button>
          </div>
        </section>
      }

      @if (record.status === 'completed') {
        <section class="rounded-md border border-good-fg p-3 bg-good-fg/5 text-[12px]">
          <strong>Completed.</strong> Post-op diagnosis: {{ record.post_op_diagnosis }}
          · Procedure performed: {{ record.procedure_performed }}
          · Counts: S {{ record.sponge_count_correct ? '✓' : '✗' }}
                   N {{ record.needle_count_correct ? '✓' : '✗' }}
                   I {{ record.instrument_count_correct ? '✓' : '✗' }}
        </section>
      }
    </div>
  </div>
</div>
  `,
})
export class OtRecordDetailComponent implements OnInit {
  private svc      = inject(OtService);
  private supabase = inject(SupabaseService);

  @Input({ required: true }) record!: OtRecord;
  @Output() closed = new EventEmitter<void>();

  // Consent capture state
  protected consentOpen = signal<'SURGERY' | 'ANAESTHESIA' | null>(null);
  protected patientName = signal<string | null>(null);

  protected team = signal<OtTeamMember[]>([]);
  protected phases: ChecklistPhase[] = ['sign_in','time_out','sign_out'];
  protected teamRoles: OtTeamRole[] = ['primary_surgeon','assistant_surgeon','anesthetist','assistant_anesthetist','scrub_nurse','circulating_nurse','technician','perfusionist','observer'];

  protected phaseBusy = signal<ChecklistPhase | null>(null);
  protected completedByName = '';
  protected newTeamName = '';
  protected newTeamRole: OtTeamRole = 'scrub_nurse';

  // Close-out
  protected closePostOp = '';
  protected closeProcPerformed = '';
  protected closeFindings = '';
  protected closeComplications = '';
  protected closeBloodLoss: number | null = null;
  protected spongeOk = true;
  protected needleOk = true;
  protected instrumentOk = true;
  protected closeDebrief = '';
  protected closeBusy = signal(false);
  protected closeError = signal<string | null>(null);

  protected milestones = [
    { field: 'anesthesia_start' as const, label: 'Anaesth start' },
    { field: 'incision_at'      as const, label: 'Incision' },
    { field: 'closure_at'       as const, label: 'Closure' },
    { field: 'anesthesia_end'   as const, label: 'Anaesth end' },
    { field: 'actual_start'     as const, label: 'Started' },
    { field: 'actual_end'       as const, label: 'Ended' },
  ];

  protected statusLabel = (s: OtRecordStatus) => STATUS_LABELS[s];
  protected teamRoleLabel = (r: OtTeamRole) => TEAM_ROLE_LABELS[r];

  protected items(phase: ChecklistPhase) { return WHO_CHECKLIST[phase]; }

  protected isChecked(phase: ChecklistPhase, key: string): boolean {
    const items = this.recordItems(phase);
    return !!items.find(i => i.key === key)?.checked;
  }

  protected toggleItem(phase: ChecklistPhase, key: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    const items = [...this.recordItems(phase)];
    const idx = items.findIndex(i => i.key === key);
    if (idx >= 0) items[idx] = { key, checked };
    else items.push({ key, checked });
    if (phase === 'sign_in')   this.record = { ...this.record, sign_in_items: items };
    if (phase === 'time_out')  this.record = { ...this.record, time_out_items: items };
    if (phase === 'sign_out')  this.record = { ...this.record, sign_out_items: items };
  }

  private recordItems(phase: ChecklistPhase): { key: string; checked: boolean }[] {
    if (phase === 'sign_in')   return this.record.sign_in_items ?? [];
    if (phase === 'time_out')  return this.record.time_out_items ?? [];
    return this.record.sign_out_items ?? [];
  }

  protected phaseTimeKey(phase: ChecklistPhase): 'sign_in_at' | 'time_out_at' | 'sign_out_at' {
    return phase === 'sign_in' ? 'sign_in_at'
         : phase === 'time_out' ? 'time_out_at'
         : 'sign_out_at';
  }

  protected phaseTime(phase: ChecklistPhase): string | null {
    return this.record[this.phaseTimeKey(phase)];
  }

  protected tsValue(field: keyof OtRecord): string | null {
    return (this.record[field] as string | null) ?? null;
  }

  ngOnInit() {
    this.refreshTeam();
    this.loadPatientName();
  }

  private async refreshTeam() {
    try { this.team.set(await this.svc.listTeam(this.record.id)); } catch {/* */}
  }

  private async loadPatientName() {
    try {
      const { data } = await (this.supabase.client as any)
        .from('patients')
        .select('full_name, first_name, last_name')
        .eq('id', this.record.patient_id)
        .maybeSingle();
      const name = data?.full_name?.trim()
        || `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()
        || null;
      this.patientName.set(name);
    } catch { /* */ }
  }

  protected openConsent(code: 'SURGERY' | 'ANAESTHESIA') {
    this.consentOpen.set(code);
  }

  protected async onConsentSaved() {
    this.consentOpen.set(null);
    // The auto-link trigger has already attached the consent FK; just refetch.
    try { this.record = await this.svc.getRecord(this.record.id); }
    catch { /* */ }
  }

  protected close() { this.closed.emit(); }

  protected async savePhase(phase: ChecklistPhase) {
    this.phaseBusy.set(phase);
    try {
      await this.svc.saveChecklist({
        recordId: this.record.id,
        phase,
        items: this.recordItems(phase),
        completedByName: this.completedByName.trim() || null,
      });
      this.record = await this.svc.getRecord(this.record.id);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
    finally { this.phaseBusy.set(null); }
  }

  protected async markNow(field: keyof OtRecord) {
    // Client-side gate: anaesthesia start needs both consents on file.
    // (Server enforces too — this just gives a clearer message before the round-trip.)
    if (field === 'anesthesia_start') {
      const missing: string[] = [];
      if (!this.record.consent_surgery_id)     missing.push('SURGERY');
      if (!this.record.consent_anaesthesia_id) missing.push('ANAESTHESIA');
      if (missing.length) {
        alert(`Cannot start anaesthesia: ${missing.join(' + ')} consent must be on file first.`);
        return;
      }
    }
    const now = new Date().toISOString();
    try {
      await this.svc.setMilestone({
        recordId: this.record.id,
        anesthesiaStart: field === 'anesthesia_start' ? now : undefined,
        incisionAt:      field === 'incision_at'      ? now : undefined,
        closureAt:       field === 'closure_at'       ? now : undefined,
        anesthesiaEnd:   field === 'anesthesia_end'   ? now : undefined,
        actualStart:     field === 'actual_start'     ? now : undefined,
        actualEnd:       field === 'actual_end'       ? now : undefined,
      });
      this.record = await this.svc.getRecord(this.record.id);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async addTeam() {
    if (!this.newTeamName.trim()) return;
    try {
      await this.svc.addTeam({ recordId: this.record.id, staffName: this.newTeamName.trim(), role: this.newTeamRole });
      this.newTeamName = '';
      await this.refreshTeam();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async addImplant() {
    const name = prompt('Implant name?'); if (!name) return;
    const lot  = prompt('Lot / batch?') ?? '';
    const expiry = prompt('Expiry (YYYY-MM-DD)?') ?? '';
    const manuf = prompt('Manufacturer?') ?? '';
    try {
      await this.svc.appendImplant(this.record.id, { name, lot, expiry, manufacturer: manuf });
      this.record = await this.svc.getRecord(this.record.id);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async addSpecimen() {
    const name = prompt('Specimen name?'); if (!name) return;
    const container = prompt('Container?') ?? '';
    const sentTo = prompt('Sent to (lab / pathology)?') ?? '';
    try {
      await this.svc.appendSpecimen(this.record.id, { name, container, sent_to: sentTo, sent_at: new Date().toISOString() });
      this.record = await this.svc.getRecord(this.record.id);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async completeRecord() {
    if (!this.closePostOp.trim() || !this.closeProcPerformed.trim()) {
      this.closeError.set('Post-op diagnosis & procedure performed are required');
      return;
    }
    this.closeBusy.set(true); this.closeError.set(null);
    try {
      await this.svc.completeRecord({
        recordId: this.record.id,
        postOpDiagnosis: this.closePostOp.trim(),
        procedurePerformed: this.closeProcPerformed.trim(),
        operativeFindings: this.closeFindings.trim() || null,
        complications: this.closeComplications.trim() || null,
        bloodLossMl: this.closeBloodLoss,
        spongeCountCorrect: this.spongeOk,
        needleCountCorrect: this.needleOk,
        instrumentCountCorrect: this.instrumentOk,
        debriefNotes: this.closeDebrief.trim() || null,
      });
      this.record = await this.svc.getRecord(this.record.id);
      this.closed.emit();
    } catch (e: any) { this.closeError.set(e?.message ?? 'Failed'); }
    finally { this.closeBusy.set(false); }
  }

  protected async cancelRecord() {
    const reason = prompt('Cancellation reason?'); if (!reason) return;
    try { await this.svc.cancelRecord(this.record.id, reason); this.closed.emit(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
