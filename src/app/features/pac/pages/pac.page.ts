import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PacService } from '../data/pac.service';
import {
  COMORBIDITY_OPTIONS, PAC_STATUS_LABELS,
  type DentitionStatus, type MallampatiClass, type NeckMobility,
  type PacEvaluation, type PacStatus, type PostopDisposition, type PregnancyStatus,
} from '../data/pac.types';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Pre-Anaesthesia Evaluation</h1>
      <p class="text-[12px] text-ink-soft">PAC checklist · ASA grading · NPO &amp; airway assessment · NABH-aligned</p>
    </div>
    <button (click)="showNew.set(true)"
            class="px-3 py-1.5 text-[13px] rounded-md bg-brand text-white">+ New PAC</button>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (s of statusFilters; track s) {
      <button (click)="filter.set(s)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="filter() === s"
              [class.border-brand]="filter() === s"
              [class.border-transparent]="filter() !== s"
              [class.text-ink-soft]="filter() !== s">
        {{ s === 'all' ? 'All' : (s | titlecase) }}
        <span class="ml-1 text-[10px] text-ink-soft">{{ countFor(s) }}</span>
      </button>
    }
  </nav>

  <div class="rounded-md border border-border bg-surface-card">
    <table class="min-w-full text-[12px]">
      <thead class="text-ink-soft text-left">
        <tr><th class="px-3 py-2">PAC No</th><th class="px-3 py-2">Patient</th>
            <th class="px-3 py-2">Procedure</th><th class="px-3 py-2">ASA</th>
            <th class="px-3 py-2">Anaesth.</th><th class="px-3 py-2">Surgery</th>
            <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Action</th></tr>
      </thead>
      <tbody>
        @for (p of filtered(); track p.id) {
          <tr class="border-t border-border">
            <td class="px-3 py-2 font-mono">{{ p.evaluation_no }}</td>
            <td class="px-3 py-2 font-mono text-[10px]">{{ p.patient_id.slice(0,8) }}</td>
            <td class="px-3 py-2">{{ p.planned_procedure_name }}</td>
            <td class="px-3 py-2 font-bold">{{ p.asa_grade }}</td>
            <td class="px-3 py-2 text-[11px]">{{ p.anaesthetist_name }}</td>
            <td class="px-3 py-2 text-[11px]">{{ p.planned_surgery_at ? (p.planned_surgery_at | date:'short') : '—' }}</td>
            <td class="px-3 py-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                    [class.bg-good-fg]="p.status === 'final'"
                    [class.bg-warn-fg]="p.status === 'draft'"
                    [class.bg-blue-500]="p.status === 'amended'"
                    [class.bg-surface-subtle]="p.status === 'cancelled'"
                    [class.text-white]="p.status !== 'cancelled'">
                {{ statusLabel(p.status) }}
              </span>
            </td>
            <td class="px-3 py-2 text-right">
              <button (click)="open(p)" class="text-[11px] text-brand hover:underline">Open</button>
            </td>
          </tr>
        }
        @if (filtered().length === 0) {
          <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No PACs yet.</td></tr>
        }
      </tbody>
    </table>
  </div>
</section>

<!-- New PAC dialog -->
@if (showNew()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="showNew.set(false)">
    <div class="w-full max-w-md rounded-lg bg-surface-card border border-border shadow-2xl p-4 space-y-2"
         (click)="$event.stopPropagation()">
      <h3 class="text-base font-semibold">New PAC</h3>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
        <input [(ngModel)]="nPatient" placeholder="UUID"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Procedure *</span>
        <input [(ngModel)]="nProcedure"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Planned surgery</span>
        <input type="datetime-local" [(ngModel)]="nSurgeryAt"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Anaesthetist *</span>
        <input [(ngModel)]="nAnaesth"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Initial ASA *</span>
        <select [(ngModel)]="nAsa"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option value="I">I</option><option value="II">II</option><option value="III">III</option>
          <option value="IV">IV</option><option value="V">V</option><option value="VI">VI</option>
          <option value="E">E</option>
        </select>
      </label>
      @if (nError()) { <p class="text-[12px] text-danger-fg">{{ nError() }}</p> }
      <div class="flex justify-end gap-2 pt-1">
        <button (click)="showNew.set(false)" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
        <button (click)="createDraft()"
                [disabled]="!nPatient.trim() || !nProcedure.trim() || !nAnaesth.trim() || nBusy()"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ nBusy() ? 'Creating…' : 'Create draft' }}
        </button>
      </div>
    </div>
  </div>
}

<!-- Detail dialog -->
@if (selected(); as p) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" (document:keydown.escape)="closeDetail()">
    <div class="w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
         (click)="$event.stopPropagation()">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold">{{ p.evaluation_no }} · {{ statusLabel(p.status) }}</h3>
          <p class="text-[11px] text-ink-soft">{{ p.planned_procedure_name }} · {{ p.anaesthetist_name }}</p>
        </div>
        <button (click)="closeDetail()">✕</button>
      </div>

      <div class="px-4 pt-3 flex gap-1 border-b border-border">
        @for (s of sections; track s.id) {
          <button (click)="section.set(s.id)"
                  class="px-3 py-1.5 text-[12px] font-medium border-b-2 -mb-px"
                  [class.text-brand]="section() === s.id"
                  [class.border-brand]="section() === s.id"
                  [class.border-transparent]="section() !== s.id"
                  [class.text-ink-soft]="section() !== s.id">{{ s.label }}</button>
        }
      </div>

      <div class="p-4 space-y-3 text-sm">
        @if (section() === 'history') {
          <div class="grid md:grid-cols-2 gap-3">
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Previous surgeries</span>
              <textarea rows="2" [(ngModel)]="form.previous_surgeries"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Previous anaesthesia + complications</span>
              <textarea rows="2" [(ngModel)]="form.previous_anaesthesia"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Drug history</span>
              <textarea rows="2" [(ngModel)]="form.drug_history"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Allergies</span>
              <textarea rows="2" [(ngModel)]="form.allergies_summary"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <div class="md:col-span-2 rounded-md border border-border p-2 bg-surface-subtle">
              <p class="text-[10px] font-bold uppercase text-ink-soft mb-1">Comorbidities</p>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-1">
                @for (c of comorbidityOptions; track c.key) {
                  <label class="flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox"
                           [checked]="form.comorbidities?.includes(c.key)"
                           (change)="toggleComorbidity(c.key, $event)" />
                    {{ c.label }}
                  </label>
                }
              </div>
            </div>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Smoking</span>
              <input [(ngModel)]="form.smoking_status"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Alcohol</span>
              <input [(ngModel)]="form.alcohol_status"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Pregnancy status</span>
              <select [(ngModel)]="form.pregnancy_status"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option [ngValue]="null">—</option>
                <option value="not_applicable">N/A</option>
                <option value="not_pregnant">Not pregnant</option>
                <option value="possibly_pregnant">Possibly pregnant</option>
                <option value="pregnant">Pregnant</option>
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Gestational weeks</span>
              <input type="number" min="1" max="44" [(ngModel)]="form.gestational_weeks"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
          </div>
        }

        @if (section() === 'exam') {
          <div class="grid md:grid-cols-3 gap-3">
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Height (cm)</span>
              <input type="number" step="0.1" [(ngModel)]="form.height_cm"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Weight (kg)</span>
              <input type="number" step="0.1" [(ngModel)]="form.weight_kg"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <div class="rounded-md border border-border p-2 bg-surface-subtle">
              <p class="text-[10px] uppercase text-ink-soft">BMI</p>
              <p class="text-lg font-bold">{{ computedBmi() ?? '—' }}</p>
            </div>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">BP</span>
              <input [(ngModel)]="form.bp" placeholder="120/80"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Pulse</span>
              <input type="number" [(ngModel)]="form.pulse"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">SpO2 %</span>
              <input type="number" [(ngModel)]="form.spo2"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Mallampati *</span>
              <select [(ngModel)]="form.mallampati"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option [ngValue]="null">—</option>
                <option value="I">I</option><option value="II">II</option>
                <option value="III">III</option><option value="IV">IV</option>
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Mouth opening (cm)</span>
              <input type="number" step="0.1" [(ngModel)]="form.mouth_opening_cm"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Thyromental dist (cm)</span>
              <input type="number" step="0.1" [(ngModel)]="form.thyromental_distance_cm"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Neck mobility</span>
              <select [(ngModel)]="form.neck_mobility"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option [ngValue]="null">—</option>
                <option value="full">Full</option>
                <option value="limited">Limited</option>
                <option value="restricted">Restricted</option>
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Dentition</span>
              <select [(ngModel)]="form.dentition"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option [ngValue]="null">—</option>
                <option value="intact">Intact</option><option value="loose">Loose</option>
                <option value="dentures">Dentures</option>
                <option value="partially_missing">Partially missing</option>
                <option value="edentulous">Edentulous</option>
              </select>
            </label>
            <label class="md:col-span-3 block">
              <span class="text-[10px] uppercase text-ink-soft">Airway concerns</span>
              <textarea rows="2" [(ngModel)]="form.airway_concerns"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="md:col-span-3 block">
              <span class="text-[10px] uppercase text-ink-soft">CVS exam</span>
              <textarea rows="2" [(ngModel)]="form.cvs_exam"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="md:col-span-3 block">
              <span class="text-[10px] uppercase text-ink-soft">Respiratory exam</span>
              <textarea rows="2" [(ngModel)]="form.respiratory_exam"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
          </div>
        }

        @if (section() === 'investigations') {
          <div class="grid md:grid-cols-2 gap-3">
            @for (inv of invFields; track inv.key) {
              <div class="rounded-md border border-border p-2">
                <p class="text-[10px] uppercase text-ink-soft mb-1">{{ inv.label }}</p>
                <input type="date" [(ngModel)]="form[inv.dateKey]"
                       class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-[11px] mb-1" />
                <textarea rows="2" [(ngModel)]="form[inv.summaryKey]"
                          class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
              </div>
            }
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Other investigations</span>
              <textarea rows="2" [(ngModel)]="form.other_investigations"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="flex items-center gap-2 text-[12px]">
              <input type="checkbox" [(ngModel)]="form.blood_crossmatch_done" />
              Blood cross-match done
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Units arranged</span>
              <input type="number" min="0" [(ngModel)]="form.units_arranged"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
          </div>
        }

        @if (section() === 'plan') {
          <div class="grid md:grid-cols-2 gap-3">
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">ASA Grade *</span>
              <select [(ngModel)]="form.asa_grade"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option value="I">I</option><option value="II">II</option><option value="III">III</option>
                <option value="IV">IV</option><option value="V">V</option><option value="VI">VI</option>
                <option value="E">E</option>
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">ASA modifiers</span>
              <input [(ngModel)]="form.asa_modifiers"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Anaesthesia type *</span>
              <select [(ngModel)]="form.planned_anaesthesia_type"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option [ngValue]="null">—</option>
                <option value="general">General</option><option value="regional">Regional</option>
                <option value="spinal">Spinal</option><option value="epidural">Epidural</option>
                <option value="combined_spinal_epidural">CSE</option>
                <option value="local">Local</option><option value="sedation">Sedation</option>
              </select>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Postop disposition</span>
              <select [(ngModel)]="form.postop_disposition"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
                <option [ngValue]="null">—</option>
                <option value="ward">Ward</option><option value="hdu">HDU</option>
                <option value="icu">ICU</option><option value="pacu_then_ward">PACU → Ward</option>
                <option value="day_care_discharge">Day care discharge</option>
              </select>
            </label>
            <label class="flex items-center gap-2 text-[12px] md:col-span-2">
              <input type="checkbox" [(ngModel)]="form.difficult_airway_anticipated" />
              Difficult airway anticipated
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Difficult airway plan</span>
              <textarea rows="2" [(ngModel)]="form.difficult_airway_plan"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Last solid intake</span>
              <input type="datetime-local" [(ngModel)]="form.last_solid_at"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Last clear fluid</span>
              <input type="datetime-local" [(ngModel)]="form.last_clear_fluid_at"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Premedication</span>
              <textarea rows="2" [(ngModel)]="form.premedication"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
            <label class="md:col-span-2 block">
              <span class="text-[10px] uppercase text-ink-soft">Special precautions</span>
              <textarea rows="2" [(ngModel)]="form.special_precautions"
                        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
            </label>
          </div>
        }

        @if (section() === 'amend') {
          <div class="rounded-md border border-border p-3 bg-surface-subtle space-y-2">
            <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Amendments Log</h4>
            @if (p.amendments_log.length === 0) {
              <p class="text-[12px] text-ink-soft">No amendments.</p>
            } @else {
              <ul class="space-y-1 text-[12px]">
                @for (a of p.amendments_log; track a.at) {
                  <li class="border-l-2 border-blue-500 pl-2">
                    <strong>{{ a.by }}</strong> · {{ a.at | date:'short' }}<br/>
                    <span class="text-[11px]">{{ a.reason }}</span>
                  </li>
                }
              </ul>
            }
          </div>
        }

        @if (saveError()) { <p class="text-[12px] text-danger-fg">{{ saveError() }}</p> }
        @if (saveSuccess()) { <p class="text-[12px] text-good-fg">{{ saveSuccess() }}</p> }
      </div>

      <div class="px-4 py-3 border-t border-border flex justify-between gap-2">
        @if (p.status === 'draft' || p.status === 'amended') {
          <button (click)="cancel(p)" class="text-[12px] text-danger-fg hover:underline">Cancel PAC</button>
        } @else { <span></span> }
        <div class="flex gap-2">
          @if (p.status === 'draft' || p.status === 'amended') {
            <button (click)="save(p)" [disabled]="busy()"
                    class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
            @if (p.status === 'draft') {
              <button (click)="finalise(p)" [disabled]="busy()"
                      class="px-3 py-1.5 text-sm rounded-md bg-brand text-white">Finalise &amp; Sign</button>
            }
            @if (p.status === 'amended') {
              <button (click)="finalise(p)" [disabled]="busy()"
                      class="px-3 py-1.5 text-sm rounded-md bg-brand text-white">Save Amendment</button>
            }
          } @else if (p.status === 'final') {
            <button (click)="amend(p)" class="px-3 py-1.5 text-sm rounded-md border border-blue-500 text-blue-700">Amend</button>
          }
        </div>
      </div>
    </div>
  </div>
}
  `,
})
export class PacPage implements OnInit {
  private svc = inject(PacService);

  protected list = signal<PacEvaluation[]>([]);
  protected filter = signal<PacStatus | 'all'>('all');
  protected statusFilters: (PacStatus | 'all')[] = ['all','draft','final','amended','cancelled'];

  protected showNew = signal(false);
  protected nPatient = '';
  protected nProcedure = '';
  protected nSurgeryAt = '';
  protected nAnaesth = '';
  protected nAsa = 'II';
  protected nBusy = signal(false);
  protected nError = signal<string | null>(null);

  protected selected = signal<PacEvaluation | null>(null);
  protected section = signal<'history' | 'exam' | 'investigations' | 'plan' | 'amend'>('history');
  protected sections: { id: 'history'|'exam'|'investigations'|'plan'|'amend'; label: string }[] = [
    { id: 'history', label: 'History' },
    { id: 'exam', label: 'Examination' },
    { id: 'investigations', label: 'Investigations' },
    { id: 'plan', label: 'ASA & Plan' },
    { id: 'amend', label: 'Amendments' },
  ];

  protected form: any = {};
  protected busy = signal(false);
  protected saveError = signal<string | null>(null);
  protected saveSuccess = signal<string | null>(null);

  protected comorbidityOptions = COMORBIDITY_OPTIONS;
  protected statusLabel = (s: PacStatus) => PAC_STATUS_LABELS[s];

  protected invFields = [
    { key: 'cbc', label: 'CBC',  dateKey: 'cbc_date', summaryKey: 'cbc_summary' },
    { key: 'rft', label: 'RFT',  dateKey: 'rft_date', summaryKey: 'rft_summary' },
    { key: 'lft', label: 'LFT',  dateKey: 'lft_date', summaryKey: 'lft_summary' },
    { key: 'ecg', label: 'ECG',  dateKey: 'ecg_date', summaryKey: 'ecg_summary' },
    { key: 'cxr', label: 'CXR',  dateKey: 'cxr_date', summaryKey: 'cxr_summary' },
  ];

  protected filtered = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.list() : this.list().filter(p => p.status === f);
  });
  protected countFor(s: PacStatus | 'all'): number {
    return s === 'all' ? this.list().length : this.list().filter(p => p.status === s).length;
  }
  protected computedBmi(): string | null {
    const h = Number(this.form.height_cm); const w = Number(this.form.weight_kg);
    if (!h || !w) return null;
    return ((w / ((h/100) ** 2))).toFixed(1);
  }

  ngOnInit() { this.refresh(); }

  private async refresh() {
    try { this.list.set(await this.svc.list({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async createDraft() {
    if (!this.nPatient.trim() || !this.nProcedure.trim() || !this.nAnaesth.trim()) return;
    this.nBusy.set(true); this.nError.set(null);
    try {
      const id = await this.svc.createDraft({
        patientId: this.nPatient.trim(),
        plannedProcedureName: this.nProcedure.trim(),
        anaesthetistName: this.nAnaesth.trim(),
        asaGrade: this.nAsa,
        plannedSurgeryAt: this.nSurgeryAt ? new Date(this.nSurgeryAt).toISOString() : null,
      });
      this.showNew.set(false);
      this.nPatient = ''; this.nProcedure = ''; this.nSurgeryAt = '';
      this.nAnaesth = ''; this.nAsa = 'II';
      await this.refresh();
      const fresh = await this.svc.get(id);
      this.openDetail(fresh);
    } catch (e: any) { this.nError.set(e?.message ?? 'Failed'); }
    finally { this.nBusy.set(false); }
  }

  protected open(p: PacEvaluation) { this.openDetail(p); }
  private openDetail(p: PacEvaluation) {
    this.selected.set(p);
    this.section.set('history');
    this.form = { ...p, comorbidities: [...(p.comorbidities ?? [])] };
    this.form.last_solid_at = p.last_solid_at ? this.toLocalInput(p.last_solid_at) : '';
    this.form.last_clear_fluid_at = p.last_clear_fluid_at ? this.toLocalInput(p.last_clear_fluid_at) : '';
  }
  protected closeDetail() { this.selected.set(null); }

  private toLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  protected toggleComorbidity(key: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    const set = new Set<string>(this.form.comorbidities ?? []);
    checked ? set.add(key) : set.delete(key);
    this.form.comorbidities = [...set];
  }

  protected async save(p: PacEvaluation) {
    this.busy.set(true); this.saveError.set(null); this.saveSuccess.set(null);
    try {
      const patch = this.buildPatch();
      await this.svc.save(p.id, patch);
      this.saveSuccess.set('Saved');
      const fresh = await this.svc.get(p.id);
      this.selected.set(fresh);
      await this.refresh();
      setTimeout(() => this.saveSuccess.set(null), 3000);
    } catch (e: any) { this.saveError.set(e?.message ?? 'Failed'); }
    finally { this.busy.set(false); }
  }

  private buildPatch(): Record<string, unknown> {
    const f = this.form;
    return {
      previous_surgeries: f.previous_surgeries,
      previous_anaesthesia: f.previous_anaesthesia,
      drug_history: f.drug_history,
      allergies_summary: f.allergies_summary,
      comorbidities: f.comorbidities ?? [],
      recent_illness: f.recent_illness,
      family_history: f.family_history,
      smoking_status: f.smoking_status,
      alcohol_status: f.alcohol_status,
      pregnancy_status: f.pregnancy_status,
      gestational_weeks: f.gestational_weeks,
      height_cm: f.height_cm,
      weight_kg: f.weight_kg,
      bp: f.bp, pulse: f.pulse, spo2: f.spo2,
      mallampati: f.mallampati,
      mouth_opening_cm: f.mouth_opening_cm,
      thyromental_distance_cm: f.thyromental_distance_cm,
      neck_mobility: f.neck_mobility,
      dentition: f.dentition,
      airway_concerns: f.airway_concerns,
      cvs_exam: f.cvs_exam,
      respiratory_exam: f.respiratory_exam,
      cbc_date: f.cbc_date, cbc_summary: f.cbc_summary,
      rft_date: f.rft_date, rft_summary: f.rft_summary,
      lft_date: f.lft_date, lft_summary: f.lft_summary,
      ecg_date: f.ecg_date, ecg_summary: f.ecg_summary,
      cxr_date: f.cxr_date, cxr_summary: f.cxr_summary,
      other_investigations: f.other_investigations,
      blood_crossmatch_done: f.blood_crossmatch_done,
      units_arranged: f.units_arranged,
      asa_grade: f.asa_grade,
      asa_modifiers: f.asa_modifiers,
      difficult_airway_anticipated: f.difficult_airway_anticipated,
      difficult_airway_plan: f.difficult_airway_plan,
      last_solid_at: f.last_solid_at ? new Date(f.last_solid_at).toISOString() : null,
      last_clear_fluid_at: f.last_clear_fluid_at ? new Date(f.last_clear_fluid_at).toISOString() : null,
      planned_anaesthesia_type: f.planned_anaesthesia_type,
      premedication: f.premedication,
      special_precautions: f.special_precautions,
      postop_disposition: f.postop_disposition,
    };
  }

  protected async finalise(p: PacEvaluation) {
    await this.save(p);
    const sig = prompt('Sign as Doctor (full name)?');
    if (!sig) return;
    try {
      await this.svc.finalise(p.id, sig);
      const fresh = await this.svc.get(p.id);
      this.selected.set(fresh);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async amend(p: PacEvaluation) {
    const reason = prompt('Amendment reason?');
    if (!reason) return;
    const by = prompt('Amendment by (full name)?') ?? '';
    try {
      await this.svc.amend(p.id, reason, by);
      const fresh = await this.svc.get(p.id);
      this.selected.set(fresh);
      this.openDetail(fresh);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async cancel(p: PacEvaluation) {
    const reason = prompt('Cancel PAC reason?');
    if (!reason) return;
    try { await this.svc.cancel(p.id, reason); this.closeDetail(); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
