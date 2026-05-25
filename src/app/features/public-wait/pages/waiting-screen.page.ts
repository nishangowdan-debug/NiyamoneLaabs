import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';

interface QueueRow {
  token: number | null;
  status: string;
  doctor_name: string | null;
  specialty: string | null;
  queue_position: number | null;
  eta_min: number | null;
  wait_so_far_min: number | null;
}
interface QueueResponse {
  branch?: { code: string; name: string; city: string };
  now?: string;
  rows?: QueueRow[];
  error?: string;
}

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  scheduled:       { bg: 'bg-slate-200/30',    fg: 'text-slate-300',     label: 'Scheduled' },
  checked_in:      { bg: 'bg-amber-500/20',    fg: 'text-amber-200',     label: 'Waiting' },
  triaged:         { bg: 'bg-cyan-500/20',     fg: 'text-cyan-200',      label: 'Triaged' },
  in_consultation: { bg: 'bg-emerald-500/30',  fg: 'text-emerald-200',   label: 'In consult' },
  completed:       { bg: 'bg-slate-500/20',    fg: 'text-slate-300',     label: 'Done' },
};

/**
 * Public lobby waiting screen — shows live OPD queue for one branch.
 * No authentication. PII-free. Auto-refreshes every 15 seconds.
 * URL: /wait/:branchCode  (e.g. /wait/SRI-CHE)
 */
@Component({
  selector: 'app-waiting-screen-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full text-white bg-gradient-to-br from-[#0C2A52] via-[#0E4F8C] to-[#0C2A52]">
      @if (loading() && !data()) {
        <div class="grid place-items-center min-h-dvh">
          <p class="text-[18px] text-white/70">Loading queue…</p>
        </div>
      } @else if (data()?.error || !data()?.branch) {
        <div class="grid place-items-center min-h-dvh px-8 text-center">
          <div>
            <p class="text-[36px] font-display font-medium">Branch not found</p>
            <p class="text-[14px] text-white/70 mt-2">URL: <code class="font-mono">/wait/{{ branchCode() }}</code></p>
          </div>
        </div>
      } @else {
        <header class="px-8 py-5 flex items-center justify-between border-b border-white/10">
          <div class="flex items-center gap-4">
            <div class="w-[44px] h-[44px] rounded-md grid place-items-center bg-white/15 font-display italic font-bold text-[24px] backdrop-blur">n</div>
            <div>
              <p class="font-display text-[28px] font-medium leading-none tracking-tight">{{ data()!.branch!.name }}</p>
              <p class="text-[13px] text-white/70 mt-1">{{ data()!.branch!.city }} · live OPD queue</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-[10px] uppercase tracking-[0.10em] text-white/50">Refreshes every 15s</p>
            <p class="font-mono text-[28px] font-medium tabular-nums leading-none mt-1">{{ clockHHmm() }}</p>
          </div>
        </header>

        <main class="px-8 py-6">
          @if ((data()?.rows ?? []).length === 0) {
            <div class="grid place-items-center py-32">
              <p class="text-[28px] text-white/70 font-display">No patients in queue right now.</p>
              <p class="text-[14px] text-white/40 mt-2">New tokens will appear automatically.</p>
            </div>
          } @else {
            <!-- Now serving strip -->
            @if (currentlyInConsult().length > 0) {
              <section class="mb-8">
                <p class="text-[12px] uppercase tracking-[0.10em] text-white/60 font-semibold mb-3">Now serving</p>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  @for (r of currentlyInConsult(); track r.token) {
                    <article class="bg-emerald-500/15 border border-emerald-300/40 rounded-[14px] p-5 backdrop-blur">
                      <p class="text-[10px] uppercase tracking-[0.10em] text-emerald-200">In consultation</p>
                      <p class="font-display text-[64px] font-medium leading-none tabular-nums mt-1">#{{ r.token ?? '–' }}</p>
                      <p class="text-[14px] text-white/80 mt-3 truncate">{{ r.doctor_name || '—' }}</p>
                      <p class="text-[12px] text-white/50 truncate">{{ r.specialty || 'General' }}</p>
                    </article>
                  }
                </div>
              </section>
            }

            <!-- Up next -->
            <section>
              <p class="text-[12px] uppercase tracking-[0.10em] text-white/60 font-semibold mb-3">Up next ({{ waitingRows().length }})</p>
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                @for (r of waitingRows(); track r.token) {
                  <article class="bg-white/5 border border-white/10 rounded-[12px] p-4 backdrop-blur transition-colors hover:bg-white/10">
                    <header class="flex items-baseline justify-between mb-1.5">
                      <p class="font-display text-[36px] font-medium leading-none tabular-nums">#{{ r.token ?? '–' }}</p>
                      <span class="text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
                            [class]="statusCls(r.status)">{{ statusLabel(r.status) }}</span>
                    </header>
                    <p class="text-[12px] text-white/85 truncate">{{ r.doctor_name || '—' }}</p>
                    <p class="text-[10px] text-white/45 truncate mb-3">{{ r.specialty || 'General' }}</p>
                    <dl class="flex items-baseline justify-between text-[10px]">
                      <div>
                        <dt class="text-white/40 uppercase tracking-[0.06em]">Position</dt>
                        <dd class="font-mono tabular-nums text-[14px] text-white">#{{ r.queue_position ?? '–' }}</dd>
                      </div>
                      <div class="text-right">
                        <dt class="text-white/40 uppercase tracking-[0.06em]">ETA</dt>
                        <dd class="font-mono tabular-nums text-[14px]"
                            [class.text-amber-300]="(r.eta_min ?? 0) > 30"
                            [class.text-rose-300]="(r.eta_min ?? 0) > 60"
                            [class.text-emerald-300]="(r.eta_min ?? 0) <= 30">
                          {{ r.eta_min === null ? '—' : (r.eta_min === 0 ? 'Now' : (r.eta_min + 'm')) }}
                        </dd>
                      </div>
                    </dl>
                  </article>
                }
              </div>
            </section>
          }
        </main>

        <footer class="px-8 py-3 text-center text-[11px] text-white/40 border-t border-white/10">
          niyamone <span class="italic">hms</span> · ETAs are estimates · please listen for your token announcement
        </footer>
      }
    </div>
  `,
})
export class WaitingScreenPage implements OnInit, OnDestroy {
  private route    = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);

  protected readonly branchCode = signal('');
  protected readonly data       = signal<QueueResponse | null>(null);
  protected readonly loading    = signal(true);
  private readonly clockTick    = signal(Date.now());
  protected readonly clockHHmm  = computed(() => {
    void this.clockTick();
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  });

  protected readonly currentlyInConsult = computed(() =>
    (this.data()?.rows ?? []).filter(r => r.status === 'in_consultation'));
  protected readonly waitingRows = computed(() =>
    (this.data()?.rows ?? []).filter(r => r.status !== 'in_consultation' && r.status !== 'completed'));

  private refreshHandle: ReturnType<typeof setInterval> | null = null;
  private clockHandle:   ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  ngOnInit() {
    const code = (this.route.snapshot.paramMap.get('branchCode') ?? '').toUpperCase();
    this.branchCode.set(code);
    void this.refresh();
    this.refreshHandle = setInterval(() => { void this.refresh(); }, 15_000);
    this.clockHandle   = setInterval(() => this.clockTick.set(Date.now()), 60_000);
  }
  ngOnDestroy() {
    this.destroyed = true;
    if (this.refreshHandle) clearInterval(this.refreshHandle);
    if (this.clockHandle)   clearInterval(this.clockHandle);
  }

  private async refresh() {
    try {
      const { data, error } = await (this.supabase.client as any).rpc('public_opd_queue', {
        p_branch_code: this.branchCode(),
      });
      if (this.destroyed) return;
      if (error) {
        this.data.set({ error: error.message ?? 'request_failed' });
      } else {
        this.data.set(data as QueueResponse);
      }
    } catch (e: any) {
      if (this.destroyed) return;
      this.data.set({ error: e?.message ?? 'request_failed' });
    } finally {
      if (!this.destroyed) this.loading.set(false);
    }
  }

  protected statusCls(s: string): string {
    const t = STATUS_TONE[s] ?? STATUS_TONE['scheduled'];
    return `${t.bg} ${t.fg}`;
  }
  protected statusLabel(s: string): string {
    return STATUS_TONE[s]?.label ?? s;
  }
}
