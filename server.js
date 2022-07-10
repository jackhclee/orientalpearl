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
app.use(express.json({limit: "4096kb"}));
app.use(cors())
app.use(httpContext.middleware);


app.enable('trust proxy')

app.use((req, res, next) => {
  console.log(`req.ip ${req.ip}`);
  req.ips.forEach((ip, idx) => console.log(`req.ips ${idx} ${ip}`));
  var geo = {country: "local" }
  if (!(req.ip === "::1" || req.ip === "::ffff:127.0.0.1")) {
    var geo = geoip.lookup(req.ip);
  }
  
  console.log(geo);
  httpContext.set('country', geo.country);
  
  // Task 1
  
  //We should serve at least below markets ['GB','HK','IE','US']
  
  let markets = ['local','GB','HK','IE','US']

  let requestCountry = httpContext.get('country');
  if (markets.indexOf(requestCountry) >=0) {
    next();
  } else {
    res.status(404).send({serviceStatus: `NO Service availbale at ${requestCountry}`});
  }
})

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

const fileAPIPrefix = "files";

const loginAPIPrefix = "login";

const callbackAPIPrefix = "callback";

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
  } else {
    currency = 'USD';
  }
  try {
    let res = await axios.get(`https://api.apilayer.com/exchangerates_data/convert?to=${currency}&from=GBP&amount=10`, 
    { headers: { apikey: process.env.FIXER_API_KEY}});
    exchangeRate = res.data.info.rate;
    // or use this free API
    // let res = await axios.get(`https://api.exchangerate.host/latest?base=GBP&symbols=${currency}`);
    // exchangeRate = Object.values(res.data.rate)[0];
    console.log(`Currency ${currency} with exchangeRate ${exchangeRate}`);
  } catch (e) {
    console.log(e);
  }

  let queryTitle = req.query.title || "%";
  queryTitle = queryTitle !== "%" ? "%" + queryTitle + "%" : "%";
  console.log(`queryTitle ${queryTitle}`);
  const result = await pool.query('SELECT id, title, price from books where title like $1', [queryTitle])
  if (result.rows.length > 0) {
    let booksWithLocalPrice = result.rows.map((book) => { return { id: book.id, title: book.title, price: book.price * exchangeRate}})
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
  res.send({contactUs: 'email to info@orientalpearlbooks.com'})
})


app.get(`/${fileAPIPrefix}/:id`, async (req, res) => {
  let id = req.params.id
  const result = await pool.query('SELECT name, mime, content from files where id = $1', [id])
  // console.log(Base64.isValid(pdfBase64Txt));
  // let pdfBuffer = Buffer.from(Base64.toUint8Array(pdfBase64Txt))
  let pdfBuffer = result.rows[0].content
  console.log(pdfBuffer.length)
  res.status(200)
  // res.set(
  // {
  //   'Content-Disposition' : "inline; filename=\"t1.pdf\"",
  // })
  res.setHeader('Content-Type','application/pdf')
  res.send(pdfBuffer)
  
})

// const pdfBase64Txt =
//   `JVBERi0xLjMKJcTl8uXrp/Og0MTGCjMgMCBvYmoKPDwgL0ZpbHRlciAvRmxhdGVEZWNvZGUgL0xl
//   bmd0aCAyMDUxID4+CnN0cmVhbQp4Aa1aW28jtxl9168g8rQBapof7wQcAY7rtotsN4mtFAi6QeCV
//   1F23spVYCtr+vfyynNEMNReOaI00L4Ysj3k5c/jxnEP+yr5nv7LLmw2x+YYJtpnjV8IHgZ9EXClv
//   mReeK6/Z/Il9PWOCCyGIzeaMZPmgZIY0N9KE4l8I/+Imsyd2OZuhDTb7F3vz3cOnJaNL+pLN/s1u
//   Z7tOj+xlUveCMVXNs3bzvz1vH7er5YJtl//bMnJ1N4JLw/5bTvDmfiLY/c1+gheNGSrBraXdFAVT
//   xINyhj0x4yRXUvr9VyvMWIbdnyeNP1dfsRW7x9wEN0f0ox1X2lkb20Z7+688hbLfFdP41HwMo9p/
//   1Xis6Ld+c1Zx6620zHl80qQmh99d8a5LOGX1tp6J/XP18HG5+uqqRhIckTuOAMQdTy7/CtJ82uR6
//   rRhTv0EXuHbC1T1OSn783uqn5iL6kO0+IiedstxKwqM7UgY0KVhgyvMggyyQFFKQrHioqpn1ErAG
//   y3puDAifBatqMoJ1tX34uFpOWxMogdoNCQsqB1TVY/V6aqAMOOSkbCBVzeBVpIBoe/U6Ybk2WJv9
//   SFnJSUinKg5EpGQxoUlnqdZIGYUX+QpQLVZN3lxtX6ZX2wWbr1ebXx6ev/pCfjGd/7bZrp+WL5ur
//   y+1iih8vRwA56eN5a0A1jtITdyZ4YNLm+A7Hcn6t6neYcdZZLgPI24+jc5y8UabDOFUTo2/Y4KsK
//   Klda8TITxu2AnD4uStSA3P3t3dvrd+y7u7d/v777kX1z++OfDiE62dX5I9Zwe2g1pEpb7nzxe2dc
//   r1ITFG5T06IpkqaY/gQ7S3cRB8mldcF1qKnzkErFFQk/qOJV3Jw+Pzwt96D+4/ru5m/Xdx/eKPHh
//   S/b+2xl7/8O7d01gJ3E32xfHY9Z8NcCKRw1gneG76Y4ALBkerEAd6gWWBPYeI2wHWJMHFioAW6E8
//   Cdjl08PjKkWW5LjQVkNMoQ0CRPMg2NmcNd5wF8whZKXkWinZQdZmkbVBcdLGnoTsw2LxstxUBRSl
//   YM/aHbZnszWOLYVUBWyWkC8jQGpAfIl1foCtynFDxncwbai8nspqnecCjZ6E6fxx+/+UrEUZOB/P
//   alwpngQJavwYZRVKnGurD3LUSI4tUXfw9HmOQicEL4YJyVhWf1lvtvP1oqe0khwD02psKabjcVQH
//   g90/qEMctQ6KG3K0VBlRRYU8plCpPjh3GkfXcD0vPTQtSmpj8z9pj7LVyFJEQS3sHnqEVa8tmtpJ
//   n2Lvr13lXgUorPqiK/KSO6u6MoBEHlwluSdDw8C9zKh5GJ+8mrdVlwlqxmHLsL6hQk/2PVpp7Oxo
//   qulRJjDjKWwB7NK2K+wp74EsYaxKmkGwTX+qX0WvFJr0+8TYWQIY4gStgyzyha5sb/L5GKOoheao
//   W6lXSQCThBIHkdBR8LSzQmVq0Tu5tkHdeyTIL1jvEHegWucVGrg7q30ucqQZUU5zq3xajtNZSWyE
//   RKZTmShvTIzHnmvdMLH3LM/MDWKvCR/Gyw2UBrWcirlBWXZ614/UiouguyWd8vajSIw0lt2g9ZPP
//   ECb5qhN7TEBLM4STq47CglTCxQwhh5rxnJztijXKewuDCqnFMLb15Qmf19vlqhkmNKvF0alMNZoE
//   UGkxcY8k5XzJK72G5EdAV0rezO6HaAYZZuiqNcpbCqMRXFLQA2k4MFg4Dd1qaAm8IwYLEnEQhFUM
//   FnLweiQwuuvXmhFyj7kw0nGp7JgZw8hOOI4wBRliKgitxuAwggzkQEUpfUXBKYG4UOpu3kB5y2Gw
//   H5PRAxVcmTJOX9brp9oUv32P8GasACeOK8V2PHFMiASQjhUF9zVsCaG1cAmD89ZDQxwKR8Nk3hF2
//   bgTvEYeWwgt5XUQr51dfgkjTnmLgkCkPSsGFeOTHbV8n894DbcMsQ0k2RXr7xCwVgfBsh08SXvUe
//   scsEtRG9BwEMRbadVvdqJ6U9okwcvXVgy3sPbS1qk01FbU47n+o9YmcJYCN6D0LdgwUtYtj2yWmi
//   0hUY6QzcagewE72HNsS9VDFZyOE3PLWHwg1QQbHx3OpB2OWV6zp3mfceGkd7TtOwun+294i9JnwY
//   z3tA+HhZJBpNOvSvH5T/IEXXu8u899CSighxqOg7XHVQavPeI/aYgDai94AKsMYUYWa9hnpB0yLg
//   aoIM3aKTtx4ax6PGmZO0XOss8+N6/Z/H509nu484oARTCc+PA8YxNsALpDxGBJeW2qQyQbcVpqer
//   3WTef6hAXAd1kqM7/mDzJP8Rh5bgO6L/uEB+ah2UTKIAUnyRUZNF7t+p/PnjDYXDaE1iaMxQ+rt4
//   6v5z4wS5UMh3t3+5vbt9f3N7z+Ijmw9vHhcjRPRxvAnoyEq40EU0evbJ3AWO4D1SBPTximbWRsNT
//   i0TV5f2IsrgPJU8qFNNdMJHBuwwuxgK7HGiKtRbc4VLMGFjjhB3F1qR7TUpwixtMCkF/h+B5g1Is
//   Ron3lCygnJaJBmX+eTlHLf558bCtz5z+fD27Hc8ExvElIKvxDPYFrtIhTBPHVBEsI03dIq3yNkXh
//   ohtZmTZ/DMbPj58+b/sd9rmnT3FcKbbjGewL1FzQ0qQeLSVwwK21gGthbQKrvJmBUcK+KYap2PM8
//   YOwywW1ED3hBocgb9hfvSvXfq8d2l0I9dUWsanianmxNCcFDcMOSiaYJrNuMdwUvcG0F1zttWkyS
//   d21wk9Na1dWQquFYvv8D+Mq8LQplbmRzdHJlYW0KZW5kb2JqCjEgMCBvYmoKPDwgL1R5cGUgL1Bh
//   Z2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDQgMCBSIC9Db250ZW50cyAzIDAgUiAvTWVkaWFC
//   b3ggWzAgMCA1OTUgODQyXQo+PgplbmRvYmoKNCAwIG9iago8PCAvUHJvY1NldCBbIC9QREYgL1Rl
//   eHQgXSAvQ29sb3JTcGFjZSA8PCAvQ3MxIDUgMCBSIC9DczIgOCAwIFIgPj4gL0V4dEdTdGF0ZQo8
//   PCAvR3MxIDEwIDAgUiAvR3MyIDExIDAgUiA+PiAvRm9udCA8PCAvVFQxIDYgMCBSIC9UVDIgNyAw
//   IFIgL1RUMyA5IDAgUiA+Pgo+PgplbmRvYmoKMTAgMCBvYmoKPDwgL1R5cGUgL0V4dEdTdGF0ZSAv
//   Y2EgMCA+PgplbmRvYmoKMTEgMCBvYmoKPDwgL1R5cGUgL0V4dEdTdGF0ZSAvY2EgMSA+PgplbmRv
//   YmoKMTIgMCBvYmoKPDwgL04gMSAvQWx0ZXJuYXRlIC9EZXZpY2VHcmF5IC9MZW5ndGggMzM4NSAv
//   RmlsdGVyIC9GbGF0ZURlY29kZSA+PgpzdHJlYW0KeAGlVwdcU1fbPzf3ZrDCnjLCRpYBZcuIzACy
//   h+AiJoGEEWIgCIiLUqxg3eLAUdGiqEWrFYE6UYtW6satL9RSQanFWlxYfZ+bgMLb/t7v+35f7u9w
//   /+c541n/89wDQtpbeFJpLgUhlCcplIUncNKmpaWz6PcRAxkiTeSKNHn8AiknLi4apiBJvkRIvsf+
//   Xt5EGCm57kLuNXbsf+xRBcICPsw6Ba1EUMDPQwibjBDDhC+VFSKkMg3k1vMKpSQuA6yXk5QQDHgV
//   zFEfXgtiZBEulAhlYj4rXMYrYYXz8vJ4LHdXd1acLD9TnPsPVpOL/j+/vFw5aTf5s4CmXpCTGAVv
//   V7C/QsALIbEv4EN8XmgiYG/A/UXilBjAQQhRbKSFUxIARwIWyHOSOYCdATdmysKSAQcAviuSR5B4
//   EkK4UakoKRWwCeDonPwocq0V4EzJnJhYwKAL/4JfEJwO2AFwm0jIJXNmA/iJLD+BnOOIEMEUCENC
//   AYMdhLe4kJs0jCsLihJJOdhJ3CgVBZN2gi6qejYvMg6wHWA7YW44qRf2oUZLC+PIPaFPLZLkxpC6
//   ggCfFxYo/IU+jVEoSooAuTvgpEJZErkW7KFVZorDuIDDAO8VySJIOfhLG5DmKngGMaG78mSh4SCH
//   mNCLZfIEMg7gI32XUJJMxhM4Qn+IUjAeEqJ8NAf+8pEEdSMWKkBiVKRAWYiH8qCxwAJnaOEwSwJN
//   BjMKUA7IswD3fBwn++QKco0LksJYPsqEubmwckTOQgLYQbmS3CUfGtkjd+5V7Mwf1ugKGoPNv0Zy
//   GBehfhgXAZqKuhSSYrAwD/rBIJXDWBbg0VrcgUnuKE5hrdIGcpzU0jesJR9WCBS6lOtIP5W2BYPN
//   ElQKY6RtCt8JQ4JNTITmR0QT/gRboU0GM0qQi0I+WSEb0frJc9K3vo9a54Kto70fHbGRKJ+GeBXC
//   zrngoWQ4PgVgzTuwO2d49adoKjSuMpE7SKU1K+K5s+rBXvC8XDZbzL+8cqC97JgRYt1cfuoCYu3X
//   ajmv8IeMDKuTaJ5xXb297L9k9VM2R2wbm9XY0bxRMEnwN96ALuo16hXqQ+oNxIL3L9ROai+ge9T7
//   8Nz5aM+nHJCcEoNcyQkl2/gYrphJspADkclVjOZBNMhMCRV5Cod1PIhvAURPDrwjc+0CDBidi7EM
//   IXcbPU4yQqk9C/ZV9j4xnq+QkAwh9ZNs+Xt8/i8nZNT5yJSsMpFKZ9WXDQmlyvyRuRMujXkZg8qd
//   2QfZ/exd7P3sF+yHiigo8se+xf6N3cneASNP8bX4Efw43oK34h2IBb1W/DTeokD78WPwfPtx3dgT
//   oYzx2BNB8pM/fAJI7wuHOTj6rIyuCmQ+yH3IbJDzR2KYPXyyR3OVjPhoDpGx/N9ZNDrWYyuIMvuK
//   U8q0Zrox6UxHpgeTw8SYlvC4M4MAWTOtmNFMQxiNYNozQ5jjPsZjJGO5ICEZRDLvExeVdS8NrBxh
//   GumfCLIvU1Q53rC//+kja4yXZAUUjz5nmAacZKUmZQ0Z0TkSV0WGx1TQZNAkRvPADhnElawOEqg9
//   rDFzyNpNVi1gPDZdkcN/4CjNl2ZPC6XZw1pltWLRQmgRtDDEormRctoEWiRgH3IWYU64EVyoerGI
//   RXAIDyJoGJOVcDI8ZB1UxsiFCITRACKE8CZr5GhvwRJlbMlq+c+ejj6FcNcoFBbDfQWh4HxpiUyc
//   JSpkceBmJGRxJXxXZ5Y72w2+iOQ9i5yD0It4xf0JM+jgy2VFShlBvqhIFe5gesgYmSNr+Kq7gK1e
//   yA++s6Fwb4hFSSgNzQLrRJBLGcS2DC1BlagarULr0Wa0He1CDagRHUJH0TF0Gv2ALqIrqBPdgy9Q
//   D3qKBtBLNIRhGB3TwHQxY8wCs8WcMHfMGwvAQrFoLAFLwzKwLEyCybEy7DOsGluDbcZ2YA3Yt1gL
//   dhq7gF3F7mDdWB/2B/aWglPUKXoUM4odZQLFm8KhRFGSKDMpWZS5lFJKBWUFZSOljrKf0kQ5TblI
//   6aR0UZ5SBnGEq+EGuCXugnvjwXgsno5n4jJ8IV6F1+B1eCNUgXb8Ot6F9+NvCBqhS7AIF8hNBJFM
//   8Im5xEJiObGZ2EM0EWeJ60Q3MUC8p2pQTalOVF8qlzqNmkWdR62k1lDrqUeo56Bq91Bf0mg0A+CF
//   F/AljZZNm09bTttKO0A7RbtKe0QbpNPpxnQnuj89ls6jF9Ir6Zvo++kn6dfoPfTXDDWGBcOdEcZI
//   Z0gY5Ywaxl7GCcY1xmPGkIqWiq2Kr0qsikClRGWlyi6VVpXLKj0qQ6raqvaq/qpJqtmqS1Q3qjaq
//   nlO9r/pCTU3NSs1HLV5NrLZYbaPaQbXzat1qb9R11B3Vg9VnqMvVV6jvVj+lfkf9hYaGhp1GkEa6
//   RqHGCo0GjTMaDzVeM3WZrkwuU8BcxKxlNjGvMZ9pqmjaanI0Z2mWatZoHta8rNmvpaJlpxWsxdNa
//   qFWr1aJ1S2tQW1fbTTtWO097ufZe7QvavTp0HTudUB2BToXOTp0zOo90cV1r3WBdvu5nurt0z+n2
//   6NH07PW4etl61Xrf6F3SG9DX0Z+kn6JfrF+rf1y/ywA3sDPgGuQarDQ4ZHDT4K2hmSHHUGi4zLDR
//   8JrhK6NxRkFGQqMqowNGnUZvjVnGocY5xquNjxo/MCFMHE3iTeaZbDM5Z9I/Tm+c3zj+uKpxh8bd
//   NaWYOpommM433WnaYTpoZm4WbiY122R2xqzf3MA8yDzbfJ35CfM+C12LAAuxxTqLkxZPWPosDiuX
//   tZF1ljVgaWoZYSm33GF5yXLIyt4q2arc6oDVA2tVa2/rTOt11m3WAzYWNlNtymz22dy1VbH1thXZ
//   brBtt31lZ2+XarfU7qhdr72RPde+1H6f/X0HDYdAh7kOdQ43xtPGe4/PGb91/BVHiqOHo8ix1vGy
//   E8XJ00nstNXpqjPV2cdZ4lznfMtF3YXjUuSyz6Xb1cA12rXc9ajrswk2E9InrJ7QPuE924OdC9+3
//   e246bpFu5W6tbn+4O7rz3Wvdb0zUmBg2cdHE5onPJzlNEk7aNum2h67HVI+lHm0ef3l6eco8Gz37
//   vGy8Mry2eN3y1vOO817ufd6H6jPFZ5HPMZ83vp6+hb6HfH/3c/HL8dvr1zvZfrJw8q7Jj/yt/Hn+
//   O/y7AlgBGQFfBXQFWgbyAusCfw6yDhIE1Qc95oznZHP2c55NYU+RTTky5VWwb/CC4FMheEh4SFXI
//   pVCd0OTQzaEPw6zCssL2hQ2Ee4TPDz8VQY2IilgdcYtrxuVzG7gDkV6RCyLPRqlHJUZtjvo52jFa
//   Ft06lTI1curaqfdjbGMkMUdjUSw3dm3sgzj7uLlx38fT4uPia+N/TXBLKEtoT9RNnJ24N/Fl0pSk
//   lUn3kh2S5cltKZopM1IaUl6lhqSuSe2aNmHagmkX00zSxGnN6fT0lPT69MHpodPXT++Z4TGjcsbN
//   mfYzi2demGUyK3fW8dmas3mzD2dQM1Iz9ma848Xy6niDc7hztswZ4AfzN/CfCoIE6wR9Qn/hGuHj
//   TP/MNZm9Wf5Za7P6RIGiGlG/OFi8Wfw8OyJ7e/arnNic3TkfclNzD+Qx8jLyWiQ6khzJ2Xzz/OL8
//   q1InaaW0a67v3PVzB2RRsvoCrGBmQXOhHvxT2iF3kH8u7y4KKKotej0vZd7hYu1iSXFHiWPJspLH
//   pWGlX88n5vPnt5VZli0p617AWbBjIbZwzsK2RdaLKhb1LA5fvGeJ6pKcJT+Vs8vXlP/5WepnrRVm
//   FYsrHn0e/vm+SmalrPLWUr+l278gvhB/cWnZxGWblr2vElT9WM2urql+t5y//Mcv3b7c+OWHFZkr
//   Lq30XLltFW2VZNXN1YGr96zRXlO65tHaqWub1rHWVa37c/3s9RdqJtVs36C6Qb6ha2P0xuZNNptW
//   bXq3WbS5s3ZK7YEtpluWbXm1VbD12ragbY3bzbZXb3/7lfir2zvCdzTV2dXV7KTtLNr5666UXe1f
//   e3/dUG9SX13/127J7q49CXvONng1NOw13btyH2WffF/f/hn7r3wT8k1zo0vjjgMGB6oPooPyg0++
//   zfj25qGoQ22HvQ83fmf73ZYjukeqmrCmkqaBo6KjXc1pzVdbIlvaWv1aj3zv+v3uY5bHao/rH195
//   QvVExYkPJ0tPDp6Snuo/nXX6Udvstntnpp25cTb+7KVzUefO/xD2w5l2TvvJ8/7nj13wvdDyo/eP
//   Ry96Xmzq8Og48pPHT0cueV5quux1ufmKz5XWq5OvnrgWeO309ZDrP9zg3rjYGdN59Wbyzdu3Ztzq
//   ui243Xsn987zu0V3h+4thot91QOtBzUPTR/W/Wv8vw50eXYd7w7p7vg58ed7j/iPnv5S8Mu7nopf
//   NX6teWzxuKHXvfdYX1jflSfTn/Q8lT4d6q/8Tfu3Lc8cnn33e9DvHQPTBnqey55/+GP5C+MXu/+c
//   9GfbYNzgw5d5L4deVb02fr3njfeb9repbx8PzXtHf7fxr/F/tb6Pen//Q96HD/8GCQ/4YgplbmRz
//   dHJlYW0KZW5kb2JqCjUgMCBvYmoKWyAvSUNDQmFzZWQgMTIgMCBSIF0KZW5kb2JqCjEzIDAgb2Jq
//   Cjw8IC9OIDMgL0FsdGVybmF0ZSAvRGV2aWNlUkdCIC9MZW5ndGggMjYxMiAvRmlsdGVyIC9GbGF0
//   ZURlY29kZSA+PgpzdHJlYW0KeAGdlndUU9kWh8+9N73QEiIgJfQaegkg0jtIFQRRiUmAUAKGhCZ2
//   RAVGFBEpVmRUwAFHhyJjRRQLg4Ji1wnyEFDGwVFEReXdjGsJ7601896a/cdZ39nnt9fZZ+9917oA
//   UPyCBMJ0WAGANKFYFO7rwVwSE8vE9wIYEAEOWAHA4WZmBEf4RALU/L09mZmoSMaz9u4ugGS72yy/
//   UCZz1v9/kSI3QyQGAApF1TY8fiYX5QKUU7PFGTL/BMr0lSkyhjEyFqEJoqwi48SvbPan5iu7yZiX
//   JuShGlnOGbw0noy7UN6aJeGjjAShXJgl4GejfAdlvVRJmgDl9yjT0/icTAAwFJlfzOcmoWyJMkUU
//   Ge6J8gIACJTEObxyDov5OWieAHimZ+SKBIlJYqYR15hp5ejIZvrxs1P5YjErlMNN4Yh4TM/0tAyO
//   MBeAr2+WRQElWW2ZaJHtrRzt7VnW5mj5v9nfHn5T/T3IevtV8Sbsz55BjJ5Z32zsrC+9FgD2JFqb
//   HbO+lVUAtG0GQOXhrE/vIADyBQC03pzzHoZsXpLE4gwnC4vs7GxzAZ9rLivoN/ufgm/Kv4Y595nL
//   7vtWO6YXP4EjSRUzZUXlpqemS0TMzAwOl89k/fcQ/+PAOWnNycMsnJ/AF/GF6FVR6JQJhIlou4U8
//   gViQLmQKhH/V4X8YNicHGX6daxRodV8AfYU5ULhJB8hvPQBDIwMkbj96An3rWxAxCsi+vGitka9z
//   jzJ6/uf6Hwtcim7hTEEiU+b2DI9kciWiLBmj34RswQISkAd0oAo0gS4wAixgDRyAM3AD3iAAhIBI
//   EAOWAy5IAmlABLJBPtgACkEx2AF2g2pwANSBetAEToI2cAZcBFfADXALDIBHQAqGwUswAd6BaQiC
//   8BAVokGqkBakD5lC1hAbWgh5Q0FQOBQDxUOJkBCSQPnQJqgYKoOqoUNQPfQjdBq6CF2D+qAH0CA0
//   Bv0BfYQRmALTYQ3YALaA2bA7HAhHwsvgRHgVnAcXwNvhSrgWPg63whfhG/AALIVfwpMIQMgIA9FG
//   WAgb8URCkFgkAREha5EipAKpRZqQDqQbuY1IkXHkAwaHoWGYGBbGGeOHWYzhYlZh1mJKMNWYY5hW
//   TBfmNmYQM4H5gqVi1bGmWCesP3YJNhGbjS3EVmCPYFuwl7ED2GHsOxwOx8AZ4hxwfrgYXDJuNa4E
//   tw/XjLuA68MN4SbxeLwq3hTvgg/Bc/BifCG+Cn8cfx7fjx/GvyeQCVoEa4IPIZYgJGwkVBAaCOcI
//   /YQRwjRRgahPdCKGEHnEXGIpsY7YQbxJHCZOkxRJhiQXUiQpmbSBVElqIl0mPSa9IZPJOmRHchhZ
//   QF5PriSfIF8lD5I/UJQoJhRPShxFQtlOOUq5QHlAeUOlUg2obtRYqpi6nVpPvUR9Sn0vR5Mzl/OX
//   48mtk6uRa5Xrl3slT5TXl3eXXy6fJ18hf0r+pvy4AlHBQMFTgaOwVqFG4bTCPYVJRZqilWKIYppi
//   iWKD4jXFUSW8koGStxJPqUDpsNIlpSEaQtOledK4tE20Otpl2jAdRzek+9OT6cX0H+i99AllJWVb
//   5SjlHOUa5bPKUgbCMGD4M1IZpYyTjLuMj/M05rnP48/bNq9pXv+8KZX5Km4qfJUilWaVAZWPqkxV
//   b9UU1Z2qbapP1DBqJmphatlq+9Uuq43Pp893ns+dXzT/5PyH6rC6iXq4+mr1w+o96pMamhq+Ghka
//   VRqXNMY1GZpumsma5ZrnNMe0aFoLtQRa5VrntV4wlZnuzFRmJbOLOaGtru2nLdE+pN2rPa1jqLNY
//   Z6NOs84TXZIuWzdBt1y3U3dCT0svWC9fr1HvoT5Rn62fpL9Hv1t/ysDQINpgi0GbwaihiqG/YZ5h
//   o+FjI6qRq9Eqo1qjO8Y4Y7ZxivE+41smsImdSZJJjclNU9jU3lRgus+0zwxr5mgmNKs1u8eisNxZ
//   WaxG1qA5wzzIfKN5m/krCz2LWIudFt0WXyztLFMt6ywfWSlZBVhttOqw+sPaxJprXWN9x4Zq42Oz
//   zqbd5rWtqS3fdr/tfTuaXbDdFrtOu8/2DvYi+yb7MQc9h3iHvQ732HR2KLuEfdUR6+jhuM7xjOMH
//   J3snsdNJp9+dWc4pzg3OowsMF/AX1C0YctFx4bgccpEuZC6MX3hwodRV25XjWuv6zE3Xjed2xG3E
//   3dg92f24+ysPSw+RR4vHlKeT5xrPC16Il69XkVevt5L3Yu9q76c+Oj6JPo0+E752vqt9L/hh/QL9
//   dvrd89fw5/rX+08EOASsCegKpARGBFYHPgsyCRIFdQTDwQHBu4IfL9JfJFzUFgJC/EN2hTwJNQxd
//   FfpzGC4sNKwm7Hm4VXh+eHcELWJFREPEu0iPyNLIR4uNFksWd0bJR8VF1UdNRXtFl0VLl1gsWbPk
//   RoxajCCmPRYfGxV7JHZyqffS3UuH4+ziCuPuLjNclrPs2nK15anLz66QX8FZcSoeGx8d3xD/iRPC
//   qeVMrvRfuXflBNeTu4f7kufGK+eN8V34ZfyRBJeEsoTRRJfEXYljSa5JFUnjAk9BteB1sl/ygeSp
//   lJCUoykzqdGpzWmEtPi000IlYYqwK10zPSe9L8M0ozBDuspp1e5VE6JA0ZFMKHNZZruYjv5M9UiM
//   JJslg1kLs2qy3mdHZZ/KUcwR5vTkmuRuyx3J88n7fjVmNXd1Z752/ob8wTXuaw6thdauXNu5Tndd
//   wbrh9b7rj20gbUjZ8MtGy41lG99uit7UUaBRsL5gaLPv5sZCuUJR4b0tzlsObMVsFWzt3WazrWrb
//   lyJe0fViy+KK4k8l3JLr31l9V/ndzPaE7b2l9qX7d+B2CHfc3em681iZYlle2dCu4F2t5czyovK3
//   u1fsvlZhW3FgD2mPZI+0MqiyvUqvakfVp+qk6oEaj5rmvep7t+2d2sfb17/fbX/TAY0DxQc+HhQc
//   vH/I91BrrUFtxWHc4azDz+ui6rq/Z39ff0TtSPGRz0eFR6XHwo911TvU1zeoN5Q2wo2SxrHjccdv
//   /eD1Q3sTq+lQM6O5+AQ4ITnx4sf4H++eDDzZeYp9qukn/Z/2ttBailqh1tzWibakNml7THvf6YDT
//   nR3OHS0/m/989Iz2mZqzymdLz5HOFZybOZ93fvJCxoXxi4kXhzpXdD66tOTSna6wrt7LgZevXvG5
//   cqnbvfv8VZerZ645XTt9nX297Yb9jdYeu56WX+x+aem172296XCz/ZbjrY6+BX3n+l37L972un3l
//   jv+dGwOLBvruLr57/17cPel93v3RB6kPXj/Mejj9aP1j7OOiJwpPKp6qP6391fjXZqm99Oyg12DP
//   s4hnj4a4Qy//lfmvT8MFz6nPK0a0RupHrUfPjPmM3Xqx9MXwy4yX0+OFvyn+tveV0auffnf7vWdi
//   ycTwa9HrmT9K3qi+OfrW9m3nZOjk03dp76anit6rvj/2gf2h+2P0x5Hp7E/4T5WfjT93fAn88ngm
//   bWbm3/eE8/sKZW5kc3RyZWFtCmVuZG9iago4IDAgb2JqClsgL0lDQ0Jhc2VkIDEzIDAgUiBdCmVu
//   ZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ291
//   bnQgMSAvS2lkcyBbIDEgMCBSIF0gPj4KZW5kb2JqCjE0IDAgb2JqCjw8IC9UeXBlIC9DYXRhbG9n
//   IC9QYWdlcyAyIDAgUiAvVmVyc2lvbiAvMS40ID4+CmVuZG9iago2IDAgb2JqCjw8IC9UeXBlIC9G
//   b250IC9TdWJ0eXBlIC9UcnVlVHlwZSAvQmFzZUZvbnQgL0FBQUFBQitNZW5sby1Cb2xkIC9Gb250
//   RGVzY3JpcHRvcgoxNSAwIFIgL0VuY29kaW5nIC9NYWNSb21hbkVuY29kaW5nIC9GaXJzdENoYXIg
//   MzIgL0xhc3RDaGFyIDEyMCAvV2lkdGhzIFsgNjAyCjAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAg
//   MCA2MDIgMCA2MDIgMCAwIDAgMCAwIDYwMiAwIDAgMCAwIDAgMCAwIDAgMCAwIDAKMCAwIDAgMCAw
//   IDAgMCAwIDAgMCAwIDAgMCA2MDIgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCA2MDIg
//   MCAwIDYwMgo2MDIgMCA2MDIgMCA2MDIgMCAwIDYwMiAwIDYwMiAwIDAgMCAwIDAgNjAyIDYwMiAw
//   IDAgNjAyIF0gPj4KZW5kb2JqCjE1IDAgb2JqCjw8IC9UeXBlIC9Gb250RGVzY3JpcHRvciAvRm9u
//   dE5hbWUgL0FBQUFBQitNZW5sby1Cb2xkIC9GbGFncyAzMyAvRm9udEJCb3gKWy00NDYgLTM5NCA3
//   MzEgMTA1Ml0gL0l0YWxpY0FuZ2xlIDAgL0FzY2VudCA5MjggL0Rlc2NlbnQgLTIzNiAvQ2FwSGVp
//   Z2h0IDczMAovU3RlbVYgMTQ0IC9YSGVpZ2h0IDU0NyAvU3RlbUggMTI3IC9BdmdXaWR0aCA2MDIg
//   L01heFdpZHRoIDYwMiAvRm9udEZpbGUyCjE2IDAgUiA+PgplbmRvYmoKMTYgMCBvYmoKPDwgL0xl
//   bmd0aDEgNDkyOCAvTGVuZ3RoIDM1MDcgL0ZpbHRlciAvRmxhdGVEZWNvZGUgPj4Kc3RyZWFtCngB
//   zTdrdFTncfPdud++H3efWr13taywXkisJGRhQRYq8RIP8YjZBckIsRILSEgIYSNjGWGMARkQtMey
//   Q2MsEyLblGNvKDgbi0NILZ/GSSiHAnVsQ3vkum7ToypOQv2QpUvn7m5IQ09P+6+9u/PNNzPfN687
//   39x7uzp3NYMBegEhsKltYwfEL10VoZ9terzLnaBVawDYcy0dm9sStPo2gJC1ubW7JUHrCwHU5yLN
//   G8MJGiYJz4oQI0GzMsLTIm1duxO0VpEHWts3JeV6DdE5bRt3J+0D6Qf39o1tzYn1tgzC0zrad3Yl
//   aOsvCVd3dDYn17MggKjo/OOLESlBHghxtkDzAFgB8K3kWkUuqAtubKz81QZz1b9DtuIGwHtdqcUK
//   vr0k5TeT7ZMf8o80W4FBQqgIaJ+6Tc4km9cn2+Uv+UcK548uKQaagpjQG+i6LOPwML4zjD+awB9O
//   4NsXF/K3h/HiQrzgx78cwPN+/EEYowP41ps2/tY2fNOG52z4FzKefcPIz07gG0Z8/bUj/HUZX78i
//   vjYU4q8dwdd6xaHv5/KhEA4FxO/n4hkZv+fH0w58dXAhf1XGV2P3rgfuiYOvzOODC/GVeXjqZT8/
//   tQ1f9uN3ZfzzCTw5gd+R8SUrvujDARf+mYx/KuMJGY/L2N8s8f4ePHbUzo858egRiR+14xEJn2/J
//   4s/7sc+Ahw8N88MyHjrYwA8N46Fe8eBzPn6wAQ8GxOd8eOBZMz+Qis+acf8APiPjPtK3z4+9e228
//   N4x7bfj0APaE8anVuIc07vHjk7TgST92u3A3MXaH8QkZH5exa6eR7zRi544ZvFPGHTOwg6QdPdju
//   wu1tw3y7jG2tDbxtGNt6xdYtPt7agK0Bcds23ErE1mHcErjnwwjtiYRxM6HNYWwhSy1Z2CxhWMZN
//   MjbJuLEHG2V8LIz16+28Xsb1dlznx1CRlYecGHTiWrDytTI+6sdvy7hmtZ6vkXC1HletdPJVA7iy
//   TuIrnVgn4QoZly8L8+UDuCyMS2WslXHJYhtfMoCLbbhoAhdO4IIerKm28ZoerLbhn7hwngm/5ce5
//   FpxTZeJzZKx6RM+rTPiIHmdXpvDZA1j5sJ5XpmBlr/iwHh8OiBWzXLyiAmeRc7NcWF7m4uW1WFZq
//   52UuLLWjf6aL+8M4k8QzXVhS7Ao4eUk1FrtwBrFmZGFRoYUXWbEoJgQCWrGwwMwLLVgYE4CognwT
//   LzBjQYxdISpfpeP5JsyPsd7AWjGvFh8y4/RazJ3m4rnT0EfIV4vTKDXTXOi1Y06Gnef40eMu4565
//   6Ca+uwyz0+08Ow2zCGXJmElLMv2YYcf0NBtPJ6ScDa2YlmrhaTZMS/iUqjHzVAumKj6tFV12TKlF
//   J6lzDqCjAu0VaGNZ3DaBVj9aJD+3TKBEUsmPZlOQm3vQRJQpiEZSY8xCg97MDVmoN6OO+Bq1gWvM
//   qElEqKYI1QZUKxFqRRXXcpUOVTEWuCByLfIYg0CqKA4gCkaOWTQiIx0sC8GKLMbCB46ygv/XF/wf
//   epfJSpmXvcmOwtvUeRO/cbYc6mEPfkyS6QSpBBqoFw3MC1dJklhVD0+IqXiJZKVwGJpIJhMo0qbf
//   axINNB8QDThK+ACcwau4Py77XOgXrgr9IFArPk2c/fAmvAND8BJcgijcZT7ivst8bCacYsWk9XNa
//   WcxuMR2rhCa8CqvI29NwBt5jwM4wFewUgd+Cd2EUbsA4v8VfgtM03uKfww4mUq/PVMVUdrUXxlk7
//   TMCjzErjT+BXAvUS/C5bBJdVLcJJ4V2xMf7bQzvGhXphj3ASRsVGdhb+QWUne/vhJLSDIFrhKlaI
//   S+EruB5/jkynCM5iOT+a+JHfGrjBbwlzYI/iJXnRj9Uwh9Z64Jr6tMrEitV7+Tjt3glgB/gM8gF+
//   qFZxESkhhW4pKvgWh6OBlUH3T0OeosIHSLekdkehLmrsdsfu3asLiuk8FOUZUfRpoqLPO/rfCUeL
//   Cmvrgu7olZrqpNaaxmrirQ6SAforbLJWQ7wEY3GU++i/uDHq3hRx90l93tl9UvPsInpcFtbSUBf8
//   AWPHQjF270AMqjN/RA9d3PAYibWFbnfNluooayRCV0iMfA/N9IXuBeTlglVBb8jd5+5bHO5zL3BH
//   NobJ7TgmQXNfqJgCWB3cQuOaoCcaCKXfnzaHQop1g6KHttDyvhBp2JrUQDjOKp6iRcbCWncUc+uC
//   K4PR3ur0aKA6lO7xuGuiV+qC0SvV6Z5QiFaZ7ntKHvdscSV9NpPPpnySSwktlKJAehRCfX2KztVB
//   ryfa29eX3kdxJOkYXHmAweBBRiDJiIGigzJRQy2tjpQR8nrSFYbX4/WQn6Fqsm1Rbk0NeeoJFSlv
//   LxAhUPAOgksEBwlOEzxGsI6gnqCJoD9JnyPcTjBIUEHVR4clXq8GUNE5A3BD6L+8C8UX3B+UdzG8
//   T5Hx/zT/3035/7hMFV+hjr+xaWmui9N6Gg3xWWIwgik+MSd5OZADVRCBAfhbtpydZL8VgsIR4R3h
//   CyzBrfh3tEqAiDwgRvgZikANaQGDeBlUl5mGNwkiFI/cHJsJ0s2xm2MlNovH4vNYPBERJndi+uQ/
//   yQNq01e/7VTlUXZ23JsvNlJvQXAGtAKERQYCitLNkZsjtP/uL0qU/on770yO3+G3vlbeuJmSW7Gd
//   9uhgWsCKu0VhNw+rYbdWozIhMD1tHpmk3cVj/rtx+x4Ljztg8VxiS+SrrJxlsiWTy5iI7y9luiXf
//   FMvK2zKDg6S3gvSqoDyQyq0CCmgVuejjuyGMHJnIjGBQS5NjI5bKStJ/d6yEKkgt8X9TIJRj8ziY
//   h3kOYlRWyTfYZ1Mn+K3rE5NUHQL1KRD3kG4N2KAwkMI6JOjQhq0aQdIB9xizLWDWZthJt39yjLQn
//   9VP2mKXUP6u8LNfr87hFh130eC0e9n73iV27TsiN7AUKxiz/Rv75dvlD8Y68pKm7u+mr219+eXsq
//   3joFeOzeP4prxD2UKx8cCBRrVZCanWIyqPSwOUW12ZJNfSdjs/ewpTPlgAG8GSmILqPWqZ+RjU57
//   Xi758wtyyW9JiTv06ad3x+6OSePSeKXFmvyXBIrKskqyS9xlnl1Cp6PTeQgOsUO6fY59zkEYZIPa
//   Qd2Qfcgx6Bh0DqYMupwNLEflsDspqDnMZ/GUm5g3J7e8bJanVAkyR6Uun8tK3U7h0pln1i3r6mVe
//   +U75UPjHt2Sm+/nm8Jb3tm38aQez3BFMa1qWrnvrZfuOqX09S+p+dnFkeObCxeWzJx7K/XulNtdR
//   3I/QU0WCDJgVyIQ0E7djWsRkj2g6TYdZF6aI4BT8Fqc+L5OiVIJUKoYClMYTsVHmqWjj/gkWyVrq
//   d7K42wk3MYVNk28Xv9B85eYHf72uXz7VumHD9u0bNrTiT4TVX48NbWxiZczFMlhJg2w+HYudJlD8
//   qie/euh+2CEdlga8BofR/jw4+o2WCHSj8Zgroj2MnRkOJxhmmJzpTlVeBnk3NjminCZybkz6jLIf
//   d7EkoL9muGa8ZrrmuJbOG3yUSDdYJCj1g8XhyWKU4QqcQdlVqcXlLTcfl/9Z/oBlffk1s01p2cnv
//   NI9s+0rY2dG8W1+Rn8+KWDqzsrnyh/LdJ559Zva32JauJ/bsIH+b5KC4SOwBPTwEiwMPpaUaMrW5
//   01EbybQ9b+12RswY8R6eftx8IjMvNxWcBr9V5XTn5ZHTI4mcSiNK1UjjXyS8ptxWVpaw+K1OlAGT
//   VJ6c3OmWuMdzmFIPyXynlHvQ29lQv2NHfUMn8/1O/nX9hYbV59Y/9XjBsZYrn3xyuXGggPmE+QMX
//   L7z40oWL8hvy736dnsGMMwp3PdVdt5wVMkZvNA+vW9WvNDUBCIlHVftAC0bIDzgMOk0/HFcJ/bqd
//   IuqZk4NObZJuVlH3qIq3D6V/SH9TYqMycHjKaWQEd4Rq1jopsDZ5lGUzn/yx2Di5b3RUOIWCfFax
//   w2Ad2VlAtWcEX8DKQcP6sUvTr9PotaJTADJB7Sl+nqjs6KwrhUba7c5HmIMywfbLHwjLVzX9qzxy
//   /W12AxtHv/nxs9tHf5nQfY50F1P92KAkkKpFZjIAU0Ushw3HdUxwQoVyeMuTfYQKuopyb6lUfnEz
//   lkTelcJ20DHzO8Vi+U7N8hXr5TvMmz2w9ZXTwgdTecLZJ7cce3pqr9j4ekPLjYTddrI7k58iuzMD
//   Lm6ir4d+sLDjibCo4Tslq8muJI9y508Ed7dqZMyfNOxIxqec9Xi0wnm2V963+NujX0yelz+hT5lT
//   8l+NTo3Xzht99SNBHGVzKY+DdFZ8YuODsXbq2HGDEmcFBRyPlSqNYv2UbtfvY1WeOYnTev8Q5w4y
//   X/WKFSHlnmW/sGXwe+yg8OHUmu7IkaeF/d8MDjW03CSb9BwXT5JNPbwYmM9VapWIoppGLjKBoSAw
//   PS3SaXWMRr1OrVFrNRq1T6cWmaiB41zQ67Q0V2lAmKlRFRukSbrX1D3jt8KfUpl8YLyvljRJ4IQV
//   +AMdyjmv1jLWELBqRVEn0CcYV2u1+ko2S61qgAat4NEzj5Z50pnYLR9kJ+Wztz+Wz7JT8n726DvD
//   YuPUv0zFGEmERYJLPk/fGkrtx697Tyu1SQE8eEnEoM856kppUArVsBAWwRJYCitgJayFIKyPb6DP
//   vuReFVgA5inX/IJlzdtb24vmt7eG4T8AdfGTWAplbmRzdHJlYW0KZW5kb2JqCjcgMCBvYmoKPDwg
//   L1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1RydWVUeXBlIC9CYXNlRm9udCAvQUFBQUFDK01lbmxvLVJl
//   Z3VsYXIgL0ZvbnREZXNjcmlwdG9yCjE3IDAgUiAvRW5jb2RpbmcgL01hY1JvbWFuRW5jb2Rpbmcg
//   L0ZpcnN0Q2hhciAzMiAvTGFzdENoYXIgMTk0IC9XaWR0aHMgWyA2MDIKMCA2MDIgMCAwIDAgMCAw
//   IDYwMiA2MDIgMCAwIDYwMiAwIDAgNjAyIDYwMiA2MDIgNjAyIDYwMiAwIDAgMCAwIDAgMCAwIDAg
//   NjAyCjYwMiA2MDIgMCAwIDYwMiAwIDYwMiA2MDIgNjAyIDYwMiAwIDYwMiA2MDIgMCA2MDIgNjAy
//   IDYwMiA2MDIgNjAyIDYwMiAwIDYwMgo2MDIgNjAyIDYwMiA2MDIgMCAwIDYwMiAwIDYwMiAwIDYw
//   MiAwIDYwMiAwIDYwMiA2MDIgNjAyIDYwMiA2MDIgMCA2MDIgNjAyCjYwMiAwIDYwMiA2MDIgNjAy
//   IDYwMiA2MDIgNjAyIDAgNjAyIDYwMiA2MDIgNjAyIDAgMCAwIDYwMiAwIDAgMCAwIDAgMCAwIDAK
//   MCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAw
//   IDAgMCAwIDAgMCAwIDAgMAowIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAg
//   MCAwIDAgMCAwIDAgMCA2MDIgXSA+PgplbmRvYmoKMTcgMCBvYmoKPDwgL1R5cGUgL0ZvbnREZXNj
//   cmlwdG9yIC9Gb250TmFtZSAvQUFBQUFDK01lbmxvLVJlZ3VsYXIgL0ZsYWdzIDMzIC9Gb250QkJv
//   eApbLTU1OCAtMzc1IDcxOCAxMDQxXSAvSXRhbGljQW5nbGUgMCAvQXNjZW50IDkyOCAvRGVzY2Vu
//   dCAtMjM2IC9DYXBIZWlnaHQgNzI5Ci9TdGVtViA5OSAvWEhlaWdodCA1NDcgL1N0ZW1IIDgzIC9B
//   dmdXaWR0aCA2MDIgL01heFdpZHRoIDYwMiAvRm9udEZpbGUyIDE4IDAgUgo+PgplbmRvYmoKMTgg
//   MCBvYmoKPDwgL0xlbmd0aDEgMTE2NzYgL0xlbmd0aCA4MTQ3IC9GaWx0ZXIgL0ZsYXRlRGVjb2Rl
//   ID4+CnN0cmVhbQp4Ad16e2AU1dn3OfPMzF6y2Vs22dwIWZZNwiVkkxAgEGCJ3AKICBYSBIoSMCg3
//   RVCk1CgNtwSjL5gQpJZSi5Ba3xQpBoIxclEQLaBEKmDBilo0Im8LaCE5vL8zmyDy1f+/75vZZ85l
//   Zs55nuc81zP76COLZjIbK2XEQjPm3reAGUfkK4zxaTMWP5ocbpsfZ0zJmrXggbnhthX3lc4PzFky
//   K9x2lDLWaXrJzPuKw23WirJPCTrCbd4bZdeSuY9iHHnY3sPl3Jz5M9rvO2xoPzL3vsfb52dn0E6e
//   d9/cmShxpD+KS9qC+QtliaPnOVzWL3hkZvvzvJAxU2d550cHR6sf6w7a5KEwJ6thbsa0Se3PyvuK
//   qcevbDs8P3fkXWGdzcaDBx+Ny5aVM6O8l66vbuNao/lnaIZvyht4zzRXdGJMPX599Y0orVH2/Ojo
//   V8/MPXYrpTx6x/qp2pBEHs2qGOFaylTuYQL1KOPqBkLEXUbdaVwdbCN67EY9csfXI7QhAR7JlqHP
//   xgK4RrAsXK3GeBbjKTOzo8dk1HXjGc2oq0Y/GT2K0cNDRYKEoLZl1CrouqBrWfTvBvp+GX13tUL7
//   TtB3TerVK0Xa1Qq6WqpeuZyiXSmiKyH1cgr9658Z2r+u0T8z6H8EXRL0bRZd9NA3VdQCFFsEtdTf
//   OB66oX49gr66UKx9VUUXiukfgr78IkH7UtAXCfS5oPMP0WeC/t5An56L0z69Rufi6GwV/U3QJ4LO
//   nI7Wzgg6HU2nqujjv0ZrHwv669oI7a/RdHIZfdSfmtFo7k8nBH34gVX7UNAHVjou6Jigo2tc2tFE
//   +ksMvS/ovSo6Uh7Qjgh6V9DhZXRI0DuC3hZ0cGOkdkDQfkH7BL0lqAnjNXnoTRs1vtGgNQp6Y+9U
//   7Y0GeqNU3dsQ0PZOpb0htSFAewTtrqL6yiHa64J2odh1jf6MsXYKeq2YdhTTn+xU56b/FvSqCLXR
//   HwW9IugPbqoVtH2bXdueRdvs9PJWl/ZyGm110e9fStd+v4xeSqffCdoi6LeCNv8mTttcTL950an9
//   Jo5edNKvrbRJ0AuY5AVBGyOpZkMvrUbQhl5Ujfmrq6jq+QatStDzkK3nG+j5UnX9swFt/VRaH1LX
//   CfovQc+h/VwDPRugSjCjcgg9A2qf8dDaCKpAR0UxlYNp5QFa46LVglYJWiloRZlLWyGozEW/ErRc
//   0NOufO3pCfSUoNLH6clfLtOeFPTLZbQsiX4haKmdnhD0mKDFghY9atMWOWhRPWehU+qjNnq0SV3o
//   poUh9RFBDwtaIGj+vAna/CqaNzdNmzeB5qbRHEEPZdGDgmZnUck1eqCBZgmaKahY0Iz7k7QZgu5n
//   Tu3+JLpP0HRBPxc0bXKENs1OU4tpyiG6F417PTQ5giDRhR6aJGiioJ8lxGk/y6J7BE0QNF7Q3cto
//   nKC7PDRW0J08XbtT0JgGGp1GowpitVF9qeAOt1YQSyOHxWojBY1Aa0QxDUdreAMNi6Wh6Bjal+7I
//   d2l3uOmOeiUUsqj5Qxxavovy6xWG1pCQXRvioCH1vAmt0GCbFrJTqJ6XojXYZtEG22hwPQ+FitVB
//   ggYChYHXKE/QgDTqLygXDM4tpn6Z8Vq/0dRXUJ90j9ZHUM5o6h2M13qPpmwU2YKy8GCWoEzczoyn
//   YDxloJYRS70sMVqvBkrvGaWleyi9XpHT9nS6tJ5R1FOiW6X26B7Qegjqjie7B6ib0l/rJihNUKqg
//   FAcFYvK1wDDq6iC/oC4Oh9ZFkC85XfMto+R06jyakjBzkqBOghLB20RBCViVhDiKFxQnKFaQFyN4
//   h1NMdLoWk0/RHqcWnU4eJ0XhuSgPufG+W5ALlLvyyYkZnC5yhnnnsNs0h4McYd7ZI62a3Ub2MO8i
//   wbtIK0WCdztVm4VsUrb6qhGCrKDEKsgSQ2YnmQTpGFoXpHmIQBxdIwUdSn/iQICnE3MSr+fFZWt5
//   j/9/Dvb/OClwnfXsiAG1/DmUMo6oZyuVJ+GlO856th/PKMZz9fwIX833oL4VscURtpz9k1vpHd4X
//   tUa8W6j60FvJNhlvV9KXbBHtZR+yw+w0al/yXMK7/EPm42cxz+qbcyjUiNZ+XJdSIxXyznwue4m/
//   ihGXsno+nz2poFTGY+T31ePofZ+txLmOvcTmoy4pWA78P2E7WTm7zDYoF9hk1Pewg8BHwP0atPBm
//   dhUj1SoDlVl47iBG28g28uWsmS1UGVy5YJ9qzUoPjLoTFDB2P9ukNWsbJD9QNmuXcAcBll6ve0x+
//   UCF5t5Xv5ZnKWPYh3l/K7qEp9DCd5mWqX32MLrBKhdF09iA7qjXrHlZp8rNKfRZfok43zqUYbany
//   mDqd17ILGPN++h5tHzDbZFDM2E5lvDZWGwuaZ6Fvk3GtDF91J3ufroHvzymCj1SH02DQs1Qdwzaw
//   LRg3FZxhbD7lYPb5bKm2NnyyWpzp2lqqAkcNbvBsZSDbpMzi5cD2Krg5n4ayvpijk3aRlfGdwJuZ
//   lrGFWjNjqHZn7HWTrqlQb9Yz2VmnBAqK60J3FyYfKvKl97ytmew0JdexcXWRS5Lrb9wYV6gmaEV1
//   WmIdBcx1asD/6U/d/DS95+hxhcn13DtsaPuww6YPReeEQsyAn+zGdMPQF+4oqNMC+BVMr0ueUZK8
//   xrnG33+Nc2b/dMR/PUfjMq7wT5w/U1TPb5TVs6GddiOKpJ9Pw21Lz+TkYbOH1vHpaFh7oqO7D7WI
//   nsnDgebw8YX+ouQ1yWsKitckD08uua8YeBslbsxcU5QBCiYUzsb1nkJfXago4WZ1ZlGRnN0mx8Er
//   eHxNEUZ4sH0ElEZXRhseiuw5OrmOUsYV3l1YVzo0oS40tCjB50seVtc0rrCuaWiCr6gIT9lvYgqM
//   l82ObcfZAZzt3XHfGR4FLAol1LGiNWvkmBMK/b660jVrEtaAjvZ2PWu6rYOz2ztC7R31TI4BTgyD
//   PxiHwVD4fQmyw+/z+4Bn0VDM7ZJLMwyY+orSEY2zEqmlgL3qcV4BmAIYI6UYUAY4BtgAWA0ovAUC
//   qJe39x9EeaG9fri9PImyKyAKsAggn6kEyHcyAOsAuQCMo2RjzjTUJR5lgLcA+wFLbwHZvghoAVwC
//   zAXIPolXI95/EGUzYDlA9ku6kOMgzwhnGjam83FoJ7PfGT0K6h0HMdWoasZVZybInIVZO27fLCOQ
//   90UaLTuuDmRHLpkdsSipbiyaxTAvi2VxLB6tBJbIOrEkFs6xktHjA3QB+AFdkWKkQPPTUO8GTe2B
//   sidLZ71YBguyTLSyWDbrzXJQk0efcPF/0bVvOy4poGMi7NhFbuMp/D1+VRmrvKqcUC5TLJXS2ypT
//   g+oUdZN6SAtqY7QXtXN6sj5ZbzINMk03bTWdM3c1jzEvNq+xMMtIS4XlhDXZ+ivrXquI+EVErS1o
//   K7G9ZLsY2Sfylcgv7En29fY6zKqwElGllmgvIUs1sc57jfyQYXk9u7hZW66oLOPAiZZM5jzRcqIl
//   GOXyuQI+l69EZa0LKaH1c1Flsn//z0f0bpIAhe2ll+lPeoQxVl+ZgwIyYFsA/Ew9UwBmZz3TjwHQ
//   p52BL+GyAmAANSOYyV1+zOJ30Z/OiSPn9Ii2TUqxBEgfr7gxkSbpiyE3U+XoezCRlUX0GJIAaSHw
//   jrC2xIYDJgJmARYDVgCqAFsBuwBvAz4CRE4dorHPUbkCUKYCF4kUkzjoSrTH7fWnKDm93X1pUtny
//   5WWbq9evr9YXnxcDvvhc9P/iIt9/7iw/0AK6OZ8CvFJvxUtlERIvjX2FyjWAMhVIxqHSDZALKAAU
//   AWYDlgBWA2oA2wG7AYcBHwMiJV6mDryyY9zRHsXk7+PO6a3wKQZOm4GdvrhF5J39VOS1/IO//dl5
//   /rZcD87HiDrln3w205g3zC+pvhE9MOJNbvtcZIrie3i/vx2ax2eL78TdnEMwOJt1I1/tC+9HLDYU
//   obBVKk9iShKphiRAIC4fCPJs7qclja0X39Sa/z0XT5bd+Ewdo30NtKOgs2flnPUsEch3AhBWPxGr
//   b8HqS4lAHM4cZwweOcAjRwePHOCRAzxygEcO8MgBHjnAIwd45ACPHOCRAzxygEcO8MgBHu2B8bAw
//   crlzMTbG9Z4xZMILmfBCJryQCS9kwguZ8EImvJAJL2TCC5nwQia8kAkvZMLbIRNeyIQXCO3BmoXH
//   RVQFqwfm7QELPSghJVlul1Pxd1FcTncU6r1TeUwUWh4vT1FKvr1y5dtvL1/+9plyj+g6umJteRT/
//   ALwRT4incT7BV/Bf4lxxbQPvxfv8vqzN+3v1kPhAvLt2qfJlGfh/DBZ8uHYMAu4Pr50JncbaaRl7
//   DJsaIdULxLJjwUxopZYTyHb5on3czvuLVXzxu7xP66Htasmf9+249vF2KQ+IkZjqRzyXyO4OdWOJ
//   AU3XYuPiyZsQ0HUt3+l6ObLaU6WyauxVWRVuTfJ2cVLXTs7WA60tTU1gbibLaMm63HL5vSD8nsmp
//   fePy5srCm1XUJYCpc/qwvoN4Tu8UfxfdlDOIZ2ep0R7dZOd8kfJq66IGHptTPHxd6b2HFjzwzn2n
//   eURRcb/m2trag7zXoCeq71r2TP4d72VmXXhjetOjQ76Q+K6GPPUFvmlsBPCNqo62llu2RlbrncuT
//   tyZW+6v0mujt3WKiGHniklKcSdSls8fSuRvwBcInWoAc5LTlPBBucV68etF5MTfIk3i0R/V3SUnN
//   SQJ6fYBrD54TrvwIaTKv2yS+vvLARw/Mevv+rTt2bNi4sXzTcyuKGkuWvFFwimurqXPqO8//5euU
//   rodzeletfbpm6xNzFy5NS9uTnHz6z0tlwAz8C9ladYn6GOTGF3JrKmJHjV7V/2jiCktTU03O1pYs
//   ieLlFm9u0KJE8xyuLml9lcZfP6v6sEnUJPa/zrds5QhsFVbIR6tL6Ai0zBTWZkgkR7+USM2QzGBm
//   FNZAigDyETnE9bP88nalNLz2P8JF10hhmvoq/6NJV9JUJnHJa7mJS1QOl8gYw9B4emuXmLZVTHud
//   D8R8AcjQK7ALCiRzQ2gIC3CmgrSAppoAekDTVEuArGYAD1jJygJIBsiaz8hUzetolUWzmE26EUhb
//   tAxrhPMMqIdg5Z1vbXHnhgXL/I2UKlP4d0vN/E1Rlx0m4nxqKN4Kxa/EqWJPUlHJplpMunkFX62Y
//   p7KpnHyGcfKRXylp5rXiT1f44ePz2q7MOa7521R69VoPXiaQiHBWDhnLhIzFsV6h+LjX2I6Yaop8
//   zbbDWW2popr4qCwby9SD8XKtpB+8KU3BgJ37k5nLyXxZMd7oXjxsCCBKfdXMO7fcKz4V+/lg3une
//   LXeOqp148MCBg4XbC3K6deNVfAGfx2u6dTs6MCSOiffFX8Sx0EDIiwIDx9Tx4K0Z5iwtFK1XW1ax
//   aofOHBYTZdkyTUnOoBuItLa4cnFIbbzcEgxk9XE5U3x+V5SBTTfu4jtvvHv4BptezCfyoWKvqBXH
//   t17nI/no69cf0zLEelEKC/S8zGxA/0HMORb1COkSwj5V+oiwfTYdg5TJ6E1K2U9Jm5S4g7S47R7l
//   mbZHlDdbH9Oaa8W82raGWjn+BYxfiPEtTJorw2f/aHx0wp795Nj+CzS/bYoys+2FI3LYBbVtjrBu
//   SV6NNPC+S46LnAP4RwJshkkMuzgZdUSiraFUAaZjCDjQthy76QPDXt8KHAh8l3Y9CmbUlR0OQ1Yf
//   UbodOdJ2EpO3HVDyrvVQvm1zGXw7jPl1Y/5AKMqqVLNVZrVa13hfSjKxvhYb/GQWZKbdZGYFO3Qz
//   Bxp6mAaKd3hu636eK94BWdefrK1Vn/qBrsPGuNUhnzlgMcNImwIwz2ZNIWI7rboZaajOLfDHQZsU
//   S2dTWIFasmBGpGGG3jgNVTGrUlXGmLQYzWtO0VLMfZThys+USeZCS7HyhLbEvNRiV4irJhgQxSQf
//   StV66j1MKeb+VEAj9BGme2mSVqgXmiaZH6In6HGTF8oF/vBsC/dzk8sP/jz2TVuDMvGyiNsomVSi
//   bGh7sXWt0vJSG5YA63oSfJJZtIY4wibZhECCMllvHahDoTLOI6w0/NbJI8rx1mKt+VqzITdd8d4I
//   +D8beyC8vnJt7XKNb1lfu7G2e6A6+K5ieH8dq8zQa5WxpRRpAsj4MgIrDJvHGB7bAxvaUbO216T1
//   tHAZeYIyl78r3KjCVe5oEFdrxJU92rE2q3L1WlDzt14i57VPDNqigKP00RY2IYyj1ZgIs9+CY4SB
//   Yzj6lZiZbsdMyv//iZnEh0MMcfFHcY8y8qRoaas/qR273lc9fC2oHr4uswaFLYL9mgL7FYGAxR+K
//   slQ7qDq6ylETy7JsffQsd06sYTHCpst5Mcg7QpbsLHfULXVavXJjzcqVNRtXfvhdW9vV71rbvlMu
//   8AIeL74Qr4t68QWP4wWIXkoRtaziK3mpKDXml/ZjEdbXjJivRyiWVzsZzJbbaTUjedCyIvu5WJIl
//   2yMFFXbLkNTLMpcAbYb79Qd8MkpQe4BOXvlVxa83rRVj+M5rXBE3rn/1rpbRdnR9Wdm6rZ+d/uTv
//   bdswJWiuxJzHMWcUIpkHQ/3gUMiqB0glLaCqlK+rLJrU6GqLpzpyVYSquWIsOlnJxRLtZI3LUl2Z
//   HmuSLYjABjgdkEi5co2LdEMSOXeuPDuCHJPTLgOdoi4IHrxRfurFJa4uA239JhnK92PnjT/y8Y47
//   l8546wjffJXrv2079slzz1Q/q7zlmb9VlPAlv53atlpr/tsH6xuUoraLT694ajX0Q/qfUVi/VPar
//   0MBIm2KPCCR1TjJbFJM10LlzUr41IqmzyqNf87wcW+3ir7GX1epAlasmLcka0TnBxFIScu2ZHlNu
//   l2AayEHccx7ybTiHH1wVkA/TYtBxk5wdZkWaB6uJmbhJIZPCpec0PJke7Ynp/B9ipQwEqzm9u2Zn
//   xdDlKbunVW6d+/yDHzSJ71tnn3ho4fslNbWLnptzbC+PPDuxUdvy/oC8sodnlPhjMz/4c/O59PST
//   BUNXL12wODkuo3Hzof9JBe0ZWMctWEcTSwzZ9bBx6E9JrL9mhvlslebhcku76QTDM9SFIv2I6AGL
//   ea1Zk2k+xlgH/g3EGJ1Yt5DXQW5ksJbq2BonX5XkSHJlKrCSSTc1AMGrZEYU9MoT4zUiQBmwyqYM
//   U2Vc2IuvO2JzJC+ZOOlxn8P2bu7w/NoHZ9feMay/MpA2tNrmTo0bkJc3IG7KHLraWvL5W4MH9O8/
//   YBCUQOKSC3o2ABedjQl14wEFQVZAR/SDwoiSjOgon2l8JyECQjSoZGhBGQYaaoFg8AeRkyFQOAxC
//   aC1jGWxYlvCfHxejr4jRx2u1HtfABjlnAHPKeMzMikK9KGDEYlxBFKYESDEzM8cD5nwFngMmnjQV
//   X2rVPC2J5ZksBo8hLvJnRBM/hUAUzH22lPnAST6HP/Sx8ElTP1dZ13q47X7lRUm7ko0c+LT+ONby
//   Nj8vbZ70w7CTHZFqh79HDuWL9ruyo31KNt926ZIo1B+v/Hcr1JvztBsTlWPGeLCpMm4Ihwhh/y19
//   uYJxdTkmNrGN+AQuwPDf3OXLgfvOUY6JwkuX9Me//1ulrsoxGRMb1EM3EIoyhxwT78pe6fM1JC/q
//   oev9GmtrYV9kHutXl8KmdmPzQt2hIfHJtliHie2KNVW4feXJb3aq6NroromN5LFqnN2q24Ymq3r0
//   oO4I5aGCWVmIzyC7B85fbpWph/Mi7AsMCvgcDHUKdg4mB33BLpvZZr5Z2WzdHLElZrN3c+zmuM3x
//   9qmQQal8MozM6QsiDKHM6d1nAM+RIWZ7WiVlV2kc+NvfPTFnw6t89+4Br5X+4b3r//qOr1g3rene
//   WQ2F5QcHpiQr2Q8vmLngwz3dxrQ9tbX4529tadjXacWSPr3rU1PHj89aJ2VWYW+B1kLsdkfAlgZD
//   8bH42lXhsFRE1zgaE16IY273iFibrscP7wTasmDCQZdMqSRNSKeMVC+ML5f5XjgjTkmVq0pVq8pW
//   rFmzomxV22c9X5j17j8uHCmu6VVfr2R8dOp084kzp5THxxeKw+Jb8bU4OGnCWrnlztl+4BMA7+NY
//   RijeVh7Z5GTlcU0xFeSssDTKgNyNPHx4PPYfOuJxp7h80Xnl4n8IyDs4qQZG/Xq8aBWneYCrd28c
//   W7Bu6h/3NLwyfcOQ3B49eD/uwdmve8+3hvQ/d+zopwMGSb4sBR5uoOQM80VjnvgKu6fCXGNv5C+Q
//   V0XENMLljhgp+SKX/Md8gUUJr53cHIC55MaShjNjmlxf36um+MiFr96duVE4VpWVlZeXla2i48od
//   /25ZO2ESH4Dsy8X7ThIRH506c6L59KkOfKaDL9HAJzusEfIvJTJSl5qQeEzutECideyOyWg9Sm43
//   oUwELcZuRbQvWjfkKhoyZaQKWC5TWKjU6a2fmd98tbBp7uz994rr4hRPvvTRd3W251aVvWJWKibr
//   nx/ql/s6eJXLo7A3GRJ/q350e908Ay8xUnW368rIUGqcLSkh1ULu8qgYS0VSTIWDoClJjv1p+7qn
//   xjHdNkJ3u30joSgH2rnmPH/+QFhJnM0Xpe+6Xa6iPNhj6cjXBypSIdqZ6s3Jpskrn1r5TOWqJ1fW
//   X/xyzNYJ92++4/lVPTfMPfDVVwfmVGXUK7lHT548evTjU+KTVtGamLCrV88tdeZl06bw/tzEzbz/
//   xMnPST2A3MGOJmC9o1jPUKzFTvhPi17harS9YOWKzkZFWvSI4R6pA4YK5CHzgieBBsAqhpUAlWyX
//   1IEYNWH3gw8/VV5fn7lt4R+2K7vaRim7qp95/Q9tK3VP20vTZ3wq+XYR85XqDsSOkWx0h4ULZ0Yy
//   QzHBwlmxprIegVKusU1aO7m/LtdV7p+HszKZtYTTNR07QQhhkY/JLINnR/t5Hj/J57bO43PFp7xz
//   fb06pTW7spIGKfn/AM3YvVR3GLp/MNTf7A3nGl7sBVm88B1ek5kUzasj71BUL7xYOAXZx15oz0Es
//   XNeHsmE2cKUlC9yACuS1nO8INsJZiAlOTA2n8+05iUkGHeN1xWyOUWK1WHOO0lvrYx6uzFIWKYs1
//   mB+zOQ76FavF6fGmWHMapWpppgE0ADtBuaa+5lFUYCrSi0wP0Wx1tj7btIQe15boS0yJt2UmLY38
//   s3NiBEcefv/qRt3TupQfF5Pbhiv5T4nBoP0SaJ+sx4P7qWHuRxoMDecXljOGX5H+ZA+ekPkvOOuJ
//   gWZCFnPgYHzK0XuLTl74/Z/Fx/wsf/4Xv3zhw3105dmwLOF/aup86EQX9rtQaqzbYVFNrFOCboq2
//   VSRTY8K+OKeJuRzmO/WxrjsdYxNj74wf5ndeHl1nu2d0neueewt3s/gbTf2KWvOMXN/Yd8vLO385
//   D1yW6iFDmNCIoBrUgnrQFDQHLUFrMGJwzGDv4NjBcYPjBycMThzcaXBSKZWqpVqpXmoqNZdaSq2l
//   EZUxld7K2Mq4yvjKhMrEyk6VSX4+1TDcMXH8FkH+QaKjDYlWXuoye9TK+dtyho8bsC13VEHuyy/7
//   ZgweM5Mujhx2XJxte0x56puFSz9ve1J56tICWarTp+cNHn5Tr8CL2/Vq33/WK7iW/6BXYSx+Wq/U
//   6dsMtYJeyT3DkYY9MvIhvcLNKmzSV1vcjqHkjh4UaxjsH/KhDn8L45x6y46uUlLx7LMVa599du2F
//   765+deHqVTp76qPm06ebPzq1Cfu0f4dcfcjT8ck+ifeS+twoJqr3YF7pL7JDiTf9RaO9hu+nfZ3g
//   K0YYXuMWTwrbd9OVBqT9MOhs96E/8q2P7d4tXcaX/3h3Vg2/tDLsV1eubTusWysnTBJvi6/gRg9P
//   4lfaXashh/xByOFy4ORid4WidFMEMRdV2xst+0xWXWdmt/PEAWOHAkiceE+KVjAUcDInd7qSWTJP
//   dgUZ9vidQVeIhfgdzpBrHBvHxznHudxTkQfIQOUmzjFedfmAJwpe2QU831w+dHEfWtKr+1/fa/tQ
//   nX76sSe7IJmXstCMtdGBTypbFAoZuY63PdXxIufJ75QUa2Q70aycN6me8uim2AqXWhFoRLrTKZzu
//   3JWg2wtMuqfLsLSwC/lRuuMUV2Qk4EZC15G+hVOejgTutuRG/8Gx5PTOUGRu00fmNu/ftXnCsqVT
//   Xh+1em3LBxN2PfjA3nueWHHFPOw3/3Xq3clb1dydvXrdPWH0KL89ftOyrQ1+f2NOzoyi0kzF3nnd
//   k7/9b59B63Lw3qy9CLnPDMXaNbODdjEX32feZTVHWJAa60633eM8kXegNe9AVvtmXh6Ww3B/0oQj
//   Q7nF3LjwV4UtYtq0RUc/PVormnkP7UWxr7Jt8y/uX7f1iDK9kg8Cf2XslKBOu03Xaqx8n036r1Fw
//   ZIYPQ7wCW30+nA11pEMyHb8ZtqTsr39owdNrdu/O3P7wK9v4NunEpAtTllzfsu2+YngwuZ4lkPmn
//   1On4brs5NCzSa4+Ep7BGKBab9BYuL/5d6vQ6nEwWLmekPdLhtdsj851RkcxuqTDtd9n3RbmcjkiZ
//   gbrN7gL7sCjo5gHDkzgN7HJ/lIb/kBPd/PZgbHP1cxs7wqpzsVMxu8zuOFtcZIo9xdHPVeAqcBdF
//   WmVeq5sUZHjhzf6+cv8KsUOvETO69FozZf3cu6eMEHft52P4iP28ZNGb4vv+Y8dunHZAHdu6nuaE
//   aS3kC7H/Pg05Br6HqZsVplMiZ6nYxgp/Hz2AfSwf9EFuvm9rXUnTRDQfDLtgHDd+iX/mSI7dfvRD
//   B8m8Bc7HAT7Kr9/y23dnloxv3F3bv2t3wzftnje/Z8uv2Tn4qtUX/y7OZXlsEAuxfAZHjK9cI9hI
//   NoqNZmPYWHYXG8fuZuPZBPYzfPuahK8RU4x/8kg83O246PJr+xB53NHjzpnz5sxPHz/zgUVz7nuE
//   sf8FKObOLQplbmRzdHJlYW0KZW5kb2JqCjkgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUg
//   L1RydWVUeXBlIC9CYXNlRm9udCAvQUFBQUFEK01lbmxvLVJlZ3VsYXIgL0ZvbnREZXNjcmlwdG9y
//   CjE5IDAgUiAvRW5jb2RpbmcgL01hY1JvbWFuRW5jb2RpbmcgL0ZpcnN0Q2hhciA0OCAvTGFzdENo
//   YXIgNTcgL1dpZHRocyBbIDYwMgo2MDIgNjAyIDYwMiA2MDIgNjAyIDYwMiA2MDIgNjAyIDYwMiBd
//   ID4+CmVuZG9iagoxOSAwIG9iago8PCAvVHlwZSAvRm9udERlc2NyaXB0b3IgL0ZvbnROYW1lIC9B
//   QUFBQUQrTWVubG8tUmVndWxhciAvRmxhZ3MgMzMgL0ZvbnRCQm94ClstNTU4IC0zNzUgNzE4IDEw
//   NDFdIC9JdGFsaWNBbmdsZSAwIC9Bc2NlbnQgOTI4IC9EZXNjZW50IC0yMzYgL0NhcEhlaWdodCA3
//   MjkKL1N0ZW1WIDk5IC9YSGVpZ2h0IDU0NyAvU3RlbUggODMgL0F2Z1dpZHRoIDYwMiAvTWF4V2lk
//   dGggNjAyIC9Gb250RmlsZTIgMjAgMCBSCj4+CmVuZG9iagoyMCAwIG9iago8PCAvTGVuZ3RoMSA1
//   MjkyIC9MZW5ndGggMzc1MiAvRmlsdGVyIC9GbGF0ZURlY29kZSA+PgpzdHJlYW0KeAHdWItbVFeS
//   r3Prnm4e3XAbunkINP2gEQUEQTQ4MTYIGGJ0fCWhk5j4aBUTFcdHorIoxqACKuOq3eK4YyZjdCQZ
//   t8OaTAfUYSca3xONkkmijuPGxFGJOgY0S+C4dbsx3yTft3/A7r3UOVV1zq1T9avzahYvXDITdFAN
//   CM4Z86YtgMCj+46qjBmvLLYE5ZClAFLOrAWz5wXlsHdITp49d9msoKx/FECrlM+c5g7K0EP10HJS
//   BGU2hOqU8nmLyY766E5RkTG3YkZfuz6F5Lh505b2jQ8XSbbMnzZvJtX0GF+nIm1BxaLFARGMT1L9
//   yIKFM/v6szIaPznY9k8lIz4csik29ZFAgUaIAuDP9PVV2yVt+uu6ZuOLkY92QXJIoOORxfG5KnPx
//   idg739f2Mn4o5CkSg41qA32nnSeSAOSz39c+iOaHVM2PnnA/hKR/IFUzU/OWKbwgkZnAA0hlNcjM
//   CIL46EAZRQ4hMwR4JVBGwnbSRAR4ffPN0bzAwfRQRTodOKgMhxwqwwL2QgO9QiCCNNoArwn04QFe
//   DugxoJECGuZ0CRQCe6uwR+D3Artz8L9b8bsqvH9vPb8v8H6bfK/Lxe+tx3vVcldnKu9yYZdT7kzF
//   b+9m8W+78W4W/kPgHYG3c/CWEb/xYAe52CGww//grPOBfHM03rju5jc8eN2Nfxd47esEfk3g1wn4
//   lcCrL+OXAv+rFa/8LZ5f6ca/xeNlD/5V4CWBFy+Y+EWBF0z4hQc//8zEPxf42YZw/pkJ/1KFnw7H
//   dhLah+N5gec+CePnBH4ShmcFnhH4cZ2Bf5yIf47B0wJPefBkvYOfFHhC4PEqPCbwqMCPBB7ZrueH
//   BX4o8E8C/1NgG9lrM+IfdXjoYCs/JPDggSn8YCserJYPtDr4gSl4wCm3OrBF4Ace9DcU8D8IfJ+q
//   97vxPbK1X+B/uLHZje9GoC8K/13gPuHsxd8LfEfg21HYJHDv7yL43hz8XQTu2W3ge9JwtwHf2pXJ
//   36rCXZn4W4FvCvyNwDd2xvM33Ljz1wrfGY+/VvDfwnCHwF/RIL8SuF2PjdsG8UaB2wahl8b3etCz
//   tZV7BG6lubW1FbdWy1t+6eBbpuAWp7xZ4L8K3ETyplb8pQMbCIyGAtxI0W404oZwXE+K9W6sJ9Dq
//   HVhnwFqB6wSuFbimxsDXCKwx4OsCVwt8zVDIX5uEqwRWL8WVK6r4SoErqrDKjP8isDIClwt8VeAr
//   Apcs1vElkbjEz8D5hbxYh4vb5EVRuMgpLxT4C4ELBFbMn8QrPDh/XhqfPwnnpeFcgS/n4EsC5+Rg
//   eTfObsVZAmcKdAucMd3MZwicDgqfbsZpAqcKfFHgC8+G8xcicIobnz+Gz5HwnBGfDUea0WVGfEbg
//   0wKfSojnT+XgZIGTBE4UOKEKxwv8uRHHCRzLMvlYgU+24pg0fKI0jj8xDEtHRfHSOHy8OI4/LnA0
//   SaPdWEJSSSsWx2ERKYqG4ahCAx8VhaP8ktMZKhcWRPJCAxb6JSCpwBnBCyKxwM/aSHKO1HFnBDr9
//   rJqkkbpQPlKHI/3M6XTLjwkcQS6M6MZHBf4sDYcLzCeA8934yOB+/JExOEzg0EwjHyowbwwOye7H
//   h4zBXKpyBeZQxxyBg6l5cD/M7odZxGXF4aDQGD6oFTMzonmmETP9kjpshmLgGdGYobrrkdMHOni6
//   wIHUc6ADB0jD+QCBaQL7C0yNREdMIXcUY0ok2gXaIiO5TaDVksmtVWjJxOQxaKaRzQKTBCYStokC
//   EygrCfHYT2C8wDiBsWQhtgRjTJk8phBNRoWbMtGoYDT1izZiFH0fJdBAkRsKUaERFAMqQewiI3Q8
//   MhIjg9hF6MN4hA4jgtjpCTt9GOoJu/2yLhR16twaJocLDKNIwgSGxmCIglqBGjKtEciNiBQcdqNE
//   Cmk4MnKAZSIoyPzMXbOBpf//eeD/eCh0dPrhZICa2Caq1XuEH9ZKK+mUfvj64UPqIwX6+dlJVsta
//   iN9Nd4uTsBrusjA8yoYRd4i+LZOtpG2AHYGvG/AaLMEDcA6OwwXirrF8pG/ZObCyyzRO7Q9jSHiI
//   pA+prMRDWMaS2TzYxfaRxUrwswpYKVEtTSTLp+WzpD0Na+ndDLuggng1gtXk/yXYD/XQCduk6/As
//   8S1whPwRdPwGYmHtcI8sNUkjpFnU7whZ2w7b2Wpoh0Uy0FEu4Apvl9LJ6n6KAGA67ODtfJuKB9Xt
//   /A61ACRp/Bqj1k5RqNjtZgfYYGkcnKPvK2EyPo+/wAusRrbLr+J1aJAAp8JL8DFv1xihQWuHBs0s
//   tkyeGngryVql9Ko8lTXBdbI5Hb8j2Uqe7QhEDLBfmsjH8XEU8yzS7QiUDcFSo8Bp7CbcN0mCPS6X
//   4EiKp1J+ErbBm2S3PyEDUIF5NHoFVPINwRea6M3kG9BDiAbQYLnSCNghzWL15O09QrMCi2AYjZHE
//   b0EN209+g7YKFvF2uv8BDAT4g1bDZVrekGFRfJKj1O1zTiizHHNZMzN+IloUrcUH4336ZRb/gwfj
//   y+QE7vLxRB86Qnyyw37lf2u8kpkxZnyZxc9ii4v6zBZPLSLlpDIagf5UNQ1XTLqgotTHHfRXOtVn
//   mVFuqVPq7MPrlJnDM+n+lzGGivFl7zK20eVnD2r8UJT0Ad0i8cUXqDk0w2IpnlPkY1NJCMsgxUAr
//   ceEZlhJys2Rimd1lqbPUlbrrLCWW8mlu8jtQU8PMOlcWRTCpbA6Vk8usPqcr4Qd2psuljq5T7dAn
//   1L3ORRZe6rNAdUCV1Uud9BljLD5MHV82ocxXXZTgcxa5EqxWS7GvbXyZr60owepyUa+IHzwlj6vm
//   xPX5HEk+RwykdiVohSByJvjAVVen2pxUZrf6quvqEuoojj7ZD20/UTD4qcLZp/CDaoOQKKbzYDwZ
//   o8puTVAVdqvdSn66imhsg5qaYvLU6sqk2ziUE9UQnSHaRlRLNIuogUjV1xOtJlpJc5T13dp1oAEz
//   ydkQRhpaOCADJ52WchVKOvVJhVNwj41j+1iHNFzySIdxEK6jvuXCI5fzXfSNFpIPBO72ABpmfJ+F
//   8NWSDFmHz3cMBuV8x/mO7GiD1eCwGqzlMvQswoSer4RHG/Hd3YWaAeoICDUPvpSf5DfpF0s0JMBl
//   9ReEHxKz/JBEhBeJV2iWnCFSZeIjLxZwuAGR0E0kTSlIgHhiBhDlE5USuYjmEC0jqiVqJNpL9AHR
//   caLPifRTWsBAgaIhKp9sk93Yi2QqBmIp6lgYSlRC9DTRLKJXiNYQeYh2E71P9BHRp0T6KeTQV8R0
//   EUlkN77PLu2IKsrh6S0UqZHq7MEsJ8qgSHabZFCiookf0p/FRJNkjGWpUvntrq7btzs7b2+sN4qU
//   Mes31EezTwgbsVy8Ru9ytoatoHdN9zY2iA19q6Y39i35mPhEnNhQKV2roSyeod9mJfwMZc+u4thC
//   6WE0LO2cPKslkNdwAjeEgoUz2YMpKzzPkWuwmqwsgg0X69grJ9jQnmN75fL3/tTc/fle8prR/gay
//   nfbiRJjgHACJDq7hcfH9MDbBodHwQsWwR+81emTw0u/MMImFmWNtCqYkKT2Hezra2gjcwZDVkdPZ
//   0Xkqm+asVuHfGGLz1So2x2Vz0NB5Q2HYYyxvSKrdptHmPcZyc2STUaONYGyJtK9nSSuLy3OXbK5+
//   7tiC2UenXWDhLvcj7U1NTUfYoMeWe39etbFw1KnBOdcPTm1bXPC16m8tzadh5G8ajCZ/o72msPrQ
//   3XqvJrnesjvRa/doGk17B8REAxrjzamKGW3JxtDkAeQvOXy+g5yjidtxlRzuUG7du6Xcys9mZmYy
//   ynZbav88M7k3lHxNZ3lB5kdOY8jmHeJm1+xPZ8/6aPru5uZt27fX79i0xnWofNnB0i8Yr8Xk/ke3
//   /vlmasrxvCGeDa817l4+b1FlWlqLxXLhvUr1sKO1RXcCuYJ2fwn0UOhMZnrUA6K+EDBc6+UM14Uy
//   XRiYQ2RNpC4lQunpOf9oR45BhfmqykXlB3GWjxPIx122UGbFXEOuyW6wG6x50mUxgP3FeuPo0eO9
//   a3lSz0083ZO7S+xg7j+q2DUQdpk0dhKMcNpkbVI/r9ZQr2w0evWSF9bpG7VNZjRDrJmF2UBJNqtJ
//   PkwwEWJXCbEAXuIweRBNeTWoqQSTEX4EnIrXx1Jn7+H0ZzL+zhTx5f1Xj4x7vmXanvda90zYXsLb
//   m8QmJVLcutEh7lgsp3MG+958o9nhIDSC+8QdiIMU8s6uTY73hiV7lbC3ZTpKN8reGI/S6LCZIVVv
//   02oSWXSyQ+np6Oi5qm5EwXR+pVA6DZRP0yCmrkDVwSiTUbJbaDWCNSeG2TQmY0wwsXh55MaxbR9l
//   N83/7JvOS6LnLrMz4xNbxKVVW7asWrNuHd/f4ugvLotr7pfF/W/vintsCdvElrMNyb1zW3btann3
//   9/t8gfVTT/kcRphqIM8Zzx0SSuiQuVzICVHkyGRmg2Qt+XrYkK9msbPj4UJRV4nLRljS0NZ6fKf3
//   xjkppDePtz/dvYqnq3vnasrXOJrr4WCHLBjldMTpwNtf4zVneqM85sb+e7PjdCkDzaYUc2So2ZRg
//   Q3OkNTmb0tYRyJuKxsPprmKTT9j8EwSOQbQsh+bmxKjrsW8NpJAm+iFGlEypfO3mrTXrNm8VJ1Zt
//   unvm7N1Nqzw7hbh6VTzYObZ62fLqlZXLqqUj3rq6Ru/62m2TrftXNp8927xyv9V6bOeJq18ef+M4
//   m750xYqly6tXBef/SoqpJBBTCvzMaYvWgDfmbUVfr9uoeG0ab6LH1uiI1iBLtoWadanxapqvdlCm
//   g2kOzMGuQJYDC5VcpJRiYOFGGSLUvOcNicq10C4MVluqNHnV5s2UzrVX1GwfyVKz/e1fmXxXXBI3
//   S7dInoep7K2ldDMri3e/zMI6/8FCRZ2oEGvFIvr3m6Q6DvBgBd2C1VX00yecFNG0/5sCp0scHQ/9
//   6KRLDPSN6uuvUS97BepTlD525vy5FZkTZ85eMnfaQoD/AX/hl+YKZW5kc3RyZWFtCmVuZG9iagoy
//   MSAwIG9iago8PCAvVGl0bGUgKHVudGl0bGVkIHRleHQgMTcpIC9Qcm9kdWNlciAobWFjT1MgVmVy
//   c2lvbiAxMi4zIFwoQnVpbGQgMjFFMjMwXCkgUXVhcnR6IFBERkNvbnRleHQpCi9BdXRob3IgKFJp
//   b3QpIC9DcmVhdG9yIChCQkVkaXQpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyMjA3MDkyMjA4NDhaMDAn
//   MDAnKSAvTW9kRGF0ZQooRDoyMDIyMDcwOTIyMDg0OFowMCcwMCcpID4+CmVuZG9iagp4cmVmCjAg
//   MjIKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAyMTQ2IDAwMDAwIG4gCjAwMDAwMDg3ODMgMDAw
//   MDAgbiAKMDAwMDAwMDAyMiAwMDAwMCBuIAowMDAwMDAyMjUwIDAwMDAwIG4gCjAwMDAwMDU5OTgg
//   MDAwMDAgbiAKMDAwMDAwODkzMCAwMDAwMCBuIAowMDAwMDEzMTU2IDAwMDAwIG4gCjAwMDAwMDg3
//   NDcgMDAwMDAgbiAKMDAwMDAyMjI1NSAwMDAwMCBuIAowMDAwMDAyNDIxIDAwMDAwIG4gCjAwMDAw
//   MDI0NjYgMDAwMDAgbiAKMDAwMDAwMjUxMSAwMDAwMCBuIAowMDAwMDA2MDM0IDAwMDAwIG4gCjAw
//   MDAwMDg4NjYgMDAwMDAgbiAKMDAwMDAwOTMxMCAwMDAwMCBuIAowMDAwMDA5NTYxIDAwMDAwIG4g
//   CjAwMDAwMTM3NjcgMDAwMDAgbiAKMDAwMDAxNDAxOSAwMDAwMCBuIAowMDAwMDIyNDY5IDAwMDAw
//   IG4gCjAwMDAwMjI3MjEgMDAwMDAgbiAKMDAwMDAyNjU2MSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9T
//   aXplIDIyIC9Sb290IDE0IDAgUiAvSW5mbyAyMSAwIFIgL0lEIFsgPGQwMmQ3NmZiNzBkNzNhMjI0
//   NTQ1YWQxOTFiMTg3MThlPgo8ZDAyZDc2ZmI3MGQ3M2EyMjQ1NDVhZDE5MWIxODcxOGU+IF0gPj4K
//   c3RhcnR4cmVmCjI2NzgzCiUlRU9GCg==`;

app.post(`/${fileAPIPrefix}`, async (req, res) => {
  let fileName = req.body.name;

  let pdfBase64Txt = req.body.content;

  try {
    let result = await pool.query("INSERT INTO files (name, content) values ($1 , $2) returning id"
    ,[fileName, Buffer.from(Base64.toUint8Array(pdfBase64Txt))]);
    res.status(200).send({id: result.rows[0].id})
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
