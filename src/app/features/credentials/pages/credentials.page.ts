import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { CredentialsService } from '../data/credentials.service';
import {
  CREDENTIAL_STATUS_LABELS,
  CREDENTIAL_TYPE_LABELS,
  type CredentialType,
  type ExpiringCredential,
  type StaffCredential,
} from '../data/credentials.types';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

@Component({
  selector: 'page-credentials',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ExportMenuComponent],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header class="flex items-end justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Credentials &amp; Training</h1>
      <p class="text-[12px] text-ink-soft">Track licences, registrations, certifications and mandatory trainings. Drives compliance dashboards.</p>
    </div>
    <div class="flex items-center gap-2">
      <app-export-menu [disabled]="(tab() === 'mine' ? mine().length : expiring().length) === 0" (pick)="onExport($event)"/>
      <button (click)="openNew()" class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white">+ Add credential</button>
    </div>
  </header>

  <nav class="flex gap-1 border-b border-border flex-wrap">
    @for (t of tabs; track t.id) {
      <button (click)="tab.set(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}<span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- My credentials -->
  @if (tab() === 'mine') {
    <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr>
            <th class="px-3 py-2">Type</th>
            <th class="px-3 py-2">Name</th>
            <th class="px-3 py-2">Issuer</th>
            <th class="px-3 py-2">Issued</th>
            <th class="px-3 py-2">Expires</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          @for (c of mine(); track c.id) {
            <tr class="border-t border-border" [class.bg-danger-fg]="c.status === 'expired'" [class.bg-opacity-5]="c.status === 'expired'">
              <td class="px-3 py-2">{{ CREDENTIAL_TYPE_LABELS[c.type] }}</td>
              <td class="px-3 py-2 font-medium">
                {{ c.name }}
                @if (c.is_mandatory) { <span class="ml-1 text-[10px] uppercase text-warn-fg">Mandatory</span> }
              </td>
              <td class="px-3 py-2 text-ink-soft">{{ c.issuer || '—' }}</td>
              <td class="px-3 py-2 text-ink-soft font-mono">{{ c.issued_on || '—' }}</td>
              <td class="px-3 py-2 font-mono"
                  [class.text-danger-fg]="c.status === 'expired'"
                  [class.text-warn-fg]="c.status === 'expiring_30' || c.status === 'expiring_60'">
                {{ c.expires_on || '—' }}
              </td>
              <td class="px-3 py-2">
                <span class="text-[10px] uppercase px-1.5 py-0.5 rounded"
                      [class.bg-good-fg]="c.status === 'active'" [class.text-white]="c.status === 'active' || c.status === 'expired'"
                      [class.bg-danger-fg]="c.status === 'expired'"
                      [class.bg-warn-fg]="c.status === 'expiring_30' || c.status === 'expiring_60' || c.status === 'expiring_90'">
                  {{ CREDENTIAL_STATUS_LABELS[c.status] }}
                </span>
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="openEdit(c)" class="text-[11px] text-brand hover:underline">Edit</button>
                <button (click)="remove(c)" class="ml-2 text-[11px] text-danger-fg hover:underline">Delete</button>
              </td>
            </tr>
          }
          @if (mine().length === 0) {
            <tr><td colspan="7" class="px-3 py-6 text-center text-ink-soft">No credentials. Click "Add credential" to start.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- Org-wide expiry dashboard -->
  @if (tab() === 'expiring') {
    @if (canManage()) {
      <div class="flex items-center gap-2">
        <label class="text-[10px] uppercase text-ink-soft">Window</label>
        <select [(ngModel)]="windowDays" (ngModelChange)="loadExpiring()"
                class="rounded-md border border-border bg-surface px-2 py-1 text-sm">
          <option [ngValue]="30">30 days</option>
          <option [ngValue]="60">60 days</option>
          <option [ngValue]="90">90 days</option>
          <option [ngValue]="180">180 days</option>
        </select>
      </div>

      <div class="rounded-md border border-border bg-surface-card overflow-x-auto">
        <table class="min-w-full text-[12px]">
          <thead class="text-ink-soft text-left">
            <tr>
              <th class="px-3 py-2">Staff</th>
              <th class="px-3 py-2">Role</th>
              <th class="px-3 py-2">Credential</th>
              <th class="px-3 py-2">Type</th>
              <th class="px-3 py-2">Expires</th>
              <th class="px-3 py-2 text-right">Days left</th>
              <th class="px-3 py-2">Mandatory</th>
            </tr>
          </thead>
          <tbody>
            @for (e of expiring(); track e.credential_id) {
              <tr class="border-t border-border"
                  [class.bg-danger-fg]="e.days_left < 0"
                  [class.bg-opacity-5]="e.days_left < 0">
                <td class="px-3 py-2 font-medium">{{ e.full_name }}</td>
                <td class="px-3 py-2 text-ink-soft">{{ e.role_slug }}</td>
                <td class="px-3 py-2">{{ e.name }}</td>
                <td class="px-3 py-2">{{ CREDENTIAL_TYPE_LABELS[e.type] }}</td>
                <td class="px-3 py-2 font-mono">{{ e.expires_on }}</td>
                <td class="px-3 py-2 text-right tabular-nums"
                    [class.text-danger-fg]="e.days_left < 0"
                    [class.text-warn-fg]="e.days_left >= 0 && e.days_left <= 30">
                  {{ e.days_left }}
                </td>
                <td class="px-3 py-2">{{ e.is_mandatory ? 'Yes' : 'No' }}</td>
              </tr>
            }
            @if (expiring().length === 0) {
              <tr><td colspan="7" class="px-3 py-6 text-center text-ink-soft">No credentials expiring in this window. ✓</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="text-[12px] text-ink-soft">Org-wide view is HR-admin only.</p>
    }
  }

  <!-- Editor -->
  @if (editorOpen()) {
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" (document:keydown.escape)="closeEditor()">
      <div class="bg-surface-card rounded-md border border-border w-full max-w-xl p-4 space-y-3 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <h3 class="text-base font-semibold">{{ form.id ? 'Edit credential' : 'Add credential' }}</h3>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Type</span>
            <select [(ngModel)]="form.type"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
              @for (k of typeKeys; track k) { <option [value]="k">{{ CREDENTIAL_TYPE_LABELS[k] }}</option> }
            </select>
          </label>
          <label class="flex items-center gap-2 text-[12px] mt-6">
            <input type="checkbox" [(ngModel)]="form.is_mandatory" /> Mandatory
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Name *</span>
          <input [(ngModel)]="form.name" placeholder="e.g., MCI Registration / BLS"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Issuer</span>
          <input [(ngModel)]="form.issuer" placeholder="e.g., MCI / AHA / TNMC"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <div class="grid md:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Issued on</span>
            <input type="date" [(ngModel)]="form.issued_on"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Expires on</span>
            <input type="date" [(ngModel)]="form.expires_on"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Document URL</span>
          <input [(ngModel)]="form.document_url" placeholder="https://…"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>

        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Notes</span>
          <textarea rows="2" [(ngModel)]="form.notes"
                    class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
        </label>

        @if (error()) { <p class="text-[12px] text-danger-fg">{{ error() }}</p> }

        <div class="flex justify-end gap-2 pt-2">
          <button (click)="closeEditor()" class="px-3 py-1.5 text-[12px] rounded-md border border-border">Cancel</button>
          <button (click)="save()"
                  [disabled]="busy() || !form.name?.trim()"
                  class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white disabled:opacity-50">
            {{ busy() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  }
</section>
  `,
})
export class CredentialsPage implements OnInit {
  private svc = inject(CredentialsService);
  private auth = inject(AuthStore);
  private branch = inject(BranchStore);
  private exportSvc = inject(ExportService);

  protected CREDENTIAL_TYPE_LABELS = CREDENTIAL_TYPE_LABELS;
  protected CREDENTIAL_STATUS_LABELS = CREDENTIAL_STATUS_LABELS;
  protected typeKeys = Object.keys(CREDENTIAL_TYPE_LABELS) as CredentialType[];

  protected mine = signal<StaffCredential[]>([]);
  protected expiring = signal<ExpiringCredential[]>([]);
  protected tab = signal<'mine' | 'expiring'>('mine');
  protected windowDays = 90;

  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected editorOpen = signal(false);

  protected form: {
    id: string | null;
    type: CredentialType;
    name: string;
    issuer: string;
    issued_on: string;
    expires_on: string;
    document_url: string;
    notes: string;
    is_mandatory: boolean;
  } = { id: null, type: 'certification', name: '', issuer: '', issued_on: '', expires_on: '', document_url: '', notes: '', is_mandatory: false };

  protected canManage = computed(() => this.auth.has('credentials.write') && this.auth.hasRole('super_admin','branch_admin','hr'));
  protected myStaffId = computed(() => this.auth.staffId());

  protected tabs = [
    { id: 'mine'     as const, label: 'My credentials',  count: () => this.mine().length },
    ...(this.auth.hasRole('super_admin','branch_admin','hr') ? [{ id: 'expiring' as const, label: 'Expiring (org)', count: () => this.expiring().length }] : []),
  ];

  ngOnInit() { void this.refresh(); void this.loadExpiring(); }

  protected async refresh(): Promise<void> {
    const me = this.myStaffId();
    if (!me) { this.mine.set([]); return; }
    try {
      this.mine.set(await this.svc.listMine(me));
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    }
  }

  protected async loadExpiring(): Promise<void> {
    if (!this.canManage()) return;
    try {
      this.expiring.set(await this.svc.expiring(this.windowDays));
    } catch (e) {
      this.expiring.set([]);
    }
  }

  protected openNew(): void {
    this.form = { id: null, type: 'certification', name: '', issuer: '', issued_on: '', expires_on: '', document_url: '', notes: '', is_mandatory: false };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(c: StaffCredential): void {
    this.form = {
      id: c.id,
      type: c.type,
      name: c.name,
      issuer: c.issuer ?? '',
      issued_on: c.issued_on ?? '',
      expires_on: c.expires_on ?? '',
      document_url: c.document_url ?? '',
      notes: c.notes ?? '',
      is_mandatory: c.is_mandatory,
    };
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void { this.editorOpen.set(false); }

  protected async save(): Promise<void> {
    if (!this.form.name?.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.upsert({
        id: this.form.id,
        staffId: this.myStaffId(),
        type: this.form.type,
        name: this.form.name.trim(),
        issuer: this.form.issuer || null,
        issuedOn: this.form.issued_on || null,
        expiresOn: this.form.expires_on || null,
        documentUrl: this.form.document_url || null,
        notes: this.form.notes || null,
        isMandatory: this.form.is_mandatory,
      });
      this.editorOpen.set(false);
      await this.refresh();
      await this.loadExpiring();
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(c: StaffCredential): Promise<void> {
    if (!confirm(`Delete credential "${c.name}"?`)) return;
    try {
      await this.svc.delete(c.id);
      await this.refresh();
      await this.loadExpiring();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    const branchLabel = this.branch.activeBranchName().replace(/\s+/g, '_');
    const today = new Date().toISOString().slice(0,10);

    if (this.tab() === 'mine') {
      const rows = this.mine().map(c => ({
        type:         CREDENTIAL_TYPE_LABELS[c.type],
        name:         c.name,
        issuer:       c.issuer ?? '',
        issued_on:    c.issued_on ?? '',
        expires_on:   c.expires_on ?? '',
        status:       CREDENTIAL_STATUS_LABELS[c.status],
        is_mandatory: c.is_mandatory ? 'Yes' : 'No',
      }));
      const columns: ExportColumn<any>[] = [
        { key: 'type',         header: 'Type',      width: 16, align: 'left' },
        { key: 'name',         header: 'Name',      width: 28, align: 'left' },
        { key: 'issuer',       header: 'Issuer',    width: 22, align: 'left' },
        { key: 'issued_on',    header: 'Issued',    width: 12, align: 'center', format: 'date' as const },
        { key: 'expires_on',   header: 'Expires',   width: 12, align: 'center', format: 'date' as const },
        { key: 'status',       header: 'Status',    width: 12, align: 'left' },
        { key: 'is_mandatory', header: 'Mandatory', width: 10, align: 'center' },
      ];
      await this.exportSvc.export(fmt, {
        filename: `MyCredentials_${branchLabel}_${today}`,
        title: 'My Credentials & Training',
        subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`,
        columns, rows,
        footer: 'Sree Diagnostics · Credentials Register',
      });
      return;
    }

    // expiring (org)
    const rows = this.expiring().map(e => ({
      staff_name:     e.full_name,
      role:           e.role_slug,
      type:           CREDENTIAL_TYPE_LABELS[e.type],
      name:           e.name,
      is_mandatory:   e.is_mandatory ? 'Yes' : 'No',
      expires_on:     e.expires_on,
      days_to_expiry: e.days_left,
    }));
    const columns: ExportColumn<any>[] = [
      { key: 'staff_name',     header: 'Staff',      width: 24, align: 'left' },
      { key: 'role',           header: 'Role',       width: 12, align: 'left' },
      { key: 'type',           header: 'Type',       width: 14, align: 'left' },
      { key: 'name',           header: 'Credential', width: 26, align: 'left' },
      { key: 'is_mandatory',   header: 'Mandatory',  width: 10, align: 'center' },
      { key: 'expires_on',     header: 'Expires',    width: 12, align: 'center', format: 'date' as const },
      { key: 'days_to_expiry', header: 'Days to exp.', width: 10, align: 'right', format: 'integer' as const },
    ];
    await this.exportSvc.export(fmt, {
      filename: `ExpiringCredentials_${branchLabel}_${today}`,
      title: 'Expiring Credentials (organisation)',
      subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'} · within ${this.windowDays}d window`,
      meta: { filters: [{ label: 'Window', value: `${this.windowDays} days` }] },
      columns, rows,
      footer: 'Sree Diagnostics · Credentials Expiry Register',
    });
  }
}
