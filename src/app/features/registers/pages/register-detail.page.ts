import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { RegistersService } from '../data/registers.service';
import { RegistersStore } from '../data/registers.store';
import type { RegisterDefinition, RegisterEntry } from '../data/registers.types';

@Component({
  selector: 'app-register-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AlertComponent],
  template: `
<div class="flex flex-col gap-4 max-w-[720px]">
  <header class="pb-4 border-b border-border">
    <div class="text-[11px] uppercase tracking-[0.08em] text-ink-faint mb-1">
      <a routerLink="/registers" class="hover:underline">Registers</a> ·
      <a [routerLink]="['/registers', code()]" class="hover:underline">{{ definition()?.label }}</a>
    </div>
    <h1 class="font-display text-[22px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">
      Entry {{ entry()?.id?.slice(0, 8) }}
    </h1>
  </header>

  @if (error()) { <app-alert tone="danger">{{ error() }}</app-alert> }

  @if (entry(); as e) {
    <dl class="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-[13px]">
      <dt class="text-ink-muted">Recorded at</dt>
      <dd class="text-ink">{{ formatTs(e.entry_at) }}</dd>

      <dt class="text-ink-muted">Status</dt>
      <dd>
        @if (e.voided) {
          <span class="text-[11px] px-1.5 py-0.5 rounded bg-danger-bg text-danger-fg">voided</span>
          @if (e.void_reason) { <span class="text-ink-muted ml-2">— {{ e.void_reason }}</span> }
        } @else if (e.verified_at) {
          <span class="text-[11px] px-1.5 py-0.5 rounded bg-good-bg text-good-fg">verified</span>
          <span class="text-ink-muted ml-2">at {{ formatTs(e.verified_at) }}</span>
        } @else {
          <span class="text-[11px] px-1.5 py-0.5 rounded bg-warn-bg text-warn-fg">pending verification</span>
        }
      </dd>

      @if (e.ref_number)  { <dt class="text-ink-muted">Reference</dt><dd class="text-ink font-mono">{{ e.ref_number }}</dd> }
      @if (e.shift)       { <dt class="text-ink-muted">Shift</dt><dd class="text-ink">{{ e.shift }}</dd> }
      @if (e.vendor_id)   { <dt class="text-ink-muted">Vendor</dt><dd class="text-ink font-mono">{{ e.vendor_id }}</dd> }
      @if (e.computed?.consumption != null) {
        <dt class="text-ink-muted">Consumption</dt>
        <dd class="text-ink font-mono">{{ e.computed?.consumption }}</dd>
      }

      @for (f of definition()?.fields ?? []; track f.key) {
        <dt class="text-ink-muted">{{ f.label }}</dt>
        <dd class="text-ink">{{ payloadValue(e, f.key) }}{{ f.unit ? ' ' + f.unit : '' }}</dd>
      }

      @if (e.photo_url) {
        <dt class="text-ink-muted">Photo</dt>
        <dd><a [href]="e.photo_url" target="_blank" class="text-primary-700 hover:underline">{{ e.photo_url }}</a></dd>
      }
    </dl>

    @if (canManage() && !e.voided) {
      <div class="flex items-center gap-2 pt-3 border-t border-border">
        @if (!e.verified_at) {
          <button type="button" (click)="verify()"
                  class="h-9 px-3 rounded-md bg-good-fg text-white text-[13px] font-medium hover:opacity-90">
            Verify
          </button>
        }
        <button type="button" (click)="askVoid()"
                class="h-9 px-3 rounded-md border border-danger-fg text-danger-fg text-[13px] font-medium hover:bg-danger-bg">
          Void
        </button>
      </div>
    }
  } @else if (!error()) {
    <p class="text-[13px] text-ink-muted">Loading…</p>
  }
</div>
  `,
})
export class RegisterDetailPage {
  private route = inject(ActivatedRoute);
  private regSvc = inject(RegistersService);
  protected store = inject(RegistersStore);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);

  protected readonly code = signal<string>('');
  protected readonly entryId = signal<string>('');
  protected readonly entry = signal<RegisterEntry | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly definition = computed<RegisterDefinition | undefined>(() =>
    this.store.byCode(this.code()),
  );
  protected readonly canManage = computed(() => this.auth.hasRole('super_admin', 'branch_admin'));

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((pm) => {
      this.code.set(pm.get('code') ?? '');
      this.entryId.set(pm.get('id') ?? '');
      this.entry.set(null);
      this.error.set(null);
    });

    effect(async () => {
      const id = this.entryId();
      if (!id) return;
      try {
        await this.store.load();
        const e = await this.regSvc.getEntry(id);
        this.entry.set(e);
      } catch (e: any) {
        this.error.set(e?.message ?? 'Failed to load entry');
      }
    });
  }

  protected formatTs(iso: string): string {
    try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
    catch { return iso; }
  }
  protected payloadValue(e: RegisterEntry, key: string): string {
    const v = (e.payload as any)?.[key];
    return v == null || v === '' ? '—' : String(v);
  }

  async verify() {
    const id = this.entryId();
    try {
      await this.regSvc.verifyEntry(id);
      this.toast.success('Entry verified');
      this.entry.set(await this.regSvc.getEntry(id));
    } catch (e: any) { this.toast.error('Verify failed', e?.message); }
  }

  async askVoid() {
    const reason = window.prompt('Reason for voiding this entry (required, min 4 chars):') ?? '';
    if (reason.trim().length < 4) return;
    const id = this.entryId();
    try {
      await this.regSvc.voidEntry(id, reason.trim());
      this.toast.success('Entry voided');
      this.entry.set(await this.regSvc.getEntry(id));
    } catch (e: any) { this.toast.error('Void failed', e?.message); }
  }
}
