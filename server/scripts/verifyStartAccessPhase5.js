'use strict';

/**
 * Phase 5 verify — Start Test UI routing (offline mirror of Kotlin).
 */

function line(ok, msg) {
  console.log(`${ok ? 'OK' : '!!'}  ${msg}`);
  return ok;
}

function uiRoute({
  showAppliedList,
  showLoading,
  hasSpecificTest,
  specificStartEntry,
  resolveAlreadyApplied,
}) {
  const showSpecificStart =
    !showAppliedList && !showLoading && hasSpecificTest && specificStartEntry != null;
  const showSpecificApply =
    !showAppliedList && !showLoading && hasSpecificTest &&
    !showSpecificStart && !resolveAlreadyApplied;
  return { showSpecificStart, showSpecificApply };
}

function homeStartSubtitle({ serverCanStart, startBlockReason, isLocked, countdown }) {
  if (serverCanStart === false) {
    return startBlockReason || 'Cannot start yet';
  }
  if (isLocked) return `Starts in ${countdown}`;
  return 'Ready to start';
}

function buttonLabel({ isLocked, lateJoinClosed, isPendingResult }) {
  if (isPendingResult) return 'Result Pending';
  if (lateJoinClosed) return 'Late Join Closed';
  if (isLocked) return 'Start Test (Locked)';
  return 'Start Test';
}

let ok = true;

const appliedOnServerNoLocal = uiRoute({
  showAppliedList: false,
  showLoading: false,
  hasSpecificTest: true,
  specificStartEntry: { testName: 'GK' },
  resolveAlreadyApplied: true,
});
ok = line(appliedOnServerNoLocal.showSpecificStart === true, 'applied on server, no local list → showSpecificStart') && ok;
ok = line(appliedOnServerNoLocal.showSpecificApply === false, 'applied → not showSpecificApply') && ok;

const notApplied = uiRoute({
  showAppliedList: false,
  showLoading: false,
  hasSpecificTest: true,
  specificStartEntry: null,
  resolveAlreadyApplied: false,
});
ok = line(notApplied.showSpecificApply === true, 'not applied → showSpecificApply') && ok;

const listRoute = uiRoute({
  showAppliedList: true,
  showLoading: false,
  hasSpecificTest: true,
  specificStartEntry: { testName: 'GK' },
  resolveAlreadyApplied: true,
});
ok = line(listRoute.showSpecificStart === false, 'applied list visible → no specific start') && ok;

ok = line(
  homeStartSubtitle({
    serverCanStart: false,
    startBlockReason: 'Test starts on 02 Jul 2026 10:00 AM',
    isLocked: true,
    countdown: '01:00:00',
  }).includes('Test starts on'),
  'home card shows server block reason',
) && ok;
ok = line(
  homeStartSubtitle({ serverCanStart: true, isLocked: false, countdown: '00:00:00' }) === 'Ready to start',
  'home card ready when server canStart',
) && ok;

ok = line(
  buttonLabel({ isLocked: true, lateJoinClosed: false, isPendingResult: false }) === 'Start Test (Locked)',
  'button uses short label when locked (not full block reason)',
) && ok;

if (ok) {
  console.log('\nPHASE5_UI_VERIFY_OK');
  process.exit(0);
}
console.log('\nPHASE5_UI_VERIFY_FAILED');
process.exit(1);
