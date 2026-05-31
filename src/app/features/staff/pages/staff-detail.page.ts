import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { StaffService } from '../data/staff.service';
import type { StaffMember } from '../data/staff.types';
import { SignaturePadComponent } from '../../consent/components/signature-pad.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';

const ROLE_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  super_admin:  { bg: 'bg-danger-bg',      fg: 'text-danger-fg',   label: 'Super Admin' },
  branch_admin: { bg: 'bg-warn-bg',        fg: 'text-warn-fg',     label: 'Branch Admin' },
  doctor:       { bg: 'bg-good-bg',        fg: 'text-good-fg',     label: 'Doctor' },
  nurse:        { bg: 'bg-info-bg',        fg: 'text-info-fg',     label: 'Nurse' },
  reception:    { bg: 'bg-primary-50',     fg: 'text-primary-700', label: 'Reception' },
  lab_tech:     { bg: 'bg-primary-50',     fg: 'text-primary-700', label: 'Lab Tech' },
  pharmacist:   { bg: 'bg-primary-50',     fg: 'text-primary-700', label: 'Pharmacist' },
  accountant:   { bg: 'bg-surface-subtle', fg: 'text-ink-soft',    label: 'Accountant' },
  hr:           { bg: 'bg-surface-subtle', fg: 'text-ink-soft',    label: 'HR' },
  housekeeping: { bg: 'bg-surface-subtle', fg: 'text-ink-muted',   label: 'Housekeeping' },
  security:     { bg: 'bg-surface-subtle', fg: 'text-ink-muted',   label: 'Security' },
  fnb:          { bg: 'bg-surface-subtle', fg: 'text-ink-muted',   label: 'F&B' },
};

const AVATAR_PALETTE = [
  { bg: 'bg-primary-100', fg: 'text-primary-800' },
  { bg: 'bg-info-bg',     fg: 'text-info-fg' },
  { bg: 'bg-warn-bg',     fg: 'text-warn-fg' },
  { bg: 'bg-danger-bg',   fg: 'text-danger-fg' },
  { bg: 'bg-good-bg',     fg: 'text-good-fg' },
] as const;

function hashIndex(s: string, len: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % len;
}

@Component({
  selector: 'app-staff-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, SignaturePadComponent],
  template: `
    <!-- Back -->
    <div class="mb-5">
      <a routerLink="/staff" class="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
        Staff
      </a>
    </div>

    @if (loadError()) {
      <app-alert tone="danger" title="Could not load staff member">{{ loadError() }}</app-alert>
    } @else if (loading() && !member()) {
      <div class="py-20 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (member(); as m) {

      <!-- ── Profile header ──────────────────────────────────── -->
      <div class="bg-surface-card border border-border rounded-[10px] p-6 mb-4">
        <div class="flex items-start gap-5">
          <!-- Avatar -->
          <div [class]="avatarCls(m)">{{ initials(m) }}</div>

          <!-- Identity -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start gap-3 flex-wrap">
              <div>
                <h1 class="font-display text-[24px] font-medium tracking-[-0.02em] text-ink leading-tight">{{ m.full_name }}</h1>
                <div class="flex items-center gap-2 mt-1.5">
                  <span [class]="roleChipCls(m.role_slug)">{{ roleLabel(m.role_slug) }}</span>
                  @if (m.is_active) {
                    <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full bg-good-bg text-good-fg text-[10px] font-medium">
                      <span class="size-[5px] rounded-full bg-current"></span>Active
                    </span>
                  } @else {
                    <span class="inline-flex items-center h-[22px] px-2 rounded-full bg-surface-subtle text-ink-muted text-[10px] font-medium">Inactive</span>
                  }
                </div>
              </div>

              <!-- Actions (top right) -->
              <div class="ml-auto flex items-center gap-2 shrink-0 flex-wrap justify-end">
                @if (canWrite() && !editing()) {
                  <button type="button" (click)="startResetPassword(m)"
                          [disabled]="resettingPassword()"
                          class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    {{ resettingPassword() ? 'Resetting…' : 'Reset password' }}
                  </button>
                  <button type="button" (click)="startEdit(m)"
                          class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit profile
                  </button>
                  @if (m.id !== currentStaffId()) {
                    @if (toggling()) {
                      <span class="h-8 px-3 text-[12px] text-ink-muted">…</span>
                    } @else if (m.is_active) {
                      <button type="button" (click)="toggleActive(m)"
                              class="h-8 px-3 inline-flex items-center rounded-md border border-danger-border text-[12px] font-medium text-danger-fg hover:bg-danger-bg">
                        Deactivate
                      </button>
                    } @else {
                      <button type="button" (click)="toggleActive(m)"
                              class="h-8 px-3 inline-flex items-center rounded-md border border-border text-[12px] font-medium text-good-fg hover:bg-good-bg">
                        Reactivate
                      </button>
                    }
                  }
                }
              </div>
            </div>
          </div>
        </div>

        @if (actionError()) {
          <div class="mt-4">
            <app-alert tone="danger" title="Action failed">{{ actionError() }}</app-alert>
          </div>
        }
        @if (resetError()) {
          <div class="mt-4">
            <app-alert tone="danger" title="Reset failed">{{ resetError() }}</app-alert>
          </div>
        }
        @if (newPassword()) {
          <div class="mt-4 rounded-[10px] border border-good-border bg-good-bg p-4">
            <p class="text-[13px] font-semibold text-good-fg mb-1">Password reset!</p>
            <p class="text-[12px] text-good-fg mb-3">Share this new password with {{ m.full_name }}.</p>
            <div class="flex items-center gap-2 bg-white border border-good-border rounded-md px-3 py-2">
              <span class="flex-1 font-mono text-[14px] font-semibold text-ink tracking-wider select-all">{{ newPassword() }}</span>
              <button type="button" (click)="copyNewPassword()" title="Copy password"
                      class="shrink-0 h-7 px-2.5 rounded-md border border-border text-[11px] font-medium transition-colors"
                      [class]="pwCopied() ? 'bg-good-bg text-good-fg border-good-border' : 'bg-surface-muted text-ink-soft hover:bg-surface-subtle'">
                {{ pwCopied() ? 'Copied!' : 'Copy' }}
              </button>
              <button type="button" (click)="newPassword.set(null)" title="Dismiss"
                      class="shrink-0 size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        }
      </div>

      <!-- ── Info / Edit card ────────────────────────────────── -->
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <div class="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <p class="text-[13px] font-semibold text-ink">Profile details</p>
          @if (editing()) {
            <div class="flex items-center gap-2">
              <button type="button" (click)="cancelEdit()"
                      class="h-7 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle">
                Cancel
              </button>
              <button type="button" (click)="saveEdit(m)"
                      [disabled]="saving() || form.invalid"
                      class="h-7 px-3 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium disabled:opacity-50">
                {{ saving() ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          }
        </div>

        @if (saveError()) {
          <div class="px-5 pt-4">
            <app-alert tone="danger" title="Save failed">{{ saveError() }}</app-alert>
          </div>
        }

        <div class="divide-y divide-border">
          <!-- Full name -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Full name</span>
            @if (editing()) {
              <input [formControl]="form.controls.full_name" type="text"
                     class="flex-1 h-8 px-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            } @else {
              <span class="text-[13px] text-ink">{{ m.full_name }}</span>
            }
          </div>

          <!-- Email (read-only) -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Email</span>
            <span class="text-[13px] text-ink font-mono">{{ m.email }}</span>
          </div>

          <!-- Phone -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Phone</span>
            @if (editing()) {
              <input [formControl]="form.controls.phone" type="tel"
                     class="flex-1 h-8 px-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                     placeholder="+91 98765 43210" />
            } @else {
              <span class="text-[13px] {{ m.phone ? 'text-ink font-mono' : 'text-ink-muted' }}">{{ m.phone || '—' }}</span>
            }
          </div>

          <!-- Staff code (read-only) -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Staff code</span>
            <span class="text-[13px] text-ink font-mono">{{ m.staff_code }}</span>
          </div>

          <!-- Role (read-only) -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Role</span>
            <span [class]="roleChipCls(m.role_slug)">{{ roleLabel(m.role_slug) }}</span>
          </div>

          <!-- Branch / Head Office -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Branch / HO <span class="text-danger-fg">*</span></span>
            @if (editing()) {
              <div class="flex-1 min-w-0">
                <select [formControl]="form.controls.branch_id"
                        class="w-full h-8 px-2.5 text-[13px] bg-surface-card border rounded-md text-ink focus:outline-none focus:border-primary-600"
                        [class.border-danger-fg]="form.controls.branch_id.touched && form.controls.branch_id.invalid"
                        [class.border-border]="!(form.controls.branch_id.touched && form.controls.branch_id.invalid)">
                  <option value="" disabled>Select a branch…</option>
                  @for (b of editBranches(); track b.id) {
                    <option [value]="b.id">{{ b.name }} · {{ b.code }}</option>
                  }
                </select>
                @if (form.controls.branch_id.touched && form.controls.branch_id.invalid) {
                  <p class="mt-1 text-[11px] text-danger-fg">Branch / HO is required.</p>
                }
              </div>
            } @else if (m.branch; as b) {
              <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full bg-primary-50 text-primary-700 text-[11px] font-medium">
                {{ b.name }} <span class="opacity-70 font-mono ml-0.5">· {{ b.code }}</span>
              </span>
            } @else {
              <span class="text-[13px] text-warn-fg font-medium" title="No branch assigned — fix via Edit profile">⚠ not assigned</span>
            }
          </div>

          <!-- Department -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Department</span>
            @if (m.department; as d) {
              <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium text-white"
                    [style.background]="d.color || '#475569'">
                {{ d.name }} <span class="opacity-75 font-mono ml-0.5">· {{ d.code }}</span>
              </span>
            } @else {
              <span class="text-[13px] text-ink-muted">— not assigned —</span>
            }
          </div>

          <!-- Joined -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">Joined</span>
            <span class="text-[13px] text-ink">{{ joinedLabel(m.joined_at) }}</span>
          </div>

          <!-- User ID (read-only, for admins) -->
          <div class="px-5 py-3.5 flex items-start gap-4">
            <span class="w-36 shrink-0 text-[12px] text-ink-muted pt-0.5">User ID</span>
            <span class="text-[11px] text-ink-muted font-mono break-all">{{ m.user_id }}</span>
          </div>
        </div>

        <!-- ── Branch access (Pattern B: multi-branch grant for non-super-admins) ─── -->
        @if (canWrite() && m.role_slug !== 'super_admin') {
          <section class="bg-surface-card border border-border rounded-[10px] mt-4">
            <div class="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div>
                <p class="text-[13px] font-semibold text-ink">Branch access</p>
                <p class="text-[11px] text-ink-muted mt-0.5">
                  Branches this user can see and manage. Tick any branch to grant access; primary branch stays granted.
                  @if (m.role_slug === 'branch_admin' || m.role_slug === 'hr') {
                    <span class="text-warn-fg"> · They'll be able to read+write staff/data in every ticked branch.</span>
                  }
                </p>
              </div>
              @if (branchSaving()) {
                <span class="text-[11px] text-ink-muted">Saving…</span>
              }
            </div>
            <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-2">
              @for (b of allBranches(); track b.id) {
                <label class="flex items-center gap-2.5 px-3 py-2 border border-border rounded-md"
                       [class.bg-primary-50]="isPrimaryBranchOf(m, b)"
                       [class.border-primary-200]="isPrimaryBranchOf(m, b)"
                       [class.cursor-not-allowed]="isPrimaryBranchOf(m, b) || branchSaving()"
                       [class.cursor-pointer]="!isPrimaryBranchOf(m, b) && !branchSaving()"
                       [class.hover:bg-surface-muted]="!isPrimaryBranchOf(m, b) && !branchSaving()">
                  <input type="checkbox"
                         [checked]="isPrimaryBranchOf(m, b) || accessibleBranchIds().includes(b.id)"
                         [disabled]="isPrimaryBranchOf(m, b) || branchSaving()"
                         (change)="toggleBranch(m, b, $any($event.target).checked)"
                         class="size-4 accent-primary-600" />
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-medium text-ink truncate">{{ b.name }}</p>
                    <p class="text-[10px] font-mono text-ink-muted">{{ b.code }}</p>
                  </div>
                  @if (isPrimaryBranchOf(m, b)) {
                    <span class="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-800 text-[10px] font-semibold">Primary</span>
                  }
                </label>
              } @empty {
                <p class="col-span-2 text-[12px] text-ink-muted py-2">No branches available. Ask a super-admin to seed at least one.</p>
              }
            </div>
            @if (m.role_slug === 'doctor' || m.role_slug === 'lab_tech' || m.role_slug === 'reception' || m.role_slug === 'accountant' || m.role_slug === 'nurse' || m.role_slug === 'pharmacist') {
              <p class="px-5 pb-4 text-[11px] text-ink-muted">
                <strong>Note:</strong> For non-admin roles, the topbar branch selector is the operational scope.
                Adding extra branches here lets them switch the topbar to those branches; they still can't manage staff or branch settings.
              </p>
            }
          </section>
        }

        <!-- ── Digital signature (visible only for "self") ───────────── -->
        @if (m.id === currentStaffId()) {
          <div class="bg-surface-card border border-border rounded-[10px] mt-4 p-5">
            <header class="flex items-center justify-between mb-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Digital signature</p>
                <p class="text-[11px] text-ink-muted mt-0.5">
                  Captured once and embedded on every consent PDF, lab report and prescription you sign.
                </p>
              </div>
              @if (m.signature_data_url) {
                <span class="text-[10px] text-good-fg">✓ on file · updated {{ shortDate(m.signature_updated_at) }}</span>
              }
            </header>

            @if (m.signature_data_url && !editingSig()) {
              <div class="flex items-center gap-4">
                <img [src]="m.signature_data_url" alt="my signature"
                     class="max-h-[80px] max-w-[300px] border border-border rounded bg-white p-2" />
                <div class="flex flex-col gap-2">
                  <button type="button" (click)="editingSig.set(true)"
                          class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                    Replace
                  </button>
                  <button type="button" (click)="clearSignature()" [disabled]="savingSig()"
                          class="h-8 px-3 rounded-md border border-danger-border text-[12px] font-medium text-danger-fg hover:bg-danger-bg disabled:opacity-50">
                    Remove
                  </button>
                </div>
              </div>
            } @else {
              <app-signature-pad #sigPad label="Sign here"
                                 [width]="520" [height]="120"
                                 (changed)="capturedSig.set($event)"></app-signature-pad>
              <div class="mt-2 flex items-center justify-end gap-2">
                @if (m.signature_data_url) {
                  <button type="button" (click)="editingSig.set(false); capturedSig.set(null)"
                          class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                    Cancel
                  </button>
                }
                <button type="button" (click)="saveSignature()"
                        [disabled]="!capturedSig() || savingSig()"
                        class="h-8 px-3 rounded-md text-[12px] font-semibold text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50">
                  {{ savingSig() ? 'Saving…' : 'Save signature' }}
                </button>
              </div>
            }
          </div>
        }

      </div>
    }
  `,
})
export class StaffDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(StaffService);
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private supabase = inject(SupabaseService);

  // Phase: digital-signature capture (visible only on own profile)
  protected readonly editingSig  = signal(false);
  protected readonly capturedSig = signal<string | null>(null);
  protected readonly savingSig   = signal(false);

  protected async saveSignature(): Promise<void> {
    const dataUrl = this.capturedSig();
    if (!dataUrl) return;
    this.savingSig.set(true);
    try {
      const { data, error } = await (this.supabase.client as any)
        .rpc('staff_set_my_signature', { p_data_url: dataUrl });
      if (error) throw error;
      this.member.set(data as StaffMember);
      this.editingSig.set(false);
      this.capturedSig.set(null);
      this.toast.success('Signature saved', 'Will appear on every consent and report you sign.');
    } catch (e: any) {
      this.toast.error('Could not save', e?.message ?? 'Try again.');
    } finally { this.savingSig.set(false); }
  }

  protected async clearSignature(): Promise<void> {
    if (!confirm('Remove your saved signature? Future PDFs will fall back to a typed name.')) return;
    this.savingSig.set(true);
    try {
      const { data, error } = await (this.supabase.client as any)
        .rpc('staff_set_my_signature', { p_data_url: '' });
      if (error) throw error;
      this.member.set(data as StaffMember);
      this.toast.success('Signature removed');
    } catch (e: any) {
      this.toast.error('Could not remove', e?.message ?? 'Try again.');
    } finally { this.savingSig.set(false); }
  }

  protected shortDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return ''; }
  }

  protected readonly member = signal<StaffMember | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly toggling = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly resettingPassword = signal(false);
  protected readonly resetError = signal<string | null>(null);
  protected readonly newPassword = signal<string | null>(null);
  protected readonly pwCopied = signal(false);

  protected readonly canWrite = computed(() => this.auth.has('staff.write'));
  protected readonly currentStaffId = computed(() => this.auth.staffId());

  protected readonly branchStore = inject(BranchStore);
  /** Branches the editor can choose from. Sourced from BranchStore which is
   *  loaded by the app shell — falls back to a fetch in startEdit() if empty. */
  protected readonly editBranches = this.branchStore.branches;
  /** Same list, surfaced for the Branch-access checkbox grid. Aliased
   *  for template clarity. */
  protected readonly allBranches = this.branchStore.branches;

  /** Branch ids currently linked to this staff via `staff_branches` —
   *  drives the checked state of the Branch-access grid. */
  protected readonly accessibleBranchIds = signal<string[]>([]);
  protected readonly branchSaving = signal(false);

  protected readonly form = new FormGroup({
    full_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    phone:     new FormControl<string | null>(null),
    /** Required: every staff member must belong to a branch / HO. Editing it
     *  rewrites both `staff.primary_branch_id` and the `staff_branches` link
     *  so the rest of the app sees the change immediately. */
    branch_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading.set(true);
    try {
      this.member.set(await this.svc.getById(id));
      // Make sure the branch list is loaded for the Branch-access grid.
      if (this.branchStore.branches().length === 0) void this.branchStore.load();
      // Load current branch grants — drives the checkbox state.
      await this.loadBranchAccess(id);
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Could not load staff member');
    } finally {
      this.loading.set(false);
    }
  }

  /** Reload the set of branch grants from the server. */
  private async loadBranchAccess(staffId: string): Promise<void> {
    try { this.accessibleBranchIds.set(await this.svc.listStaffBranches(staffId)); }
    catch { this.accessibleBranchIds.set([]); }
  }

  /** True when `b` is the staff's primary branch — primary is always checked
   *  and disabled in the grid, so the user can't accidentally lock the
   *  staff out of their own home branch. */
  protected isPrimaryBranchOf(m: StaffMember, b: { id: string }): boolean {
    const primaryId = m.branch?.id ?? (m as any).primary_branch_id ?? null;
    return primaryId === b.id;
  }

  /** Grant or revoke a non-primary branch. Reverts the checkbox on error
   *  so the UI stays consistent with the server. */
  protected async toggleBranch(m: StaffMember, b: { id: string; name: string }, checked: boolean): Promise<void> {
    if (this.isPrimaryBranchOf(m, b)) return;  // primary is read-only here
    this.branchSaving.set(true);
    try {
      if (checked) {
        await this.svc.addStaffBranch(m.id, b.id);
        this.toast.success('Branch added', b.name);
      } else {
        await this.svc.removeStaffBranch(m.id, b.id);
        this.toast.success('Branch removed', b.name);
      }
      await this.loadBranchAccess(m.id);
    } catch (e: any) {
      this.toast.error('Could not update access', e?.message ?? '');
      // Refresh from server so the checkbox snaps back to truth
      await this.loadBranchAccess(m.id);
    } finally {
      this.branchSaving.set(false);
    }
  }

  protected startEdit(m: StaffMember) {
    this.form.setValue({
      full_name: m.full_name,
      phone:     m.phone ?? null,
      branch_id: m.branch?.id ?? (m as any).primary_branch_id ?? '',
    });
    this.saveError.set(null);
    this.editing.set(true);
    // Lazy-load the branches list if the app shell hasn't populated it yet
    // (e.g. deep-link straight to /staff/:id without visiting the dashboard).
    if (this.branchStore.branches().length === 0) void this.branchStore.load();
  }

  protected cancelEdit() {
    this.editing.set(false);
    this.saveError.set(null);
  }

  protected async saveEdit(m: StaffMember) {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const newBranchId = this.form.value.branch_id!;
      const branchChanged = newBranchId !== (m.branch?.id ?? (m as any).primary_branch_id ?? '');
      const updated = await this.svc.update(m.id, {
        full_name:         this.form.value.full_name!,
        phone:             this.form.value.phone || null,
        primary_branch_id: newBranchId,
      });
      // When branch changes we also have to rewrite the staff_branches link
      // table so RLS / branch-scoped queries see the new home immediately.
      if (branchChanged) await this.svc.setPrimaryBranch(m.id, newBranchId);
      this.member.set(updated);
      this.editing.set(false);
      this.toast.success('Profile saved', branchChanged ? 'Branch updated' : 'Changes saved');
    } catch (e) {
      this.saveError.set(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggleActive(m: StaffMember) {
    const label = m.is_active ? 'deactivate' : 'reactivate';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${m.full_name}?`)) return;
    this.toggling.set(true);
    this.actionError.set(null);
    try {
      await this.svc.setActive(m.id, !m.is_active);
      this.member.set({ ...m, is_active: !m.is_active });
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : `Failed to ${label}`);
    } finally {
      this.toggling.set(false);
    }
  }

  protected async startResetPassword(m: StaffMember) {
    if (!confirm(`Reset password for ${m.full_name}? A new temporary password will be generated.`)) return;
    this.resettingPassword.set(true);
    this.resetError.set(null);
    this.newPassword.set(null);
    try {
      const pwd = await this.svc.resetPassword(m.id);
      this.newPassword.set(pwd);
    } catch (e) {
      this.resetError.set(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      this.resettingPassword.set(false);
    }
  }

  protected copyNewPassword(): void {
    const pwd = this.newPassword();
    if (!pwd) return;
    navigator.clipboard.writeText(pwd).then(() => {
      this.pwCopied.set(true);
      setTimeout(() => this.pwCopied.set(false), 2000);
    });
  }

  protected initials(m: StaffMember): string {
    return m.full_name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
  }

  protected avatarCls(m: StaffMember): string {
    const p = AVATAR_PALETTE[hashIndex(m.id, AVATAR_PALETTE.length)]!;
    return `shrink-0 grid place-items-center size-14 rounded-full font-display font-semibold text-[20px] ${p.bg} ${p.fg}`;
  }

  protected roleChipCls(role: string): string {
    const chip = ROLE_CHIP[role] ?? { bg: 'bg-surface-subtle', fg: 'text-ink-muted' };
    return `inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-medium ${chip.bg} ${chip.fg}`;
  }

  protected roleLabel(role: string): string {
    return ROLE_CHIP[role]?.label ?? role;
  }

  protected joinedLabel(iso: string | null): string {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'd MMMM yyyy'); } catch { return '—'; }
  }
}
