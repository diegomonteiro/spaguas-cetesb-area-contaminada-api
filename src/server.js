import express from 'express';
import session from 'express-session';
import { config } from './config.js';
import { rootDir } from './paths.js';
import { ensureStorage } from './storage.js';
import { initDatabase } from './database.js';
import { adminRouter } from './routes/admin.js';
import { apiRouter } from './routes/api.js';

await ensureStorage();
initDatabase();

const app = express();

app.disable('x-powered-by');

app.use(express.static(`${rootDir}/public`));

app.use(session({
  name: 'admin.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.get('/api-docs', (req, res) => {
  res.redirect('/swagger.html');
});

app.get('/docs', (req, res) => {
  res.redirect('/swagger.html');
});

app.use('/admin', adminRouter);
app.use('/api', apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota nao encontrada.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(config.port, () => {
  console.log(`Servidor iniciado em http://localhost:${config.port}`);
});
