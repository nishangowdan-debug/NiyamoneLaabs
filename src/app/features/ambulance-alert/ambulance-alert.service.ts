import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { BranchStore } from '../../core/branches/branch.store';

export interface PendingAlert {
  trip_id: string;
  trip_number: string | null;
  patient_name: string;
  patient_age: number | null;
  patient_gender: string | null;
  chief_complaint: string | null;
  priority: string | null;
  eta_at: string;
  eta_min: number;
  equipment: string[];
  driver_name: string | null;
  driver_phone: string | null;
  ambulance_code: string | null;
  branch_id: string;
}

/**
 * Polls `ambulance_pending_alerts` every 30s and emits live alerts whose ETA is
 * within 5 minutes. Fires a browser notification + audio chime the first time
 * each alert appears (per session). Caller marks an alert "prepared" to dismiss
 * it permanently for everyone.
 */
@Injectable({ providedIn: 'root' })
export class AmbulanceAlertService {
  private supabase = inject(SupabaseService);
  private branches = inject(BranchStore);

  private readonly _alerts = signal<PendingAlert[]>([]);
  readonly alerts          = this._alerts.asReadonly();
  readonly hasAlerts       = computed(() => this._alerts().length > 0);

  /** Trip ids we've already chimed for this session — avoids re-chiming on every poll. */
  private chimedFor = new Set<string>();
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private started = false;

  /** Start polling; safe to call multiple times. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.poll();
    this.pollHandle = setInterval(() => void this.poll(), 30_000);
  }

  /** Stop polling; called on signout / app teardown. */
  stop(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = null;
    this.started = false;
    this._alerts.set([]);
    this.chimedFor.clear();
  }

  /** Manual refresh (e.g. after marking one as prepared). */
  async poll(): Promise<void> {
    try {
      const branchId = this.branches.activeBranchId();
      const { data, error } = await (this.supabase.client as any).rpc('ambulance_pending_alerts', {
        p_branch_id: branchId,
      });
      if (error) throw error;
      const next = (data ?? []) as PendingAlert[];
      // Only push a new array reference into the signal when the *content*
      // actually changed — this stops downstream @for loops from re-creating
      // their DOM (and the dev-mode NG0956 warning) on every 30 s tick when
      // the same alert is still pending.
      if (this.shouldReplace(next)) {
        this._alerts.set(next);
      }
      this.fireSignals(next);
    } catch {
      // Non-fatal — leave previous alerts in place
    }
  }

  /** Compare the new poll result against the current signal value. */
  private shouldReplace(next: PendingAlert[]): boolean {
    const prev = this._alerts();
    if (prev.length !== next.length) return true;
    for (let i = 0; i < next.length; i++) {
      const a = prev[i], b = next[i];
      if (a.trip_id !== b.trip_id) return true;
      if (a.eta_min !== b.eta_min) return true;
    }
    return false;
  }

  /** Mark a trip prepared (DB stamp + remove from local list). */
  async markPrepared(tripId: string): Promise<void> {
    try {
      await (this.supabase.client as any).rpc('ambulance_mark_prepared', { p_trip_id: tripId });
    } finally {
      this._alerts.update(rows => rows.filter(r => r.trip_id !== tripId));
      this.chimedFor.delete(tripId);
    }
  }

  /** Fire browser notification + audio cue for any alert we haven't chimed for yet. */
  private fireSignals(alerts: PendingAlert[]): void {
    for (const a of alerts) {
      if (this.chimedFor.has(a.trip_id)) continue;
      this.chimedFor.add(a.trip_id);
      this.tryPlayChime();
      this.tryNotify(a);
    }
  }

  private tryPlayChime(): void {
    try {
      const Ctor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      // Two-tone chime: 880Hz for 150ms, then 660Hz for 150ms.
      const beep = (freq: number, when: number, dur = 0.15) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.001, ctx.currentTime + when);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + when);
        o.stop(ctx.currentTime + when + dur + 0.05);
      };
      beep(880, 0);
      beep(660, 0.18);
      // Auto-close so it doesn't leak.
      setTimeout(() => ctx.close().catch(() => {}), 1000);
    } catch { /* silent */ }
  }

  private tryNotify(a: PendingAlert): void {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'default') {
        // Best-effort — only ask once
        Notification.requestPermission().catch(() => {});
        return;
      }
      if (Notification.permission !== 'granted') return;
      const equip = a.equipment.length ? ` · ${a.equipment.join(', ')}` : '';
      new Notification(`🚑 Inbound ambulance — ${a.eta_min}m`, {
        body: `${a.patient_name}${equip}\n${a.chief_complaint ?? 'Condition unknown'}`,
        tag: `amb-${a.trip_id}`,
        requireInteraction: true,
      });
    } catch { /* silent */ }
  }
}
