import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { take } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { PlatformService } from '../../../core/services/platform.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import {
  FEATURE_ICONS,
  SITE_DEFAULTS,
  SITE_LANGS,
  SITE_LISTS,
  SITE_SECTIONS,
  SITE_TEXT_GROUPS,
  SiteContent,
  SiteLang,
  SiteListName
} from '../../../core/models/site-content';

/** Editor for the marketing site (website/): contacts, section switches, every text
 *  and every list, in uz/ru/en. Saving publishes siteContent/main; the site reads it
 *  on the next page load, no rebuild needed. */
@Component({
  selector: 'app-site-editor',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatExpansionModule,
    MatTooltipModule,
    TranslatePipe
  ],
  templateUrl: './site-editor.component.html'
})
export class SiteEditorComponent {
  private platform = inject(PlatformService);
  private toast = inject(ToastService);
  private translation = inject(TranslationService);

  readonly langs = SITE_LANGS;
  readonly sections = SITE_SECTIONS;
  readonly lists = SITE_LISTS;
  readonly icons = FEATURE_ICONS;

  content = signal<SiteContent | null>(null);
  lang = signal<SiteLang>('uz');
  dirty = signal(false);
  saving = signal(false);

  /** Text keys per group, in the order they appear on the page. */
  textGroups = computed(() => {
    const keys = Object.keys(this.content()?.texts ?? {});
    return SITE_TEXT_GROUPS.map((g) => ({
      id: g.id,
      keys: keys.filter((k) => g.prefixes.some((p) => k.startsWith(p)))
    })).filter((g) => g.keys.length > 0);
  });

  constructor() {
    // Load once: a live subscription would overwrite unsaved edits.
    this.platform
      .getSiteContent()
      .pipe(take(1))
      .subscribe({
        next: (content) => this.content.set(content),
        error: () => this.toast.error(this.translation.translate('messages.error'))
      });
  }

  private touch() {
    this.dirty.set(true);
    this.content.update((c) => (c ? { ...c } : c));
  }

  // ----- contacts & sections -----

  setContact(field: 'phone' | 'telegram' | 'email', value: string) {
    this.content()!.contact[field] = value.trim();
    this.touch();
  }

  setSection(name: string, on: boolean) {
    (this.content()!.sections as Record<string, boolean>)[name] = on;
    this.touch();
  }

  // ----- texts -----

  text(key: string): string {
    return this.content()?.texts[key]?.[this.lang()] ?? '';
  }

  defaultText(key: string): string {
    return SITE_DEFAULTS.texts[key]?.[this.lang()] ?? '';
  }

  setText(key: string, value: string) {
    const texts = this.content()!.texts;
    texts[key] = { ...(texts[key] ?? {}), [this.lang()]: value };
    this.touch();
  }

  resetText(key: string) {
    this.setText(key, this.defaultText(key));
  }

  // ----- lists -----

  items(name: SiteListName) {
    return this.content()?.lists[name] ?? [];
  }

  setItemField(name: SiteListName, index: number, field: 'title' | 'text', value: string) {
    const item = this.content()!.lists[name][index];
    item[field] = { ...(item[field] ?? {}), [this.lang()]: value };
    this.touch();
  }

  setItemIcon(name: SiteListName, index: number, icon: string) {
    this.content()!.lists[name][index].icon = icon;
    this.touch();
  }

  addItem(name: SiteListName, hasText: boolean, hasIcon?: boolean) {
    const list = this.content()!.lists[name];
    list.push({ ...(hasIcon ? { icon: 'star' } : {}), title: { uz: '', ru: '', en: '' }, ...(hasText ? { text: { uz: '', ru: '', en: '' } } : {}) });
    this.touch();
  }

  removeItem(name: SiteListName, index: number) {
    this.content()!.lists[name].splice(index, 1);
    this.touch();
  }

  moveItem(name: SiteListName, index: number, delta: number) {
    const list = this.content()!.lists[name];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    this.touch();
  }

  resetList(name: SiteListName) {
    if (!confirm(this.translation.translate('platform.site.resetListConfirm'))) return;
    this.content()!.lists[name] = JSON.parse(JSON.stringify(SITE_DEFAULTS.lists[name]));
    this.touch();
  }

  /** Items missing text in the current language fall back to Uzbek on the site. */
  missing(value: Partial<Record<SiteLang, string>> | undefined): boolean {
    return !value?.[this.lang()]?.trim();
  }

  save() {
    const content = this.content();
    if (!content) return;
    this.saving.set(true);
    this.platform.saveSiteContent(content).subscribe({
      next: () => {
        this.saving.set(false);
        this.dirty.set(false);
        this.toast.success(this.translation.translate('platform.site.saved'));
      },
      error: () => {
        this.saving.set(false);
        this.toast.error(this.translation.translate('messages.error'));
      }
    });
  }
}
