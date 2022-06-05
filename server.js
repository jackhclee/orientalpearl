const express = require('express');
const { Client } = require('pg');

const app = express();

app.get('/', async (req, res) => {
            //process.env.DATABASE_URL
  console.log(process.env.DATABASE_URL);
  await client.connect();
  const result = await client.query('SELECT id, title from books')
  console.log(result.rows[0].id, result.rows[0].title) // Hello world!
  res.send('Hello World');
}

)

const client = new Client({
  connectingString: process.env.DATABASE_URL,
  ssl: true,
})

app.listen(process.env.PORT || 3000, () => {

console.log('Started');

}
)

