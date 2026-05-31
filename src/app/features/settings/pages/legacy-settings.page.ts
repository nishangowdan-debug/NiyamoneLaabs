import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
// @ts-ignore — pure-JS, has default export
import QRCode from 'qrcode-svg';

import { AlertComponent } from '../../../shared/ui/alert/alert.component';
import { AuthStore } from '../../../core/auth/auth.store';
import { BranchStore } from '../../../core/branches/branch.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SettingsService } from '../data/settings.service';
import { SettingsStore } from '../data/settings.store';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  BranchAddress,
  SERVICE_CATEGORY_OPTIONS,
  Service,
  SettingsTab,
} from '../data/settings.types';
import type { ServiceCategory } from '../../../core/supabase/supabase.types';

@Component({
  selector: 'app-legacy-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AlertComponent],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Settings</h1>
        <p class="text-[13px] text-ink-muted mt-1">Lab profile · roles &amp; permissions · digital signatures · demo data</p>
      </div>
      @if (store.branches().length > 1) {
        <label class="inline-flex items-center gap-2">
          <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Branch</span>
          <select [ngModel]="store.selectedBranchId()" (ngModelChange)="onBranchChange($event)" name="branch"
                  class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                  [style.background-image]="chevronUrl" style="background-position: right 8px center;">
            @for (b of store.branches(); track b.id) {
              <option [ngValue]="b.id">{{ b.code }} · {{ b.name }}</option>
            }
          </select>
        </label>
      }
    </header>

    <!-- ── Tab toggle ───────────────────────────────────────── -->
    <div class="flex items-center gap-1 mb-5 border-b border-border">
      @for (t of tabs; track t.value) {
        <button type="button" (click)="setTab(t.value)" [class]="tabBtnCls(t.value)">{{ t.label }}</button>
      }
    </div>

    @if (store.error()) {
      <div class="mb-4">
        <app-alert tone="danger" title="Could not load">{{ store.error() }}</app-alert>
      </div>
    }

    @if (store.loading() && store.branches().length === 0) {
      <div class="bg-surface-card border border-border rounded-[10px] py-16 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (store.selectedBranch(); as branch) {

      <!-- ─────────────── Hospital info tab ─────────────── -->
      @if (tab() === 'hospital') {
        <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="px-5 py-3 border-b border-border">
            <h2 class="text-[14px] font-medium text-ink">Lab identity &amp; tax</h2>
            <p class="text-[11px] text-ink-muted mt-0.5">Used on lab reports, invoices, and signed PDFs.</p>
          </header>

          <div class="grid grid-cols-12 gap-3 p-5">
            <label class="col-span-6 md:col-span-3 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Branch code</span>
              <input type="text" [value]="branch.code" disabled
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-muted border border-border rounded-md text-ink-muted" />
            </label>
            <label class="col-span-6 md:col-span-9 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Internal branch name *</span>
              <input type="text" [(ngModel)]="hf_name" name="hf_n"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <!-- Invoice / prescription display name — the name that appears on printed documents -->
            <div class="col-span-12 rounded-[10px] border border-primary-200 bg-primary-50 px-4 py-3">
              <label class="block">
                <span class="block text-[12px] font-semibold text-primary-800 mb-0.5">
                  Lab name on invoices &amp; reports
                </span>
                <span class="block text-[11px] text-primary-700 mb-2">
                  This is what prints at the top of every invoice, lab report, and PDF. Leave blank to use the branch name above.
                </span>
                <input type="text" [(ngModel)]="hf_rxHeader" name="hf_rxh"
                       placeholder="e.g. Sree Diagnostics"
                       class="w-full h-9 px-2.5 text-[13px] bg-white border border-primary-300 rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
              </label>
            </div>

            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Tagline</span>
              <input type="text" [(ngModel)]="hf_tagline" name="hf_t" placeholder="Compassionate care since 1987"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">GSTIN</span>
              <input type="text" [(ngModel)]="hf_gstin" name="hf_g" placeholder="33AAAAA0000A1Z5"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Tax state</span>
              <input type="text" [(ngModel)]="hf_taxState" name="hf_ts" placeholder="TN"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Registration #</span>
              <input type="text" [(ngModel)]="hf_regNo" name="hf_rg" placeholder="NABH / govt regn"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Phone</span>
              <input type="tel" [(ngModel)]="hf_phone" name="hf_p"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email</span>
              <input type="email" [(ngModel)]="hf_email" name="hf_e"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Website</span>
              <input type="url" [(ngModel)]="hf_website" name="hf_w" placeholder="https://"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <div class="col-span-12">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Logo</span>
              <div class="flex items-start gap-3">
                <!-- Thumbnail / placeholder -->
                @if (hf_logoUrl) {
                  <img [src]="hf_logoUrl" alt="Branch logo"
                       class="h-14 w-14 object-contain rounded border border-border bg-surface-muted flex-shrink-0" />
                } @else {
                  <div class="h-14 w-14 rounded border border-dashed border-border bg-surface-muted flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-ink-muted">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                    </svg>
                  </div>
                }
                <!-- Actions -->
                <div class="flex-1 min-w-0">
                  @if (canEditHospital()) {
                    <label class="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle cursor-pointer"
                           [class.opacity-50]="logoUploading()" [class.pointer-events-none]="logoUploading()">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                             class="sr-only" (change)="onLogoFileChange($event)" [disabled]="logoUploading()" />
                      {{ logoUploading() ? 'Uploading…' : 'Upload image' }}
                    </label>
                    <p class="text-[10px] text-ink-muted mt-1">PNG, JPG, SVG, WebP · max 500 KB · saved immediately, then click Save to persist the URL</p>
                  }
                  @if (hf_logoUrl) {
                    <p class="text-[10px] text-ink-muted mt-1.5 font-mono truncate max-w-xs">{{ hf_logoUrl }}</p>
                  }
                </div>
              </div>
            </div>
          </div>

          <header class="px-5 py-3 border-y border-border bg-surface-muted">
            <h2 class="text-[14px] font-medium text-ink">Address</h2>
          </header>
          <div class="grid grid-cols-12 gap-3 p-5">
            <label class="col-span-12 md:col-span-7 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Line 1</span>
              <input type="text" [(ngModel)]="hf_addr_line1" name="hf_a1"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-5 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Line 2</span>
              <input type="text" [(ngModel)]="hf_addr_line2" name="hf_a2"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">City</span>
              <input type="text" [(ngModel)]="hf_addr_city" name="hf_ac"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">State</span>
              <input type="text" [(ngModel)]="hf_addr_state" name="hf_as"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-2 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Pincode</span>
              <input type="text" [(ngModel)]="hf_addr_pin" name="hf_ap" maxlength="6"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-2 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Country</span>
              <input type="text" [(ngModel)]="hf_addr_country" name="hf_aco"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          <header class="px-5 py-3 border-y border-border bg-surface-muted">
            <h2 class="text-[14px] font-medium text-ink">Document footer</h2>
          </header>
          <div class="grid grid-cols-12 gap-3 p-5">
            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Footer text</span>
              <textarea [(ngModel)]="hf_rxFooter" name="hf_rf" rows="2" placeholder="e.g. 'Doctor's signature' / 'Insurance authorisations through reception'"
                        class="w-full px-2.5 py-2 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"></textarea>
            </label>
          </div>

          <footer class="px-5 py-3 border-t border-border bg-surface-muted flex justify-end gap-2">
            <button type="button" (click)="resetHospital()" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Discard changes</button>
            @if (canEditHospital()) {
              <button type="button" (click)="saveHospital()" [disabled]="busy() === 'hospital'"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                {{ busy() === 'hospital' ? 'Saving…' : 'Save lab profile' }}
              </button>
            } @else {
              <span class="text-[11px] text-ink-muted self-center">Read-only — only branch_admin / super_admin can edit</span>
            }
          </footer>
        </section>
      }

      <!-- ─────────────── Services tab ─────────────── -->
      @if (tab() === 'services') {
        <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 class="text-[14px] font-medium text-ink">Service catalog</h2>
              <p class="text-[11px] text-ink-muted mt-0.5">
                {{ store.serviceTotals().active }} active · {{ store.serviceTotals().inactive }} archived · {{ store.serviceTotals().total }} total
              </p>
            </div>
            @if (canEditServices()) {
              <div class="flex items-center gap-2">
                <button type="button" (click)="seedFullCatalog()" [disabled]="busy() === 'seed-catalog' || !store.selectedBranchId()"
                        title="Insert ~90 lab + radiology services for this branch"
                        class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-primary-600 text-primary-700 hover:bg-primary-50 text-[12px] font-medium disabled:opacity-50">
                  {{ busy() === 'seed-catalog' ? 'Loading…' : '✨ Seed lab + radiology catalog' }}
                </button>
                <button type="button" (click)="openNewService()"
                        class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add service
                </button>
              </div>
            }
          </header>

          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-surface-muted">
                <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Code</th>
                <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border">Name</th>
                <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Category</th>
                <th class="text-left px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">HSN/SAC</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Price</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">GST</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
                <th class="text-right px-4 py-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (s of store.services(); track s.id) {
                <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                    [class.opacity-60]="!s.is_active">
                  <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ s.code }}</td>
                  <td class="px-4 py-2.5 text-[13px] text-ink truncate max-w-[280px]">{{ s.name }}</td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft capitalize">{{ s.category.replace('_', ' ') }}</td>
                  <td class="px-4 py-2.5 font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ s.hsn_sac || '—' }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink whitespace-nowrap">{{ formatINR(s.unit_price_cents) }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-[11px] text-ink-soft whitespace-nowrap">{{ s.gst_rate }}%</td>
                  <td class="px-4 py-2.5 text-right whitespace-nowrap">
                    <span [class]="statusChipCls(s.is_active)">{{ s.is_active ? 'Active' : 'Archived' }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right whitespace-nowrap">
                    @if (canEditServices()) {
                      <button type="button" (click)="openEditService(s)" class="h-7 px-2.5 rounded-md text-[11px] font-medium border border-border text-ink-soft hover:bg-surface-subtle">Edit</button>
                      @if (s.is_active) {
                        <button type="button" (click)="archiveService(s)" [disabled]="busy() === s.id"
                                class="h-7 px-2.5 rounded-md text-[11px] text-danger-fg hover:bg-danger-bg disabled:opacity-50 ml-1">Archive</button>
                      } @else {
                        <button type="button" (click)="reactivateService(s)" [disabled]="busy() === s.id"
                                class="h-7 px-2.5 rounded-md text-[11px] text-good-fg hover:bg-good-bg disabled:opacity-50 ml-1">Restore</button>
                      }
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="px-4 py-12 text-center text-[12px] text-ink-muted">No services in this branch yet.</td></tr>
              }
            </tbody>
          </table>
        </section>
      }

      <!-- ─────────────── Roles & permissions tab ─────────────── -->
      @if (tab() === 'roles') {
        <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 class="text-[14px] font-medium text-ink">Roles &amp; permissions</h2>
              <p class="text-[11px] text-ink-muted mt-0.5">
                Pick a role to view and edit its permissions. Changes affect all staff with that role on their next sign-in (claims are refreshed via the JWT hook).
                @if (!canEditRoles()) { · <span class="text-warn-fg">Read-only — only super_admin can edit.</span> }
              </p>
            </div>
            <label class="inline-flex items-center gap-2">
              <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Role</span>
              <select [ngModel]="selectedRoleSlug()" (ngModelChange)="selectedRoleSlug.set($event)" name="role"
                      class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                @for (r of store.roles(); track r.slug) {
                  <option [ngValue]="r.slug">{{ r.name }}</option>
                }
              </select>
            </label>
          </header>

          @if (!selectedRoleSlug()) {
            <p class="px-5 py-12 text-[12px] text-ink-muted text-center">Pick a role above to see its permissions.</p>
          } @else if (selectedRole(); as role) {
            <div class="px-5 py-3 bg-surface-muted text-[11px] text-ink-soft">
              <p><span class="font-medium text-ink">{{ role.name }}</span><span class="text-ink-muted"> · slug <span class="font-mono">{{ role.slug }}</span></span></p>
              @if (role.description) { <p class="mt-0.5 italic">{{ role.description }}</p> }
              <p class="mt-1 font-mono">{{ rolePermCount(role.slug) }} of {{ store.permissions().length }} permissions granted</p>
            </div>

            <div class="p-5 space-y-5">
              @for (group of store.permissionsByNamespace(); track group.namespace) {
                <div>
                  <p class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">{{ group.namespace }}</p>
                  <div class="grid grid-cols-12 gap-2">
                    @for (p of group.permissions; track p.slug) {
                      <label class="col-span-12 md:col-span-6 lg:col-span-4 flex items-start gap-2 px-3 py-2 border border-border rounded-md hover:bg-surface-muted transition-colors"
                             [class.opacity-50]="busy() === permKey(role.slug, p.slug)"
                             [class.cursor-pointer]="canEditRoles()"
                             [class.cursor-not-allowed]="!canEditRoles()">
                        <input type="checkbox"
                               [checked]="store.hasRolePermission(role.slug, p.slug)"
                               [disabled]="!canEditRoles() || busy() === permKey(role.slug, p.slug)"
                               (change)="togglePermission(role.slug, p.slug, $event)"
                               class="size-3.5 mt-0.5"
                               style="accent-color: var(--color-primary-600);" />
                        <div class="min-w-0 flex-1">
                          <p class="text-[12px] font-mono text-ink leading-tight">{{ p.slug }}</p>
                          @if (p.description) { <p class="text-[10px] text-ink-muted mt-0.5">{{ p.description }}</p> }
                        </div>
                      </label>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </section>
      }

      <!-- ─────────────── Digital signatures tab ──────────────── -->
      @if (tab() === 'signatures') {
        <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 class="text-[14px] font-medium text-ink">Digital signatures</h2>
              <p class="text-[11px] text-ink-muted mt-0.5">
                Upload signatures for lab technicians and pathologists. They appear in the LAB TECHNICIAN
                and "Approved by" slots on every printed lab report and invoice.
                Max 500 KB · PNG / JPG / SVG.
              </p>
            </div>
            <button type="button" (click)="loadStaffSignatures()" [disabled]="signaturesLoading()"
                    class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
              {{ signaturesLoading() ? 'Loading…' : 'Refresh' }}
            </button>
          </header>
          <div class="px-5 py-5">
            @if (staffWithSignatures().length === 0 && !signaturesLoading()) {
              <p class="text-[12px] text-ink-muted italic">No staff loaded — click Refresh to load this branch's staff.</p>
            }
            <div class="space-y-2">
              @for (st of staffWithSignatures(); track st.id) {
                <div class="grid grid-cols-12 gap-3 items-center border border-border rounded-md p-3">
                  <div class="col-span-12 lg:col-span-3">
                    <p class="text-[13px] font-semibold text-ink">{{ st.full_name }}</p>
                    <p class="text-[10.5px] text-ink-muted">{{ st.role_slug }}</p>
                  </div>
                  <div class="col-span-12 lg:col-span-3">
                    <select class="input"
                            [ngModel]="st.signature_role"
                            (ngModelChange)="updateSignatureRole(st, $event)">
                      <option [ngValue]="null">— role —</option>
                      <option value="technician">Technician</option>
                      <option value="pathologist">Pathologist</option>
                      <option value="radiologist">Radiologist</option>
                      <option value="doctor">Doctor</option>
                    </select>
                  </div>
                  <div class="col-span-12 lg:col-span-3">
                    @if (st.signature_data_url) {
                      <img [src]="st.signature_data_url" alt="signature"
                           style="max-height:40px;max-width:140px;background:#fff;border:1px solid #ddd;padding:2px;" />
                    } @else {
                      <span class="text-[11px] text-ink-muted">No signature</span>
                    }
                  </div>
                  <div class="col-span-12 lg:col-span-3 flex gap-2 items-center">
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml"
                           (change)="uploadStaffSig($event, st)" class="text-[11px]" />
                    @if (st.signature_data_url) {
                      <button type="button" class="text-danger-fg text-[11px]" (click)="clearStaffSig(st)">Clear</button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </section>
      }

      <!-- ─────────────── Demo data tab ───────────────────────── -->
      @if (tab() === 'demo') {
        <section class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
          <header class="px-5 py-3 border-b border-border">
            <h2 class="text-[14px] font-medium text-ink">Demo data</h2>
            <p class="text-[11px] text-ink-muted mt-0.5">
              Seed the database with realistic demo records for showcasing.
              Idempotent — safe to re-run; existing demo rows (UHID <code class="font-mono">NHQ-DEMO-*</code>, staff codes <code class="font-mono">DOC-10*</code>) are upserted.
            </p>
          </header>
          <div class="px-5 py-5 space-y-4">
            <div class="bg-surface-muted rounded-md p-4">
              <p class="text-[12px] font-semibold text-ink mb-2">This will create / refresh:</p>
              <ul class="text-[12px] text-ink-soft space-y-0.5 list-disc list-inside">
                <li>10 doctors across specialties (DOC-1001 … DOC-1010)</li>
                <li>20 patients (NHQ-DEMO-001 … NHQ-DEMO-020) with realistic demographics</li>
                <li>5 patient allergies (history sample)</li>
                <li>20 appointments spread past 14 days → next 5 days</li>
                <li>Encounters + vitals + prescriptions (3 items each) for completed visits</li>
                <li>12-test lab catalog (CBC, HBA1C, LFT, RFT, TSH, …)</li>
                <li>6 lab orders with verified results on recent finalised consultations</li>
              </ul>
            </div>

            <div class="flex items-center gap-2">
              <button type="button" (click)="runSeed()" [disabled]="busy() === 'seed'"
                      class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
                {{ busy() === 'seed' ? 'Seeding…' : 'Seed demo data' }}
              </button>
              @if (seedNote()) {
                <span class="text-[12px] text-ink-muted">{{ seedNote() }}</span>
              }
            </div>

            @if (seedError()) {
              <app-alert tone="danger" title="Seed failed">{{ seedError() }}</app-alert>
            }

            @if (seedResult(); as r) {
              <div class="border border-border rounded-md p-4 bg-good-bg/40">
                <p class="text-[13px] font-semibold text-good-fg mb-2">✓ Seed completed</p>
                <dl class="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
                  <div class="flex justify-between"><dt class="text-ink-muted">Doctors</dt><dd class="font-mono text-ink">{{ r.doctors }}</dd></div>
                  <div class="flex justify-between"><dt class="text-ink-muted">Patients</dt><dd class="font-mono text-ink">{{ r.patients }}</dd></div>
                  <div class="flex justify-between"><dt class="text-ink-muted">Allergies</dt><dd class="font-mono text-ink">{{ r.allergies }}</dd></div>
                  <div class="flex justify-between"><dt class="text-ink-muted">Appointments</dt><dd class="font-mono text-ink">{{ r.appointments }}</dd></div>
                  <div class="flex justify-between"><dt class="text-ink-muted">Encounters</dt><dd class="font-mono text-ink">{{ r.encounters }}</dd></div>
                  <div class="flex justify-between"><dt class="text-ink-muted">Rx items</dt><dd class="font-mono text-ink">{{ r.prescription_items }}</dd></div>
                  <div class="flex justify-between"><dt class="text-ink-muted">Lab tests (catalog)</dt><dd class="font-mono text-ink">{{ r.lab_tests_in_catalog }}</dd></div>
                  <div class="flex justify-between"><dt class="text-ink-muted">Lab orders</dt><dd class="font-mono text-ink">{{ r.lab_orders }}</dd></div>
                </dl>
              </div>
            }

            <details class="text-[11px] text-ink-muted">
              <summary class="cursor-pointer font-medium text-ink-soft">Prerequisite (one-time setup)</summary>
              <p class="mt-2">If this is the first run on a fresh database, paste <code class="font-mono">docs/sample-data.sql</code> into Supabase → SQL Editor and click <b>Run</b> once. That installs the <code class="font-mono">seed_demo_data()</code> function this button calls.</p>
            </details>
          </div>
        </section>
      }
    }

    <!-- ── Service form modal ───────────────────────────────── -->
    @if (svcOpen()) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" (document:keydown.escape)="svcOpen.set(false)">
        <div role="dialog" aria-modal="true"
             class="w-full max-w-[640px] bg-surface-card border border-border rounded-[10px] shadow-pop p-5 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h2 class="font-display text-[18px] font-medium text-ink">{{ svcEditId() ? 'Edit service' : 'New service' }}</h2>

          <div class="grid grid-cols-12 gap-3 mt-4">
            <label class="col-span-12 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Code *</span>
              <input type="text" [(ngModel)]="svcCode" name="sc" placeholder="e.g. CONS-GP"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-12 md:col-span-8 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Name *</span>
              <input type="text" [(ngModel)]="svcName" name="sn"
                     class="w-full h-9 px-2.5 text-[13px] bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Category *</span>
              <select [(ngModel)]="svcCategory" name="scat"
                      class="w-full h-9 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                      [style.background-image]="chevronUrl" style="background-position: right 8px center;">
                @for (c of categoryOptions; track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Price (₹) *</span>
              <input type="number" [(ngModel)]="svcPriceRupees" name="sp" min="0" step="1"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
            <label class="col-span-6 md:col-span-4 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">GST %</span>
              <input type="number" [(ngModel)]="svcGstRate" name="sg" min="0" max="28" step="0.5"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>

            <label class="col-span-12 block">
              <span class="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">HSN / SAC</span>
              <input type="text" [(ngModel)]="svcHsn" name="sh" placeholder="e.g. 999315"
                     class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-card border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" (click)="svcOpen.set(false)" class="h-9 px-4 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">Cancel</button>
            <button type="button" (click)="confirmService()" [disabled]="!svcValid() || busy() === 'service'"
                    class="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-500 text-white text-[12px] font-medium shadow-card disabled:opacity-50">
              {{ busy() === 'service' ? 'Saving…' : (svcEditId() ? 'Save changes' : 'Add service') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class LegacySettingsPage implements OnInit {
  protected readonly store = inject(SettingsStore);
  private svc = inject(SettingsService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private sanitizer = inject(DomSanitizer);
  private toast = inject(ToastService);
  private supabase = inject(SupabaseService);

  protected readonly tab = signal<SettingsTab>('hospital');
  protected readonly busy = signal<string | null>(null);

  protected readonly canEditHospital = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.hasRole('branch_admin'),
  );
  protected readonly canEditServices = computed(() =>
    this.auth.hasRole('super_admin') || this.auth.has('billing.write'),
  );

  protected readonly tabs: { value: SettingsTab; label: string }[] = [
    { value: 'hospital',   label: 'Lab profile' },
    // 'Service catalog' tab removed — the canonical editor for tests + prices
    // is /lab-catalog. A DB trigger keeps the underlying public.services rows
    // in sync, so invoice FKs still work without surfacing a duplicate UI.
    // { value: 'services',   label: 'Service catalog' },
    { value: 'roles',      label: 'Roles & permissions' },
    { value: 'signatures', label: 'Digital signatures' },
    { value: 'demo',       label: 'Demo data' },
  ];

  // ── Digital signatures tab state ───────────────────────────────
  protected readonly staffWithSignatures = signal<Array<{
    id: string; full_name: string; role_slug: string;
    signature_data_url: string | null; signature_role: string | null;
  }>>([]);
  protected readonly signaturesLoading = signal(false);

  // Demo-data tab state
  protected readonly seedResult = signal<{
    doctors: number; patients: number; allergies: number;
    appointments: number; encounters: number; prescription_items: number;
    lab_tests_in_catalog: number; lab_orders: number;
  } | null>(null);
  protected readonly seedError = signal<string | null>(null);
  protected readonly seedNote  = signal<string>('');

  protected readonly canEditRoles = computed(() => this.auth.hasRole('super_admin'));

  // ── Roles tab state
  protected readonly selectedRoleSlug = signal<string | null>(null);
  protected readonly selectedRole = computed(() => {
    const slug = this.selectedRoleSlug();
    if (!slug) return null;
    return this.store.roles().find((r) => r.slug === slug) ?? null;
  });
  protected readonly categoryOptions = SERVICE_CATEGORY_OPTIONS;

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  // ── Hospital form state
  protected hf_name = '';
  protected hf_tagline = '';
  protected hf_gstin = '';
  protected hf_taxState = '';
  protected hf_regNo = '';
  protected hf_phone = '';
  protected hf_email = '';
  protected hf_website = '';
  protected hf_logoUrl = '';
  protected hf_addr_line1 = '';
  protected hf_addr_line2 = '';
  protected hf_addr_city = '';
  protected hf_addr_state = '';
  protected hf_addr_pin = '';
  protected hf_addr_country = '';
  protected hf_rxHeader = '';
  protected hf_rxFooter = '';

  protected readonly logoUploading = signal(false);

  // ── Service form state
  protected readonly svcOpen = signal(false);
  protected readonly svcEditId = signal<string | null>(null);
  protected svcCode = '';
  protected svcName = '';
  protected svcCategory: ServiceCategory = 'consultation';
  protected svcPriceRupees = 0;
  protected svcGstRate = 0;
  protected svcHsn = '';

  constructor() {
    // Sync the top-bar branch into the settings store. Without this the page
    // keeps showing branches[0] (alphabetic = BLR) regardless of which branch
    // the user picked in the global switcher.
    effect(() => {
      const topId = this.branchStore.activeBranchId();
      const localId = this.store.selectedBranchId();
      const branches = this.store.branches();
      // Wait until settings.store has loaded its branches before syncing.
      if (branches.length === 0) return;
      // Topbar "All hospitals" = null — fall back to first available branch.
      const target = topId && branches.some((b) => b.id === topId) ? topId : branches[0]?.id ?? null;
      if (target && target !== localId) {
        void this.store.selectBranch(target);
      }
    });

    // When the selected branch changes, copy its values into the form
    effect(() => {
      const b = this.store.selectedBranch();
      if (!b) return;
      this.resetHospitalFromBranch();
    });

    // Lazy-load signatures the first time the user enters that tab.
    effect(() => {
      if (this.tab() === 'signatures' && this.staffWithSignatures().length === 0) {
        void this.loadStaffSignatures();
      }
    });
  }

  // ── Digital signatures methods ─────────────────────────────────
  async loadStaffSignatures(): Promise<void> {
    this.signaturesLoading.set(true);
    try {
      // Show ALL active staff across the network (not just the selected branch)
      // — any of them might be the one who entered/verified a given lab result
      // and needs a signature on the printed report.
      const { data, error } = await (this.supabase.client as any)
        .from('staff')
        .select('id, full_name, role_slug, signature_data_url, signature_role, primary_branch_id')
        .eq('is_active', true)
        .order('role_slug')
        .order('full_name');
      if (error) throw error;
      this.staffWithSignatures.set(data ?? []);
    } catch (e: any) {
      this.toast.error('Could not load staff', e?.message ?? 'Try refresh.');
    } finally {
      this.signaturesLoading.set(false);
    }
  }

  async uploadStaffSig(ev: Event, st: { id: string; full_name: string }): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      this.toast.error('File too large', 'Signature must be under 500 KB');
      return;
    }
    const dataUrl = await this.fileToDataUrl(file);
    const { error } = await (this.supabase.client as any).from('staff')
      .update({ signature_data_url: dataUrl, signature_uploaded_at: new Date().toISOString() })
      .eq('id', st.id);
    if (error) {
      this.toast.error('Save failed', error.message);
      return;
    }
    this.staffWithSignatures.set(
      this.staffWithSignatures().map((s) => (s.id === st.id ? { ...s, signature_data_url: dataUrl } : s)),
    );
    this.toast.success('Signature uploaded', st.full_name);
  }

  async clearStaffSig(st: { id: string; full_name: string }): Promise<void> {
    if (!confirm(`Remove signature for ${st.full_name}?`)) return;
    const { error } = await (this.supabase.client as any).from('staff')
      .update({ signature_data_url: null }).eq('id', st.id);
    if (error) { this.toast.error('Failed', error.message); return; }
    this.staffWithSignatures.set(
      this.staffWithSignatures().map((s) => (s.id === st.id ? { ...s, signature_data_url: null } : s)),
    );
  }

  async updateSignatureRole(st: { id: string }, role: string | null): Promise<void> {
    const { error } = await (this.supabase.client as any).from('staff')
      .update({ signature_role: role }).eq('id', st.id);
    if (error) { this.toast.error('Failed', error.message); return; }
    this.staffWithSignatures.set(
      this.staffWithSignatures().map((s) => (s.id === st.id ? { ...s, signature_role: role } : s)),
    );
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result ?? ''));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
  }

  ngOnInit() {
    void this.store.load();
  }

  protected setTab(t: SettingsTab) { this.tab.set(t); }

  // ── Lobby tab: QR for the public waiting screen ───────────────
  /** All known active branches — populated app-wide by BranchStore. */
  protected readonly qrBranches = computed(() =>
    this.branchStore.branches().map(b => ({ code: b.code, name: b.name })),
  );

  /** Render an SVG QR (as SafeHtml) encoding `<origin>/wait/<branchCode>`. */
  protected qrSvg(branchCode: string): SafeHtml {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
    const url = `${origin}/wait/${encodeURIComponent(branchCode.toUpperCase())}`;
    const qr = new QRCode({
      content: url,
      padding: 2,
      width: 160,
      height: 160,
      color: '#0F1B2D',
      background: '#FFFFFF',
      ecl: 'M',
      join: true,
    });
    return this.sanitizer.bypassSecurityTrustHtml(qr.svg());
  }

  protected waitUrlFor(branchCode: string): string {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
    return `${origin}/wait/${branchCode.toUpperCase()}`;
  }

  protected async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied', text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
    }
  }
  protected tabBtnCls(value: SettingsTab): string {
    const isActive = this.tab() === value;
    const base = 'px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors';
    return isActive
      ? `${base} border-primary-600 text-primary-600`
      : `${base} border-transparent text-ink-muted hover:text-ink-soft`;
  }

  protected onBranchChange(id: string) { void this.store.selectBranch(id); }

  protected statusChipCls(active: boolean): string {
    const tone = active ? 'bg-good-bg text-good-fg' : 'bg-surface-subtle text-ink-muted';
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${tone}`;
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cents / 100);
  }

  // ── Hospital flow ────────────────────────────────
  protected resetHospital() { this.resetHospitalFromBranch(); }

  private resetHospitalFromBranch() {
    const b = this.store.selectedBranch();
    if (!b) return;
    this.hf_name        = b.name;
    this.hf_tagline     = b.tagline ?? '';
    this.hf_gstin       = b.gstin ?? '';
    this.hf_taxState    = b.tax_state ?? '';
    this.hf_regNo       = b.registration_no ?? '';
    this.hf_phone       = b.phone ?? '';
    this.hf_email       = b.email ?? '';
    this.hf_website     = b.website ?? '';
    this.hf_logoUrl     = b.logo_url ?? '';
    this.hf_rxHeader    = b.prescription_header ?? '';
    this.hf_rxFooter    = b.prescription_footer ?? '';
    const a = (b.address ?? {}) as BranchAddress;
    this.hf_addr_line1   = a.line1 ?? '';
    this.hf_addr_line2   = a.line2 ?? '';
    this.hf_addr_city    = a.city ?? '';
    this.hf_addr_state   = a.state ?? '';
    this.hf_addr_pin     = a.pincode ?? '';
    this.hf_addr_country = a.country ?? 'India';
  }

  protected async saveHospital() {
    const b = this.store.selectedBranch();
    if (!b || !this.hf_name.trim()) return;
    this.busy.set('hospital');
    try {
      const address: BranchAddress = {
        line1: this.hf_addr_line1.trim() || undefined,
        line2: this.hf_addr_line2.trim() || undefined,
        city: this.hf_addr_city.trim() || undefined,
        state: this.hf_addr_state.trim() || undefined,
        pincode: this.hf_addr_pin.trim() || undefined,
        country: this.hf_addr_country.trim() || undefined,
      };
      await this.svc.updateBranch(b.id, {
        name: this.hf_name.trim(),
        tagline: this.hf_tagline.trim() || null,
        gstin: this.hf_gstin.trim() || null,
        tax_state: this.hf_taxState.trim() || null,
        registration_no: this.hf_regNo.trim() || null,
        phone: this.hf_phone.trim() || null,
        email: this.hf_email.trim() || null,
        website: this.hf_website.trim() || null,
        logo_url: this.hf_logoUrl.trim() || null,
        prescription_header: this.hf_rxHeader.trim() || null,
        prescription_footer: this.hf_rxFooter.trim() || null,
        address: Object.values(address).some((v) => v) ? (address as unknown as never) : null,
      });
      this.toast.success('Lab profile saved');
      await this.store.refreshBranches();
    } catch (e) {
      this.toast.error('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async onLogoFileChange(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      this.toast.error('File too large', 'Logo must be 500 KB or smaller.');
      return;
    }
    const branch = this.store.selectedBranch();
    if (!branch) return;
    this.logoUploading.set(true);
    try {
      this.hf_logoUrl = await this.svc.uploadLogo(branch.id, file);
      this.toast.success('Logo uploaded — click Save hospital info to persist');
    } catch (e) {
      this.toast.error('Upload failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.logoUploading.set(false);
      // Reset the input so the same file can be re-selected after an error
      (ev.target as HTMLInputElement).value = '';
    }
  }

  // ── Service flow ────────────────────────────────
  protected openNewService() {
    this.svcEditId.set(null);
    this.svcCode = '';
    this.svcName = '';
    this.svcCategory = 'consultation';
    this.svcPriceRupees = 0;
    this.svcGstRate = 0;
    this.svcHsn = '';
    this.svcOpen.set(true);
  }
  protected openEditService(s: Service) {
    this.svcEditId.set(s.id);
    this.svcCode = s.code;
    this.svcName = s.name;
    this.svcCategory = s.category;
    this.svcPriceRupees = s.unit_price_cents / 100;
    this.svcGstRate = Number(s.gst_rate);
    this.svcHsn = s.hsn_sac ?? '';
    this.svcOpen.set(true);
  }
  protected svcValid(): boolean {
    return this.svcCode.trim().length > 0
      && this.svcName.trim().length > 0
      && this.svcPriceRupees >= 0;
  }

  protected async confirmService() {
    const branch = this.store.selectedBranch();
    if (!branch || !this.svcValid()) return;
    this.busy.set('service');
    try {
      const editId = this.svcEditId();
      const patch = {
        code: this.svcCode.trim(),
        name: this.svcName.trim(),
        category: this.svcCategory,
        unit_price_cents: Math.round((this.svcPriceRupees || 0) * 100),
        gst_rate: this.svcGstRate || 0,
        hsn_sac: this.svcHsn.trim() || null,
      };
      if (editId) {
        await this.svc.updateService(editId, patch);
        this.toast.success('Service updated');
      } else {
        await this.svc.addService({ branch_id: branch.id, ...patch });
        this.toast.success('Service added');
      }
      this.svcOpen.set(false);
      await this.store.refreshServices();
    } catch (e) {
      this.toast.error('Could not save service', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async archiveService(s: Service) {
    if (!confirm(`Archive "${s.name}"? It will no longer appear in invoice pickers.`)) return;
    this.busy.set(s.id);
    try {
      await this.svc.deactivateService(s.id);
      this.toast.warn('Service archived');
      await this.store.refreshServices();
    } catch (e) {
      this.toast.error('Could not archive', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async seedFullCatalog() {
    const branchId = this.store.selectedBranchId();
    if (!branchId) return;
    if (!confirm('Add ~90 common lab + radiology services to this branch?\n\nExisting services with the same code are updated; new ones are inserted.')) return;
    this.busy.set('seed-catalog');
    try {
      const r = await this.svc.seedLabImagingCatalog(branchId);
      if (r.errors.length > 0) {
        this.toast.error('Seed failed', r.errors[0]);
      } else {
        this.toast.success('Catalog loaded', `${r.inserted} services added/updated for this branch.`);
        await this.store.refreshServices();
      }
    } catch (e) {
      this.toast.error('Could not seed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async reactivateService(s: Service) {
    this.busy.set(s.id);
    try {
      await this.svc.reactivateService(s.id);
      this.toast.success('Service restored');
      await this.store.refreshServices();
    } catch (e) {
      this.toast.error('Could not restore', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  // ── Roles & permissions ────────────────────────
  protected permKey(roleSlug: string, permSlug: string): string {
    return `${roleSlug}::${permSlug}`;
  }

  protected rolePermCount(roleSlug: string): number {
    return this.store.rolePermissions().filter((rp) => rp.role_slug === roleSlug).length;
  }

  protected async togglePermission(roleSlug: string, permSlug: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    const key = this.permKey(roleSlug, permSlug);
    this.busy.set(key);
    try {
      if (checked) {
        await this.svc.grantPermission(roleSlug, permSlug);
        this.toast.success(`Granted ${permSlug} to ${roleSlug}`);
      } else {
        await this.svc.revokePermission(roleSlug, permSlug);
        this.toast.warn(`Revoked ${permSlug} from ${roleSlug}`);
      }
      await this.store.refreshRolePermissions();
    } catch (e) {
      // Revert checkbox visual on failure
      (ev.target as HTMLInputElement).checked = !checked;
      this.toast.error('Could not update permission', e instanceof Error ? e.message : 'Try again.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async runSeed() {
    if (!confirm('Seed / refresh demo data? This is idempotent — existing demo rows are upserted.')) return;
    this.busy.set('seed');
    this.seedError.set(null);
    this.seedNote.set('Calling seed_demo_data()…');
    try {
      const { data, error } = await (this.supabase.client as any).rpc('seed_demo_data');
      if (error) throw error;
      this.seedResult.set(data ?? null);
      this.seedNote.set('Done — pages will now reflect the seeded data.');
      this.toast.success('Demo data seeded', 'Reload the dashboard / appointments page to see it.');
    } catch (e) {
      const msg = e instanceof Error
        ? e.message
        : (e && typeof e === 'object' && 'message' in e ? String((e as any).message) : 'Try again.');
      this.seedError.set(msg);
      this.seedNote.set('');
      // If function isn't installed, give a clear next step
      if (/seed_demo_data|function .* does not exist|404/i.test(msg)) {
        this.seedError.set(
          msg + ' — Run docs/sample-data.sql in Supabase → SQL Editor once to install the seed function.'
        );
      }
    } finally {
      this.busy.set(null);
    }
  }
}
