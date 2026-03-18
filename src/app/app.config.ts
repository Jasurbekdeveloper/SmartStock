import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';

import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

// Lucide importlari
import { LucideAngularModule, Home, Menu, User, Settings, ShoppingCart } from 'lucide-angular';

import { routes } from './app.routes';
import { JwtInterceptor } from './core/interceptors/jwt.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    
    // 1. NG02801 xatosini yopish uchun withFetch() qo'shildi
    provideHttpClient(
      withInterceptorsFromDi(),
      withFetch() 
    ),

    {
      provide: HTTP_INTERCEPTORS,
      useClass: JwtInterceptor,
      multi: true
    },

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
