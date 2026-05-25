import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BloodBankService } from '../data/blood-bank.service';
import { BLOOD_GROUP_LABELS, type BloodGroup, type Donor } from '../data/blood-bank.types';

@Component({
  selector: 'app-donor-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="cancel()">
  <div class="w-full max-w-lg rounded-lg bg-surface-card border border-border shadow-2xl"
       (click)="$event.stopPropagation()">
    <div class="px-4 py-3 border-b border-border flex items-center justify-between">
      <h3 class="text-base font-semibold">Register Donor</h3>
      <button class="text-ink-soft hover:text-ink" (click)="cancel()">✕</button>
    </div>
    <div class="p-4 grid grid-cols-2 gap-3 text-sm">
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">First Name *</span>
        <input [(ngModel)]="firstName" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Last Name</span>
        <input [(ngModel)]="lastName" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Gender *</span>
        <select [(ngModel)]="gender" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Blood Group *</span>
        <select [(ngModel)]="bloodGroup" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          @for (g of groupOptions; track g) {
            <option [value]="g">{{ groupLabel(g) }}</option>
          }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">DOB</span>
        <input type="date" [(ngModel)]="dob" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Weight (kg)</span>
        <input type="number" min="40" max="200" step="0.1" [(ngModel)]="weight"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Mobile *</span>
        <input [(ngModel)]="mobile" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Email</span>
        <input [(ngModel)]="email" class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="col-span-2 block">
        <span class="text-[10px] font-semibold text-ink-soft uppercase">Address</span>
        <textarea [(ngModel)]="address" rows="2"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>

      @if (errorMsg()) { <p class="col-span-2 text-[12px] text-danger-fg">{{ errorMsg() }}</p> }
    </div>
    <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
      <button (click)="cancel()" class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-subtle">Cancel</button>
      <button (click)="submit()" [disabled]="busy() || !canSubmit()"
              class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
        {{ busy() ? 'Saving…' : 'Save Donor' }}
      </button>
    </div>
  </div>
</div>
  `,
})
export class DonorFormComponent {
  private bb = inject(BloodBankService);

  @Output() saved = new EventEmitter<Donor>();
  @Output() cancelled = new EventEmitter<void>();

  protected firstName = '';
  protected lastName = '';
  protected gender: 'male' | 'female' | 'other' = 'male';
  protected bloodGroup: BloodGroup = 'O_POS';
  protected dob = '';
  protected weight: number | null = null;
  protected mobile = '';
  protected email = '';
  protected address = '';

  protected busy = signal(false);
  protected errorMsg = signal<string | null>(null);

  protected groupOptions: BloodGroup[] = ['O_POS','O_NEG','A_POS','A_NEG','B_POS','B_NEG','AB_POS','AB_NEG'];
  protected groupLabel = (g: BloodGroup) => BLOOD_GROUP_LABELS[g];

  protected canSubmit = computed(() => !!this.firstName.trim() && !!this.mobile.trim());

  protected async submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true);
    this.errorMsg.set(null);
    try {
      const d = await this.bb.createDonor({
        first_name: this.firstName.trim(),
        last_name:  this.lastName.trim() || null,
        gender:     this.gender,
        blood_group: this.bloodGroup,
        dob:        this.dob || null,
        weight_kg:  this.weight ?? null,
        mobile:     this.mobile.trim(),
        email:      this.email.trim() || null,
        address:    this.address.trim() || null,
      });
      this.saved.emit(d);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Failed to save donor');
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel() { this.cancelled.emit(); }
}
