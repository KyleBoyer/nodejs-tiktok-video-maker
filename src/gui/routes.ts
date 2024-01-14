import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { fileSync } from 'tmp';

import express from 'express';
import { create } from 'express-handlebars';
import { basename, join, parse } from 'path';
import { existsAndHasContent, listFiles } from '../utils/fs';
import { fontsDir, outputDir } from '../utils/dirs';
import { voices } from '../utils/tts';
import { validateConfig } from '../utils/config';
import * as pty from 'node-pty';
import axios from 'axios';
import { GoogleTranslateTTS } from '../utils/tts/google-translate';
import { TikTokTTS } from '../utils/tts/tiktok';
import { object, number, string } from 'yup';
import { ImageGenerator } from '../utils/image';

import fontList from 'font-list';

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
  app.get('/download/:filename', (req, res) => {
    const desiredFile = join(outputDir, req.params.filename);
    if (existsAndHasContent(desiredFile)) {
      res.status(200).download(desiredFile);
    } else {
      return res.status(404).end();
    }
  });
  app.use('/view', express.static(outputDir));
  app.get('/js/xterm.addon-fit.js', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/addon-fit/lib/addon-fit.js')));
  app.get('/js/xterm.addon-web-links.js', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/addon-web-links/lib/addon-web-links.js')));
  app.get('/js/xterm.js', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/xterm/lib/xterm.js')));
  app.get('/css/xterm.css', (_req, res) => res.sendFile(join(__dirname, '../../node_modules/@xterm/xterm/css/xterm.css')));
  app.get('/js/flat.js', (_req, res) => {
    const path = join(__dirname, '../../node_modules/flat/index.js');
    const contents = readFileSync(path);
    const updatedContents = contents.toString().split(/export /g).join('');
    res.end(updatedContents);
  });

  app.all(['/', '/index.html', 'index.htm'], async (_req, res) => {
    const { flatten } = await flattenPromise;
    const customFonts =
      listFiles(fontsDir)
          .filter((f)=>f.toLowerCase().endsWith('.ttf'))
          .map((ttfFile) => parse(ttfFile).name);
    const systemFonts = await fontList.getFonts({ disableQuoting: true });
    res.render('index.hbs', {
      fonts: [...systemFonts, ...customFonts],
      voices,
      config: flatten(config, { safe: true }),
    });
  });
  const processes: { [key: string]: pty.IPty } = {};
  app.get('/cancel', async (req, res) => {
    const requestId = req.query.id?.toString();
    if (!requestId || !processes[requestId]) {
      res.status(400);
    } else {
      processes[requestId].kill('SIGINT');
      res.status(200).end();
    }
  });
  app.post('/generate', express.json(), async (req, res) => {
    let useConfig;
    try {
      useConfig = validateConfig(req.body);
    } catch (err) {
      res.status(400).json(err.errors);
    }
    if (useConfig) {
      const requestId = Date.now().toString();
      res.setHeader('id', requestId);
      res.status(200);
      const heartbeatInterval = setInterval(() => {
        res.write('heartbeat');
      }, 1000);
      const writeConfigFile = fileSync().name;
      writeFileSync(writeConfigFile, JSON.stringify(useConfig));
      const cmd = process.argv[0];
      const args = [process.argv[1], 'generate', '-c', writeConfigFile];
      res.write(`$ ${cmd} ${args.join(' ')}\r\n`);
      processes[requestId] = pty.spawn(cmd, args, {
        rows: req.query.rows ? +req.query.rows : undefined,
        cols: req.query.cols ? +req.query.cols : undefined,
        encoding: null,
      });
      let lastData: string | Buffer;
      processes[requestId].onData((data) => {
        // process.stdout.write(data);
        res.write(data);
        lastData = data;
      });
      processes[requestId].onExit((e) => {
        clearInterval(heartbeatInterval);
        if (e.exitCode !== 0 || e.signal !== 0) {
          console.log('Exit info:', e);
        }
        if (lastData && lastData.toString().includes('output to: ')) {
          const finalFile = Buffer.from(lastData).toString().split('output to: ').pop().trim();
          res.write(`Click here to view:///${basename(finalFile)}`);
          res.write(`\r\nClick here to download:///${basename(finalFile)}`);
        }
        res.end();
        unlinkSync(writeConfigFile);
      });
    }
  });
  app.get('/reddit', (req, res)=>{
    if (!req.query.post_id) {
      return res.status(400).end();
    }
    axios(`https://reddit.com/${req.query.post_id}`).then((redditRes) => {
      res.status(200).json({url: redditRes.request.res.responseUrl}).end();
    }).catch((err)=>{
      console.error(err);
      res.status(500).end();
    });
  });
  app.post('/caption-sample', express.json(), (req, res) => {
    const sampleSchema = object({
      video: object({
        width: number(),
        height: number(),
      }),
      captions: object({
        padding: object({
          height: number().default(200),
          between_lines: number().default(10),
          width: number().default(200),
        }),
        background: string().default('rgba(0, 0, 0, 0)'),
        color: string().default('white'),
        stroke_color: string().default('black'),
        stroke_width: number().default(5),
        font: string().default('Roboto-Regular'),
        font_size: number().default(50),
      }),
    });
    let sampleConfig;
    try {
      sampleConfig = sampleSchema.validateSync(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
    } catch (err) {
      res.status(400);
      if (Array.isArray(err.errors) && err.errors.length > 0) {
        res.send(err.errors.join('\n'));
      }
      return res.end();
    }
    const service = new ImageGenerator(sampleConfig);
    const rendered = service.fromText('In a quaint village, an elderly woman found an ancient, glowing book in her attic.');
    return res.status(200).json({ src: `data:image/png;base64,${rendered.toString('base64')}` }).end();
  });
  app.get('/tts-sample/:type/:voice?.mp3', async (req, res) => {
    if (!req.params.type) {
      return res.status(400).end();
    }
    const sampleConfig = {
      audio: {
        bitrate: req.query.bitrate ? +req.query.bitrate : 256,
      },
      tts: {
        demux_concat: req.query.demux_concat ? (req.query.demux_concat.toString().toLowerCase() == 'true') : true,
      },
    };
    if (req.params.type == 'google-translate') {
      const service = new GoogleTranslateTTS(sampleConfig);
      // eslint-disable-next-line max-len
      const textToSpeak = 'In a quaint village, an elderly woman found an ancient, glowing book in her attic. Upon opening it, whimsical creatures of light emerged, bringing magic back to the village.';
      const file = await service.generate(textToSpeak, null);
      return res.status(200).end(file);
    } else if (req.params.type == 'tiktok') {
      const service = new TikTokTTS({
        ...sampleConfig,
        tts: {
          ...sampleConfig.tts,
          voice: req.params.voice,
          tiktok_session_id: req.query.tiktok_session_id ? req.query.tiktok_session_id.toString() : undefined,
        },
      });
      const textToSpeak = 'In a quaint village, an elderly woman found an ancient, glowing book in her attic. Upon opening it, whimsical creatures of light emerged, bringing magic back to the village.';
      const file = await service.generate(textToSpeak, null);
      return res.status(200).end(file);
    }
  });
  return app;
}
