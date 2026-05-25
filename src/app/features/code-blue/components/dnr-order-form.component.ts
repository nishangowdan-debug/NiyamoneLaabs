import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CodeBlueService } from '../data/code-blue.service';
import {
  DNR_BASIS_LABELS, DNR_TYPE_LABELS,
  type DnrDecisionBasis, type DnrOrderType,
} from '../data/code-blue.types';

@Component({
  selector: 'app-dnr-order-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <div>
        <h3 class="text-base font-semibold">📋 DNR / DNI Order</h3>
        <p class="text-[11px] text-ink-soft">{{ patientName || patientId }}</p>
      </div>
      <button class="text-ink-soft hover:text-ink" (click)="cancel()">✕</button>
    </div>

    <div class="p-4 space-y-3 text-sm">
      <div class="rounded-md border border-warn-fg/40 bg-warn-fg/10 px-3 py-2 text-[11px] text-warn-fg">
        Creating a DNR order supersedes any prior active order for this patient/admission.
        Ensure family discussion is documented.
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Order Type *</span>
          <select [(ngModel)]="orderType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (t of orderTypeOptions; track t) {
              <option [value]="t">{{ orderTypeLabel(t) }}</option>
            }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Decision Basis *</span>
          <select [(ngModel)]="decisionBasis"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (b of basisOptions; track b) {
              <option [value]="b">{{ basisLabel(b) }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Authorizing Doctor *</span>
          <input [(ngModel)]="doctorName" placeholder="Dr. Full Name"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Effective Until (optional)</span>
          <input type="datetime-local" [(ngModel)]="effectiveUntil"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Family Discussion · When</span>
          <input type="datetime-local" [(ngModel)]="familyDiscussionAt"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Family Members Present</span>
          <input [(ngModel)]="familyPresent" placeholder="Spouse: Mrs. X · Son: Mr. Y"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Clinical Basis * (reasoning)</span>
          <textarea [(ngModel)]="clinicalBasis" rows="3"
                    placeholder="e.g. Stage IV malignancy with multi-organ failure, prognosis < 1 month, family + patient agree to focus on comfort care."
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>

        <label class="col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Notes</span>
          <textarea [(ngModel)]="notes" rows="2"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
      </div>

      @if (errorMsg()) { <p class="text-[12px] text-danger-fg">{{ errorMsg() }}</p> }
    </div>

    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || !canSubmit()"
              class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Saving…' : 'Create DNR Order' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class DnrOrderFormComponent {
  private cb = inject(CodeBlueService);

  @Input({ required: true }) patientId!: string;
  @Input() patientName?: string | null;
  @Input() admissionId: string | null = null;

  @Output() created = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  protected orderType: DnrOrderType = 'dnr_dni';
  protected decisionBasis: DnrDecisionBasis = 'family_request';
  protected doctorName = '';
  protected familyDiscussionAt = '';
  protected familyPresent = '';
  protected effectiveUntil = '';
  protected clinicalBasis = '';
  protected notes = '';

  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);

  protected orderTypeOptions: DnrOrderType[] = ['dnr','dni','dnr_dni','comfort_care_only','allow_natural_death'];
  protected basisOptions: DnrDecisionBasis[] = ['patient_request','family_request','doctor_recommendation','advance_directive','court_order','medical_futility'];
  protected orderTypeLabel = (t: DnrOrderType) => DNR_TYPE_LABELS[t];
  protected basisLabel = (b: DnrDecisionBasis) => DNR_BASIS_LABELS[b];

  protected canSubmit = computed(() =>
    !!this.clinicalBasis.trim() && !!this.doctorName.trim(),
  );

  protected async submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true); this.errorMsg.set(null);
    try {
      const id = await this.cb.createDnr({
        patientId: this.patientId,
        admissionId: this.admissionId,
        orderType: this.orderType,
        decisionBasis: this.decisionBasis,
        clinicalBasis: this.clinicalBasis.trim(),
        authorizingDoctorName: this.doctorName.trim(),
        familyDiscussionAt: this.familyDiscussionAt ? new Date(this.familyDiscussionAt).toISOString() : null,
        familyPresentNames: this.familyPresent.trim() || null,
        effectiveUntil: this.effectiveUntil ? new Date(this.effectiveUntil).toISOString() : null,
        notes: this.notes.trim() || null,
      });
      this.created.emit(id);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to create DNR order');
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel() { this.cancelled.emit(); }
}
