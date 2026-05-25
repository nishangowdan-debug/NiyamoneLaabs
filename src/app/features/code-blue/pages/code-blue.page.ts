import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CodeBlueService } from '../data/code-blue.service';
import {
  DNR_TYPE_LABELS, OUTCOME_LABELS,
  type CodeBlueEvent, type DnrOrder,
} from '../data/code-blue.types';
import { CodeBlueCockpitComponent } from '../components/code-blue-cockpit.component';
import { CallCodeBlueDialogComponent } from '../components/call-code-blue-dialog.component';

type Tab = 'active' | 'history' | 'dnr';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CodeBlueCockpitComponent, CallCodeBlueDialogComponent],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Code Blue &amp; DNR</h1>
      <p class="text-[12px] text-ink-soft">Cardiac arrest response &amp; end-of-life directives</p>
    </div>
    <button (click)="showCall.set(true)"
            class="px-3 py-1.5 text-[13px] rounded-md bg-danger-fg text-white font-semibold">
      🚨 Call Code Blue
    </button>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}
        <span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  @if (tab() === 'active') {
    <div class="rounded-md border border-border bg-surface-card">
      @if (activeEvents().length === 0) {
        <p class="px-4 py-3 text-[12px] text-ink-soft">No active events.</p>
      } @else {
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr><th class="px-3 py-2">Event</th><th class="px-3 py-2">Called</th>
                <th class="px-3 py-2">Patient</th><th class="px-3 py-2">Location</th>
                <th class="px-3 py-2">DNR?</th><th class="px-3 py-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            @for (e of activeEvents(); track e.id) {
              <tr class="border-t border-border bg-danger-fg/5">
                <td class="px-3 py-2 font-mono">{{ e.event_no }}</td>
                <td class="px-3 py-2">{{ e.called_at | date:'short' }}</td>
                <td class="px-3 py-2 font-mono text-[10px]">{{ e.patient_id ? e.patient_id.slice(0,8) : '—' }}</td>
                <td class="px-3 py-2">{{ e.location_text || '—' }}</td>
                <td class="px-3 py-2">
                  @if (e.had_active_dnr) {
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-warn-fg text-white">DNR ON FILE</span>
                  } @else { — }
                </td>
                <td class="px-3 py-2 text-right">
                  <button (click)="openCockpit(e)" class="px-2 py-1 text-[11px] rounded bg-brand text-white">Open cockpit</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  }

  @if (tab() === 'history') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Event</th><th class="px-3 py-2">Called</th>
              <th class="px-3 py-2">Outcome</th><th class="px-3 py-2">Patient</th>
              <th class="px-3 py-2">Location</th><th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (e of pastEvents(); track e.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono">{{ e.event_no }}</td>
              <td class="px-3 py-2">{{ e.called_at | date:'short' }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="e.outcome === 'rosc'"
                      [class.text-white]="e.outcome === 'rosc' || e.outcome === 'deceased'"
                      [class.bg-danger-fg]="e.outcome === 'deceased'">
                  {{ outcomeLabel(e.outcome) }}
                </span>
              </td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ e.patient_id ? e.patient_id.slice(0,8) : '—' }}</td>
              <td class="px-3 py-2">{{ e.location_text || '—' }}</td>
              <td class="px-3 py-2 text-right">
                <button (click)="openCockpit(e)" class="text-[11px] text-brand hover:underline">View</button>
              </td>
            </tr>
          }
          @if (pastEvents().length === 0) {
            <tr><td colspan="6" class="px-3 py-3 text-center text-ink-soft">No history yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab() === 'dnr') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Patient</th><th class="px-3 py-2">Type</th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2">Effective From</th>
              <th class="px-3 py-2">Doctor</th><th class="px-3 py-2">Basis</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (d of dnrOrders(); track d.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono text-[10px]">{{ d.patient_id.slice(0,8) }}</td>
              <td class="px-3 py-2">{{ dnrTypeLabel(d.order_type) }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-warn-fg]="d.status === 'active'"
                      [class.bg-surface-subtle]="d.status !== 'active'"
                      [class.text-white]="d.status === 'active'">
                  {{ d.status }}
                </span>
              </td>
              <td class="px-3 py-2">{{ d.effective_from | date:'mediumDate' }}</td>
              <td class="px-3 py-2">{{ d.authorizing_doctor_name }}</td>
              <td class="px-3 py-2">{{ d.decision_basis }}</td>
              <td class="px-3 py-2 text-right">
                @if (d.status === 'active') {
                  <button (click)="revoke(d)" class="text-[11px] text-danger-fg hover:underline">Revoke</button>
                }
              </td>
            </tr>
          }
          @if (dnrOrders().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No DNR orders yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>

@if (showCall()) {
  <app-call-code-blue-dialog
    (created)="onEventCreated($event)"
    (cancelled)="showCall.set(false)" />
}

@if (cockpitEvent()) {
  <app-code-blue-cockpit
    [event]="cockpitEvent()!"
    (closed)="onCockpitClosed()" />
}
  `,
})
export class CodeBluePage implements OnInit {
  private cb = inject(CodeBlueService);

  protected tab = signal<Tab>('active');
  protected events = signal<CodeBlueEvent[]>([]);
  protected dnrOrders = signal<DnrOrder[]>([]);

  protected showCall = signal(false);
  protected cockpitEvent = signal<CodeBlueEvent | null>(null);

  protected activeEvents = computed(() => this.events().filter(e => e.outcome === 'in_progress'));
  protected pastEvents   = computed(() => this.events().filter(e => e.outcome !== 'in_progress'));

  protected tabs = [
    { id: 'active'  as Tab, label: 'Active',   count: () => this.activeEvents().length },
    { id: 'history' as Tab, label: 'History',  count: () => this.pastEvents().length   },
    { id: 'dnr'     as Tab, label: 'DNR Orders', count: () => this.dnrOrders().length  },
  ];

  protected outcomeLabel = (o: any) => OUTCOME_LABELS[o as keyof typeof OUTCOME_LABELS] ?? o;
  protected dnrTypeLabel = (t: any) => DNR_TYPE_LABELS[t as keyof typeof DNR_TYPE_LABELS] ?? t;

  ngOnInit() { this.refresh(); }

  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [events, dnrs] = await Promise.all([
        this.cb.listEvents({}),
        this.cb.listDnrOrders({}),
      ]);
      this.events.set(events);
      this.dnrOrders.set(dnrs);
    } catch (e: any) { alert(e?.message ?? 'Failed to load'); }
  }

  protected async onEventCreated(eventId: string) {
    this.showCall.set(false);
    try {
      const ev = await this.cb.getEvent(eventId);
      this.cockpitEvent.set(ev);
      await this.refresh();
    } catch {/* */}
  }

  protected async openCockpit(e: CodeBlueEvent) {
    try {
      const fresh = await this.cb.getEvent(e.id);
      this.cockpitEvent.set(fresh);
    } catch (err: any) { alert(err?.message ?? 'Failed'); }
  }

  protected onCockpitClosed() {
    this.cockpitEvent.set(null);
    this.refresh();
  }

  protected async revoke(d: DnrOrder) {
    const reason = prompt('Reason for revocation?');
    if (!reason) return;
    try {
      await this.cb.revokeDnr(d.id, reason);
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
