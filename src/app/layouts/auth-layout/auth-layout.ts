import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastOutletComponent } from '../../shared/ui/toast/toast-outlet.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet, ToastOutletComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] min-h-dvh"
         style="background:#faf7f0;">

      <!-- ── Left art panel ────────────────────────────────────── -->
      <aside
        class="hidden lg:flex flex-col justify-between p-12 xl:p-14 relative overflow-hidden"
        style="color:#f5efe4;
               background:
                 radial-gradient(ellipse 70% 60% at 90% 20%, rgba(45,184,196,0.22) 0%, transparent 55%),
                 radial-gradient(ellipse 60% 65% at 10% 90%, rgba(45,184,196,0.12) 0%, transparent 60%),
                 linear-gradient(160deg, #0a1a3a 0%, #102f5e 45%, #163b73 100%);"
      >
        <!-- ── Decorative circle motifs (Borcelle-style accents) ── -->
        <!-- Big translucent teal disc, top-right -->
        <div class="absolute pointer-events-none"
             style="top:-80px; right:-80px; width:300px; height:300px; border-radius:50%;
                    background: radial-gradient(circle at 30% 30%, rgba(45,184,196,0.32) 0%, rgba(45,184,196,0.04) 70%, transparent 100%);
                    filter: blur(0.5px);"></div>
        <!-- Solid navy disc bottom-left -->
        <div class="absolute pointer-events-none"
             style="bottom:-120px; left:-120px; width:360px; height:360px; border-radius:50%;
                    background: radial-gradient(circle, rgba(10,26,58,0.85) 0%, rgba(10,26,58,0) 70%);"></div>
        <!-- Small overlapping pair (logo-style) -->
        <div class="absolute pointer-events-none" style="top:38%; right:6%;">
          <div style="width:80px; height:80px; border-radius:50%; background:#3dd1de; opacity:0.85;"></div>
          <div style="width:80px; height:80px; border-radius:50%; background:#0a1a3a; opacity:0.9;
                      margin-top:-50px; margin-left:50px; border:2px solid rgba(245,239,228,0.15);"></div>
        </div>
        <!-- Tiny floating dot accents -->
        <div class="absolute pointer-events-none"
             style="top:14%; left:55%; width:14px; height:14px; border-radius:50%;
                    background:#3dd1de; opacity:0.7;"></div>
        <div class="absolute pointer-events-none"
             style="bottom:22%; right:30%; width:24px; height:24px; border-radius:50%;
                    background:rgba(61,209,222,0.25); border:1px solid rgba(61,209,222,0.5);"></div>

        <!-- subtle grid overlay -->
        <div class="absolute inset-0 pointer-events-none"
             style="background-image:
                      linear-gradient(rgba(245,239,228,0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(245,239,228,0.03) 1px, transparent 1px);
                    background-size: 56px 56px;
                    -webkit-mask-image: radial-gradient(ellipse 90% 80% at 50% 50%, black 30%, transparent 85%);
                            mask-image: radial-gradient(ellipse 90% 80% at 50% 50%, black 30%, transparent 85%);"></div>

        <!-- TOP: brand bar -->
        <div class="relative z-10">
          <a href="https://niyamone.com/" target="_blank" rel="noopener"
             class="inline-flex items-center gap-2.5 group">
            <span class="w-10 h-10 rounded-[8px] grid place-items-center"
                  style="background:#0a1a3a; border:1px solid rgba(245,239,228,0.15);">
              <svg viewBox="0 0 100 100" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 85 L15 20 L35 20 L65 60 L65 20 L85 20 L85 85 L65 85 L35 45 L35 85 Z" fill="#f5efe4"/>
                <path d="M70 20 L85 20 L85 85 L70 85 Z" fill="#3dd1de"/>
              </svg>
            </span>
            <span class="font-display text-[22px] font-medium tracking-[-0.01em]" style="color:#f5efe4;">
              Niyam<b style="color:#3dd1de; font-weight:500;">One</b>
            </span>
          </a>
        </div>

        <!-- CENTRE: hero block — Healthcare Suite is now the headline -->
        <div class="relative z-10 -mt-6">
          <!-- Borcelle-style overlapping circles + brand label -->
          <div class="flex items-center gap-3 mb-5">
            <div class="relative" style="width:38px; height:38px;">
              <div style="position:absolute; left:0; top:0; width:30px; height:30px; border-radius:50%; background:#3dd1de;"></div>
              <div style="position:absolute; right:0; bottom:0; width:30px; height:30px; border-radius:50%; background:#f5efe4; mix-blend-mode:screen; opacity:0.85;"></div>
            </div>
            <span class="font-mono text-[11px] uppercase tracking-[0.28em]"
                  style="color:rgba(245,239,228,0.65);">
              Built for clinicians
            </span>
          </div>

          <!-- BIG: Healthcare Suite -->
          <h1 class="font-display font-light leading-[0.95] tracking-[-0.03em]"
              style="font-size:clamp(56px, 6.8vw, 92px); color:#f5efe4;">
            Healthcare
            <span class="block italic font-normal" style="color:#3dd1de;">Suite.</span>
          </h1>

          <!-- SMALL: supporting tagline -->
          <p class="font-display italic font-light mt-5"
             style="font-size:clamp(20px, 1.8vw, 26px); color:rgba(245,239,228,0.85); line-height:1.25;">
            Run your hospital on one calm system.
          </p>

          <p class="mt-5 max-w-[460px] font-light leading-[1.6]"
             style="color: rgba(245,239,228,0.65); font-size:14px;">
            Patient records · lab operations · billing · telemedicine · WhatsApp delivery —
            unified in a single interface. HIPAA &amp; ABDM compliant.
          </p>

          <!-- module chips -->
          <div class="mt-7 grid grid-cols-2 gap-2 max-w-[440px]">
            <div class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[12px]"
                 style="background:rgba(245,239,228,0.05); color:rgba(245,239,228,0.85); border:1px solid rgba(61,209,222,0.12);">
              <span class="w-5 h-5 rounded-full grid place-items-center shrink-0"
                    style="background:rgba(61,209,222,0.18); color:#3dd1de;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              </span>
              Patient records
            </div>
            <div class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[12px]"
                 style="background:rgba(245,239,228,0.05); color:rgba(245,239,228,0.85); border:1px solid rgba(61,209,222,0.12);">
              <span class="w-5 h-5 rounded-full grid place-items-center shrink-0"
                    style="background:rgba(61,209,222,0.18); color:#3dd1de;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              </span>
              Lab &amp; diagnostics
            </div>
            <div class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[12px]"
                 style="background:rgba(245,239,228,0.05); color:rgba(245,239,228,0.85); border:1px solid rgba(61,209,222,0.12);">
              <span class="w-5 h-5 rounded-full grid place-items-center shrink-0"
                    style="background:rgba(61,209,222,0.18); color:#3dd1de;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </span>
              Billing &amp; claims
            </div>
            <div class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[12px]"
                 style="background:rgba(245,239,228,0.05); color:rgba(245,239,228,0.85); border:1px solid rgba(61,209,222,0.12);">
              <span class="w-5 h-5 rounded-full grid place-items-center shrink-0"
                    style="background:rgba(61,209,222,0.18); color:#3dd1de;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </span>
              WhatsApp reach
            </div>
          </div>
        </div>

        <!-- BOTTOM: stats + niyamone.com link -->
        <div class="relative z-10">
          <div class="flex justify-between gap-2 pb-5 mb-5 border-b"
               style="border-color:rgba(245,239,228,0.12);">
            <div>
              <div class="font-display text-[22px] font-medium tracking-[-0.02em]" style="color:#f5efe4;">
                99.99<sup style="font-size:11px; color:#3dd1de;">%</sup>
              </div>
              <div class="font-mono text-[9px] uppercase tracking-[0.18em]"
                   style="color: rgba(245,239,228,0.55);">Uptime</div>
            </div>
            <div>
              <div class="font-display text-[22px] font-medium tracking-[-0.02em]" style="color:#f5efe4;">248</div>
              <div class="font-mono text-[9px] uppercase tracking-[0.18em]"
                   style="color: rgba(245,239,228,0.55);">Tenants</div>
            </div>
            <div>
              <div class="font-display text-[22px] font-medium tracking-[-0.02em]" style="color:#f5efe4;">6</div>
              <div class="font-mono text-[9px] uppercase tracking-[0.18em]"
                   style="color: rgba(245,239,228,0.55);">Industries</div>
            </div>
            <div>
              <div class="font-display text-[22px] font-medium tracking-[-0.02em]" style="color:#f5efe4;">
                HIPAA<sup style="font-size:11px; color:#3dd1de;">+</sup>
              </div>
              <div class="font-mono text-[9px] uppercase tracking-[0.18em]"
                   style="color: rgba(245,239,228,0.55);">Compliance</div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-4">
            <div class="font-mono text-[11px] tracking-[0.08em]"
                 style="color: rgba(245,239,228,0.55);">
              © 2026 Vein Software Solutions
            </div>
            <a href="https://niyamone.com/solutions" target="_blank" rel="noopener"
               class="font-mono text-[11px] uppercase tracking-[0.14em] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
               style="color:#3dd1de; border:1px solid rgba(61,209,222,0.4); background:rgba(61,209,222,0.08);">
              Other products &amp; solutions
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M7 17L17 7M7 7h10v10"/>
              </svg>
            </a>
          </div>
        </div>
      </aside>

      <!-- ── Right form side ──────────────────────────────────── -->
      <main class="flex items-center justify-center p-8 sm:p-14 relative">
        <!-- Mobile brand bar -->
        <div class="lg:hidden absolute top-6 left-6 right-6 flex items-center justify-between">
          <a href="https://niyamone.com/" target="_blank" rel="noopener"
             class="inline-flex items-center gap-2">
            <span class="w-8 h-8 rounded-[7px] grid place-items-center"
                  style="background:#0a1a3a;">
              <svg viewBox="0 0 100 100" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 85 L15 20 L35 20 L65 60 L65 20 L85 20 L85 85 L65 85 L35 45 L35 85 Z" fill="#f5efe4"/>
                <path d="M70 20 L85 20 L85 85 L70 85 Z" fill="#3dd1de"/>
              </svg>
            </span>
            <span class="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
              Niyam<b class="font-medium" style="color:#2db8c4;">One</b>
            </span>
          </a>
          <a href="https://niyamone.com/" target="_blank" rel="noopener"
             class="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            niyamone.com →
          </a>
        </div>

        <div class="w-full max-w-[400px]">
          <router-outlet />

          <!-- "Other products" card -->
          <div class="mt-10 pt-6 border-t border-border">
            <a href="https://niyamone.com/solutions" target="_blank" rel="noopener"
               class="flex items-center justify-between gap-3 px-4 py-3 rounded-[10px] transition-all border border-border hover:border-primary-300 hover:bg-primary-50 group">
              <div class="min-w-0">
                <div class="text-[13px] font-medium text-ink">Looking for other NiyamOne products?</div>
                <div class="text-[11px] text-ink-muted mt-0.5">Retail, Education, Manufacturing, F&amp;B and more →</div>
              </div>
              <span class="w-8 h-8 rounded-full grid place-items-center shrink-0"
                    style="background:#0a1a3a; color:#3dd1de;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                     class="transition-transform group-hover:translate-x-0.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </span>
            </a>
          </div>
        </div>
      </main>
    </div>

    <app-toast-outlet />
  `,
})
export class AuthLayout {}
