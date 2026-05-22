import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { navigate, ODOO_URLS } from '../../utils/helpers';

export class EmployeePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await navigate(this.page, ODOO_URLS.employees);
  }

  async createEmployee(data: {
    name: string;
    jobPosition?: string;
    department?: string;
    workPhone?: string;
    workEmail?: string;
  }): Promise<void> {
    await this.clickNew();
    await this.fillChar('name', data.name);
    if (data.jobPosition) await this.selectMany2One('job_id', data.jobPosition);
    if (data.department) await this.selectMany2One('department_id', data.department);
    if (data.workPhone) await this.fillChar('work_phone', data.workPhone);
    if (data.workEmail) {
      await this.fillChar('work_email', data.workEmail);
    }
    await this.save();
  }

  async searchEmployee(name: string): Promise<void> {
    const searchInput = this.page.locator('.o_searchview_input');
    await searchInput.fill(name);
    await searchInput.press('Enter');
    await this.waitForReady();
  }

  async openFirstEmployee(): Promise<void> {
    await this.page.locator('.o_data_row').first().click();
    await this.waitForReady();
  }

  async archiveCurrentEmployee(): Promise<void> {
    await this.page.locator('.o_cp_action_menus button').click();
    await this.page.getByRole('menuitem', { name: 'Archive' }).click();
    const confirmBtn = this.page.getByRole('button', { name: 'OK' });
    if (await confirmBtn.isVisible({ timeout: 3_000 })) {
      await confirmBtn.click();
    }
    await this.waitForReady();
  }

  async getEmployeeName(): Promise<string> {
    return (await this.fieldInput('name').inputValue()) ?? '';
  }

  async editField(fieldName: string, value: string): Promise<void> {
    await this.fillChar(fieldName, value);
    await this.save();
  }
}
