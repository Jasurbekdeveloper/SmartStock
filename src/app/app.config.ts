import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';

import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/firebase.providers';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // 1. NG02801 xatosini yopish uchun withFetch() qo'shildi
    provideHttpClient(withFetch()),

    // No animations provider: @angular/animations has no Angular 21-compatible
    // release yet (jumps 20.x -> 22.x), and importing it (even the no-op
    // variant) pulls in that missing package. Angular Material still works
    // fully without one — component animation triggers just no-op instead of
    // transitioning, which is an acceptable tradeoff here.

    provideFirebase(),

    // mat-datepicker's date formatting/parsing (Products, Sales History filters).
    provideNativeDateAdapter(),

    provideTranslateService({
      fallbackLang: 'en', 
      loader: provideTranslateHttpLoader({
        prefix: 'assets/i18n/',
        suffix: '.json'
      })
    }), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};
