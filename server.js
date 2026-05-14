const express = require('express');
const path    = require('path');
const crypto  = require('crypto');

const app       = express();
const PORT      = Number(process.env.PORT) || 10000;
const rootDir   = __dirname;
const staticDir = path.join(rootDir, 'static');

// ── Variáveis de ambiente ──────────────────────────────────────
// No Render: Settings → Environment Variables
//   SUPA_URL          = https://xxxx.supabase.co
//   SUPA_KEY          = eyJ... (anon key — pode ficar aqui também)
//   SUPA_SERVICE_KEY  = eyJ... (service role key — NUNCA no front-end)
const SUPA_URL         = process.env.SUPA_URL;
const SUPA_KEY         = process.env.SUPA_KEY;
const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;

// ── Helpers de hash (idênticos ao front-end) ───────────────────

// Hash moderno: PBKDF2-SHA256, salt = "yakult:<nick>"
function hashPasswordAsync(password, nick) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from('yakult:' + nick, 'utf8');
    crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, key) => {
      if (err) return reject(err);
      resolve('pbkdf2:' + key.toString('hex'));
    });
  });
}

// Hash intermediário (sha1fb) — usado como fallback sem crypto.subtle
function sha1fbHash(password, nick) {
  const salted = 'yakult:' + nick + ':' + password;
  return 'sha1fb:' + Buffer.from(salted, 'utf8').toString('base64');
}

// Hash legado (base64 simples) — só para migração de contas antigas
function legacyHash(pass) {
  return Buffer.from(pass, 'utf8').toString('base64');
}

// Compara o password enviado contra o hash armazenado
async function checkPassword(password, nick, storedHash) {
  if (storedHash.startsWith('pbkdf2:')) {
    const computed = await hashPasswordAsync(password, nick);
    return computed === storedHash;
  }
  if (storedHash.startsWith('sha1fb:')) {
    return sha1fbHash(password, nick) === storedHash;
  }
  // legado
  return legacyHash(password) === storedHash;
}

// Consulta ao Supabase usando a service role key (nunca exposta ao browser)
async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey':        SUPA_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

// ── Middlewares ────────────────────────────────────────────────
app.disable('x-powered-by');
app.use(express.json());

app.use('/static', express.static(staticDir, { maxAge: '7d', etag: true }));

// ── Rotas estáticas ────────────────────────────────────────────
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(staticDir, 'favicon.ico'));
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Envia só a anon key ao front-end (a service key NUNCA vai aqui)
app.get('/config', (_req, res) => {
  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
  }
  res.json({ supaUrl: SUPA_URL, supaKey: SUPA_KEY });
});

app.get('/sw.js', (_req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(rootDir, 'sw.js'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

// ── POST /register ─────────────────────────────────────────────
// Cria uma conta nova. O hash é calculado aqui no servidor.
app.post('/register', async (req, res) => {
  if (!SUPA_SERVICE_KEY) {
    return res.status(500).json({ error: 'Servidor não configurado (SUPA_SERVICE_KEY ausente)' });
  }

  const nick = (req.body.nick || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const pass = req.body.password || '';

  if (nick.length < 3) return res.status(400).json({ error: 'Nickname deve ter ao menos 3 caracteres' });
  if (pass.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });

  try {
    // Verifica se o nick já existe
    const { status: s, data: existing } = await supaFetch(
      `/users?nick=eq.${encodeURIComponent(nick)}&select=nick&limit=1`
    );
    if (s !== 200) return res.status(500).json({ error: 'Erro ao consultar banco' });
    if (existing && existing.length > 0) return res.status(409).json({ error: 'Nickname já existe!' });

    // Cria o hash e insere
    const hash = await hashPasswordAsync(pass, nick);
    const { status: ins, data: inserted } = await supaFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        nick,
        password_hash: hash,
        display_name: nick,
        bio: '',
        photo: null
      })
    });

    if (ins !== 201) {
      const msg = inserted?.message || inserted?.error || 'Erro ao criar conta';
      return res.status(500).json({ error: msg });
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ── POST /login ────────────────────────────────────────────────
// Autentica o usuário. Retorna os dados sem o password_hash.
app.post('/login', async (req, res) => {
  if (!SUPA_SERVICE_KEY) {
    return res.status(500).json({ error: 'Servidor não configurado (SUPA_SERVICE_KEY ausente)' });
  }

  const nick = (req.body.nick || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const pass = req.body.password || '';

  if (!nick) return res.status(400).json({ error: 'Digite seu nickname' });
  if (!pass) return res.status(400).json({ error: 'Digite sua senha' });

  try {
    const { status, data } = await supaFetch(
      `/users?nick=eq.${encodeURIComponent(nick)}&limit=1`
    );

    if (status !== 200 || !data || data.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = data[0];
    const storedHash = user.password_hash || '';
    const ok = await checkPassword(pass, nick, storedHash);

    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });

    // Migra hash legado para PBKDF2 automaticamente
    if (!storedHash.startsWith('pbkdf2:')) {
      const newHash = await hashPasswordAsync(pass, nick);
      await supaFetch(`/users?nick=eq.${encodeURIComponent(nick)}`, {
        method: 'PATCH',
        body: JSON.stringify({ password_hash: newHash })
      });
      user.password_hash = newHash;
    }

    // Gera token de sessão e salva no banco
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await supaFetch(`/users?nick=eq.${encodeURIComponent(nick)}`, {
      method: 'PATCH',
      body: JSON.stringify({ session_token: sessionToken })
    });

    // Remove o hash antes de enviar ao browser
    delete user.password_hash;

    return res.status(200).json({ ok: true, user, sessionToken });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ── POST /verify-session ───────────────────────────────────────
// Valida o token de sessão salvo no cookie (auto-login).
app.post('/verify-session', async (req, res) => {
  if (!SUPA_SERVICE_KEY) {
    return res.status(500).json({ error: 'Servidor não configurado' });
  }

  const nick  = (req.body.nick         || '').trim().toLowerCase();
  const token = (req.body.sessionToken || '').trim();
  if (!nick || !token) return res.status(400).json({ error: 'Dados inválidos' });

  try {
    const { status, data } = await supaFetch(
      `/users?nick=eq.${encodeURIComponent(nick)}&session_token=eq.${encodeURIComponent(token)}&limit=1`
    );

    if (status !== 200 || !data || data.length === 0) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    const user = data[0];
    delete user.password_hash;
    delete user.session_token;

    return res.status(200).json({ ok: true, user });
  } catch (err) {
    console.error('[verify-session]', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

// ── Helper: verificar se requisitante é admin ──────────────────
async function isAdmin(nick, token) {
  if (!nick || !token) return false;
  const { status, data } = await supaFetch(
    `/users?nick=eq.${encodeURIComponent(nick)}&session_token=eq.${encodeURIComponent(token)}&select=nick,is_admin&limit=1`
  );
  if (status !== 200 || !data || !data.length) return false;
  return data[0].is_admin === true || nick === 'apexzinn';
}

// ── POST /admin/rename-user ────────────────────────────────────
// Renomeia o display_name de um usuário (não o nick — nick é chave primária)
app.post('/admin/rename-user', async (req, res) => {
  const { adminNick, sessionToken, targetNick, newDisplayName } = req.body;
  if (!adminNick || !sessionToken || !targetNick || !newDisplayName)
    return res.status(400).json({ error: 'Dados incompletos' });

  if (!(await isAdmin(adminNick, sessionToken)))
    return res.status(403).json({ error: 'Acesso negado' });

  const name = newDisplayName.trim();
  if (!name || name.length < 2) return res.status(400).json({ error: 'Nome inválido' });

  const { status, data } = await supaFetch(`/users?nick=eq.${encodeURIComponent(targetNick)}`, {
    method: 'PATCH',
    body: JSON.stringify({ display_name: name })
  });
  if (status !== 200) return res.status(500).json({ error: 'Erro ao renomear' });
  return res.json({ ok: true });
});

// ── POST /admin/delete-user ────────────────────────────────────
app.post('/admin/delete-user', async (req, res) => {
  const { adminNick, sessionToken, targetNick } = req.body;
  if (!adminNick || !sessionToken || !targetNick)
    return res.status(400).json({ error: 'Dados incompletos' });

  if (!(await isAdmin(adminNick, sessionToken)))
    return res.status(403).json({ error: 'Acesso negado' });

  if (targetNick === adminNick)
    return res.status(400).json({ error: 'Não pode deletar a si mesmo' });

  // Apaga dados relacionados antes do usuário
  await supaFetch(`/posts?author_nick=eq.${encodeURIComponent(targetNick)}`, { method: 'DELETE' });
  await supaFetch(`/scraps?from_nick=eq.${encodeURIComponent(targetNick)}`, { method: 'DELETE' });
  await supaFetch(`/comments?nick=eq.${encodeURIComponent(targetNick)}`, { method: 'DELETE' });
  await supaFetch(`/dms?from_nick=eq.${encodeURIComponent(targetNick)}`, { method: 'DELETE' });
  await supaFetch(`/online?nick=eq.${encodeURIComponent(targetNick)}`, { method: 'DELETE' });

  const { status } = await supaFetch(`/users?nick=eq.${encodeURIComponent(targetNick)}`, { method: 'DELETE' });
  if (status !== 200 && status !== 204) return res.status(500).json({ error: 'Erro ao deletar usuário' });
  return res.json({ ok: true });
});

// ── POST /admin/set-admin ──────────────────────────────────────
app.post('/admin/set-admin', async (req, res) => {
  const { adminNick, sessionToken, targetNick, value } = req.body;
  if (!adminNick || !sessionToken || !targetNick)
    return res.status(400).json({ error: 'Dados incompletos' });

  if (!(await isAdmin(adminNick, sessionToken)))
    return res.status(403).json({ error: 'Acesso negado' });

  const { status } = await supaFetch(`/users?nick=eq.${encodeURIComponent(targetNick)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin: !!value })
  });
  if (status !== 200) return res.status(500).json({ error: 'Erro ao atualizar' });
  return res.json({ ok: true });
});

// ── GET /admin/users ───────────────────────────────────────────
app.get('/admin/users', async (req, res) => {
  const { nick, token } = req.query;
  if (!(await isAdmin(nick, token)))
    return res.status(403).json({ error: 'Acesso negado' });

  const { status, data } = await supaFetch('/users?select=nick,display_name,is_admin,created_at&order=created_at.desc&limit=200');
  if (status !== 200) return res.status(500).json({ error: 'Erro ao buscar usuários' });
  return res.json(data || []);
});

// ── Iniciar servidor ───────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
