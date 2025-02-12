import express from 'express';
import { router } from './routes';
const cors = require('cors')

require('dotenv').config();

const app = express();

app.use(cors())
app.use(express.json()); // Add this line to parse JSON bodies

app.use(router);

export default app;