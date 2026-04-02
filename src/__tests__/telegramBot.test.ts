import { strict as assert } from 'node:assert';
import { describe, it, test, mock, beforeEach, afterEach } from 'node:test';
import {
  escapeHtml,
  buildCityList,
  buildZonedCityList,
  selectEditMethod,
  truncateToCaptionLimit,
  buildSendPayload,
  formatAlertMessage,
  TELEGRAM_CAPTION_MAX,
  isUnmodifiedError,
  isMediaEditError,
  isMessageGoneError,
  type EditBotApi,
} from '../telegramBot.js';

test('escapeHtml escapes ampersand', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml escapes less-than', () => {
  assert.equal(escapeHtml('a < b'), 'a &lt; b');
});

test('escapeHtml escapes greater-than', () => {
  assert.equal(escapeHtml('a > b'), 'a &gt; b');
});

test('escapeHtml leaves plain text unchanged', () => {
  assert.equal(escapeHtml('שלום עולם'), 'שלום עולם');
});

test('escapeHtml escapes multiple special chars', () => {
  assert.equal(escapeHtml('<b>a & b</b>'), '&lt;b&gt;a &amp; b&lt;/b&gt;');
});

test('buildCityList returns empty string for no cities', () => {
  assert.equal(buildCityList([]), '');
});

test('buildCityList joins few cities with comma', () => {
  assert.equal(buildCityList(['תל אביב', 'רמת גן']), 'תל אביב, רמת גן');
});

test('buildCityList shows all 25 cities with no overflow line', () => {
  const cities = Array.from({ length: 25 }, (_, i) => `עיר ${i + 1}`);
  const result = buildCityList(cities);
  assert.ok(result.includes('עיר 25'));
  assert.ok(!result.includes('נוספות'));
});

test('buildCityList truncates at 25 and shows overflow', () => {
  const cities = Array.from({ length: 30 }, (_, i) => `עיר ${i + 1}`);
  const result = buildCityList(cities);
  assert.ok(result.includes('עיר 25'));
  assert.ok(!result.includes('עיר 26'));
  assert.ok(result.includes('ועוד 5 ערים נוספות'));
});

test('buildCityList escapes HTML in city names', () => {
  const result = buildCityList(['תל & אביב']);
  assert.ok(result.includes('תל &amp; אביב'));
});

describe('buildZonedCityList', () => {
  it('returns empty string for no cities', () => {
    assert.equal(buildZonedCityList([]), '');
  });

  it('uses ערים נוספות header when no city has zone data', () => {
    const result = buildZonedCityList(['עיר לא קיימת בכלל']);
    assert.ok(result.includes('▸'), 'should show arrow emoji for ערים נוספות header');
    assert.ok(result.includes('ערים נוספות'), 'should show ערים נוספות header');
    assert.ok(result.includes('עיר לא קיימת בכלל'));
  });

  it('shows zone header for cities in a known zone', () => {
    // אור יהודה and בני ברק are both in the "דן" zone (countdown: 90s each)
    const result = buildZonedCityList(['אור יהודה', 'בני ברק']);
    assert.ok(result.includes('▸'), 'should include arrow emoji');
    assert.ok(result.includes('דן'), 'should show zone name');
    assert.ok(result.includes('אור יהודה'), 'should list city');
    assert.ok(result.includes('בני ברק'), 'should list city');
    assert.ok(result.includes('90 שנ׳'), 'should show countdown for zone');
  });

  it('shows the minimum countdown when zone cities have different countdowns', () => {
    // אבו גוש → "בית שמש" countdown:90, אביעזר → "בית שמש" countdown:90
    // but test with a mix: אור יהודה (דן, 90s) and a city with lower countdown
    // החותרים → "חיפה" countdown:60
    const result = buildZonedCityList(['החותרים']);
    assert.ok(result.includes('60 שנ׳'), 'should show 60s countdown for חיפה zone');
  });

  it('shows a separate section per zone for multi-zone alerts', () => {
    // אור יהודה → "דן" (90s), החותרים → "חיפה" (60s), באר שבע - דרום → "מרכז הנגב" (60s)
    const result = buildZonedCityList(['אור יהודה', 'החותרים', 'באר שבע - דרום']);
    assert.ok(result.includes('דן'), 'should show "דן" zone');
    assert.ok(result.includes('חיפה'), 'should show "חיפה" zone');
    assert.ok(result.includes('מרכז הנגב'), 'should show "מרכז הנגב" zone');
    assert.equal((result.match(/▸/g) ?? []).length, 3, 'should have one arrow per zone');
  });

  it('does not show countdown suffix for cities with no zone data', () => {
    const result = buildZonedCityList(['עיר לא קיימת בכלל']);
    assert.ok(!result.includes('⏱'), 'no-zone entries should not show countdown');
  });

  it('truncates at 25 cities per zone with overflow line', () => {
    // 30 cities all unknown (no zone) — uses plain buildCityList path
    const cities = Array.from({ length: 30 }, (_, i) => `עיר ${i + 1}`);
    const result = buildZonedCityList(cities);
    assert.ok(result.includes('ועוד 5 ערים נוספות'));
  });

  it('escapes HTML special characters in city names rendered inside zones', () => {
    // Unknown cities fall into the ערים נוספות section, rendered via buildCityList → escapeHtml.
    // Verifies user-supplied strings are never inserted as raw HTML.
    const malicious = 'עיר <b>רעה</b> & "בעיה"';
    const result = buildZonedCityList([malicious]);
    assert.ok(!result.includes('<b>רעה</b>'), 'raw <b> tag must not appear in output');
    assert.ok(result.includes('&lt;b&gt;'), 'angle brackets must be HTML-escaped');
    assert.ok(result.includes('&amp;'), 'ampersand must be HTML-escaped');
  });

  it('shows per-zone city count in zone header', () => {
    // אור יהודה and בני ברק are both in zone דן
    const result = buildZonedCityList(['אור יהודה', 'בני ברק']);
    assert.ok(result.includes('(2)'), `Expected "(2)" in zone header: ${result}`);
  });

  it('sorts cities alphabetically within each zone', () => {
    // Feed in reverse alphabetical order — output should be sorted
    const result = buildZonedCityList(['בני ברק', 'אור יהודה']);
    const orYehudaIdx = result.indexOf('אור יהודה');
    const bneiIdx = result.indexOf('בני ברק');
    assert.ok(orYehudaIdx < bneiIdx, `אור יהודה should appear before בני ברק (alpha order): ${result}`);
  });

  it('shows "ערים נוספות" header for cities not found in cities.json', () => {
    const result = buildZonedCityList(['עיר_לא_קיימת_123xyz']);
    assert.ok(result.includes('ערים נוספות'), `Expected "ערים נוספות" header: ${result}`);
    assert.ok(result.includes('▸'), 'should include arrow emoji for noZone header');
  });

  it('does not show "ערים נוספות" header when all cities have zone data', () => {
    const result = buildZonedCityList(['אור יהודה', 'בני ברק']); // both in דן
    assert.ok(!result.includes('ערים נוספות'), `Should not show noZone header when all cities match: ${result}`);
  });
});

describe('buildZonedCityList — urgency sorting', () => {
  it('sorts zones by urgency (most urgent first)', () => {
    // החותרים → "חיפה" (60s), אור יהודה → "דן" (90s)
    // חיפה has lower countdown, should appear first
    const result = buildZonedCityList(['אור יהודה', 'החותרים']);
    const haifaIdx = result.indexOf('חיפה');
    const danIdx = result.indexOf('דן');
    assert.ok(haifaIdx < danIdx, `חיפה (60s) should appear before דן (90s): ${result}`);
  });

  it('zone headers include urgency emoji', () => {
    // החותרים → "חיפה" (60s) — should get 🟡 (מהיר: <=60)
    const result = buildZonedCityList(['החותרים']);
    assert.ok(result.includes('🟡'), `Expected urgency emoji 🟡 in zone header: ${result}`);
  });

  it('does not show urgency emoji for zones with no countdown', () => {
    const result = buildZonedCityList(['עיר לא קיימת בכלל']);
    assert.ok(!result.includes('🔴') && !result.includes('🟠') && !result.includes('🟡') && !result.includes('🟢') && !result.includes('⚪'),
      `Should not show urgency emoji for unknown city zones: ${result}`);
  });
});

describe('truncateToCaptionLimit', () => {
  it('returns the message unchanged when it is within the caption limit', () => {
    const short = 'שלום עולם';
    assert.equal(truncateToCaptionLimit(short), short);
  });

  it('returns the message unchanged when it is exactly at the caption limit', () => {
    const atLimit = 'א'.repeat(TELEGRAM_CAPTION_MAX);
    assert.equal(truncateToCaptionLimit(atLimit), atLimit);
  });

  it('truncates at a zone-section boundary when the message exceeds the limit', () => {
    // Build a message with two sections separated by \n\n
    const section1 = '📍 <b>אזור א</b>\n' + 'א'.repeat(400);
    const section2 = '📍 <b>אזור ב</b>\n' + 'ב'.repeat(600);
    const message = section1 + '\n\n' + section2;

    assert.ok(message.length > TELEGRAM_CAPTION_MAX, 'pre-condition: message must exceed limit');

    const result = truncateToCaptionLimit(message);

    assert.ok(result.length <= TELEGRAM_CAPTION_MAX, 'result must fit within caption limit');
    assert.ok(result.includes('📍 <b>אזור א</b>'), 'first section should be retained');
    assert.ok(!result.includes('📍 <b>אזור ב</b>'), 'overflowing section should be cut');
    assert.ok(result.endsWith('\n<i>…</i>'), 'result must end with truncation marker');
  });

  it('falls back to a hard character cut when no zone boundary fits within the limit', () => {
    // A single continuous block longer than the limit
    const message = 'א'.repeat(TELEGRAM_CAPTION_MAX + 100);

    const result = truncateToCaptionLimit(message);

    assert.ok(result.length <= TELEGRAM_CAPTION_MAX);
    assert.ok(result.endsWith('\n<i>…</i>'));
  });
});

describe('buildSendPayload', () => {
  it('returns photo mode with truncated caption when imageBuffer is provided', () => {
    const longMessage = '📍 <b>אזור א</b>\n' + 'א'.repeat(400) + '\n\n' + '📍 <b>אזור ב</b>\n' + 'ב'.repeat(600);
    assert.ok(longMessage.length > TELEGRAM_CAPTION_MAX, 'pre-condition: message must exceed limit');

    const result = buildSendPayload(longMessage, Buffer.from('img'));
    assert.equal(result.mode, 'photo');
    assert.ok('caption' in result);
    assert.ok(result.caption.length <= TELEGRAM_CAPTION_MAX, 'caption must fit within limit');
    assert.ok(result.caption.endsWith('\n<i>…</i>'), 'truncated caption should end with marker');
  });

  it('returns photo mode with original message when it fits within caption limit', () => {
    const shortMessage = 'שלום עולם';
    const result = buildSendPayload(shortMessage, Buffer.from('img'));
    assert.equal(result.mode, 'photo');
    assert.ok('caption' in result);
    assert.equal(result.caption, shortMessage);
  });

  it('returns text mode with full message when no imageBuffer', () => {
    const message = 'א'.repeat(2000);
    const result = buildSendPayload(message, null);
    assert.equal(result.mode, 'text');
    assert.ok('text' in result);
    assert.equal(result.text, message, 'text mode should not truncate');
  });
});

describe('selectEditMethod', () => {
  it('returns "media" when hasPhoto=true and imageBuffer is provided', () => {
    const result = selectEditMethod(true, Buffer.from('img'));
    assert.equal(result, 'media');
  });

  it('returns "caption" when hasPhoto=true but imageBuffer is null', () => {
    assert.equal(selectEditMethod(true, null), 'caption');
  });

  it('returns "text" when hasPhoto=false regardless of imageBuffer', () => {
    assert.equal(selectEditMethod(false, null), 'text');
    assert.equal(selectEditMethod(false, Buffer.from('img')), 'text');
  });
});

describe('formatAlertMessage with receivedAt timestamp', () => {
  it('uses receivedAt timestamp when provided', () => {
    // 2024-06-15 14:30:00 UTC = 17:30 Israel time (UTC+3 in summer)
    const fixedMs = new Date('2024-06-15T14:30:00Z').getTime();
    const alert = {
      type: 'rockets',
      cities: ['תל אביב'],
      receivedAt: fixedMs,
    };

    const result = formatAlertMessage(alert);
    assert.ok(result.includes('17:30'), 'formatted message should include the time 17:30 for the fixed timestamp');
  });

  it('falls back to current time when receivedAt is not provided', () => {
    const alert = {
      type: 'rockets',
      cities: ['תל אביב'],
    };

    const result = formatAlertMessage(alert);
    // Just verify that a time pattern is included (HH:MM format)
    assert.ok(/\d{2}:\d{2}/.test(result), 'formatted message should include a time pattern HH:MM');
  });
});

describe('formatAlertMessage city count', () => {
  it('shows city count in header when cities present', () => {
    const alert = {
      type: 'missiles',
      cities: ['עיר א', 'עיר ב', 'עיר ג'],
    };
    const result = formatAlertMessage(alert);
    assert.ok(result.includes('3 ערים'), `Expected "3 ערים" in: ${result}`);
  });

  it('omits city count suffix when cities array is empty', () => {
    const alert = {
      type: 'missiles',
      cities: [],
    };
    const result = formatAlertMessage(alert);
    assert.ok(!result.includes('ערים'), `Should not show city count for empty cities: ${result}`);
  });
});

// ─── Error classifier pure-function tests ────────────────────────────────────

describe('isUnmodifiedError', () => {
  it('returns true for "message is not modified" error', () => {
    assert.equal(isUnmodifiedError(new Error('Bad Request: message is not modified')), true);
  });

  it('returns false for a different error message', () => {
    assert.equal(isUnmodifiedError(new Error('Network error')), false);
  });

  it('returns false for non-Error values', () => {
    assert.equal(isUnmodifiedError('string'), false);
    assert.equal(isUnmodifiedError(null), false);
    assert.equal(isUnmodifiedError(42), false);
  });
});

describe('isMediaEditError', () => {
  it('returns true for MEDIA_EDIT_FAILED', () => {
    assert.equal(isMediaEditError(new Error('MEDIA_EDIT_FAILED')), true);
  });

  it("returns true for \"media can't be edited\"", () => {
    assert.equal(isMediaEditError(new Error("Bad Request: media can't be edited")), true);
  });

  it('returns true for "wrong type of the web page content"', () => {
    assert.equal(isMediaEditError(new Error('wrong type of the web page content')), true);
  });

  it('returns false for unrelated errors', () => {
    assert.equal(isMediaEditError(new Error('Network error')), false);
    assert.equal(isMediaEditError(new Error('message is not modified')), false);
  });

  it('returns false for non-Error values', () => {
    assert.equal(isMediaEditError(null), false);
    assert.equal(isMediaEditError('MEDIA_EDIT_FAILED'), false);
  });
});

describe('isMessageGoneError', () => {
  it('returns true for "message to edit not found"', () => {
    assert.equal(isMessageGoneError(new Error('Bad Request: message to edit not found')), true);
  });

  it("returns true for \"message can't be edited\"", () => {
    assert.equal(isMessageGoneError(new Error("Bad Request: message can't be edited")), true);
  });

  it('returns false for unrelated errors', () => {
    assert.equal(isMessageGoneError(new Error('Network error')), false);
    assert.equal(isMessageGoneError(new Error('MEDIA_EDIT_FAILED')), false);
  });

  it('returns false for non-Error values', () => {
    assert.equal(isMessageGoneError(null), false);
    assert.equal(isMessageGoneError(undefined), false);
  });
});

// ─── editAlert degraded chain tests ──────────────────────────────────────────

describe('editAlert degraded chain (_editAlertChain)', () => {
  // Suppress logger stdout so test output stays clean
  let stdoutSpy: ReturnType<typeof mock.method>;
  beforeEach(() => {
    stdoutSpy = mock.method(process.stdout, 'write', () => true);
  });
  afterEach(() => {
    stdoutSpy.mock.restore();
  });

  const tracked = { messageId: 42, chatId: '-100', hasPhoto: true };
  const alert = { type: 'missiles', cities: ['תל אביב'] };
  const imageBuffer = Buffer.from('img');

  it('Step 1 success: calls editMessageMedia and does not degrade', async () => {
    const api = {
      editMessageMedia: mock.fn(async () => ({})),
      editMessageCaption: mock.fn(async () => ({})),
      editMessageText: mock.fn(async () => ({})),
    };

    const { _editAlertChain } = await import('../telegramBot.js');
    await _editAlertChain(
      api as unknown as EditBotApi,
      tracked,
      alert,
      imageBuffer
    );

    assert.equal(api.editMessageMedia.mock.calls.length, 1, 'Step 1 must be attempted');
    assert.equal(api.editMessageCaption.mock.calls.length, 0, 'Step 2 must NOT be called on success');
    assert.equal(api.editMessageText.mock.calls.length, 0, 'Step 3 must NOT be called on success');
  });

  it('Step 1 media error → Step 2 caption edit succeeds: does not re-throw', async () => {
    const api = {
      editMessageMedia: mock.fn(async () => { throw new Error('MEDIA_EDIT_FAILED'); }),
      editMessageCaption: mock.fn(async () => ({})),
      editMessageText: mock.fn(async () => ({})),
    };

    const { _editAlertChain } = await import('../telegramBot.js');
    await assert.doesNotReject(() =>
      _editAlertChain(
        api as unknown as EditBotApi,
        tracked,
        alert,
        imageBuffer
      )
    );

    assert.equal(api.editMessageMedia.mock.calls.length, 1, 'Step 1 must be attempted');
    assert.equal(api.editMessageCaption.mock.calls.length, 1, 'Step 2 must be called on media failure');
    assert.equal(api.editMessageText.mock.calls.length, 0, 'Step 3 must NOT be called');
  });

  it('Step 1 media error → Step 2 caption error → Step 3 text edit succeeds', async () => {
    const api = {
      editMessageMedia: mock.fn(async () => { throw new Error('MEDIA_EDIT_FAILED'); }),
      editMessageCaption: mock.fn(async () => { throw new Error('caption failed unexpectedly'); }),
      editMessageText: mock.fn(async () => ({})),
    };

    const { _editAlertChain } = await import('../telegramBot.js');
    await assert.doesNotReject(() =>
      _editAlertChain(
        api as unknown as EditBotApi,
        tracked,
        alert,
        imageBuffer
      )
    );

    assert.equal(api.editMessageMedia.mock.calls.length, 1, 'Step 1 attempted');
    assert.equal(api.editMessageCaption.mock.calls.length, 1, 'Step 2 attempted');
    assert.equal(api.editMessageText.mock.calls.length, 1, 'Step 3 attempted as final fallback');
  });

  it('isUnmodifiedError in Step 1 → resolves without degrading', async () => {
    const api = {
      editMessageMedia: mock.fn(async () => { throw new Error('message is not modified'); }),
      editMessageCaption: mock.fn(async () => ({})),
      editMessageText: mock.fn(async () => ({})),
    };

    const { _editAlertChain } = await import('../telegramBot.js');
    await assert.doesNotReject(() =>
      _editAlertChain(
        api as unknown as EditBotApi,
        tracked,
        alert,
        imageBuffer
      )
    );

    assert.equal(api.editMessageCaption.mock.calls.length, 0, 'must not degrade on unmodified');
    assert.equal(api.editMessageText.mock.calls.length, 0, 'must not degrade on unmodified');
  });

  it('isMessageGoneError → re-throws so alertHandler can send fresh message', async () => {
    const goneError = new Error('message to edit not found');
    const api = {
      editMessageMedia: mock.fn(async () => { throw goneError; }),
      editMessageCaption: mock.fn(async () => ({})),
      editMessageText: mock.fn(async () => ({})),
    };

    const { _editAlertChain } = await import('../telegramBot.js');
    await assert.rejects(
      () => _editAlertChain(
        api as unknown as EditBotApi,
        tracked,
        alert,
        imageBuffer
      ),
      (err: Error) => {
        assert.equal(err, goneError);
        return true;
      }
    );

    assert.equal(api.editMessageCaption.mock.calls.length, 0, 'must not degrade when message is gone');
    assert.equal(api.editMessageText.mock.calls.length, 0, 'must not degrade when message is gone');
  });

  it('unknown error in Step 1 → degrades to Step 2 (caption)', async () => {
    const api = {
      editMessageMedia: mock.fn(async () => { throw new Error('Some unknown Telegram error'); }),
      editMessageCaption: mock.fn(async () => ({})),
      editMessageText: mock.fn(async () => ({})),
    };

    const { _editAlertChain } = await import('../telegramBot.js');
    await assert.doesNotReject(() =>
      _editAlertChain(
        api as unknown as EditBotApi,
        tracked,
        alert,
        imageBuffer
      )
    );

    assert.equal(api.editMessageCaption.mock.calls.length, 1, 'Step 2 must be tried for unknown errors');
  });

  it('caption-only path (hasPhoto=true, no image): Step 1 is caption, Step 2 is text on failure', async () => {
    const trackedNoImg = { messageId: 42, chatId: '-100', hasPhoto: true };
    const api = {
      editMessageMedia: mock.fn(async () => ({})),
      editMessageCaption: mock.fn(async () => { throw new Error('some caption error'); }),
      editMessageText: mock.fn(async () => ({})),
    };

    const { _editAlertChain } = await import('../telegramBot.js');
    // No imageBuffer — starts at caption
    await assert.doesNotReject(() =>
      _editAlertChain(
        api as unknown as EditBotApi,
        trackedNoImg,
        alert,
        null   // no image buffer
      )
    );

    assert.equal(api.editMessageMedia.mock.calls.length, 0, 'Step 1 (media) must not be called when no image');
    assert.equal(api.editMessageCaption.mock.calls.length, 1, 'caption attempted');
    assert.equal(api.editMessageText.mock.calls.length, 1, 'text fallback used on caption failure');
  });
});
