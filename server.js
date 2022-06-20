const express = require('express');
const { Client } = require('pg');

const app = express();
app.use(express.json());

const booksAPIPrefix = "books";

app.get(`/${booksAPIPrefix}`, async (req, res) => {
  let queryTitle = "%" || req.query.title;
  const result = await client.query('SELECT id, title from books where title like $1',[queryTitle])
  console.log(result.rows[0].id, result.rows[0].title) // Hello world!
  res.send([...result.rows, new Date()]);
}
)

app.post(`/${booksAPIPrefix}`, async (req, res) => {
  let newTitle = req.body.title;
  try {
    const result = await client.query("INSERT INTO books (title) values ($1) returning id",[newTitle]);
    return res.status(200).send({id: result.rows[0].id})
  } catch (err) {
    return res.status(400).send({err: 'Cannot insert data'});
  }
}
)

const client = new Client({
  connectionString: process.env.DATABASE_URL,
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
