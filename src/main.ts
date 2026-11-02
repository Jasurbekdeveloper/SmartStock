import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { migrateLegacyStorage } from './app/core/utils/legacy-storage';

migrateLegacyStorage(localStorage);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
