import mongoose from 'mongoose';
import express from 'express'
import { DB_URL } from '../../config';

const dbUrl: string = DB_URL;

const mongooseConnection = express()

mongoose.set('strictQuery', true);
mongoose.connect(
    dbUrl
).then(() => console.log('Product Database successfully connected.')).catch(err => console.log("Product Database Connection Error==>", err));

export { mongooseConnection }