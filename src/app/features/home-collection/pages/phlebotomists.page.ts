import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { HomeCollectionService } from '../data/home-collection.service';
import type { Phlebotomist } from '../data/home-collection.types';

@Component({
  selector: 'app-phlebotomists-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, AlertComponent],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Phlebotomists</h1>
        <p class="text-[13px] text-ink-muted mt-1">Staff (lab_tech / nurse) on the home-collection roster for this branch.</p>
      </div>
      <button type="button" (click)="openNew()"
              class="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
        + Add phlebotomist
      </button>
    </header>

    @if (migrationMissing()) {
      <div class="mb-4"><app-alert tone="warn" title="Phlebotomists table not installed">
        Run <code class="font-mono">db/migrations/20260515_lab_settings.sql</code> in Supabase SQL Editor to create the <code class="font-mono">phlebotomists</code> table.
      </app-alert></div>
    } @else if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Could not load">{{ error() }}</app-alert></div>
    }

    <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Name</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Phone</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Vehicle</th>
            <th class="text-left px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Service areas (pincodes)</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Status</th>
            <th class="text-right px-4 py-2 text-[10px] uppercase text-ink-muted font-semibold border-b border-border">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (p of rows(); track p.id) {
            <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted" [class.opacity-60]="!p.is_active">
              <td class="px-4 py-2.5 text-[13px] text-ink">{{ p.staff?.full_name || '—' }}</td>
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft">{{ p.staff?.phone || '—' }}</td>
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft">{{ p.vehicle_no || '—' }}</td>
              <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft">{{ (p.service_areas || []).join(', ') || '—' }}</td>
              <td class="px-4 py-2.5 text-right">
                <span [class]="statusChipCls(p.is_active)">{{ p.is_active ? 'Active' : 'Inactive' }}</span>
              </td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <button type="button" (click)="openEdit(p)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">Edit</button>
                @if (p.is_active) {
                  <button type="button" (click)="deactivate(p)" class="h-7 px-2.5 rounded-md text-[11px] text-danger-fg hover:bg-danger-bg ml-1">Deactivate</button>
                } @else {
                  <button type="button" (click)="activate(p)" class="h-7 px-2.5 rounded-md text-[11px] text-good-fg hover:bg-good-bg ml-1">Activate</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="px-4 py-12 text-center text-[12px] text-ink-muted">No phlebotomists yet. Add staff with role <span class="font-mono">lab_tech</span> or <span class="font-mono">nurse</span> first.</td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (modal()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
           (document:keydown.escape)="modal.set(null)">
        <div class="relative w-full max-w-[480px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5">
          <button type="button" (click)="modal.set(null)" aria-label="Close"
                  class="absolute top-3 right-3 size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <h2 class="font-display text-[18px] font-medium text-ink">{{ editId() ? 'Edit phlebotomist' : 'Add phlebotomist' }}</h2>

          @if (!editId()) {
            <label class="block mt-4">
              <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Staff member *</span>
              <select [(ngModel)]="form.staff_id" name="ms"
                      class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="">— select —</option>
                @for (s of availableStaff(); track s.id) {
                  <option [value]="s.id">{{ s.full_name }} · {{ s.role_slug }}</option>
                }
              </select>
            </label>
          }

          <label class="block mt-3">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Vehicle no.</span>
            <input type="text" [(ngModel)]="form.vehicle_no" name="vn" placeholder="TN-01-AB-1234"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <label class="block mt-3">
            <span class="block text-[11px] uppercase text-ink-muted font-medium mb-1.5">Service areas (comma-separated pincodes)</span>
            <input type="text" [(ngModel)]="form.service_areas_csv" name="sa" placeholder="600001, 600002, 600003"
                   class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="modal.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="save()" [disabled]="!isValid() || busy()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PhlebotomistsPage implements OnInit {
  private svc = inject(HomeCollectionService);
  private branchStore = inject(BranchStore);
  private toast = inject(ToastService);

  protected readonly rows = signal<Phlebotomist[]>([]);
  protected readonly staff = signal<Array<{ id: string; full_name: string; role_slug: string; phone: string | null }>>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly migrationMissing = signal(false);
  protected readonly busy = signal(false);

  protected readonly modal = signal<'new' | 'edit' | null>(null);
  protected readonly editId = signal<string | null>(null);
  protected form = this.emptyForm();

  protected readonly availableStaff = computed(() => {
    const taken = new Set(this.rows().map((p) => p.staff_id));
    return this.staff().filter((s) => !taken.has(s.id));
  });

  constructor() {
    effect(() => {
      this.branchStore.activeBranchId();
      void this.reload();
    });
  }

  ngOnInit() { void this.reload(); }

  protected async reload() {
    const branchId = this.branchStore.activeBranchId();
    this.error.set(null);
    this.migrationMissing.set(false);
    try {
      const [rs, ss] = await Promise.all([
        this.svc.listPhlebotomists(branchId),
        this.svc.eligibleStaff(branchId),
      ]);
      this.rows.set(rs);
      this.staff.set(ss);
    } catch (e: any) {
      const code = String(e?.code ?? '').toUpperCase();
      const msg = String(e?.message ?? e ?? '').toLowerCase();
      const missing = code === 'PGRST205' || code === '42P01'
        || /relation .* does not exist|could not find the table|schema cache|404/i.test(msg);
      if (missing) {
        this.migrationMissing.set(true);
      } else {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    }
  }

  protected statusChipCls(active: boolean): string {
    const tone = active ? 'bg-good-bg text-good-fg' : 'bg-surface-subtle text-ink-muted';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${tone}`;
  }

  protected openNew() {
    this.editId.set(null);
    this.form = this.emptyForm();
    this.modal.set('new');
  }

  protected openEdit(p: Phlebotomist) {
    this.editId.set(p.id);
    this.form = {
      staff_id: p.staff_id,
      vehicle_no: p.vehicle_no ?? '',
      service_areas_csv: (p.service_areas ?? []).join(', '),
    };
    this.modal.set('edit');
  }

  protected isValid(): boolean {
    return !!this.form.staff_id || !!this.editId();
  }

  protected async save() {
    const branchId = this.branchStore.activeBranchId();
    if (!branchId || !this.isValid()) return;
    this.busy.set(true);
    try {
      const areas = this.form.service_areas_csv
        .split(',').map((s) => s.trim()).filter(Boolean);
      const id = this.editId();
      if (id) {
        await this.svc.updatePhlebotomist(id, {
          vehicle_no: this.form.vehicle_no || null,
          service_areas: areas,
        });
        this.toast.success('Phlebotomist updated');
      } else {
        await this.svc.addPhlebotomist({
          branch_id: branchId,
          staff_id: this.form.staff_id,
          vehicle_no: this.form.vehicle_no || null,
          service_areas: areas,
        });
        this.toast.success('Phlebotomist added');
      }
      this.modal.set(null);
      await this.reload();
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async deactivate(p: Phlebotomist) {
    if (!confirm(`Deactivate ${p.staff?.full_name ?? 'this phlebotomist'}?`)) return;
    try {
      await this.svc.updatePhlebotomist(p.id, { is_active: false });
      this.toast.warn('Deactivated');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    }
  }

  protected async activate(p: Phlebotomist) {
    try {
      await this.svc.updatePhlebotomist(p.id, { is_active: true });
      this.toast.success('Activated');
      await this.reload();
    } catch (e) {
      this.toast.error('Could not update', e instanceof Error ? e.message : 'Try again.');
    }
  }

  private emptyForm() {
    return { staff_id: '', vehicle_no: '', service_areas_csv: '' };
  }

}
