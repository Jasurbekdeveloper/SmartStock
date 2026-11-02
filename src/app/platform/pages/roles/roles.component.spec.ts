import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformRolesComponent } from './roles.component';
import { PlatformService } from '../../../core/services/platform.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslationService } from '../../../core/services/translation.service';
import { ROLE_PERMISSIONS } from '../../../core/auth/permissions';

describe('PlatformRolesComponent', () => {
  const saveRolePermissions = vi.fn(() => of(undefined));

  async function setup(stored: unknown = of(undefined)) {
    TestBed.configureTestingModule({
      imports: [PlatformRolesComponent],
      providers: [
        provideTranslateService(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: PlatformService, useValue: { getRolePermissions: () => stored, saveRolePermissions } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: TranslationService, useValue: { translate: (k: string) => k } }
      ]
    });
    const fixture = TestBed.createComponent(PlatformRolesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, root, settle };
  }

  afterEach(() => {
    saveRolePermissions.mockClear();
    document.querySelectorAll('mat-dialog-container').forEach((el) => el.remove());
  });

  it('clicking a switch changes the draft and enables Save', async () => {
    const { fixture, root, settle } = await setup();
    const save = () => [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('common.save')) as HTMLButtonElement;
    expect(save().disabled).toBe(true);

    // cashier column, "sales.refund" row
    const row = [...root.querySelectorAll('tr')].find((r) => r.textContent?.includes('sales.refund'))!;
    const toggles = row.querySelectorAll<HTMLButtonElement>('button[role="switch"]');
    expect(toggles.length).toBe(3);
    const cashierToggle = toggles[2];
    expect(cashierToggle.getAttribute('aria-checked')).toBe('true');

    cashierToggle.click();
    await settle();

    expect(fixture.componentInstance.has('cashier', 'sales.refund')).toBe(false);
    expect(save().disabled).toBe(false);
  });

  it('Save asks for confirmation, then stores the draft', async () => {
    const { fixture, root, settle } = await setup();
    const row = [...root.querySelectorAll('tr')].find((r) => r.textContent?.includes('products.manage'))!;
    row.querySelectorAll<HTMLButtonElement>('button[role="switch"]')[2].click();
    await settle();

    const save = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('common.save')) as HTMLButtonElement;
    save.click();
    await settle();

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('mat-dialog-container button')].find((b) => b.textContent?.includes('common.submit'));
    expect(confirm).toBeTruthy();
    confirm!.click();
    await settle();

    expect(saveRolePermissions).toHaveBeenCalledTimes(1);
    const [map] = saveRolePermissions.mock.calls[0] as unknown as [Record<string, string[]>];
    expect(map['cashier']).toContain('products.manage');
    expect(map['cashier']).toEqual(expect.arrayContaining([...ROLE_PERMISSIONS.cashier]));
    expect(fixture.componentInstance.dirty()).toBe(false);
  });

  it('still shows the table with the defaults when the config cannot be read', async () => {
    const { fixture, root } = await setup(throwError(() => ({ code: 'permission-denied' })));
    expect(root.querySelectorAll('button[role="switch"]').length).toBeGreaterThan(0);
    expect(fixture.componentInstance.has('cashier', 'sales.refund')).toBe(true);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('platform.roles.loadFailed');
  });

  it('says why a save was refused', async () => {
    saveRolePermissions.mockReturnValueOnce(throwError(() => ({ code: 'permission-denied' })));
    const { fixture, root, settle } = await setup();
    root.querySelectorAll<HTMLButtonElement>('button[role="switch"]')[2].click();
    await settle();
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('common.save'))!.click();
    await settle();
    [...document.querySelectorAll<HTMLButtonElement>('mat-dialog-container button')].find((b) => b.textContent?.includes('common.submit'))!.click();
    await settle();
    expect(fixture.componentInstance.saving()).toBe(false);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('platform.roles.saveDenied');
  });
});
