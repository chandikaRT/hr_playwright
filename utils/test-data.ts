import { uniqueName } from './helpers';

export function employeeData() {
  return {
    name: uniqueName('Test Employee'),
    jobPosition: 'Software Engineer',
    department: 'Research & Development',
    workPhone: '+94 11 000 0000',
    workEmail: `test.${Date.now()}@example.com`,
  };
}

export function leaveData() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return {
    leaveType: 'Annual Leave',
    dateFrom: formatDate(today),
    dateTo: formatDate(tomorrow),
    description: uniqueName('Test Leave'),
  };
}

export function contractData() {
  return {
    contractName: uniqueName('Test Contract'),
    wage: '50000',
    salaryStructure: 'Employee',
  };
}

export function payslipData() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    dateFrom: formatDate(firstDay),
    dateTo: formatDate(lastDay),
    name: uniqueName('Test Payslip'),
  };
}

export function batchData() {
  const now = new Date();
  return {
    name: uniqueName('Test Batch'),
    dateFrom: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
