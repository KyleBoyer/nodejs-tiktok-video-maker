import { getRoutes } from './routes';

import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { createServer as createNetServer } from 'net';
import selfsigned from 'selfsigned';

const dynamicImport = new Function('specifier', 'return import(specifier)');
const getPortPromise = dynamicImport('get-port');

const ignoredErrorCodes = ['ECONNABORTED', 'ECONNRESET', 'EPIPE'];

function ignoreECONNRESET(err: { code?: string }) {
  if (!ignoredErrorCodes.includes(err.code)) {
    throw err;
  }
}

export async function startServer(port: number, ssl: boolean, httpsRedirect: boolean, sslKey: string, sslCert: string, config: unknown) {
  const app = getRoutes(config);
  // @ts-ignore-next-line
  app.on('error', ignoreECONNRESET);
  if (ssl) {
    let useSSLKey = sslKey;
    let useSSLCert = sslCert;
    if (!sslKey || !sslCert) {
      const selfSignedResult = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
        keySize: 4096,
        algorithm: 'sha256',
      });
      useSSLKey = selfSignedResult.private;
      useSSLCert = selfSignedResult.cert + selfSignedResult.public;
    }
    const httpsServer = createHttpsServer({
      key: useSSLKey,
      cert: useSSLCert,
    }, app);
    httpsServer.on('clientError', ignoreECONNRESET);
    if (httpsRedirect) {
      const { default: getPort } = await getPortPromise;
      const httpsPort = await getPort();
      await new Promise<void>((resolve) => httpsServer.listen(httpsPort, '0.0.0.0', () => resolve()));
      const httpServer = createHttpServer((req, res) => {
        const host = req.headers.host;
        res.writeHead(301, { 'Location': `https://${host}${req.url}` });
        res.end();
      });
      httpServer.on('clientError', ignoreECONNRESET);
      const httpPort = await getPort();
      await new Promise<void>((resolve) => httpServer.listen(httpPort, '0.0.0.0', () => resolve()));
      const netServer = createNetServer((socket) => {
        socket.on('error', ignoreECONNRESET);
        socket.once('data', (data) => {
          socket.pause();
          socket.unshift(data);
          // A TLS handshake record starts with byte 22.
          const isTLS = (data[0] === 22);
          const serverToUse = isTLS ? httpsServer : httpServer;
          serverToUse.emit('connection', socket);
          process.nextTick(() => socket.resume());
        });
      });
      netServer.on('error', ignoreECONNRESET);
      await new Promise<void>((resolve) => netServer.listen(port, '0.0.0.0', () => resolve()));
    } else {
      await new Promise<void>((resolve) => httpsServer.listen(port, '0.0.0.0', () => resolve()));
    }
    console.log(`🚀 Secure server started on port ${port}!`);
  } else {
    await new Promise<void>((resolve) => app.listen(port, '0.0.0.0', () => resolve()));
    console.log(`🚀 Server started on port ${port}!`);
  }
}
