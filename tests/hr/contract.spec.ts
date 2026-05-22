import { test, expect } from '../../fixtures/base.fixture';
import { EmployeePage } from '../../pages/hr/employee.page';
import { ContractPage } from '../../pages/hr/contract.page';
import { employeeData, contractData } from '../../utils/test-data';

test.describe('Employee Contracts', () => {
  let employeePage: EmployeePage;
  let contractPage: ContractPage;

  test.beforeEach(async ({ page }) => {
    employeePage = new EmployeePage(page);
    contractPage = new ContractPage(page);
  });

  test('should create a contract for an employee', async ({ page }) => {
    const emp = employeeData();
    const contract = contractData();

    await employeePage.navigate();
    await employeePage.createEmployee({ name: emp.name });

    await contractPage.navigateFromEmployee();
    await contractPage.createContract({
      contractName: contract.contractName,
      wage: contract.wage,
    });

    // In this Odoo instance, contracts open in a modal dialog — scope assertions to it
    // to avoid matching the employee form's "name" field behind the dialog.
    const dialog = page.locator('div[role="dialog"]');
    const scope = await dialog.isVisible().catch(() => false) ? dialog : page;
    await expect(scope.locator(`.o_field_widget[name="name"] input`)).toHaveValue(contract.contractName);
    await expect(scope.locator(`.o_field_widget[name="wage"] input`)).toHaveValue(contract.wage);
  });

  test('should create a contract with salary structure', async ({ page }) => {
    const emp = employeeData();
    const contract = contractData();

    await employeePage.navigate();
    await employeePage.createEmployee({ name: emp.name });

    await contractPage.navigateFromEmployee();
    await contractPage.createContract({
      contractName: contract.contractName,
      wage: contract.wage,
      salaryStructure: contract.salaryStructure,
    });

    const dialog = page.locator('div[role="dialog"]');
    const scope = await dialog.isVisible().catch(() => false) ? dialog : page;
    await expect(scope.locator('.o_form_view')).toBeVisible();
    const name = await scope.locator(`.o_field_widget[name="name"] input`).inputValue();
    expect(name).toBe(contract.contractName);
  });

  test('should display contract status as New', async ({ page }) => {
    const emp = employeeData();
    const contract = contractData();

    await employeePage.navigate();
    await employeePage.createEmployee({ name: emp.name });

    await contractPage.navigateFromEmployee();
    await contractPage.createContract({
      contractName: contract.contractName,
      wage: contract.wage,
    });

    const status = await contractPage.getContractStatus();
    expect(status.toLowerCase()).toMatch(/new|draft/);
  });
});
