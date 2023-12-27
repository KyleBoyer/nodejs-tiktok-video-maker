import express from 'express';
import { create } from 'express-handlebars';
import { join, parse } from 'path';
import { listFiles } from '../utils/fs';
import { fontsDir } from '../utils/dirs';
import { voices } from '../utils/tts';

const dynamicImport = new Function('specifier', 'return import(specifier)');
const flattenPromise = dynamicImport('flat');

export function getRoutes(config = {}) {
  const app = express();
  const hbs = create({
    extname: '.hbs',
    helpers: {
      stringify: (obj: unknown) => JSON.stringify(obj),
      foreach(iterableObj: Array<unknown>, block: { fn: CallableFunction }) {
        let accum = '';
        for (const item of iterableObj) {
          accum += block.fn(item);
        }
        return accum;
      },
    },
  });
  // TODO: Add GUI routes
  app.engine('.hbs', hbs.engine);
  app.set('view engine', '.hbs');
  app.set('views', join(__dirname, 'views'));

  app.use(express.static(join(__dirname, 'public')));
  app.use('/fonts', express.static(fontsDir));

  app.all(['/', '/index.html', 'index.htm'], async (_req, res) => {
    const { flatten } = await flattenPromise;
    const fonts =
      listFiles(fontsDir)
          .filter((f)=>f.toLowerCase().endsWith('.ttf'))
          .map((ttfFile) => parse(ttfFile).name);
    res.render('index.hbs', {
      fonts,
      voices,
      config: flatten(config, { safe: true }),
    });
  });
  return app;
}
