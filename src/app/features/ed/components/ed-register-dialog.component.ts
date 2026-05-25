import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EdService } from '../data/ed.service';
import { ARRIVAL_LABELS, type EdArrivalMode } from '../data/ed.types';

@Component({
  selector: 'app-ed-register-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-lg rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <h3 class="text-base font-semibold">ED Arrival</h3>
      <button class="text-ink-soft hover:text-ink" (click)="cancel()">✕</button>
    </div>
    <div class="p-4 grid grid-cols-2 gap-3 text-sm">
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Mode of arrival</span>
        <select [(ngModel)]="arrivalMode"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          @for (m of arrivalOptions; track m) { <option [value]="m">{{ arrivalLabel(m) }}</option> }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Patient ID (if known)</span>
        <input [(ngModel)]="patientId" placeholder="UUID"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block col-span-2">
        <span class="text-[10px] uppercase text-ink-soft">If unidentified — Walk-in name</span>
        <input [(ngModel)]="walkInName" placeholder="John Doe / Unknown male"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Age (approx.)</span>
        <input type="number" [(ngModel)]="walkInAge"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Gender</span>
        <select [(ngModel)]="walkInGender"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option [ngValue]="null">—</option>
          <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
        </select>
      </label>
      <label class="col-span-2 block">
        <span class="text-[10px] uppercase text-ink-soft">Chief Complaint *</span>
        <textarea rows="2" [(ngModel)]="chiefComplaint"
                  placeholder="Chest pain · Shortness of breath · RTA · etc."
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      @if (errorMsg()) { <p class="col-span-2 text-[12px] text-danger-fg">{{ errorMsg() }}</p> }
    </div>
    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || !canSubmit()"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Registering…' : 'Register Arrival' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class EdRegisterDialogComponent {
  private svc = inject(EdService);

  @Output() created = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  protected arrivalMode: EdArrivalMode = 'walk_in';
  protected patientId = '';
  protected walkInName = '';
  protected walkInAge: number | null = null;
  protected walkInGender: 'male' | 'female' | 'other' | null = null;
  protected chiefComplaint = '';
  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);

  protected arrivalOptions: EdArrivalMode[] = ['walk_in','ambulance','police','transferred','helicopter','self_transport','other'];
  protected arrivalLabel = (m: EdArrivalMode) => ARRIVAL_LABELS[m];

  protected canSubmit = computed(() =>
    !!this.chiefComplaint.trim() && (!!this.patientId.trim() || !!this.walkInName.trim()),
  );

  protected async submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true); this.errorMsg.set(null);
    try {
      const id = await this.svc.registerArrival({
        chiefComplaint: this.chiefComplaint.trim(),
        patientId: this.patientId.trim() || null,
        walkInName: this.walkInName.trim() || null,
        walkInAge: this.walkInAge,
        walkInGender: this.walkInGender,
        arrivalMode: this.arrivalMode,
      });
      this.created.emit(id);
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
    finally { this.busy.set(false); }
  }

  protected cancel() { this.cancelled.emit(); }
}
