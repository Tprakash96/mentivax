import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Thin wrapper over S3 for student document storage. Configured entirely from
 * the environment; when the required vars are absent the service reports itself
 * as unconfigured and every operation fails with a clear message (so the app
 * still boots without S3). Set:
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET
 * The shorter AWS_ACCESS_KEY / AWS_SECRET_KEY spellings are accepted too, since
 * that is what the AWS console offers when you download a key pair.
 * Optional for S3-compatible stores (MinIO / Spaces / R2):
 *   S3_ENDPOINT, S3_FORCE_PATH_STYLE=true
 */
@Injectable()
export class S3Service {
  private readonly log = new Logger(S3Service.name);
  private readonly client: S3Client | null;
  private readonly bucket = process.env.S3_BUCKET ?? '';

  constructor() {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_KEY;
    // Credentials without a bucket is the easy mistake to make; say so rather
    // than silently reporting "storage not configured" on the first upload.
    if (region && accessKeyId && secretAccessKey && !this.bucket) {
      this.log.warn('AWS credentials are set but S3_BUCKET is missing — document storage stays off.');
    }
    if (region && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        ...(process.env.S3_ENDPOINT
          ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' }
          : {}),
      });
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private need(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'File storage is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY), AWS_SECRET_ACCESS_KEY (or AWS_SECRET_KEY) and S3_BUCKET.',
      );
    }
    return this.client;
  }

  /** A short-lived URL the browser PUTs the file straight to. */
  presignUpload(key: string, contentType: string, expiresIn = 900): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });
    return getSignedUrl(this.need(), cmd, { expiresIn });
  }

  /** A short-lived URL to view/download the object. */
  presignDownload(key: string, fileName?: string, expiresIn = 900): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(fileName ? { ResponseContentDisposition: `inline; filename="${fileName.replace(/"/g, '')}"` } : {}),
    });
    return getSignedUrl(this.need(), cmd, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    await this.need().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
