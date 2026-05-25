import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OtService } from '../data/ot.service';
import {
  ANESTHESIA_LABELS, STATUS_LABELS, TEAM_ROLE_LABELS, WHO_CHECKLIST,
  type AnesthesiaType, type AsaGrade, type ChecklistPhase, type OtRecord,
  type OtRecordStatus, type OtTeamMember, type OtTeamRole, type SurgicalProcedure,
} from '../data/ot.types';
import { OtRecordDetailComponent } from '../components/ot-record-detail.component';
import { OtNewRecordDialogComponent } from '../components/ot-new-record-dialog.component';

type Tab = 'today' | 'in_progress' | 'completed' | 'cancelled';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, OtRecordDetailComponent, OtNewRecordDialogComponent],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Operating Theatre Register</h1>
      <p class="text-[12px] text-ink-soft">WHO Surgical Safety Checklist · operative log · counts · implants &amp; specimens</p>
    </div>
    <button (click)="showNew.set(true)"
            class="px-3 py-1.5 text-[13px] rounded-md bg-brand text-white">+ New OT Record</button>
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

  <div class="rounded-md border border-border bg-surface-card">
    <table class="min-w-full text-[12px]">
      <thead class="text-ink-soft text-left">
        <tr><th class="px-3 py-2">Record</th><th class="px-3 py-2">Patient</th>
            <th class="px-3 py-2">Procedure</th><th class="px-3 py-2">Surgeon</th>
            <th class="px-3 py-2">OT</th><th class="px-3 py-2">Scheduled</th>
            <th class="px-3 py-2">Status</th><th class="px-3 py-2">WHO</th>
            <th class="px-3 py-2 text-right">Action</th></tr>
      </thead>
      <tbody>
        @for (r of filtered(); track r.id) {
          <tr class="border-t border-border">
            <td class="px-3 py-2 font-mono">{{ r.record_no }}</td>
            <td class="px-3 py-2 font-mono text-[10px]">{{ r.patient_id.slice(0,8) }}</td>
            <td class="px-3 py-2">{{ r.procedure_name }}</td>
            <td class="px-3 py-2">{{ r.primary_surgeon_name || '—' }}</td>
            <td class="px-3 py-2">{{ r.ot_room || '—' }}</td>
            <td class="px-3 py-2">{{ r.scheduled_start ? (r.scheduled_start | date:'short') : '—' }}</td>
            <td class="px-3 py-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                    [class.bg-good-fg]="r.status === 'completed'"
                    [class.bg-warn-fg]="r.status === 'in_progress' || r.status === 'sign_in'"
                    [class.bg-surface-subtle]="r.status === 'booked'"
                    [class.bg-danger-fg]="r.status === 'cancelled' || r.status === 'aborted'"
                    [class.text-white]="r.status !== 'booked'">
                {{ statusLabel(r.status) }}
              </span>
            </td>
            <td class="px-3 py-2 text-[10px]">
              <span [class.text-good-fg]="r.sign_in_at" [class.text-ink-soft]="!r.sign_in_at">●</span>
              <span [class.text-good-fg]="r.time_out_at" [class.text-ink-soft]="!r.time_out_at">●</span>
              <span [class.text-good-fg]="r.sign_out_at" [class.text-ink-soft]="!r.sign_out_at">●</span>
            </td>
            <td class="px-3 py-2 text-right">
              <button (click)="open(r)" class="text-[11px] text-brand hover:underline">Open</button>
            </td>
          </tr>
        }
        @if (filtered().length === 0) {
          <tr><td colspan="9" class="px-3 py-3 text-center text-ink-soft">No records.</td></tr>
        }
      </tbody>
    </table>
  </div>
</section>

@if (showNew()) {
  <app-ot-new-record-dialog
    [procedures]="procedures()"
    (created)="onCreated($event)"
    (cancelled)="showNew.set(false)" />
}

@if (selected()) {
  <app-ot-record-detail
    [record]="selected()!"
    (closed)="onDetailClosed()" />
}
  `,
})
export class OtPage implements OnInit {
  private svc = inject(OtService);

  protected tab = signal<Tab>('today');
  protected records = signal<OtRecord[]>([]);
  protected procedures = signal<SurgicalProcedure[]>([]);
  protected showNew = signal(false);
  protected selected = signal<OtRecord | null>(null);

  protected todayList = computed(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const tmrw  = new Date(today); tmrw.setDate(tmrw.getDate() + 1);
    return this.records().filter(r => {
      if (!r.scheduled_start) return false;
      const s = new Date(r.scheduled_start);
      return s >= today && s < tmrw;
    });
  });
  protected inProgress = computed(() => this.records().filter(r => r.status === 'in_progress' || r.status === 'sign_in'));
  protected completed  = computed(() => this.records().filter(r => r.status === 'completed'));
  protected cancelled  = computed(() => this.records().filter(r => r.status === 'cancelled' || r.status === 'aborted'));

  protected tabs = [
    { id: 'today'        as Tab, label: "Today's List",  count: () => this.todayList().length },
    { id: 'in_progress'  as Tab, label: 'In Progress',   count: () => this.inProgress().length },
    { id: 'completed'    as Tab, label: 'Completed',     count: () => this.completed().length },
    { id: 'cancelled'    as Tab, label: 'Cancelled',     count: () => this.cancelled().length },
  ];

  protected filtered = computed(() => {
    switch (this.tab()) {
      case 'today':       return this.todayList();
      case 'in_progress': return this.inProgress();
      case 'completed':   return this.completed();
      case 'cancelled':   return this.cancelled();
    }
  });

  protected statusLabel = (s: OtRecordStatus) => STATUS_LABELS[s];

  ngOnInit() { this.refresh(); }

  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [recs, procs] = await Promise.all([
        this.svc.listRecords({}),
        this.svc.listProcedures(),
      ]);
      this.records.set(recs);
      this.procedures.set(procs);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async onCreated(_id: string) {
    this.showNew.set(false);
    await this.refresh();
  }

  protected async open(r: OtRecord) {
    try {
      const fresh = await this.svc.getRecord(r.id);
      this.selected.set(fresh);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected onDetailClosed() {
    this.selected.set(null);
    this.refresh();
  }
}
