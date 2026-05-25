import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';

interface VerifyMeta {
  state?: string;
  sample_id?: string | null;
  ordered_at?: string;
  reported_at?: string;
  branch?: { code: string; name: string; city: string };
  patient_initials?: string;
  doctor_name?: string | null;
  pathologist?: string | null;
  test_count?: number;
  critical_count?: number;
  verified?: boolean;
  error?: string;
}

/**
 * Public, anonymous verification page for printed lab reports.
 * URL: /lab/verify/:token  (UUID from `lab_orders.verification_token`)
 * Shows: hospital, patient initials only, test count, signed-by/at, status.
 * No PII (no full name, no UHID, no mobile).
 */
@Component({
  selector: 'app-lab-verify-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full bg-gradient-to-br from-[#0C2A52] via-[#0E4F8C] to-[#0C2A52] text-white flex items-start justify-center px-6 py-10">
      <div class="w-full max-w-[480px]">
        <header class="mb-6 flex items-center gap-3">
          <div class="w-[42px] h-[42px] rounded-md grid place-items-center bg-white/15 italic font-bold text-[22px] backdrop-blur">n</div>
          <div>
            <p class="font-display text-[20px] font-medium leading-tight">niyamone <span class="italic text-white/70">hms</span></p>
            <p class="text-[11px] text-white/60 mt-0.5">Lab report verification</p>
          </div>
        </header>

        @if (loading()) {
          <p class="text-white/70 text-[14px]">Verifying…</p>
        } @else if (data()?.error || !data()?.branch) {
          <article class="rounded-[12px] bg-rose-500/15 border border-rose-300/30 p-6 backdrop-blur">
            <p class="text-[16px] font-semibold text-rose-200">Could not verify this report</p>
            <p class="text-[13px] text-white/70 mt-2">
              The token in the QR code did not match any report on file. Please contact the hospital to confirm authenticity.
            </p>
            <p class="text-[10px] font-mono text-white/40 mt-3">Token: {{ token() }}</p>
          </article>
        } @else {
          <article class="rounded-[14px] bg-white text-ink shadow-2xl p-6">
            <header class="border-b border-border pb-4 mb-4">
              <p class="text-[10px] uppercase tracking-[0.10em] text-ink-muted font-semibold">{{ data()!.branch!.code }}</p>
              <p class="font-display text-[20px] font-medium text-ink leading-tight mt-0.5">{{ data()!.branch!.name }}</p>
              <p class="text-[11px] text-ink-muted">{{ data()!.branch!.city }}</p>
            </header>

            @if (data()!.verified) {
              <div class="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 mb-4 flex items-center gap-2">
                <span class="size-5 rounded-full bg-emerald-500 grid place-items-center text-white text-[12px] font-bold">✓</span>
                <p class="text-[13px] font-semibold text-emerald-800">Verified — signed off by pathologist</p>
              </div>
            } @else {
              <div class="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
                <p class="text-[13px] font-semibold text-amber-800">⏳ Pending verification</p>
                <p class="text-[11px] text-amber-700 mt-0.5">Currently in state: <span class="font-mono">{{ data()!.state }}</span></p>
              </div>
            }

            <dl class="grid grid-cols-2 gap-y-3 gap-x-4 text-[12.5px]">
              <dt class="text-ink-muted">Patient</dt>
              <dd class="font-mono text-ink">{{ data()!.patient_initials }}</dd>

              <dt class="text-ink-muted">Sample ID</dt>
              <dd class="font-mono text-ink truncate">{{ data()!.sample_id || '—' }}</dd>

              <dt class="text-ink-muted">Ordered</dt>
              <dd class="text-ink">{{ formatDate(data()!.ordered_at) }}</dd>

              @if (data()!.reported_at) {
                <dt class="text-ink-muted">Reported</dt>
                <dd class="text-ink">{{ formatDate(data()!.reported_at) }}</dd>
              }

              <dt class="text-ink-muted">Tests</dt>
              <dd class="font-mono text-ink">{{ data()!.test_count }}</dd>

              @if ((data()!.critical_count || 0) > 0) {
                <dt class="text-ink-muted">Critical values</dt>
                <dd class="font-semibold text-rose-700">{{ data()!.critical_count }} flagged</dd>
              }

              <dt class="text-ink-muted">Ordering doctor</dt>
              <dd class="text-ink truncate">{{ data()!.doctor_name || '—' }}</dd>

              <dt class="text-ink-muted">Pathologist</dt>
              <dd class="text-ink truncate">{{ data()!.pathologist || (data()!.verified ? '—' : 'pending') }}</dd>
            </dl>

            <footer class="mt-5 pt-4 border-t border-border text-[10px] text-ink-faint">
              This page does not display medical values — only a signature of authenticity. To view the report, contact the hospital with this token.
              <p class="font-mono text-ink-muted mt-1 break-all">Token: {{ token() }}</p>
            </footer>
          </article>
        }
      </div>
    </div>
  `,
})
export class LabVerifyPage implements OnInit {
  private route    = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);

  protected readonly token   = signal<string>('');
  protected readonly loading = signal(true);
  protected readonly data    = signal<VerifyMeta | null>(null);

  async ngOnInit() {
    const t = this.route.snapshot.paramMap.get('token') ?? '';
    this.token.set(t);
    if (!t) { this.data.set({ error: 'no_token' }); this.loading.set(false); return; }
    try {
      const { data, error } = await (this.supabase.client as any).rpc('public_lab_report_meta', { p_token: t });
      if (error) this.data.set({ error: error.message });
      else this.data.set(data as VerifyMeta);
    } catch (e: any) {
      this.data.set({ error: e?.message ?? 'request_failed' });
    } finally { this.loading.set(false); }
  }

  protected formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }
}
