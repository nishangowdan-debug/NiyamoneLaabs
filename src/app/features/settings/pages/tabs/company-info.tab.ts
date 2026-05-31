import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsPackService } from '../../data/settings-pack.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';

interface CompanyInfo {
  trade_name: string;
  legal_name: string;
  gstin: string;
  pan: string;
  cin: string;
  website: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  state_code: string;
  phone: string;
  email: string;
  support_email: string;
  support_phone: string;
  tagline: string;
}

const BLANK: CompanyInfo = {
  trade_name: '', legal_name: '', gstin: '', pan: '', cin: '', website: '',
  address_line1: '', address_line2: '', city: '', state: '', pincode: '', state_code: '',
  phone: '', email: '', support_email: '', support_phone: '', tagline: '',
};

@Component({
  selector: 'app-company-info-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="bg-surface-card border border-border rounded-[10px] p-6">
      <h2 class="font-display text-[20px] font-medium text-ink mb-1">Company info (appears on tax invoices)</h2>
      <p class="text-[12px] text-ink-muted mb-5">This information is printed on every invoice, letterhead and outbound letter.</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">Trade name</span>
          <input type="text" [(ngModel)]="form.trade_name" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">Legal name</span>
          <input type="text" [(ngModel)]="form.legal_name" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">GSTIN</span>
          <input type="text" [(ngModel)]="form.gstin" class="w-full h-10 px-3 text-[14px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">PAN</span>
          <input type="text" [(ngModel)]="form.pan" class="w-full h-10 px-3 text-[14px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">CIN</span>
          <input type="text" [(ngModel)]="form.cin" class="w-full h-10 px-3 text-[14px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">Website</span>
          <input type="url" [(ngModel)]="form.website" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" placeholder="https://" />
        </label>
        <label class="block md:col-span-2">
          <span class="block text-[12px] text-ink-soft mb-1">Address line 1</span>
          <input type="text" [(ngModel)]="form.address_line1" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block md:col-span-2">
          <span class="block text-[12px] text-ink-soft mb-1">Address line 2</span>
          <input type="text" [(ngModel)]="form.address_line2" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">City</span>
          <input type="text" [(ngModel)]="form.city" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">State</span>
          <input type="text" [(ngModel)]="form.state" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">Pincode</span>
          <input type="text" [(ngModel)]="form.pincode" class="w-full h-10 px-3 text-[14px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">State code</span>
          <input type="text" [(ngModel)]="form.state_code" class="w-full h-10 px-3 text-[14px] font-mono border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">Phone</span>
          <input type="tel" [(ngModel)]="form.phone" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block">
          <span class="block text-[12px] text-ink-soft mb-1">Email</span>
          <input type="email" [(ngModel)]="form.email" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" />
        </label>
        <label class="block md:col-span-2">
          <span class="block text-[12px] text-ink-soft mb-1">Tagline (used in letterhead band)</span>
          <input type="text" [(ngModel)]="form.tagline" class="w-full h-10 px-3 text-[14px] border border-border rounded-md focus:outline-none focus:border-primary-600" placeholder="Precision diagnostics, delivered fast" />
        </label>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button (click)="reload()" [disabled]="busy()"
                class="h-10 px-4 rounded-md border border-border text-[13px] text-ink-soft hover:bg-surface-subtle">Reset</button>
        <button (click)="save()" [disabled]="busy()"
                class="h-10 px-5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium disabled:opacity-50">
          {{ busy() ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </section>
  `,
})
export class CompanyInfoTab implements OnInit {
  private svc = inject(SettingsPackService);
  private toast = inject(ToastService);
  protected form: CompanyInfo = { ...BLANK };
  protected readonly busy = signal(false);

  async ngOnInit() { await this.reload(); }

  protected async reload() {
    const v = await this.svc.getSetting<Partial<CompanyInfo>>('company_info').catch(() => null);
    this.form = { ...BLANK, ...(v ?? {}) };
  }

  protected async save() {
    this.busy.set(true);
    try {
      await this.svc.setSetting('company_info', this.form);
      this.toast.success('Saved', 'Company info updated.');
    } catch (e: any) {
      this.toast.error('Save failed', e?.message ?? '');
    } finally { this.busy.set(false); }
  }
}
