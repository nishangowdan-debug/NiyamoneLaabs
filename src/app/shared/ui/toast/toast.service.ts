import { Injectable, signal } from '@angular/core';

export type ToastTone = 'good' | 'info' | 'warn' | 'danger';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(tone: ToastTone, title: string, message?: string, durationMs = 4000) {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, tone, title, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(title: string, message?: string) { this.show('good', title, message); }
  info(title: string, message?: string)    { this.show('info', title, message); }
  warn(title: string, message?: string)    { this.show('warn', title, message); }
  error(title: string, message?: string)   { this.show('danger', title, message, 6000); }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
