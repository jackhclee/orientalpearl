const express = require('express');
const { Client } = require('pg');

const app = express();

app.get('/', async (req, res) => {
  console.log(process.env.DATABASE_URL);
  await client.connect();
  const result = await client.query('SELECT id, title from books')
  console.log(result.rows[0].id, result.rows[0].title) // Hello world!
  res.send('Hello World');
}

)

const client = new Client({
  host: 'ec2-52-18-116-67.eu-west-1.compute.amazonaws.com',
  port: 5432,
  user: 'vcjvmhpkssbzgq',
  password: 'b48f2b8fce5d13a7317294ded057198963e10e5f8f9ceb4d4d71950a3b049134',
  database: 'd1is0h53ukd189'
})

app.listen(process.env.PORT || 3000, () => {

console.log('Started');

}
)

