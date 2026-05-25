import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DischargeTemplatesService } from '../data/discharge-templates.service';
import type { DischargeSummaryTemplate } from '../data/discharge-templates.types';

type Tab = 'library' | 'apply';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Discharge Summary Templates</h1>
    <p class="text-[12px] text-ink-soft">Pre-built templates by specialty · apply to admissions to auto-fill summary</p>
  </header>

  <nav class="flex gap-1 border-b border-border">
    @for (t of tabs; track t.id) {
      <button (click)="setTab(t.id)"
              class="px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px"
              [class.text-brand]="tab() === t.id"
              [class.border-brand]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-ink-soft]="tab() !== t.id">
        {{ t.label }}<span class="ml-1 text-[10px] text-ink-soft">{{ t.count() }}</span>
      </button>
    }
  </nav>

  <!-- LIBRARY -->
  @if (tab() === 'library') {
    <div class="rounded-md border border-border bg-surface-card">
      <div class="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2 justify-between">
        <h2 class="text-sm font-semibold">Templates ({{ filtered().length }})</h2>
        <div class="flex items-center gap-2">
          <input [(ngModel)]="search" placeholder="Search title / specialty…"
                 class="w-56 rounded-md border border-border bg-surface px-2 py-1 text-[12px]" />
          <select [(ngModel)]="specialtyFilter"
                  class="rounded-md border border-border bg-surface px-2 py-1 text-[12px]">
            <option [ngValue]="null">All specialties</option>
            @for (s of specialties(); track s) { <option [value]="s">{{ s }}</option> }
          </select>
          <button (click)="openNew()" class="px-3 py-1.5 text-[12px] rounded-md bg-brand text-white">+ New</button>
        </div>
      </div>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Title</th>
              <th class="px-3 py-2">Specialty</th>
              <th class="px-3 py-2 text-right">Used</th>
              <th class="px-3 py-2">Active</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (t of filtered(); track t.id) {
            <tr class="border-t border-border" [class.opacity-50]="!t.is_active">
              <td class="px-3 py-2 font-mono text-[10px]">{{ t.code }}</td>
              <td class="px-3 py-2 font-semibold">{{ t.title }}</td>
              <td class="px-3 py-2 text-[11px]">{{ t.specialty || '—' }}</td>
              <td class="px-3 py-2 text-right">{{ t.usage_count }}</td>
              <td class="px-3 py-2">
                <input type="checkbox" [checked]="t.is_active"
                       (change)="toggleActive(t, $event)" />
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="openEdit(t)" class="text-[11px] text-brand hover:underline">Edit</button>
                <span class="mx-1">·</span>
                <button (click)="useFromLibrary(t)" class="text-[11px] text-good-fg hover:underline">Apply</button>
              </td>
            </tr>
          }
          @if (filtered().length === 0) {
            <tr><td colspan="6" class="px-3 py-3 text-center text-ink-soft">No templates found.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- APPLY -->
  @if (tab() === 'apply') {
    <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
      <h3 class="text-sm font-semibold">Apply Template to Admission</h3>
      <div class="grid md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Admission ID *</span>
          <input [(ngModel)]="applyAdmissionId" placeholder="UUID"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Template *</span>
          <select [(ngModel)]="applyTemplateId"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick template —</option>
            @for (t of activeTemplates(); track t.id) {
              <option [ngValue]="t.id">{{ t.title }}{{ t.specialty ? ' (' + t.specialty + ')' : '' }}</option>
            }
          </select>
        </label>
        <label class="md:col-span-2 flex items-center gap-2 text-[12px]">
          <input type="checkbox" [(ngModel)]="applyOverwrite" />
          Overwrite existing fields (default: only fill blanks)
        </label>
        @if (applyError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ applyError() }}</p> }
        @if (applySuccess()) { <p class="md:col-span-2 text-[12px] text-good-fg">{{ applySuccess() }}</p> }
        <div class="md:col-span-2 flex justify-end">
          <button (click)="apply()" [disabled]="!applyAdmissionId.trim() || !applyTemplateId || applyBusy()"
                  class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ applyBusy() ? 'Applying…' : 'Apply Template' }}
          </button>
        </div>
      </div>

      @if (selectedPreview(); as t) {
        <div class="rounded-md border border-border bg-surface-subtle p-3 space-y-2 text-[12px]">
          <h4 class="font-semibold">{{ t.title }}</h4>
          <p class="text-ink-soft">{{ t.description }}</p>
          @if (t.course_in_hospital) {
            <details><summary class="cursor-pointer text-[11px] font-bold uppercase text-ink-soft">Course in hospital</summary>
              <pre class="whitespace-pre-wrap mt-1 text-[11px]">{{ t.course_in_hospital }}</pre>
            </details>
          }
          @if (t.discharge_medications) {
            <details><summary class="cursor-pointer text-[11px] font-bold uppercase text-ink-soft">Discharge medications</summary>
              <pre class="whitespace-pre-wrap mt-1 text-[11px]">{{ t.discharge_medications }}</pre>
            </details>
          }
          @if (t.follow_up_instructions) {
            <details><summary class="cursor-pointer text-[11px] font-bold uppercase text-ink-soft">Follow-up</summary>
              <pre class="whitespace-pre-wrap mt-1 text-[11px]">{{ t.follow_up_instructions }}</pre>
            </details>
          }
        </div>
      }
    </div>
  }
</section>

<!-- Edit / New dialog -->
@if (editing()) {
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" (document:keydown.escape)="closeEdit()">
    <div class="w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-lg bg-surface-card border border-border shadow-2xl"
         (click)="$event.stopPropagation()">
      <div class="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ editing()!.id ? 'Edit Template' : 'New Template' }}</h3>
        <button (click)="closeEdit()">✕</button>
      </div>
      <div class="p-4 grid md:grid-cols-2 gap-3 text-sm">
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Code *</span>
          <input [(ngModel)]="form.code" [disabled]="!!editing()!.id"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
        </label>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Specialty</span>
          <input [(ngModel)]="form.specialty"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Title *</span>
          <input [(ngModel)]="form.title"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        <label class="md:col-span-2 block">
          <span class="text-[10px] uppercase text-ink-soft">Description</span>
          <input [(ngModel)]="form.description"
                 class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
        </label>
        @for (f of editFields; track f.key) {
          <label class="md:col-span-2 block">
            <span class="text-[10px] uppercase text-ink-soft">{{ f.label }}</span>
            <textarea rows="3" [(ngModel)]="form[f.key]"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
          </label>
        }
        @if (editError()) { <p class="md:col-span-2 text-[12px] text-danger-fg">{{ editError() }}</p> }
      </div>
      <div class="px-4 py-3 border-t border-border flex justify-end gap-2">
        <button (click)="closeEdit()" class="px-3 py-1.5 text-sm rounded-md border border-border">Cancel</button>
        <button (click)="saveEdit()" [disabled]="editBusy() || !form.code?.trim() || !form.title?.trim()"
                class="px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ editBusy() ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
}
  `,
})
export class DischargeTemplatesPage implements OnInit {
  private svc = inject(DischargeTemplatesService);

  protected tab = signal<Tab>('library');
  protected templates = signal<DischargeSummaryTemplate[]>([]);
  protected search = '';
  protected specialtyFilter: string | null = null;

  protected activeTemplates = computed(() => this.templates().filter(t => t.is_active));
  protected specialties = computed(() => {
    const set = new Set<string>();
    for (const t of this.templates()) if (t.specialty) set.add(t.specialty);
    return [...set].sort();
  });
  protected filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    return this.templates().filter(t => {
      if (this.specialtyFilter && t.specialty !== this.specialtyFilter) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) ||
             (t.specialty ?? '').toLowerCase().includes(q) ||
             t.code.toLowerCase().includes(q);
    });
  });

  protected tabs = [
    { id: 'library' as Tab, label: 'Library', count: () => this.templates().length },
    { id: 'apply'   as Tab, label: 'Apply',   count: () => this.activeTemplates().length },
  ];

  // Apply form
  protected applyAdmissionId = '';
  protected applyTemplateId: string | null = null;
  protected applyOverwrite = false;
  protected applyBusy = signal(false);
  protected applyError = signal<string | null>(null);
  protected applySuccess = signal<string | null>(null);
  protected selectedPreview = computed(() =>
    this.applyTemplateId ? this.templates().find(t => t.id === this.applyTemplateId) ?? null : null,
  );

  // Edit dialog
  protected editing = signal<Partial<DischargeSummaryTemplate> | null>(null);
  protected form: any = {};
  protected editBusy = signal(false);
  protected editError = signal<string | null>(null);
  protected editFields = [
    { key: 'presenting_complaint',     label: 'Presenting complaint' },
    { key: 'history_of_present_illness', label: 'History of present illness' },
    { key: 'examination_findings',     label: 'Examination findings' },
    { key: 'course_in_hospital',       label: 'Course in hospital' },
    { key: 'procedures_performed',     label: 'Procedures performed' },
    { key: 'condition_at_discharge',   label: 'Condition at discharge' },
    { key: 'discharge_diagnosis_icd10', label: 'Discharge diagnosis / ICD-10' },
    { key: 'discharge_medications',    label: 'Discharge medications' },
    { key: 'follow_up_instructions',   label: 'Follow-up instructions' },
    { key: 'diet_advice',              label: 'Diet advice' },
    { key: 'activity_advice',          label: 'Activity advice' },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try { this.templates.set(await this.svc.list({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected useFromLibrary(t: DischargeSummaryTemplate) {
    this.applyTemplateId = t.id;
    this.tab.set('apply');
  }

  protected async toggleActive(t: DischargeSummaryTemplate, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    try { await this.svc.toggleActive(t.id, checked); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected openNew() {
    this.editing.set({});
    this.form = { is_active: true };
    this.editError.set(null);
  }
  protected openEdit(t: DischargeSummaryTemplate) {
    this.editing.set(t);
    this.form = { ...t };
    this.editError.set(null);
  }
  protected closeEdit() { this.editing.set(null); }

  protected async saveEdit() {
    if (!this.form.code?.trim() || !this.form.title?.trim()) return;
    this.editBusy.set(true); this.editError.set(null);
    try {
      const cur = this.editing()!;
      if (cur.id) {
        await this.svc.update(cur.id, this.form);
      } else {
        await this.svc.create(this.form);
      }
      this.closeEdit();
      await this.refresh();
    } catch (e: any) { this.editError.set(e?.message ?? 'Failed'); }
    finally { this.editBusy.set(false); }
  }

  protected async apply() {
    if (!this.applyAdmissionId.trim() || !this.applyTemplateId) return;
    this.applyBusy.set(true); this.applyError.set(null); this.applySuccess.set(null);
    try {
      await this.svc.applyToAdmission(this.applyAdmissionId.trim(), this.applyTemplateId, this.applyOverwrite);
      this.applySuccess.set('Template applied. Open the discharge summary to review and finalise.');
      this.applyAdmissionId = '';
    } catch (e: any) { this.applyError.set(e?.message ?? 'Failed'); }
    finally { this.applyBusy.set(false); }
  }
}
