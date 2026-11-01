import { describe, expect, it } from 'vitest';
import { apiStateLabel, checkImageFile, formatAvgWait, formatClock, guestUrlFor, isLiveAiAvailable, ordinal, positionMessage } from '../../src/lib/format';

describe('format helpers', () => {
  it('formats sim clock as m:ss', () => {
    expect(formatClock(200)).toBe('3:20');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });
  it('formats avg wait', () => {
    expect(formatAvgWait(null)).toBe('-');
    expect(formatAvgWait(41.6)).toBe('42 s');
    expect(formatAvgWait(65)).toBe('1 min 5 s');
  });
  it('builds ordinals and positions', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '111th']);
    expect(positionMessage(3)).toBe('You are 3rd in line');
    expect(positionMessage(0)).toBe('Your order is being made now');
  });
  it('computes guest URL and detects localhost', () => {
    expect(guestUrlFor(null, 'http://localhost:4401')).toEqual({ url: 'http://localhost:4401/join', isLocal: true });
    expect(guestUrlFor('https://demo.example.com/', 'http://localhost:4401')).toEqual({ url: 'https://demo.example.com/join', isLocal: false });
    expect(guestUrlFor(null, 'http://127.0.0.1:5173').isLocal).toBe(true);
    expect(guestUrlFor(null, 'http://[::1]:5173').isLocal).toBe(true);
    expect(guestUrlFor(null, 'http://192.168.1.20:5173').isLocal).toBe(false);
  });
  it('maps API states to badge text', () => {
    expect(apiStateLabel('not_configured')).toBe('Not configured');
    expect(apiStateLabel('live')).toBe('Live');
    expect(apiStateLabel('unavailable')).toBe('Unavailable');
    const e = (state: 'ready' | 'not_configured') => ({ state, model: 'm', message: '', updatedAt: 0 });
    expect(isLiveAiAvailable({ vision: e('not_configured'), decisions: e('not_configured'), image: e('not_configured') })).toBe(false);
    expect(isLiveAiAvailable({ vision: e('ready'), decisions: e('not_configured'), image: e('not_configured') })).toBe(true);
  });
  it('checks upload type and size', () => {
    expect(checkImageFile({ type: 'image/gif', size: 10 })).toMatch(/PNG, JPEG or WebP/);
    expect(checkImageFile({ type: 'image/png', size: 9 * 1024 * 1024 })).toMatch(/under 8 MB/);
    expect(checkImageFile({ type: 'image/webp', size: 1000 })).toBeNull();
  });
});
