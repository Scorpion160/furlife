import { presignS3Request } from './s3-presigner';

describe('presignS3Request', () => {
  const base = {
    endpoint: 'http://127.0.0.1:59000',
    region: 'us-east-1',
    bucket: 'furlife-dev',
    accessKey: 'access-key',
    secretKey: 'secret-key',
    method: 'PUT' as const,
    objectKey: 'shipments/shipment-1/declaration/photo 1.jpg',
    expiresInSeconds: 300,
    now: new Date('2026-10-29T10:00:00.000Z'),
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': '1234',
    },
  };

  it('creates a deterministic private S3 URL without exposing the secret key', () => {
    const first = presignS3Request(base);
    const second = presignS3Request(base);

    expect(first).toEqual(second);
    expect(first.url).toContain('http://127.0.0.1:59000/furlife-dev/');
    expect(first.url).toContain('photo%201.jpg');
    expect(first.url).toContain('X-Amz-Expires=300');
    expect(first.url).toContain(
      'X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost',
    );
    expect(first.url).not.toContain(base.secretKey);
    expect(first.headers).toEqual({
      'content-type': 'image/jpeg',
      'content-length': '1234',
    });
    expect(first.expiresAt).toBe('2026-10-29T10:05:00.000Z');
  });

  it('changes the signature when the object key changes', () => {
    const first = presignS3Request(base);
    const second = presignS3Request({
      ...base,
      objectKey: 'shipments/shipment-1/declaration/other.jpg',
    });

    expect(second.url).not.toBe(first.url);
  });

  it('rejects excessive expiry durations', () => {
    expect(() =>
      presignS3Request({
        ...base,
        expiresInSeconds: 3601,
      }),
    ).toThrow(RangeError);
  });
});
