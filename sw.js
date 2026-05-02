// ══════════════════════════════════════════════════════════════════
// sw.js — Service Worker yakult.net.br
// Deve ficar em: https://yakult.net.br/sw.js
// ══════════════════════════════════════════════════════════════════

const SW_VERSION = 'yakult-sw-v3';

let swNick = null;
let supaUrl = null;
let supaKey = null;
let lastChecked = null;
let pollInterval = null;
const shownTags = new Set();

// ── Instalar / Ativar ──
self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ── Receber mensagens da página principal ──
self.addEventListener('message', e => {
  if(!e.data) return;

  if(e.data.type === 'INIT') {
    swNick      = e.data.nick;
    supaUrl     = e.data.supaUrl;
    supaKey     = e.data.supaKey;
    lastChecked = e.data.lastChecked || new Date().toISOString();
    iniciarPoll();
  }

  if(e.data.type === 'LOGOUT') {
    swNick = null;
    pararPoll();
  }

  if(e.data.type === 'UPDATE_CHECKED') {
    // Página avisou que já processou um evento — atualiza o cursor
    if(e.data.lastChecked) lastChecked = e.data.lastChecked;
  }
});

// ── Poll periódico ao Supabase ──
function iniciarPoll() {
  pararPoll();
  // Primeira verificação imediata
  doPoll();
  // Depois a cada 10 segundos
  pollInterval = setInterval(doPoll, 10000);
}

function pararPoll() {
  if(pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

async function doPoll() {
  if(!swNick || !supaUrl || !supaKey || !lastChecked) return;

  // Verificar se o app está visível — se sim, não duplicar notificação
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const appVisivel = clients.some(c => c.visibilityState === 'visible');

  const agora = new Date().toISOString();

  // 1. DMs não lidas
  try {
    const url = supaUrl + '/rest/v1/dms'
      + '?to_nick=eq.' + encodeURIComponent(swNick)
      + '&read=eq.false'
      + '&created_at=gt.' + encodeURIComponent(lastChecked)
      + '&select=from_nick,text,created_at'
      + '&order=created_at.asc'
      + '&limit=10';

    const res = await fetch(url, {
      headers: {
        'apikey': supaKey,
        'Authorization': 'Bearer ' + supaKey
      }
    });

    if(res.ok) {
      const dms = await res.json();
      if(Array.isArray(dms) && dms.length > 0) {
        // Agrupar por remetente
        const porNick = {};
        dms.forEach(d => {
          if(!porNick[d.from_nick]) porNick[d.from_nick] = [];
          porNick[d.from_nick].push(d);
        });

        for(const nick of Object.keys(porNick)) {
          const msgs = porNick[nick];
          const ultima = msgs[msgs.length - 1];
          const preview = ultima.text
            ? (ultima.text.length > 80 ? ultima.text.slice(0,77)+'...' : ultima.text)
            : '📎 Enviou uma mídia';

          const tag = 'dm-' + nick;

          // Só notifica se app não está visível OU se já passou 5s da última notif com essa tag
          if(!appVisivel || !shownTags.has(tag)) {
            shownTags.add(tag);
            setTimeout(() => shownTags.delete(tag), 15000);

            await self.registration.showNotification('💬 ' + nick + ' · yakult.net.br', {
              body: preview,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag,
              renotify: true,
              data: { type: 'dm', from: nick, url: self.location.origin },
              vibrate: [200, 100, 200],
            });
          }
        }
      }
    }
  } catch(err) {
    console.warn('[SW] erro ao buscar DMs:', err);
  }

  // 2. Chamadas de voz/vídeo (ring dos últimos 25s)
  try {
    const desde = new Date(Date.now() - 25000).toISOString();
    const url2 = supaUrl + '/rest/v1/call_signals'
      + '?to_nick=eq.' + encodeURIComponent(swNick)
      + '&type=eq.ring'
      + '&created_at=gt.' + encodeURIComponent(desde)
      + '&select=from_nick,payload,created_at'
      + '&order=created_at.desc'
      + '&limit=1';

    const res2 = await fetch(url2, {
      headers: {
        'apikey': supaKey,
        'Authorization': 'Bearer ' + supaKey
      }
    });

    if(res2.ok) {
      const rings = await res2.json();
      if(Array.isArray(rings) && rings.length > 0) {
        const ring = rings[0];
        const ringTime = new Date(ring.created_at).getTime();
        const lastTime = new Date(lastChecked).getTime();

        // Só notifica se o ring é posterior ao último check
        if(ringTime > lastTime) {
          let isVideo = false;
          try {
            const p = typeof ring.payload === 'string'
              ? JSON.parse(ring.payload)
              : ring.payload;
            isVideo = p && p.video === true;
          } catch(e) {}

          const tag = 'call-' + ring.from_nick;
          const titulo = (isVideo ? '📹 Chamada de vídeo' : '📞 Chamada de voz') + ' · yakult.net.br';

          if(!shownTags.has(tag)) {
            shownTags.add(tag);
            setTimeout(() => shownTags.delete(tag), 25000);

            await self.registration.showNotification(titulo, {
              body: ring.from_nick + ' está te ligando — toque para atender',
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag,
              renotify: true,
              requireInteraction: true,
              data: {
                type: isVideo ? 'video' : 'call',
                from: ring.from_nick,
                url: self.location.origin
              },
              vibrate: [400, 200, 400, 200, 400],
              actions: [
                { action: 'accept', title: '✅ Atender' },
                { action: 'reject', title: '❌ Recusar' }
              ]
            });
          }
        }
      }
    }
  } catch(err) {
    console.warn('[SW] erro ao buscar rings:', err);
  }

  lastChecked = agora;
}

// ── Clique na notificação ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const destUrl = data.url || 'https://yakult.net.br';
  const action = e.action;

  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Tentar focar uma aba já aberta do yakult.net.br
    const yakultClient = clients.find(c => c.url.includes('yakult.net.br'));

    if(yakultClient) {
      await yakultClient.focus();
      // Avisar a página qual ação tomar
      yakultClient.postMessage({
        type: 'NOTIF_CLICK',
        data,
        action
      });
    } else {
      // Abrir nova aba
      const newClient = await self.clients.openWindow(destUrl);
      // Aguardar um pouco para a página carregar antes de enviar mensagem
      setTimeout(() => {
        if(newClient) newClient.postMessage({ type: 'NOTIF_CLICK', data, action });
      }, 2500);
    }
  })());
});

// ── Fechar notificação ──
self.addEventListener('notificationclose', e => {
  // Se o usuário fechou a notificação de chamada manualmente, considera rejeição
  const data = e.notification.data || {};
  if(data.type === 'call' || data.type === 'video') {
    shownTags.delete('call-' + data.from);
  }
});
