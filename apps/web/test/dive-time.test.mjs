import assert from 'node:assert/strict';
import test from 'node:test';
import { todayWita, addMinutes, combineDiveTimes, initialDiveTimes } from '../src/ui/dive-time.mjs';
test('today follows WITA across UTC day boundary', () => {
  assert.equal(todayWita(new Date('2026-10-03T16:01:00Z')), '2026-10-04');
  assert.equal(todayWita(new Date('2026-10-03T15:59:00Z')), '2026-10-03');
});
test('50 minute proposal handles overnight and leap day without device timezone', () => {
  assert.equal(addMinutes('2026-10-04T11:06'), '2026-10-04T11:56');
  assert.equal(addMinutes('2026-10-04T23:40'), '2026-10-05T00:30');
  assert.equal(addMinutes('2028-02-28T23:40'), '2028-02-29T00:30');
  assert.equal(addMinutes('2026-02-30T11:00'), '');
  assert.equal(addMinutes(''), '');
});
test('same date reused; overnight requires explicit choice; exit remains nullable for draft', () => {
  assert.deepEqual(combineDiveTimes('2026-10-04', '23:40', '00:30', 1), {local_start:'2026-10-04T23:40', local_end:'2026-10-05T00:30'});
  const invalid = combineDiveTimes('2026-10-04', '12:00', '11:00');
  assert.ok(invalid.local_end < invalid.local_start);
  assert.equal(combineDiveTimes('2026-10-04', '12:00', '').local_end, null);
});
test('restoration preserves explicit dates and multi day historical intervals', () => {
  assert.deepEqual(initialDiveTimes(null, null, '2026-10-04'), {date:'2026-10-04',start:'',end:'',endDay:0});
  const restored = initialDiveTimes('2026-10-04T23:40', '2026-10-06T00:30', '2026-10-05');
  assert.deepEqual(combineDiveTimes(restored.date, restored.start, restored.end, restored.endDay), {local_start:'2026-10-04T23:40',local_end:'2026-10-06T00:30'});
});
