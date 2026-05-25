import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output,
  ViewChild, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  FileSignature,
  X,
  AlertTriangle,
  Check,
} from 'lucide-angular';
import { ConsentService } from '../data/consent.service';
import { SignaturePadComponent } from './signature-pad.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { AuthStore } from '../../../core/auth/auth.store';
import type { ConsentForm, ConsentSignerRelation, PatientConsent } from '../data/consent.types';

interface StaffOption { id: string; full_name: string; role_slug: string; }

/**
 * Modal: pick consent template → preview rendered body → collect signatures → save.
 * Open it from any page that has a patient context.
 */
@Component({
  selector: 'app-consent-capture',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, SignaturePadComponent],
  template: `
<div class="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center pt-[3vh] pb-4 overflow-auto"
     (document:keydown.escape)="onBackdrop($event)">
  <div class="bg-surface-card rounded-[14px] shadow-card w-full max-w-[920px] mx-4 flex flex-col max-h-[94vh]">

    <!-- Header -->
    <header class="px-5 py-4 border-b border-border flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span class="size-9 rounded-lg bg-primary-100 grid place-items-center text-primary-700 shrink-0">
          <i-lucide [name]="iconConsent" [size]="18" [strokeWidth]="1.75"></i-lucide>
        </span>
        <div>
          <h2 class="font-display text-[18px] font-medium text-ink leading-tight">Patient Consent</h2>
          <p class="text-[11.5px] text-ink-muted mt-0.5">
            {{ patientName || 'Patient' }}
            @if (patientMobile) { · <span class="font-mono">📱 {{ patientMobile }}</span> }
            @if (admissionId) { · <span class="font-mono">IP {{ admissionId.slice(0,8) }}</span> }
          </p>
        </div>
      </div>
      <button (click)="close()" aria-label="Close"
              class="size-8 rounded-md hover:bg-surface-subtle text-ink-muted grid place-items-center">
        <i-lucide [name]="iconClose" [size]="18" [strokeWidth]="1.75"></i-lucide>
      </button>
    </header>

    <!-- Body -->
    <div class="flex-1 overflow-auto p-4 space-y-4">

      <!-- Step 1: pick template -->
      <article class="bg-surface-subtle rounded-[10px] border border-border p-3">
        <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">1 · Choose consent</p>
        <select [ngModel]="selectedCode()" (ngModelChange)="selectedCode.set($event); onFormChange($event)"
                class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
          <option value="" disabled>— Select a consent form —</option>
          @for (cat of categorisedForms(); track cat.label) {
            <optgroup [label]="cat.label">
              @for (f of cat.forms; track f.id) { <option [value]="f.code">{{ f.title }}</option> }
            </optgroup>
          }
        </select>

        @if (selectedForm(); as f) {
          <div class="mt-2 grid grid-cols-3 gap-2">
            <input [(ngModel)]="mergeProcedure" placeholder="Procedure / condition (optional)"
                   class="col-span-2 h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
            <select [(ngModel)]="language"
                    class="h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
              <option value="en">English</option><option value="hi">Hindi</option><option value="kn">Kannada</option>
            </select>
            <p class="col-span-3 text-[10px] text-ink-faint flex flex-wrap items-center gap-x-3 gap-y-1">
              @if (f.requires_witness) {
                <span class="inline-flex items-center gap-1">
                  <i-lucide [name]="iconWarn" [size]="11" [strokeWidth]="2" class="text-warn-fg"></i-lucide>
                  Witness required
                </span>
              }
              @if (f.requires_relative) {
                <span class="inline-flex items-center gap-1">
                  <i-lucide [name]="iconWarn" [size]="11" [strokeWidth]="2" class="text-danger-fg"></i-lucide>
                  Relative signature required (high-risk)
                </span>
              }
            </p>
          </div>
        }
      </article>

      <!-- Step 2: preview rendered consent body -->
      @if (selectedForm()) {
        <article class="bg-surface-subtle rounded-[10px] border border-border p-3">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">2 · Consent text</p>
          <div class="bg-surface-card border border-border rounded-md p-3 text-[12.5px] leading-relaxed max-h-[180px] overflow-y-auto"
               [innerHTML]="previewBody()"></div>
          <p class="text-[10px] text-ink-faint mt-1">Read this aloud to the patient before they sign.</p>
        </article>

        <!-- Step 3: signatures -->
        <article class="bg-surface-subtle rounded-[10px] border border-border p-3">
          <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">3 · Signatures</p>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <!-- Patient signature -->
            <div>
              <app-signature-pad #patientPad label="Patient signature"
                                  [width]="520" [height]="120"
                                  (changed)="patientSig.set($event)"></app-signature-pad>
            </div>

            <!-- Relative signature (when required or when patient can't sign) -->
            <div>
              <div class="grid grid-cols-2 gap-2 mb-1.5">
                <input [(ngModel)]="relativeName" placeholder="Relative name"
                       class="h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
                <select [(ngModel)]="relativeRelation"
                        class="h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
                  <option value="">— Relation —</option>
                  <option value="self">Self</option><option value="spouse">Spouse</option>
                  <option value="parent">Parent</option><option value="child">Child</option>
                  <option value="sibling">Sibling</option><option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
                <input [(ngModel)]="relativePhone" type="tel" inputmode="tel"
                       placeholder="Relative mobile (10 digits)"
                       class="h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
                <input [(ngModel)]="relativeIdProof" placeholder="ID proof (last 4 digits, optional)"
                       class="h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
              </div>
              <app-signature-pad #relativePad label="Relative signature (if applicable)"
                                  [width]="520" [height]="120"
                                  (changed)="relativeSig.set($event)"></app-signature-pad>
            </div>
          </div>

          <!-- Doctor + witness selectors -->
          <div class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label class="block">
              <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Explaining doctor *</span>
              <select [ngModel]="doctorStaffId()" (ngModelChange)="doctorStaffId.set($event)"
                      class="w-full h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
                <option value="">— Select doctor —</option>
                @for (s of doctors(); track s.id) { <option [value]="s.id">{{ s.full_name }}</option> }
              </select>
            </label>
            <label class="block">
              <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">
                Witness {{ selectedForm()?.requires_witness ? '*' : '' }}
              </span>
              <select [ngModel]="witnessStaffId()" (ngModelChange)="witnessStaffId.set($event)"
                      class="w-full h-9 px-2.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600">
                <option value="">— Select witness —</option>
                @for (s of staff(); track s.id) { <option [value]="s.id">{{ s.full_name }}</option> }
              </select>
            </label>
          </div>

          <label class="block mt-2">
            <span class="block text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Notes</span>
            <textarea [(ngModel)]="notes" rows="2"
                      placeholder="Additional context (optional)"
                      class="w-full px-2.5 py-1.5 text-[12px] bg-surface-card border border-border rounded-md focus:outline-none focus:border-primary-600 resize-y"></textarea>
          </label>
        </article>
      }
    </div>

    <!-- ── OTP step (only when consent form has requires_otp=true) ── -->
    @if (otpStep() === 'sent') {
      <section class="px-5 py-3 border-t border-border bg-amber-50/50 space-y-2">
        <p class="text-[12px] text-amber-800 font-semibold inline-flex items-center gap-1.5">
          🔐 OTP-verified consent — code sent to {{ relativePhone || patientMobile || 'phone on file' }}
        </p>
        @if (mockOtp()) {
          <p class="text-[11px] text-amber-700 bg-amber-100/60 border border-amber-200 rounded-md px-2 py-1 font-mono">
            Mock provider · OTP = <strong>{{ mockOtp() }}</strong>
            <span class="text-ink-muted">(visible because no real SMS provider is wired yet)</span>
          </p>
        }
        <div class="flex items-center gap-2">
          <input type="text" [(ngModel)]="otpCode" maxlength="6" inputmode="numeric"
                 placeholder="6-digit code"
                 class="h-9 w-32 px-2.5 text-[14px] font-mono text-center tracking-[0.3em] rounded-md border border-border bg-surface text-ink"/>
          <button (click)="verifyOtp()" [disabled]="busy() || otpCode.length !== 6"
                  class="h-9 px-3 rounded-md bg-emerald-600 text-white text-[12px] font-semibold disabled:opacity-50">
            Verify &amp; sign
          </button>
          <button (click)="requestOtp()" [disabled]="busy()"
                  class="text-[11px] text-primary-700 hover:underline disabled:opacity-50">
            Resend
          </button>
        </div>
      </section>
    }

    <!-- Footer -->
    @if (formError()) {
      <p class="px-5 py-2 text-[12px] text-danger-fg bg-danger-bg/40 border-t border-danger-border">{{ formError() }}</p>
    }
    <footer class="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
      <button (click)="close()" [disabled]="busy()"
              class="h-10 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
        Cancel
      </button>
      @if (otpStep() === 'idle') {
        <button (click)="save()" [disabled]="!canSave() || busy()"
                class="h-10 px-5 rounded-md text-[13px] font-semibold text-white shadow-card disabled:opacity-50 inline-flex items-center gap-2"
                style="background:#0E4F8C;">
          @if (!busy()) {
            <i-lucide [name]="iconCheck" [size]="16" [strokeWidth]="2.25"></i-lucide>
            <span>{{ selectedForm()?.requires_otp ? 'Send OTP &amp; sign' : 'Sign & save consent' }}</span>
          } @else {
            <span>Saving…</span>
          }
        </button>
      }
    </footer>
  </div>
</div>
  `,
})
export class ConsentCaptureComponent implements OnInit {
  private svc      = inject(ConsentService);
  private toast    = inject(ToastService);
  private supabase = inject(SupabaseService);
  private auth     = inject(AuthStore);

  @Input({ required: true }) patientId!: string;
  @Input() patientName: string | null = null;
  @Input() patientMobile: string | null = null;
  @Input() encounterId: string | null = null;
  @Input() admissionId: string | null = null;
  @Input() prefillFormCode: string | null = null;
  /** Optional related entity (e.g. ot_surgical_record, blood_request, lab_order). Forwarded to create_consent_record. */
  @Input() relatedEntityType: string | null = null;
  @Input() relatedEntityId: string | null = null;
  @Output() closed  = new EventEmitter<void>();
  @Output() saved   = new EventEmitter<{ consentId: string }>();

  @ViewChild('patientPad')  patientPad?: SignaturePadComponent;
  @ViewChild('relativePad') relativePad?: SignaturePadComponent;

  protected readonly forms     = signal<ConsentForm[]>([]);
  protected readonly staff     = signal<StaffOption[]>([]);
  protected readonly busy      = signal(false);
  protected readonly formError = signal<string | null>(null);
  // OTP step state
  protected readonly otpStep    = signal<'idle' | 'sent' | 'verified'>('idle');
  protected readonly mockOtp    = signal<string | null>(null);
  protected readonly otpDraftId = signal<string | null>(null);
  protected otpCode = '';
  protected readonly patientSig  = signal<string | null>(null);
  protected readonly relativeSig = signal<string | null>(null);

  // ── Form state ────────────────────────────────────────────────
  // selectedCode + doctorStaffId + witnessStaffId are signals so canSave()
  // re-evaluates correctly under zoneless change detection. Plain fields
  // would not bump CD when the dropdown changes.
  protected readonly selectedCode    = signal<string>('');
  protected readonly doctorStaffId   = signal<string>('');
  protected readonly witnessStaffId  = signal<string>('');
  protected mergeProcedure = '';
  protected language = 'en';
  protected relativeName = '';
  protected relativeRelation: ConsentSignerRelation | '' = '';
  protected relativeIdProof = '';
  protected relativePhone = '';
  protected notes = '';

  protected readonly selectedForm = computed(() =>
    this.forms().find(f => f.code === this.selectedCode()) ?? null);

  protected readonly categorisedForms = computed(() => {
    const groups: Record<string, ConsentForm[]> = {};
    for (const f of this.forms()) {
      const k = (f.category || 'general').toString();
      (groups[k] = groups[k] ?? []).push(f);
    }
    return Object.entries(groups)
      .map(([k, forms]) => ({ label: this.labelForCategory(k), forms }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly doctors = computed(() => this.staff().filter(s => s.role_slug === 'doctor'));

  protected readonly previewBody = computed(() => {
    const f = this.selectedForm();
    if (!f) return '';
    let body = f.body_template;
    body = body.replace(/{{patient_name}}/g, this.patientName || '—');
    if (this.mergeProcedure) {
      body = body.replace(/{{procedure}}/g, this.mergeProcedure);
      body = body.replace(/{{condition}}/g, this.mergeProcedure);
    }
    body = body.replace(/{{[^}]+}}/g, '___');
    return body;
  });

  async ngOnInit() {
    try {
      const [forms, staff] = await Promise.all([
        this.svc.listForms(),
        this.loadStaff(),
      ]);
      this.forms.set(forms);
      this.staff.set(staff);
      if (this.prefillFormCode) this.selectedCode.set(this.prefillFormCode);
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Failed to load consent form templates.');
    }
  }

  private async loadStaff(): Promise<StaffOption[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('staff')
      .select('id, full_name, role_slug')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    return (data ?? []) as StaffOption[];
  }

  protected onFormChange(_code: string) {
    this.formError.set(null);
  }

  protected readonly canSave = computed<boolean>(() => {
    if (!this.selectedForm()) return false;
    if (!this.doctorStaffId()) return false;
    const f = this.selectedForm()!;
    if (f.requires_witness && !this.witnessStaffId()) return false;
    if (!this.patientSig() && !this.relativeSig()) return false;
    return true;
  });

  protected async save() {
    if (!this.canSave()) return;
    this.busy.set(true);
    this.formError.set(null);
    try {
      const draft = await this.svc.createDraft({
        patientId:          this.patientId,
        formCode:           this.selectedCode(),
        encounterId:        this.encounterId,
        admissionId:        this.admissionId,
        relatedEntityType:  this.relatedEntityType,
        relatedEntityId:    this.relatedEntityId,
        mergeData:          this.mergeProcedure
          ? { procedure: this.mergeProcedure, condition: this.mergeProcedure }
          : {},
        language:           this.language,
      });

      // OTP gate: pause here for forms with requires_otp=true. The Sign call
      // happens after verifyOtp() in finaliseSign().
      if (this.selectedForm()?.requires_otp) {
        this.otpDraftId.set(draft.id);
        this.busy.set(false);
        await this.requestOtp();
        return;
      }

      await this.finaliseSign(draft);
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Failed to save consent.');
      this.busy.set(false);
    }
  }

  /**
   * Issue / re-issue an OTP for the current draft. Called from save() (first
   * issue) and from the "Resend" button.
   */
  protected async requestOtp() {
    const draftId = this.otpDraftId();
    if (!draftId) return;
    const phone = (this.relativePhone || this.patientMobile || '').trim();
    if (!phone) {
      this.formError.set('A relative phone or patient mobile is required for OTP-verified consent.');
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      const r = await this.svc.requestOtp(draftId, phone);
      this.mockOtp.set(r.mock_otp ?? null);
      this.otpStep.set('sent');
      this.otpCode = '';
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Failed to send OTP.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async verifyOtp() {
    const draftId = this.otpDraftId();
    if (!draftId || this.otpCode.length !== 6) return;
    this.busy.set(true);
    this.formError.set(null);
    try {
      await this.svc.verifyOtp(draftId, this.otpCode);
      this.otpStep.set('verified');
      // Re-fetch the draft so finaliseSign has the canonical row
      const draft = await this.svc.get(draftId);
      await this.finaliseSign(draft as any);
    } catch (e: any) {
      this.formError.set(e?.message ?? 'OTP verification failed.');
      this.busy.set(false);
    }
  }

  /** The original sign + close path, factored out so it runs both for OTP-required
   *  and normal forms. */
  private async finaliseSign(draft: { id: string; consent_form_code: string; consent_form_version: number; rendered_body: string | null }) {
    this.busy.set(true);
    try {
      const phoneNote = this.relativePhone.trim()
        ? `Relative phone: ${this.relativePhone.trim()}`
        : '';
      const otpNote = this.selectedForm()?.requires_otp ? 'OTP-verified' : '';
      const combinedNotes = [phoneNote, otpNote, this.notes.trim()].filter(Boolean).join(' · ') || null;

      const ua     = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
      const device = this.deviceFromUa(ua);
      const pdfHash = await this.computeHash(
        `${draft.id}|${draft.consent_form_code}|${draft.consent_form_version}|${draft.rendered_body ?? ''}|${this.patientSig() ?? ''}|${this.relativeSig() ?? ''}`
      );

      const signed = await this.svc.sign({
        consentId:           draft.id,
        patientSignature:    this.patientSig(),
        relativeName:        this.relativeName.trim() || null,
        relativeRelation:    (this.relativeRelation || null) as any,
        relativeIdProof:     this.relativeIdProof.trim() || null,
        relativeSignature:   this.relativeSig(),
        witnessStaffId:      this.witnessStaffId() || null,
        doctorStaffId:       this.doctorStaffId(),
        notes:               combinedNotes,
        userAgent:           ua || null,
        device,
        pdfHash,
      });

      this.toast.success('Consent saved', `${this.selectedForm()?.title} signed and recorded.`);
      this.saved.emit({ consentId: signed.id });
      this.close();
    } catch (e: any) {
      this.formError.set(e?.message ?? 'Failed to save consent.');
    } finally {
      this.busy.set(false);
    }
  }

  protected close() { this.closed.emit(); }
  protected onBackdrop(_e: Event) { if (!this.busy()) this.close(); }

  // ── Lucide icon refs ───────────────────────────────────────
  protected readonly iconConsent = FileSignature;
  protected readonly iconClose   = X;
  protected readonly iconWarn    = AlertTriangle;
  protected readonly iconCheck   = Check;

  /** Derive a friendly device label from the user-agent string. */
  private deviceFromUa(ua: string): string {
    if (/iPad/.test(ua))    return 'iPad';
    if (/iPhone/.test(ua))  return 'iPhone';
    if (/Android/.test(ua)) return 'Android device';
    if (/Windows NT/.test(ua)) return 'Windows desktop';
    if (/Macintosh/.test(ua))  return 'Mac desktop';
    if (/Linux/.test(ua))      return 'Linux desktop';
    return 'Unknown device';
  }

  /** SHA-256 of a stable string using SubtleCrypto. Returns 'sha256:xxxxxxx…' or null on error. */
  private async computeHash(input: string): Promise<string | null> {
    try {
      if (typeof crypto === 'undefined' || !crypto.subtle) return null;
      const enc = new TextEncoder().encode(input);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return 'sha256:' + Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    } catch { return null; }
  }

  private labelForCategory(c: string): string {
    switch (c) {
      case 'surgical': return 'Surgical';
      case 'clinical': return 'Clinical';
      case 'admin':    return 'Administrative';
      case 'legal':    return 'Legal / Medico-legal';
      default:         return 'General';
    }
  }
}
