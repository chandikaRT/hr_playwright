import { Page } from '@playwright/test';

export const ODOO_URLS = {
  login: '/web/login',
  employees: '/web#action=386&model=hr.employee&view_type=list&cids=2&menu_id=229',
  leaves: '/web#action=790&model=hr.leave&view_type=list&cids=2&menu_id=551',
  attendance: '/web#action=732&model=hr.attendance&view_type=list&cids=2&menu_id=511',
  payroll: '/web#action=3033&cids=2&menu_id=798',
  salaryStructures: '/web#action=1533&model=hr.payroll.structure&view_type=list&cids=2&menu_id=821',
} as const;

export async function navigate(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.o_action_manager').waitFor({ state: 'visible', timeout: 30_000 });
}

export async function selectMany2One(page: Page, fieldName: string, value: string): Promise<void> {
  const input = page.locator(`.o_field_widget[name="${fieldName}"] input`);
  await input.click();
  await input.clear();
  await input.pressSequentially(value, { delay: 50 });
  // Use .o-autocomplete--dropdown-item to skip group-wrapper <li> elements
  // (which have class o-autocomplete--dropdown-group, not o-autocomplete--dropdown-item).
  // Holiday_status_id and similar grouped autocompletes nest options inside a group <li>,
  // so li:not(.footer) matches the group wrapper first and the click lands on the wrong element.
  const dropdown = page.locator('.o-autocomplete--dropdown-menu li.o-autocomplete--dropdown-item:not(.o-autocomplete--dropdown-footer), .ui-autocomplete li');
  await dropdown.first().waitFor({ state: 'visible', timeout: 10_000 });
  await dropdown.first().click();
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
}

export async function selectDate(page: Page, fieldName: string, date: string): Promise<void> {
  const input = page.locator(`.o_field_widget[name="${fieldName}"] input`).first();
  // force bypasses disabled state (Odoo's onchange AJAX temporarily disables date inputs)
  // timeout: 10_000 prevents hanging when the field widget doesn't exist at all
  await input.fill(date, { force: true, timeout: 10_000 });
  await page.keyboard.press('Escape');
}

export async function clickSave(page: Page): Promise<void> {
  const saveBtn = page.locator('.o_form_button_save');
  if (await saveBtn.isVisible({ timeout: 2_000 })) {
    await saveBtn.click();
  } else {
    // Odoo 17 Enterprise uses auto-save — trigger via keyboard shortcut
    await page.keyboard.press('Control+s');
  }
  // Do NOT call waitForLoadState here — when Odoo shows an error dialog during save
  // (e.g. "no employee set", "hasn't checked out") the page enters a partial-navigation
  // state that causes waitForLoadState('domcontentloaded') to hang for the full 120 s timeout.
  // Instead, wait for the URL to gain &id=N (successful new-record save) or time out gracefully.
  const urlBeforeSave = page.url();
  if (!/[#&]id=\d+/.test(urlBeforeSave)) {
    await page.waitForFunction(
      () => /[#&]id=\d+/.test(window.location.hash),
      { timeout: 15_000 },
    ).catch(() => {});
  }
}

export async function clickNew(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New' }).first().click();
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
}

export async function dismissNotification(page: Page): Promise<void> {
  const close = page.locator('.o_notification_close');
  if (await close.isVisible()) await close.click();
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}`;
}
