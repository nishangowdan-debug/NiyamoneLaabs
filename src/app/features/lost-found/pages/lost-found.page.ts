import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LostFoundService } from '../data/lost-found.service';
import {
  ITEM_TYPE_LABELS, STATUS_LABELS,
  type LfItemType, type LfStatus, type LostFoundItem,
} from '../data/lost-found.types';

type Tab = 'inventory' | 'lost_reports' | 'log_found' | 'log_lost';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<section class="p-4 md:p-6 space-y-4">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Lost &amp; Found</h1>
    <p class="text-[12px] text-ink-soft">Items found in hospital · lost-item reports · matching · claim release · NABH FMS</p>
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

  @if (tab() === 'inventory') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Items in Storage</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Ref No</th><th class="px-3 py-2">Item</th>
              <th class="px-3 py-2">Found At</th><th class="px-3 py-2">Location</th>
              <th class="px-3 py-2">Storage</th><th class="px-3 py-2">Status</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (i of inventoryItems(); track i.id) {
            <tr class="border-t border-border"
                [class.bg-warn-fg]="isOlderThan30d(i.found_at)"
                [class.bg-opacity-5]="true">
              <td class="px-3 py-2 font-mono">{{ i.ref_no }}</td>
              <td class="px-3 py-2">
                <div>{{ itemTypeLabel(i.item_type) }} — {{ i.description }}</div>
                @if (i.brand_or_make) { <div class="text-[10px] text-ink-soft">{{ i.brand_or_make }}</div> }
              </td>
              <td class="px-3 py-2 text-[11px]">{{ i.found_at ? (i.found_at | date:'mediumDate') : '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ i.found_location || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ i.storage_location || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ statusLabel(i.status) }}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <button (click)="claim(i)" class="text-[11px] text-good-fg hover:underline">Claim</button>
                <span class="mx-1">·</span>
                <button (click)="dispose(i)" class="text-[11px] text-danger-fg hover:underline">Dispose</button>
              </td>
            </tr>
          }
          @if (inventoryItems().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No items in storage.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab() === 'lost_reports') {
    <div class="rounded-md border border-border bg-surface-card">
      <h3 class="px-4 py-3 border-b border-border text-sm font-semibold">Lost Item Reports</h3>
      <table class="min-w-full text-[12px]">
        <thead class="text-ink-soft text-left">
          <tr><th class="px-3 py-2">Ref No</th><th class="px-3 py-2">Item</th>
              <th class="px-3 py-2">Lost Location</th><th class="px-3 py-2">Reported By</th>
              <th class="px-3 py-2">Phone</th><th class="px-3 py-2">When</th>
              <th class="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          @for (i of lostReports(); track i.id) {
            <tr class="border-t border-border">
              <td class="px-3 py-2 font-mono">{{ i.ref_no }}</td>
              <td class="px-3 py-2">{{ itemTypeLabel(i.item_type) }} — {{ i.description }}</td>
              <td class="px-3 py-2 text-[11px]">{{ i.lost_location || '—' }}</td>
              <td class="px-3 py-2">{{ i.reported_by_name }}</td>
              <td class="px-3 py-2 text-[11px]">{{ i.reported_by_phone || '—' }}</td>
              <td class="px-3 py-2 text-[11px]">{{ i.reported_lost_at | date:'short' }}</td>
              <td class="px-3 py-2 text-right">
                <button (click)="matchPrompt(i)" class="text-[11px] text-brand hover:underline">Match</button>
              </td>
            </tr>
          }
          @if (lostReports().length === 0) {
            <tr><td colspan="7" class="px-3 py-3 text-center text-ink-soft">No lost reports.</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab() === 'log_found') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-xl space-y-2">
      <h3 class="text-sm font-semibold">+ Log Found Item</h3>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Item type *</span>
        <select [(ngModel)]="fType"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          @for (t of itemTypeOptions; track t) { <option [value]="t">{{ itemTypeLabel(t) }}</option> }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Description *</span>
        <textarea rows="2" [(ngModel)]="fDescription"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Found at (location) *</span>
        <input [(ngModel)]="fLocation"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Brand / make</span>
        <input [(ngModel)]="fBrand"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Identifying marks</span>
        <input [(ngModel)]="fMarks"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Estimated value (₹)</span>
        <input type="number" [(ngModel)]="fValue"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Found by (name)</span>
        <input [(ngModel)]="fFoundBy"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Storage location</span>
        <input [(ngModel)]="fStorage" placeholder="Security Office shelf 3"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      @if (fError()) { <p class="text-[12px] text-danger-fg">{{ fError() }}</p> }
      @if (fSuccess()) { <p class="text-[12px] text-good-fg">{{ fSuccess() }}</p> }
      <div class="flex justify-end">
        <button (click)="logFound()"
                [disabled]="fBusy() || !fDescription.trim() || !fLocation.trim()"
                class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ fBusy() ? 'Saving…' : 'Log Found' }}
        </button>
      </div>
    </div>
  }

  @if (tab() === 'log_lost') {
    <div class="rounded-md border border-border bg-surface-card p-4 max-w-xl space-y-2">
      <h3 class="text-sm font-semibold">+ Log Lost Report</h3>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Item type *</span>
        <select [(ngModel)]="lType"
                class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm">
          @for (t of itemTypeOptions; track t) { <option [value]="t">{{ itemTypeLabel(t) }}</option> }
        </select>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Description *</span>
        <textarea rows="2" [(ngModel)]="lDescription"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"></textarea>
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Lost location *</span>
        <input [(ngModel)]="lLocation"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Reported by (name) *</span>
        <input [(ngModel)]="lReporterName"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Phone</span>
        <input [(ngModel)]="lReporterPhone"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Relation</span>
        <input [(ngModel)]="lReporterRelation" placeholder="patient / visitor / staff"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase text-ink-soft">Identifying marks</span>
        <input [(ngModel)]="lMarks"
               class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" />
      </label>
      @if (lError()) { <p class="text-[12px] text-danger-fg">{{ lError() }}</p> }
      @if (lSuccess()) { <p class="text-[12px] text-good-fg">{{ lSuccess() }}</p> }
      <div class="flex justify-end">
        <button (click)="logLost()"
                [disabled]="lBusy() || !lDescription.trim() || !lLocation.trim() || !lReporterName.trim()"
                class="px-4 py-1.5 text-sm rounded-md bg-brand text-white disabled:opacity-50">
          {{ lBusy() ? 'Saving…' : 'Log Lost Report' }}
        </button>
      </div>
    </div>
  }
</section>
  `,
})
export class LostFoundPage implements OnInit {
  private svc = inject(LostFoundService);

  protected tab = signal<Tab>('inventory');
  protected items = signal<LostFoundItem[]>([]);

  protected itemTypeOptions: LfItemType[] = ['valuable','document','phone','jewelry','clothing','luggage','medical_device','keys','medication','other'];

  protected itemTypeLabel = (t: LfItemType) => ITEM_TYPE_LABELS[t];
  protected statusLabel = (s: LfStatus) => STATUS_LABELS[s];
  protected isOlderThan30d(iso: string | null): boolean {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() > 30 * 86_400_000;
  }

  // Found form
  protected fType: LfItemType = 'valuable';
  protected fDescription = '';
  protected fLocation = '';
  protected fBrand = '';
  protected fMarks = '';
  protected fValue: number | null = null;
  protected fFoundBy = '';
  protected fStorage = '';
  protected fBusy = signal(false);
  protected fError = signal<string | null>(null);
  protected fSuccess = signal<string | null>(null);

  // Lost form
  protected lType: LfItemType = 'valuable';
  protected lDescription = '';
  protected lLocation = '';
  protected lReporterName = '';
  protected lReporterPhone = '';
  protected lReporterRelation = '';
  protected lMarks = '';
  protected lBusy = signal(false);
  protected lError = signal<string | null>(null);
  protected lSuccess = signal<string | null>(null);

  protected inventoryItems = computed(() =>
    this.items().filter(i => i.status === 'found' || i.status === 'matched'),
  );
  protected lostReports = computed(() =>
    this.items().filter(i => i.status === 'reported_lost'),
  );

  protected tabs = [
    { id: 'inventory'    as Tab, label: 'Inventory',     count: () => this.inventoryItems().length },
    { id: 'lost_reports' as Tab, label: 'Lost Reports',  count: () => this.lostReports().length },
    { id: 'log_found'    as Tab, label: '+ Log Found',   count: () => 0 },
    { id: 'log_lost'     as Tab, label: '+ Log Lost',    count: () => 0 },
  ];

  ngOnInit() { this.refresh(); }
  protected setTab(t: Tab) { this.tab.set(t); }

  private async refresh() {
    try { this.items.set(await this.svc.list({})); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async logFound() {
    if (!this.fDescription.trim() || !this.fLocation.trim()) return;
    this.fBusy.set(true); this.fError.set(null); this.fSuccess.set(null);
    try {
      await this.svc.logFound({
        itemType: this.fType,
        description: this.fDescription.trim(),
        foundLocation: this.fLocation.trim(),
        foundByName: this.fFoundBy.trim() || null,
        brandOrMake: this.fBrand.trim() || null,
        identifyingMarks: this.fMarks.trim() || null,
        estimatedValueCents: this.fValue ? Math.round(this.fValue * 100) : null,
        storageLocation: this.fStorage.trim() || null,
      });
      this.fSuccess.set('Logged.');
      this.fDescription = ''; this.fLocation = ''; this.fBrand = '';
      this.fMarks = ''; this.fValue = null; this.fFoundBy = ''; this.fStorage = '';
      await this.refresh();
      setTimeout(() => this.fSuccess.set(null), 3000);
    } catch (e: any) { this.fError.set(e?.message ?? 'Failed'); }
    finally { this.fBusy.set(false); }
  }

  protected async logLost() {
    if (!this.lDescription.trim() || !this.lLocation.trim() || !this.lReporterName.trim()) return;
    this.lBusy.set(true); this.lError.set(null); this.lSuccess.set(null);
    try {
      await this.svc.logLostReport({
        itemType: this.lType,
        description: this.lDescription.trim(),
        lostLocation: this.lLocation.trim(),
        reportedByName: this.lReporterName.trim(),
        reportedByPhone: this.lReporterPhone.trim() || null,
        reportedByRelation: this.lReporterRelation.trim() || null,
        identifyingMarks: this.lMarks.trim() || null,
      });
      this.lSuccess.set('Logged.');
      this.lDescription = ''; this.lLocation = '';
      this.lReporterName = ''; this.lReporterPhone = ''; this.lReporterRelation = '';
      this.lMarks = '';
      await this.refresh();
      setTimeout(() => this.lSuccess.set(null), 3000);
    } catch (e: any) { this.lError.set(e?.message ?? 'Failed'); }
    finally { this.lBusy.set(false); }
  }

  protected async matchPrompt(lostItem: LostFoundItem) {
    const foundRefNo = prompt('Found item Ref No to match (e.g. LF-2026-00012)?');
    if (!foundRefNo) return;
    const found = this.items().find(i => i.ref_no === foundRefNo.trim());
    if (!found) { alert('Found item not located'); return; }
    try { await this.svc.match(found.id, lostItem.id); await this.refresh(); }
    catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async claim(item: LostFoundItem) {
    const name = prompt('Claimant name?'); if (!name) return;
    const idType = prompt('ID type (Aadhaar/PAN/DL/Passport)?');
    const idNo = prompt('ID number? (mandatory)'); if (!idNo) return;
    const phone = prompt('Phone?') ?? '';
    const witness = prompt('Witness name?') ?? '';
    const releasedBy = prompt('Released by (your name)?') ?? '';
    try {
      await this.svc.claim({
        id: item.id,
        claimedByName: name,
        claimedByPhone: phone || null,
        claimedByIdProof: idType || null,
        claimedByIdNumber: idNo,
        claimWitnessName: witness || null,
        releasedByName: releasedBy || null,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }

  protected async dispose(item: LostFoundItem) {
    const method = prompt('Disposal method (destroyed/donated/auctioned/handed_to_police)?');
    if (!method) return;
    const valid = ['destroyed','donated','auctioned','handed_to_police'];
    if (!valid.includes(method)) { alert('Invalid method'); return; }
    const auth = prompt('Authorized by?');
    if (!auth) return;
    let policeStation: string | null = null;
    let firNo: string | null = null;
    if (method === 'handed_to_police') {
      policeStation = prompt('Police station?');
      firNo = prompt('FIR no?');
    }
    try {
      await this.svc.dispose({
        id: item.id,
        method: method as 'destroyed' | 'donated' | 'auctioned' | 'handed_to_police',
        authorizedBy: auth,
        policeStation, firNo,
      });
      await this.refresh();
    } catch (e: any) { alert(e?.message ?? 'Failed'); }
  }
}
