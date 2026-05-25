import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OtService } from '../data/ot.service';
import {
  ANESTHESIA_LABELS,
  type AnesthesiaType, type AsaGrade, type SurgicalProcedure,
} from '../data/ot.types';

@Component({
  selector: 'app-ot-new-record-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <h3 class="text-base font-semibold">New OT Record</h3>
      <button class="text-ink-soft hover:text-ink" (click)="cancel()">✕</button>
    </div>
    <div class="p-4 grid grid-cols-2 gap-3 text-sm">
      <label class="col-span-2 block">
        <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
        <input [(ngModel)]="patientId" placeholder="UUID"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Procedure *</span>
        <select [(ngModel)]="procedureId" (ngModelChange)="onProcSelect($event)"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option [ngValue]="null">— pick —</option>
          @for (p of procedures; track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">OT Room</span>
        <input [(ngModel)]="otRoom" placeholder="OT-1"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Primary Surgeon</span>
        <input [(ngModel)]="surgeon" placeholder="Dr. ..."
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Anesthetist</span>
        <input [(ngModel)]="anesthetist" placeholder="Dr. ..."
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">ASA Grade</span>
        <select [(ngModel)]="asaGrade"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option [ngValue]="null">—</option>
          <option value="I">I</option><option value="II">II</option><option value="III">III</option>
          <option value="IV">IV</option><option value="V">V</option><option value="VI">VI</option>
          <option value="E">E (emergency)</option>
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Anesthesia Type</span>
        <select [(ngModel)]="anesthesiaType"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option [ngValue]="null">—</option>
          @for (a of anesthesiaTypes; track a) { <option [value]="a">{{ anesthLabel(a) }}</option> }
        </select>
      </label>
      <label class="col-span-2 block">
        <span class="text-[10px] uppercase text-ink-soft">Scheduled Start</span>
        <input type="datetime-local" [(ngModel)]="scheduledStart"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="col-span-2 block">
        <span class="text-[10px] uppercase text-ink-soft">Pre-op Diagnosis</span>
        <textarea [(ngModel)]="preOpDiagnosis" rows="2"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      @if (errorMsg()) { <p class="col-span-2 text-[12px] text-danger-fg">{{ errorMsg() }}</p> }
    </div>
    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || !canSubmit()"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Creating…' : 'Create Record' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class OtNewRecordDialogComponent {
  private svc = inject(OtService);

  @Input() procedures: SurgicalProcedure[] = [];
  @Output() created = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  protected patientId = '';
  protected procedureId: string | null = null;
  protected otRoom = '';
  protected surgeon = '';
  protected anesthetist = '';
  protected asaGrade: AsaGrade | null = null;
  protected anesthesiaType: AnesthesiaType | null = null;
  protected scheduledStart = '';
  protected preOpDiagnosis = '';

  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);

  protected anesthesiaTypes: AnesthesiaType[] = ['general','regional','spinal','epidural','combined_spinal_epidural','local','sedation','none'];
  protected anesthLabel = (a: AnesthesiaType) => ANESTHESIA_LABELS[a];

  protected canSubmit = computed(() => !!this.patientId.trim() && !!this.procedureId);

  protected onProcSelect(id: string | null) {
    this.procedureId = id;
    if (id) {
      const p = this.procedures.find(x => x.id === id);
      if (p && !this.asaGrade) this.asaGrade = p.default_asa_grade;
    }
  }

  protected async submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true); this.errorMsg.set(null);
    try {
      const proc = this.procedures.find(p => p.id === this.procedureId)!;
      const id = await this.svc.createRecord({
        patientId: this.patientId.trim(),
        procedureName: proc.name,
        procedureId: proc.id,
        otRoom: this.otRoom.trim() || null,
        primarySurgeonName: this.surgeon.trim() || null,
        anesthetistName: this.anesthetist.trim() || null,
        asaGrade: this.asaGrade,
        anesthesiaType: this.anesthesiaType,
        scheduledStart: this.scheduledStart ? new Date(this.scheduledStart).toISOString() : null,
        preOpDiagnosis: this.preOpDiagnosis.trim() || null,
      });
      this.created.emit(id);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel() { this.cancelled.emit(); }
}
