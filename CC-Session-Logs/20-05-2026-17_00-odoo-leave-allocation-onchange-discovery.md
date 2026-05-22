# Session Log: 20-05-2026 17:00 - odoo-leave-allocation-onchange-discovery

## Quick Reference (for AI scanning)
**Confidence keywords:** odoo-17, playwright, hr.leave, holiday_status_id, requires_allocation, hr.leave.type, JAM-Executive, struct_id, hr.payroll.structure, OWL-autocomplete, group-dropdown-item, mousedown-handler, aria-activedescendant, employee-onchange, race-condition, selectMany2One, waitForResponse, screenshot-debugging, B-M-L-Fernando, 5-stable-failures
**Projects:** hr_playwright (Odoo 17 Enterprise on odoo.sh — Jinasena Agricultural Machinery)
**Outcome:** Identified TWO root causes for `holiday_status_id` selection: (1) FIXED — selector was matching group-container `<li>` instead of nested option `<li>` (use `li.o-autocomplete--dropdown-item`); (2) UNFIXED — employee has zero allocation for selected leave type ("JAM Executive"), Odoo's `_onchange_holiday_status_id` clears the value. Net progress: 25 → 25 passing, but understanding is now complete. Screenshot proves the field is cleared by allocation-check onchange, not by a Playwright/event issue.

## Key Learnings

### 1. Odoo 17 OWL autocomplete has TWO DOM structures (Case 1 vs Case 2)
- **Case 1 (no groups):** `<li class="o-autocomplete--dropdown-item" t-on-mousedown.prevent>` — flat list
- **Case 2 (with groups):** `<li class="o-autocomplete--dropdown-group" role="group"><ul><li role="option" t-on-mousedown.prevent>` — nested

Selector `li:not(.o-autocomplete--dropdown-footer)` matches the GROUP container `<li>` first in Case 2 (it's not a footer, but has no click handler), so the click silently does nothing. Correct selector is `li.o-autocomplete--dropdown-item` — group containers have class `o-autocomplete--dropdown-group`, NOT `o-autocomplete--dropdown-item`.

### 2. The `aria-activedescendant` ID-shape reveals the structure
- ID `holiday_status_id_0_0` (TWO numeric suffixes) → Case 1 (flat)
- ID `holiday_status_id_0_0_0` (THREE numeric suffixes) → Case 2 (groups). `_0_0_0` = source 0, group 0, option 0.

### 3. `holiday_status_id` clears itself when employee has no allocation
The Jinasena instance employees have **zero allocation** for leave types. When we select "JAM Executive" (the first `hr.leave.type` from JSON-RPC), Odoo fires `_onchange_holiday_status_id`, checks the employee's allocations, finds none, and silently sets `holiday_status_id = False`. The dropdown closes (selection registered) but the value reverts to `""`. Screenshot proof: right-side panel shows "B M L Fernando in 2026 → JAM Executive → None" confirming zero days allocated.

### 4. Screenshots from `test-results/` reveal pixels Playwright snapshots hide
The Playwright `error-context.md` YAML snapshot only shows ARIA roles — it does NOT show field-validation underlines or the right-side allocation summary. Reading the failure PNG with the Read tool surfaces details (red required-field underline, allocation panel) that immediately reveal the root cause. Always read the screenshot when ARIA snapshot is ambiguous.

### 5. `waitForLoadState('domcontentloaded')` does NOT wait for XHR/RPC responses
`domcontentloaded` fires when the initial DOM is ready. It does NOT wait for `call_kw` XHRs (onchange RPCs). Use `page.waitForResponse(resp => resp.url().includes('call_kw'))` armed BEFORE the trigger action to catch the onchange completion.

### 6. Playwright `force: true` click behaves differently from plain `click()`
- `click()` — full native pointer sequence (real mouse-move + mousedown + mouseup + click)
- `click({ force: true })` — bypasses actionability checks, uses CDP to directly dispatch events without real pointer movement

OWL's `t-on-mousedown.prevent` handler needs the full native pointer events. `force: true` may skip mousedown delivery to OWL. (This turned out to not be the root cause for holiday_status_id, but is a real distinction worth knowing.)

### 7. The "to approve" status in failing approve test is misleading
For 3 sessions we assumed leaves were being created successfully based on the approve test showing "to approve" status. The screenshot proved this was wrong — the create test never reaches save successfully (form has "Save manually" indicator + red underline on Time Off Type). The "to approve" might be from a stale/cached state or different code path.

## Solutions & Fixes

### Fixed: Group-aware dropdown selector in `utils/helpers.ts`
```typescript
// Before — matched group container <li> first in Case 2 grouped autocompletes
const dropdown = page.locator('.o-autocomplete--dropdown-menu li:not(.o-autocomplete--dropdown-footer), .ui-autocomplete li');

// After — only matches actual option items (skips .o-autocomplete--dropdown-group)
const dropdown = page.locator('.o-autocomplete--dropdown-menu li.o-autocomplete--dropdown-item:not(.o-autocomplete--dropdown-footer), .ui-autocomplete li');
```
Applied same selector update to:
- `pages/payroll/payslip.page.ts` (employee dropdown)
- `pages/hr/leave.page.ts` (employee dropdown)
- `pages/hr/attendance.page.ts` (employee dropdown + page.evaluate query)

### Fixed: JSON-RPC fetch for first available record name (in `leave.page.ts` and `payslip.page.ts`)
Instead of guessing field-value names, fetch them at runtime:
```typescript
const leaveTypeName = await this.page.evaluate(async () => {
  try {
    const r = await fetch('/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: {
          model: 'hr.leave.type',
          method: 'search_read',
          args: [[]],
          kwargs: { fields: ['name'], limit: 1 },
        },
      }),
    });
    const data = await r.json();
    return data.result?.[0]?.name ?? null;
  } catch { return null; }
});
```
Same pattern for `hr.payroll.structure` in payslip. **However**, for `hr.leave.type` this should be filtered: `args: [[['requires_allocation', '=', 'no']]]` to skip allocation-requiring types.

### Fixed: `validatePayslip()` waits for server action via `waitForResponse`
```typescript
async validatePayslip(): Promise<void> {
  const confirmBtn = this.page.getByRole('button', { name: 'Confirm' });
  const validateBtn = this.page.getByRole('button', { name: 'Validate' });
  const actionDone = this.page.waitForResponse(
    resp => resp.url().includes('call_kw') && resp.status() === 200,
    { timeout: 30_000 },
  );
  if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmBtn.click();
  } else if (await validateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await validateBtn.click();
  } else {
    actionDone.catch(() => {});
    return;
  }
  await actionDone.catch(() => {});
  await this.waitForReady();
}
```

### Fixed: Race condition wait after employee selection in `leave.page.ts`
```typescript
const empOnchangeDone = this.page.waitForResponse(
  resp => resp.url().includes('call_kw') && resp.status() === 200,
  { timeout: 10_000 },
);
await empDropdown.first().click({ force: true });
await empOnchangeDone.catch(() => {});
await this.page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
```

### Attempted but NOT working (kept for reference of what doesn't work):
- `page.evaluate(() => item.dispatchEvent(new MouseEvent('mousedown', ...)))` — same outcome as click()
- `ArrowDown + Enter` keyboard selection
- Plain `dropdown.first().click()` (no force) for grouped autocompletes — selector was wrong, not the click

## Files Modified

- `utils/helpers.ts` (line ~22) — `selectMany2One` dropdown selector now uses `li.o-autocomplete--dropdown-item` to skip group-container `<li>` elements that have no click handler
- `pages/hr/leave.page.ts` — multiple changes:
  - `navigate()` — unchanged from earlier session (JSON-RPC action resolution)
  - `createLeaveRequest()` — employee dropdown selector updated; added `waitForResponse` for employee onchange RPC; replaced ArrowDown+Enter / page.evaluate dispatch with `selectMany2One(holiday_status_id, leaveTypeName)` using JSON-RPC-fetched name. **STILL FAILS** because employee has no allocation for the type
  - `approveLeave()` — handles confirmation dialog after click (unchanged)
- `pages/payroll/payslip.page.ts`:
  - `createPayslip()` — `struct_id` block now uses JSON-RPC fetch of `hr.payroll.structure` name + `selectMany2One`. **WORKING** — snapshot confirms `struct_id = "Executive"` is set
  - `validatePayslip()` — added `waitForResponse` before clicking Confirm/Validate, uses `waitForReady()` after
- `pages/hr/attendance.page.ts` — selector update (`li.o-autocomplete--dropdown-item`) for consistency

## Pending Tasks

### HIGH: Filter `hr.leave.type` JSON-RPC fetch to types not requiring allocation
The current code in `leave.page.ts` `createLeaveRequest()` fetches the first `hr.leave.type` without filtering. The first type (alphabetically or by ID) in the Jinasena instance is "JAM Executive" which requires allocation. The employee "B M L Fernando" has zero allocations, so Odoo clears `holiday_status_id` via onchange.

**Fix:**
```typescript
const leaveTypeName = await this.page.evaluate(async () => {
  try {
    const r = await fetch('/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: {
          model: 'hr.leave.type',
          method: 'search_read',
          args: [[['requires_allocation', '=', 'no']]],  // <-- ADD THIS FILTER
          kwargs: { fields: ['name'], limit: 1 },
        },
      }),
    });
    const data = await r.json();
    return data.result?.[0]?.name ?? null;
  } catch { return null; }
});
```

If NO leave types have `requires_allocation = 'no'` in this instance, fall back strategy: create an `hr.leave.allocation` via JSON-RPC for the test employee before creating the leave request. Or filter for `requires_allocation = 'no'` first, then fall back to any type if none exist.

### HIGH: Payslip "Confirm" button visibility investigation
Snapshot from `should validate a payslip` test shows:
- `struct_id = "Executive"` ✓ (our fix worked)
- Status = "Draft" ✓
- Buttons visible: only "Compute Sheet" [disabled] and "Cancel" [disabled]
- NO "Confirm" button — should be visible per session log description (`invisible="state != 'draft' or not struct_id"`)
- Loading overlay present at the bottom of snapshot

Possible causes:
1. `computeSheet()` changed state to something where "Confirm" is invisible (e.g., 'verify')
2. The form is mid-loading when snapshot taken — buttons temporarily disabled
3. "Confirm" requires another field that's missing (the visibility condition is more complex than the session log noted)

**Investigation:** Add `computeSheet()` similar `waitForResponse` for the compute RPC. Then dump button list via `page.evaluate` to see what's actually rendered.

### MED: Leave APPROVE/REFUSE/RESET tests
These all depend on `createLeaveRequest` succeeding. Once leave-allocation issue is fixed and leaves are actually saved with valid types, re-investigate why approve doesn't change status:
- Possible 2-level approval: "Approve" goes to 'validate1' ("Second Approval") not 'validate' ("Approved")
- Permission issue: admin might lack `group_hr_holidays_responsible` on `hr.leave.type`
- Button label might differ (might be "Validate" in 'confirm' state, not "Approve")

### LOW: Update `MEMORY.md` `feedback_test_failures_run2.md`
Session log notes this file is stale — most FIXes applied or superseded. Consider removing after this session's fixes land.

## Errors & Workarounds

### Confirmed: Reading screenshots from `test-results/` is essential when ARIA snapshot is incomplete
For 3+ runs, we were diagnosing based on YAML ARIA snapshot (`error-context.md`) which only shows ARIA roles. Field-level CSS state (required underline, validation indicators) and side panels (allocation summary) are invisible in YAML but obvious in screenshots. **Always read the PNG when stuck.** Path pattern: `test-results/{spec-name}-{test-name}-chromium-retry1/test-failed-1.png`.

### Confirmed: The "wrong li" selector issue is silent
When Playwright clicks on a group-container `<li>` (no event handler), nothing happens visibly. No error, no warning. The dropdown stays open with `aria-expanded="true"`. **Diagnose by checking `aria-activedescendant` ID-shape** — three numeric suffixes (`field_0_0_0`) indicates grouped sources and a likely selector mismatch.

### Confirmed: 5 stable failures across runs
- `leave.spec.ts:17` — create (allocation issue clears holiday_status_id)
- `leave.spec.ts:29` — approve (depends on create + approval flow)
- `leave.spec.ts:40` — refuse (depends on create + refuse flow)
- `leave.spec.ts:51` — reset (depends on create + refuse + reset flow)
- `payslip.spec.ts:37` — validate (Confirm button not visible after compute)

### Test run history this session
- Run #1 (selectMany2One with leaveTypeName): 25 pass / 5 fail — dropdown stayed open (selector wrong)
- Run #2 (group-aware selector `li.o-autocomplete--dropdown-item`): 25 pass / 5 fail — dropdown closes (✓), value still reverts
- Run #3 (waitForResponse for employee onchange + waitForResponse for confirm): 25 pass / 5 fail — same
- Screenshot inspection: revealed allocation panel showing "None" for selected leave type

---

## Quick Resume Context

Two root causes identified for the 5 stable failures. For leave tests (4 failures): the selector fix (`li.o-autocomplete--dropdown-item`) made the click land on the right element, but Odoo's `_onchange_holiday_status_id` then clears the value because the test employee has zero allocation for the selected leave type ("JAM Executive"). The fix is filtering the JSON-RPC fetch with `[['requires_allocation', '=', 'no']]` so we pick a type that doesn't require allocation, OR creating an allocation first via JSON-RPC. For payslip test (1 failure): `struct_id` is correctly set ("Executive" shown in snapshot) but the "Confirm" button isn't visible after `computeSheet()` — likely because `computeSheet()` doesn't wait for the compute RPC to complete or the button visibility rule is more complex than expected. Next steps in `leave.page.ts` `createLeaveRequest()`: add the `requires_allocation` filter to the JSON-RPC. In `payslip.page.ts` `computeSheet()`: add `waitForResponse` for the compute action; then dump visible buttons via `page.evaluate` to understand the form state.

---

## Raw Session Log

User continued from previous session via `/compact` "and continue". The previous session log (`20-05-2026-15_30-odoo-playwright-json-rpc-nav-run4.md`) documented run #4 ending at 25 pass / 5 fail with the autocomplete selection problem unresolved.

This session resumed by implementing the suggested approach from the previous log's resume context: replace `ArrowDown + Enter` with native DOM `item.click()` via `page.evaluate()`. Edited `leave.page.ts:73-77` and `payslip.page.ts:70-74` accordingly.

Ran failing tests only (`tests/hr/leave.spec.ts tests/payroll/payslip.spec.ts`). Result: same 5 failures. Error context showed `aria-expanded="true"` and `aria-activedescendant="holiday_status_id_0_0_0"` set, value `""`. Dropdown still open, item highlighted but not selected.

Hypothesized OWL uses `mousedown` (not `click`) for selection — replaced `item.click()` with `dispatchEvent(new MouseEvent('mousedown', ...))` + mouseup + click. Same failure mode.

Tried using `selectMany2One` helper with JSON-RPC fetched leave-type name (assumption: plain Playwright `click()` not `force:true` would work). Added fetch for `hr.leave.type` and `hr.payroll.structure`. Same failure mode.

Key insight from re-examining `aria-activedescendant="holiday_status_id_0_0_0"` — THREE numeric suffixes, not two. This indicates grouped autocomplete sources in Odoo 17 OWL. The DOM structure has a `<li class="o-autocomplete--dropdown-group">` wrapping the actual `<li role="option">`. Our selector `li:not(.o-autocomplete--dropdown-footer)` was matching the group wrapper (which has no handler), so all click attempts silently no-oped.

Fixed by changing selector to `li.o-autocomplete--dropdown-item:not(.o-autocomplete--dropdown-footer)` in `utils/helpers.ts` `selectMany2One`. Applied same selector update to employee dropdowns in `payslip.page.ts`, `leave.page.ts`, and `attendance.page.ts`.

Re-ran tests. Progress: leave test now shows `aria-expanded="false"` (dropdown CLOSED, click registered) but value is still `""`. Payslip snapshot shows `struct_id = "Executive"` is correctly set, but "Confirm" button is not visible.

Hypothesized race condition: employee's onchange RPC completes AFTER our `holiday_status_id` selection and overwrites it. Added `page.waitForResponse(resp => resp.url().includes('call_kw'))` armed before employee click, awaited after, to ensure employee onchange completes before setting `holiday_status_id`. Also added similar waitForResponse to `validatePayslip()` for the Confirm action.

Re-ran tests. Same 5 failures. `aria-expanded="false"`, value `""`.

Took a step back and read the failure PNG screenshot directly: `D:\Github\hr_playwright\test-results\hr-leave-Leave-Management-should-create-a-new-leave-request-chromium-retry1\test-failed-1.png`. **Key discovery**: the leave form is in EDIT mode (cloud-save icon visible), the "Time Off Type" field is empty with a red required-field underline, and the right-side panel shows allocations for "B M L Fernando in 2026" with "JAM Executive" → "None" days. 

This proved the actual root cause: the leave type "JAM Executive" (which is what JSON-RPC `hr.leave.type` search_read returned as the first record) requires allocation, and the test employee has ZERO allocation. Odoo's `_onchange_holiday_status_id` runs after our selection succeeds, checks the employee's allocations, finds none, and clears `holiday_status_id` back to `""`. The dropdown closes (OWL handled the click) but the value doesn't persist (onchange reverted it).

Session compressed at this point. The fix is straightforward — filter the JSON-RPC fetch by `requires_allocation = 'no'` — but not yet implemented in this session.
