import { Injectable, inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateService } from '@ngx-translate/core';

const KEYS = ['paginator.itemsPerPage', 'paginator.next', 'paginator.previous', 'paginator.first', 'paginator.last'];

/** Table paginator labels in the app's language ("Items per page" was left in English).
 *  `stream` re-emits once the language file has loaded and on every language change. */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  constructor() {
    super();
    inject(TranslateService)
      .stream(KEYS)
      .subscribe((t: Record<string, string>) => {
        this.itemsPerPageLabel = t['paginator.itemsPerPage'];
        this.nextPageLabel = t['paginator.next'];
        this.previousPageLabel = t['paginator.previous'];
        this.firstPageLabel = t['paginator.first'];
        this.lastPageLabel = t['paginator.last'];
        this.changes.next();
      });
    this.getRangeLabel = (page, size, length) => {
      if (length === 0 || size === 0) return `0 / ${length}`;
      const start = page * size;
      return `${start + 1} – ${Math.min(start + size, length)} / ${length}`;
    };
  }
}
