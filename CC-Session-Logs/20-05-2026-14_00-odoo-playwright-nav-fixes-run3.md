# Session Log: 20-05-2026 14:00 - odoo-playwright-nav-fixes-run3

## Quick Reference (for AI scanning)
**Confidence keywords:** odoo-17, playwright, navigation, dropdown-menu, role-link, role-menuitem, getStatusbarText, contract-status, salary-rules, strict-mode, page-evaluate, hr.payslip, hr.payslip.run, hr.leave, Management, All-Time-Off, Payslips-dropdown
**Projects:** hr_playwright (Odoo 17 Enterprise on odoo.sh, Jinasena Agricultural Machinery custom instance)
**Outcome:** 3 test runs, net +2 passes (14→16). Contract status + salary-rules strict-mode fixed. Leave/payslip/payroll-batch nav still failing — Payslips dropdown in this instance only contains "Rules" items, no payslip/batch submenus. Next step: use Odoo JSON-RPC to dynamically resolve action IDs.

## Solutions & Fixes

### Fixed: Contract `getContractStatus()` (contract.page.ts) ✓
Root cause: `getStatusbarText()` called `locator.first().textContent()` which has an implicit 30 s actionTimeout when no element matches. By the time it returned `''`, the dialog had auto-closed.

Fix: Check `div[role="dialog"]` FIRST (3 s timeout) before falling through to statusbar. Inside dialog, read statusbar scoped to dialog; if absent, return `'new'` (newly-created contracts are always "New").

### Fixed: Salary-rules strict mode (salary-rules.spec.ts) ✓
Root cause: `locator('.o_field_widget[name="rule_ids"] .o_list_view, .o_field_widget[name="rule_ids"]')` matched 2 elements (outer widget + inner list).
Fix: `.first()` on the outer widget locator.

### Fixed: Salary-rules group expansion (run #2) ✓
Switched `firstGroup.isVisible({timeout:2000})` → `firstGroup.waitFor({state:'visible', timeout:5000})` to surface failures instead of silently skipping group expansion, and bumped data-row wait to 10 s.

### Attempted but NOT working: Leave/Payslip/Payroll-Batch navigation ✗

**Tried 1:** `dropdown.locator('.dropdown-menu').last() → locator('a').filter(...)` — failed.
**Tried 2:** `page.evaluate()` to click by text walking `a, li, span, div, button` — also failed for leave (text labels unknown) and payslip (Payslips dropdown literally has no non-Rules items).
**Tried 3 (batch):** Dashboard "Batches → All" click via `locator('div').filter({has:heading 'Batches'}).getByText('All', {exact:true})` — failed; either the container isn't a `<div>` or "All" text doesn't match exactly.

**Next strategy (not yet implemented):** Use Odoo JSON-RPC `/web/dataset/call_kw` inside `page.evaluate()` to fetch `ir.actions.act_window` IDs at runtime, then navigate directly to those action URLs. This bypasses all UI selector guessing.

Example:
```ts
const actionId = await this.page.evaluate(async () => {
  const r = await fetch('/web/dataset/call_kw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call',
      params: {
        model: 'ir.actions.act_window',
        method: 'search_read',
        args: [[['res_model', '=', 'hr.payslip']]],
        kwargs: { fields: ['id', 'name'], limit: 5 },
      },
    }),
  });
  return (await r.json()).result?.[0]?.id ?? null;
});
if (actionId) await navigate(this.page, `/web#action=${actionId}&cids=2`);
```

## Files Modified

- `pages/hr/contract.page.ts`: `getContractStatus()` rewritten — dialog check first, then statusbar fallback, returns 'new' from dialog with no statusbar.
- `pages/hr/leave.page.ts`: `navigate()` Management dropdown click switched to `page.waitForFunction` + `page.evaluate` searching `a, li, span, div, button` for exact text "All Time Off" / "Time Off". Still failing.
- `pages/payroll/payslip.page.ts`: `navigate()` switched to `page.evaluate` for "All Payslips" / "Employee Payslips" / "Payslips". Still failing because no such items exist in the dropdown.
- `pages/payroll/payroll-batch.page.ts`: `navigate()` rewritten to click dashboard "Batches → All" via `locator('div').filter({has: heading 'Batches'})`, with evaluate fallback. Still failing.
- `tests/payroll/salary-rules.spec.ts`: group expansion uses `waitFor` instead of `isVisible`; rules table locator uses `.first()` to fix strict-mode violation.

## Pending Tasks

1. **Implement JSON-RPC action ID lookup** in `payslip.page.ts`, `payroll-batch.page.ts`, and `leave.page.ts` navigate() methods (highest priority — most likely to actually work).
2. **Diagnose attendance create flake** (`attendance.page.ts:26` — autocomplete dropdown item resolves but is invisible at click time). Was passing in runs 1 & 2, failing in run 3. Likely state-related (open check-in for the test employee). Try `force: true` on the dropdown click + `waitFor({state:'attached'})` ordering, or scroll the item into view explicitly.
3. **Test data caveat:** Admin user has no `hr.employee` linked in `cids=2`. Even if Management nav succeeds, the "New" form may still not show `employee_id` for admin. Verify after API-based nav lands us on the right list.
4. **Re-run full suite** after API fixes.

## Errors & Workarounds

### Root cause: `getStatusbarText()` 30 s hidden wait
`locator.first().textContent()` without an explicit timeout uses the action timeout (30 s in playwright.config). When `.o_statusbar_status` doesn't exist, it waits the full 30 s before the outer `.catch(()=>'')` fires. By then the dialog has closed.

**Workaround:** Always check ephemeral UI (dialogs that auto-close) BEFORE calling helpers that may hidden-wait.

### Root cause: Odoo 17 nav dropdown items aren't `role="menuitem"`
Direct nav items (no submenu) like "Overview" and "Dashboard" are `role="menuitem"`. Items INSIDE a dropdown (like "All Time Off" under Management) are `<a>` links so they appear as `role="link"` — but only when the dropdown is visible to Playwright's ARIA snapshotter. In this custom Odoo build, even `dropdown.locator('a')` didn't find them, suggesting the container class isn't `.dropdown-menu` either.

**Workaround attempted but unconfirmed:** `page.evaluate()` walking all element types and clicking by exact text. Works in principle but depends on knowing the exact label text in this instance.

### Confirmed: Payslips dropdown in Jinasena Odoo build is custom
Clicking the "Payslips" nav button shows ONLY `menuitem "Rules"` × 2 in the ARIA snapshot. There is no "All Payslips" or "Batch Payslips" submenu item. The payslip and batch lists must be accessed via:
- The payroll dashboard "Batches → All" link (for batches)
- Direct action URLs (need IDs from JSON-RPC)
- OR a different nav path not yet identified

### Test run results
- Run #1 (baseline after `/resume`): 14 pass / 16 fail
- Run #2 (after contract+nav+salary-rules fixes): 16 pass / 14 fail (+contract status, +salary-rules-open)
- Run #3 (after evaluate-based nav + strict-mode fix): 16 pass / 14 fail (+salary-rules-show-rules; −attendance-create regression)

## Quick Resume Context

Continue with the **Odoo JSON-RPC action ID lookup** approach in `payslip.page.ts`, `payroll-batch.page.ts`, and `leave.page.ts`. The Payslips nav dropdown in this Odoo instance is gutted (only Rules items), so UI-based menu navigation is a dead end — go directly to action URLs fetched at runtime from `ir.actions.act_window`. Also investigate the attendance create flake (autocomplete invisible-on-click) which regressed in run #3. Memory file `feedback_test_failures_run2.md` is now mostly stale — the original FIX 1, FIX 3-5, FIX 7 are all applied; the remaining failures need a different strategy.

---

## Raw Session Log

User invoked `/resume`, loaded context from `~/.claude/memory/MEMORY.md` (project + feedback memories, 2 days old).

User: "batch all" → I read all affected files; discovered all FIX 1-7 from memory were already applied. Reported status.

User: "run the suite and fix any errors" → ran `npm test`. Result: 14 pass / 16 fail. Read error contexts and diagnosed 4 root causes:
1. Contract status: `getStatusbarText` hidden 30 s wait
2. Leave/payroll nav: dropdown items not `role="menuitem"`
3. Salary-rules: `firstGroup.isVisible({timeout:2000})` too short

Applied 4 fixes:
- `contract.page.ts getContractStatus()`: dialog check first
- `leave.page.ts navigate()`: use `dropdown.locator('a')` for items
- `payslip.page.ts` + `payroll-batch.page.ts navigate()`: same dropdown link approach
- `salary-rules.spec.ts`: `waitFor` instead of `isVisible`, longer data-row wait

Run #2: 16 pass / 14 fail. Contract status fixed, salary-rules-open fixed. Leave/payslip/batch nav still failing.

Read full error contexts. Discovered Payslips dropdown only has "Rules" × 2 items in the ARIA snapshot — no payslip/batch submenu items exist at all.

Applied round 3 fixes:
- `leave.page.ts`: `page.waitForFunction` + `page.evaluate` to click by text walking `a, li, span, div, button`
- `payroll-batch.page.ts`: dashboard "Batches → All" click via filter+heading approach
- `payslip.page.ts`: evaluate-based click for "All Payslips" / "Employee Payslips" / "Payslips"
- `salary-rules.spec.ts`: `.first()` on rules table locator to fix strict-mode violation

Run #3: 16 pass / 14 fail again. Salary-rules-show-rules now passing. But attendance create regressed (autocomplete dropdown item not visible at click time). Leave/payslip/batch still failing.

Next strategy identified but not yet implemented: Odoo JSON-RPC `/web/dataset/call_kw` to fetch `ir.actions.act_window` IDs at runtime in `page.evaluate()`, then navigate directly to those URLs. This avoids all UI guessing.

User invoked `/compress` at this point.
