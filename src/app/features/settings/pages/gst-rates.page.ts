import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsPackService, type GstRate } from '../data/settings-pack.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

const BLANK: GstRate = {
  name: '', rate_percent: 0, cgst_percent: 0, sgst_percent: 0, igst_percent: 0,
  is_default: false, is_active: true, notes: '',
};

@Component({
  selector: 'app-gst-rates-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <header class="flex items-end justify-between pb-3 mb-4 border-b border-border">
      <div>
        <a routerLink="/settings" class="text-[12px] text-ink-muted hover:text-ink">← Settings</a>
        <h1 class="font-display text-[24px] font-medium tracking-[-0.02em] text-ink leading-[1.1] mt-1">GST rates</h1>
        <p class="text-[12px] text-ink-muted mt-0.5">Centralized GST master · used by invoice line items + HSN defaults.</p>
      </div>
      <button type="button" (click)="startNew()"
              class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
        + New rate
      </button>
    </header>

    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead class="bg-surface-muted">
          <tr>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Name</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Rate</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">CGST</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">SGST</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">IGST</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Default</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Active</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rates(); track r.id) {
            <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted">
              <td class="px-3 py-2 text-[13px] text-ink">{{ r.name }}</td>
              <td class="px-3 py-2 text-right font-mono text-[12px]">{{ r.rate_percent }}%</td>
              <td class="px-3 py-2 text-right font-mono text-[12px] text-ink-soft">{{ r.cgst_percent }}%</td>
              <td class="px-3 py-2 text-right font-mono text-[12px] text-ink-soft">{{ r.sgst_percent }}%</td>
              <td class="px-3 py-2 text-right font-mono text-[12px] text-ink-soft">{{ r.igst_percent }}%</td>
              <td class="px-3 py-2 text-[11px]">
                @if (r.is_default) { <span class="px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 font-medium">Default</span> }
              </td>
              <td class="px-3 py-2 text-[11px]">
                @if (r.is_active) { <span class="text-good-fg">● Active</span> }
                @else { <span class="text-ink-muted">○ Inactive</span> }
              </td>
              <td class="px-3 py-2 text-right">
                <button (click)="startEdit(r)" class="h-7 px-2 text-[11px] text-primary-700 hover:underline">Edit</button>
                <button (click)="remove(r)"   class="h-7 px-2 text-[11px] text-danger-fg hover:underline">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="px-3 py-8 text-center text-[12px] text-ink-muted">No GST rates yet.</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (editing(); as e) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
           (document:keydown.escape)="editing.set(null)">
        <div role="dialog"
             class="w-full max-w-[480px] bg-surface-card border border-border rounded-[12px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[17px] font-medium text-ink mb-3">{{ e.id ? 'Edit rate' : 'New rate' }}</h2>
          <div class="space-y-3">
            <label class="block">
              <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Name</span>
              <input [(ngModel)]="e.name" type="text" class="w-full h-9 px-2.5 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" placeholder="GST 18%" />
            </label>
            <div class="grid grid-cols-4 gap-2">
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Rate %</span>
                <input [(ngModel)]="e.rate_percent" (ngModelChange)="autoSplit(e)" type="number" step="0.01"
                       class="w-full h-9 px-2 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">CGST %</span>
                <input [(ngModel)]="e.cgst_percent" type="number" step="0.01"
                       class="w-full h-9 px-2 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">SGST %</span>
                <input [(ngModel)]="e.sgst_percent" type="number" step="0.01"
                       class="w-full h-9 px-2 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">IGST %</span>
                <input [(ngModel)]="e.igst_percent" type="number" step="0.01"
                       class="w-full h-9 px-2 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>
            </div>
            <div class="flex items-center gap-4">
              <label class="inline-flex items-center gap-2 text-[13px]">
                <input type="checkbox" [(ngModel)]="e.is_default" class="size-4" /> Default
              </label>
              <label class="inline-flex items-center gap-2 text-[13px]">
                <input type="checkbox" [(ngModel)]="e.is_active" class="size-4" /> Active
              </label>
            </div>
            <label class="block">
              <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Notes</span>
              <input [ngModel]="e.notes ?? ''" (ngModelChange)="e.notes = $event"
                     type="text" class="w-full h-9 px-2.5 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
            </label>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button (click)="editing.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button (click)="save(e)" [disabled]="busy() || !e.name.trim()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class GstRatesPage implements OnInit {
  private svc = inject(SettingsPackService);
  private toast = inject(ToastService);

  protected readonly rates = signal<GstRate[]>([]);
  protected readonly editing = signal<GstRate | null>(null);
  protected readonly busy = signal(false);

  async ngOnInit() { await this.reload(); }

  private async reload() {
    try { this.rates.set(await this.svc.listGstRates()); }
    catch (e: any) { this.toast.error('Load failed', e?.message ?? ''); }
  }

  protected startNew() { this.editing.set({ ...BLANK }); }
  protected startEdit(r: GstRate) { this.editing.set({ ...r }); }

  /** When user types the headline rate, split into CGST/SGST/IGST automatically. */
  protected autoSplit(e: GstRate) {
    const rate = Number(e.rate_percent) || 0;
    e.cgst_percent = +(rate / 2).toFixed(2);
    e.sgst_percent = +(rate / 2).toFixed(2);
    e.igst_percent = rate;
  }

  protected async save(e: GstRate) {
    this.busy.set(true);
    try {
      await this.svc.upsertGstRate(e);
      this.toast.success('Saved', e.name);
      this.editing.set(null);
      await this.reload();
    } catch (err: any) {
      this.toast.error('Save failed', err?.message ?? '');
    } finally { this.busy.set(false); }
  }

  protected async remove(r: GstRate) {
    if (!r.id || !confirm(`Delete ${r.name}?`)) return;
    try {
      await this.svc.deleteGstRate(r.id);
      this.toast.success('Deleted');
      await this.reload();
    } catch (err: any) {
      this.toast.error('Delete failed', err?.message ?? 'Rate may be referenced by services.');
    }
  }
}
