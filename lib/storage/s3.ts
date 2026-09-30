import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Собственное S3-хранилище записей. Ссылки провайдера живут, пока живёт
 * аккаунт у провайдера, поэтому записи переносим к себе.
 */
type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function readConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION || 'ru-1',
  };
}

let cached: { client: S3Client; bucket: string } | null = null;

function storage() {
  if (cached) return cached;
  const config = readConfig();
  if (!config) return null;
  cached = {
    bucket: config.bucket,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      // Российские S3 (Timeweb и др.) адресуют бакет путём, а не поддоменом
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
  return cached;
}

export function isStorageConfigured(): boolean {
  return readConfig() !== null;
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const s3 = storage();
  if (!s3) throw new Error('S3 не настроено: задайте S3_* в переменных окружения');
  await s3.client.send(
    new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/** Временная ссылка на файл: бакет закрыт, наружу отдаём только её. */
export async function signedUrl(key: string, expiresInSeconds = 600): Promise<string> {
  const s3 = storage();
  if (!s3) throw new Error('S3 не настроено: задайте S3_* в переменных окружения');
  return getSignedUrl(s3.client, new GetObjectCommand({ Bucket: s3.bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
