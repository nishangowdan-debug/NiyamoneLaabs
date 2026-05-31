import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../../core/supabase/supabase.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';

interface ServiceCategory {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sort_order: number;
  is_active: boolean;
}

const BLANK: ServiceCategory = { code: '', name: '', description: '', color: '#475569', sort_order: 100, is_active: true };

@Component({
  selector: 'app-categories-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="bg-surface-card border border-border rounded-[10px] p-5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display text-[20px] font-medium text-ink">Service categories</h2>
          <p class="text-[12px] text-ink-muted">Used in service catalog filters, dashboard breakdowns, and printed invoice grouping.</p>
        </div>
        <button (click)="startNew()"
                class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium">+ New category</button>
      </div>

      <table class="w-full border-collapse">
        <thead class="bg-surface-muted">
          <tr>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Code</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Name</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Color</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Sort</th>
            <th class="text-left px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Active</th>
            <th class="text-right px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (c of categories(); track c.id) {
            <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted">
              <td class="px-3 py-2 font-mono text-[12px] text-ink-soft">{{ c.code }}</td>
              <td class="px-3 py-2 text-[13px] text-ink font-medium">{{ c.name }}</td>
              <td class="px-3 py-2">
                <span class="inline-block size-5 rounded border border-border align-middle" [style.background]="c.color ?? '#475569'"></span>
                <span class="ml-2 text-[11px] font-mono text-ink-muted">{{ c.color }}</span>
              </td>
              <td class="px-3 py-2 text-right font-mono text-[12px]">{{ c.sort_order }}</td>
              <td class="px-3 py-2 text-[11px]">
                @if (c.is_active) { <span class="text-good-fg">● Active</span> }
                @else { <span class="text-ink-muted">○ Inactive</span> }
              </td>
              <td class="px-3 py-2 text-right">
                <button (click)="startEdit(c)" class="h-7 px-2 text-[11px] text-primary-700 hover:underline">Edit</button>
                <button (click)="remove(c)" class="h-7 px-2 text-[11px] text-danger-fg hover:underline">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="px-3 py-8 text-center text-[12px] text-ink-muted">No categories yet.</td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (editing(); as e) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="editing.set(null)">
        <div class="w-full max-w-[440px] bg-surface-card border border-border rounded-[12px] shadow-pop p-5"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[17px] font-medium text-ink mb-3">{{ e.id ? 'Edit category' : 'New category' }}</h2>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Code *</span>
                <input [(ngModel)]="e.code" [disabled]="!!e.id" type="text"
                       class="w-full h-9 px-2.5 text-[13px] font-mono border border-border rounded-md disabled:bg-surface-muted disabled:text-ink-muted focus:outline-none focus:border-primary-600" />
              </label>
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Sort order</span>
                <input [(ngModel)]="e.sort_order" type="number"
                       class="w-full h-9 px-2.5 text-[13px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
              </label>
            </div>
            <label class="block">
              <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Name *</span>
              <input [(ngModel)]="e.name" type="text"
                     class="w-full h-9 px-2.5 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
            </label>
            <label class="block">
              <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Description</span>
              <input [ngModel]="e.description ?? ''" (ngModelChange)="e.description = $event" type="text"
                     class="w-full h-9 px-2.5 text-[13px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
            </label>
            <div class="grid grid-cols-2 gap-3 items-end">
              <label class="block">
                <span class="block text-[10px] uppercase tracking-wider text-ink-muted mb-1">Color</span>
                <input [ngModel]="e.color ?? '#475569'" (ngModelChange)="e.color = $event" type="color"
                       class="w-full h-9 border border-border rounded-md cursor-pointer" />
              </label>
              <label class="inline-flex items-center gap-2 text-[13px] mb-2">
                <input type="checkbox" [(ngModel)]="e.is_active" class="size-4" /> Active
              </label>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button (click)="editing.set(null)" class="h-9 px-4 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button (click)="save(e)" [disabled]="busy() || !e.code.trim() || !e.name.trim()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
              {{ busy() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CategoriesTab implements OnInit {
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);

  protected readonly categories = signal<ServiceCategory[]>([]);
  protected readonly editing    = signal<ServiceCategory | null>(null);
  protected readonly busy       = signal(false);

  async ngOnInit() { await this.reload(); }

  protected async reload() {
    const { data, error } = await (this.supabase.client as any)
      .from('service_categories').select('*').order('sort_order');
    if (error) { this.toast.error('Load failed', error.message); return; }
    this.categories.set((data ?? []) as ServiceCategory[]);
  }

  protected startNew() { this.editing.set({ ...BLANK }); }
  protected startEdit(c: ServiceCategory) { this.editing.set({ ...c }); }

  protected async save(e: ServiceCategory) {
    this.busy.set(true);
    try {
      const { error } = await (this.supabase.client as any).from('service_categories').upsert(e);
      if (error) throw error;
      this.toast.success('Saved', e.name);
      this.editing.set(null);
      await this.reload();
    } catch (err: any) { this.toast.error('Save failed', err?.message ?? ''); }
    finally { this.busy.set(false); }
  }

  protected async remove(c: ServiceCategory) {
    if (!c.id || !confirm(`Delete category ${c.name}?`)) return;
    try {
      const { error } = await (this.supabase.client as any).from('service_categories').delete().eq('id', c.id);
      if (error) throw error;
      this.toast.success('Deleted');
      await this.reload();
    } catch (err: any) { this.toast.error('Delete failed', err?.message ?? ''); }
  }
}
