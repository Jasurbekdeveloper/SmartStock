import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from './core/services/theme.service';
import { TranslationService } from './core/services/translation.service';
import { TranslatePipe } from './core/pipes/translate.pipe';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

/** How often an open tab asks the server whether a newer version was deployed. */
const UPDATE_CHECK_MS = 10 * 60 * 1000;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private themeService = inject(ThemeService);
  private translationService = inject(TranslationService);
  /** Absent in tests and dev builds (service worker disabled). */
  private swUpdate = inject(SwUpdate, { optional: true });

  /** A new deploy has been downloaded; shown as a prompt rather than an automatic
   *  reload so a cashier never loses a cart mid-sale. */
  updateReady = signal(false);

  ngOnInit() {
    // Initialize theme and translation services
    this.themeService.getTheme();
    this.translationService.getLanguage();
    this.watchForUpdates();
  }

  private watchForUpdates() {
    const sw = this.swUpdate;
    if (!sw?.isEnabled) return;

    sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));
    // The cached app can't recover (e.g. its files were deleted from the server).
    sw.unrecoverable.subscribe(() => document.location.reload());

    const check = () => sw.checkForUpdate().catch(() => undefined);
    check();
    setInterval(check, UPDATE_CHECK_MS);
  }

  async applyUpdate() {
    try {
      await this.swUpdate?.activateUpdate();
    } finally {
      document.location.reload();
    }
  }
}
