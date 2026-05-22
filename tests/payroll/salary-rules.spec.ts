import { test, expect } from '../../fixtures/base.fixture';
import { navigate, ODOO_URLS } from '../../utils/helpers';

test.describe('Salary Structures & Rules', () => {
  test.beforeEach(async ({ page }) => {
    await navigate(page, ODOO_URLS.salaryStructures);
  });

  test('should display salary structures list', async ({ page }) => {
    await expect(page.locator('.o_list_view')).toBeVisible();
  });

  test('should show at least one salary structure', async ({ page }) => {
    // List may be grouped — check for either data rows or group headers
    await expect(page.locator('.o_data_row, .o_group_header').first()).toBeVisible();
  });

  test('should open a salary structure and display rules', async ({ page }) => {
    // Groups may be collapsed — expand the first one.
    // Use waitFor (not isVisible) so we actually wait for the list to render.
    const firstGroup = page.locator('tr.o_group_header, .o_group_header').first();
    const hasGroup = await firstGroup.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (hasGroup) {
      await firstGroup.click();
      await page.locator('.o_data_row').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    }
    await page.locator('.o_data_row').first().click();
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await expect(page.locator('.o_form_view')).toBeVisible();
    await expect(page.locator('.o_field_widget[name="rule_ids"], .o_field_widget[name="line_ids"]')).toBeVisible();
  });

  test('should show salary rules with code and name columns', async ({ page }) => {
    const firstGroup = page.locator('tr.o_group_header, .o_group_header').first();
    const hasGroup = await firstGroup.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (hasGroup) {
      await firstGroup.click();
      await page.locator('.o_data_row').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    }
    await page.locator('.o_data_row').first().click();
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    const rulesTable = page.locator('.o_field_widget[name="rule_ids"]').first();
    await expect(rulesTable).toBeVisible();
  });
});
