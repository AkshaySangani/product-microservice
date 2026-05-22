// utils/imageOptimizer.ts

import axios from "axios";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_S3_BUCKET_NAME, AWS_SECRET_ACCESS_KEY } from '../config';
import { s3 } from "./s3";
const BUCKET = AWS_S3_BUCKET_NAME!; // S3 bucket name

type OptimizeImageResponse = {
  original: string;
  compressed: string;
};

const MAX_SIZE = 1024 * 1024; // 1MB

export const optimizeAndUploadImage = async (
  imageUrl: string,
  path: string,
): Promise<OptimizeImageResponse> => {
  try {
    // Download original image
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    const originalBuffer = Buffer.from(response.data);

    // Compress image
    let quality = 80;
    let compressedBuffer: Buffer;

    do {
      compressedBuffer = await sharp(originalBuffer)
        .resize(1200, 1200, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality,
        })
        .toBuffer();

      quality -= 10;
    } while (
      compressedBuffer.length > MAX_SIZE &&
      quality >= 20
    );

    // Generate file name
    const fileName = `${randomUUID()}.webp`;

    const key = path + fileName;

    // Upload compressed image to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        Body: compressedBuffer,
        ContentType: "image/webp",
      }),
    );

    // Generate S3 URL
    const compressedUrl = `https://${BUCKET}.s3.${AWS_REGION}.amazonaws.com/{key}`;

    return {
      original: imageUrl,
      compressed: compressedUrl,
    };
  } catch (error) {
    console.error(
      "Image optimization failed:",
      error,
    );

    return {
      original: imageUrl,
      compressed: imageUrl,
    };
  }
};