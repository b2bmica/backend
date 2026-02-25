import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from 'fs';
import path from 'path';
import logger from './logger.js';

const s3Client = process.env.AWS_ACCESS_KEY_ID ? new S3Client({
  region: process.env.AWS_REGION as string,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
}) : null;

export const uploadFile = async (file: any, key: string) => {
  if (s3Client) {
    try {
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });
      await s3Client.send(command);
      return `s3://${process.env.AWS_S3_BUCKET}/${key}`;
    } catch (error) {
      logger.error('S3 upload failed, falling back to local', error);
    }
  }

  // Local fallback
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  
  const localPath = path.join(uploadDir, key.replace(/\//g, '_'));
  fs.writeFileSync(localPath, file.buffer);
  return `/uploads/${path.basename(localPath)}`;
};

export const getFileUrl = async (keyOrPath: string) => {
  if (keyOrPath.startsWith('s3://') && s3Client) {
    const key = keyOrPath.replace(`s3://${process.env.AWS_S3_BUCKET}/`, '');
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }
  return keyOrPath; // Return local path as is
};
export const isS3Configured = () => s3Client !== null;

export const generateUploadPresignedUrl = async (fileName: string, contentType: string) => {
  if (!s3Client) throw new Error('S3 Client not initialized');

  const key = `uploads/${Date.now()}-${fileName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  return { url, key };
};
