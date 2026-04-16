import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Alert } from '../types';
import type { AlertHandlerDeps } from '../alertHandler';
import { handleNewAlert } from '../alertHandler';
import type { TrackedMessage } from '../alertWindowTracker';

const BASE_ALERT: Alert = { type: 'missiles', cities: ['תל אביב', 'חיפה'] };

function makeTracked(overrides: Partial<TrackedMessage> = {}): TrackedMessage {
  return {
    messageId: 42,
    chatId: '-100123',
    topicId: 3,
    alert: { type: 'missiles', cities: ['תל אביב'] },
    sentAt: Date.now(),
    hasPhoto: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AlertHandlerDeps> = {}): AlertHandlerDeps {
  return {
    chatId: '-100123',
    generateMapImage: mock.fn(async () => Buffer.from('img')),
    sendAlert: mock.fn(async () => ({ messageId: 99, hasPhoto: true })),
    editAlert: mock.fn(async () => {}),
    getActiveMessage: mock.fn(() => null),
    trackMessage: mock.fn(() => {}),
    notifySubscribers: mock.fn(() => {}),
    shouldSkipMap: mock.fn(() => false),
    getTopicId: mock.fn(() => 3),
    insertAlertHistory: mock.fn(() => {}),
    ...overrides,
  };
}

describe('handleNewAlert', () => {
  // Suppress logger stdout so alert boxes don't pollute test output.
  let stdoutSpy: ReturnType<typeof mock.method>;
  beforeEach(() => {
    stdoutSpy = mock.method(process.stdout, 'write', () => true);
  });
  afterEach(() => {
    stdoutSpy.mock.restore();
  });

  describe('no active message (fresh send)', () => {
    it('calls sendAlert with the original alert', async () => {
      const deps = makeDeps();
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal((deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1);
      assert.deepEqual(
        (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls[0].arguments[0],
        BASE_ALERT
      );
    });

    it('calls trackMessage after sendAlert', async () => {
      const deps = makeDeps();
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal((deps.trackMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1);
    });

    it('passes original alert to notifySubscribers', async () => {
      const deps = makeDeps();
      await handleNewAlert(BASE_ALERT, deps);
      const notifyCalls = (deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(notifyCalls.length, 1);
      assert.deepEqual(notifyCalls[0].arguments[0], BASE_ALERT);
    });

    it('skips generateMapImage when shouldSkipMap returns true', async () => {
      const deps = makeDeps({ shouldSkipMap: mock.fn(() => true) });
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal((deps.generateMapImage as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 0);
      const sendCall = (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls[0];
      assert.equal(sendCall.arguments[1], null); // imageBuffer is null
    });

    it('H-5: notifySubscribers is called even when sendAlert throws', async () => {
      const deps = makeDeps({
        sendAlert: mock.fn(async () => { throw new Error('Broadcast failed'); }),
      });
      await handleNewAlert(BASE_ALERT, deps);
      const notifyCalls = (deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(notifyCalls.length, 1);
      assert.deepEqual(notifyCalls[0].arguments[0], BASE_ALERT);
    });

    it('H-6: sendAlert is called with the topicId returned by getTopicId', async () => {
      const deps = makeDeps(); // getTopicId returns 3 by default
      await handleNewAlert(BASE_ALERT, deps);
      const sendCall = (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls[0];
      assert.equal(sendCall.arguments[2], 3);
    });

    it('calls insertAlertHistory once after successful send', async () => {
      const deps = makeDeps();
      await handleNewAlert(BASE_ALERT, deps);
      const calls = (deps.insertAlertHistory as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].arguments[0], BASE_ALERT);
    });

    it('continues normally when insertAlertHistory throws — sendAlert and notifySubscribers still called', async () => {
      const deps = makeDeps({
        insertAlertHistory: mock.fn(() => { throw new Error('DB locked'); }),
      });
      // Should not throw — insertAlertHistory failure is non-fatal
      await assert.doesNotReject(() => handleNewAlert(BASE_ALERT, deps));
      assert.equal((deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1,
        'sendAlert must have been called despite insertAlertHistory failure');
      assert.equal((deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1,
        'notifySubscribers must be called despite insertAlertHistory failure');
    });
  });

  describe('active message exists (edit path)', () => {
    it('calls editAlert with merged cities', async () => {
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({ getActiveMessage: mock.fn(() => active) });
      await handleNewAlert({ type: 'missiles', cities: ['חיפה'] }, deps);

      const editCalls = (deps.editAlert as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(editCalls.length, 1);
      const mergedAlert = editCalls[0].arguments[1] as Alert;
      assert.deepEqual(new Set(mergedAlert.cities), new Set(['תל אביב', 'חיפה']));
    });

    it('on edit path: notifySubscribers receives only NEW cities (not already-sent ones)', async () => {
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({ getActiveMessage: mock.fn(() => active) });
      // Incoming alert has ONE new city ('חיפה') plus the already-sent city ('תל אביב')
      await handleNewAlert({ type: 'missiles', cities: ['תל אביב', 'חיפה'] }, deps);

      const notifyCalls = (deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(notifyCalls.length, 1, 'notifySubscribers must be called once');
      const notifiedAlert = notifyCalls[0].arguments[0] as Alert;
      // Only the NEW city should be in the DM
      assert.ok(notifiedAlert.cities.includes('חיפה'), 'new city must be included');
      assert.ok(!notifiedAlert.cities.includes('תל אביב'), 'already-notified city must NOT be re-sent');
    });

    it('on edit path: notifySubscribers is NOT called when no new cities added', async () => {
      // Active message already has the same cities as the incoming alert
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({ getActiveMessage: mock.fn(() => active) });
      // Incoming alert has the same city — no new cities
      await handleNewAlert({ type: 'missiles', cities: ['תל אביב'] }, deps);

      const notifyCalls = (deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(notifyCalls.length, 0, 'must not notify when there are no new cities');
    });

    it('tracks updated message after successful edit', async () => {
      const active = makeTracked();
      const deps = makeDeps({ getActiveMessage: mock.fn(() => active) });
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal((deps.trackMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1);
      assert.equal((deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 0);
    });

    it('handles "message is not modified" as success — does not sendAlert', async () => {
      // editAlert now handles isUnmodifiedError internally and resolves normally.
      // This test verifies alertHandler treats a resolved editAlert as success.
      const active = makeTracked();
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        editAlert: mock.fn(async () => {}), // resolves — simulates internal handling of "not modified"
      });
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal((deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 0);
      // trackMessage should still be called to update the stored alert
      assert.equal((deps.trackMessage as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1);
    });

    it('falls back to sendAlert when edit fails with "message gone" error', async () => {
      // Only isMessageGoneError triggers the fresh-send fallback in alertHandler.
      const active = makeTracked();
      const goneErr = new Error('message to edit not found');
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        editAlert: mock.fn(async () => { throw goneErr; }),
      });
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal((deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls.length, 1);
    });

    it('fallback sendAlert receives topicId as third argument when message is gone', async () => {
      const active = makeTracked(); // topicId: 3 in makeTracked; getTopicId also returns 3
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        editAlert: mock.fn(async () => { throw new Error('message to edit not found'); }),
      });
      await handleNewAlert(BASE_ALERT, deps);
      const sendCall = (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls[0];
      assert.equal(sendCall.arguments[2], 3);
    });

    it('on message-gone fallback-to-send path: notifySubscribers receives only new cities', async () => {
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        editAlert: mock.fn(async () => { throw new Error('message to edit not found'); }),
      });
      await handleNewAlert({ type: 'missiles', cities: ['תל אביב', 'חיפה'] }, deps);

      const notifyCalls = (deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(notifyCalls.length, 1);
      const notifiedAlert = notifyCalls[0].arguments[0] as Alert;
      assert.ok(notifiedAlert.cities.includes('חיפה'), 'new city must be in DM');
      assert.ok(!notifiedAlert.cities.includes('תל אביב'), 'pre-existing city must NOT be re-sent');
    });

    it('does NOT call insertAlertHistory on edit', async () => {
      const tracked = makeTracked();
      const deps = makeDeps({ getActiveMessage: mock.fn(() => tracked) });
      await handleNewAlert(BASE_ALERT, deps);
      const calls = (deps.insertAlertHistory as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 0, 'edit path must not insert a new history row');
    });

    it('calls insertAlertHistory once with merged alert when message-gone edit falls back to sendAlert', async () => {
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        editAlert: mock.fn(async () => { throw new Error('message to edit not found'); }),
      });
      await handleNewAlert({ type: 'missiles', cities: ['חיפה'] }, deps);
      const calls = (deps.insertAlertHistory as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 1, 'insertAlertHistory must be called on message-gone fallback-to-send path');
      const arg = calls[0].arguments[0] as Alert;
      assert.ok(arg.cities.includes('תל אביב'), 'merged alert must include pre-existing city');
      assert.ok(arg.cities.includes('חיפה'), 'merged alert must include new city');
    });

    it('H-7: editAlert throwing a non-message-gone error does NOT trigger sendAlert fallback', async () => {
      // After the degraded-chain fix, editAlert handles media/caption failures internally
      // and only re-throws for "message gone". alertHandler must check the error type
      // before falling back to sendAlert.
      const active = makeTracked();
      const mediaErr = new Error('MEDIA_EDIT_FAILED');
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        editAlert: mock.fn(async () => { throw mediaErr; }),
      });
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal(
        (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        0,
        'sendAlert must NOT be called when editAlert throws a non-message-gone error'
      );
    });

    it('H-8: editAlert throwing "message to edit not found" DOES trigger sendAlert fallback', async () => {
      const active = makeTracked();
      const goneErr = new Error('message to edit not found');
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        editAlert: mock.fn(async () => { throw goneErr; }),
      });
      await handleNewAlert(BASE_ALERT, deps);
      assert.equal(
        (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        1,
        'sendAlert must be called when message is gone'
      );
    });
  });

  describe('broadcastToWhatsApp', () => {
    it('calls broadcastToWhatsApp with finalAlert when provided', async () => {
      const waFn = mock.fn(async () => {});
      // Use a merging scenario so finalAlert differs from the incoming alert
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        broadcastToWhatsApp: waFn,
      });
      await handleNewAlert({ type: 'missiles', cities: ['חיפה'] }, deps);

      const calls = (waFn as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 1, 'broadcastToWhatsApp must be called once');
      const calledWith = calls[0].arguments[0] as Alert;
      // finalAlert should be the merged alert — includes both cities
      assert.ok(calledWith.cities.includes('תל אביב'), 'finalAlert must include pre-existing city');
      assert.ok(calledWith.cities.includes('חיפה'), 'finalAlert must include new city');
    });

    it('broadcastToWhatsApp error does not propagate', async () => {
      const waFn = mock.fn(async () => { throw new Error('wa fail'); });
      const deps = makeDeps({ broadcastToWhatsApp: waFn });
      await assert.doesNotReject(() => handleNewAlert(BASE_ALERT, deps));
      assert.equal(
        (deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        1,
        'notifySubscribers must complete before WhatsApp error'
      );
    });

    it('called on fresh-send path (no active message) with original alert', async () => {
      const waFn = mock.fn(async () => {});
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => null),
        broadcastToWhatsApp: waFn,
      });
      await handleNewAlert(BASE_ALERT, deps);
      const calls = (waFn as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 1, 'broadcastToWhatsApp must be called exactly once');
      assert.deepEqual(calls[0].arguments[0], BASE_ALERT, 'broadcastToWhatsApp must be called with the original alert');
    });

    it('passes regenerated imageBuffer to broadcastToWhatsApp on edit path', async () => {
      const waFn = mock.fn(async () => {});
      const mapBuffer = Buffer.from('merged-map-image');
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        generateMapImage: mock.fn(async () => mapBuffer),
        broadcastToWhatsApp: waFn,
      });
      await handleNewAlert({ type: 'missiles', cities: ['חיפה'] }, deps);

      const calls = (waFn as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 1, 'broadcastToWhatsApp must be called once');
      assert.equal(
        calls[0].arguments[1],
        mapBuffer,
        'broadcastToWhatsApp must receive the regenerated imageBuffer (not null)'
      );
    });

    it('no broadcastToWhatsApp in deps — no error, notifySubscribers still runs', async () => {
      const deps = makeDeps();
      // Explicitly omit broadcastToWhatsApp (it defaults to undefined in makeDeps)
      delete (deps as Partial<typeof deps>).broadcastToWhatsApp;
      await assert.doesNotReject(() => handleNewAlert(BASE_ALERT, deps));
      assert.equal(
        (deps.notifySubscribers as unknown as ReturnType<typeof mock.fn>).mock.calls.length,
        1,
        'notifySubscribers must be called even when broadcastToWhatsApp is absent'
      );
    });
  });

  describe('scheduleNeighborCheck dep', () => {
    it('calls scheduleNeighborCheck with full cities on a fresh send', async () => {
      const scheduleNeighborCheck = mock.fn();
      const deps = makeDeps({ scheduleNeighborCheck });
      await handleNewAlert(BASE_ALERT, deps);

      const calls = (scheduleNeighborCheck as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 1, 'scheduleNeighborCheck should be called once');
      assert.deepEqual((calls[0].arguments[0] as Alert).cities, BASE_ALERT.cities, 'should pass all cities on fresh send');
    });

    it('calls scheduleNeighborCheck with ONLY new cities on edit (dmCities filter)', async () => {
      // Active message already has תל אביב — חיפה is the new city
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const scheduleNeighborCheck = mock.fn();
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        scheduleNeighborCheck,
      });
      const alert: Alert = { type: 'missiles', cities: ['תל אביב', 'חיפה'] };
      await handleNewAlert(alert, deps);

      const calls = (scheduleNeighborCheck as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 1, 'should be called once for the new city');
      assert.deepEqual(
        (calls[0].arguments[0] as Alert).cities,
        ['חיפה'],
        'should only include cities not already in the active window'
      );
    });

    it('does NOT call scheduleNeighborCheck when all alert cities are already active', async () => {
      // Active message has all cities from the incoming alert — dmCities will be empty
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב', 'חיפה'] } });
      const scheduleNeighborCheck = mock.fn();
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        scheduleNeighborCheck,
      });
      const alert: Alert = { type: 'missiles', cities: ['תל אביב'] };
      await handleNewAlert(alert, deps);

      const calls = (scheduleNeighborCheck as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(calls.length, 0, 'must not be called when dmCities is empty');
    });

    it('is optional — omitting scheduleNeighborCheck does not throw', async () => {
      const deps = makeDeps(); // default makeDeps has no scheduleNeighborCheck
      await assert.doesNotReject(async () => handleNewAlert(BASE_ALERT, deps));
    });
  });

  describe('getDensityHint dep', () => {
    it('passes density from getDensityHint to sendAlert as 5th argument', async () => {
      const deps = makeDeps({
        getDensityHint: mock.fn(() => 'חריג' as const),
      });
      await handleNewAlert(BASE_ALERT, deps);
      const sendCalls = (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(sendCalls.length, 1, 'sendAlert should be called once');
      assert.equal(sendCalls[0].arguments[4], 'חריג', 'density should be passed as 5th arg');
    });

    it('passes undefined density when getDensityHint is absent', async () => {
      const deps = makeDeps();
      // getDensityHint is not in the default makeDeps — should default to undefined
      await handleNewAlert(BASE_ALERT, deps);
      const sendCalls = (deps.sendAlert as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(sendCalls.length, 1);
      assert.equal(sendCalls[0].arguments[4], undefined, 'density arg should be undefined when dep absent');
    });

    it('passes density from getDensityHint to editAlert on edit path', async () => {
      const active = makeTracked({ alert: { type: 'missiles', cities: ['תל אביב'] } });
      const deps = makeDeps({
        getActiveMessage: mock.fn(() => active),
        getDensityHint: mock.fn(() => 'חריג' as const),
      });
      await handleNewAlert(BASE_ALERT, deps);
      const editCalls = (deps.editAlert as unknown as ReturnType<typeof mock.fn>).mock.calls;
      assert.equal(editCalls.length, 1, 'editAlert should be called once on edit path');
      assert.equal(editCalls[0].arguments[4], 'חריג', 'density should be passed as 5th arg to editAlert');
    });
  });
});
