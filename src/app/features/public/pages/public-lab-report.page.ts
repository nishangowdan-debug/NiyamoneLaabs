import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';

/** Token-secured lab-report view. Same RLS pattern as the invoice page. */
@Component({
  selector: 'app-public-lab-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="min-h-screen bg-slate-50 py-6 px-4">
      <div class="max-w-3xl mx-auto">
        @if (loading()) {
          <p class="text-center text-slate-500 py-12">Loading…</p>
        } @else if (error()) {
          <div class="bg-white border border-amber-300 rounded-lg p-6 text-center">
            <h1 class="text-xl font-medium text-amber-700 mb-2">Link unavailable</h1>
            <p class="text-sm text-slate-600">{{ error() }}</p>
            <p class="text-xs text-slate-400 mt-3">For a fresh link, contact Sree Diagnostics.</p>
          </div>
        } @else if (order(); as o) {
          <header class="bg-white border border-slate-200 rounded-t-lg p-5 flex items-start justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-slate-900">Sree Diagnostics</h1>
              <p class="text-xs text-slate-500">Lab Report</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] uppercase tracking-wider text-slate-500">Order</p>
              <p class="font-mono text-sm text-slate-900">{{ o.sample_id || (o.id | slice:0:8) }}</p>
              <p class="text-xs text-slate-500 mt-1">Ordered {{ o.ordered_at | date:'d MMM yyyy' }}</p>
            </div>
          </header>

          <section class="bg-white border-x border-slate-200 px-5 py-3 text-sm">
            <p class="text-slate-800 font-medium">{{ o.patient?.full_name || '—' }}</p>
            <p class="text-xs text-slate-500 font-mono">
              UHID {{ o.patient?.uhid }}
              @if (o.patient?.mobile) { · {{ o.patient.mobile }} }
            </p>
          </section>

          <table class="w-full bg-white border-x border-slate-200 text-sm">
            <thead class="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
              <tr>
                <th class="px-4 py-2 text-left">Test</th>
                <th class="px-3 py-2 text-right">Value</th>
                <th class="px-3 py-2 text-left">Unit</th>
                <th class="px-3 py-2 text-left">Reference</th>
                <th class="px-3 py-2 text-left">Flag</th>
              </tr>
            </thead>
            <tbody>
              @for (r of results(); track r.id) {
                <tr class="border-t border-slate-100">
                  <td class="px-4 py-2">
                    <div class="text-slate-800">{{ r.test?.name || r.test?.code }}</div>
                    <div class="text-[10px] font-mono text-slate-400">{{ r.test?.code }}</div>
                  </td>
                  <td class="px-3 py-2 text-right font-mono font-medium text-slate-900">
                    {{ r.value_numeric ?? r.value_text ?? '—' }}
                  </td>
                  <td class="px-3 py-2 text-slate-500 font-mono">{{ r.test?.unit ?? '' }}</td>
                  <td class="px-3 py-2 text-slate-500 font-mono">
                    @if (r.test?.ref_min !== null && r.test?.ref_max !== null) {
                      {{ r.test.ref_min }}–{{ r.test.ref_max }}
                    } @else { — }
                  </td>
                  <td class="px-3 py-2">
                    @if (r.flag === 'critical_low' || r.flag === 'critical_high') {
                      <span class="inline-block px-1.5 py-px text-[10px] rounded bg-red-100 text-red-700">{{ r.flag === 'critical_low' ? 'L Critical' : 'H Critical' }}</span>
                    } @else if (r.flag === 'low' || r.flag === 'high') {
                      <span class="inline-block px-1.5 py-px text-[10px] rounded bg-amber-100 text-amber-700">{{ r.flag === 'low' ? 'Low' : 'High' }}</span>
                    } @else if (r.flag) {
                      <span class="text-[10px] text-slate-400">{{ r.flag }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <footer class="bg-white border border-slate-200 rounded-b-lg px-5 py-3 text-xs text-slate-500 flex items-center justify-between">
            <span>State: {{ o.state }}</span>
            <button (click)="savePdf()" class="px-3 py-1.5 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-700">
              💾 Save as PDF
            </button>
          </footer>

          <p class="text-center text-[10px] text-slate-400 mt-6">
            Sree Diagnostics · This link expires {{ o.public_token_expires_at | date:'d MMM yyyy' }} ·
            Results are for the named patient only. Discuss with your doctor.
          </p>
        }
      </div>
    </div>
  `,
})
export class PublicLabReportPage implements OnInit {
  private route    = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);

  protected readonly loading = signal(true);
  protected readonly error   = signal<string | null>(null);
  protected readonly order   = signal<any | null>(null);
  protected readonly results = computed(() => (this.order()?.results ?? []) as any[]);

  async ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Missing access token.');
      this.loading.set(false);
      return;
    }
    try {
      const { data, error } = await (this.supabase.client as any)
        .from('lab_orders')
        .select(`*,
                 patient:patient_id(uhid, full_name, mobile),
                 results:lab_results(*, test:lab_test_id(code, name, unit, ref_min, ref_max))`)
        .eq('public_token', token)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        this.error.set('This link has expired or is invalid. Please request a fresh link from Sree Diagnostics.');
      } else {
        this.order.set(data);
        this.markOpened(token).catch(() => {});

        // Sensible filename for Save-as-PDF.
        try {
          const patient = (data.patient?.full_name || 'Patient').trim();
          const d = new Date((data as any).reported_at || (data as any).collected_at || (data as any).ordered_at || Date.now());
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const dateStr = `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
          const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
          const uhid = (data.patient?.uhid || data.sample_id || data.id?.slice(0, 8) || '').toString();
          document.title = `${safe(patient)}_${dateStr}_${safe(uhid)}`;
        } catch { /* non-fatal */ }

        // ?download=1 → auto-trigger Save-as-PDF dialog. WhatsApp links carry
        // this flag so patients see the save prompt the moment they tap.
        if (this.route.snapshot.queryParamMap.get('download') === '1') {
          setTimeout(() => { try { window.print(); } catch { /* user-blocked */ } }, 600);
        }
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Could not load report.');
    } finally {
      this.loading.set(false);
    }
  }

  private async markOpened(token: string) {
    const url = `${window.location.origin}/public/lab-report/${token}`;
    await (this.supabase.client as any)
      .from('whatsapp_messages')
      .update({ link_opened_at: new Date().toISOString() })
      .eq('public_url', url)
      .is('link_opened_at', null);
  }

  protected savePdf() {
    window.print();
  }
}
