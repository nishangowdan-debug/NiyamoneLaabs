import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PathwaysService } from '../data/pathways.service';
import {
  APP_STATUS_LABELS, CATEGORY_LABELS, STEP_STATUS_LABELS,
  type ApplicationStatus, type ClinicalPathway, type PathwayApplication,
  type PathwayCategory, type StepInstance, type StepStatus,
} from '../data/pathways.types';

type Tab = 'active' | 'apply' | 'library' | 'history';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Clinical Pathways &amp; Care Bundles</h1>
    <p class="text-[12px] text-ink-soft">Evidence-based protocols · time-bound steps · NABH clinical governance</p>
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

  <!-- ACTIVE -->
  @if (tab() === 'active') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Active Applications</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Pathway</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Started</th><th class="px-3 py-2">Doctor</th>
              <th class="px-3 py-2">Progress</th><th class="px-3 py-2">Critical Pending</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (a of activeApplications(); track a.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="hasOverdueCritical(a.id)"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2">{{ pathwayName(a.pathway_id) }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ a.applied_at | date:'short' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ a.triggered_by_doctor_name || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ progressFor(a.id) }}</td>
              <td class="px-3 py-2 text-[11px]"
                  [class.text-danger-fg]="overdueCriticalCount(a.id) > 0">
                {{ overdueCriticalCount(a.id) }}
              </td>
              <td class="px-3 py-2 text-right">
                <button (click)="openApp(a)" class="text-[11px] text-brand hover:underline">Open</button>
              </td>
            </tr>
          }
          @if (activeApplications().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No active pathways.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (selectedApp(); as app) {
      <div class="rounded-md border-2 border-brand bg-surface-card">
        <div class="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold">{{ pathwayName(app.pathway_id) }}</h3>
            <p class="text-[11px] text-ink-soft">Patient: {{ app.patient_id.slice(0,8) }} · Applied {{ app.applied_at | date:'short' }}</p>
          </div>
          <div class="flex gap-2">
            <button (click)="completeApp(app)" class="px-3 py-1 text-[12px] rounded-md bg-good-fg text-white">Complete</button>
            <button (click)="discontinueApp(app)" class="px-3 py-1 text-[12px] rounded-md border border-danger-fg text-danger-fg">Discontinue</button>
            <button (click)="selectedApp.set(null)" class="px-2 py-1 text-[12px] rounded-md border border-border">Close</button>
          </div>
        </div>
        <div class="p-4 space-y-2">
          @for (s of selectedSteps(); track s.id) {
            <div class="flex items-start gap-3 rounded-md border border-border p-2"
                 [class.bg-danger-fg]="isStepOverdue(s)"
                 [class.bg-good-fg]="s.status === 'done'"
                 [class.bg-surface-subtle]="s.status === 'skipped' || s.status === 'not_applicable'"
                 [class.bg-opacity-5]="true">
              <span class="text-[10px] text-ink-soft font-mono w-6 text-right">{{ s.step_order }}</span>
              <div class="flex-1">
                <p class="text-[13px]"
                   [class.font-bold]="s.is_critical"
                   [class.text-danger-fg]="s.is_critical && s.status === 'pending' && isStepOverdue(s)">
                  {{ s.is_critical ? '⚠ ' : '' }}{{ s.step_label }}
                </p>
                @if (s.due_at) {
                  <p class="text-[10px] text-ink-soft">
                    Due: {{ s.due_at | date:'short' }}
                    @if (isStepOverdue(s)) { <span class="text-danger-fg font-bold">· OVERDUE</span> }
                  </p>
                }
                @if (s.completed_by_name) {
                  <p class="text-[10px] text-good-fg">
                    ✓ {{ stepStatusLabel(s.status) }} by {{ s.completed_by_name }} at {{ s.completed_at | date:'short' }}
                  </p>
                }
                @if (s.skipped_reason) {
                  <p class="text-[10px] text-warn-fg">Skipped: {{ s.skipped_reason }}</p>
                }
              </div>
              @if (s.status === 'pending' || s.status === 'in_progress') {
                <div class="flex gap-1">
                  <button (click)="markStep(s, 'done')"
                          class="px-2 py-1 text-[10px] rounded bg-good-fg text-white">Done</button>
                  <button (click)="markStep(s, 'skipped')"
                          class="px-2 py-1 text-[10px] rounded bg-warn-fg text-white">Skip</button>
                  <button (click)="markStep(s, 'not_applicable')"
                          class="px-2 py-1 text-[10px] rounded border border-border">N/A</button>
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  }

  <!-- APPLY -->
  @if (tab() === 'apply') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl space-y-2">
      <h3 class="text-sm font-semibold">+ Apply Pathway</h3>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Pathway *</span>
        <select [(ngModel)]="aPathwayId"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option [ngValue]="null">— pick —</option>
          @for (p of pathways(); track p.id) {
            <option [ngValue]="p.id">{{ p.code }} · {{ p.name }} ({{ categoryLabel(p.category) }})</option>
          }
        </select>
      </label>
      @if (aSelectedPathway(); as p) {
        <div class="rounded-md border border-border bg-surface-subtle p-3 text-[12px]">
          <p class="font-semibold">{{ p.name }}</p>
          @if (p.description) { <p class="text-[11px] text-ink-soft">{{ p.description }}</p> }
          @if (p.evidence_basis) {
            <p class="text-[10px] text-ink-soft mt-1">Evidence: <span class="font-mono">{{ p.evidence_basis }}</span></p>
          }
          <p class="text-[10px] text-ink-soft">Steps: {{ p.steps.length }} · Duration: {{ p.expected_duration_hours }}h</p>
        </div>
      }
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Patient ID *</span>
        <input [(ngModel)]="aPatientId" placeholder="UUID"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
        <input [(ngModel)]="aAdmissionId"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Triggered by doctor</span>
        <input [(ngModel)]="aDoctor"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Trigger reason</span>
        <textarea rows="2" [(ngModel)]="aReason"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      @if (aError()) { <p class="text-[12px] text-danger-fg">{{ aError() }}</p> }
      @if (aSuccess()) { <p class="text-[12px] text-good-fg">{{ aSuccess() }}</p> }
      <div class="flex justify-end">
        <button (click)="apply()"
                [disabled]="aBusy() || !aPathwayId || !aPatientId.trim()"
                class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ aBusy() ? 'Applying…' : 'Apply Pathway' }}
        </button>
      </div>
    </div>
  }

  <!-- LIBRARY -->
  @if (tab() === 'library') {
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      @for (p of pathways(); track p.id) {
        <div class="rounded-md border border-border bg-surface-card p-3 space-y-2">
          <p class="text-[10px] font-mono text-ink-soft">{{ p.code }}</p>
          <h3 class="text-sm font-semibold">{{ p.name }}</h3>
          <p class="text-[10px] text-ink-soft uppercase">{{ categoryLabel(p.category) }} · {{ p.expected_duration_hours }}h · {{ p.steps.length }} steps</p>
          @if (p.description) { <p class="text-[11px]">{{ p.description }}</p> }
          @if (p.evidence_basis) {
            <p class="text-[10px] text-ink-soft font-mono">{{ p.evidence_basis }}</p>
          }
          <details class="text-[11px]">
            <summary class="cursor-pointer text-ink-soft">View steps</summary>
            <ul class="mt-1 space-y-0.5">
              @for (step of p.steps; track step.key; let i = $index) {
                <li class="border-l-2 pl-2"
                    [class.border-danger-fg]="step.critical"
                    [class.border-border]="!step.critical">
                  <span class="font-bold">{{ i + 1 }}.</span> {{ step.label }}
                  @if (step.due_within_min) { <span class="text-ink-soft">({{ step.due_within_min }}m)</span> }
                  @if (step.critical) { <span class="text-danger-fg">⚠</span> }
                </li>
              }
            </ul>
          </details>
        </div>
      }
    </div>
  }

  <!-- HISTORY -->
  @if (tab() === 'history') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Pathway</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Applied</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Closed</th></tr>
        </thead>
        <tbody>
          @for (a of historyApps(); track a.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2">{{ pathwayName(a.pathway_id) }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ a.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ a.applied_at | date:'short' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ appStatusLabel(a.status) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ a.completed_at ? (a.completed_at | date:'short') : '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class PathwaysPage implements OnInit {
  private svc = inject(PathwaysService);

  protected tab = signal<Tab>('active');
  protected pathways = signal<ClinicalPathway[]>([]);
  protected applications = signal<PathwayApplication[]>([]);
  protected selectedApp = signal<PathwayApplication | null>(null);
  protected selectedSteps = signal<StepInstance[]>([]);
  private stepCache = signal<Record<string, StepInstance[]>>({});

  // Apply form
  protected aPathwayId: string | null = null;
  protected aPatientId = '';
  protected aAdmissionId = '';
  protected aDoctor = '';
  protected aReason = '';
  protected aBusy = signal(false);
  protected aError = signal<string | null>(null);
  protected aSuccess = signal<string | null>(null);

  protected categoryLabel = (c: PathwayCategory) => CATEGORY_LABELS[c];
  protected appStatusLabel = (s: ApplicationStatus) => APP_STATUS_LABELS[s];
  protected stepStatusLabel = (s: StepStatus) => STEP_STATUS_LABELS[s];

  protected aSelectedPathway = computed(() =>
    this.aPathwayId ? this.pathways().find(p => p.id === this.aPathwayId) ?? null : null,
  );

  protected pathwayName = (id: string) => this.pathways().find(p => p.id === id)?.name ?? id.slice(0,8);

  protected isStepOverdue(s: StepInstance): boolean {
    return !!s.due_at && s.status === 'pending' && new Date(s.due_at) < new Date();
  }
  protected progressFor(appId: string): string {
    const steps = this.stepCache()[appId];
    if (!steps) return '—';
    const done = steps.filter(s => s.status === 'done' || s.status === 'skipped' || s.status === 'not_applicable').length;
    return `${done} / ${steps.length}`;
  }
  protected overdueCriticalCount(appId: string): number {
    const steps = this.stepCache()[appId];
    if (!steps) return 0;
    return steps.filter(s => s.is_critical && this.isStepOverdue(s)).length;
  }
  protected hasOverdueCritical(appId: string): boolean {
    return this.overdueCriticalCount(appId) > 0;
  }

  protected activeApplications = computed(() => this.applications().filter(a => a.status === 'active'));
  protected historyApps = computed(() => this.applications().filter(a => a.status !== 'active'));

  protected tabs = [
    { id: 'active'  as Tab, label: 'Active',     count: () => this.activeApplications().length },
    { id: 'apply'   as Tab, label: '+ Apply',    count: () => 0 },
    { id: 'library' as Tab, label: 'Library',    count: () => this.pathways().length },
    { id: 'history' as Tab, label: 'History',    count: () => this.historyApps().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [p, a] = await Promise.all([
        this.svc.listPathways(), this.svc.listApplications({}),
      ]);
      this.pathways.set(p);
      this.applications.set(a);
      // Pre-fetch steps for active applications
      const cache: Record<string, StepInstance[]> = {};
      for (const app of a.filter(x => x.status === 'active')) {
        cache[app.id] = await this.svc.listSteps(app.id);
      }
      this.stepCache.set(cache);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async openApp(a: PathwayApplication) {
    this.selectedApp.set(a);
    try { this.selectedSteps.set(await this.svc.listSteps(a.id)); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async apply() {
    if (!this.aPathwayId || !this.aPatientId.trim()) return;
    this.aBusy.set(true); this.aError.set(null); this.aSuccess.set(null);
    try {
      await this.svc.apply({
        pathwayId: this.aPathwayId,
        patientId: this.aPatientId.trim(),
        admissionId: this.aAdmissionId.trim() || null,
        triggeredByDoctorName: this.aDoctor.trim() || null,
        triggerReason: this.aReason.trim() || null,
      });
      this.aSuccess.set('Pathway applied. Step instances created.');
      this.aPatientId = ''; this.aAdmissionId = '';
      this.aDoctor = ''; this.aReason = '';
      await this.refresh();
      setTimeout(() => this.aSuccess.set(null), 3000);
    } catch (e: any) { this.aError.set(e?.message ?? 'Failed'); }
    finally { this.aBusy.set(false); }
  }

  protected async markStep(s: StepInstance, status: StepStatus) {
    const completedBy = prompt('Completed by (your name)?');
    if (!completedBy) return;
    let skippedReason: string | null = null;
    if (status === 'skipped') {
      skippedReason = prompt('Skip reason (mandatory)?');
      if (!skippedReason) return;
    }
    try {
      await this.svc.completeStep({
        stepId: s.id, status,
        completedByName: completedBy,
        skippedReason,
      });
      // Refresh selected app's steps
      const app = this.selectedApp();
      if (app) this.selectedSteps.set(await this.svc.listSteps(app.id));
      // Refresh cache
      const cache = { ...this.stepCache() };
      if (app) cache[app.id] = await this.svc.listSteps(app.id);
      this.stepCache.set(cache);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async completeApp(app: PathwayApplication) {
    if (!confirm('Mark pathway completed?')) return;
    try {
      await this.svc.close(app.id, 'completed');
      this.selectedApp.set(null);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
  protected async discontinueApp(app: PathwayApplication) {
    const reason = prompt('Discontinuation reason?');
    if (!reason) return;
    try {
      await this.svc.close(app.id, 'discontinued', reason);
      this.selectedApp.set(null);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
