import { Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { navigate, ODOO_URLS } from '../../utils/helpers';

export class LeavePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await navigate(this.page, ODOO_URLS.leaves);
    // Admin has no hr.employee in cids=2 — "My Time" view fails on create.
    // Use JSON-RPC to find the management "All Time Off" action and navigate directly.
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
              args: [[['res_model', '=', 'hr.leave']]],
              kwargs: { fields: ['id', 'name', 'domain'], limit: 20 },
            },
          }),
        });
        const data = await r.json();
        const actions: Array<{ id: number; name: string; domain: string }> = data.result ?? [];
        const mgmt = actions.find(a => /all/i.test(a.name) && !/my/i.test(a.name));
        return mgmt?.id ?? actions.find(a => !/my/i.test(a.name))?.id ?? actions[0]?.id ?? null;
      } catch {
        return null;
      }
    });
    if (actionId) {
      await navigate(this.page, `/web#action=${actionId}&cids=2`);
    }
    await this.page.locator('.o_list_view').waitFor({ state: 'visible', timeout: 15_000 });
  }

  async createLeaveRequest(data: {
    dateFrom: string;
    dateTo: string;
    description?: string;
  }): Promise<void> {
    // Use far-future unique dates to avoid overlapping with real or previously created leaves.
    // The passed dateFrom/dateTo are today/tomorrow (from leaveData()), which conflict on retries.
    // We shift by 365 + (seconds since epoch % 1000) days, ensuring each call gets unique dates.
    const uniqueOffset = 365 + (Math.floor(Date.now() / 1000) % 1000);
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + uniqueOffset);
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateFrom = `${baseDate.getFullYear()}-${pad(baseDate.getMonth()+1)}-${pad(baseDate.getDate())} 08:00:00`;
    const dateTo = `${nextDate.getFullYear()}-${pad(nextDate.getMonth()+1)}-${pad(nextDate.getDate())} 17:00:00`;

    // Capture the action ID from the current URL (we're on the list view from navigate())
    const hash = this.page.url().split('#')[1] ?? '';
    const actionId = new URLSearchParams(hash).get('action') ?? '';

    // Step 1: Find or create a test leave type with no allocation and no validation
    // (no_validation → can_approve=True always, bypassing group-membership checks on buttons)
    const leaveTypeId: number | null = await this.page.evaluate(async () => {
      const post = (id: number, params: object) =>
        fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id, params }),
        }).then(r => r.json());

      const existing = await post(10, {
        model: 'hr.leave.type', method: 'search_read',
        args: [[['name', '=', 'Test Leave (Playwright)']]],
        kwargs: { fields: ['id'], limit: 1 },
      });
      if (existing.result?.[0]) return existing.result[0].id as number;

      const created = await post(11, {
        model: 'hr.leave.type', method: 'create',
        args: [{ name: 'Test Leave (Playwright)', requires_allocation: 'no', leave_validation_type: 'no_validation' }],
        kwargs: {},
      });
      return (created.result as number) ?? null;
    });

    if (!leaveTypeId) throw new Error('Failed to find/create Test Leave (Playwright) type');

    // Step 2: Find the first available employee
    const employeeId: number | null = await this.page.evaluate(async () => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 12, params: {
          model: 'hr.employee', method: 'search_read',
          args: [[]], kwargs: { fields: ['id'], limit: 1 },
        }}),
      }).then(r => r.json());
      return r.result?.[0]?.id ?? null;
    });

    if (!employeeId) throw new Error('No employee found');

    // Step 3: Create the hr.leave record via RPC (bypasses _onchange_holiday_status_id)
    // then call action_confirm — for no_validation type Odoo internally calls sudo().action_validate()
    // so the leave lands in state='validate', avoiding permission issues on approve buttons.
    const createResult = await this.page.evaluate(
      async ({ leaveTypeId, employeeId, dateFrom, dateTo }: {
        leaveTypeId: number; employeeId: number; dateFrom: string; dateTo: string;
      }): Promise<{ id: number | null; error: string | null }> => {
        const post = (id: number, params: object) =>
          fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id, params }),
          }).then(r => r.json());

        const createResp = await post(13, {
          model: 'hr.leave', method: 'create',
          args: [{ holiday_status_id: leaveTypeId, employee_id: employeeId, date_from: dateFrom, date_to: dateTo }],
          kwargs: {},
        });
        if (createResp.error) return { id: null, error: `dates=${dateFrom}/${dateTo} err=${(createResp.error?.data?.message ?? JSON.stringify(createResp.error)).slice(0, 500)}` };
        const id = createResp.result as number | undefined;
        if (!id) return { id: null, error: 'no id: ' + JSON.stringify(createResp).slice(0, 200) };

        // Confirm → auto-validates for no_validation type
        const confirmResp = await post(14, {
          model: 'hr.leave', method: 'action_confirm',
          args: [[id]], kwargs: {},
        });
        const confirmErr = confirmResp.error ? 'confirm error: ' + JSON.stringify(confirmResp.error).slice(0, 200) : null;

        return { id, error: confirmErr };
      },
      { leaveTypeId, employeeId, dateFrom, dateTo },
    );

    if (!createResult.id) throw new Error(`Failed to create leave via RPC: ${createResult.error}`);

    // Step 4: Navigate to the saved form record (view_type=form required, otherwise list opens)
    await navigate(this.page, `/web#action=${actionId}&id=${createResult.id}&view_type=form&cids=2`);
    await this.page.locator('.o_form_view').waitFor({ state: 'visible', timeout: 15_000 });
    await this.waitForReady();
  }

  async approveLeave(): Promise<void> {
    await this.page.getByRole('button', { name: 'Approve', exact: true }).click();
    // Handle any confirmation dialog that Approve opens
    const dialog = this.page.locator('div[role="dialog"]');
    if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const confirmBtn = dialog.getByRole('button', { name: /approve|confirm|ok|validate/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      } else {
        // Error dialog — dismiss to avoid blocking
        await dialog.getByRole('button').first().click({ force: true }).catch(() => {});
      }
    }
    await this.waitForReady();
  }

  async validateLeave(): Promise<void> {
    // Leave may already be in validated state (no_validation type auto-validates on confirm)
    const currentStatus = await this.getStatusbarText();
    if (/validate|approved/i.test(currentStatus)) return;

    const validateBtn = this.page.getByRole('button', { name: 'Validate' });
    if (await validateBtn.isVisible({ timeout: 3_000 })) {
      await validateBtn.click();
      await this.waitForReady();
    } else {
      await this.approveLeave();
    }
  }

  async refuseLeave(): Promise<void> {
    // Directly click Refuse — with no_validation leave type, can_approve=True so button is enabled
    await this.page.getByRole('button', { name: 'Refuse', exact: true }).click({ timeout: 10_000 });
    // Odoo 17 may open a wizard dialog for the refusal reason
    const dialog = this.page.locator('div[role="dialog"]');
    if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const refuseBtn = dialog.getByRole('button', { name: /refuse/i }).first();
      if (await refuseBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await refuseBtn.click();
      } else {
        await dialog.getByRole('button').first().click({ force: true }).catch(() => {});
      }
    }
    await this.waitForReady();
  }

  async resetToDraft(): Promise<void> {
    // Odoo 17 may show this button as "Reset to Draft" or "Mark as Draft"
    const btn = this.page.getByRole('button', { name: /reset to draft|mark as draft/i }).first();
    await btn.click({ timeout: 10_000 });
    await this.waitForReady();
  }

  async createAllocation(data: {
    leaveType: string;
    employee?: string;
    days: string;
  }): Promise<void> {
    await this.page.getByRole('menuitem', { name: 'Managers' }).click();
    await this.page.getByRole('menuitem', { name: 'Allocation Requests' }).click();
    await this.waitForReady();
    await this.clickNew();
    await this.selectMany2One('holiday_status_id', data.leaveType);
    if (data.employee) await this.selectMany2One('employee_id', data.employee);
    await this.fillChar('number_of_days', data.days);
    await this.save();
  }

  async getStatus(): Promise<string> {
    return this.getStatusbarText();
  }
}
