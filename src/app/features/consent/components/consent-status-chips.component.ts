import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output,
  SimpleChanges, inject, signal,
} from '@angular/core';
import { ConsentService } from '../data/consent.service';
import { ConsentCaptureComponent } from './consent-capture.component';

interface CodeMeta { code: string; label: string; relevant: boolean }

type ChipState = 'captured' | 'expired' | 'missing';
interface ChipInfo { state: ChipState; validUntil?: string | null }

/**
 * Compact chip strip showing each relevant consent's capture status for the
 * given patient (and optional admission). Click any chip to open the capture
 * dialog pre-filled with that form code.
 *
 * `relevantCodes` defaults to the operationally-required set; pass an explicit
 * list to override (e.g. only show transfusion consent on the blood-bank page).
 */
@Component({
  selector: 'app-consent-status-chips',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConsentCaptureComponent],
  template: `
    <div class="flex flex-wrap items-center gap-1.5">
      @if (loading()) {
        <span class="text-[10px] text-ink-muted">Checking consents…</span>
      } @else {
        @for (m of codes; track m.code) {
          @let info = chipInfo()[m.code] ?? { state: 'missing' };
          <button type="button" (click)="open(m.code)"
                  [attr.title]="tooltip(m, info)"
                  class="h-6 px-2 inline-flex items-center gap-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.04em] border transition-colors"
                  [class.bg-emerald-50]="info.state === 'captured'"
                  [class.text-emerald-700]="info.state === 'captured'"
                  [class.border-emerald-200]="info.state === 'captured'"
                  [class.bg-rose-50]="info.state === 'expired'"
                  [class.text-rose-700]="info.state === 'expired'"
                  [class.border-rose-300]="info.state === 'expired'"
                  [class.bg-amber-50]="info.state === 'missing'"
                  [class.text-amber-700]="info.state === 'missing'"
                  [class.border-amber-300]="info.state === 'missing'">
            <span>{{ icon(info.state) }}</span>
            <span>{{ m.label }}</span>
          </button>
        }
      }
    </div>

    @if (openCode(); as c) {
      <app-consent-capture
        [patientId]="patientId"
        [patientName]="patientName"
        [patientMobile]="patientMobile ?? null"
        [admissionId]="admissionId ?? null"
        [encounterId]="encounterId ?? null"
        [prefillFormCode]="c"
        (closed)="openCode.set(null)"
        (saved)="onSaved($event)" />
    }
  `,
})
export class ConsentStatusChipsComponent implements OnChanges {
  private svc = inject(ConsentService);

  @Input({ required: true }) patientId!: string;
  @Input() patientName: string | null = null;
  @Input() patientMobile: string | null = null;
  @Input() admissionId: string | null = null;
  @Input() encounterId: string | null = null;
  /** When provided, only these form codes render. Otherwise the operational defaults below are shown. */
  @Input() relevantCodes: string[] | null = null;
  @Output() saved = new EventEmitter<{ code: string; consentId: string }>();

  /** Operationally most-frequent consents — short-label list for the header strip. */
  protected readonly defaultCodes: CodeMeta[] = [
    { code: 'GEN-ADMISSION', label: 'Admission',  relevant: true },
    { code: 'TRANSFUSION',   label: 'Transfusion', relevant: true },
    { code: 'HIGH-RISK',     label: 'High-risk',  relevant: true },
    { code: 'ANAESTHESIA',   label: 'Anaesthesia',relevant: true },
    { code: 'SURGERY',       label: 'Surgery',    relevant: true },
    { code: 'DNR-DNI',       label: 'DNR',        relevant: true },
  ];

  protected readonly chipInfo = signal<Record<string, ChipInfo>>({});
  protected readonly loading  = signal(true);
  protected readonly openCode = signal<string | null>(null);

  protected get codes(): CodeMeta[] {
    if (this.relevantCodes && this.relevantCodes.length) {
      return this.relevantCodes.map(c => ({ code: c, label: this.shortLabel(c), relevant: true }));
    }
    return this.defaultCodes;
  }

  ngOnChanges(_changes: SimpleChanges) {
    if (this.patientId) void this.refresh();
  }

  protected open(code: string) { this.openCode.set(code); }

  protected onSaved(e: { consentId: string }) {
    const code = this.openCode();
    this.openCode.set(null);
    if (code) {
      this.chipInfo.update(m => ({ ...m, [code]: { state: 'captured' } }));
      this.saved.emit({ code, consentId: e.consentId });
    }
  }

  protected icon(s: ChipState): string {
    return s === 'captured' ? '✓' : s === 'expired' ? '⌛' : '⚠';
  }

  protected tooltip(m: CodeMeta, info: ChipInfo): string {
    const action = info.state === 'captured' ? 'click to recapture' : 'click to capture';
    if (info.state === 'expired') {
      const until = info.validUntil ? ` · expired ${this.fmtDate(info.validUntil)}` : '';
      return `${m.label}: Expired${until} · ${action}`;
    }
    if (info.state === 'captured') {
      const until = info.validUntil ? ` · valid until ${this.fmtDate(info.validUntil)}` : '';
      return `${m.label}: Captured${until} · ${action}`;
    }
    return `${m.label}: Missing · ${action}`;
  }

  private fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  }

  /** Re-evaluates each chip — uses the effective view so expired time-scoped consents flip automatically. */
  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result: Record<string, ChipInfo> = {};
      // Default everything to 'missing'
      for (const m of this.codes) result[m.code] = { state: 'missing' };

      const rows = this.admissionId
        ? await this.svc.listEffectiveForAdmission(this.admissionId)
        : await this.svc.listEffectiveForPatient(this.patientId);

      // For each code, find the latest row and use its effective_status.
      // Rows are returned ordered by created_at DESC, so the first match wins.
      const seen = new Set<string>();
      for (const r of rows) {
        const code = (r as any).consent_form_code as string;
        if (seen.has(code)) continue;
        if (!this.codes.find(c => c.code === code)) continue;
        seen.add(code);
        const eff = (r as any).effective_status as string;
        const validUntil = (r as any).valid_until as string | null;
        if (eff === 'signed')   result[code] = { state: 'captured', validUntil };
        else if (eff === 'expired') result[code] = { state: 'expired',  validUntil };
        // withdrawn / superseded / draft → leave as missing (need a fresh sign)
      }

      this.chipInfo.set(result);
    } catch {
      // Non-fatal — show all as missing
      const empty: Record<string, ChipInfo> = {};
      for (const m of this.codes) empty[m.code] = { state: 'missing' };
      this.chipInfo.set(empty);
    } finally {
      this.loading.set(false);
    }
  }

  private shortLabel(code: string): string {
    const map: Record<string, string> = {
      'GEN-ADMISSION': 'Admission',
      'TRANSFUSION':   'Transfusion',
      'HIV-TEST':      'HIV',
      'HIGH-RISK':     'High-risk',
      'ANAESTHESIA':   'Anaesthesia',
      'SURGERY':       'Surgery',
      'ENDOSCOPY':     'Endoscopy',
      'ICU-CARE':      'ICU',
      'DNR-DNI':       'DNR',
      'DAMA':          'DAMA',
      'PHOTO-VIDEO':   'Photo',
    };
    return map[code] ?? code;
  }
}
