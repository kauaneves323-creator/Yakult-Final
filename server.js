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

// Endpoint seguro — credenciais vêm de variáveis de ambiente, nunca do código
app.get('/config', (_req, res) => {
  const url = process.env.SUPA_URL;
  const key = process.env.SUPA_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
  }
  res.json({ supaUrl: url, supaKey: key });
});

// Serve o Service Worker na raiz com headers corretos
app.get('/sw.js', (_req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(rootDir, 'sw.js'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
