import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VisitorsService } from '../data/visitors.service';
import {
  ID_TYPE_LABELS, PURPOSE_LABELS,
  type Visitor, type VisitorIdType, type VisitorPurpose,
} from '../data/visitors.types';

type Tab = 'inside' | 'today' | 'check_in';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Visitor Management</h1>
    <p class="text-[12px] text-ink-soft">Check-in / check-out · ID capture · overstay tracking · NABH FMS</p>
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

  @if (tab() === 'check_in') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-2xl">
      <h3 class="text-sm font-semibold mb-3">Check-In</h3>
      <div class="grid md:grid-cols-2 gap-3 text-sm">
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Visitor name *</span>
          <input [(ngModel)]="cName"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Phone</span>
          <input [(ngModel)]="cPhone"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Purpose *</span>
          <select [(ngModel)]="cPurpose"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            @for (p of purposeOptions; track p) { <option [value]="p">{{ purposeLabel(p) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">ID Type</span>
          <select [(ngModel)]="cIdType"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">—</option>
            @for (t of idTypeOptions; track t) { <option [value]="t">{{ idTypeLabel(t) }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">ID Number</span>
          <input [(ngModel)]="cIdNo"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (cPurpose === 'patient_visit') {
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Patient ID</span>
            <input [(ngModel)]="cPatientId" placeholder="UUID"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Admission ID</span>
            <input [(ngModel)]="cAdmissionId" placeholder="UUID"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
          </label>
        } @else {
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Meeting with (name)</span>
            <input [(ngModel)]="cMeetingWith"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Department</span>
            <input [(ngModel)]="cDepartment"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        }
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Vehicle No</span>
          <input [(ngModel)]="cVehicle"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Accompanying</span>
          <input type="number" min="0" [(ngModel)]="cAccompanying"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Expected duration (min)</span>
          <input type="number" min="5" [(ngModel)]="cDuration"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @if (cError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ cError() }}</p> }
        @if (cSuccess()) { <p class="md:col-span-2 text-[12px] text-good-fg">{{ cSuccess() }}</p> }
        <div class="md:col-span-2 flex justify-end">
          <button (click)="checkIn()"
                  [disabled]="cBusy() || !cName.trim()"
                  class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ cBusy() ? 'Checking in…' : 'Issue Pass + Check In' }}
          </button>
        </div>
      </div>
    </div>
  }

  @if (tab() === 'inside') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">
        Visitors Inside <span class="text-ink-soft">({{ inside().length }})</span>
      </h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Pass</th><th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Purpose</th><th class="px-3 py-2">Meeting / Patient</th>
              <th class="px-3 py-2">Phone</th><th class="px-3 py-2">Checked in</th>
              <th class="px-3 py-2 text-right">Inside</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (v of inside(); track v.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="(v.minutes_overstay ?? 0) > 0"
                [class.bg-warn-fg]="(v.minutes_overstay ?? 0) === 0 && (v.minutes_inside ?? 0) > 240"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ v.pass_no }}</td>
              <td class="px-3 py-2">
                {{ v.visitor_name }}
                @if (v.accompanying_count > 0) { <span class="text-[10px] text-ink-soft">+{{ v.accompanying_count }}</span> }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ purposeLabel(v.purpose) }}</td>
              <td class="px-3 py-2 text-[11px]">
                @if (v.patient_id) {
                  <span class="font-mono text-[10px]">Pt: {{ v.patient_id.slice(0,8) }}</span>
                } @else {
                  {{ v.meeting_with_name }}
                  @if (v.meeting_with_department) { <span class="text-ink-soft">· {{ v.meeting_with_department }}</span> }
                }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ v.visitor_phone || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.checked_in_at | date:'shortTime' }}</td>
              <td class="px-3 py-2 text-right text-[11px]"
                  [class.text-danger-fg]="(v.minutes_overstay ?? 0) > 0">
                {{ formatMinutes(v.minutes_inside ?? 0) }}
                @if ((v.minutes_overstay ?? 0) > 0) {
                  <span class="block text-[10px]">+{{ formatMinutes(v.minutes_overstay ?? 0) }} over</span>
                }
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="checkOut(v)" class="text-[11px] text-brand hover:underline">Check Out</button>
                <span class="mx-1">·</span>
                <button (click)="blacklist(v)" class="text-[11px] text-danger-fg hover:underline">Blacklist</button>
              </td>
            </tr>
          }
          @if (inside().length === 0) {
            <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No visitors inside.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab() === 'today') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Pass</th><th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Purpose</th><th class="px-3 py-2">In</th>
              <th class="px-3 py-2">Out</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Phone</th><th class="px-3 py-2">ID</th></tr>
        </thead>
        <tbody>
          @for (v of today(); track v.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="v.status === 'blacklisted'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ v.pass_no }}</td>
              <td class="px-3 py-2">{{ v.visitor_name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ purposeLabel(v.purpose) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.checked_in_at | date:'shortTime' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.checked_out_at ? (v.checked_out_at | date:'shortTime') : '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.status }}</td>
              <td class="px-3 py-2 text-[11px]">{{ v.visitor_phone || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">
                {{ v.id_type ? idTypeLabel(v.id_type) : '—' }}
                @if (v.id_number) { <span class="font-mono text-[10px] block">{{ v.id_number }}</span> }
              </td>
            </tr>
          }
          @if (today().length === 0) {
            <tr><td colspan="8" class="px-3 py-3 text-center text-ink-soft">No visits today.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class VisitorsPage implements OnInit {
  private svc = inject(VisitorsService);

  protected tab = signal<Tab>('inside');
  protected inside = signal<Visitor[]>([]);
  protected today = signal<Visitor[]>([]);

  // Check-in form
  protected cName = '';
  protected cPhone = '';
  protected cPurpose: VisitorPurpose = 'patient_visit';
  protected cIdType: VisitorIdType | null = 'aadhaar';
  protected cIdNo = '';
  protected cPatientId = '';
  protected cAdmissionId = '';
  protected cMeetingWith = '';
  protected cDepartment = '';
  protected cVehicle = '';
  protected cAccompanying: number | null = 0;
  protected cDuration: number | null = 60;
  protected cBusy = signal(false);
  protected cError = signal<string | null>(null);
  protected cSuccess = signal<string | null>(null);

  protected purposeOptions: VisitorPurpose[] = ['patient_visit','vendor','contractor','interview','meeting','delivery','official','training','other'];
  protected idTypeOptions: VisitorIdType[] = ['aadhaar','pan','passport','driving_license','voter_id','employee_id','other'];

  protected purposeLabel = (p: VisitorPurpose) => PURPOSE_LABELS[p];
  protected idTypeLabel = (t: VisitorIdType) => ID_TYPE_LABELS[t];
  protected formatMinutes(min: number): string {
    if (min < 60) return `${Math.floor(min)}m`;
    const h = Math.floor(min / 60); const m = Math.floor(min % 60);
    return `${h}h ${m}m`;
  }

  protected tabs = [
    { id: 'inside'   as Tab, label: 'Inside Now', count: () => this.inside().length },
    { id: 'today'    as Tab, label: 'Today',      count: () => this.today().length },
    { id: 'check_in' as Tab, label: 'Check-In',   count: () => 0 },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const today = new Date().toISOString().slice(0,10);
      const [inside, todays] = await Promise.all([
        this.svc.listInside(),
        this.svc.listAll({ date: today }),
      ]);
      this.inside.set(inside);
      this.today.set(todays);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async checkIn() {
    if (!this.cName.trim()) return;
    this.cBusy.set(true); this.cError.set(null); this.cSuccess.set(null);
    try {
      await this.svc.checkIn({
        visitorName: this.cName.trim(),
        purpose: this.cPurpose,
        visitorPhone: this.cPhone.trim() || null,
        idType: this.cIdType,
        idNumber: this.cIdNo.trim() || null,
        patientId: this.cPatientId.trim() || null,
        admissionId: this.cAdmissionId.trim() || null,
        meetingWithName: this.cMeetingWith.trim() || null,
        meetingWithDepartment: this.cDepartment.trim() || null,
        vehicleNo: this.cVehicle.trim() || null,
        accompanyingCount: this.cAccompanying ?? 0,
        expectedDurationMin: this.cDuration ?? 60,
      });
      this.cSuccess.set('Pass issued. Visitor is now inside.');
      this.cName = ''; this.cPhone = ''; this.cIdNo = '';
      this.cPatientId = ''; this.cAdmissionId = '';
      this.cMeetingWith = ''; this.cDepartment = '';
      this.cVehicle = ''; this.cAccompanying = 0;
      await this.refresh();
      setTimeout(() => this.cSuccess.set(null), 3000);
    } catch (e: any) { this.cError.set(e?.message ?? 'Failed'); }
    finally { this.cBusy.set(false); }
  }

  protected async checkOut(v: Visitor) {
    try { await this.svc.checkOut(v.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async blacklist(v: Visitor) {
    const reason = prompt('Blacklist reason?');
    if (!reason) return;
    try { await this.svc.blacklist(v.id, reason); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
