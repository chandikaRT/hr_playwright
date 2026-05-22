import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { navigate, ODOO_URLS } from '../../utils/helpers';

export class AttendancePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await navigate(this.page, ODOO_URLS.attendance);
  }

  async createManualEntry(data: {
    checkIn: string;
    checkOut?: string;
  }): Promise<void> {
    await this.clickNew();
    // Pick the first available employee from the dropdown
    const input = this.fieldInput('employee_id');
    await input.click();
    await input.pressSequentially('a', { delay: 50 });
    const dropdown = this.page.locator('.o-autocomplete--dropdown-menu li.o-autocomplete--dropdown-item:not(.o-autocomplete--dropdown-footer)');
    await dropdown.first().waitFor({ state: 'visible', timeout: 10_000 });
    // evaluate-click avoids the Playwright resolve→click race when autocomplete re-renders
    await this.page.evaluate(() => {
      const item = document.querySelector('.o-autocomplete--dropdown-menu li.o-autocomplete--dropdown-item:not(.o-autocomplete--dropdown-footer)') as HTMLElement | null;
      item?.click();
    });
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});

    // Odoo shows "hasn't checked out" error dialog if the employee has an open check-in.
    // Click "Stay here" to dismiss it and keep the form open — skip save in that case.
    const errorDialog = this.page.locator('div[role="dialog"]');
    if (await errorDialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const stayBtn = errorDialog.getByRole('button', { name: 'Stay here' });
      if (await stayBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await stayBtn.click();
      }
      return;
    }

    await this.selectDate('check_in', data.checkIn);
    if (data.checkOut) {
      await this.selectDate('check_out', data.checkOut);
    }
    await this.save();
  }

  async searchByEmployee(name: string): Promise<void> {
    const searchInput = this.page.locator('.o_searchview_input');
    await searchInput.fill(name);
    await searchInput.press('Enter');
    await this.waitForReady();
  }

  async getRecordCount(): Promise<number> {
    return this.page.locator('.o_data_row').count();
  }
}
