import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { DefaultUrlSerializer, UrlSerializer, UrlTree, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { BranchStore } from './core/branches/branch.store';

/** Collapse accidental duplicate slashes (e.g. `localhost:4200//reports/exceptions`)
 *  so the router can still match the canonical path. */
class NormalizingUrlSerializer extends DefaultUrlSerializer {
  override parse(url: string): UrlTree {
    const [path, ...rest] = url.split('?');
    const normalized = path.replace(/\/{2,}/g, '/');
    return super.parse(rest.length ? `${normalized}?${rest.join('?')}` : normalized);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    { provide: UrlSerializer, useClass: NormalizingUrlSerializer },
    provideAppInitializer(() => {
      const auth = inject(AuthStore);
      const branchStore = inject(BranchStore);
      return (async () => {
        await auth.init();
        await branchStore.load();
      })();
    }),
  ],
};
