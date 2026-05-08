import app from '../app';

const { address } = await app.listen(3000);
console.log(`Server running at http://localhost:${address.port}`);
