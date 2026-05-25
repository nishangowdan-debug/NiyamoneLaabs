import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CodeBlueService } from '../data/code-blue.service';
import {
  ACTION_LABELS, OUTCOME_LABELS, TEAM_ROLE_LABELS,
  type CodeBlueAction, type CodeBlueActionType, type CodeBlueEvent,
  type CodeBlueOutcome, type CodeBlueTeamMember, type CodeBlueTeamRole,
} from '../data/code-blue.types';

type TimingField = 'arrived_at' | 'cpr_started_at' | 'intubated_at' | 'rosc_at' | 'outcome_at' | 'time_of_death';

@Component({
  selector: 'app-code-blue-cockpit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" (document:keydown.escape)="close()">
  <div class="w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between"
         [class.bg-danger-fg]="event.outcome === 'in_progress'"
         [class.text-white]="event.outcome === 'in_progress'">
      <div>
        <h3 class="text-base font-bold">{{ event.event_no }} · {{ outcomeLabel(event.outcome) }}</h3>
        <p class="text-[11px] opacity-90">
          Called {{ event.called_at | date:'short' }} · {{ event.location_text || '—' }}
        </p>
      </div>
      <button (click)="close()" [class.text-white]="event.outcome === 'in_progress'"
              [class.text-ink-soft]="event.outcome !== 'in_progress'">✕</button>
    </div>

    <div class="p-4 space-y-4">
      @if (event.had_active_dnr && !event.dnr_warning_acknowledged) {
        <div class="rounded-md border-2 border-warn-fg bg-warn-fg/10 px-3 py-3 text-[12px]">
          <strong>⚠ ACTIVE DNR ON RECORD</strong> — proceeding with resuscitation overrides standing
          directive. Document the reason (verbal revocation, family consent, etc.).
          <div class="mt-2 flex gap-2">
            <input [(ngModel)]="ackNote" placeholder="Reason for proceeding…"
                   class="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]" />
            <button (click)="ackDnr()" [disabled]="!ackNote.trim()"
                    class="px-3 py-1.5 text-[12px] rounded-md bg-warn-fg text-white disabled:opacity-50">
              Acknowledge
            </button>
          </div>
        </div>
      }

      <!-- Timing milestones -->
      <section>
        <h4 class="text-[12px] font-semibold uppercase text-ink-soft mb-2">Timing</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-[12px]">
          @for (m of milestones; track m.field) {
            <div class="rounded-md border border-border p-2 bg-surface-subtle">
              <p class="text-[10px] text-ink-soft uppercase">{{ m.label }}</p>
              <p class="font-semibold">{{ milestoneValue(m.field) ? (milestoneValue(m.field) | date:'mediumTime') : '—' }}</p>
              @if (event.outcome === 'in_progress' && !milestoneValue(m.field)) {
                <button (click)="markNow(m.field)" class="text-[10px] text-brand hover:underline">Mark now</button>
              }
            </div>
          }
        </div>
      </section>

      <!-- Action timeline -->
      <section>
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Timeline ({{ actions().length }})</h4>
        </div>

        @if (event.outcome === 'in_progress') {
          <div class="rounded-md border border-border bg-surface-subtle p-3 space-y-2 mb-2">
            <div class="grid grid-cols-3 gap-2">
              <select [(ngModel)]="newActionType"
                      class="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]">
                @for (a of actionTypes; track a) {
                  <option [value]="a">{{ actionLabel(a) }}</option>
                }
              </select>
              <input [(ngModel)]="newActionPerformer" placeholder="Performed by"
                     class="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]" />
              <input [(ngModel)]="newActionDetails" placeholder="Details (e.g. Adrenaline 1mg IV)"
                     class="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]" />
            </div>
            <div class="flex gap-2 flex-wrap">
              <button (click)="quickLog('cpr_cycle','CPR cycle')" class="px-2 py-1 text-[10px] rounded bg-surface-card border border-border">+ CPR cycle</button>
              <button (click)="quickLog('medication','Adrenaline 1 mg IV')" class="px-2 py-1 text-[10px] rounded bg-surface-card border border-border">+ Adrenaline</button>
              <button (click)="quickLog('medication','Amiodarone 300 mg IV')" class="px-2 py-1 text-[10px] rounded bg-surface-card border border-border">+ Amiodarone</button>
              <button (click)="quickLog('defibrillation','200 J biphasic shock')" class="px-2 py-1 text-[10px] rounded bg-surface-card border border-border">+ Shock 200J</button>
              <button (click)="quickLog('rhythm_check','Rhythm check')" class="px-2 py-1 text-[10px] rounded bg-surface-card border border-border">+ Rhythm check</button>
              <button (click)="logCustomAction()" [disabled]="!newActionDetails.trim()"
                      class="px-3 py-1 text-[11px] rounded bg-brand text-white disabled:opacity-50">+ Log</button>
            </div>
          </div>
        }

        <div class="space-y-1">
          @for (a of actions(); track a.id) {
            <div class="flex items-start gap-3 text-[12px] border-l-2 border-brand pl-3 py-1">
              <span class="font-mono text-[11px] text-ink-soft min-w-[60px]">{{ a.action_at | date:'mediumTime' }}</span>
              <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-surface-subtle">
                {{ actionLabel(a.action_type) }}
              </span>
              <span class="flex-1">
                {{ a.notes || (a.details && a.details['note']) || '' }}
                @if (a.performed_by_name) { <span class="text-ink-soft">· {{ a.performed_by_name }}</span> }
              </span>
            </div>
          }
        </div>
      </section>

      <!-- Team -->
      <section>
        <h4 class="text-[12px] font-semibold uppercase text-ink-soft mb-2">Team ({{ team().length }})</h4>
        @if (event.outcome === 'in_progress') {
          <div class="grid grid-cols-3 gap-2 mb-2">
            <input [(ngModel)]="newMemberName" placeholder="Staff name"
                   class="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]" />
            <select [(ngModel)]="newMemberRole"
                    class="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]">
              @for (r of teamRoles; track r) {
                <option [value]="r">{{ teamRoleLabel(r) }}</option>
              }
            </select>
            <button (click)="addMember()" [disabled]="!newMemberName.trim()"
                    class="px-3 py-1.5 text-[11px] rounded bg-brand text-white disabled:opacity-50">+ Add</button>
          </div>
        }
        <div class="flex flex-wrap gap-1.5">
          @for (m of team(); track m.id) {
            <span class="px-2 py-0.5 rounded-full bg-surface-subtle text-[11px]">
              <strong>{{ m.staff_name }}</strong> · {{ teamRoleLabel(m.role) }}
            </span>
          }
        </div>
      </section>

      <!-- Close event -->
      @if (event.outcome === 'in_progress') {
        <section class="rounded-md border border-border p-3 bg-surface-subtle space-y-2">
          <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Close Event</h4>
          <div class="grid md:grid-cols-2 gap-2">
            <select [(ngModel)]="closeOutcome"
                    class="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]">
              <option value="rosc">ROSC achieved</option>
              <option value="deceased">Deceased</option>
              <option value="transferred">Transferred (e.g. ICU)</option>
              <option value="false_alarm">False alarm</option>
              <option value="aborted_dnr">Aborted (DNR honoured)</option>
            </select>
            @if (closeOutcome === 'deceased') {
              <input type="datetime-local" [(ngModel)]="closeTimeOfDeath"
                     class="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]" />
            }
          </div>
          <textarea [(ngModel)]="closeDebrief" rows="2"
                    placeholder="Debrief summary…"
                    class="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12px]"></textarea>
          @if (closeError()) { <p class="text-[11px] text-danger-fg">{{ closeError() }}</p> }
          <div class="flex justify-end">
            <button (click)="closeEvent()" [disabled]="closeBusy()"
                    class="px-3 py-1.5 text-[12px] rounded-md bg-danger-fg text-white disabled:opacity-50">
              {{ closeBusy() ? 'Closing…' : 'Close Event' }}
            </button>
          </div>
        </section>
      }

      @if (event.outcome !== 'in_progress' && event.debrief_summary) {
        <section class="rounded-md border border-border p-3 bg-surface-subtle">
          <h4 class="text-[12px] font-semibold uppercase text-ink-soft">Debrief</h4>
          <p class="text-[12px] mt-1 whitespace-pre-wrap">{{ event.debrief_summary }}</p>
        </section>
      }
    </div>
  </div>
</div>
  `,
})
export class CodeBlueCockpitComponent implements OnInit {
  private cb = inject(CodeBlueService);

  @Input({ required: true }) event!: CodeBlueEvent;
  @Output() closed = new EventEmitter<void>();

  protected actions = signal<CodeBlueAction[]>([]);
  protected team = signal<CodeBlueTeamMember[]>([]);

  protected ackNote = '';
  protected newActionType: CodeBlueActionType = 'medication';
  protected newActionPerformer = '';
  protected newActionDetails = '';
  protected newMemberName = '';
  protected newMemberRole: CodeBlueTeamRole = 'compressions';

  protected closeOutcome: CodeBlueOutcome = 'rosc';
  protected closeTimeOfDeath = '';
  protected closeDebrief = '';
  protected closeBusy = signal(false);
  protected closeError = signal<string | null>(null);

  protected outcomeLabel = (o: CodeBlueOutcome) => OUTCOME_LABELS[o];
  protected actionLabel = (a: CodeBlueActionType) => ACTION_LABELS[a];
  protected teamRoleLabel = (r: CodeBlueTeamRole) => TEAM_ROLE_LABELS[r];

  protected actionTypes: CodeBlueActionType[] = ['cpr_cycle','medication','defibrillation','intubation','rhythm_check','vitals','airway','other'];
  protected teamRoles: CodeBlueTeamRole[] = ['team_lead','airway','compressions','medications','recorder','runner','observer'];

  protected milestones: { field: TimingField; label: string }[] = [
    { field: 'arrived_at',     label: 'Team arrived' },
    { field: 'cpr_started_at', label: 'CPR started' },
    { field: 'intubated_at',   label: 'Intubated' },
    { field: 'rosc_at',        label: 'ROSC' },
    { field: 'outcome_at',     label: 'Closed' },
    { field: 'time_of_death',  label: 'Time of death' },
  ];

  protected milestoneValue(field: TimingField): string | null {
    return (this.event[field] as string | null) ?? null;
  }

  ngOnInit() { this.refresh(); }

  private async refresh() {
    try {
      const [actions, team] = await Promise.all([
        this.cb.listActions(this.event.id),
        this.cb.listMembers(this.event.id),
      ]);
      this.actions.set(actions);
      this.team.set(team);
    } catch (e: any) { console.error(e); }
  }

  protected close() { this.closed.emit(); }

  protected async ackDnr() {
    if (!this.ackNote.trim()) return;
    try {
      await this.cb.ackDnr(this.event.id, this.ackNote.trim());
      this.event = await this.cb.getEvent(this.event.id);
      this.ackNote = '';
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async markNow(field: TimingField) {
    const now = new Date().toISOString();
    try {
      await this.cb.setTiming({
        eventId: this.event.id,
        arrivedAt:     field === 'arrived_at'     ? now : null,
        cprStartedAt:  field === 'cpr_started_at' ? now : null,
        intubatedAt:   field === 'intubated_at'   ? now : null,
        roscAt:        field === 'rosc_at'        ? now : null,
      });
      this.event = await this.cb.getEvent(this.event.id);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async quickLog(type: CodeBlueActionType, label: string) {
    try {
      await this.cb.logAction({ eventId: this.event.id, actionType: type, notes: label });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async logCustomAction() {
    if (!this.newActionDetails.trim()) return;
    try {
      await this.cb.logAction({
        eventId: this.event.id, actionType: this.newActionType,
        notes: this.newActionDetails.trim(),
        performerName: this.newActionPerformer.trim() || null,
      });
      this.newActionDetails = '';
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async addMember() {
    if (!this.newMemberName.trim()) return;
    try {
      await this.cb.addMember({
        eventId: this.event.id,
        staffName: this.newMemberName.trim(),
        role: this.newMemberRole,
      });
      this.newMemberName = '';
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async closeEvent() {
    this.closeBusy.set(true); this.closeError.set(null);
    try {
      await this.cb.closeEvent({
        eventId: this.event.id,
        outcome: this.closeOutcome,
        timeOfDeath: this.closeOutcome === 'deceased' && this.closeTimeOfDeath
          ? new Date(this.closeTimeOfDeath).toISOString() : null,
        debrief: this.closeDebrief.trim() || null,
      });
      this.event = await this.cb.getEvent(this.event.id);
      this.closeBusy.set(false);
      this.closed.emit();
    } catch (e: any) {
      this.closeError.set(e?.message ?? 'Failed');
      this.closeBusy.set(false);
    }
  }
}
