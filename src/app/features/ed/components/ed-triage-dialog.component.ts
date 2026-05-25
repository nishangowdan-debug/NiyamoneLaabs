import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EdService } from '../data/ed.service';
import {
  ED_CRITICAL_INTERVENTIONS, ED_HIGH_RISK_OPTIONS, ED_RESOURCE_OPTIONS, ESI_COLORS,
  type EdVisit,
} from '../data/ed.types';

@Component({
  selector: 'app-ed-triage-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <div>
        <h3 class="text-base font-semibold">ESI Triage — {{ visit.visit_no }}</h3>
        <p class="text-[11px] text-ink-soft">{{ visit.chief_complaint }}</p>
      </div>
      <button (click)="cancel()">✕</button>
    </div>

    <div class="p-4 space-y-4 text-sm">
      <!-- ESI level chooser -->
      <div>
        <p class="text-[10px] uppercase text-ink-soft mb-2">ESI Level</p>
        <div class="grid grid-cols-5 gap-2">
          @for (level of [1,2,3,4,5]; track level) {
            <button (click)="setEsi(level)"
                    class="rounded-md p-3 text-white text-left border-2"
                    [class]="esiColor(level).bg"
                    [class.border-white]="esi() === level"
                    [class.border-transparent]="esi() !== level">
              <p class="text-xl font-bold">{{ level }}</p>
              <p class="text-[10px] leading-tight">{{ esiColor(level).description }}</p>
            </button>
          }
        </div>
      </div>

      <!-- Decision-tree helpers -->
      @if (esi() === 1 || (!esi() && criticalInterventions().length > 0)) {
        <div class="rounded-md border border-danger-fg p-3 bg-danger-fg/5">
          <p class="text-[12px] font-semibold text-danger-fg mb-2">
            Step A · Immediate life-saving intervention required?
          </p>
          <div class="grid grid-cols-2 gap-1.5">
            @for (k of criticalOptions; track k) {
              <label class="flex items-center gap-1.5 text-[12px]">
                <input type="checkbox"
                       [checked]="criticalInterventions().includes(k)"
                       (change)="toggleCritical(k, $event)" />
                {{ humanize(k) }}
              </label>
            }
          </div>
        </div>
      }

      @if (esi() === 2 || (!esi() && highRiskFactors().length > 0)) {
        <div class="rounded-md border border-warn-fg p-3 bg-warn-fg/5">
          <p class="text-[12px] font-semibold text-warn-fg mb-2">
            Step B · High-risk situation?
          </p>
          <label class="flex items-center gap-1.5 text-[12px] mb-1">
            <input type="checkbox" [(ngModel)]="vitalsDangerZone" />
            <strong>Vital signs in danger zone</strong>
            <span class="text-[10px] text-ink-soft">(adult HR&gt;100 / RR&gt;20 / SpO2&lt;92 / Temp&gt;38.5)</span>
          </label>
          <div class="grid grid-cols-2 gap-1.5">
            @for (k of highRiskOptions; track k) {
              <label class="flex items-center gap-1.5 text-[12px]">
                <input type="checkbox"
                       [checked]="highRiskFactors().includes(k)"
                       (change)="toggleHighRisk(k, $event)" />
                {{ humanize(k) }}
              </label>
            }
          </div>
        </div>
      }

      @if (esi() === 3 || esi() === 4 || esi() === 5 || (!esi() && resources().length > 0)) {
        <div class="rounded-md border border-border p-3 bg-surface-subtle">
          <p class="text-[12px] font-semibold mb-2">
            Step C · Resources anticipated <span class="text-ink-soft">({{ resources().length }})</span>
          </p>
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
            @for (r of resourceOptions; track r.key) {
              <label class="flex items-center gap-1.5 text-[12px]">
                <input type="checkbox"
                       [checked]="resources().includes(r.key)"
                       (change)="toggleResource(r.key, $event)" />
                {{ r.label }}
              </label>
            }
          </div>
          <p class="text-[10px] text-ink-soft mt-2">
            Guidance: 0 = ESI-5, 1 = ESI-4, ≥2 = ESI-3
          </p>
        </div>
      }

      <!-- Vitals -->
      <div class="rounded-md border border-border p-3">
        <p class="text-[12px] font-semibold uppercase text-ink-soft mb-2">Vitals at Triage</p>
        <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">BP</span>
            <input [(ngModel)]="vitalBp" placeholder="120/80"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">HR</span>
            <input type="number" [(ngModel)]="vitalHr"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">RR</span>
            <input type="number" [(ngModel)]="vitalRr"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">SpO2 %</span>
            <input type="number" [(ngModel)]="vitalSpo2"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Temp °C</span>
            <input type="number" step="0.1" [(ngModel)]="vitalTemp"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Pain (0-10)</span>
            <input type="number" min="0" max="10" [(ngModel)]="painScore"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
      </div>

      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Triage Notes</span>
        <textarea rows="2" [(ngModel)]="triageNotes"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Triaged by *</span>
        <input [(ngModel)]="triagedByName"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>

      @if (errorMsg()) { <p class="text-[12px] text-danger-fg">{{ errorMsg() }}</p> }
    </div>

    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || !canSubmit()"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Saving…' : 'Save Triage' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class EdTriageDialogComponent {
  private svc = inject(EdService);

  @Input({ required: true }) visit!: EdVisit;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  protected esi = signal<number | null>(null);
  protected resources = signal<string[]>([]);
  protected criticalInterventions = signal<string[]>([]);
  protected highRiskFactors = signal<string[]>([]);
  protected vitalsDangerZone = false;
  protected painScore: number | null = null;
  protected triageNotes = '';
  protected triagedByName = '';

  // Vitals
  protected vitalBp = '';
  protected vitalHr: number | null = null;
  protected vitalRr: number | null = null;
  protected vitalSpo2: number | null = null;
  protected vitalTemp: number | null = null;

  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);

  protected resourceOptions = ED_RESOURCE_OPTIONS;
  protected criticalOptions = ED_CRITICAL_INTERVENTIONS;
  protected highRiskOptions = ED_HIGH_RISK_OPTIONS;
  protected esiColor = (n: number) => ESI_COLORS[n];

  protected canSubmit = computed(() => this.esi() !== null && !!this.triagedByName.trim());
  protected humanize = (s: string) => s.replace(/_/g,' ');

  protected setEsi(level: number) { this.esi.set(level); }

  protected toggleCritical(k: string, e: Event) {
    const c = (e.target as HTMLInputElement).checked;
    const set = new Set(this.criticalInterventions());
    c ? set.add(k) : set.delete(k);
    this.criticalInterventions.set([...set]);
    if (c && this.esi() === null) this.esi.set(1);
  }
  protected toggleHighRisk(k: string, e: Event) {
    const c = (e.target as HTMLInputElement).checked;
    const set = new Set(this.highRiskFactors());
    c ? set.add(k) : set.delete(k);
    this.highRiskFactors.set([...set]);
    if (c && this.esi() === null) this.esi.set(2);
  }
  protected toggleResource(k: string, e: Event) {
    const c = (e.target as HTMLInputElement).checked;
    const set = new Set(this.resources());
    c ? set.add(k) : set.delete(k);
    this.resources.set([...set]);
    if (this.esi() === null || (this.esi()! >= 3 && this.esi()! <= 5)) {
      const n = set.size;
      this.esi.set(n === 0 ? 5 : (n === 1 ? 4 : 3));
    }
  }

  protected async submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true); this.errorMsg.set(null);
    try {
      await this.svc.performTriage({
        visitId: this.visit.id,
        esiLevel: this.esi()!,
        vitals: {
          bp: this.vitalBp || null,
          hr: this.vitalHr,
          rr: this.vitalRr,
          spo2: this.vitalSpo2,
          temp: this.vitalTemp,
        },
        resourcesAnticipated: this.resources(),
        criticalInterventions: this.criticalInterventions(),
        highRiskFactors: this.highRiskFactors(),
        vitalSignsDanger: this.vitalsDangerZone,
        painScore: this.painScore,
        triageNotes: this.triageNotes.trim() || null,
        triagedByName: this.triagedByName.trim(),
      });
      this.saved.emit();
    } catch (e: any) { this.errorMsg.set(e?.message ?? 'Failed'); }
    finally { this.busy.set(false); }
  }

  protected cancel() { this.cancelled.emit(); }
}
