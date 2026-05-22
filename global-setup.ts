import { chromium, FullConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${process.env.ODOO_BASE_URL}/web/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('input[name="login"]').fill(process.env.ODOO_ADMIN_USER!);
  await page.locator('input[name="password"]').fill(process.env.ODOO_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/web(?!\/login)/, { timeout: 60_000 });

  // Grant admin user the HR and Payroll manager groups required for test operations.
  // Without these, action_validate on allocations/leaves and the Validate button on payslips
  // are blocked. This is idempotent — re-running is safe.
  await page.evaluate(async () => {
    const post = (params: object) => fetch('/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params }),
    }).then(r => r.json());

    const session = await fetch('/web/session/get_session_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 0, params: {} }),
    }).then(r => r.json()) as { result?: { uid?: number } };
    const uid = session.result?.uid;
    if (!uid) return;

    const xmlIds = [
      'hr_holidays.group_hr_holidays_manager',
      'hr_holidays.group_hr_holidays_responsible',
      'hr_payroll.group_hr_payroll_manager',
    ];
    for (const xmlId of xmlIds) {
      const [module, name] = xmlId.split('.');
      const groupData = await post({
        model: 'ir.model.data', method: 'search_read',
        args: [[['module', '=', module], ['name', '=', name]]],
        kwargs: { fields: ['res_id'], limit: 1 },
      }) as { result?: Array<{ res_id: number }> };
      const groupId = groupData.result?.[0]?.res_id;
      if (!groupId) continue;
      // Modify the group's users list rather than the user's groups_id —
      // Odoo blocks self-modification of groups_id for security, but allows
      // system admins to add users to groups via res.groups.write.
      await post({
        model: 'res.groups', method: 'write',
        args: [[groupId], { users: [[4, uid]] }],
        kwargs: {},
      });
    }
  });

  await page.context().storageState({ path: 'auth.json' });
  await browser.close();
}

export default globalSetup;
