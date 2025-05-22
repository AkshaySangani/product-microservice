import app from './app';
import { PORT } from './config';
import { mongooseConnection } from './database/connection';

app.use(mongooseConnection);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get('/', (req, res) => {
    res.send('Hello, Welcome to Product-Microservice!');
});