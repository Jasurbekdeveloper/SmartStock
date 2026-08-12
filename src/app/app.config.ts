import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

// Lucide importlari
import { LucideAngularModule, Home, Menu, User, Settings, ShoppingCart } from 'lucide-angular';

import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/firebase.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // 1. NG02801 xatosini yopish uchun withFetch() qo'shildi
    provideHttpClient(withFetch()),

    provideFirebase(),

    provideTranslateService({
      fallbackLang: 'en', 
      loader: provideTranslateHttpLoader({
        prefix: 'assets/i18n/',
        suffix: '.json'
      })
    }),

    importProvidersFrom(
      LucideAngularModule.pick({ Menu, User, Settings, ShoppingCart })
    )
  ]
};
