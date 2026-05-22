import { test, expect } from '../../fixtures/base.fixture';
import { LeavePage } from '../../pages/hr/leave.page';
import { leaveData } from '../../utils/test-data';

test.describe('Leave Management', () => {
  let leavePage: LeavePage;

  test.beforeEach(async ({ page }) => {
    leavePage = new LeavePage(page);
    await leavePage.navigate();
  });

  test('should display leave list', async ({ page }) => {
    await expect(page.locator('.o_list_view, .o_calendar_view')).toBeVisible();
  });

  test('should create a new leave request', async ({ page }) => {
    const data = leaveData();
    await leavePage.createLeaveRequest({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      description: data.description,
    });
    await expect(page.locator('.o_form_view')).toBeVisible();
    // Verify a leave type was selected — check input value, not wrapper div (many2one innerText is empty)
    await expect(page.locator('.o_field_widget[name="holiday_status_id"] input')).not.toHaveValue('');
  });

  test('should approve a leave request', async ({ page }) => {
    const data = leaveData();
    await leavePage.createLeaveRequest({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await leavePage.validateLeave();
    const status = await leavePage.getStatus();
    expect(status.toLowerCase()).toMatch(/approved|validate/);
  });

  test('should refuse a leave request', async ({ page }) => {
    const data = leaveData();
    await leavePage.createLeaveRequest({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await leavePage.refuseLeave();
    const status = await leavePage.getStatus();
    expect(status.toLowerCase()).toContain('refus');
  });

  test('should reset refused leave to draft', async ({ page }) => {
    const data = leaveData();
    await leavePage.createLeaveRequest({
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    await leavePage.refuseLeave();
    await leavePage.resetToDraft();
    const status = await leavePage.getStatus();
    expect(status.toLowerCase()).toMatch(/draft|to submit/);
  });
});
