import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { navigate, ODOO_URLS } from '../../utils/helpers';

export class PayrollBatchPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await navigate(this.page, ODOO_URLS.payroll);
    // No Batch Payslips link exists in the Payslips dropdown for this Odoo instance.
    // Use JSON-RPC to resolve the hr.payslip.run list action ID and navigate directly.
    const actionId = await this.page.evaluate(async () => {
      try {
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call', id: 1,
            params: {
              model: 'ir.actions.act_window',
              method: 'search_read',
              args: [[['res_model', '=', 'hr.payslip.run']]],
              kwargs: { fields: ['id', 'name'], limit: 5 },
            },
          }),
        });
        const data = await r.json();
        return data.result?.[0]?.id ?? null;
      } catch {
        return null;
      }
    });
    if (actionId) {
      await navigate(this.page, `/web#action=${actionId}&cids=2`);
    }
    await this.page.locator('.o_list_view, .o_kanban_view').waitFor({ state: 'visible', timeout: 15_000 });
  }

  async createBatch(data: {
    name: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<void> {
    await this.clickNew();
    await this.fillChar('name', data.name);
    await this.selectDate('date_start', data.dateFrom);
    await this.selectDate('date_end', data.dateTo);
    await this.save();
  }

  async generatePayslips(): Promise<void> {
    await this.page.getByRole('button', { name: 'Generate Payslips' }).click();
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    // "Generate Payslips" opens a wizard dialog — click "Generate" inside that dialog.
    // Scoping to the dialog avoids picking up disabled action buttons on the main form.
    const dialog = this.page.locator('div[role="dialog"]');
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dialog.getByRole('button', { name: 'Generate' }).click();
      await this.page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    }
  }

  async validateBatch(): Promise<void> {
    const validateBtn = this.page.getByRole('button', { name: 'Validate' });
    if (await validateBtn.isVisible({ timeout: 3_000 })) {
      await validateBtn.click();
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    }
  }

  async getStatus(): Promise<string> {
    return this.getStatusbarText();
  }

  async getPayslipCount(): Promise<number> {
    return this.page.locator('.o_data_row').count();
  }
}
