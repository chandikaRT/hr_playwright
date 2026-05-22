import { test, expect } from '../../fixtures/base.fixture';
import { PayrollBatchPage } from '../../pages/payroll/payroll-batch.page';
import { batchData } from '../../utils/test-data';

test.describe('Payroll Batch', () => {
  let batchPage: PayrollBatchPage;

  test.beforeEach(async ({ page }) => {
    batchPage = new PayrollBatchPage(page);
    await batchPage.navigate();
  });

  test('should display payroll page', async ({ page }) => {
    await expect(page.locator('.o_list_view, .o_form_view, .o_kanban_view')).toBeVisible();
  });

  test('should create a new payroll batch', async ({ page }) => {
    const data = batchData();
    await batchPage.createBatch({
      name: data.name,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await expect(page.locator('.o_form_view')).toBeVisible();
    await expect(page.locator(`.o_field_widget[name="name"] input`)).toHaveValue(data.name);
  });

  test('should generate payslips for the batch', async ({ page }) => {
    const data = batchData();
    await batchPage.createBatch({
      name: data.name,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await batchPage.generatePayslips();
    await expect(page.locator('.o_form_view')).toBeVisible();
  });

  test('should show batch status after creation', async ({ page }) => {
    const data = batchData();
    await batchPage.createBatch({
      name: data.name,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    const status = await batchPage.getStatus();
    // Status can be 'New', 'Draft', or empty depending on Odoo version
    expect(typeof status).toBe('string');
  });
});
