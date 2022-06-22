const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const booksAPIPrefix = "books";

const customersAPIPrefix = "customers";

app.get(`/${booksAPIPrefix}`, async (req, res) => {
  let queryTitle = req.query.title || "%";
  queryTitle = queryTitle !== "%" ? "%" + queryTitle + "%" : "%";
  console.log(`queryTitle ${queryTitle}`);
  const result = await pool.query('SELECT id, title from books where title like $1',[queryTitle])
  if (result.rows.length > 0) { 
    result.rows.forEach( row => console.debug(row.id, row.title))
    res.send([...result.rows, new Date()]);
  } else {
    res.send([...[], new Date()]);
  }
}
)

app.get(`/${customersAPIPrefix}`, async (req, res) => {
  let queryName = req.query.name || "%";
  queryName = queryName !== "%" ? "%" + queryName + "%" : "%";
  console.log(`queryName ${queryName}`);
  const result = await pool.query('SELECT * FROM customers WHERE name LIKE $1',[queryName])
  if (result.rows.length > 0) {
    result.rows.forEach( row => console.debug(row.id, row.title))
    res.send([...result.rows, new Date()]);
  } else {
    res.send([...[], new Date()]);
  }
}
)

app.post(`/${booksAPIPrefix}`, async (req, res) => {
  let newTitle = req.body.title;
  console.log(`submitted ${newTitle}`)

  try {
    const resultRead = await pool.query("SELECT * FROM books WHERE title like $1",[newTitle]);
    console.log(resultRead.rows)
    if (resultRead.rows > 0) {
      console.log(`repeated entry submitted ${newTitle}`)
      return res.status(400).send(
        //{err: 'Cannot insert data'}
        "repeated"
        );
    }
    const result = await pool.query("INSERT INTO books (title) values ($1) returning id",[newTitle]);
    return res.status(200).send({id: result.rows[0].id})
  } catch (err) {
    return res.status(400).send({err: 'Cannot insert data'});
  }
}
)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

let port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`Express server started and listening at ${port}`);
  await pool.connect();
}
)

process.on('SIGINT', () => {
  console.log('exiting');
  process.exit();
}
)
