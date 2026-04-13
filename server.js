const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const rootDir = __dirname;
const staticDir = path.join(rootDir, 'static');

app.disable('x-powered-by');

app.use('/static', express.static(staticDir, {
  maxAge: '7d',
  etag: true
}));

app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(staticDir, 'favicon.ico'));
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});