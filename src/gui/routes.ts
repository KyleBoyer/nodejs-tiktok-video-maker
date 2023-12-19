import express from 'express';
import { create } from 'express-handlebars';
import { join } from 'path';
export const app = express();
const hbs = create({
  extname: '.hbs',
  helpers: {
    now() {
      return Date.now();
    },
  },
});
// TODO: Add GUI routes
app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', join(__dirname, 'views'));

app.all(['/', '/index.html', 'index.htm'], (_req, res) => {
  res.render('index.hbs', {
    server_text: 'Hello from SS!',
  });
});
