import { Signal, computed, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';

/** Client-side pagination over an already-computed (e.g. filtered) list signal. */
export function createPagination<T>(source: Signal<T[]>, initialPageSize = 10) {
  const pageIndex = signal(0);
  const pageSize = signal(initialPageSize);

  const paged = computed(() => {
    const start = pageIndex() * pageSize();
    return source().slice(start, start + pageSize());
  });

  function onPage(event: PageEvent) {
    pageIndex.set(event.pageIndex);
    pageSize.set(event.pageSize);
  }

  function reset() {
    pageIndex.set(0);
  }

  return { pageIndex, pageSize, paged, onPage, reset };
}
