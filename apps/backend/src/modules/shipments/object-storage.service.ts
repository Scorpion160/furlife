import {
  BadGatewayException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { presignS3Request } from '../../common/storage/s3-presigner';
import type { Env } from '../../config/env.schema';

export interface StoredObjectInspection {
  sizeBytes: number;
  sha256: string;
  detectedContentType: string | null;
}

interface UploadIntentInput {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}

@Injectable()
export class ObjectStorageService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  createUploadIntent(input: UploadIntentInput) {
    const signed = this.sign('PUT', input.objectKey, 300, {
      'content-type': input.contentType,
      'content-length': input.sizeBytes.toString(),
    });

    return {
      uploadUrl: signed.url,
      requiredHeaders: signed.headers,
      expiresAt: signed.expiresAt,
    };
  }

  createDownloadUrl(objectKey: string) {
    const signed = this.sign('GET', objectKey, 120);

    return {
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  async inspectImageObject(
    objectKey: string,
    maxBytes: number,
  ): Promise<StoredObjectInspection> {
    const signed = this.sign('GET', objectKey, 60);

    let response: Response;
    try {
      response = await fetch(signed.url, {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw this.storageUnavailable();
    }

    if (!response.ok || !response.body) {
      throw this.storageUnavailable();
    }

    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let total = 0;
    let prefix = Buffer.alloc(0);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeException({
          code: 'MEDIA_OBJECT_TOO_LARGE',
          message: 'Le fichier téléversé dépasse la taille autorisée.',
        });
      }

      const chunk = Buffer.from(value);
      hash.update(chunk);

      if (prefix.length < 12) {
        prefix = Buffer.concat([prefix, chunk]).subarray(0, 12);
      }
    }

    return {
      sizeBytes: total,
      sha256: hash.digest('hex'),
      detectedContentType: this.detectImageContentType(prefix),
    };
  }

  async deleteObjectBestEffort(objectKey: string): Promise<void> {
    try {
      const signed = this.sign('DELETE', objectKey, 60);
      await fetch(signed.url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Orphan cleanup is best-effort. Authentication/business state must win.
    }
  }

  private sign(
    method: 'DELETE' | 'GET' | 'PUT',
    objectKey: string,
    expiresInSeconds: number,
    headers?: Record<string, string>,
  ) {
    return presignS3Request({
      endpoint: this.config.get('S3_ENDPOINT', { infer: true }),
      region: this.config.get('S3_REGION', { infer: true }),
      bucket: this.config.get('S3_BUCKET', { infer: true }),
      accessKey: this.config.get('S3_ACCESS_KEY', { infer: true }),
      secretKey: this.config.get('S3_SECRET_KEY', { infer: true }),
      method,
      objectKey,
      expiresInSeconds,
      headers,
    });
  }

  private detectImageContentType(prefix: Buffer): string | null {
    if (
      prefix.length >= 3 &&
      prefix[0] === 0xff &&
      prefix[1] === 0xd8 &&
      prefix[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    if (
      prefix.length >= 8 &&
      prefix.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    ) {
      return 'image/png';
    }

    if (
      prefix.length >= 12 &&
      prefix.subarray(0, 4).toString('ascii') === 'RIFF' &&
      prefix.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
  }

  private storageUnavailable(): BadGatewayException {
    return new BadGatewayException({
      code: 'OBJECT_STORAGE_UNAVAILABLE',
      message: 'Le stockage privé est temporairement indisponible.',
    });
  }
}
