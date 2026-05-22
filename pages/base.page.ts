import { Page, Locator } from '@playwright/test';
import { clickSave, selectMany2One, selectDate } from '../utils/helpers';

export class BasePage {
  constructor(protected page: Page) {}

  protected field(name: string): Locator {
    return this.page.locator(`.o_field_widget[name="${name}"]`);
  }

  protected fieldInput(name: string): Locator {
    return this.field(name).locator('input');
  }

  async fillChar(fieldName: string, value: string): Promise<void> {
    const input = this.fieldInput(fieldName);
    await input.click();
    await input.fill(value);
  }

  async selectMany2One(fieldName: string, value: string): Promise<void> {
    await selectMany2One(this.page, fieldName, value);
  }

  async selectDate(fieldName: string, date: string): Promise<void> {
    await selectDate(this.page, fieldName, date);
  }

  async save(): Promise<void> {
    await clickSave(this.page);
  }

  async clickButton(name: string): Promise<void> {
    await this.page.getByRole('button', { name, exact: true }).click();
    await this.waitForReady();
  }

  async clickNew(): Promise<void> {
    await this.page.getByRole('button', { name: 'New' }).first().click();
    await this.page.locator('.o_form_view').waitFor({ state: 'visible', timeout: 30_000 });
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await this.page.locator('.o_action_manager, .o_control_panel').first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  async getStatusbarText(): Promise<string> {
    // Odoo 17 may use either button-style (.o_arrow_button_current) or
    // radio-style ([aria-checked="true"]) statusbars
    const locator = this.page.locator(
      '.o_statusbar_status .o_arrow_button_current, .o_statusbar_status [aria-checked="true"]'
    );
    return (await locator.first().textContent().catch(() => '')) ?? '';
  }
}
