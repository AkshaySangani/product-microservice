import mongoose from "mongoose";
import axios from "axios";
import sharp from "sharp";
import path from "path";
import { randomUUID } from "crypto";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { ProductModel } from "../../database/model";

const MAX_SIZE = 1024 * 1024; // 1MB

// -----------------------------
// Mongo Connection
// -----------------------------

mongoose.connect(process.env.DB_URL!);

// -----------------------------
// AWS S3
// -----------------------------

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// -----------------------------
// Upload Optimized Image
// -----------------------------

const optimizeAndUploadImage = async (
  imageUrl: string,
  path: string
) => {
  try {
    console.log("Processing:", imageUrl);

    // Download image
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
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
        .webp({ quality })
        .toBuffer();

      quality -= 10;
    } while (
      compressedBuffer.length > MAX_SIZE &&
      quality >= 20
    );

    // File name
    const fileName = `${randomUUID()}.webp`;

    const key = path + fileName;

    // Upload to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: key,
        Body: compressedBuffer,
        ContentType: "image/webp",
      }),
    );

    // S3 URL
    const compressedUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return {
      original: imageUrl,
      compressed: compressedUrl,
    };
  } catch (error) {
    console.error(
      "Image optimization failed:",
      imageUrl,
      error,
    );

    return {
      original: imageUrl,
      compressed: imageUrl,
    };
  }
};

// -----------------------------
// Migration Script
// -----------------------------

export const migrateProducts = async () => {
  try {
    const products = await ProductModel.find({
      media: { $exists: true, $ne: [] },
    }).lean();

    console.log(
      `Found ${products.length} products to migrate`,
    );

    for (const product of products) {
      try {
        console.log(
          `Migrating Product: ${product._id}`,
        );

        const originalMedia: string[] = product.media || [];

        const optimizedMedia = [];

        for (const imageUrl of originalMedia) {
                  const path = `vendor/${product.vendorId}/products/`;

          const image =
            await optimizeAndUploadImage(imageUrl, path);

          optimizedMedia.push(image.compressed);
        }

        await ProductModel.updateOne(
          { _id: product._id },
          {
            $set: {
              media: optimizedMedia,
              originalMedia: originalMedia,
            },
          },
        );

        console.log(
          `Migration completed: ${product._id}`,
        );
      } catch (error) {
        console.error(
          `Migration failed for product ${product._id}`,
          error,
        );
      }
    }

    console.log("Migration completed successfully");

    process.exit(0);
  } catch (error) {
    console.error("Migration failed", error);
    process.exit(1);
  }
};

// migrateProducts();