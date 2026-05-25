import { Injectable, computed, inject, signal } from '@angular/core';
import { RegistersService } from './registers.service';
import type { RegisterDefinition } from './registers.types';

@Injectable({ providedIn: 'root' })
export class RegistersStore {
  private svc = inject(RegistersService);

  private readonly _defs = signal<RegisterDefinition[]>([]);
  private readonly _loaded = signal(false);
  private loadPromise: Promise<void> | null = null;

  readonly definitions = this._defs.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  readonly byCategory = computed(() => {
    const groups = new Map<string, RegisterDefinition[]>();
    for (const d of this._defs()) {
      const arr = groups.get(d.category) ?? [];
      arr.push(d);
      groups.set(d.category, arr);
    }
    return groups;
  });

  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const defs = await this.svc.listDefinitions();
      this._defs.set(defs);
      this._loaded.set(true);
    })();
    return this.loadPromise;
  }

  byCode(code: string): RegisterDefinition | undefined {
    return this._defs().find((d) => d.code === code);
  }
}
