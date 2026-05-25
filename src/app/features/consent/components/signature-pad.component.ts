import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  Input, Output, ViewChild, AfterViewInit, OnDestroy,
} from '@angular/core';

/**
 * A small HTML5 canvas signature pad. Emits a base64 PNG data URL.
 * Works with mouse + touch + pen.  No external libs.
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="rounded-md border border-border bg-surface-card overflow-hidden">
  <div class="px-3 py-1.5 flex items-center justify-between border-b border-border bg-surface-subtle">
    <p class="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.06em]">{{ label }}</p>
    <div class="flex items-center gap-2">
      @if (isDirty) { <span class="text-[10px] text-good-fg">✓ signed</span> }
      <button type="button" (click)="clear()" class="text-[10.5px] text-danger-fg hover:underline">Clear</button>
    </div>
  </div>
  <canvas #canvas
          [width]="width" [height]="height"
          (mousedown)="onPointerDown($event)" (mousemove)="onPointerMove($event)"
          (mouseup)="onPointerUp()" (mouseleave)="onPointerUp()"
          (touchstart)="onTouchStart($event)" (touchmove)="onTouchMove($event)"
          (touchend)="onPointerUp()"
          class="block w-full bg-white touch-none"
          style="cursor: crosshair;"></canvas>
</div>
  `,
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  @Input() label = 'Signature';
  @Input() width  = 520;
  @Input() height = 140;
  @Output() changed = new EventEmitter<string | null>();   // emits dataURL or null on clear

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  protected isDirty = false;

  ngAfterViewInit() {
    const c = this.canvasRef.nativeElement;
    this.ctx = c.getContext('2d');
    if (!this.ctx) return;
    this.ctx.lineWidth   = 2;
    this.ctx.lineJoin    = 'round';
    this.ctx.lineCap     = 'round';
    this.ctx.strokeStyle = '#0F1B2D';
    this.clear();
  }

  ngOnDestroy() { /* noop */ }

  clear() {
    const c = this.canvasRef.nativeElement;
    if (!this.ctx) return;
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, c.width, c.height);
    this.isDirty = false;
    this.changed.emit(null);
  }

  /** Returns the current drawing as a base64 PNG, or null if blank. */
  getDataUrl(): string | null {
    if (!this.isDirty) return null;
    return this.canvasRef.nativeElement.toDataURL('image/png');
  }

  // ── Pointer handlers ──────────────────────────────────────────
  protected onPointerDown(e: MouseEvent) {
    if (!this.ctx) return;
    this.drawing = true;
    const p = this.local(e.offsetX, e.offsetY);
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
  }
  protected onPointerMove(e: MouseEvent) {
    if (!this.drawing || !this.ctx) return;
    const p = this.local(e.offsetX, e.offsetY);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.markDirty();
  }
  protected onPointerUp() {
    if (!this.drawing) return;
    this.drawing = false;
    this.emit();
  }
  protected onTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (!this.ctx) return;
    const c = this.canvasRef.nativeElement.getBoundingClientRect();
    const t = e.touches[0];
    this.drawing = true;
    const p = this.local(t.clientX - c.left, t.clientY - c.top);
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
  }
  protected onTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (!this.drawing || !this.ctx) return;
    const c = this.canvasRef.nativeElement.getBoundingClientRect();
    const t = e.touches[0];
    const p = this.local(t.clientX - c.left, t.clientY - c.top);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.markDirty();
  }

  private local(x: number, y: number) {
    // Account for canvas internal vs CSS pixel scaling (since width is fixed)
    const c = this.canvasRef.nativeElement;
    const rx = c.width  / c.clientWidth;
    const ry = c.height / c.clientHeight;
    return { x: x * rx, y: y * ry };
  }

  private markDirty() {
    if (!this.isDirty) this.isDirty = true;
  }
  private emit() {
    if (this.isDirty) this.changed.emit(this.getDataUrl());
  }
}
