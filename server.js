const newrelic = require('newrelic');
const express = require('express');
const axios = require('axios').default;
const Base64 = require('js-base64');
const httpContext = require('express-http-context');
const { Pool } = require('pg');
const cors = require('cors')
const { ClientCredentials, AuthorizationCode } = require('simple-oauth2');
const moment = require('moment');
const geoip = require('geoip-country');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json({ limit: "8MB" }));
app.use(cors())
app.use(httpContext.middleware);


app.enable('trust proxy')

app.use((req, res, next) => {
  console.log(`req.ip ${req.ip}`);
  req.ips.forEach((ip, idx) => console.log(`req.ips ${idx} ${ip}`));
  var geo = { country: "local" }
  if (!(req.ip === "::1" || req.ip === "::ffff:127.0.0.1")) {
    var geo = geoip.lookup(req.ip);
  }

  console.log(geo);
  httpContext.set('country', geo.country);

  // Task 1

  //We should serve at least below markets ['GB','HK','IE','US']

  let markets = ['local', 'GB', 'IE','HK','US','NL']

  let requestCountry = httpContext.get('country');
  if (markets.indexOf(requestCountry) >= 0) {
    next();
  } else {
    res.status(404).send({ serviceStatus: `NO Service availbale at ${requestCountry}` });
  }
})

config = {
  client: {
    id: 'jQpou66pDzZWNmi7pYfYIvbSLPyZMw7o',
    secret: 'LUCN7dLo7yhwoHqy-CBpS-PbfVH30CSafcfHBkTPh2vNviFErSZg3LjmnILlwbO9'
  },
  auth: {
    tokenHost: 'https://orientalpearl.eu.auth0.com',
    tokenPath: '/oauth/token',
    authorizeHost: 'https://orientalpearl.eu.auth0.com',
    authorizePath: '/authorize'
  }
};

const booksAPIPrefix = "books";

const customersAPIPrefix = "customers";

const fileAPIPrefix = "files";

const loginAPIPrefix = "login";

const callbackAPIPrefix = "callback";

const scope = "openid profile email"//'https://www.googleapis.com/auth/userinfo.email';

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
  let bearerToken = null;
  try {
    bearerToken = req.headers.authorization.split(' ')[1]
  } catch (e) {
    console.log(e)
    res.status(400).send({ msg: 'error' });
  }
  console.log(bearerToken);
  let payload = jwt.decode(bearerToken);
  console.log(payload)
  let now = moment();
  let exp = moment.unix(payload.exp);
  console.log(`payload.expire at ${exp.utc()}`)
  if (now.isAfter(exp)) {
    console.log("token expired");
    res.status(400).send({ msg: 'expired' });
  } else {
    let queryTitle = req.query.title || "%";
    queryTitle = queryTitle !== "%" ? "%" + queryTitle + "%" : "%";
    console.log(`queryTitle ${queryTitle}`);
    const result = await pool.query('SELECT id, title from books where title like $1', [queryTitle])
    if (result.rows.length > 0) {
      result.rows.forEach(row => console.debug(row.id, row.title))
      res.send([...result.rows, new Date()]);
    } else {
      res.send([...[], new Date()]);
    }
  }

})



app.get(`/${booksAPIPrefix}`, async (req, res) => {

  // Task 2
  let exchangeRate = 1.0;

  let currency = 'GBP'
  if (httpContext.get('country') === 'GB') {
    currency = 'GBP';
  } else if (httpContext.get('country') === 'IE') {
    currency = 'EUR';
  } else if (httpContext.get('country') === 'NL') {
    currency = 'EUR';
  } else {
    currency = 'USD';
  }
  try {
    // let res = await axios.get(`https://api.apilayer.com/exchangerates_data/convert?to=${currency}&from=GBP&amount=10`,
    //   { headers: { apikey: process.env.FIXER_API_KEY } });
    // exchangeRate = res.data.info.rate;
    // // or use this free API
    let res = await axios.get(`https://api.exchangerate.host/latest?base=GBP&symbols=${currency}`);
    //exchangeRate = Object.values(res.data.rate)[0];
    exchangeRate = res.data.rates[currency];
    console.log(`Currency ${currency} with exchangeRate ${exchangeRate}`);
  } catch (e) {
    console.log(e);
  }

  let queryTitle = req.query.title || "%";
  queryTitle = queryTitle !== "%" ? "%" + queryTitle + "%" : "%";
  console.log(`queryTitle ${queryTitle}`);
  const result = await pool.query('SELECT id, title, price from books where title like $1', [queryTitle])
  if (result.rows.length > 0) {
    let booksWithLocalPrice = result.rows.map((book) => { return { id: book.id, title: book.title, price: book.price * exchangeRate } })
    booksWithLocalPrice.forEach(row => console.debug(row.id, row.title))
    res.send([...booksWithLocalPrice, new Date()]);
  } else {
    res.send([...[], new Date()]);
  }
}
)

app.get(`/${customersAPIPrefix}`, async (req, res) => {
  let queryName = req.query.name || "%";
  queryName = queryName !== "%" ? "%" + queryName + "%" : "%";
  console.log(`queryName ${queryName}`);
  const result = await pool.query('SELECT * FROM customers WHERE name LIKE $1', [queryName])
  if (result.rows.length > 0) {
    result.rows.forEach(row => console.debug(row.id, row.title))
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
    const resultRead = await pool.query("SELECT * FROM books WHERE title like $1", [newTitle]);
    console.log(resultRead.rows)
    if (resultRead.rows > 0) {
      console.log(`repeated entry submitted ${newTitle}`)
      return res.status(400).send(
        //{err: 'Cannot insert data'}
        "repeated"
      );
    }
    const result = await pool.query("INSERT INTO books (title) values ($1) returning id", [newTitle]);
    return res.status(200).send({ id: result.rows[0].id })
  } catch (err) {
    return res.status(400).send({ err: 'Cannot insert data' });
  }
}
)

app.all("/", (req, res) => {
  res.send({ contactUs: 'email to info@orientalpearlbooks.com' })
})

app.get(`/${fileAPIPrefix}/:id`, async (req, res) => {
  let id = req.params.id
  const result = await pool.query('SELECT name, mime, content from files where id = $1', [id])
  // console.log(Base64.isValid(pdfBase64Txt));
  // let pdfBuffer = Buffer.from(Base64.toUint8Array(pdfBase64Txt))
  if (result.rows.length > 0) {
    let pdfBuffer = result.rows[0].content
    console.log(pdfBuffer.length)
    res.status(200)
    res.setHeader('Content-Type', result.rows[0].mime)
    res.send(pdfBuffer)
  } else {
    console.log("file not found");
    res.status(404)
    res.send({error: "file not found"})
  }
})

app.post(`/${fileAPIPrefix}`, async (req, res) => {
  let fileName = req.body.name;
  let mime = req.body.mime;
  let pdfBase64Txt = req.body.content;

  try {
    let result = await pool.query("INSERT INTO files (name, mime, content) values ($1, $2, $3) returning id"
      , [fileName, mime, Buffer.from(Base64.toUint8Array(pdfBase64Txt))]);
    res.status(200).send({ id: result.rows[0].id })
  } catch (e) {
    console.log(e);
  }
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
