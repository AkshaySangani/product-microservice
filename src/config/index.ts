require('dotenv').config();

export const PORT = process.env.PORT || 5001;
export const DB_URL = process.env.DB_URL || '';
export const ENCRYPT_DECRYPT_KEY = process.env.ENCRYPT_DECRYPT_KEY || '';