# Session Log: 20-05-2026 15:30 - odoo-playwright-json-rpc-nav-run4

## Quick Reference (for AI scanning)
**Confidence keywords:** odoo-17, playwright, json-rpc, ir.actions.act_window, hr.payslip, hr.payslip.run, hr.leave, navigate-by-action-id, autocomplete-dropdown, keyboard-enter, salary-structure, struct_id, holiday_status_id, employee_ids, employee_id, role-combobox, Salary-Computation-tab, line_ids, dialog-scope, Generate-Payslips-wizard, attendance-flake
**Projects:** hr_playwright (Odoo 17 Enterprise on odoo.sh, Jinasena Agricultural Machinery custom instance)
**Outcome:** 3 test runs, net +9 passes (16 → 22 → 25 → 25). JSON-RPC nav works for payslip+batch+leave list; payslip salary-structure auto-select still fails (Confirm button hidden); leave holiday_status_id selection still fails (autocomplete `<li>` click silently dropped — keyboard Enter also failed). Persistent 5 failing tests: 4 leave (create + 3 status-change), 1 payslip validate.

## Solutions & Fixes

### Fixed: JSON-RPC action ID lookup for nav ✓
`payslip.page.ts`, `payroll-batch.page.ts`, `leave.page.ts` `navigate()` methods now POST to `/web/dataset/call_kw` inside `page.evaluate()` to fetch `ir.actions.act_window` IDs at runtime, then navigate to `/web#action=${actionId}&cids=2`. Eliminates dependency on Odoo nav dropdowns.

```typescript
const actionId = await this.page.evaluate(async () => {
  try {
    const r = await fetch('/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: {
          model: 'ir.actions.act_window',
          method: 'search_read',
          args: [[['res_model', '=', 'hr.payslip']]],
          kwargs: { fields: ['id', 'name', 'view_mode'], limit: 20 },
        },
      }),
    });
    const data = await r.json();
    const actions: Array<{ id: number; name: string; view_mode: string }> = data.result ?? [];
    const listAction = actions.find(a => a.view_mode?.includes('list'));
    return listAction?.id ?? actions[0]?.id ?? null;
  } catch { return null; }
});
if (actionId) await navigate(this.page, `/web#action=${actionId}&cids=2`);
```

### Fixed: Payroll batch "Generate" button — scope to dialog ✓
`getByRole('button', { name: 'Generate' })` was matching the disabled action button on the main form. Scope to `div[role="dialog"]`:

```typescript
const dialog = this.page.locator('div[role="dialog"]');
if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await dialog.getByRole('button', { name: 'Generate' }).click();
}
```

### Fixed: Payslip line_ids not in DOM after compute ✓
"Salary Computation" tab is not active by default; tab content lazy-loads. Click the tab after `computeSheet()`:

```typescript
const salaryTab = this.page.getByRole('tab', { name: 'Salary Computation' });
if (await salaryTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
  await salaryTab.click();
}
```

### Fixed: Attendance autocomplete click race ✓
Replaced Playwright `click({ force: true })` (resolve→click race when dropdown re-renders) with native DOM click via `page.evaluate()`:

```typescript
await this.page.evaluate(() => {
  const item = document.querySelector('.o-autocomplete--dropdown-menu li:not(.o-autocomplete--dropdown-footer)') as HTMLElement | null;
  item?.click();
});
```

### Fixed: Leave employee field for both form variants ✓
"My Time" form uses `employee_id`; Management form uses `employee_ids`. Use ARIA role for both:

```typescript
const empInput = this.page.getByRole('combobox', { name: /^employees?$/i }).first();
await empInput.waitFor({ state: 'visible', timeout: 15_000 });
```

### Fixed: validatePayslip fallback no longer hangs ✓
Both Confirm and Validate now guarded with `isVisible().catch()` instead of unguarded `.click()` that would wait the 30 s actionTimeout.

### Attempted but NOT working: Leave holiday_status_id autocomplete selection ✗
Tried: `dropdown.first().click({ force: true })`, `page.evaluate` walking elements, `ArrowDown` + `Enter`. All fail — `holiday_status_id` input value stays empty after every approach. Symptom: `aria-expanded` toggles from `true` to `false` (dropdown closes) but no value is committed to the field.

### Attempted but NOT working: Payslip struct_id auto-select ✗
Same root cause as holiday_status_id — autocomplete dropdown opens, items render, but selection is not committed. Confirm button stays hidden because `struct_id` is empty.

## Files Modified

- `pages/payroll/payslip.page.ts`:
  - `navigate()` rewritten to JSON-RPC `hr.payslip` action lookup
  - `createPayslip()` now auto-selects first `struct_id` when none specified (using ArrowDown+Enter — failing)
  - `computeSheet()` now clicks "Salary Computation" tab so `line_ids` is in DOM
  - `validatePayslip()` Confirm/Validate fallback now uses `isVisible().catch()` guards
- `pages/payroll/payroll-batch.page.ts`:
  - `navigate()` rewritten to JSON-RPC `hr.payslip.run` action lookup
  - `generatePayslips()` Generate button now scoped to `div[role="dialog"]`
- `pages/hr/leave.page.ts`:
  - `navigate()` rewritten to JSON-RPC `hr.leave` action lookup (prefers `name` containing "all", excludes "my")
  - `createLeaveRequest()` employee field uses `getByRole('combobox', { name: /^employees?$/i })` for both single/multi variants
  - Leave type selection uses `ArrowDown`+`Enter` keyboard approach (still failing)
  - `approveLeave()` now handles confirmation dialog after click
- `pages/hr/attendance.page.ts`:
  - Autocomplete click replaced with native DOM `item.click()` via `page.evaluate()`

## Pending Tasks

1. **HIGH**: Fix `holiday_status_id` autocomplete selection in leave form (4 tests depend on it). The combobox accepts focus + dropdown opens but Enter/click/Tab all fail to commit a value. Investigation paths:
   - Use Odoo's onchange API directly: `fetch('/web/dataset/call_kw', { model: 'hr.leave', method: 'onchange', ... })` to populate the field at the model level
   - Look at how Odoo's own test framework (`tour_service`) selects autocomplete items — possibly synthesized `pointerdown` event needed, not `click`
   - Try `Tab` key instead of `Enter` to commit the value (some Odoo widgets bind tab not enter)
   - Inspect actual `<li>` HTML — may need to click inner `<a>` or trigger `mousedown` instead
2. **HIGH**: Fix `struct_id` auto-select in payslip form (same root cause — affects validatePayslip test).
3. **MED**: Once leave type selectable, re-verify `approveLeave()`, `refuseLeave()`, `resetToDraft()` button click flows; current "to approve" status indicates these buttons never fire because the underlying leave has no type.
4. Re-run full suite after autocomplete fix.

## Errors & Workarounds

### Confirmed: Odoo 17 autocomplete `<li>` items can't be selected via standard Playwright actions
Symptoms across 3 affected fields (`holiday_status_id`, `struct_id`, and previously `employee_id` for attendance):
- `locator.click()` — resolves but element becomes invisible before click attempt completes
- `locator.click({ force: true })` — same; sometimes succeeds (attendance) sometimes not (leave type/struct)
- `page.keyboard.press('ArrowDown')` + `Enter` — dropdown closes, no value committed
- `page.evaluate(() => item.click())` — works for attendance, NOT tested yet for holiday_status_id/struct_id

**Working workaround (for attendance only)**: Native DOM click via `page.evaluate`.

**Next strategy untried**: Use `mousedown` + `mouseup` synthesized events, OR call Odoo onchange API to set the field value directly without UI interaction.

### Confirmed: Payslip Confirm button is hidden unless struct_id is set
Page snapshot in Draft state only shows `Compute Sheet` and `Cancel` buttons — no Confirm. This is by Odoo XML view rule (`invisible="state != 'draft' or not struct_id"` or similar). Therefore the validatePayslip test can never pass until struct_id auto-select is fixed.

### Confirmed: Leave buttons (Approve/Refuse/Mark as Draft) silently fail when holiday_status_id is empty
Error logs show buttons resolve and click but `state` remains `confirm`/`to approve`. The Odoo server-side validates that a leave type is required before state transitions. The "Refuse" button in error snapshot shows `disabled="1" invisible="not active or not can_approve or state not in ('confirm','validate1','validate')"` — meaning the leave is in a state that doesn't even allow refuse.

### Test run results
- Run #1 (after first JSON-RPC batch + attendance fix): 22 pass / 8 fail
- Run #2 (after dialog-scope, Salary Computation tab, employee_ids fix): 25 pass / 4 fail + 1 flaky
- Run #3 (after role-combobox for employee, ArrowDown+Enter for type/struct): 25 pass / 5 fail
- Run #4 (same as run #3 — no improvement): 25 pass / 5 fail

The 5 stable failures across last 2 runs:
- `leave.spec.ts:17` should create a new leave request (holiday_status_id stays empty)
- `leave.spec.ts:29` should approve a leave request (status stays "to approve")
- `leave.spec.ts:40` should refuse a leave request (status stays "to approve")
- `leave.spec.ts:51` should reset refused leave to draft (status stays "to approve")
- `payslip.spec.ts:37` should validate a payslip (status stays "draft" — no Confirm button)

## Quick Resume Context

Continue with the autocomplete selection problem. Try (in order): (1) native DOM `item.click()` via `page.evaluate` for holiday_status_id and struct_id — same approach that fixed attendance; (2) if that fails, dispatch `pointerdown`+`pointerup`+`click` events on the `<li>`; (3) if both fail, bypass UI entirely and call `hr.leave` / `hr.payslip` model write API via JSON-RPC to set the missing fields. Memory file `feedback_test_failures_run2.md` is fully stale — most FIXes applied or superseded; consider deleting it. The 5 stable failures are all blocked on one root cause (autocomplete selection not committing), so a single fix should unblock 5 tests.

---

## Raw Session Log

User continued from previous session via `/compact` "and continue". The previous session log (`20-05-2026-14_00-odoo-playwright-nav-fixes-run3.md`) had identified the next strategy: implement Odoo JSON-RPC action ID lookup in payslip/payroll-batch/leave navigate() methods.

Implemented JSON-RPC nav for all 3 page objects + native DOM click for attendance autocomplete. Run #1: 22 passed (up from 16).

Read 6 remaining failures' error contexts. Discovered 3 distinct issues:
1. Leave management form uses `employee_ids` not `employee_id`
2. Payroll-batch "Generate" button found on main form (disabled) instead of dialog
3. Payslip `line_ids` not in DOM until "Salary Computation" tab clicked

Applied fixes for all 3 + validatePayslip fallback guard. Run #2: 25 passed / 4 failed + 1 flaky.

Remaining 4 failures + 1 flaky all traced to autocomplete fields not committing values:
- `holiday_status_id` (leave type)
- `struct_id` (salary structure)

Attempted role-based combobox + ArrowDown+Enter approach for these. Run #3: 25 passed / 5 failed. Tied with run #2 minus the flake.

Tried again with same keyboard approach (no change). Run #4: 25 passed / 5 failed — no improvement.

At this point user invoked `/compress`. The stable failure pattern across runs #3 and #4 confirms the autocomplete selection mechanism in these specific Odoo fields requires a different approach than ArrowDown+Enter or DOM click.
