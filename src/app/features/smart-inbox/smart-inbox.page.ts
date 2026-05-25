import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { format, parseISO, subDays } from 'date-fns';

import { AuthStore } from '../../core/auth/auth.store';
import { BranchStore } from '../../core/branches/branch.store';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { downloadCsv } from '../reports/utils/csv';
import { SmartInboxService } from './data/smart-inbox.service';
import { LINE_KIND_LABEL, PRIORITY_TONE, type HistoryRow, type InboxItem, type InboxKind, type InvoiceApprovalContext } from './data/smart-inbox.types';

type TabValue = InboxKind | 'all' | 'history';
type HistoryStatusFilter = 'all' | 'approved' | 'rejected';
type HistoryTypeFilter   = 'all' | 'discount' | 'other';
type HistoryWindowDays   = 7 | 30 | 90 | 365;

@Component({
  selector: 'app-smart-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormsModule, RouterLink, AlertComponent],
  template: `
    <header class="flex items-end justify-between pb-4 mb-5 border-b border-border">
      <div>
        <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Smart inbox</h1>
        <p class="text-[13px] text-ink-muted mt-1 flex items-center gap-1.5 flex-wrap">
          <span>{{ items().length }} item{{ items().length !== 1 ? 's' : '' }}</span>
          @if (branchStore.activeBranchId() === null) {
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[11px] font-medium">🌐 network view</span>
          } @else {
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-good-bg text-good-fg text-[11px] font-medium">{{ branchStore.activeBranchName() }}</span>
          }
          <span>· approvals, tasks, awareness — sorted by priority</span>
        </p>
      </div>
      <button type="button" (click)="refresh()" [disabled]="loading()"
              class="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             [class.animate-spin]="loading()">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M8 16H3v5"/>
        </svg>
        Refresh
      </button>
    </header>

    <!-- ── Tabs ───────────────────────────────────────────────── -->
    <div class="flex items-center gap-1 mb-4">
      @for (t of tabs; track t.value) {
        <button type="button" (click)="setKind(t.value)" [class]="tabCls(t.value)">
          {{ t.label }}
          <span class="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono"
                [class]="kindCount(t.value) > 0 ? 'bg-white/30 text-white' : 'bg-surface-subtle text-ink-muted'">
            {{ kindCount(t.value) }}
          </span>
        </button>
      }
    </div>

    <!-- ── Filter row (live tabs only) ────────────────────────── -->
    @if (kind() !== 'history') {
      <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
        <div class="relative flex-1 min-w-[220px]">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" [formControl]="searchCtrl" placeholder="Search by title, ticket, vendor…"
                 class="w-full h-8 pl-8 pr-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
        </div>
      </div>
    }

    <!-- ═══════════════════════ HISTORY TAB ═══════════════════════ -->
    @if (kind() === 'history') {
      <!-- KPI grid -->
      <div class="grid grid-cols-12 gap-[14px] mb-4">
        <article class="col-span-12 md:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Discounts approved</p>
          <p class="font-display text-[26px] font-medium leading-[1.1] mt-2 text-good-fg">{{ historySummary().approvedCount }}</p>
          <p class="text-[11px] text-ink-muted mt-1">{{ formatINR(historySummary().approvedTotalCents) }} discounted</p>
        </article>
        <article class="col-span-12 md:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Discounts rejected</p>
          <p class="font-display text-[26px] font-medium leading-[1.1] mt-2 text-danger-fg">{{ historySummary().rejectedCount }}</p>
          <p class="text-[11px] text-ink-muted mt-1">{{ formatINR(historySummary().rejectedTotalCents) }} blocked</p>
        </article>
        <article class="col-span-12 md:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Approval rate</p>
          <p class="font-display text-[26px] font-medium leading-[1.1] mt-2">{{ historySummary().approvalRatePct }}%</p>
          <p class="text-[11px] text-ink-muted mt-1">of {{ historySummary().totalDecisions }} decisions</p>
        </article>
        <article class="col-span-12 md:col-span-3 bg-surface-card border border-border rounded-[10px] p-[16px_18px]">
          <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Avg time to decide</p>
          <p class="font-display text-[26px] font-medium leading-[1.1] mt-2">{{ historySummary().avgHoursLabel }}</p>
          <p class="text-[11px] text-ink-muted mt-1">requested → decided</p>
        </article>
      </div>

      <!-- History filters -->
      <div class="flex items-center gap-2 flex-wrap bg-surface-card border border-border rounded-[10px] px-3 py-2.5 mb-4">
        <input type="search" [(ngModel)]="historySearch" (ngModelChange)="onHistorySearch()"
               placeholder="Search ticket, invoice, patient, approver…"
               class="flex-1 min-w-[260px] h-8 px-2.5 text-[13px] bg-surface-muted border border-border rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />

        <span class="w-px h-5 bg-border mx-1"></span>

        <div class="flex items-center gap-1">
          @for (s of historyStatusOptions; track s.value) {
            <button type="button" (click)="setHistoryStatus(s.value)" [class]="historyPillCls(historyStatus() === s.value)">
              {{ s.label }}
            </button>
          }
        </div>

        <span class="w-px h-5 bg-border mx-1"></span>

        <div class="flex items-center gap-1">
          @for (t of historyTypeOptions; track t.value) {
            <button type="button" (click)="setHistoryType(t.value)" [class]="historyPillCls(historyType() === t.value)">
              {{ t.label }}
            </button>
          }
        </div>

        <span class="w-px h-5 bg-border mx-1"></span>

        <label class="inline-flex items-center gap-2">
          <span class="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Window</span>
          <select [(ngModel)]="windowDays" (ngModelChange)="loadHistory()" name="windowDays"
                  class="h-8 px-2.5 pr-7 text-[12px] bg-surface-card border border-border rounded-md text-ink appearance-none bg-no-repeat focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100"
                  [style.background-image]="chevronUrl" style="background-position: right 8px center;">
            <option [ngValue]="7">7 days</option>
            <option [ngValue]="30">30 days</option>
            <option [ngValue]="90">90 days</option>
            <option [ngValue]="365">1 year</option>
          </select>
        </label>

        <button type="button" (click)="exportHistoryCsv()" [disabled]="filteredHistory().length === 0"
                class="ml-auto h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle disabled:opacity-50">
          Export CSV
        </button>
      </div>

      @if (historyError()) {
        <div class="mb-4"><app-alert tone="danger" title="Could not load history">{{ historyError() }}</app-alert></div>
      }

      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-surface-muted">
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Decided</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Ticket</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Type</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Patient · Invoice</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Requested</th>
              <th class="text-right px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Approved</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Requested by</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Decided by</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">TAT</th>
              <th class="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-semibold border-b border-border whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            @if (historyLoading() && historyRows().length === 0) {
              <tr><td colspan="10" class="px-4 py-8 text-center text-[13px] text-ink-muted">Loading…</td></tr>
            } @else {
              @for (r of filteredHistory(); track r.request_id) {
                <tr class="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors">
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">
                    {{ r.decided_at ? formatDate(r.decided_at) : '—' }}
                  </td>
                  <td class="px-4 py-2.5 text-[12px] font-mono text-primary-700">{{ r.ticket_no }}</td>
                  <td class="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{{ historyTypeLabel(r.exception_type) }}</td>
                  <td class="px-4 py-2.5">
                    @if (r.patient_name) {
                      <p class="text-[13px] text-ink leading-tight">{{ r.patient_name }}</p>
                      <p class="text-[11px] text-ink-muted font-mono mt-0.5">UHID {{ r.patient_uhid }} · {{ r.invoice_number }}</p>
                    } @else if (r.invoice_number) {
                      <p class="text-[13px] text-ink font-mono">{{ r.invoice_number }}</p>
                      <p class="text-[11px] text-ink-muted">B2B / no patient</p>
                    } @else {
                      <p class="text-[12px] text-ink-muted">{{ r.title }}</p>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono text-[12px] text-ink-soft whitespace-nowrap">
                    {{ r.requested_amount_cents != null ? formatINR(r.requested_amount_cents) : '—' }}
                  </td>
                  <td class="px-4 py-2.5 text-right font-mono text-[12px] whitespace-nowrap"
                      [class.text-good-fg]="r.status === 'approved'"
                      [class.text-ink-muted]="r.status !== 'approved'">
                    @if (r.status === 'approved' && r.final_discount_cents != null) {
                      {{ formatINR(r.final_discount_cents) }}
                      @if (r.final_discount_cents !== r.requested_amount_cents) {
                        <span class="text-[10px] block text-warn-fg">edited from {{ formatINR(r.requested_amount_cents ?? 0) }}</span>
                      }
                    } @else {
                      —
                    }
                  </td>
                  <td class="px-4 py-2.5 text-[12px] whitespace-nowrap">
                    <p class="text-ink">{{ r.requested_by_name ?? '—' }}</p>
                    <p class="text-[10px] text-ink-muted">{{ formatDate(r.requested_at) }}</p>
                  </td>
                  <td class="px-4 py-2.5 text-[12px] whitespace-nowrap">
                    <p class="text-ink">{{ r.decided_by_name ?? '—' }}</p>
                    @if (r.decision_note) {
                      <p class="text-[10px] text-ink-muted truncate max-w-[180px]" [title]="r.decision_note">{{ r.decision_note }}</p>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-[12px] font-mono text-ink-soft whitespace-nowrap">{{ tatLabel(r.hours_to_decide) }}</td>
                  <td class="px-4 py-2.5 whitespace-nowrap">
                    <span [class]="historyStatusChip(r.status)">{{ r.status }}</span>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="px-4 py-12 text-center text-[13px] text-ink-muted">
                  No decided exceptions in this window.
                </td></tr>
              }
            }
          </tbody>
        </table>
      </div>
    } @else {

    @if (error()) {
      <div class="mb-4"><app-alert tone="danger" title="Could not load inbox">{{ error() }}</app-alert></div>
    }

    @if (loading() && items().length === 0) {
      <div class="py-16 text-center text-[13px] text-ink-muted">Loading…</div>
    } @else if (items().length === 0) {
      <div class="bg-surface-card border border-border rounded-[10px] py-16 text-center">
        <p class="text-[14px] text-ink-muted font-medium">All clear</p>
        <p class="text-[12px] text-ink-muted mt-1">Nothing in this lane right now.</p>
      </div>
    } @else {
      <div class="bg-surface-card border border-border rounded-[10px] overflow-hidden divide-y divide-border">
        @for (item of items(); track item.id) {
          <article>
            <!-- Card head (always visible) -->
            <header class="px-4 py-3.5 flex items-start gap-3 hover:bg-surface-muted transition-colors">
              <span class="mt-1.5 size-2 rounded-full shrink-0" [class]="dotCls(item)"></span>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-[13px] font-medium text-ink leading-tight">{{ item.title }}</p>
                  <span [class]="priorityChipCls(item)">{{ item.priority }}</span>
                </div>
                @if (item.subtitle) {
                  <p class="text-[12px] text-ink-soft mt-0.5 line-clamp-2">{{ item.subtitle }}</p>
                }

                <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold">
                    {{ subtypeLabel(item.subtype) }}
                  </span>
                  @if (item.requested_by_name) {
                    <span class="text-[11px] text-ink-muted">by {{ item.requested_by_name }}</span>
                  }
                  @if (item.amount_cents != null) {
                    <span class="text-[11px] font-mono text-ink-soft">{{ formatINR(item.amount_cents) }}</span>
                  }
                  <span class="text-[11px] text-ink-muted" [title]="item.created_at">{{ relativeTime(item.created_at) }}</span>

                  <div class="ml-auto flex items-center gap-2">
                    @if (item.kind === 'approval' && item.source === 'exception_request' && canApprove(item)) {
                      <button type="button" (click)="toggleExpand(item)"
                              [disabled]="busyId() === item.id"
                              class="h-7 px-2.5 inline-flex items-center rounded-md bg-primary-600 text-white text-[11px] font-medium hover:bg-primary-500 disabled:opacity-50">
                        {{ expandedId() === item.id ? 'Close' : 'Review' }}
                      </button>
                    }
                    @if (item.action_url && item.source !== 'exception_request') {
                      <a [routerLink]="item.action_url"
                         class="h-7 px-2.5 inline-flex items-center rounded-md border border-border text-[11px] font-medium text-ink-soft hover:bg-surface-subtle">
                        Open →
                      </a>
                    }
                  </div>
                </div>
              </div>
            </header>

            <!-- Expanded review panel (lazy-loaded context) -->
            @if (expandedId() === item.id) {
              <div class="bg-surface-muted/40 border-t border-border px-4 py-4">
                @if (contextLoading()) {
                  <p class="text-[12px] text-ink-muted">Loading context…</p>
                } @else if (contextError()) {
                  <app-alert tone="danger">{{ contextError() }}</app-alert>
                } @else if (invoiceContext(); as ctx) {

                  <!-- Patient + bill metadata strip -->
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <!-- Patient -->
                    <div class="rounded-md border border-border bg-surface-card p-3">
                      <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Patient</p>
                      @if (ctx.patient; as p) {
                        <p class="text-[13px] font-medium text-ink leading-tight">{{ p.full_name }}</p>
                        <p class="text-[11px] text-ink-muted font-mono mt-0.5">UHID {{ p.uhid }}</p>
                        @if (p.mobile) {
                          <p class="text-[11px] text-ink-muted mt-0.5">📱 {{ p.mobile }}</p>
                        }
                      } @else {
                        <p class="text-[11px] text-ink-muted">No patient linked (B2B invoice)</p>
                      }
                    </div>

                    <!-- Invoice -->
                    <div class="rounded-md border border-border bg-surface-card p-3">
                      <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1">Invoice</p>
                      <p class="text-[13px] font-mono text-ink leading-tight">{{ ctx.invoice.invoice_number }}</p>
                      <p class="text-[11px] text-ink-muted mt-0.5">
                        Subtotal {{ formatINR(ctx.invoice.subtotal_cents) }} · Total {{ formatINR(ctx.invoice.total_cents) }}
                      </p>
                      <p class="text-[11px] text-ink-muted mt-0.5 capitalize">Status: {{ ctx.invoice.status }}</p>
                    </div>

                    <!-- Bill composition -->
                    <div class="rounded-md border border-border bg-surface-card p-3">
                      <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-1.5">Bill composition</p>
                      @if (ctx.line_breakdown.length === 0) {
                        <p class="text-[11px] text-ink-muted">No line items</p>
                      } @else {
                        <ul class="space-y-1">
                          @for (b of ctx.line_breakdown; track b.kind) {
                            <li class="flex items-center justify-between text-[11px]">
                              <span class="inline-flex items-center gap-1.5">
                                <span class="size-1.5 rounded-full bg-primary-600"></span>
                                <span class="text-ink">{{ kindLabel(b.kind) }}</span>
                                <span class="text-ink-muted">×{{ b.count }}</span>
                              </span>
                              <span class="font-mono text-ink-soft">{{ formatINR(b.total_cents) }}</span>
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  </div>

                  <!-- Discount approval row -->
                  @if (isInvoiceDiscount(item)) {
                    <div class="rounded-md border border-border bg-surface-card p-3 mb-3">
                      <p class="text-[10px] uppercase tracking-[0.06em] text-ink-muted font-semibold mb-2">Decision</p>

                      <div class="flex items-end gap-3 flex-wrap">
                        <label class="flex-1 min-w-[180px]">
                          <span class="block text-[11px] text-ink-muted mb-1">Approve with discount amount (₹)</span>
                          <input type="number" min="0" step="1" [(ngModel)]="proposedRupees"
                                 class="w-full h-9 px-2.5 text-[13px] font-mono bg-surface-muted border border-border rounded-md text-ink focus:outline-none focus:border-primary-600 focus:ring-[3px] focus:ring-primary-100" />
                        </label>
                        <div class="text-[11px] text-ink-muted font-mono pb-2">
                          {{ approvePctText(ctx) }}
                        </div>
                      </div>

                      @if (proposedRupees != null && (proposedRupees * 100) !== (item.amount_cents ?? 0)) {
                        <p class="text-[11px] text-warn-fg mt-2">
                          ⚠ Approving {{ formatINR(proposedRupees * 100) }} instead of the requested {{ formatINR(item.amount_cents ?? 0) }}.
                        </p>
                      }

                      <div class="flex items-center justify-end gap-2 mt-3">
                        <button type="button" (click)="toggleExpand(item)"
                                class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                          Cancel
                        </button>
                        <button type="button" (click)="reject(item)" [disabled]="busyId() === item.id"
                                class="h-8 px-3 rounded-md border border-danger-border text-danger-fg text-[12px] font-medium hover:bg-danger-bg disabled:opacity-50">
                          Reject
                        </button>
                        <button type="button" (click)="approveWithEdit(item, ctx)" [disabled]="busyId() === item.id || !validProposed(ctx)"
                                class="h-8 px-3 rounded-md bg-good-fg text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50">
                          {{ busyId() === item.id ? 'Approving…' : 'Approve' }}
                        </button>
                      </div>
                    </div>
                  } @else {
                    <!-- Non-discount approval: simple approve/reject -->
                    <div class="flex items-center justify-end gap-2">
                      <button type="button" (click)="toggleExpand(item)"
                              class="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink-soft hover:bg-surface-subtle">
                        Cancel
                      </button>
                      <button type="button" (click)="reject(item)" [disabled]="busyId() === item.id"
                              class="h-8 px-3 rounded-md border border-danger-border text-danger-fg text-[12px] font-medium hover:bg-danger-bg disabled:opacity-50">
                        Reject
                      </button>
                      <button type="button" (click)="approve(item)" [disabled]="busyId() === item.id"
                              class="h-8 px-3 rounded-md bg-good-fg text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50">
                        Approve
                      </button>
                    </div>
                  }
                }
              </div>
            }
          </article>
        }
      </div>
    }
    }
  `,
})
export class SmartInboxPage implements OnInit, OnDestroy {
  private svc = inject(SmartInboxService);
  private auth = inject(AuthStore);
  protected readonly branchStore = inject(BranchStore);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private static readonly VALID_TABS: ReadonlySet<TabValue> =
    new Set<TabValue>(['all', 'approval', 'task', 'awareness', 'history']);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  private readonly _all = signal<InboxItem[]>([]);

  protected readonly kind = signal<TabValue>('all');
  protected readonly searchCtrl = new FormControl('', { nonNullable: true });
  private readonly _search = signal('');

  // ── History tab state (lazy-loaded when user opens that tab) ────
  protected readonly historyRows    = signal<HistoryRow[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly historyError   = signal<string | null>(null);
  protected windowDays: HistoryWindowDays = 30;
  protected historySearch = '';
  protected readonly historyStatus = signal<HistoryStatusFilter>('all');
  protected readonly historyType   = signal<HistoryTypeFilter>('all');
  private   readonly _historySearch = signal('');

  protected readonly historyStatusOptions: { value: HistoryStatusFilter; label: string }[] = [
    { value: 'all',      label: 'All' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];
  protected readonly historyTypeOptions: { value: HistoryTypeFilter; label: string }[] = [
    { value: 'all',      label: 'All types' },
    { value: 'discount', label: 'Discount' },
    { value: 'other',    label: 'Other' },
  ];

  protected readonly chevronUrl =
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B7268' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

  protected readonly filteredHistory = computed<HistoryRow[]>(() => {
    const s = this._historySearch().trim().toLowerCase();
    const st = this.historyStatus();
    const ty = this.historyType();
    return this.historyRows().filter((r) => {
      if (st !== 'all' && r.status !== st) return false;
      if (ty === 'discount' && !r.exception_type.startsWith('invoice_discount')) return false;
      if (ty === 'other'    &&  r.exception_type.startsWith('invoice_discount')) return false;
      if (!s) return true;
      const hay = [
        r.ticket_no, r.invoice_number ?? '', r.patient_name ?? '', r.patient_uhid ?? '',
        r.requested_by_name ?? '', r.decided_by_name ?? '', r.title, r.exception_type,
      ].join(' ').toLowerCase();
      return hay.includes(s);
    });
  });

  protected readonly historySummary = computed(() => {
    const list = this.filteredHistory();
    const approved = list.filter((r) => r.status === 'approved');
    const rejected = list.filter((r) => r.status === 'rejected');
    const approvedTotalCents = approved.reduce((s, r) => s + (r.final_discount_cents ?? 0), 0);
    const rejectedTotalCents = rejected.reduce((s, r) => s + (r.requested_amount_cents ?? 0), 0);
    const total = list.length;
    const approvalRatePct = total > 0 ? Math.round((approved.length / total) * 100) : 0;
    const hours = list.map((r) => r.hours_to_decide).filter((h): h is number => h != null);
    const avgHours = hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
    return {
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      totalDecisions: total,
      approvedTotalCents,
      rejectedTotalCents,
      approvalRatePct,
      avgHoursLabel: this.formatHours(avgHours),
    };
  });

  // Expansion state: id of the currently expanded card and its lazy context
  protected readonly expandedId   = signal<string | null>(null);
  protected readonly contextLoading = signal(false);
  protected readonly contextError = signal<string | null>(null);
  protected readonly invoiceContext = signal<InvoiceApprovalContext | null>(null);
  /** Discount amount the approver wants to apply (₹). Defaults to the requested amount when card opens. */
  protected proposedRupees: number | null = null;

  protected readonly tabs: { value: TabValue; label: string }[] = [
    { value: 'all',       label: 'All' },
    { value: 'approval',  label: 'Approvals' },
    { value: 'task',      label: 'Tasks' },
    { value: 'awareness', label: 'Awareness' },
    { value: 'history',   label: 'History' },
  ];

  protected readonly items = computed<InboxItem[]>(() => {
    const k = this.kind();
    const s = this._search().trim().toLowerCase();
    return this._all()
      .filter((i) => k === 'all' || i.kind === k)
      .filter((i) => !s
        || i.title.toLowerCase().includes(s)
        || (i.subtitle ?? '').toLowerCase().includes(s));
  });

  protected kindCount(k: TabValue): number {
    if (k === 'history') return this.historyRows().length;
    if (k === 'all')     return this._all().length;
    return this._all().filter((i) => i.kind === k).length;
  }

  // Reload when active branch changes (history reloads only if it's the active tab)
  private readonly _branchSync = effect(() => {
    this.branchStore.activeBranchId();
    untracked(() => {
      void this.load();
      if (this.kind() === 'history') void this.loadHistory();
    });
  });

  private unsubscribe: (() => void) | null = null;

  ngOnInit() {
    // Apply ?tab=... deep-link (also reacts if the user navigates within the page)
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const t = (pm.get('tab') ?? 'all') as TabValue;
      if (SmartInboxPage.VALID_TABS.has(t)) this.setKind(t);
    });
    this.searchCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this._search.set(v ?? ''));
    void this.load();
    this.unsubscribe = this.svc.subscribe(() => void this.load());
  }

  ngOnDestroy() { this.unsubscribe?.(); }

  protected setKind(k: TabValue) {
    if (this.kind() === k) return;
    this.kind.set(k);
    if (k === 'history') void this.loadHistory();
    // Reflect into URL so the tab is bookmarkable / shareable
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: k === 'all' ? null : k },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected async refresh() {
    if (this.kind() === 'history') await this.loadHistory();
    else                            await this.load();
  }

  protected async loadHistory() {
    this.historyLoading.set(true);
    this.historyError.set(null);
    try {
      const sinceIso = subDays(new Date(), this.windowDays).toISOString();
      const rows = await this.svc.listHistory({
        branchId: this.branchStore.activeBranchId(),
        sinceIso,
      });
      this.historyRows.set(rows);
    } catch (e) {
      this.historyError.set(e instanceof Error ? e.message : 'Could not load history');
    } finally {
      this.historyLoading.set(false);
    }
  }

  protected setHistoryStatus(s: HistoryStatusFilter) { this.historyStatus.set(s); }
  protected setHistoryType(t: HistoryTypeFilter)     { this.historyType.set(t); }
  protected onHistorySearch()                        { this._historySearch.set(this.historySearch); }

  protected exportHistoryCsv() {
    const rows = this.filteredHistory();
    if (rows.length === 0) return;
    const headers = [
      'Ticket','Decided at','Type','Status','Branch','Patient UHID','Patient',
      'Invoice','Subtotal (INR)','Requested (INR)','Approved (INR)',
      'Requested by','Requested at','Decided by','Hours to decide',
      'Reason','Decision note',
    ];
    const data = rows.map((r): (string | number | null)[] => [
      r.ticket_no,
      r.decided_at ?? '',
      r.exception_type,
      r.status,
      r.branch_code ?? '',
      r.patient_uhid ?? '',
      r.patient_name ?? '',
      r.invoice_number ?? '',
      ((r.invoice_subtotal_cents ?? 0) / 100).toFixed(2),
      ((r.requested_amount_cents ?? 0) / 100).toFixed(2),
      r.status === 'approved' ? ((r.final_discount_cents ?? 0) / 100).toFixed(2) : '',
      r.requested_by_name ?? '',
      r.requested_at,
      r.decided_by_name ?? '',
      r.hours_to_decide != null ? r.hours_to_decide.toFixed(2) : '',
      r.title.replace(/\n/g, ' '),
      (r.decision_note ?? '').replace(/\n/g, ' '),
    ]);
    downloadCsv(`approval-history-${new Date().toISOString().slice(0, 10)}.csv`, headers, data);
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.svc.list({
        branchId: this.branchStore.activeBranchId(),
        kind: 'all',
        search: '',
      });
      this._all.set(rows);
      // If the currently expanded item is no longer in the list, collapse
      if (this.expandedId() && !rows.find((r) => r.id === this.expandedId())) {
        this.collapseAll();
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load inbox.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Expand / collapse with lazy context fetch ──────────────
  protected async toggleExpand(item: InboxItem) {
    if (this.expandedId() === item.id) {
      this.collapseAll();
      return;
    }
    this.expandedId.set(item.id);
    this.invoiceContext.set(null);
    this.contextError.set(null);
    this.proposedRupees = item.amount_cents != null ? item.amount_cents / 100 : null;

    if (this.isInvoiceDiscountSubtype(item.subtype)) {
      this.contextLoading.set(true);
      try {
        const invoiceId = await this.svc.resolveSourceRecordId(item);
        const ctx = await this.svc.getInvoiceContext(invoiceId);
        this.invoiceContext.set(ctx);
      } catch (e) {
        this.contextError.set(e instanceof Error ? e.message : 'Failed to load invoice');
      } finally {
        this.contextLoading.set(false);
      }
    }
  }

  private collapseAll() {
    this.expandedId.set(null);
    this.invoiceContext.set(null);
    this.contextError.set(null);
    this.proposedRupees = null;
  }

  // ── Decision flow ───────────────────────────────────────────
  protected canApprove(item: InboxItem): boolean {
    if (this.auth.hasRole('super_admin')) return true;
    if (item.requested_by_id && item.requested_by_id === this.auth.staffId()) return false;
    return this.auth.has(item.required_perm as any);
  }

  protected async approve(item: InboxItem) {
    if (!confirm(`Approve "${item.title}"?`)) return;
    this.busyId.set(item.id);
    try {
      await this.svc.decide(item.source_id, 'approved', null, null);
      this.toast.success('Approved', item.title);
      this._all.update((rows) => rows.filter((r) => r.id !== item.id));
      this.collapseAll();
    } catch (e) {
      this.toast.error('Approve failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      this.busyId.set(null);
    }
  }

  /** Approve a discount, optionally with a modified amount edited by the approver. */
  protected async approveWithEdit(item: InboxItem, ctx: InvoiceApprovalContext) {
    const cents = Math.round((this.proposedRupees ?? 0) * 100);
    if (cents <= 0 || cents > ctx.invoice.subtotal_cents) return;
    const original = item.amount_cents ?? 0;
    const edited = cents !== original;
    const msg = edited
      ? `Approve ${this.formatINR(cents)} instead of the requested ${this.formatINR(original)}?`
      : `Approve discount of ${this.formatINR(cents)}?`;
    if (!confirm(msg)) return;

    this.busyId.set(item.id);
    try {
      await this.svc.decide(
        item.source_id,
        'approved',
        edited ? `Approved with modified amount: ${this.formatINR(cents)}` : null,
        // Only override discount_cents — leaving payload.amount_cents untouched
        // preserves the originally-requested amount for the History view.
        edited ? { discount_cents: cents } : null,
      );
      this.toast.success('Approved', `${this.formatINR(cents)} applied to ${ctx.invoice.invoice_number}`);
      this._all.update((rows) => rows.filter((r) => r.id !== item.id));
      this.collapseAll();
    } catch (e) {
      this.toast.error('Approve failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      this.busyId.set(null);
    }
  }

  protected async reject(item: InboxItem) {
    const note = window.prompt('Reason for rejection (required, min 4 chars):') ?? '';
    if (note.trim().length < 4) return;
    this.busyId.set(item.id);
    try {
      await this.svc.decide(item.source_id, 'rejected', note.trim(), null);
      this.toast.success('Rejected', item.title);
      this._all.update((rows) => rows.filter((r) => r.id !== item.id));
      this.collapseAll();
    } catch (e) {
      this.toast.error('Reject failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      this.busyId.set(null);
    }
  }

  // ── Helpers ────────────────────────────────────────────────
  protected isInvoiceDiscount(item: InboxItem): boolean {
    return this.isInvoiceDiscountSubtype(item.subtype);
  }
  private isInvoiceDiscountSubtype(s: string): boolean {
    return s === 'invoice_discount_branch' || s === 'invoice_discount_super';
  }

  protected approvePctText(ctx: InvoiceApprovalContext): string {
    const cents = Math.round((this.proposedRupees ?? 0) * 100);
    if (!cents || !ctx.invoice.subtotal_cents) return '—';
    const pct = (cents / ctx.invoice.subtotal_cents) * 100;
    return `${pct.toFixed(2)}% of subtotal · net ${this.formatINR(ctx.invoice.subtotal_cents - cents)}`;
  }

  protected validProposed(ctx: InvoiceApprovalContext): boolean {
    const cents = Math.round((this.proposedRupees ?? 0) * 100);
    return cents > 0 && cents <= ctx.invoice.subtotal_cents;
  }

  protected kindLabel(kind: string): string {
    return LINE_KIND_LABEL[kind] ?? this.subtypeLabel(kind);
  }

  // ── UI tone helpers ────────────────────────────────────────
  protected tabCls(value: TabValue): string {
    const active = this.kind() === value;
    const base = 'h-8 px-3 inline-flex items-center rounded-md text-[12px] font-medium transition-colors';
    return active
      ? `${base} bg-primary-600 text-white`
      : `${base} bg-surface-card border border-border text-ink-soft hover:bg-surface-muted`;
  }

  protected dotCls(item: InboxItem): string {
    return PRIORITY_TONE[item.priority].dot;
  }

  protected priorityChipCls(item: InboxItem): string {
    return `inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-medium ${PRIORITY_TONE[item.priority].chip}`;
  }

  protected relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  protected formatINR(cents: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  protected subtypeLabel(s: string): string {
    return s.replace(/_/g, ' ');
  }

  // ── History display helpers ────────────────────────────────
  protected formatDate(iso: string): string {
    try { return format(parseISO(iso), 'd MMM, HH:mm'); } catch { return iso; }
  }
  protected formatHours(h: number): string {
    if (h <= 0) return '—';
    if (h < 1)  return `${Math.round(h * 60)}m`;
    if (h < 48) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  }
  protected tatLabel(h: number | null): string {
    return h == null ? '—' : this.formatHours(h);
  }
  protected historyTypeLabel(t: string): string {
    if (t === 'invoice_discount_branch') return 'Discount · branch';
    if (t === 'invoice_discount_super')  return 'Discount · super';
    return t.replace(/_/g, ' ');
  }
  protected historyPillCls(active: boolean): string {
    const base = 'h-7 px-3 rounded-md text-[12px] font-medium transition-colors';
    return active ? `${base} bg-primary-600 text-white` : `${base} bg-surface-muted text-ink-soft hover:bg-surface-subtle`;
  }
  protected historyStatusChip(status: string): string {
    const tone = status === 'approved'
      ? 'bg-good-bg text-good-fg'
      : status === 'rejected' ? 'bg-danger-bg text-danger-fg' : 'bg-surface-subtle text-ink-muted';
    return `inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-medium ${tone}`;
  }
}
