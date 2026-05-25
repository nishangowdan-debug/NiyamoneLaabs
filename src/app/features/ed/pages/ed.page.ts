import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EdService } from '../data/ed.service';
import {
  AREA_LABELS, ARRIVAL_LABELS, DISPOSITION_LABELS, ESI_COLORS,
  type EdArrivalMode, type EdDisposition, type EdTreatmentArea, type EdVisit,
} from '../data/ed.types';
import { EdTriageDialogComponent } from '../components/ed-triage-dialog.component';
import { EdRegisterDialogComponent } from '../components/ed-register-dialog.component';

type Tab = 'board' | 'history';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, EdTriageDialogComponent, EdRegisterDialogComponent],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Emergency Department</h1>
      <p class="text-[12px] text-ink-soft">ESI 5-level triage · door-to-doctor · disposition tracking</p>
    </div>
    <button (click)="showRegister.set(true)"
            class="px-3 py-1.5 text-[13px] rounded-md bg-brand text-white">+ Register Arrival</button>
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

  @if (tab() === 'board') {
    <!-- ESI summary tiles -->
    <div class="grid grid-cols-5 gap-2">
      @for (level of [1,2,3,4,5]; track level) {
        <div class="rounded-md p-3 text-white" [class]="esiColor(level).bg">
          <p class="text-[11px] uppercase tracking-wide opacity-90">ESI {{ level }}</p>
          <p class="text-2xl font-bold">{{ countByEsi(level) }}</p>
        </div>
      }
    </div>

    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Visit</th><th class="px-3 py-2">ESI</th>
              <th class="px-3 py-2">Patient</th><th class="px-3 py-2">CC</th>
              <th class="px-3 py-2">Area</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Arrived</th><th class="px-3 py-2">Wait</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (v of activeSorted(); track v.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono text-[10px]">{{ v.visit_no }}</td>
              <td class="px-3 py-2">
                @if (v.esi_level) {
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-white"
                        [class]="esiColor(v.esi_level).bg">
                    ESI {{ v.esi_level }}
                  </span>
                } @else {
                  <span class="text-[10px] text-warn-fg font-bold">UNTRIAGED</span>
                }
              </td>
              <td class="px-3 py-2">
                @if (v.patient_id) {
                  <span class="font-mono text-[10px]">{{ v.patient_id.slice(0,8) }}</span>
                } @else {
                  {{ v.walk_in_name }}
                  @if (v.walk_in_age) { <span class="text-[10px] text-ink-soft">· {{ v.walk_in_age }}y</span> }
                }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ v.chief_complaint }}</td>
              <td class="px-3 py-2 text-[11px]">{{ areaLabel(v.treatment_area) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.status }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.arrived_at | date:'shortTime' }}</td>
              <td class="px-3 py-2 text-[11px]"
                  [class.text-danger-fg]="(v.minutes_in_ed ?? 0) > 60 && !v.esi_level"
                  [class.text-warn-fg]="(v.minutes_in_ed ?? 0) > 30 && !v.esi_level">
                {{ formatMinutes(v.minutes_in_ed ?? 0) }}
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                @if (!v.triage_at) {
                  <button (click)="openTriage(v)" class="text-[11px] text-brand hover:underline">Triage</button>
                } @else if (v.status !== 'closed' && v.status !== 'lwbs') {
                  @if (!v.first_provider_seen_at) {
                    <button (click)="markFirstSeen(v)" class="text-[11px] text-good-fg hover:underline">First seen</button>
                    <span class="mx-1">·</span>
                  }
                  <button (click)="dispose(v)" class="text-[11px] text-brand hover:underline">Dispose</button>
                  <span class="mx-1">·</span>
                  <button (click)="reassess(v)" class="text-[11px] text-warn-fg hover:underline">Reassess</button>
                }
              </td>
            </tr>
          }
          @if (activeSorted().length === 0) {
            <tr><td colspan="9" class="px-3 py-3 text-center text-ink-soft">ED queue is empty.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab() === 'history') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Visit</th><th class="px-3 py-2">Arrived</th>
              <th class="px-3 py-2">ESI</th><th class="px-3 py-2">CC</th>
              <th class="px-3 py-2">Disposition</th><th class="px-3 py-2">LOS (min)</th></tr>
        </thead>
        <tbody>
          @for (v of closedVisits(); track v.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono text-[10px]">{{ v.visit_no }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.arrived_at | date:'short' }}</td>
              <td class="px-3 py-2">
                @if (v.esi_level) {
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                        [class]="esiColor(v.esi_level).bg">{{ v.esi_level }}</span>
                }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ v.chief_complaint }}</td>
              <td class="px-3 py-2 text-[11px]">{{ dispoLabel(v.disposition) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ losMinutes(v) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>

@if (showRegister()) {
  <app-ed-register-dialog
    (created)="onRegistered($event)"
    (cancelled)="showRegister.set(false)" />
}

@if (triageVisit()) {
  <app-ed-triage-dialog
    [visit]="triageVisit()!"
    (saved)="onTriaged()"
    (cancelled)="triageVisit.set(null)" />
}
  `,
})
export class EdPage implements OnInit {
  private svc = inject(EdService);

  protected tab = signal<Tab>('board');
  protected active = signal<EdVisit[]>([]);
  protected all = signal<EdVisit[]>([]);

  protected showRegister = signal(false);
  protected triageVisit = signal<EdVisit | null>(null);

  protected esiColor = (n: number) => ESI_COLORS[n];
  protected areaLabel = (a: EdTreatmentArea) => AREA_LABELS[a];
  protected dispoLabel = (d: EdDisposition) => DISPOSITION_LABELS[d];

  protected activeSorted = computed(() =>
    [...this.active()].sort((a, b) => {
      // Untriaged first by waiting time, then by ESI ascending, then arrival
      const aEsi = a.esi_level ?? 0; const bEsi = b.esi_level ?? 0;
      if (aEsi === 0 && bEsi !== 0) return -1;
      if (bEsi === 0 && aEsi !== 0) return 1;
      if (aEsi !== bEsi) return aEsi - bEsi;
      return +new Date(a.arrived_at) - +new Date(b.arrived_at);
    }),
  );

  protected closedVisits = computed(() => this.all().filter(v => v.status === 'closed' || v.status === 'lwbs'));

  protected tabs = [
    { id: 'board'   as Tab, label: 'Live Board', count: () => this.active().length },
    { id: 'history' as Tab, label: 'History',    count: () => this.closedVisits().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  protected countByEsi(level: number) {
    return this.active().filter(v => v.esi_level === level).length;
  }

  protected formatMinutes(min: number): string {
    if (min < 60) return `${Math.floor(min)}m`;
    const h = Math.floor(min / 60); const m = Math.floor(min % 60);
    return `${h}h ${m}m`;
  }

  protected losMinutes(v: EdVisit): number {
    if (!v.departed_at) return 0;
    return Math.floor((+new Date(v.departed_at) - +new Date(v.arrived_at)) / 60_000);
  }

  private async refresh() {
    try {
      const [active, all] = await Promise.all([
        this.svc.listActive(),
        this.svc.listAll({}),
      ]);
      this.active.set(active);
      this.all.set(all);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async onRegistered(_id: string) {
    this.showRegister.set(false);
    await this.refresh();
  }

  protected openTriage(v: EdVisit) { this.triageVisit.set(v); }

  protected async onTriaged() {
    this.triageVisit.set(null);
    await this.refresh();
  }

  protected async markFirstSeen(v: EdVisit) {
    try { await this.svc.firstProviderContact(v.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async reassess(v: EdVisit) {
    const newEsi = prompt('New ESI level (1-5)? (leave empty to keep current)');
    const notes = prompt('Reassessment notes?') ?? '';
    try {
      await this.svc.reassess({
        visitId: v.id,
        esiLevelNew: newEsi ? Number(newEsi) : null,
        notes,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async dispose(v: EdVisit) {
    const dispo = prompt('Disposition (admitted / discharged / transferred / dama / referred)?');
    if (!dispo) return;
    const valid = ['admitted','discharged','transferred','dama','referred'];
    if (!valid.includes(dispo)) { alert('Invalid disposition'); return; }
    let damaReason: string | null = null;
    if (dispo === 'dama') {
      damaReason = prompt('DAMA reason?') ?? '';
      if (!damaReason) return;
    }
    let toFacility: string | null = null;
    if (dispo === 'transferred' || dispo === 'referred') {
      toFacility = prompt('Transferred / referred to (facility)?') ?? '';
    }
    try {
      await this.svc.recordDisposition({
        visitId: v.id,
        disposition: dispo as EdDisposition,
        damaReason,
        toFacility,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
