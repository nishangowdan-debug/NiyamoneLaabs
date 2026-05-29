import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { format, parseISO } from 'date-fns';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { BranchContextService } from '../../../core/branches/branch-context.service';
import { StaffStore } from '../data/staff.store';
import { StaffService } from '../data/staff.service';
import type { StaffMember } from '../data/staff.types';
import { ExportMenuComponent } from '../../../shared/export/export-menu.component';
import { ExportService } from '../../../shared/export/export.service';
import type { ExportableReport, ExportColumn, ExportFormat } from '../../../shared/export/export.types';

interface StaffExportRow {
  staff_code: string;
  full_name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  joined_at: string;
  is_active: string;
}

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

function hashIndex(input: string, len: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h) % len;
}

const ROLE_OPTIONS = [
  { value: 'all',          label: 'All roles' },
  { value: 'doctor',       label: 'Doctor' },
  { value: 'nurse',        label: 'Nurse' },
  { value: 'reception',    label: 'Reception' },
  { value: 'lab_tech',     label: 'Lab Tech' },
  { value: 'pharmacist',   label: 'Pharmacist' },
  { value: 'accountant',   label: 'Accountant' },
  { value: 'hr',           label: 'HR' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'security',     label: 'Security' },
  { value: 'fnb',          label: 'F&B' },
  { value: 'branch_admin', label: 'Branch Admin' },
  { value: 'super_admin',  label: 'Super Admin' },
];

@Component({
  selector: 'app-staff-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ExportMenuComponent],
  template: `
    <!-- ── Page head ─────────────────────────────────────────── -->
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Staff</h1>
        <p class="text-[13px] text-ink-muted mt-1 flex items-center gap-1.5 flex-wrap">
          <span>{{ store.total().toLocaleString('en-IN') }} member{{ store.total() !== 1 ? 's' : '' }}</span>
          @if (branchStore.activeBranchId() === null) {
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[11px] font-medium">🌐 network view</span>
          } @else {
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-good-bg text-good-fg text-[11px] font-medium">{{ branchStore.activeBranchName() }}</span>
          }
          <span>· manage roles, access, and profiles</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <app-export-menu [disabled]="store.total() === 0 || exporting()" (pick)="onExport($event)"/>
        @if (canWrite()) {
          <button type="button" (click)="openInvitePanel()"
                  class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Invite staff
          </button>
        }
      </div>
    </header>

    <!-- ── Filter bar ────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
      <div class="relative flex-1 min-w-[220px]">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" [formControl]="searchCtrl"
               placeholder="Search by name, email, staff code, or phone…"
               class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
      </div>

      <span class="w-px h-5 bg-border mx-1"></span>

      <select [value]="store.filters().role" (change)="onRoleChange($any($event.target).value)"
              class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
              [style.background-image]="chevronUrl" style="background-position: right 8px center;">
        @for (opt of roleOptions; track opt.value) {
          <option [value]="opt.value">{{ opt.label }}</option>
        }
      </select>

      <div class="flex items-center gap-1">
        @for (s of statusOptions; track s.value) {
          <button type="button" (click)="onStatusChange(s.value)" [class]="statusPillCls(s.value)">
            {{ s.label }}
          </button>
        }
      </div>

      <span class="ml-auto text-[11px] text-ink-muted font-mono pr-1">
        {{ rangeText() }} of {{ store.total().toLocaleString('en-IN') }}
      </span>
    </div>

    @if (store.error()) {
      <div class="mb-4"><app-alert tone="danger" title="Could not load staff">{{ store.error() }}</app-alert></div>
    }
    @if (actionError()) {
      <div class="mb-4"><app-alert tone="danger" title="Action failed">{{ actionError() }}</app-alert></div>
    }

    <!-- ── Table ──────────────────────────────────────────────── -->
    <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-muted">
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Staff member</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Role</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Branch / HO</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Department</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Staff code</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Phone</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Joined</th>
            <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          @if (store.loading() && store.members().length === 0) {
            @for (i of skeletonRows; track i) {
              <tr class="border-b border-border last:border-b-0">
                <td class="px-4 py-3"><span class="block w-44 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-20 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-24 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-16 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-24 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-20 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"><span class="block w-14 h-3 bg-surface-subtle rounded animate-pulse"></span></td>
                <td class="px-4 py-3"></td>
              </tr>
            }
          } @else {
            @for (m of store.members(); track m.id) {
              <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2.5">
                    <div [class]="avatarCls(m)">{{ initials(m) }}</div>
                    <div class="min-w-0">
                      <a [routerLink]="['/staff', m.id]" class="block text-[13px] font-medium text-ink hover:text-primary-700 truncate max-w-[220px]">
                        {{ m.full_name }}
                      </a>
                      <small class="block text-[11px] text-ink-muted mt-0.5">{{ m.email }}</small>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-2.5">
                  <span [class]="roleChipCls(m.role_slug)">{{ roleLabel(m.role_slug) }}</span>
                </td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                  @if (m.branch; as b) {
                    <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full bg-primary-50 text-primary-700 text-[10px] font-medium" [title]="b.name">
                      <span class="font-mono">{{ b.code }}</span>
                      <span class="text-primary-800/70 truncate max-w-[120px]">· {{ shortBranchName(b.name) }}</span>
                    </span>
                  } @else {
                    <span class="text-[11px] text-warn-fg font-medium" title="No branch assigned — please edit this user">⚠ unassigned</span>
                  }
                </td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                  @if (m.department; as d) {
                    <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[10px] font-medium text-white"
                          [style.background]="d.color || '#475569'" [title]="d.code">
                      {{ d.name }}
                    </span>
                  } @else {
                    <span class="text-[11px] text-ink-muted">—</span>
                  }
                </td>
                <td class="px-4 py-2.5 font-mono text-[12px] text-ink-soft whitespace-nowrap">{{ m.staff_code }}</td>
                <td class="px-4 py-2.5 text-[13px] text-ink-soft whitespace-nowrap">{{ m.phone || '—' }}</td>
                <td class="px-4 py-2.5 text-[13px] text-ink-soft whitespace-nowrap">{{ joinedLabel(m.joined_at) }}</td>
                <td class="px-4 py-2.5">
                  @if (m.is_active) {
                    <span class="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full bg-good-bg text-good-fg text-[10px] font-medium">
                      <span class="size-[5px] rounded-full bg-current"></span>Active
                    </span>
                  } @else {
                    <span class="inline-flex items-center h-[22px] px-2 rounded-full bg-surface-subtle text-ink-muted text-[10px] font-medium">Inactive</span>
                  }
                </td>
                <td class="px-4 py-2.5 text-right whitespace-nowrap">
                  <div class="flex items-center justify-end gap-1.5">
                    <a [routerLink]="['/staff', m.id]"
                       class="h-[26px] px-2.5 inline-flex items-center rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                      View
                    </a>
                    @if (canWrite() && m.id !== currentStaffId()) {
                      @if (toggling() === m.id) {
                        <span class="h-[26px] px-2.5 inline-flex items-center rounded-md border border-border text-[12px] text-ink-muted">…</span>
                      } @else if (m.is_active) {
                        <button type="button" (click)="toggleActive(m)"
                                class="h-[26px] px-2.5 inline-flex items-center rounded-md border border-border text-[12px] font-medium text-danger-fg hover:bg-danger-bg">
                          Deactivate
                        </button>
                      } @else {
                        <button type="button" (click)="toggleActive(m)"
                                class="h-[26px] px-2.5 inline-flex items-center rounded-md border border-border text-[12px] font-medium text-good-fg hover:bg-good-bg">
                          Reactivate
                        </button>
                      }
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="px-4 py-16 text-center">
                  <p class="text-[13px] text-ink-soft">No staff members match your filters.</p>
                  @if (canWrite()) {
                    <button type="button" (click)="openInvitePanel()"
                            class="inline-block mt-3 text-[13px] text-primary-600 hover:underline font-medium">
                      Invite the first staff member →
                    </button>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <!-- ── Pagination ─────────────────────────────────────────── -->
    @if (store.total() > 0) {
      <nav class="mt-4 flex items-center justify-between text-[12px] text-ink-muted">
        <div class="font-mono">{{ rangeText() }} of {{ store.total().toLocaleString('en-IN') }}</div>
        <div class="flex items-center gap-1">
          <button type="button" [disabled]="store.filters().page <= 0" (click)="store.goToPage(store.filters().page - 1)"
                  class="h-8 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed">← Previous</button>
          <span class="h-8 px-3 grid place-items-center text-ink-muted font-mono">
            {{ store.filters().page + 1 }} / {{ totalPages() }}
          </span>
          <button type="button" [disabled]="store.filters().page + 1 >= totalPages()" (click)="store.goToPage(store.filters().page + 1)"
                  class="h-8 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed">Next →</button>
        </div>
      </nav>
    }

    <!-- ── Invite panel ───────────────────────────────────────── -->
    @if (showInvitePanel()) {
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/30 z-40" (document:keydown.escape)="closeInvitePanel()"></div>

      <!-- Slide-in drawer -->
      <aside class="fixed right-0 top-0 h-full w-[420px] bg-surface-card border-l border-border z-50 flex flex-col shadow-2xl">

        <!-- Panel header -->
        <div class="px-5 py-4 border-b border-border flex items-start gap-3">
          <div class="flex-1">
            <h2 class="text-[15px] font-semibold text-ink">Add staff member</h2>
            <p class="text-[12px] text-ink-muted mt-0.5">A login account is created instantly. Share the generated password with the staff member.</p>
          </div>
          <button type="button" (click)="closeInvitePanel()"
                  class="size-7 grid place-items-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Panel body -->
        <div class="flex-1 overflow-y-auto p-5">
          @if (inviteError()) {
            <div class="mb-4">
              <app-alert tone="danger" title="Create failed">{{ inviteError() }}</app-alert>
            </div>
          }

          @if (inviteSuccess() && generatedPassword()) {
            <!-- Password reveal card — stays open until admin closes -->
            <div class="rounded-[10px] border border-good-border bg-good-bg p-4 mb-4">
              <p class="text-[13px] font-semibold text-good-fg mb-1">Staff account created!</p>
              <p class="text-[12px] text-good-fg mb-3">Share this temporary password with the staff member. They can change it after first login.</p>
              <div class="flex items-center gap-2 bg-white border border-good-border rounded-md px-3 py-2">
                <span class="flex-1 font-mono text-[14px] font-semibold text-ink tracking-wider select-all">{{ generatedPassword() }}</span>
                <button type="button" (click)="copyPassword()" title="Copy password"
                        class="shrink-0 h-7 px-2.5 rounded-md border border-border text-[11px] font-medium transition-colors"
                        [class]="copied() ? 'bg-good-bg text-good-fg border-good-border' : 'bg-surface-muted text-ink-soft hover:bg-surface-subtle'">
                  {{ copied() ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>
          }

          @if (!inviteSuccess()) {
          <form [formGroup]="inviteForm" (ngSubmit)="submitInvite()" class="space-y-4">

            <!-- Full name -->
            <div>
              <label class="block text-[12px] font-medium text-ink-soft mb-1.5">
                Full name <span class="text-danger-fg">*</span>
              </label>
              <input formControlName="full_name" type="text" placeholder="Dr. Arjun Kumar" autocomplete="off"
                     class="w-full h-9 px-3 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              @if (inviteForm.controls.full_name.touched && inviteForm.controls.full_name.invalid) {
                <p class="mt-1 text-[11px] text-danger-fg">Full name is required (min 2 characters).</p>
              }
            </div>

            <!-- Email -->
            <div>
              <label class="block text-[12px] font-medium text-ink-soft mb-1.5">
                Email address <span class="text-danger-fg">*</span>
              </label>
              <input formControlName="email" type="email" placeholder="doctor@srinivasa.hospital" autocomplete="off"
                     class="w-full h-9 px-3 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              @if (inviteForm.controls.email.touched && inviteForm.controls.email.invalid) {
                <p class="mt-1 text-[11px] text-danger-fg">A valid email address is required.</p>
              }
            </div>

            <!-- Branch / Head Office (required) -->
            <div>
              <label class="block text-[12px] font-medium text-ink-soft mb-1.5">
                Branch / Head Office <span class="text-danger-fg">*</span>
              </label>
              <select formControlName="branch_id"
                      class="w-full h-9 px-3 pr-8 text-[13px] bg-surface-muted border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [class.border-danger-fg]="inviteForm.controls.branch_id.touched && inviteForm.controls.branch_id.invalid"
                      [class.border-border]="!(inviteForm.controls.branch_id.touched && inviteForm.controls.branch_id.invalid)"
                      [style.background-image]="chevronUrl" style="background-position: right 10px center;">
                <option value="" disabled>Select branch or HO…</option>
                @for (b of inviteBranches(); track b.id) {
                  <option [value]="b.id">{{ b.name }} ({{ b.code }})</option>
                }
              </select>
              @if (inviteForm.controls.branch_id.touched && inviteForm.controls.branch_id.invalid) {
                <p class="mt-1 text-[11px] text-danger-fg">Branch / HO is required.</p>
              }
            </div>

            <!-- Role -->
            <div>
              <label class="block text-[12px] font-medium text-ink-soft mb-1.5">
                Role <span class="text-danger-fg">*</span>
              </label>
              <select formControlName="role_slug"
                      class="w-full h-9 px-3 pr-8 text-[13px] bg-surface-muted border border-border rounded-md text-ink cursor-pointer appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 10px center;">
                <option value="" disabled>Select a role…</option>
                @for (opt of inviteRoleOptions; track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
              @if (inviteForm.controls.role_slug.touched && inviteForm.controls.role_slug.invalid) {
                <p class="mt-1 text-[11px] text-danger-fg">Please select a role.</p>
              }
            </div>

            <!-- Phone -->
            <div>
              <label class="block text-[12px] font-medium text-ink-soft mb-1.5">
                Phone <span class="text-[11px] text-ink-muted font-normal">(optional)</span>
              </label>
              <input formControlName="phone" type="tel" placeholder="+91 98765 43210"
                     class="w-full h-9 px-3 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>

            <!-- Joining date -->
            <div>
              <label class="block text-[12px] font-medium text-ink-soft mb-1.5">
                Joining date <span class="text-[11px] text-ink-muted font-normal">(optional, defaults to today)</span>
              </label>
              <input formControlName="joined_at" type="date"
                     class="w-full h-9 px-3 text-[13px] bg-surface-muted border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </div>

            <!-- Role description hint -->
            @if (selectedRoleHint()) {
              <div class="rounded-[8px] bg-surface-muted border border-border px-3 py-2.5 text-[12px] text-ink-muted">
                {{ selectedRoleHint() }}
              </div>
            }

          </form>
          } <!-- end @if (!inviteSuccess()) -->
        </div>

        <!-- Panel footer -->
        <div class="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          @if (inviteSuccess()) {
            <button type="button" (click)="closeInvitePanel()"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium">
              Done
            </button>
          } @else {
            <button type="button" (click)="closeInvitePanel()" [disabled]="inviting()"
                    class="h-9 px-4 rounded-md border border-border text-[13px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              Cancel
            </button>
            <button type="button" (click)="submitInvite()"
                    [disabled]="inviting() || inviteForm.invalid"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-medium disabled:opacity-50">
              {{ inviting() ? 'Creating…' : 'Create staff' }}
            </button>
          }
        </div>
      </aside>
    }
  `,
})
export class StaffListPage implements OnInit, OnDestroy {
  protected readonly store = inject(StaffStore);
  protected readonly svc = inject(StaffService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private   readonly branchGuard = inject(BranchContextService);
  private exportSvc = inject(ExportService);
  private destroyRef = inject(DestroyRef);

  protected readonly exporting = signal(false);

  /** Push the active branch into staff filters so the list scopes to it. */
  private readonly _branchSync = effect(() => {
    const id = this.branchStore.activeBranchId();
    // setFilters triggers a load(); page resets to 0 inside store.
    // Wrap in untracked() — setFilters reads the filters signal, and writing
    // to it inside a tracked effect creates an infinite loop.
    untracked(() => this.store.setFilters({ branchId: id }));
  });

  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  protected readonly canWrite = computed(() => this.auth.has('staff.write'));
  protected readonly currentStaffId = computed(() => this.auth.staffId());
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  protected readonly toggling = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly inviteRoleOptions = ROLE_OPTIONS.filter((o) => o.value !== 'all');
  protected readonly statusOptions: { value: 'all' | 'active' | 'inactive'; label: string }[] = [
    { value: 'all',      label: 'All' },
    { value: 'active',   label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.store.total() / this.store.filters().pageSize)),
  );
  protected readonly rangeText = computed(() => {
    const f = this.store.filters();
    const total = this.store.total();
    if (total === 0) return '0';
    const from = f.page * f.pageSize + 1;
    const to = Math.min(total, (f.page + 1) * f.pageSize);
    return `${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')}`;
  });

  // ── Invite panel ────────────────────────────────────────────
  protected readonly showInvitePanel = signal(false);
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly inviteSuccess = signal(false);
  protected readonly generatedPassword = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly inviteForm = new FormGroup({
    full_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    email:     new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    branch_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    role_slug: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    phone:     new FormControl<string | null>(null),
    joined_at: new FormControl<string | null>(null),
  });

  /** Branches available in the invite-staff dropdown. Sourced from
   *  BranchStore (already role-scoped on load). */
  protected readonly inviteBranches = this.branchStore.branches;

  private static readonly ROLE_HINTS: Record<string, string> = {
    doctor:       'Access: patients, appointments, OPD queue, consultations, lab orders, prescriptions, billing.',
    nurse:        'Access: patients, OPD queue, IPD beds, pharmacy, food service, concierge.',
    reception:    'Access: patients, appointments, OPD queue, IPD beds, billing, concierge.',
    lab_tech:     'Access: patients, lab module, reports.',
    pharmacist:   'Access: patients, pharmacy, inventory, materials.',
    accountant:   'Access: billing, purchase, vendor bills, debit notes, vendors, materials, reports.',
    hr:           'Access: staff management, reports.',
    housekeeping: 'Access: IPD beds, concierge.',
    security:     'Access: staff list, concierge.',
    fnb:          'Access: food service, IPD beds.',
    branch_admin: 'Full branch access — all modules except cross-branch settings.',
    super_admin:  'Full system access across all branches.',
  };

  protected readonly selectedRoleHint = computed(() => {
    const role = this.inviteForm.controls.role_slug.value;
    return StaffListPage.ROLE_HINTS[role] ?? null;
  });

  private unsubscribe: (() => void) | null = null;

  ngOnInit(): void {
    this.searchCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.store.setFilters({ search: term ?? '' }));

    // Explicit initial load so the page never appears blank under zoneless CD.
    this.store.setFilters({ branchId: this.branchStore.activeBranchId() });
    this.unsubscribe = this.svc.subscribe(() => void this.store.load());
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  // ── Filters ─────────────────────────────────────────────────
  protected onRoleChange(role: string) { this.store.setFilters({ role }); }
  protected onStatusChange(status: 'all' | 'active' | 'inactive') { this.store.setFilters({ status }); }

  protected statusPillCls(value: string): string {
    const active = this.store.filters().status === value;
    const base = 'h-7 px-3 rounded-md text-[12px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-muted text-ink-soft hover:bg-surface-subtle`;
  }

  // ── Deactivate / Reactivate ──────────────────────────────────
  protected async toggleActive(m: StaffMember) {
    const label = m.is_active ? 'deactivate' : 'reactivate';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${m.full_name}?`)) return;
    this.toggling.set(m.id);
    this.actionError.set(null);
    try {
      await this.svc.setActive(m.id, !m.is_active);
      await this.store.load();
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : `Failed to ${label}`);
    } finally {
      this.toggling.set(null);
    }
  }

  // ── Invite panel ─────────────────────────────────────────────
  protected async openInvitePanel() {
    // Branch context guard: force a target branch before the form opens so
    // a super admin in "All hospitals" mode can't accidentally land a new
    // staff record under the wrong branch and leak via RBAC scope later.
    const branchId = await this.branchGuard.require('Invite staff');
    if (!branchId) return;
    this.inviteForm.reset({ full_name: '', email: '', branch_id: branchId, role_slug: '', phone: null, joined_at: null });
    this.inviteError.set(null);
    this.inviteSuccess.set(false);
    this.generatedPassword.set(null);
    this.copied.set(false);
    this.showInvitePanel.set(true);
  }

  protected closeInvitePanel() {
    if (this.inviting()) return;
    this.showInvitePanel.set(false);
  }

  protected async submitInvite() {
    this.inviteForm.markAllAsTouched();
    if (this.inviteForm.invalid || this.inviting()) return;
    this.inviting.set(true);
    this.inviteError.set(null);
    this.inviteSuccess.set(false);
    this.generatedPassword.set(null);
    try {
      const result = await this.svc.createStaff({
        full_name:         this.inviteForm.value.full_name!,
        email:             this.inviteForm.value.email!,
        role_slug:         this.inviteForm.value.role_slug!,
        primary_branch_id: this.inviteForm.value.branch_id!,
        phone:             this.inviteForm.value.phone || null,
        joined_at:         this.inviteForm.value.joined_at || null,
      });
      this.generatedPassword.set(result.password);
      this.inviteSuccess.set(true);
      await this.store.load();
      // Panel stays open so admin can copy and share the password
    } catch (e) {
      this.inviteError.set(e instanceof Error ? e.message : 'Failed to create staff. Please try again.');
    } finally {
      this.inviting.set(false);
    }
  }

  protected copyPassword(): void {
    const pwd = this.generatedPassword();
    if (!pwd) return;
    navigator.clipboard.writeText(pwd).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  // ── Display helpers ──────────────────────────────────────────
  protected initials(m: StaffMember): string {
    return m.full_name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
  }
  protected avatarCls(m: StaffMember): string {
    const p = AVATAR_PALETTE[hashIndex(m.id, AVATAR_PALETTE.length)]!;
    return `shrink-0 grid place-items-center size-8 rounded-full font-display font-semibold text-[12px] ${p.bg} ${p.fg}`;
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
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return '—'; }
  }

  /** Strip the brand prefix from a branch name so the table column stays
   *  compact — "Sree Diagnostics — Bengaluru" → "Bengaluru". Falls back to
   *  the full name when no separator is present. */
  protected shortBranchName(name: string | null | undefined): string {
    if (!name) return '';
    const sep = name.split(/—|–|-/);
    return (sep.length > 1 ? sep[sep.length - 1] : name).trim();
  }

  protected async onExport(fmt: ExportFormat): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const filters = { ...this.store.filters(), page: 0, pageSize: 5000 };
      const { rows } = await this.svc.list(filters);

      const exportRows: StaffExportRow[] = rows.map(s => ({
        staff_code: s.staff_code,
        full_name:  s.full_name,
        role:       this.roleLabel(s.role_slug),
        department: (s as any).department?.name ?? '',
        email:      s.email,
        phone:      s.phone ?? '',
        joined_at:  s.joined_at ?? '',
        is_active:  s.is_active ? 'Active' : 'Inactive',
      }));

      const columns: ExportColumn<StaffExportRow>[] = [
        { key: 'staff_code', header: 'Staff Code', width: 14, align: 'left' },
        { key: 'full_name',  header: 'Name',       width: 26, align: 'left' },
        { key: 'role',       header: 'Role',       width: 14, align: 'left' },
        { key: 'department', header: 'Department', width: 22, align: 'left' },
        { key: 'email',      header: 'Email',      width: 28, align: 'left' },
        { key: 'phone',      header: 'Phone',      width: 14, align: 'left' },
        { key: 'joined_at',  header: 'Joined',     width: 12, align: 'center', format: 'date' },
        { key: 'is_active',  header: 'Status',     width: 10, align: 'center' },
      ];

      const f = this.store.filters();
      const filters_meta: { label: string; value: string }[] = [{ label: 'Total', value: String(rows.length) }];
      if (f.search) filters_meta.push({ label: 'Search', value: f.search });
      if (f.role && f.role !== 'all') filters_meta.push({ label: 'Role', value: this.roleLabel(f.role) });
      if (f.status && f.status !== 'all') filters_meta.push({ label: 'Status', value: f.status });

      const report: ExportableReport<StaffExportRow> = {
        filename: `Staff_${this.branchStore.activeBranchName().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
        title: 'Staff Roster',
        subtitle: `${rows.length} member${rows.length === 1 ? '' : 's'}`,
        meta: { filters: filters_meta },
        columns,
        rows: exportRows,
        footer: 'Sree Diagnostics · Staff Roster',
      };

      await this.exportSvc.export(fmt, report);
    } finally {
      this.exporting.set(false);
    }
  }
}
