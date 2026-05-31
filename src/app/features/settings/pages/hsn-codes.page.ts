import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsPackService, type HsnCode, type GstRate } from '../data/settings-pack.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

const BLANK: HsnCode = { code: '', description: '', category: '', default_gst_rate_id: null, is_active: true };

@Component({
  selector: 'app-hsn-codes-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
      <div>
        <a routerLink="/settings" class="text-[12px] text-ink-muted hover:text-ink">← Settings</a>
        <h1 class="font-display text-[24px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">HSN / SAC codes</h1>
        <p class="text-[12px] text-ink-muted mt-0.5">Searchable HSN/SAC reference for invoice line items.</p>
      </div>
      <button type="button" (click)="startNew()"
              class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
        + New code
      </button>
    </header>

    <div class="bg-surface-card border border-border rounded-[10px] px-3 py-2 mb-3 flex items-center gap-2">
      <input type="search" [(ngModel)]="search" (ngModelChange)="reload()" placeholder="Search by code or description…"
             class="flex-1 h-8 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600" />
      <span class="text-[11px] text-ink-muted">{{ codes().length }} result(s)</span>
    </div>

    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead class="bg-surface-muted">
          <tr>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Code</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Description</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Category</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Default GST</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Active</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (c of codes(); track c.id) {
            <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted">
              <td class="px-3 py-2 font-mono text-[12px] text-ink-soft">{{ c.code }}</td>
              <td class="px-3 py-2 text-[13px] text-ink">{{ c.description }}</td>
              <td class="px-3 py-2 text-[11px]">
                @if (c.category) { <span class="px-1.5 py-0.5 rounded bg-surface-subtle text-ink-soft">{{ c.category }}</span> }
              </td>
              <td class="px-3 py-2 text-[11px]">
                @if (c.gst_rate; as g) { <span class="text-primary-700 font-mono">{{ g.rate_percent }}%</span> }
                @else                  { <span class="text-ink-muted">—</span> }
              </td>
              <td class="px-3 py-2 text-[11px]">
                @if (c.is_active) { <span class="text-good-fg">● Active</span> }
                @else { <span class="text-ink-muted">○ Inactive</span> }
              </td>
              <td class="px-3 py-2 text-right">
                <button (click)="startEdit(c)" class="h-7 px-2 text-[11px] text-primary-700 hover:underline">Edit</button>
                <button (click)="remove(c)"   class="h-7 px-2 text-[11px] text-danger-fg hover:underline">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="px-3 py-8 text-center text-[12px] text-ink-muted">No codes match.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (editing(); as e) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
           (document:keydown.escape)="editing.set(null)">
        <div class="w-full max-w-[520px] bg-surface-card border border-border rounded-[12px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[17px] font-medium text-ink mb-3">{{ e.id ? 'Edit code' : 'New code' }}</h2>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">HSN / SAC code *</span>
                <input [(ngModel)]="e.code" type="text" class="w-full h-9 px-2.5 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" placeholder="999316" />
              </label>
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Category</span>
                <input [ngModel]="e.category ?? ''" (ngModelChange)="e.category = $event"
                       type="text" class="w-full h-9 px-2.5 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" placeholder="lab / imaging / pharmacy" />
              </label>
            </div>
            <label class="block">
              <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Description *</span>
              <textarea [(ngModel)]="e.description" rows="2"
                        class="w-full px-2.5 py-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600"></textarea>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Default GST rate</span>
                <select [ngModel]="e.default_gst_rate_id ?? ''" (ngModelChange)="e.default_gst_rate_id = $event || null"
                        class="w-full h-9 px-2 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600">
                  <option value="">— none —</option>
                  @for (r of rates(); track r.id) {
                    <option [value]="r.id">{{ r.name }} ({{ r.rate_percent }}%)</option>
                  }
                </select>
              </label>
              <label class="inline-flex items-center gap-2 text-[13px] mt-5">
                <input type="checkbox" [(ngModel)]="e.is_active" class="size-4" /> Active
              </label>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button (click)="editing.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button (click)="save(e)" [disabled]="busy() || !e.code.trim() || !e.description.trim()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class HsnCodesPage implements OnInit {
  private svc = inject(SettingsPackService);
  private toast = inject(ToastService);

  protected readonly codes = signal<HsnCode[]>([]);
  protected readonly rates = signal<GstRate[]>([]);
  protected readonly editing = signal<HsnCode | null>(null);
  protected readonly busy = signal(false);
  protected search = '';

  async ngOnInit() {
    this.rates.set(await this.svc.listGstRates().catch(() => []));
    await this.reload();
  }

  protected async reload() {
    try { this.codes.set(await this.svc.listHsnCodes(this.search)); }
    catch (e: any) { this.toast.error('Load failed', e?.message ?? ''); }
  }

  protected startNew()  { this.editing.set({ ...BLANK }); }
  protected startEdit(c: HsnCode) { this.editing.set({ ...c }); }

  protected async save(e: HsnCode) {
    this.busy.set(true);
    try {
      await this.svc.upsertHsnCode(e);
      this.toast.success('Saved', e.code);
      this.editing.set(null);
      await this.reload();
    } catch (err: any) {
      this.toast.error('Save failed', err?.message ?? '');
    } finally { this.busy.set(false); }
  }

  protected async remove(c: HsnCode) {
    if (!c.id || !confirm(`Delete code ${c.code}?`)) return;
    try {
      await this.svc.deleteHsnCode(c.id);
      this.toast.success('Deleted');
      await this.reload();
    } catch (err: any) {
      this.toast.error('Delete failed', err?.message ?? '');
    }
  }
}
