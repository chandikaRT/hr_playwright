import { test, expect } from '../../fixtures/base.fixture';
import { PayslipPage } from '../../pages/payroll/payslip.page';
import { payslipData } from '../../utils/test-data';

test.describe('Payslip Management', () => {
  let payslipPage: PayslipPage;

  test.beforeEach(async ({ page }) => {
    payslipPage = new PayslipPage(page);
    await payslipPage.navigate();
  });

  test('should display payroll page', async ({ page }) => {
    await expect(page.locator('.o_list_view, .o_form_view, .o_kanban_view')).toBeVisible();
  });

  test('should create a new payslip', async ({ page }) => {
    const data = payslipData();
    await payslipPage.createPayslip({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await expect(page.locator('.o_form_view')).toBeVisible();
    await expect(page.locator('.o_field_widget[name="employee_id"] input')).not.toHaveValue('');
  });

  test('should compute a payslip', async ({ page }) => {
    const data = payslipData();
    await payslipPage.createPayslip({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await payslipPage.computeSheet();
    await expect(page.locator('.o_field_widget[name="line_ids"]')).toBeVisible();
  });

  test('should validate a payslip', async ({ page }) => {
    const data = payslipData();
    await payslipPage.createPayslip({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await payslipPage.computeSheet();
    await payslipPage.validatePayslip();
    const status = await payslipPage.getStatus();
    expect(status.toLowerCase()).toMatch(/done|paid|validated|confirm/);
  });

  test('should show salary lines after compute', async ({ page }) => {
    const data = payslipData();
    await payslipPage.createPayslip({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await payslipPage.computeSheet();
    await expect(page.locator('.o_field_widget[name="line_ids"]')).toBeVisible();
  });
});
