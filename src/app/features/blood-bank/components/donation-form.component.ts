import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BloodBankService } from '../data/blood-bank.service';
import { COMPONENT_LABELS, type BloodComponent, type Donor } from '../data/blood-bank.types';

@Component({
  selector: 'app-donation-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-md rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <div>
        <h3 class="text-base font-semibold">Record Donation</h3>
        <p class="text-[11px] text-ink-soft">{{ donor.donor_no }} · {{ donor.first_name }} {{ donor.last_name }}</p>
      </div>
      <button class="text-ink-soft hover:text-ink" (click)="cancel()">✕</button>
    </div>
    <div class="p-4 grid grid-cols-2 gap-3 text-sm">
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Volume (ml)</span>
        <input type="number" min="100" max="600" [(ngModel)]="volumeMl"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Lot No.</span>
        <input [(ngModel)]="lotNumber"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Pre-Hb (g/dL)</span>
        <input type="number" step="0.1" [(ngModel)]="preHb"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">BP</span>
        <input [(ngModel)]="preBp" placeholder="120/80"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="col-span-2 block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Components to Prepare</span>
        <div class="mt-1 grid grid-cols-2 gap-1">
          @for (c of componentOptions; track c) {
            <label class="flex items-center gap-1.5 text-[12px]">
              <input type="checkbox"
                     [checked]="components().includes(c)"
                     (change)="toggleComponent(c, $event)" />
              {{ componentLabel(c) }}
            </label>
          }
        </div>
      </label>
      @if (errorMsg()) { <p class="col-span-2 text-[12px] text-danger-fg">{{ errorMsg() }}</p> }
    </div>
    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || components().length === 0"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Saving…' : 'Save Donation' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class DonationFormComponent {
  private bb = inject(BloodBankService);

  @Input({ required: true }) donor!: Donor;
  @Output() saved = new EventEmitter<{ donation_id: string; unit_ids: string[] }>();
  @Output() cancelled = new EventEmitter<void>();

  protected volumeMl = 350;
  protected lotNumber = '';
  protected preHb: number | null = null;
  protected preBp = '';
  protected components = signal<BloodComponent[]>(['whole_blood']);
  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);

  protected componentOptions: BloodComponent[] = ['whole_blood','prbc','ffp','platelets','single_donor_platelets','cryo'];
  protected componentLabel = (c: BloodComponent) => COMPONENT_LABELS[c];

  protected toggleComponent(c: BloodComponent, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const next = new Set(this.components());
    if (checked) next.add(c); else next.delete(c);
    this.components.set([...next]);
  }

  protected async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.errorMsg.set(null);
    try {
      const r = await this.bb.recordDonation({
        donorId: this.donor.id,
        volumeMl: this.volumeMl,
        lotNumber: this.lotNumber.trim() || null,
        preHb: this.preHb,
        preBp: this.preBp.trim() || null,
        components: this.components(),
      });
      this.saved.emit(r);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to save donation');
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel() { this.cancelled.emit(); }
}
