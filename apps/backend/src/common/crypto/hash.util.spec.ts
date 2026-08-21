import { constantTimeHexEqual, hmacSha256, randomOpaqueToken, sha256 } from './hash.util';

describe('hash utilities', () => {
  it('creates high-entropy URL-safe opaque tokens', () => {
    const a = randomOpaqueToken();
    const b = randomOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes deterministically', () => {
    expect(sha256('furlife')).toEqual(sha256('furlife'));
    expect(sha256('furlife')).not.toEqual(sha256('Furlife'));
  });

  it('compares HMAC hashes in constant time', () => {
    const expected = hmacSha256('x'.repeat(32), '+221771234567:123456');
    expect(constantTimeHexEqual(expected, expected)).toBe(true);
    expect(constantTimeHexEqual(expected, hmacSha256('x'.repeat(32), '+221771234567:654321'))).toBe(false);
  });
});
