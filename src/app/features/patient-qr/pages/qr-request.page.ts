import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/supabase/supabase.service';

@Component({
  selector: 'app-qr-request-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="min-h-screen bg-[#F4F7FB] flex flex-col">
      <!-- Header -->
      <header class="bg-white border-b border-[#E2E8F0] px-5 py-4">
        <div class="max-w-md mx-auto flex items-center gap-3">
          <div class="w-8 h-8 rounded-md bg-[#0E4F8C] grid place-items-center text-white font-display italic text-sm">n</div>
          <div>
            <p class="text-[15px] font-display font-medium text-[#0F1B2D]">Sree Diagnostics</p>
            <p class="text-[11px] text-[#65758C]">Patient Service Request</p>
          </div>
        </div>
      </header>

      <main class="flex-1 flex items-start justify-center px-5 py-8">
        <div class="w-full max-w-md">
          @if (submitted()) {
            <!-- Success state -->
            <div class="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center shadow-sm">
              <div class="w-14 h-14 rounded-full bg-[#E4EFE2] grid place-items-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#117A3A" stroke-width="2">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
              </div>
              <h2 class="text-[20px] font-display font-medium text-[#0F1B2D] mb-2">Request Submitted</h2>
              <p class="text-[14px] text-[#65758C] mb-4">
                Your ticket number is
                <span class="font-mono font-semibold text-[#0E4F8C]">{{ ticketRef() }}</span>
              </p>
              <div class="bg-[#F4F7FB] rounded-lg p-4 text-left mb-6">
                <p class="text-[12px] text-[#65758C] mb-1">Estimated response time</p>
                <p class="text-[18px] font-display font-medium text-[#0F1B2D]">~15 minutes</p>
              </div>
              <p class="text-[12px] text-[#65758C]">Our team has been notified. Thank you for your patience.</p>
              <button type="button" (click)="reset()" class="mt-6 h-10 px-5 rounded-md bg-[#0E4F8C] text-white text-[13px] font-medium">
                Submit another request
              </button>
            </div>
          } @else {
            <!-- Form -->
            <div class="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
              <div class="bg-[#0E4F8C] px-6 py-4">
                <h2 class="text-[18px] font-display font-medium text-white">How can we help?</h2>
                <p class="text-[12px] text-white/70 mt-0.5">Fill this form and our team will assist you shortly.</p>
              </div>

              <form [formGroup]="form" (ngSubmit)="submit()" class="p-6 space-y-4">
                <div>
                  <label class="block text-[12px] text-[#2A374A] font-medium mb-1.5">Room / Bed number *</label>
                  <input formControlName="location" placeholder="e.g., Room 204 / Bed 3A"
                         class="w-full h-11 px-3.5 text-[14px] bg-white border border-[#E2E8F0] rounded-lg text-[#0F1B2D] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#0E4F8C] focus:ring-[3px] focus:ring-[#0E4F8C]/10" />
                </div>

                <div>
                  <label class="block text-[12px] text-[#2A374A] font-medium mb-1.5">What do you need? *</label>
                  <select formControlName="category"
                          class="w-full h-11 px-3.5 text-[14px] bg-white border border-[#E2E8F0] rounded-lg text-[#0F1B2D] focus:outline-none focus:border-[#0E4F8C] focus:ring-[3px] focus:ring-[#0E4F8C]/10">
                    <option value="housekeeping">Housekeeping (cleaning, linen, towels)</option>
                    <option value="maintenance">Maintenance (AC, plumbing, electrical)</option>
                    <option value="fnb">Food & Beverages</option>
                    <option value="other">Other request</option>
                  </select>
                </div>

                <div>
                  <label class="block text-[12px] text-[#2A374A] font-medium mb-1.5">Your name (optional)</label>
                  <input formControlName="patientName" placeholder="Your name"
                         class="w-full h-11 px-3.5 text-[14px] bg-white border border-[#E2E8F0] rounded-lg text-[#0F1B2D] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#0E4F8C] focus:ring-[3px] focus:ring-[#0E4F8C]/10" />
                </div>

                <div>
                  <label class="block text-[12px] text-[#2A374A] font-medium mb-1.5">Details</label>
                  <textarea formControlName="description" rows="3" placeholder="Describe what you need…"
                            class="w-full px-3.5 py-2.5 text-[14px] bg-white border border-[#E2E8F0] rounded-lg text-[#0F1B2D] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#0E4F8C] focus:ring-[3px] focus:ring-[#0E4F8C]/10 resize-none"></textarea>
                </div>

                @if (errorMsg()) {
                  <p class="text-[12px] text-[#A4302B] bg-[#FEE2E2] px-3 py-2 rounded-md">{{ errorMsg() }}</p>
                }

                <button type="submit" [disabled]="form.invalid || submitting()"
                        class="w-full h-12 rounded-lg bg-[#0E4F8C] hover:bg-[#0A3D6E] text-white text-[14px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  {{ submitting() ? 'Submitting…' : 'Submit Request' }}
                </button>
              </form>
            </div>

            <p class="text-center text-[11px] text-[#A0AEC0] mt-4">
              Powered by Sree Diagnostics
            </p>
          }
        </div>
      </main>
    </div>
  `,
})
export class QrRequestPage {
  private supabase = inject(SupabaseService);
  private fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly ticketRef = signal('');

  protected readonly form = this.fb.nonNullable.group({
    location: ['', Validators.required],
    category: ['housekeeping'],
    patientName: [''],
    description: [''],
  });

  protected async submit() {
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.errorMsg.set(null);

    const val = this.form.getRawValue();
    try {
      const { data, error } = await (this.supabase.client as any)
        .from('concierge_tickets')
        .insert({
          subject: `${this.categoryLabel(val.category)} request`,
          description: val.description || null,
          category: val.category,
          priority: 'normal',
          channel: 'qr',
          location: val.location,
          patient_name: val.patientName || null,
        })
        .select('ticket_number')
        .single();

      if (error) throw error;
      this.ticketRef.set(data?.ticket_number ?? 'Submitted');
      this.submitted.set(true);
    } catch (e) {
      this.errorMsg.set('Could not submit your request. Please try again or call the reception.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected reset() {
    this.submitted.set(false);
    this.form.reset({ category: 'housekeeping' });
    this.ticketRef.set('');
  }

  private categoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      housekeeping: 'Housekeeping',
      maintenance: 'Maintenance',
      fnb: 'Food & Beverage',
      other: 'General',
    };
    return labels[cat] ?? 'Service';
  }
}
