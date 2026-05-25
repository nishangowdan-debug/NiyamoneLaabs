import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, effect, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { DepartmentsService } from '../data/departments.service';
import type { DepartmentView, DoctorOption } from '../data/departments.types';

@Component({
  selector: 'app-departments-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent],
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-4 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Departments</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ deps().length }} departments · {{ totalDoctors() }} doctors assigned ·
        @if (branchStore.activeBranchId() === null) {
          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[11px] font-medium">🌐 network view</span>
        } @else {
          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-good-bg text-good-fg text-[11px] font-medium">{{ branchStore.activeBranchName() }}</span>
        }
        ·
        <span class="inline-flex items-center gap-1.5 text-good-fg">
          <span class="size-1.5 rounded-full bg-good-fg animate-pulse"></span>live
        </span>
      </p>
    </div>
    @if (canManage()) {
      <button (click)="openNew()" class="h-9 px-3 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
        + New department
      </button>
    }
  </header>

  @if (error()) { <app-alert tone="danger" title="Could not load departments">{{ error() }}</app-alert> }

  @if (loading() && deps().length === 0) {
    <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center text-[13px] text-ink-muted">Loading…</div>
  } @else {
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      @for (d of deps(); track d.id) {
        <article class="bg-surface-card border border-border rounded-[10px] overflow-hidden hover:shadow-card transition-shadow"
                 [style.border-top]="'3px solid ' + d.color">
          <div class="px-4 py-3 flex items-start gap-3">
            <div class="size-10 rounded-md grid place-items-center text-white font-display font-bold text-[14px] shrink-0"
                 [style.background]="d.color">
              {{ initialsFromCode(d.code) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-[14px] font-semibold text-ink truncate">{{ d.name }}</h3>
                @if (!d.is_active) { <span class="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Inactive</span> }
              </div>
              <p class="text-[11px] font-mono text-ink-muted mt-0.5">
                {{ d.code }}
                @if ((d.branchCount ?? 1) > 1) {
                  <span class="ml-1 inline-flex items-center px-1 rounded text-[9px] uppercase tracking-[0.06em] bg-primary-50 text-primary-700 font-sans">in {{ d.branchCount }} hospitals</span>
                }
              </p>
            </div>
          </div>

          @if (d.description) {
            <p class="px-4 text-[12px] text-ink-soft line-clamp-2">{{ d.description }}</p>
          }

          <dl class="px-4 py-3 grid grid-cols-2 gap-y-1.5 gap-x-3 text-[12px]">
            <dt class="text-ink-muted">Head</dt>
            <dd class="text-ink truncate">{{ d.head?.full_name ?? '—' }}</dd>
            <dt class="text-ink-muted">Doctors</dt>
            <dd class="text-ink font-mono">{{ d.doctorsCount }}</dd>
            @if (d.floor) { <dt class="text-ink-muted">Floor</dt><dd class="text-ink">{{ d.floor }}</dd> }
            @if (d.phone) { <dt class="text-ink-muted">Phone</dt><dd class="text-ink truncate">{{ d.phone }}</dd> }
          </dl>

          @if (canManage()) {
            <div class="px-4 py-2 border-t border-border bg-surface-muted/40 flex justify-end gap-2">
              <button (click)="openEdit(d)" class="h-7 px-2.5 rounded text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">Edit</button>
              <button (click)="quickToggle(d)" class="h-7 px-2.5 rounded text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-card">
                {{ d.is_active ? 'Archive' : 'Activate' }}
              </button>
            </div>
          }
        </article>
      }
    </div>
  }
</div>

<!-- Department modal -->
@if (modal()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="closeModal()">
    <div role="dialog" aria-modal="true"
         class="w-full max-w-[640px] bg-surface-card border border-border rounded-[12px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
         (click)="$event.stopPropagation()">
      <h2 class="font-display text-[18px] font-medium text-ink">
        {{ editId() ? 'Edit department' : 'New department' }}
      </h2>
      <p class="text-[12px] text-ink-muted mt-0.5">Group doctors by clinical specialty for routing &amp; reporting.</p>

      <div class="mt-4 grid grid-cols-12 gap-3">
        <label class="col-span-4 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Code *</span>
          <input type="text" [(ngModel)]="f_code" name="dcode" placeholder="CARDIO"
                 class="w-full h-9 px-2.5 text-[13px] font-mono uppercase bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-8 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name *</span>
          <input type="text" [(ngModel)]="f_name" name="dname" placeholder="Cardiology"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-12 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Description</span>
          <input type="text" [(ngModel)]="f_desc" name="ddesc" placeholder="Heart &amp; vascular care, ECG, stress tests"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Head of department</span>
          <select [(ngModel)]="f_head" name="dhead"
                  class="w-full h-9 px-2.5 pr-7 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
            <option value="">—</option>
            @for (doc of doctors(); track doc.id) {
              <option [value]="doc.id">{{ doc.full_name }}@if (doc.specialty) { · {{ doc.specialty }} }</option>
            }
          </select>
        </label>
        <label class="col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Floor</span>
          <input type="text" [(ngModel)]="f_floor" name="dfloor" placeholder="Ground / 1st"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-3 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Color</span>
          <div class="flex items-center gap-2">
            <input type="color" [(ngModel)]="f_color" name="dcolor"
                   class="h-9 w-12 px-1 rounded-md border border-border cursor-pointer" />
            <input type="text" [(ngModel)]="f_color" name="dcolortxt"
                   class="flex-1 h-9 px-2.5 text-[12px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </div>
        </label>

        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Phone</span>
          <input type="text" [(ngModel)]="f_phone" name="dphone" placeholder="+91 80 1234 5678"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>
        <label class="col-span-6 block">
          <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email</span>
          <input type="email" [(ngModel)]="f_email" name="demail" placeholder="cardio@hospital.in"
                 class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </label>

        @if (editId()) {
          <label class="col-span-12 flex items-center gap-2">
            <input type="checkbox" [(ngModel)]="f_active" name="dactive" class="size-4 rounded border-border accent-primary-600" />
            <span class="text-[12px] text-ink-soft">Active department</span>
          </label>
        }
      </div>

      @if (formError()) { <p class="mt-3 text-[12px] text-danger-fg">{{ formError() }}</p> }

      <div class="mt-5 flex justify-end gap-2">
        <button (click)="closeModal()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
        <button (click)="confirm()" [disabled]="!f_code || !f_name || busy()"
                class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
          {{ busy() ? 'Saving…' : (editId() ? 'Save changes' : 'Create department') }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class DepartmentsPage implements OnInit {
  private svc = inject(DepartmentsService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private toast = inject(ToastService);

  /** Auto-reload when the active branch changes (skips the initial run before ngOnInit). */
  private readonly _branchSync = effect(() => {
    const id = this.branchStore.activeBranchId();
    if (this.firstLoadDone()) void this.reload();
    void id; // mark as read
  });

  protected readonly deps = signal<DepartmentView[]>([]);
  private readonly firstLoadDone = signal(false);
  protected readonly doctors = signal<DoctorOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly error   = signal<string | null>(null);
  protected readonly busy    = signal(false);
  protected readonly modal   = signal(false);
  protected readonly editId  = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly canManage = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin') || this.auth.has('staff.write')
  );

  protected readonly totalDoctors = computed(() =>
    this.deps().reduce((s, d) => s + d.doctorsCount, 0)
  );

  // Form fields
  protected f_code = '';  protected f_name = '';  protected f_desc = '';
  protected f_head = '';  protected f_color = '#0E4F8C'; protected f_floor = '';
  protected f_phone = ''; protected f_email = ''; protected f_active = true;

  async ngOnInit() {
    await this.reload();
    this.firstLoadDone.set(true);
    void this.svc.listDoctors().then(d => this.doctors.set(d)).catch(() => { /* non-fatal */ });
  }

  async reload() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.deps.set(await this.svc.list(this.branchStore.activeBranchId()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load departments');
    } finally {
      this.loading.set(false);
    }
  }

  protected initialsFromCode(code: string): string {
    return (code || '?').slice(0, 2).toUpperCase();
  }

  protected openNew() {
    this.editId.set(null);
    this.f_code = ''; this.f_name = ''; this.f_desc = '';
    this.f_head = ''; this.f_color = '#0E4F8C'; this.f_floor = '';
    this.f_phone = ''; this.f_email = ''; this.f_active = true;
    this.formError.set(null);
    this.modal.set(true);
  }

  protected openEdit(d: DepartmentView) {
    this.editId.set(d.id);
    this.f_code   = d.code;
    this.f_name   = d.name;
    this.f_desc   = d.description ?? '';
    this.f_head   = d.head_staff_id ?? '';
    this.f_color  = d.color;
    this.f_floor  = d.floor ?? '';
    this.f_phone  = d.phone ?? '';
    this.f_email  = d.email ?? '';
    this.f_active = d.is_active;
    this.formError.set(null);
    this.modal.set(true);
  }

  protected closeModal() { this.modal.set(false); }

  protected async confirm() {
    this.busy.set(true);
    this.formError.set(null);
    try {
      const editing = this.editId();
      if (editing) {
        await this.svc.update({
          id: editing, code: this.f_code, name: this.f_name,
          description: this.f_desc || null,
          headStaffId: this.f_head || null,
          color: this.f_color, icon: null,
          floor: this.f_floor || null,
          phone: this.f_phone || null,
          email: this.f_email || null,
          isActive: this.f_active,
        });
        this.toast.success('Department updated');
      } else {
        await this.svc.create({
          code: this.f_code, name: this.f_name,
          description: this.f_desc || null,
          headStaffId: this.f_head || null,
          color: this.f_color,
          floor: this.f_floor || null,
          phone: this.f_phone || null,
          email: this.f_email || null,
        });
        this.toast.success('Department created');
      }
      this.modal.set(false);
      await this.reload();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'Could not save department');
    } finally {
      this.busy.set(false);
    }
  }

  protected async quickToggle(d: DepartmentView) {
    this.busy.set(true);
    try {
      await this.svc.update({
        id: d.id, code: d.code, name: d.name,
        description: d.description, headStaffId: d.head_staff_id,
        color: d.color, icon: d.icon,
        floor: d.floor, phone: d.phone, email: d.email,
        isActive: !d.is_active,
      });
      this.toast.success(d.is_active ? 'Archived' : 'Activated', d.name);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
