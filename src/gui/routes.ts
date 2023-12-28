import { unlinkSync, writeFileSync } from 'fs';
import { fileSync } from 'tmp';

import express from 'express';
import { create } from 'express-handlebars';
import { basename, join, parse } from 'path';
import { listFiles } from '../utils/fs';
import { fontsDir, outputDir } from '../utils/dirs';
import { voices } from '../utils/tts';
import { validateConfig } from '../utils/config';
import * as pty from 'node-pty';
// import { generateVideo } from '../generator';

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
  app.use('/download', express.static(outputDir));
  app.get('/js/xterm.addon-fit.js', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/addon-fit/lib/addon-fit.js')));
  app.get('/js/xterm.addon-web-links.js', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/addon-web-links/lib/addon-web-links.js')));
  app.get('/js/xterm.js', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/xterm/lib/xterm.js')));
  app.get('/css/xterm.css', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/xterm/css/xterm.css')));

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

  app.post('/generate', express.json(), async (req, res) => {
    let useConfig;
    try {
      useConfig = validateConfig(req.body);
    } catch (err) {
      res.status(400).json(err.errors);
    }
    if (useConfig) {
      res.status(200);
      const writeConfigFile = fileSync().name;
      writeFileSync(writeConfigFile, JSON.stringify(useConfig));
      const cmd = process.argv[0];
      const args = [process.argv[1], 'generate', '-c', writeConfigFile];
      res.write(`$ ${cmd} ${args.join(' ')}\r\n`);
      const ptyProcess = pty.spawn(cmd, args, {
        rows: req.query.rows ? +req.query.rows : undefined,
        cols: req.query.cols ? +req.query.cols : undefined,
        encoding: null,
      });
      let lastData: string | Buffer;
      ptyProcess.onData((data) => {
        res.write(data);
        lastData = data;
      });
      ptyProcess.onExit(() => {
        const finalFile = Buffer.from(lastData).toString().split('output to: ').pop().trim();
        res.write(`Click here to download file:///${basename(finalFile)}`);
        res.end();
        unlinkSync(writeConfigFile);
      });
    }
  });
  return app;
}
