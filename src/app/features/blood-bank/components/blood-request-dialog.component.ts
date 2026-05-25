import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BloodBankService } from '../data/blood-bank.service';
import {
  BLOOD_GROUP_LABELS, COMPONENT_LABELS,
  type BBRequestPriority, type BloodComponent, type BloodGroup,
} from '../data/blood-bank.types';
import { bloodGroupTextToEnum } from '../data/blood-bank.utils';
import { ConsentService } from '../../consent/data/consent.service';

@Component({
  selector: 'app-blood-request-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-lg rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <div>
        <h3 class="text-base font-semibold">Request Blood / Component</h3>
        <p class="text-[11px] text-ink-soft">Patient: {{ patientName || patientId }}</p>
      </div>
      <button class="text-ink-soft hover:text-ink" (click)="cancel()">✕</button>
    </div>

    <div class="p-4 space-y-3">
      @if (consentMissing()) {
        <div class="rounded-md border border-warn-fg/40 bg-warn-fg/10 px-3 py-2 text-[12px] text-warn-fg">
          ⚠ No active <strong>TRANSFUSION</strong> consent on record. The request can be created,
          but units cannot be issued until consent is captured.
        </div>
      }

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Component</span>
          <select [(ngModel)]="component" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (c of componentOptions; track c) {
              <option [value]="c">{{ componentLabel(c) }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Blood Group</span>
          <select [(ngModel)]="bloodGroup" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (g of groupOptions; track g) {
              <option [value]="g">{{ groupLabel(g) }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Units</span>
          <input type="number" min="1" max="20"
                 [ngModel]="unitsRequired()" (ngModelChange)="unitsRequired.set(+$event || 0)"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Priority</span>
          <select [(ngModel)]="priority" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT (life-threatening)</option>
          </select>
        </label>

        <label class="col-span-2 block">
          <span class="text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Required by (optional)</span>
          <input type="datetime-local" [(ngModel)]="requiredBy"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="col-span-2 block">
          <span class="text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Clinical Indication</span>
          <textarea [ngModel]="indication()" (ngModelChange)="indication.set($event)" rows="2"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                    placeholder="e.g. Hb 6.2 — symptomatic anaemia"></textarea>
        </label>

        <label class="col-span-2 block">
          <span class="text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Notes (optional)</span>
          <textarea [(ngModel)]="notes" rows="2"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
      </div>

      @if (errorMsg()) {
        <p class="text-[12px] text-danger-fg">{{ errorMsg() }}</p>
      }
    </div>

    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || !canSubmit()"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Submitting…' : 'Create Request' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class BloodRequestDialogComponent implements OnInit {
  private bb = inject(BloodBankService);
  private consent = inject(ConsentService);

  @Input() patientId!: string;
  @Input() patientName?: string;
  @Input() admissionId: string | null = null;
  @Input() encounterId: string | null = null;
  @Input() doctorId: string | null = null;
  @Input() patientBloodGroupText: string | null = null; // 'A+', 'O-' etc.

  @Output() created = new EventEmitter<string>(); // request id
  @Output() cancelled = new EventEmitter<void>();

  protected component: BloodComponent = 'prbc';
  protected bloodGroup: BloodGroup = 'O_POS';
  // unitsRequired + indication are signals so canSubmit re-evaluates under
  // zoneless change detection (plain ngModel writes do not trigger CD).
  protected readonly unitsRequired = signal(1);
  protected priority: BBRequestPriority = 'routine';
  protected requiredBy = '';
  protected readonly indication = signal('');
  protected notes = '';

  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);
  protected consentMissing = signal(false);

  protected componentOptions: BloodComponent[] = ['prbc','whole_blood','ffp','platelets','single_donor_platelets','cryo'];
  protected groupOptions: BloodGroup[] = ['O_POS','O_NEG','A_POS','A_NEG','B_POS','B_NEG','AB_POS','AB_NEG'];

  protected readonly canSubmit = computed(() =>
    this.unitsRequired() > 0 && !!this.indication().trim());

  ngOnInit() {
    const fromText = bloodGroupTextToEnum(this.patientBloodGroupText);
    if (fromText) this.bloodGroup = fromText;
    this.checkConsent();
  }

  private async checkConsent() {
    try {
      const ok = await this.consent.hasActive(this.patientId, 'TRANSFUSION', this.admissionId);
      this.consentMissing.set(!ok);
    } catch { /* non-blocking */ }
  }

  protected componentLabel(c: BloodComponent) { return COMPONENT_LABELS[c]; }
  protected groupLabel(g: BloodGroup) { return BLOOD_GROUP_LABELS[g]; }

  protected async submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true);
    this.errorMsg.set(null);
    try {
      const id = await this.bb.createRequest({
        patientId: this.patientId,
        component: this.component,
        bloodGroup: this.bloodGroup,
        unitsRequired: this.unitsRequired(),
        priority: this.priority,
        admissionId: this.admissionId,
        encounterId: this.encounterId,
        doctorId: this.doctorId,
        indication: this.indication().trim() || null,
        requiredBy: this.requiredBy ? new Date(this.requiredBy).toISOString() : null,
        notes: this.notes.trim() || null,
      });
      this.created.emit(id);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to create request');
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel() { this.cancelled.emit(); }
}
