import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AssetsService } from '../data/assets.service';
import type { AssetMovement, MovementType, MovementStatus, CreateMovementInput } from '../data/assets.types';

const TYPE_LABELS: Record<MovementType, string> = {
  inter_branch: 'Inter-branch',
  internal: 'Within hospital',
  loan: 'Loan',
  disposal: 'Disposal',
};

const STATUS_STYLE: Record<MovementStatus, { bg: string; fg: string; label: string }> = {
  pending_dispatch: { bg: 'bg-warn-bg', fg: 'text-warn-fg', label: 'Pending dispatch' },
  in_transit:       { bg: 'bg-info-bg', fg: 'text-info-fg', label: 'In transit' },
  completed:        { bg: 'bg-good-bg', fg: 'text-good-fg', label: 'Completed' },
  cancelled:        { bg: 'bg-surface-muted', fg: 'text-ink-muted', label: 'Cancelled' },
};

@Component({
  selector: 'app-assets-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AlertComponent],
  template: `
    <!-- ── Page head ──────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
          Assets & Movement
        </h1>
        <p class="text-[13px] text-ink-muted mt-1">Track asset transfers, loans, and disposals across locations.</p>
      </div>
      <button type="button" (click)="showNew.set(true)"
              class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card">
        + New movement
      </button>
    </header>

    <!-- ── Stats ──────────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Total</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-ink">{{ movements().length }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">In transit</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-info-fg">{{ countByStatus('in_transit') }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Pending dispatch</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-warn-fg">{{ countByStatus('pending_dispatch') }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Completed</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-good-fg">{{ countByStatus('completed') }}</p>
      </div>
      <div class="bg-surface-card border border-border rounded-[10px] p-3">
        <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">Urgent</p>
        <p class="font-display text-[24px] font-medium tracking-[-0.02em] mt-1 text-danger-fg">{{ urgentCount() }}</p>
      </div>
    </div>

    <!-- ── Type tabs ──────────────────────────────────────── -->
    <div class="flex items-center gap-1 mb-5 bg-surface-muted rounded-lg p-1 w-fit">
      <button type="button" (click)="typeFilter.set('all')"
              [class]="typeFilter() === 'all' ? 'h-8 px-3 rounded-md text-[12px] font-medium bg-surface-card text-ink shadow-card' : 'h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink'">
        All
      </button>
      @for (t of typeOptions; track t.value) {
        <button type="button" (click)="typeFilter.set(t.value)"
                [class]="typeFilter() === t.value ? 'h-8 px-3 rounded-md text-[12px] font-medium bg-surface-card text-ink shadow-card' : 'h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink'">
          {{ t.label }}
        </button>
      }
    </div>

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Error">{{ error() }}</app-alert></div>
    }

    <!-- ── Two-panel layout ───────────────────────────────── -->
    <div class="grid grid-cols-12 gap-4">
      <!-- Movement list -->
      <div class="col-span-12 lg:col-span-5 space-y-2 max-h-[65vh] overflow-y-auto">
        @for (m of filteredMovements(); track m.id) {
          <button type="button" (click)="selected.set(m)"
                  [class]="movementCardCls(m.id)"
                  class="w-full text-left p-3.5 rounded-lg border transition-colors">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] font-mono text-ink-muted">{{ m.movement_number }}</span>
              <span [class]="statusChipCls(m.status)">{{ statusLabel(m.status) }}</span>
            </div>
            <p class="text-[13px] font-medium text-ink">{{ m.asset_name }}</p>
            <p class="text-[10px] font-mono text-ink-muted mt-0.5">{{ m.asset_tag }}</p>
            <div class="flex items-center gap-1.5 mt-2 text-[11px] text-ink-soft">
              <span>{{ m.from_location }}</span>
              <span class="text-ink-muted">\u2192</span>
              @if (m.via_location) { <span class="text-ink-muted">{{ m.via_location }} \u2192</span> }
              <span>{{ m.to_location }}</span>
            </div>
            @if (m.priority === 'urgent') {
              <span class="mt-1.5 inline-flex items-center h-[16px] px-1.5 rounded bg-danger-bg text-danger-fg text-[9px] font-medium">URGENT</span>
            }
          </button>
        } @empty {
          <div class="p-8 text-center text-[13px] text-ink-muted">No movements found.</div>
        }
      </div>

      <!-- Detail panel -->
      <div class="col-span-12 lg:col-span-7">
        @if (selected(); as s) {
          <div class="bg-surface-card border border-border rounded-[10px] p-5">
            <div class="flex items-center justify-between mb-4">
              <div>
                <p class="text-[10px] font-mono text-ink-muted">{{ s.movement_number }}</p>
                <h2 class="text-[17px] font-display font-medium text-ink mt-0.5">{{ s.asset_name }}</h2>
              </div>
              <span [class]="statusChipCls(s.status)">{{ statusLabel(s.status) }}</span>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Asset tag</p>
                <p class="text-[13px] font-mono text-ink mt-0.5">{{ s.asset_tag }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Serial</p>
                <p class="text-[13px] font-mono text-ink mt-0.5">{{ s.serial_number || '\u2014' }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Type</p>
                <p class="text-[13px] text-ink capitalize mt-0.5">{{ typeLabel(s.movement_type) }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Priority</p>
                <p class="text-[13px] text-ink capitalize mt-0.5">{{ s.priority }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Handler</p>
                <p class="text-[13px] text-ink mt-0.5">{{ s.handler_name || '\u2014' }}</p>
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Created</p>
                <p class="text-[13px] text-ink mt-0.5">{{ formatDate(s.created_at) }}</p>
              </div>
            </div>

            <!-- Route visualization -->
            <div class="border border-border rounded-lg p-4 mb-4">
              <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-3">Route</p>
              <div class="flex items-center gap-3">
                <div class="text-center">
                  <div class="size-8 rounded-full bg-info-bg grid place-items-center text-info-fg text-[11px] font-bold mx-auto">F</div>
                  <p class="text-[10px] text-ink-muted mt-1 max-w-[80px] truncate">{{ s.from_location }}</p>
                </div>
                <div class="flex-1 h-px bg-border relative">
                  <span class="absolute inset-0 flex items-center justify-center text-[10px] text-ink-muted">\u2192</span>
                </div>
                @if (s.via_location) {
                  <div class="text-center">
                    <div class="size-8 rounded-full bg-warn-bg grid place-items-center text-warn-fg text-[11px] font-bold mx-auto">V</div>
                    <p class="text-[10px] text-ink-muted mt-1 max-w-[80px] truncate">{{ s.via_location }}</p>
                  </div>
                  <div class="flex-1 h-px bg-border relative">
                    <span class="absolute inset-0 flex items-center justify-center text-[10px] text-ink-muted">\u2192</span>
                  </div>
                }
                <div class="text-center">
                  <div class="size-8 rounded-full bg-good-bg grid place-items-center text-good-fg text-[11px] font-bold mx-auto">T</div>
                  <p class="text-[10px] text-ink-muted mt-1 max-w-[80px] truncate">{{ s.to_location }}</p>
                </div>
              </div>
            </div>

            @if (s.reason) {
              <div class="mb-4">
                <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Reason</p>
                <p class="text-[13px] text-ink-soft mt-0.5">{{ s.reason }}</p>
              </div>
            }

            <!-- Actions -->
            @if (s.status !== 'completed' && s.status !== 'cancelled') {
              <div class="flex gap-2 pt-3 border-t border-border">
                @if (s.status === 'pending_dispatch') {
                  <button (click)="moveStatus(s, 'in_transit')" [disabled]="busy()"
                          class="h-8 px-3 rounded-md text-[12px] font-medium bg-info-fg text-white hover:bg-info-fg/90 disabled:opacity-50">Mark dispatched</button>
                }
                @if (s.status === 'in_transit') {
                  <button (click)="moveStatus(s, 'completed')" [disabled]="busy()"
                          class="h-8 px-3 rounded-md text-[12px] font-medium bg-good-fg text-white hover:bg-good-fg/90 disabled:opacity-50">Mark received</button>
                }
                <button (click)="moveStatus(s, 'cancelled')" [disabled]="busy()"
                        class="h-8 px-3 rounded-md text-[12px] font-medium text-danger-fg hover:bg-danger-bg disabled:opacity-50">Cancel</button>
              </div>
            }
          </div>
        } @else {
          <div class="bg-surface-card border border-border rounded-[10px] p-12 text-center">
            <p class="text-[13px] text-ink-muted">Select a movement to view details</p>
          </div>
        }
      </div>
    </div>

    <!-- ── New Movement Modal ─────────────────────────────── -->
    @if (showNew()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center" (document:keydown.escape)="showNew.set(false)">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-surface-card rounded-xl shadow-pop border border-border w-full max-w-md overflow-hidden"
             (click)="$event.stopPropagation()">
          <header class="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 class="text-[15px] font-semibold text-ink">New Movement</h3>
            <button type="button" (click)="showNew.set(false)" class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle text-lg">\u00d7</button>
          </header>
          <form [formGroup]="newForm" (ngSubmit)="createMovement()" class="p-5 space-y-4">
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Movement type</label>
              <select formControlName="movement_type" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                <option value="inter_branch">Inter-branch</option>
                <option value="internal">Within hospital</option>
                <option value="loan">Loan</option>
                <option value="disposal">Disposal</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Asset name</label>
                <input formControlName="asset_name" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Asset tag</label>
                <input formControlName="asset_tag" placeholder="SRH-MED-0142" class="w-full h-10 px-3 text-sm font-mono bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">From</label>
                <input formControlName="from_location" placeholder="Ward / Branch" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">To</label>
                <input formControlName="to_location" placeholder="Ward / Branch" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
            </div>
            <div>
              <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Reason</label>
              <textarea formControlName="reason" rows="2" class="w-full px-3 py-2 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100 resize-y"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Priority</label>
                <select formControlName="priority" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100">
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Handler</label>
                <input formControlName="handler_name" class="w-full h-10 px-3 text-sm bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showNew.set(false)" class="h-9 px-4 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
              <button type="submit" [disabled]="newForm.invalid || creating()"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium shadow-card disabled:opacity-60">
                {{ creating() ? 'Creating\u2026' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class AssetsPage implements OnInit, OnDestroy {
  private svc = inject(AssetsService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly movements = signal<AssetMovement[]>([]);
  protected readonly selected = signal<AssetMovement | null>(null);
  protected readonly typeFilter = signal<MovementType | 'all'>('all');
  protected readonly showNew = signal(false);
  protected readonly creating = signal(false);
  protected readonly busy = signal(false);

  protected readonly typeOptions: { value: MovementType; label: string }[] = [
    { value: 'inter_branch', label: 'Inter-branch' },
    { value: 'internal', label: 'Internal' },
    { value: 'loan', label: 'Loans' },
    { value: 'disposal', label: 'Disposals' },
  ];

  protected readonly newForm = this.fb.nonNullable.group({
    movement_type: ['inter_branch' as MovementType],
    asset_name: ['', Validators.required],
    asset_tag: ['', Validators.required],
    from_location: ['', Validators.required],
    to_location: ['', Validators.required],
    reason: [''],
    priority: ['normal' as 'normal' | 'urgent'],
    handler_name: [''],
  });

  protected readonly filteredMovements = computed(() => {
    const f = this.typeFilter();
    if (f === 'all') return this.movements();
    return this.movements().filter(m => m.movement_type === f);
  });

  protected readonly urgentCount = computed(() =>
    this.movements().filter(m => m.priority === 'urgent' && m.status !== 'completed' && m.status !== 'cancelled').length
  );

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    void this.load();
    this.unsubscribe = this.svc.subscribe(() => void this.load());
  }

  ngOnDestroy() { this.unsubscribe?.(); }

  private async load() {
    this.loading.set(true);
    try {
      this.movements.set(await this.svc.list());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  protected countByStatus(status: MovementStatus): number {
    return this.movements().filter(m => m.status === status).length;
  }

  protected typeLabel(t: MovementType): string { return TYPE_LABELS[t] ?? t; }
  protected statusLabel(s: MovementStatus): string { return STATUS_STYLE[s]?.label ?? s; }
  protected statusChipCls(s: MovementStatus): string {
    const st = STATUS_STYLE[s] ?? STATUS_STYLE.pending_dispatch;
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${st.bg} ${st.fg}`;
  }

  protected movementCardCls(id: string): string {
    return this.selected()?.id === id
      ? 'border-primary-500 bg-primary-50'
      : 'border-border bg-surface-card hover:bg-surface-subtle';
  }

  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); } catch { return '\u2014'; }
  }

  protected async moveStatus(m: AssetMovement, status: MovementStatus) {
    this.busy.set(true);
    try {
      await this.svc.updateStatus(m.id, status);
      this.toast.success('Updated', `${m.asset_name} \u2192 ${STATUS_STYLE[status].label}`);
      this.selected.set(null);
      await this.load();
    } catch (e) {
      this.toast.error('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.busy.set(false);
    }
  }

  protected async createMovement() {
    if (this.newForm.invalid) return;
    this.creating.set(true);
    try {
      const val = this.newForm.getRawValue();
      await this.svc.create({
        movement_type: val.movement_type,
        asset_name: val.asset_name,
        asset_tag: val.asset_tag,
        from_location: val.from_location,
        to_location: val.to_location,
        reason: val.reason || null,
        priority: val.priority,
        handler_name: val.handler_name || null,
      });
      this.toast.success('Movement created');
      this.showNew.set(false);
      this.newForm.reset({ movement_type: 'inter_branch', priority: 'normal' });
      await this.load();
    } catch (e) {
      this.toast.error('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      this.creating.set(false);
    }
  }
}
