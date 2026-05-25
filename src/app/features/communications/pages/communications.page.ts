import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommunicationsService } from '../data/communications.service';
import {
  CHANNEL_LABELS, EVENT_LABELS, STATUS_LABELS,
  type CommChannel, type CommEvent, type CommLog, type CommStatus, type CommTemplate,
} from '../data/communications.types';

type Tab = 'send' | 'templates' | 'log';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Patient Communications</h1>
    <p class="text-[12px] text-ink-soft">SMS · WhatsApp · Email templates · DLT-compliant · delivery tracking</p>
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

  <!-- SEND -->
  @if (tab() === 'send') {
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="rounded-md border border-border bg-surface-card p-4 space-y-3">
        <h3 class="text-sm font-semibold">Send Message</h3>
        <label class="block">
          <span class="text-[10px] uppercase text-ink-soft">Template *</span>
          <select [(ngModel)]="sTemplateCode" (ngModelChange)="onTemplateChange($event)"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
            <option [ngValue]="null">— pick —</option>
            @for (t of templates(); track t.id) {
              <option [value]="t.code">{{ t.code }} · {{ t.name }} ({{ channelLabel(t.channel) }})</option>
            }
          </select>
        </label>
        @if (selectedTemplate(); as t) {
          @if (t.channel === 'sms' || t.channel === 'whatsapp' || t.channel === 'voice_call') {
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Phone *</span>
              <input [(ngModel)]="sToPhone" placeholder="+91-9876543210"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
          }
          @if (t.channel === 'email') {
            <label class="block">
              <span class="text-[10px] uppercase text-ink-soft">Email *</span>
              <input [(ngModel)]="sToEmail" type="email"
                     class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
            </label>
          }
          <label class="block">
            <span class="text-[10px] uppercase text-ink-soft">Patient ID (optional)</span>
            <input [(ngModel)]="sPatientId" placeholder="UUID"
                   class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-mono text-[11px]" />
          </label>
          @if (t.variables.length > 0) {
            <div class="rounded-md border border-border p-2 bg-surface-subtle space-y-1">
              <p class="text-[10px] font-bold uppercase text-ink-soft">Variables</p>
              @for (v of t.variables; track v) {
                <label class="block">
                  <span class="text-[10px] text-ink-soft font-mono">{{ varDisplay(v) }}</span>
                  <input [ngModel]="sVariables()[v] || ''"
                         (ngModelChange)="setVariable(v, $event)"
                         class="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-[12px]" />
                </label>
              }
            </div>
          }
          @if (sError()) { <p class="text-[12px] text-danger-fg">{{ sError() }}</p> }
          @if (sSuccess()) { <p class="text-[12px] text-good-fg">{{ sSuccess() }}</p> }
          <button (click)="send()"
                  [disabled]="sBusy() || !canSend()"
                  class="w-full px-3 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
            {{ sBusy() ? 'Sending…' : 'Send' }}
          </button>
        }
      </div>

      @if (selectedTemplate(); as t) {
        <div class="rounded-md border border-border bg-surface-card p-4">
          <h3 class="text-sm font-semibold mb-2">Preview</h3>
          @if (t.subject) {
            <p class="text-[10px] uppercase text-ink-soft">Subject</p>
            <p class="text-[13px] font-semibold mb-3">{{ renderPreview(t.subject) }}</p>
          }
          <p class="text-[10px] uppercase text-ink-soft">Body</p>
          <pre class="whitespace-pre-wrap text-[12px] mt-1 p-3 bg-surface-subtle rounded border border-border">{{ renderPreview(t.body) }}</pre>
          <div class="mt-2 flex gap-1.5 flex-wrap">
            <span class="text-[10px] text-ink-soft">Channel:</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-brand text-white">
              {{ channelLabel(t.channel) }}
            </span>
            @if (t.dlt_template_id) {
              <span class="text-[10px] text-ink-soft">DLT: <span class="font-mono">{{ t.dlt_template_id }}</span></span>
            }
          </div>
        </div>
      }
    </div>
  }

  <!-- TEMPLATES -->
  @if (tab() === 'templates') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Channel</th><th class="px-3 py-2">Event</th>
              <th class="px-3 py-2">Variables</th><th class="px-3 py-2">Active</th></tr>
        </thead>
        <tbody>
          @for (t of templates(); track t.id) {
            <tr class="border-t border-border" [class.opacity-50]="!t.is_active">
              <td class="px-3 py-2 font-mono">{{ t.code }}</td>
              <td class="px-3 py-2">{{ t.name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ channelLabel(t.channel) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ eventLabel(t.event_type) }}</td>
              <td class="px-3 py-2 text-[10px] font-mono">{{ t.variables.join(', ') }}</td>
              <td class="px-3 py-2">
                <input type="checkbox" [checked]="t.is_active" (change)="toggleActive(t, $event)" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- LOG -->
  @if (tab() === 'log') {
    <div class="rounded-md border border-border bg-surface-card">
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Channel</th>
              <th class="px-3 py-2">Event</th><th class="px-3 py-2">To</th>
              <th class="px-3 py-2">Patient</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Provider</th></tr>
        </thead>
        <tbody>
          @for (l of logs(); track l.id) {
            <tr class="border-t border-border"
                [class.bg-danger-fg]="l.status === 'failed' || l.status === 'bounced'"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 text-[11px]">{{ l.created_at | date:'short' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ channelLabel(l.channel) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ eventLabel(l.event_type) }}</td>
              <td class="px-3 py-2 text-[11px]">{{ l.to_phone || l.to_email || '—' }}</td>
              <td class="px-3 py-2 font-mono text-[10px]">{{ l.patient_id ? l.patient_id.slice(0,8) : '—' }}</td>
              <td class="px-3 py-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      [class.bg-good-fg]="l.status === 'delivered' || l.status === 'read'"
                      [class.bg-warn-fg]="l.status === 'sent' || l.status === 'pending'"
                      [class.bg-danger-fg]="l.status === 'failed' || l.status === 'bounced'"
                      [class.text-white]="true">{{ statusLabel(l.status) }}</span>
              </td>
              <td class="px-3 py-2 text-[11px]">{{ l.provider || '—' }}</td>
            </tr>
          }
          @if (logs().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No messages sent.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }
</section>
  `,
})
export class CommunicationsPage implements OnInit {
  private svc = inject(CommunicationsService);

  protected tab = signal<Tab>('send');
  protected templates = signal<CommTemplate[]>([]);
  protected logs = signal<CommLog[]>([]);

  // Send form
  protected sTemplateCode: string | null = null;
  protected sToPhone = '';
  protected sToEmail = '';
  protected sPatientId = '';
  protected sVariables = signal<Record<string, string>>({});
  protected sBusy = signal(false);
  protected sError = signal<string | null>(null);
  protected sSuccess = signal<string | null>(null);

  protected varDisplay = (v: string) => '{{' + v + '}}';
  protected channelLabel = (c: CommChannel) => CHANNEL_LABELS[c];
  protected eventLabel   = (e: CommEvent) => EVENT_LABELS[e];
  protected statusLabel  = (s: CommStatus) => STATUS_LABELS[s];

  protected selectedTemplate = computed(() =>
    this.sTemplateCode ? this.templates().find(t => t.code === this.sTemplateCode) ?? null : null,
  );

  protected canSend = () => {
    const t = this.selectedTemplate(); if (!t) return false;
    if ((t.channel === 'sms' || t.channel === 'whatsapp') && !this.sToPhone.trim()) return false;
    if (t.channel === 'email' && !this.sToEmail.trim()) return false;
    return true;
  };

  protected tabs = [
    { id: 'send'      as Tab, label: 'Send',     count: () => 0 },
    { id: 'templates' as Tab, label: 'Templates', count: () => this.templates().length },
    { id: 'log'       as Tab, label: 'Sent Log',  count: () => this.logs().length },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try {
      const [templates, logs] = await Promise.all([
        this.svc.listTemplates({ activeOnly: true }),
        this.svc.listLogs({}),
      ]);
      this.templates.set(templates);
      this.logs.set(logs);
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected onTemplateChange(_code: string | null) {
    this.sVariables.set({});
    this.sError.set(null);
    this.sSuccess.set(null);
  }

  protected setVariable(key: string, value: string) {
    this.sVariables.update(v => ({ ...v, [key]: value }));
  }

  protected renderPreview(text: string): string {
    const vars = this.sVariables();
    let result = text;
    for (const [k, v] of Object.entries(vars)) {
      result = result.replaceAll(`{{${k}}}`, v || `[${k}]`);
    }
    // Highlight unfilled placeholders
    return result;
  }

  protected async send() {
    const t = this.selectedTemplate(); if (!t || !this.canSend()) return;
    this.sBusy.set(true); this.sError.set(null); this.sSuccess.set(null);
    try {
      await this.svc.send({
        templateCode: t.code,
        toPhone: this.sToPhone.trim() || null,
        toEmail: this.sToEmail.trim() || null,
        patientId: this.sPatientId.trim() || null,
        variables: this.sVariables(),
      });
      this.sSuccess.set('Message logged. (Provider integration to be configured.)');
      this.sToPhone = ''; this.sToEmail = ''; this.sPatientId = '';
      this.sVariables.set({});
      await this.refresh();
      setTimeout(() => this.sSuccess.set(null), 4000);
    } catch (e: any) { this.sError.set(e?.message ?? 'Failed'); }
    finally { this.sBusy.set(false); }
  }

  protected async toggleActive(t: CommTemplate, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    try { await this.svc.updateTemplate(t.id, { is_active: checked }); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
