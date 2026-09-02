import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { attachUser, requireAuth, purgeExpiredSessions } from './auth.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { listsRouter } from './routes/lists.js';
import { tripsRouter } from './routes/trips.js';
import { backupRouter } from './routes/backup.js';
import { subscribe } from './realtime.js';
import { startRefresher } from './refresher.js';
import { ensureClassifierFresh } from './catalog.js';
import './db.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.set('trust proxy', 1);
// Um pedido normal e pequeno; so a restauracao do backup traz a casa inteira
// de uma vez, e por isso tem um limite proprio.
const corpoJson = express.json({ limit: '256kb' });
const corpoGrande = express.json({ limit: '8mb' });
app.use((req, res, next) => (req.path === '/api/backup/restore' ? corpoGrande : corpoJson)(req, res, next));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/lists', listsRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/backup', backupRouter);

/** Canal de sync: o outro celular avisa quando mexe no carrinho ou na compra. */
app.get('/api/events', requireAuth, (req, res) => subscribe(req, res, req.user.householdId));

// Front compilado. Em desenvolvimento o Vite serve o front e faz proxy da API.
const webDist = path.resolve(process.cwd(), 'web/dist');
if (fs.existsSync(webDist)) {
  app.use(
    express.static(webDist, {
      setHeaders(res, filePath) {
        // O shell do PWA precisa ser revalidado para a atualizacao chegar.
        if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[erro]', err);
  res.status(status).json({ error: err.message || 'erro interno' });
});

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 3600 * 1000).unref();

// As regras de categoria mudam com o tempo; o catalogo ja gravado precisa
// acompanhar, senao "molho de tomate" fica no corredor do hortifruti para
// sempre.
const reclass = ensureClassifierFresh();
if (reclass) console.log(`[categorias] ${reclass.mudados} de ${reclass.total} produtos reclassificados`);

startRefresher();

app.listen(PORT, () => {
  console.log(`lista-compras: API em http://localhost:${PORT}`);
  if (!fs.existsSync(webDist)) console.log('front nao compilado ainda (rode "npm run build" ou use "npm run dev")');
});
