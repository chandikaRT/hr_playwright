import { Page } from '@playwright/test';
import { BasePage } from '../base.page';

export class ContractPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateFromEmployee(): Promise<void> {
    // Wait for the employee form to fully settle (stat buttons area visible)
    await this.page.locator('.o_form_view').waitFor({ state: 'visible', timeout: 15_000 });
    // Use accessible button name for reliability — stat buttons may not have .oe_stat_button class
    // Match "0 Contracts" AND "In Contract Since ..." (Odoo auto-creates a contract on employee save)
    const contractsBtn = this.page.getByRole('button', { name: /contract/i }).first();
    await contractsBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await contractsBtn.click();
    // Clicking "0 Contracts" always opens a modal dialog in this Odoo instance.
    // Wait explicitly for the dialog (longer timeout = survives slow network).
    await this.page.locator('div[role="dialog"]').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  }

  async createContract(data: {
    contractName: string;
    wage: string;
    salaryStructure?: string;
  }): Promise<void> {
    const dialog = this.page.locator('div[role="dialog"]');
    const isDialog = await dialog.isVisible({ timeout: 10_000 }).catch(() => false);

    if (isDialog) {
      // Clicking "0 Contracts" stat button opens a new contract form in a modal dialog.
      // Fill fields scoped to the dialog to avoid matching the employee form behind it.
      await dialog.locator('.o_field_widget[name="name"] input').click();
      await dialog.locator('.o_field_widget[name="name"] input').fill(data.contractName);
      await dialog.locator('.o_field_widget[name="wage"] input').click();
      await dialog.locator('.o_field_widget[name="wage"] input').fill(data.wage);
      if (data.salaryStructure) {
        await this.selectMany2One('structure_type_id', data.salaryStructure);
      }
      // Save — dialog stays open with the saved form
      await dialog.getByRole('button', { name: 'Save' }).click();
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    } else {
      await this.clickNew();
      await this.fillChar('name', data.contractName);
      await this.fillChar('wage', data.wage);
      if (data.salaryStructure) {
        await this.selectMany2One('structure_type_id', data.salaryStructure);
      }
      await this.save();
    }
  }

  async activateContract(): Promise<void> {
    const dialog = this.page.locator('div[role="dialog"]');
    const isDialog = await dialog.isVisible({ timeout: 2_000 }).catch(() => false);

    if (isDialog) {
      const saveCloseBtn = dialog.getByRole('button', { name: /save.*close|close/i }).first();
      if (await saveCloseBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await saveCloseBtn.click();
      } else {
        await dialog.getByRole('button', { name: 'Close' }).click().catch(() => {});
      }
    } else {
      const saveBtn = this.page.locator('.o_form_button_save');
      if (await saveBtn.isVisible({ timeout: 2_000 })) await saveBtn.click();

      const runBtn = this.page.getByRole('button', { name: 'Save & Close' });
      if (await runBtn.isVisible({ timeout: 2_000 })) await runBtn.click();
    }

    await this.waitForReady();
  }

  async getContractStatus(): Promise<string> {
    // Check dialog FIRST — getStatusbarText() has an implicit 30 s action-timeout waiting
    // for .o_statusbar_status which doesn't exist on the employee form. That 30 s delay
    // causes the dialog to close before we can detect it.
    const dialog = this.page.locator('div[role="dialog"]');
    const isDialog = await dialog.isVisible({ timeout: 3_000 }).catch(() => false);
    if (isDialog) {
      const statusText = await dialog
        .locator('.o_statusbar_status .o_arrow_button_current, .o_statusbar_status [aria-checked="true"]')
        .textContent({ timeout: 3_000 })
        .catch(() => '');
      return statusText || 'new';
    }
    return await this.getStatusbarText();
  }
}
