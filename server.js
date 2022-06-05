const express = require('express');
const { Client } = require('pg');

const app = express();

app.get('/', async (req, res) => {
            //process.env.DATABASE_URL
  console.log(process.env.DATABASE_URL);
  const result = await client.query('SELECT id, title from books')
  console.log(result.rows[0].id, result.rows[0].title) // Hello world!
  res.send([...result.rows, new Date()]);
}

)

const client = new Client({
  connectingString: process.env.DATABASE_URL,
  user: 'vcjvmhpkssbzgq',
  password: 'b48f2b8fce5d13a7317294ded057198963e10e5f8f9ceb4d4d71950a3b049134', 
  host: 'ec2-52-18-116-67.eu-west-1.compute.amazonaws.com',
  database: 'd1is0h53ukd189',
  ssl: {
    rejectUnauthorized: false
  }
})

let port = process.env.PORT || 3000;

app.listen(port, async () => {

  console.log(`Express server started and listening at ${port}`);
  await client.connect();
}
)

process.on('SIGINT', () => {
  console.log('exiting');
  process.exit();
}
)
