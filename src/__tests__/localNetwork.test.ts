import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPrimaryLocalIPv4Address } from '../localNetwork.js';

describe('getPrimaryLocalIPv4Address', () => {
  it('returns the first non-internal IPv4 address', () => {
    const address = getPrimaryLocalIPv4Address({
      lo0: [
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
      ],
      en0: [
        { address: '192.168.1.23', netmask: '255.255.255.0', family: 'IPv4', mac: 'aa:bb:cc:dd:ee:ff', internal: false, cidr: '192.168.1.23/24' },
      ],
    });

    assert.equal(address, '192.168.1.23');
  });

  it('returns null when no external IPv4 address exists', () => {
    const address = getPrimaryLocalIPv4Address({
      lo0: [
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
      ],
    });

    assert.equal(address, null);
  });
});
