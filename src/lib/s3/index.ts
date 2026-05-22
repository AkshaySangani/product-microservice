import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_S3_BUCKET_NAME, AWS_SECRET_ACCESS_KEY } from '../../config';

// Initialize the S3 client using credentials and region from environment variables
export const s3 = new S3Client({
  region: AWS_REGION!, // Example: 'us-east-1'
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID!,
    secretAccessKey: AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = AWS_S3_BUCKET_NAME!; // S3 bucket name


export const uploadToS3 = async (
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folderPath = "" // e.g. 'profile_images/'
) => {
  const fileExt = originalName.split(".").pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const key = folderPath ? `${folderPath}${fileName}` : fileName;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    // ACL: "public-read", // make the file publicly accessible
  });

  await s3.send(command);

  const url = `https://${BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;

  return {
    bucket: BUCKET,
    filePath: key, // includes the folder if provided
    url,
  };
};


export const deleteFromS3 = async (filePath: string) => {
  // Create and send the delete command
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: filePath,
  });

  await s3.send(command); // Perform the deletion
};
