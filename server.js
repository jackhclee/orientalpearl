const express = require('express');
const { Pool } = require('pg');
const cors = require('cors')
const { ClientCredentials, AuthorizationCode } = require('simple-oauth2');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());
app.use(cors())

config = {
  client: {
    id: '689319227554-6gnh086rs70u52km7g5sevthbg7934at.apps.googleusercontent.com',
    secret: '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'
  },
  auth: {
    tokenHost: 'https://oauth2.googleapis.com',
    tokenPath: '/token',
    authorizeHost: 'https://accounts.google.com',
    authorizePath: '/o/oauth2/v2/auth'
  }
};

const booksAPIPrefix = "books";

const customersAPIPrefix = "customers";

const loginAPIPrefix = "login"

const callbackAPIPrefix = "callback"

const scope = 'https://www.googleapis.com/auth/userinfo.email';

const client = new AuthorizationCode(config);

app.get(`/${loginAPIPrefix}`, async (req, res) => {
    const authorizationUri = client.authorizeURL({
      redirect_uri: 'https://orientalpearl.herokuapp.com/callback',
      scope: scope,
      state: '<state>'
    });
  
    // Redirect example using Express (see http://expressjs.com/api.html#res.redirect)
    res.redirect(authorizationUri);
})

app.get(`/${callbackAPIPrefix}`, async (req, res) => {
  const tokenParams = {
    code: req.query.code,
    redirect_uri: 'https://orientalpearl.herokuapp.com/callback',
    scope: scope,
  };

  try {
    const accessToken = await client.getToken(tokenParams);
    res.send(accessToken);
  } catch (error) {
    console.log('Access Token Error', error.message);
  }
}
)

app.get(`/protected/${booksAPIPrefix}`, async (req, res) => {
  let bearerToken = req.headers.authorization.split(' ')[1]
  console.log(bearerToken);
  let payload = jwt.decode(bearerToken);
  if ( moment().unix() > payload.exp) {
    res.status(400).send({msg: 'expired'});
  } else {
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

})


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

app.get("/", (req, res) => {
  res.status(200).send({});
})

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
