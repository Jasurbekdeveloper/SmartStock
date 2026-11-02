import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TenantListComponent } from './tenant-list.component';
import { PlatformService, TenantUsage } from '../../../core/services/platform.service';
import { formatBytes } from '../../platform-ui';

const usage = (products: number, bytes: number, count: number): TenantUsage => ({
  products,
  totalQuantity: 0,
  categories: 0,
  customers: 0,
  users: 0,
  sales: 0,
  files: { count, bytes, products: { count, bytes }, categories: { count: 0, bytes: 0 } }
});

describe('formatBytes', () => {
  it('uses readable units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });
});

describe('TenantListComponent usage columns', () => {
  async function setup() {
    const tenantUsage = vi.fn((id: string) =>
      id === 'a' ? of(usage(1200, 3 * 1024 * 1024, 40)) : id === 'b' ? of(usage(30, 2048, 2)) : throwError(() => new Error('unreachable'))
    );
    TestBed.configureTestingModule({
      imports: [TenantListComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: PlatformService,
          useValue: {
            getTenants: () =>
              of([
                { id: 'a', name: 'Original', status: 'active' },
                { id: 'b', name: 'Kichik', status: 'trial' },
                { id: 'c', name: 'Buzilgan', status: 'active' }
              ]),
            tenantUsage
          }
        }
      ]
    });
    const fixture = TestBed.createComponent(TenantListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, tenantUsage };
  }

  it('shows each store\'s product count and uploaded size, and the totals', async () => {
    const { root, tenantUsage } = await setup();
    expect(tenantUsage).toHaveBeenCalledTimes(3);
    const rows = [...root.querySelectorAll('tbody tr')].map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('1 200');
    expect(rows[0]).toContain('3.0 MB');
    expect(rows[0]).toContain('40');
    expect(rows[1]).toContain('30');
    expect(rows[1]).toContain('2.0 KB');
    // a store whose numbers can't be read shows a dash and doesn't break the others
    expect(rows[2]).toContain('—');
    const text = root.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('1 230');
    expect(text).toContain('3.0 MB');
  });
});
