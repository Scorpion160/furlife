import { createHash, createHmac } from 'node:crypto';

export type PresignedS3Method = 'DELETE' | 'GET' | 'HEAD' | 'PUT';

export interface PresignS3RequestInput {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  method: PresignedS3Method;
  objectKey: string;
  expiresInSeconds: number;
  now?: Date;
  headers?: Record<string, string>;
}

export interface PresignedS3Request {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split('/').map(awsEncode).join('/');
}

function canonicalQuery(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function presignS3Request(
  input: PresignS3RequestInput,
): PresignedS3Request {
  if (input.expiresInSeconds < 1 || input.expiresInSeconds > 3600) {
    throw new RangeError('S3 presigned URL expiry must be between 1 and 3600 seconds');
  }

  const endpoint = new URL(input.endpoint);
  if (endpoint.search || endpoint.hash) {
    throw new Error('S3 endpoint must not contain a query string or fragment');
  }

  const now = input.now ?? new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;

  const endpointPrefix =
    endpoint.pathname === '/'
      ? ''
      : endpoint.pathname.replace(/\/+$/, '');
  const canonicalUri =
    `${endpointPrefix}/${awsEncode(input.bucket)}/${encodeObjectKey(input.objectKey)}`;

  const normalizedHeaders: Record<string, string> = {
    host: endpoint.host,
  };

  for (const [name, value] of Object.entries(input.headers ?? {})) {
    normalizedHeaders[name.toLowerCase()] = normalizeHeaderValue(value);
  }

  const signedHeaderNames = Object.keys(normalizedHeaders).sort();
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${normalizedHeaders[name]}\n`)
    .join('');

  const query = canonicalQuery({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': input.expiresInSeconds.toString(),
    'X-Amz-SignedHeaders': signedHeaders,
  });

  const canonicalRequest = [
    input.method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const dateKey = hmac(`AWS4${input.secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, input.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign)
    .digest('hex');

  const url =
    `${endpoint.origin}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;

  const responseHeaders = Object.fromEntries(
    Object.entries(normalizedHeaders).filter(([name]) => name !== 'host'),
  );

  return {
    url,
    headers: responseHeaders,
    expiresAt: new Date(
      now.getTime() + input.expiresInSeconds * 1000,
    ).toISOString(),
  };
}
