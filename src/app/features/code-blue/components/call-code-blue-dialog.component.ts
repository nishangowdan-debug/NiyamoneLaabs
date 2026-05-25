import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CodeBlueService } from '../data/code-blue.service';

@Component({
  selector: 'app-call-code-blue-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-md rounded-lg bg-surface-card border-2 border-danger-fg shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 bg-danger-fg text-white flex items-center justify-between">
      <div>
        <h3 class="text-base font-bold tracking-wide">🚨 CODE BLUE</h3>
        <p class="text-[11px] opacity-90">Cardiopulmonary emergency</p>
      </div>
      <button class="text-white hover:opacity-80" (click)="cancel()">✕</button>
    </div>

    <div class="p-4 space-y-3">
      @if (dnrCheck() === 'has_dnr') {
        <div class="rounded-md border-2 border-warn-fg bg-warn-fg/10 px-3 py-2 text-[12px]">
          ⚠ <strong>This patient has an active DNR/DNI order.</strong> Standard practice is to honour
          the directive. Code Blue can still be logged (e.g. for documentation or if family revokes
          decision in real-time), but you must acknowledge in the cockpit.
        </div>
      }

      @if (patientName) {
        <p class="text-[12px]"><span class="text-ink-soft">Patient:</span> <strong>{{ patientName }}</strong></p>
      } @else {
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Location (if no patient ID)</span>
          <input [(ngModel)]="locationText" placeholder="e.g. ICU bed 3 / OPD waiting area"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
      }

      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Precipitating Event (optional)</span>
        <input [(ngModel)]="precipitatingEvent" placeholder="Witnessed collapse / sudden hypotension / etc."
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>

      @if (errorMsg()) { <p class="text-[12px] text-danger-fg">{{ errorMsg() }}</p> }
    </div>

    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || !canSubmit()"
              class="px-4 py-1.5 text-sm rounded-md bg-danger-fg text-white font-semibold disabled:opacity-50">
        {{ busy() ? 'Calling…' : 'CALL CODE BLUE' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class CallCodeBlueDialogComponent implements OnInit {
  private cb = inject(CodeBlueService);

  @Input() patientId: string | null = null;
  @Input() patientName: string | null = null;
  @Input() admissionId: string | null = null;
  @Input() encounterId: string | null = null;
  @Input() wardId: string | null = null;
  @Input() bedId: string | null = null;

  @Output() created = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  protected locationText = '';
  protected precipitatingEvent = '';
  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);
  protected dnrCheck = signal<'pending' | 'has_dnr' | 'no_dnr'>('pending');

  protected canSubmit = computed(() =>
    !!this.patientId || this.locationText.trim().length > 0,
  );

  ngOnInit() {
    if (this.patientId) {
      this.cb.hasActiveDnr(this.patientId, this.admissionId)
        .then(has => this.dnrCheck.set(has ? 'has_dnr' : 'no_dnr'))
        .catch(() => this.dnrCheck.set('no_dnr'));
    } else {
      this.dnrCheck.set('no_dnr');
    }
  }

  protected async submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true); this.errorMsg.set(null);
    try {
      const id = await this.cb.createEvent({
        patientId: this.patientId,
        admissionId: this.admissionId,
        encounterId: this.encounterId,
        wardId: this.wardId,
        bedId: this.bedId,
        locationText: this.locationText.trim() || null,
        precipitatingEvent: this.precipitatingEvent.trim() || null,
      });
      this.created.emit(id);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to create event');
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel() { this.cancelled.emit(); }
}
