import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output,
  computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BloodBankService } from '../data/blood-bank.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import type {
  BloodRequest, BloodUnit, TransfusionOutcome, TransfusionReaction, TransfusionRecord,
} from '../data/blood-bank.types';

type Step = 'pre' | 'mid' | 'post';
interface DoctorOption { id: string; full_name: string }

interface Vitals {
  bp:    string;
  pulse: number | null;
  temp:  number | null;
  spo2:  number | null;
  rr:    number | null;
  notes: string;
}

const EMPTY: Vitals = { bp: '', pulse: null, temp: null, spo2: null, rr: null, notes: '' };

/**
 * Bedside transfusion run-sheet for a single unit. Wraps:
 *   bb_transfusion_start        (pre-vitals + start)
 *   bb_transfusion_record_15min (mid-transfusion check)
 *   bb_transfusion_complete     (post-vitals + outcome → fires auto-bill trigger)
 *
 * Accepts a request + the specific unit being transfused. If a record is already
 * in-progress for that unit (e.g. user resumed the screen), it picks up where
 * it left off based on which vitals fields are populated.
 */
@Component({
  selector: 'app-transfusion-runsheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" (document:keydown.escape)="close()">
  <div role="dialog" class="w-full max-w-[640px] max-h-[92vh] overflow-y-auto bg-surface-card border border-border rounded-[10px] shadow-pop"
       (click)="$event.stopPropagation()">
    <header class="px-5 py-4 border-b border-border">
      <h2 class="font-display text-[18px] font-medium text-ink">Transfusion run-sheet</h2>
      <p class="text-[12px] text-ink-muted mt-0.5">
        {{ request.request_no }} · Unit <span class="font-mono">{{ unit.unit_no }}</span>
        · {{ unit.blood_group }} {{ unit.component }}
        @if (record(); as r) { · started {{ r.started_at | date:'shortTime' }} }
      </p>
    </header>

    <!-- Step indicator -->
    <ol class="flex items-center px-5 py-3 gap-1 border-b border-border bg-surface-subtle">
      @for (s of steps; track s.key) {
        <li class="flex-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase"
            [class.text-primary-700]="step() === s.key"
            [class.text-good-fg]="stepDone(s.key)"
            [class.text-ink-muted]="step() !== s.key && !stepDone(s.key)">
          <span class="size-5 rounded-full grid place-items-center text-white text-[10px] shrink-0"
                [class.bg-primary-700]="step() === s.key"
                [class.bg-good-fg]="stepDone(s.key)"
                [class.bg-ink-muted]="step() !== s.key && !stepDone(s.key)">
            {{ stepDone(s.key) ? '✓' : s.idx }}
          </span>
          {{ s.label }}
        </li>
      }
    </ol>

    <div class="p-5 space-y-4">
      <!-- ── PRE ── -->
      @if (step() === 'pre') {
        <p class="text-[12px] text-ink-soft">
          Confirm IV line is patent (≥18G), prime with normal saline, then capture pre-vitals.
        </p>

        <label class="block">
          <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5 block">Supervising doctor *</span>
          <select [(ngModel)]="supervisingDoctorId"
                  class="w-full h-9 px-2.5 text-[13px] rounded-md border border-border bg-surface text-ink">
            <option value="">— select —</option>
            @for (d of doctors(); track d.id) {
              <option [value]="d.id">{{ d.full_name }}</option>
            }
          </select>
        </label>

        <ng-container *ngTemplateOutlet="vitalsForm; context: { $implicit: pre, label: 'Pre-vitals' }"></ng-container>

        <div class="flex justify-end gap-2 pt-2">
          <button (click)="close()" [disabled]="busy()"
                  class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
            Cancel
          </button>
          <button (click)="startTransfusion()" [disabled]="busy() || !canStart()"
                  class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
            {{ busy() ? 'Starting…' : 'Start transfusion ▶' }}
          </button>
        </div>
      }

      <!-- ── 15-MIN ── -->
      @if (step() === 'mid') {
        <p class="text-[12px] text-warn-fg bg-warn-bg/40 border border-warn-fg/30 rounded-md px-3 py-2">
          ⚠ During the first 15 minutes, drip rate is 2 ml/min. Stay bedside.
          Stop the transfusion and call the supervising doctor on any reaction.
        </p>
        <ng-container *ngTemplateOutlet="vitalsForm; context: { $implicit: mid, label: '15-min vitals' }"></ng-container>

        <div class="flex justify-between gap-2 pt-2">
          <button (click)="abort()" [disabled]="busy()"
                  class="h-9 px-3 rounded-md border border-danger-fg text-danger-fg text-[12px] font-medium hover:bg-danger-fg/10 disabled:opacity-50">
            ⚠ Abort / Reaction
          </button>
          <div class="flex gap-2">
            <button (click)="close()" [disabled]="busy()"
                    class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              Save & close
            </button>
            <button (click)="record15min()" [disabled]="busy() || !canMid()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save 15-min check ▶' }}
            </button>
          </div>
        </div>
      }

      <!-- ── POST ── -->
      @if (step() === 'post') {
        <p class="text-[12px] text-ink-soft">
          Capture post-transfusion vitals and finalise the outcome. Saving fires the auto-billing trigger.
        </p>
        <ng-container *ngTemplateOutlet="vitalsForm; context: { $implicit: post, label: 'Post-vitals' }"></ng-container>

        <div class="grid grid-cols-2 gap-3">
          <label>
            <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5 block">Outcome *</span>
            <select [(ngModel)]="outcome"
                    class="w-full h-9 px-2.5 text-[13px] rounded-md border border-border bg-surface text-ink">
              <option value="completed">Completed</option>
              <option value="aborted">Aborted</option>
              <option value="reaction">Reaction</option>
            </select>
          </label>
          <label>
            <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5 block">Reaction severity</span>
            <select [(ngModel)]="reaction"
                    class="w-full h-9 px-2.5 text-[13px] rounded-md border border-border bg-surface text-ink">
              <option value="none">None</option>
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </label>
        </div>
        @if (reaction !== 'none' || outcome === 'reaction') {
          <label class="block">
            <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5 block">Reaction notes</span>
            <textarea [(ngModel)]="reactionNotes" rows="2"
                      placeholder="Symptoms, time of onset, action taken (medication / supervising doctor informed)"
                      class="w-full text-[13px] px-2.5 py-1.5 rounded-md border border-border bg-surface resize-none"></textarea>
          </label>
        }

        <div class="flex justify-end gap-2 pt-2">
          <button (click)="close()" [disabled]="busy()"
                  class="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
            Cancel
          </button>
          <button (click)="completeTransfusion()" [disabled]="busy() || !canPost()"
                  class="h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-medium disabled:opacity-50">
            {{ busy() ? 'Closing…' : '✓ Complete & bill' }}
          </button>
        </div>
      }
    </div>
  </div>
</div>

<!-- Reusable vitals capture form -->
<ng-template #vitalsForm let-v let-label="label">
  <div class="rounded-md border border-border p-3 bg-surface-subtle">
    <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted mb-2">{{ label }}</p>
    <div class="grid grid-cols-3 gap-3">
      <label>
        <span class="text-[10px] text-ink-muted block mb-1">BP (sys/dia)</span>
        <input type="text" [(ngModel)]="v.bp" placeholder="120/80"
               class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink font-mono"/>
      </label>
      <label>
        <span class="text-[10px] text-ink-muted block mb-1">Pulse (bpm)</span>
        <input type="number" [(ngModel)]="v.pulse" min="30" max="200"
               class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/>
      </label>
      <label>
        <span class="text-[10px] text-ink-muted block mb-1">Temp (°C)</span>
        <input type="number" step="0.1" [(ngModel)]="v.temp" min="34" max="42"
               class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/>
      </label>
      <label>
        <span class="text-[10px] text-ink-muted block mb-1">SpO₂ (%)</span>
        <input type="number" [(ngModel)]="v.spo2" min="50" max="100"
               class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/>
      </label>
      <label>
        <span class="text-[10px] text-ink-muted block mb-1">RR (/min)</span>
        <input type="number" [(ngModel)]="v.rr" min="6" max="60"
               class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/>
      </label>
      <label class="col-span-1">
        <span class="text-[10px] text-ink-muted block mb-1">Note</span>
        <input type="text" [(ngModel)]="v.notes"
               class="w-full h-8 px-2 text-[12px] rounded-md border border-border bg-surface text-ink"/>
      </label>
    </div>
  </div>
</ng-template>
  `,
})
export class TransfusionRunsheetComponent implements OnInit {
  private bb       = inject(BloodBankService);
  private supabase = inject(SupabaseService);
  private toast    = inject(ToastService);

  @Input({ required: true }) request!: BloodRequest;
  @Input({ required: true }) unit!: BloodUnit;
  @Output() closed = new EventEmitter<void>();
  @Output() saved  = new EventEmitter<TransfusionRecord>();

  protected readonly steps = [
    { key: 'pre' as Step,  idx: 1, label: 'Pre-vitals' },
    { key: 'mid' as Step,  idx: 2, label: '15-min check' },
    { key: 'post' as Step, idx: 3, label: 'Post & complete' },
  ];

  protected readonly busy    = signal(false);
  protected readonly step    = signal<Step>('pre');
  protected readonly record  = signal<TransfusionRecord | null>(null);
  protected readonly doctors = signal<DoctorOption[]>([]);

  protected supervisingDoctorId = '';
  protected pre:  Vitals = { ...EMPTY };
  protected mid:  Vitals = { ...EMPTY };
  protected post: Vitals = { ...EMPTY };
  protected outcome:  TransfusionOutcome = 'completed';
  protected reaction: TransfusionReaction = 'none';
  protected reactionNotes = '';

  async ngOnInit() {
    await Promise.all([this.loadDoctors(), this.resumeIfOpen()]);
  }

  private async loadDoctors() {
    const { data } = await (this.supabase.client as any)
      .from('staff')
      .select('id, full_name')
      .eq('role_slug', 'doctor')
      .eq('is_active', true)
      .order('full_name');
    this.doctors.set((data ?? []) as DoctorOption[]);
  }

  /** If a record already exists for this unit, jump to the right step. */
  private async resumeIfOpen() {
    try {
      const open = await this.bb.findOpenTransfusion(this.unit.id);
      if (!open) return;
      this.record.set(open);
      this.pre = { ...EMPTY, ...(open.vitals_pre as Partial<Vitals>) };
      this.supervisingDoctorId = open.supervising_doctor ?? '';
      if (open.vitals_15min) {
        this.mid = { ...EMPTY, ...(open.vitals_15min as Partial<Vitals>) };
        this.step.set('post');
      } else {
        this.step.set('mid');
      }
    } catch {/* ignore */}
  }

  protected stepDone(s: Step): boolean {
    if (s === 'pre')  return !!this.record();
    if (s === 'mid')  return !!this.record()?.vitals_15min;
    if (s === 'post') return !!this.record()?.outcome;
    return false;
  }

  protected canStart(): boolean {
    return !!this.supervisingDoctorId && !!this.pre.bp.trim() && this.pre.pulse !== null;
  }
  protected canMid(): boolean {
    return !!this.mid.bp.trim() && this.mid.pulse !== null;
  }
  protected canPost(): boolean {
    return !!this.post.bp.trim() && this.post.pulse !== null;
  }

  protected close() { this.closed.emit(); }

  protected async startTransfusion() {
    if (!this.canStart()) return;
    this.busy.set(true);
    try {
      const r = await this.bb.transfusionStart({
        requestId: this.request.id,
        unitId:    this.unit.id,
        supervisingDoctor: this.supervisingDoctorId,
        vitalsPre: { ...this.pre } as unknown as Record<string, unknown>,
      });
      this.record.set(r);
      this.toast.success('Transfusion started', `Unit ${this.unit.unit_no} · pre-vitals saved`);
      this.step.set('mid');
    } catch (e: any) {
      this.toast.error('Could not start', e?.message ?? 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async record15min() {
    const rec = this.record();
    if (!rec || !this.canMid()) return;
    this.busy.set(true);
    try {
      const r = await this.bb.transfusionRecord15min(rec.id, { ...this.mid } as unknown as Record<string, unknown>);
      this.record.set(r);
      this.toast.success('15-min vitals saved');
      this.step.set('post');
    } catch (e: any) {
      this.toast.error('Could not save', e?.message ?? 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected abort() {
    this.outcome  = 'aborted';
    this.reaction = 'mild';
    this.step.set('post');
  }

  protected async completeTransfusion() {
    const rec = this.record();
    if (!rec || !this.canPost()) return;
    if ((this.outcome === 'reaction' || this.reaction !== 'none') && !this.reactionNotes.trim()) {
      this.toast.warn('Reaction notes required', 'Document symptoms + actions taken before closing.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await this.bb.transfusionComplete({
        recordId:   rec.id,
        vitalsPost: { ...this.post } as unknown as Record<string, unknown>,
        outcome:    this.outcome,
        reaction:   this.reaction,
        reactionNotes: this.reactionNotes.trim() || null,
      });
      this.record.set(r);
      this.toast.success('Transfusion closed', `Outcome: ${this.outcome}. Charges posted.`);
      this.saved.emit(r);
      this.closed.emit();
    } catch (e: any) {
      this.toast.error('Could not close', e?.message ?? 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
