import { test, expect } from '../../fixtures/base.fixture';
import { EmployeePage } from '../../pages/hr/employee.page';
import { employeeData } from '../../utils/test-data';

test.describe('Employee Management', () => {
  let employeePage: EmployeePage;

  test.beforeEach(async ({ page }) => {
    employeePage = new EmployeePage(page);
    await employeePage.navigate();
  });

  test('should display employee list', async ({ page }) => {
    await expect(page.locator('.o_list_view, .o_kanban_view')).toBeVisible();
  });

  test('should create a new employee', async ({ page }) => {
    const data = employeeData();
    await employeePage.createEmployee({ name: data.name });
    await expect(page.locator(`.o_field_widget[name="name"] input`)).toHaveValue(data.name);
  });

  test('should create employee with department and job position', async ({ page }) => {
    const data = employeeData();
    await employeePage.createEmployee({
      name: data.name,
      department: data.department,
      jobPosition: data.jobPosition,
    });
    const name = await employeePage.getEmployeeName();
    expect(name).toBe(data.name);
  });

  test('should edit an existing employee', async ({ page }) => {
    const data = employeeData();
    await employeePage.createEmployee({ name: data.name });

    const newPhone = '+94 77 123 4567';
    await employeePage.editField('work_phone', newPhone);
    await expect(page.locator(`.o_field_widget[name="work_phone"] input`)).toHaveValue(newPhone);
  });

  test('should search for an employee by name', async ({ page }) => {
    const data = employeeData();
    await employeePage.createEmployee({ name: data.name });
    await employeePage.navigate();
    await employeePage.searchEmployee(data.name);
    await expect(page.locator('.o_data_row').first()).toContainText(data.name);
  });

  test('should archive an employee', async ({ page }) => {
    const data = employeeData();
    await employeePage.createEmployee({ name: data.name });
    await employeePage.archiveCurrentEmployee();
    await expect(page.locator('.o_notification, .alert-success, .o_form_view')).toBeVisible();
  });
});
