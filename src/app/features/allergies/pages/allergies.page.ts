import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AllergiesService } from '../data/allergies.service';
import {
  ALLERGEN_TYPE_LABELS, CAUSALITY_LABELS, OUTCOME_LABELS, SEVERITY_LABELS,
  type AdrCausality, type AdrOutcome, type AdrReport, type AllergenType,
  type AllergySeverity, type AllergySource, type PatientAllergy,
} from '../data/allergies.types';

type Tab = 'allergies' | 'adr' | 'pvpi';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Allergies &amp; Adverse Drug Reactions</h1>
    <p class="text-[12px] text-ink-soft">Patient allergy registry · ADR pharmacovigilance · PVPI reporting</p>
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

  <!-- ALLERGIES -->
  @if (tab() === 'allergies') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Add Allergy</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="newPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Type</span>
          <select [(ngModel)]="newType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (t of typeOptions; track t) { <option [value]="t">{{ typeLabel(t) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Allergen *</span>
          <input [(ngModel)]="newAllergen" placeholder="Penicillin / Peanuts / Latex"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Generic name (drug)</span>
          <input [(ngModel)]="newGeneric"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Severity *</span>
          <select [(ngModel)]="newSeverity"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
            <option value="life_threatening">Life-Threatening</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reaction</span>
          <input [(ngModel)]="newReaction" placeholder="Rash / anaphylaxis / angioedema"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Source</span>
          <select [(ngModel)]="newSource"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option value="patient_reported">Patient reported</option>
            <option value="family_reported">Family reported</option>
            <option value="clinical_observation">Clinical observation</option>
            <option value="medical_history">Medical history</option>
            <option value="adr_event">ADR event</option>
          </select>
        </label>
        @if (addError()) { <p class="text-[12px] text-danger-fg">{{ addError() }}</p> }
        <button (click)="addAllergy()" [disabled]="addBusy() || !canAddAllergy()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ addBusy() ? 'Saving…' : 'Add Allergy' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <div class="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 class="text-sm font-semibold">Active Allergies</h3>
          <input [(ngModel)]="patientFilter" placeholder="Filter by patient ID"
                 class="w-64 rounded-md border border-border bg-surface px-2 py-1 text-[12px] font-mono" />
        </div>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Patient</th><th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Allergen</th><th class="px-3 py-2">Severity</th>
                <th class="px-3 py-2">Reaction</th><th class="px-3 py-2">Source</th>
                <th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (a of filteredAllergies(); track a.id) {
              <tr class="border-t border-border" [class.bg-danger-fg]="a.severity === 'life_threatening' || a.severity === 'severe'" [class.bg-opacity-5]="true">
                <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2">{{ typeLabel(a.allergen_type) }}</td>
                <td class="px-3 py-2 font-semibold">{{ a.allergen_name }}</td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        [class.bg-danger-fg]="a.severity === 'life_threatening' || a.severity === 'severe'"
                        [class.bg-warn-fg]="a.severity === 'moderate'"
                        [class.bg-surface-subtle]="a.severity === 'mild'"
                        [class.text-white]="a.severity === 'life_threatening' || a.severity === 'severe' || a.severity === 'moderate'">
                    {{ severityLabel(a.severity) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-[11px]">{{ a.reaction_description || a.reaction_type }}</td>
                <td class="px-3 py-2 text-[11px]">{{ a.source }}</td>
                <td class="px-3 py-2 text-right">
                  <button (click)="resolve(a)" class="text-[11px] text-brand hover:underline">Resolve</button>
                  <span class="mx-1">·</span>
                  <button (click)="disprove(a)" class="text-[11px] text-danger-fg hover:underline">Disprove</button>
                </td>
              </tr>
            }
            @if (filteredAllergies().length === 0) {
              <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No active allergies.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- ADR -->
  @if (tab() === 'adr') {
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-1 rounded-md border border-border bg-surface-card p-4 space-y-2">
        <h3 class="text-sm font-semibold">+ Report ADR</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
          <input [(ngModel)]="adrPatientId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Drug Name *</span>
          <input [(ngModel)]="adrDrug"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Generic name</span>
          <input [(ngModel)]="adrGeneric"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Route</span>
            <input [(ngModel)]="adrRoute" placeholder="oral / IV / IM"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Dose</span>
            <input [(ngModel)]="adrDose"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Drug start</span>
            <input type="datetime-local" [(ngModel)]="adrStartDrug"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Drug stop</span>
            <input type="datetime-local" [(ngModel)]="adrStopDrug"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Reaction start</span>
            <input type="datetime-local" [(ngModel)]="adrReactStart"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">CTCAE Grade (1-5)</span>
            <input type="number" min="1" max="5" [(ngModel)]="adrGrade"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reaction Description *</span>
          <textarea rows="2" [(ngModel)]="adrReactDesc"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Causality (WHO-UMC)</span>
            <select [(ngModel)]="adrCausality"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="definite">Definite</option><option value="probable">Probable</option>
              <option value="possible">Possible</option><option value="unlikely">Unlikely</option>
              <option value="unrelated">Unrelated</option><option value="unassessable">Unassessable</option>
            </select>
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Outcome</span>
            <select [(ngModel)]="adrOutcome"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              <option value="recovered">Recovered</option><option value="recovering">Recovering</option>
              <option value="not_recovered">Not Recovered</option>
              <option value="recovered_with_sequelae">Recovered w/ sequelae</option>
              <option value="fatal">Fatal</option><option value="unknown">Unknown</option>
            </select>
          </label>
        </div>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="adrSerious" />
          Serious ADR (PVPI mandatory reporting)
        </label>
        <label class="flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="adrAutoCreateAllergy" />
          Auto-create allergy if causality probable+
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Reporter Name *</span>
          <input [(ngModel)]="adrReporter"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (adrError()) { <p class="text-[12px] text-danger-fg">{{ adrError() }}</p> }
        <button (click)="reportAdr()" [disabled]="adrBusy() || !canSubmitAdr()"
                class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ adrBusy() ? 'Saving…' : 'Report ADR' }}
        </button>
      </div>

      <div class="lg:col-span-2 rounded-md border border-border bg-surface-card">
        <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Recent ADR Reports</h3>
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Patient</th>
                <th class="px-3 py-2">Drug</th><th class="px-3 py-2">Reaction</th>
                <th class="px-3 py-2">CTCAE</th><th class="px-3 py-2">Causality</th>
                <th class="px-3 py-2">Outcome</th><th class="px-3 py-2">Serious</th>
                <th class="px-3 py-2">PVPI</th></tr>
          </thead>
          <tbody>
            @for (a of adrs(); track a.id) {
              <tr class="border-t border-border" [class.bg-danger-fg]="a.is_serious" [class.bg-opacity-5]="true">
                <td class="px-3 py-2">{{ a.created_at | date:'short' }}</td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
                <td class="px-3 py-2">{{ a.drug_name }}</td>
                <td class="px-3 py-2 text-[11px]">{{ a.reaction_description }}</td>
                <td class="px-3 py-2 text-center">{{ a.ctcae_grade ?? '—' }}</td>
                <td class="px-3 py-2 text-[11px]">{{ causalityLabel(a.causality) }}</td>
                <td class="px-3 py-2 text-[11px]">{{ outcomeLabel(a.outcome) }}</td>
                <td class="px-3 py-2">{{ a.is_serious ? '⚠ Yes' : 'No' }}</td>
                <td class="px-3 py-2 text-[11px]">
                  {{ a.reported_to_pvpi ? '✓ ' + (a.pvpi_report_no || 'reported') : 'pending' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  }

  <!-- PVPI -->
  @if (tab() === 'pvpi') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">
        Pending PVPI Reports
        <span class="ml-2 text-[11px] text-ink-soft">— serious ADRs must be reported within 15 days</span>
      </h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Drug</th><th class="px-3 py-2">Causality</th>
              <th class="px-3 py-2">Days</th><th class="px-3 py-2">Reporter</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (a of pvpiPending(); track a.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="daysSince(a.created_at) > 15"
                [class.bg-warn-fg]="daysSince(a.created_at) > 7 && daysSince(a.created_at) <= 15"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2">{{ a.created_at | date:'mediumDate' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2">{{ a.drug_name }}</td>
              <td class="px-3 py-2">{{ causalityLabel(a.causality) }}</td>
              <td class="px-3 py-2"
                  [class.text-danger-fg]="daysSince(a.created_at) > 15">
                {{ daysSince(a.created_at) }}d
              </td>
              <td class="px-3 py-2">{{ a.reporter_name }}</td>
              <td class="px-3 py-2 text-right">
                <button (click)="markPvpi(a)" class="text-[11px] text-brand hover:underline">Mark reported</button>
              </td>
            </tr>
          }
          @if (pvpiPending().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No pending PVPI reports.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class AllergiesPage implements OnInit {
  private svc = inject(AllergiesService);

  protected tab = signal<Tab>('allergies');
  protected allergies = signal<PatientAllergy[]>([]);
  protected adrs      = signal<AdrReport[]>([]);
  protected patientFilter = '';

  // Add allergy form
  protected newPatientId = '';
  protected newType: AllergenType = 'drug';
  protected newAllergen = '';
  protected newGeneric = '';
  protected newSeverity: AllergySeverity = 'moderate';
  protected newReaction = '';
  protected newSource: AllergySource = 'patient_reported';
  protected addBusy = signal(false);
  protected addError = signal<string | null>(null);

  // ADR form
  protected adrPatientId = '';
  protected adrDrug = '';
  protected adrGeneric = '';
  protected adrRoute = '';
  protected adrDose = '';
  protected adrStartDrug = '';
  protected adrStopDrug = '';
  protected adrReactStart = '';
  protected adrGrade: number | null = null;
  protected adrReactDesc = '';
  protected adrCausality: AdrCausality = 'possible';
  protected adrOutcome: AdrOutcome = 'unknown';
  protected adrSerious = false;
  protected adrAutoCreateAllergy = true;
  protected adrReporter = '';
  protected adrBusy = signal(false);
  protected adrError = signal<string | null>(null);

  protected typeOptions: AllergenType[] = ['drug','food','environmental','contrast','latex','venom','animal','pollen','dust','other'];

  protected typeLabel = (t: AllergenType) => ALLERGEN_TYPE_LABELS[t];
  protected severityLabel = (s: AllergySeverity) => SEVERITY_LABELS[s];
  protected causalityLabel = (c: AdrCausality) => CAUSALITY_LABELS[c];
  protected outcomeLabel = (o: AdrOutcome) => OUTCOME_LABELS[o];

  protected filteredAllergies = computed(() => {
    const f = this.patientFilter.trim().toLowerCase();
    return this.allergies()
      .filter(a => a.status === 'active')
      .filter(a => !f || a.patient_id.toLowerCase().includes(f));
  });

  protected pvpiPending = computed(() => this.adrs().filter(a => !a.reported_to_pvpi));

  protected tabs = [
    { id: 'allergies' as Tab, label: 'Allergies', count: () => this.allergies().filter(a => a.status === 'active').length },
    { id: 'adr'       as Tab, label: 'ADR Reports', count: () => this.adrs().length },
    { id: 'pvpi'      as Tab, label: 'PVPI Pending', count: () => this.pvpiPending().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [als, adrs] = await Promise.all([
        this.svc.listAllergies({}),
        this.svc.listAdrs({}),
      ]);
      this.allergies.set(als);
      this.adrs.set(adrs);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected canAddAllergy = () => !!this.newPatientId.trim() && !!this.newAllergen.trim();
  protected canSubmitAdr  = () => !!this.adrPatientId.trim() && !!this.adrDrug.trim() && !!this.adrReactDesc.trim() && !!this.adrReporter.trim();

  protected daysSince(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  }

  protected async addAllergy() {
    if (!this.canAddAllergy() || this.addBusy()) return;
    this.addBusy.set(true); this.addError.set(null);
    try {
      await this.svc.addAllergy({
        patientId: this.newPatientId.trim(),
        allergenName: this.newAllergen.trim(),
        severity: this.newSeverity,
        allergenType: this.newType,
        reactionDescription: this.newReaction.trim() || null,
        genericDrugName: this.newGeneric.trim() || null,
        source: this.newSource,
      });
      this.newAllergen = ''; this.newReaction = ''; this.newGeneric = '';
      await this.refresh();
    } catch (e: any) { this.addError.set(e?.message ?? 'Failed'); }
    finally { this.addBusy.set(false); }
  }

  protected async resolve(a: PatientAllergy) {
    try { await this.svc.updateStatus(a.id, 'resolved'); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async disprove(a: PatientAllergy) {
    const reason = prompt('Reason for disproving this allergy?') ?? '';
    try { await this.svc.updateStatus(a.id, 'disproven', reason); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async reportAdr() {
    if (!this.canSubmitAdr() || this.adrBusy()) return;
    this.adrBusy.set(true); this.adrError.set(null);
    try {
      await this.svc.reportAdr({
        patientId: this.adrPatientId.trim(),
        drugName: this.adrDrug.trim(),
        reactionDescription: this.adrReactDesc.trim(),
        reporterName: this.adrReporter.trim(),
        genericDrugName: this.adrGeneric.trim() || null,
        route: this.adrRoute.trim() || null,
        dose: this.adrDose.trim() || null,
        startDrugAt: this.adrStartDrug ? new Date(this.adrStartDrug).toISOString() : null,
        stopDrugAt: this.adrStopDrug ? new Date(this.adrStopDrug).toISOString() : null,
        reactionStartedAt: this.adrReactStart ? new Date(this.adrReactStart).toISOString() : null,
        ctcaeGrade: this.adrGrade,
        isSerious: this.adrSerious,
        causality: this.adrCausality,
        outcome: this.adrOutcome,
        autoCreateAllergy: this.adrAutoCreateAllergy,
      });
      this.adrDrug = ''; this.adrReactDesc = ''; this.adrGeneric = '';
      await this.refresh();
    } catch (e: any) { this.adrError.set(e?.message ?? 'Failed'); }
    finally { this.adrBusy.set(false); }
  }

  protected async markPvpi(a: AdrReport) {
    const no = prompt('PVPI report number?');
    if (!no) return;
    try { await this.svc.markPvpiReported(a.id, no); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
