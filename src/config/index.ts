require('dotenv').config();

export const PORT = process.env.PORT || 5001;
export const DB_URL = process.env.DB_URL || '';
export const ENCRYPT_DECRYPT_KEY = process.env.ENCRYPT_DECRYPT_KEY || '';
export const BACKEND_URL = process.env.BACKEND_URL || '';
export const SECRET_KEY = process.env.encrypt_decrypt_key || '';
export const AWS_REGION = process.env.AWS_REGION || "";
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "";
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";
export const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";
export const FRONTEND_URL = process.env.FRONTEND_URL || "";
export const SHOPIFY_URL = process.env.SHOPIFY_URL || "";
export const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "";
export const WORDPRESS_URL = process.env.WORDPRESS_URL || "";