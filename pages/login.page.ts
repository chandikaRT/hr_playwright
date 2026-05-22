import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/login', { waitUntil: 'domcontentloaded' });
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.locator('input[name="login"]').fill(email);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.getByRole('button', { name: 'Log in' }).click();
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await this.page.locator('.o_main_navbar, .o_action_manager').first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  async isLoggedIn(): Promise<boolean> {
    return this.page.url().includes('/web') && !this.page.url().includes('/web/login');
  }
}
