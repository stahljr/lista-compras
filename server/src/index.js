import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { attachUser, requireAuth, purgeExpiredSessions } from './auth.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { listsRouter } from './routes/lists.js';
import { tripsRouter } from './routes/trips.js';
import { backupRouter } from './routes/backup.js';
import { householdsRouter } from './routes/households.js';
import { subscribe } from './realtime.js';
import { startRefresher } from './refresher.js';
import { warmupOnBoot } from './warmup.js';
import { ensureClassifierFresh } from './catalog.js';
import { migrate } from './db.js';

// O banco vem antes de tudo: sem esquema no ar, nao ha login nem lista. Se o
// Postgres nao responder, e melhor o processo nao subir do que subir servindo
// erro em cada tela.
const banco = await migrate();

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
app.use('/api/households', householdsRouter);

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

await purgeExpiredSessions();
setInterval(() => void purgeExpiredSessions(), 6 * 3600 * 1000).unref();

// As regras de categoria mudam com o tempo; o catalogo ja gravado precisa
// acompanhar, senao "molho de tomate" fica no corredor do hortifruti para
// sempre.
const reclass = await ensureClassifierFresh();
if (reclass) console.log(`[categorias] ${reclass.mudados} de ${reclass.total} produtos reclassificados`);

startRefresher();
// Banco novo nasce sem catalogo, e prateleira vazia parece app quebrado.
warmupOnBoot();

app.listen(PORT, () => {
  console.log(`lista-compras: API em http://localhost:${PORT}`);
  console.log(
    banco === 'postgres'
      ? '[banco] Postgres externo (DATABASE_URL): as contas e as listas sobrevivem ao deploy'
      : '[banco] Postgres embutido em arquivo -- para valer, defina DATABASE_URL',
  );
  if (!fs.existsSync(webDist)) console.log('front nao compilado ainda (rode "npm run build" ou use "npm run dev")');
});
