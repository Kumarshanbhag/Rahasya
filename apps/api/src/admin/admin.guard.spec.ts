import { deviceLabel, ipAllowed } from './admin.guard';

it('allows only listed addresses and ranges', () => {
  const list = '203.0.113.7, 10.0.0.0/8, 2001:db8::/32';
  expect(ipAllowed('203.0.113.7', list)).toBe(true);
  expect(ipAllowed('10.42.1.9', list)).toBe(true);
  expect(ipAllowed('::ffff:10.42.1.9', list)).toBe(true); // IPv4-mapped, as Node reports it
  expect(ipAllowed('2001:db8::1', list)).toBe(true);
  expect(ipAllowed('203.0.113.8', list)).toBe(false);
  expect(ipAllowed('192.168.1.1', list)).toBe(false);
});

it('fails closed when the list is unset, and opens only for an explicit *', () => {
  expect(ipAllowed('127.0.0.1', '')).toBe(false);
  expect(ipAllowed(undefined, '10.0.0.0/8')).toBe(false);
  expect(ipAllowed('127.0.0.1', '*')).toBe(true);
});

it('names the browser or platform for the audit log', () => {
  expect(deviceLabel('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/141.0 Safari/537.36')).toBe('Chrome');
  expect(deviceLabel('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15')).toBe('Safari');
  expect(deviceLabel('okhttp/4.12.0')).toBe('Android');
  expect(deviceLabel()).toBe('Unknown');
});
