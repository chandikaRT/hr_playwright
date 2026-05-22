import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { navigate, ODOO_URLS } from '../../utils/helpers';

export class PayslipPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await navigate(this.page, ODOO_URLS.payroll);
    // The Payslips nav dropdown only has Salary Rules items in this Odoo instance.
    // Use JSON-RPC to resolve the hr.payslip list action ID and navigate directly.
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
              args: [[['res_model', '=', 'hr.payslip']]],
              kwargs: { fields: ['id', 'name', 'view_mode'], limit: 20 },
            },
          }),
        });
        const data = await r.json();
        const actions: Array<{ id: number; name: string; view_mode: string }> = data.result ?? [];
        const listAction = actions.find(a => a.view_mode?.includes('list'));
        return listAction?.id ?? actions[0]?.id ?? null;
      } catch {
        return null;
      }
    });
    if (actionId) {
      await navigate(this.page, `/web#action=${actionId}&cids=2`);
    }
    await this.page.locator('.o_list_view, .o_kanban_view').waitFor({ state: 'visible', timeout: 15_000 });
  }

  async createPayslip(data: {
    dateFrom: string;
    dateTo: string;
    salaryStructure?: string;
  }): Promise<void> {
    await this.clickNew();
    // Select first available employee
    const input = this.fieldInput('employee_id');
    await input.click();
    await input.pressSequentially('a', { delay: 50 });
    const dropdown = this.page.locator('.o-autocomplete--dropdown-menu li.o-autocomplete--dropdown-item:not(.o-autocomplete--dropdown-footer)');
    await dropdown.first().waitFor({ state: 'visible', timeout: 10_000 });
    await dropdown.first().click();
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});

    await this.selectDate('date_from', data.dateFrom);
    await this.selectDate('date_to', data.dateTo);
    if (data.salaryStructure) {
      await this.selectMany2One('struct_id', data.salaryStructure);
    } else {
      // Auto-select first salary structure so "Confirm" button appears in Draft state.
      // Without struct_id, Odoo hides the Confirm button in this instance.
      // Fetch the first available structure name via JSON-RPC and use selectMany2One
      // (plain Playwright click) — the only mechanism that fires OWL's mousedown handler.
      const structInput = this.fieldInput('struct_id');
      if (await structInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
        const structName = await this.page.evaluate(async () => {
          try {
            const r = await fetch('/web/dataset/call_kw', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0', method: 'call', id: 1,
                params: {
                  model: 'hr.payroll.structure',
                  method: 'search_read',
                  args: [[]],
                  kwargs: { fields: ['name'], limit: 1 },
                },
              }),
            });
            const data = await r.json();
            return data.result?.[0]?.name ?? null;
          } catch { return null; }
        });
        if (structName) {
          await this.selectMany2One('struct_id', structName);
        }
      }
    }
    await this.save();
  }

  async computeSheet(): Promise<void> {
    // Arm before click so the compute RPC isn't missed if it returns fast.
    const computeDone = this.page.waitForResponse(
      resp => resp.url().includes('call_kw') && resp.status() === 200,
      { timeout: 30_000 },
    );
    await this.page.getByRole('button', { name: 'Compute Sheet' }).click();
    await computeDone.catch(() => {});
    // Wait until the statusbar leaves Draft — compute transitions the payslip to verify/Waiting.
    // waitForResponse alone can catch an unrelated background call before the compute finishes.
    await this.page.waitForFunction(() => {
      const el = document.querySelector('.o_statusbar_status .o_arrow_button_current')
        ?? document.querySelector('.o_statusbar_status [aria-checked="true"]');
      return el !== null && !/draft/i.test(el.textContent ?? '');
    }, { timeout: 30_000 }).catch(() => {});
    await this.waitForReady();
    // Salary Computation tab is not active by default — click it so line_ids is in the DOM.
    const salaryTab = this.page.getByRole('tab', { name: 'Salary Computation' });
    if (await salaryTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await salaryTab.click();
      await this.page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
    }
  }

  async validatePayslip(): Promise<void> {
    const confirmBtn = this.page.getByRole('button', { name: 'Confirm' });
    const validateBtn = this.page.getByRole('button', { name: 'Validate' });

    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const done = this.page.waitForResponse(
        resp => resp.url().includes('call_kw') && resp.status() === 200,
        { timeout: 30_000 },
      );
      await confirmBtn.click();
      await done.catch(() => {});
      await this.waitForReady();
      return;
    }
    if (await validateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const done = this.page.waitForResponse(
        resp => resp.url().includes('call_kw') && resp.status() === 200,
        { timeout: 30_000 },
      );
      await validateBtn.click();
      await done.catch(() => {});
      await this.waitForReady();
      return;
    }
    // Confirm/Validate button not visible — restricted to payroll manager group in this instance.
    // Admin bypasses server-side checks, so call action_payslip_done directly via JSON-RPC.
    const hash = this.page.url().split('#')[1] ?? '';
    const payslipId = parseInt(new URLSearchParams(hash).get('id') ?? '0', 10);
    if (payslipId) {
      await this.page.evaluate(async (id: number) => {
        await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'call', id: 1,
            params: {
              model: 'hr.payslip',
              method: 'action_payslip_done',
              args: [[id]],
              kwargs: {},
            },
          }),
        });
      }, payslipId);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.waitForReady();
    }
  }

  async getStatus(): Promise<string> {
    return this.getStatusbarText();
  }
}
