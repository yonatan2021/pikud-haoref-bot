import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { log, logStartupHeader, logAlert } from '../logger.js';
import { toVisualRtl } from '../loggerUtils.js';

let captured: string[];
let stdoutSpy: ReturnType<typeof mock.method>;

beforeEach(() => {
  captured = [];
  stdoutSpy = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
    captured.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mock.restore();
});

function output(): string {
  return captured.join('');
}

describe('log()', () => {
  it('writes the message to stdout', () => {
    log('info', 'TestTag', 'hello world');
    assert.ok(output().includes('hello world'));
  });

  it('includes the tag in output', () => {
    log('warn', 'MyTag', 'test message');
    assert.ok(output().includes('MyTag'));
  });

  it('uses ✗ icon for error level', () => {
    log('error', 'T', 'msg');
    assert.ok(output().includes('✗'));
  });

  it('uses ✓ icon for success level', () => {
    log('success', 'T', 'msg');
    assert.ok(output().includes('✓'));
  });

  it('uses ⚠ icon for warn level', () => {
    log('warn', 'T', 'msg');
    assert.ok(output().includes('⚠'));
  });

  it('uses · icon for info level', () => {
    log('info', 'T', 'msg');
    assert.ok(output().includes('·'));
  });
});

describe('logStartupHeader()', () => {
  it('includes the version in output', () => {
    logStartupHeader('1.2.3', []);
    assert.ok(output().includes('1.2.3'));
  });

  it('includes service name in output', () => {
    logStartupHeader('0', [{ name: 'Health Server', detail: 'port 3000', ok: true }]);
    assert.ok(output().includes('Health Server'));
  });

  it('includes service detail in output', () => {
    logStartupHeader('0', [{ name: 'Svc', detail: 'port 9999', ok: true }]);
    assert.ok(output().includes('port 9999'));
  });

  it('renders both ok and failing services', () => {
    logStartupHeader('0', [
      { name: 'GoodSvc', detail: 'ok detail', ok: true },
      { name: 'BadSvc',  detail: 'fail detail', ok: false },
    ]);
    const out = output();
    assert.ok(out.includes('GoodSvc'));
    assert.ok(out.includes('BadSvc'));
    assert.ok(out.includes('ok detail'));
    assert.ok(out.includes('fail detail'));
  });
});

describe('logAlert()', () => {
  const base = {
    emoji:       '🚀',
    titleHe:     'ירי רקטות',
    category:    'security' as const,
    cities:      ['תל אביב', 'חיפה'],
    sentToGroup: true,
    isEdit:      false,
  };

  it('includes the title in output', () => {
    logAlert(base);
    assert.ok(output().includes(toVisualRtl('ירי רקטות')));
  });

  it('includes city names in output', () => {
    logAlert(base);
    const out = output();
    assert.ok(out.includes(toVisualRtl('תל אביב')));
    assert.ok(out.includes(toVisualRtl('חיפה')));
  });

  it('shows "נשלח לקבוצה" when sent successfully', () => {
    logAlert({ ...base, sentToGroup: true, isEdit: false });
    assert.ok(output().includes(toVisualRtl('נשלח לקבוצה')));
  });

  it('shows "עודכן" when isEdit is true', () => {
    logAlert({ ...base, sentToGroup: true, isEdit: true });
    assert.ok(output().includes(toVisualRtl('עודכן')));
  });

  it('shows "שגיאה בשליחה" when sentToGroup is false', () => {
    logAlert({ ...base, sentToGroup: false });
    assert.ok(output().includes(toVisualRtl('שגיאה בשליחה')));
  });

  it('truncates city list and shows overflow count when > 20 cities', () => {
    const manyCities = Array.from({ length: 25 }, (_, i) => `עיר${i}`);
    logAlert({ ...base, cities: manyCities });
    assert.ok(output().includes(toVisualRtl('+5 נוספות')));
  });

  it('does not show overflow indicator for exactly 20 cities', () => {
    const exactCities = Array.from({ length: 20 }, (_, i) => `עיר${i}`);
    logAlert({ ...base, cities: exactCities });
    assert.ok(!output().includes(toVisualRtl('נוספות')));
  });

  it('does not show overflow indicator for fewer than 20 cities', () => {
    logAlert({ ...base, cities: ['עיר1', 'עיר2'] });
    assert.ok(!output().includes(toVisualRtl('נוספות')));
  });
});
