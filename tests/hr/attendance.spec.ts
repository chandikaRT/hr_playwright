import { test, expect } from '../../fixtures/base.fixture';
import { AttendancePage } from '../../pages/hr/attendance.page';

test.describe('Attendance Management', () => {
  let attendancePage: AttendancePage;

  test.beforeEach(async ({ page }) => {
    attendancePage = new AttendancePage(page);
    await attendancePage.navigate();
  });

  test('should display attendance list', async ({ page }) => {
    await expect(page.locator('.o_list_view, .o_gantt_view')).toBeVisible();
  });

  test('should create a manual check-in entry', async ({ page }) => {
    await attendancePage.createManualEntry({
      checkIn: '05/18/2026 09:00:00',
      checkOut: '05/18/2026 17:00:00',
    });
    await expect(page.locator('.o_form_view')).toBeVisible();
    // Verify an employee was selected — check the input value, not the wrapper div
    await expect(page.locator('.o_field_widget[name="employee_id"] input')).not.toHaveValue('');
  });

  test('should search attendance records by employee', async ({ page }) => {
    await attendancePage.searchByEmployee('a');
    await expect(page.locator('.o_list_view')).toBeVisible();
  });
});
