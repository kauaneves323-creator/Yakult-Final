const {createClient}=supabase;
let sb=null;
let SUPA_URL=null;
let SUPA_KEY=null;

async function initSupabase(){
  // ⚠️ Substitua pelos seus valores do Supabase → Project Settings → 
  SUPA_URL = 'https://nctzqgochkfrlxjjawan.supabase.co';
SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdHpxZ29jaGtmcmx4amphd2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjA0NzAsImV4cCI6MjA5MTMzNjQ3MH0.t-8emaxQvPhdS2M-ofT1VUaX8V2X6k76vUW20WV81ME';
sb = createClient(SUPA_URL, SUPA_KEY);
}


let me=null,myFriends=[],channels=[],onlineInterval=null,feedRefreshInterval=null;
let friendRequests=[]; // pedidos recebidos ainda pendentes
let sentFriendRequests=new Set(); // pedidos que eu enviei
let currentDmPartner=null,dmChannel=null,unreadCounts={};
let postImgBase64=null;
let musicFileBase64=null;
let dmMediaB64=null,dmMediaType=null;
let dmVoiceRec=null,dmVoiceChunks=[],dmVoiceRecording=false;

// ── PLAYER DE MÚSICA ──
let playlist=[];
let currentTrackIdx=-1;
let currentBlobUrl=null;
const gAudio=document.getElementById('globalAudio');

// ─── COOKIES ───
function setCookie(name,val,days){
  const d=new Date();d.setTime(d.getTime()+days*86400000);
  document.cookie=`${name}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}
function getCookie(name){
  const v=document.cookie.split(';').find(c=>c.trim().startsWith(name+'='));
  return v?decodeURIComponent(v.trim().split('=')[1]):null;
}
function deleteCookie(name){document.cookie=`${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;}

const $=id=>document.getElementById(id);
const avatarOf=nick=>{const em=['😊','😎','🤩','🥳','🦄','🐱','🌟','🎮','🎵','🌸'];let h=0;for(const c of nick)h=(h*31+c.charCodeAt(0))%em.length;return em[Math.abs(h)];};
const timeAgo=ts=>{const d=Date.now()-new Date(ts).getTime();if(d<60000)return'agora';if(d<3600000)return Math.floor(d/60000)+'min';if(d<86400000)return Math.floor(d/3600000)+'h';return Math.floor(d/86400000)+'d';};
const esc=s=>{const d=document.createElement('div');d.textContent=s;return d.innerHTML;};
const toast=msg=>{const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);};
const showErr=(id,msg)=>{const e=$(id);e.textContent=msg;e.style.display='block';setTimeout(()=>e.style.display='none',3500);};
const dmKey=(a,b)=>[a,b].sort().join('__');
const toB64=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});
const fmtTime=s=>{if(!s||isNaN(s))return'0:00';const m=Math.floor(s/60);return`${m}:${String(Math.floor(s%60)).padStart(2,'0')}`;};

function avHtml(nick,photo,size=32){
  if(photo)return`<img src="${photo}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:50%;border:2px solid var(--blue);">`;
  return`<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--blue-bg);border:2px solid var(--blue);display:flex;align-items:center;justify-content:center;font-size:${size*0.45}px;">${avatarOf(nick)}</div>`;
}

// ── MOBILE MENU ──
function showMobileMenu(){$('moreModal').classList.remove('hidden');}
function closeMobileMenu(){$('moreModal').classList.add('hidden');}

// showTab definido em NOVAS FUNÇÕES abaixo

// ── HASH SEGURO (PBKDF2 via Web Crypto API) ──
// Retorna string no formato "pbkdf2:<hex>" — irreversível ao contrário de btoa()
async function hashPassword(password, nick){
  // crypto.subtle só funciona em HTTPS ou localhost
  if(!crypto?.subtle){
    // Fallback seguro: SHA-256 manual via btoa encadeado com salt
    // Melhor que btoa simples, mas avisa para usar HTTPS
    console.warn('[yakult] crypto.subtle indisponível — use HTTPS para máxima segurança');
    const salted = 'yakult:' + nick + ':' + password;
    return 'sha1fb:' + btoa(unescape(encodeURIComponent(salted)));
  }
  const enc = new TextEncoder();
  const salt = enc.encode('yakult:' + nick);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
    keyMaterial, 256
  );
  const hex = Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return 'pbkdf2:' + hex;
}
// Hash antigo (base64 simples) — usado só para migração de contas antigas
function legacyHash(pass){ return btoa(unescape(encodeURIComponent(pass))); }

// ── AUTH ──
async function register(){
  if(!sb)return showErr('rErr','Servidor ainda carregando, tente em instantes...');
  const nick=$('rNick').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const pass=$('rPass').value;
  if(nick.length<3)return showErr('rErr','Nickname deve ter ao menos 3 caracteres');
  if(pass.length<4)return showErr('rErr','Senha deve ter ao menos 4 caracteres');
  try{
    const res=await fetch('/register',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nick,password:pass})
    });
    const json=await res.json();
    if(!res.ok)return showErr('rErr',json.error||'Erro ao criar conta');
    toast('Conta criada! Entre com seu nick 🎉');
  }catch(err){
    showErr('rErr','Erro de rede: '+err.message);
  }
}

async function login(){
  if(!sb)return showErr('lErr','Servidor ainda carregando, tente em instantes...');
  const nick=$('lNick').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const pass=$('lPass').value;
  if(!nick)return showErr('lErr','Digite seu nickname');
  if(!pass)return showErr('lErr','Digite sua senha');

  const btn=document.querySelector('#loginPage .btn-p');
  if(btn){btn.disabled=true;btn.textContent='entrando...';}

  try{
    const res=await fetch('/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nick,password:pass})
    });
    const json=await res.json();
    if(!res.ok){showErr('lErr',json.error||'Erro ao entrar');return;}

    if($('rememberMe').checked){
      setCookie('yk_nick',json.user.nick,30);
      setCookie('yk_token',json.sessionToken,30);
    } else {
      deleteCookie('yk_nick');
      deleteCookie('yk_token');
    }

    await doLogin(json.user);
    _adminSessionToken = json.sessionToken || '';
  }catch(err){
    showErr('lErr','Erro de rede: '+err.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='entrar';}
  }
}

async function doLogin(data){
  me=data;
  $('loginPage').classList.add('hidden');
  $('homePage').classList.remove('hidden');
  $('mobileNav').classList.remove('hidden');
  $('topLogoutBtn').classList.remove('hidden');
  $('notifBellBtn').classList.remove('hidden');
  $('topUser').textContent='👤 '+(me.display_name||me.nick);
  updateMyProfileUI();
  await sb.from('online').upsert({nick:me.nick,last_seen:new Date().toISOString()},{onConflict:'nick'});
  onlineInterval=setInterval(()=>sb.from('online').upsert({nick:me.nick,last_seen:new Date().toISOString()},{onConflict:'nick'}),20000);
  feedRefreshInterval=setInterval(()=>{if(me)loadFeed();},60000);
  await loadAll();
  subscribeRealtime();
  vcStartGlobalListener();
  loadNotifications();
  loadAdminCache();
  // Bot ADM — verifica se é admin real do banco
  const isAdmin = me.is_admin === true || me.nick === 'apexzinn';
  if(isAdmin){
    me._isAdmin = true;
    $('botToggleBtn').style.display='flex';
    subscribeBotChannel();
    // Mostrar link admin na navegação
    const navAdm = $('nav-adminpanel');
    if(navAdm) navAdm.classList.remove('hidden');
  }
}

// Auto-login via cookie
async function tryAutoLogin(){
  const nick=getCookie('yk_nick');
  const token=getCookie('yk_token');
  if(!nick||!token)return;
  try{
    const res=await fetch('/verify-session',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nick,sessionToken:token})
    });
    if(!res.ok){deleteCookie('yk_nick');deleteCookie('yk_token');return;}
    const json=await res.json();
    if(json.ok&&json.user){
      _adminSessionToken = getCookie('yk_token') || '';
      await doLogin(json.user);
    }
  }catch(e){
    // falha silenciosa — usuário faz login manual
  }
}

function updateMyProfileUI(){
  const nameEl=$('myName');
  if(nameEl) nameEl.textContent=me.display_name||me.nick;
  const bioEl=$('myBio');
  if(bioEl) bioEl.textContent=me.bio||'';
  if(me.photo){
    $('myAvEmoji').style.display='none';
    $('myAvImg').src=me.photo;
    $('myAvImg').style.display='block';
  } else {
    $('myAvEmoji').textContent=avatarOf(me.nick);
    $('myAvEmoji').style.display='';
    $('myAvImg').style.display='none';
  }
}

async function logout(){
  if(!confirm('Tem certeza que quer sair?'))return;
  channels.forEach(c=>sb.removeChannel(c));channels=[];
  if(dmChannel){sb.removeChannel(dmChannel);dmChannel=null;}
  if(typingChannel){sb.removeChannel(typingChannel);typingChannel=null;}
  clearInterval(onlineInterval);
  clearInterval(feedRefreshInterval);
  if(me)await sb.from('online').delete().eq('nick',me.nick);
  gAudio.pause();gAudio.src='';
  $('audioPlayerUI').classList.add('hidden');
  $('nowPlayingCard').style.display='none';
  me=null;myFriends=[];currentDmPartner=null;unreadCounts={};
  playlist=[];currentTrackIdx=-1;
  deleteCookie('yk_nick');deleteCookie('yk_hash');
  $('homePage').classList.add('hidden');
  $('mobileNav').classList.add('hidden');
  $('loginPage').classList.remove('hidden');
  $('topLogoutBtn').classList.add('hidden');
  $('topUser').textContent='';
}

// ── EDITAR PERFIL ──
function openEditProfile(){
  $('editName').value=me.display_name||me.nick;
  $('editBio').value=me.bio||'';
  $('editSite').value=me.site||'';
  $('editGmail').value=me.gmail||'';
  $('editBioCount').textContent=(me.bio||'').length+'/100';
  $('editModal').classList.remove('hidden');
}
function closeEditProfile(){$('editModal').classList.add('hidden');}
async function saveProfile(){
  const name=$('editName').value.trim();
  const bio=$('editBio').value.trim();
  const site=$('editSite').value.trim();
  const gmail=$('editGmail').value.trim();
  if(!name)return toast('Nome não pode ser vazio');
  if(gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail))return toast('Gmail inválido');
  const{error}=await sb.from('users').update({display_name:name,bio,site:site||null,gmail:gmail||null}).eq('nick',me.nick);
  if(error)return toast('Erro: '+error.message);
  me.display_name=name;me.bio=bio;me.site=site||null;me.gmail=gmail||null;
  updateMyProfileUI();
  $('topUser').textContent='👤 '+name;
  closeEditProfile();
  toast('Perfil atualizado! ✨');
}
function openResetPassword(){
  $('rpOld').value='';$('rpNew').value='';$('rpConfirm').value='';
  $('rpErr').style.display='none';
  $('resetPassModal').classList.remove('hidden');
}
async function doResetPassword(){
  const oldPass=$('rpOld').value;
  const newPass=$('rpNew').value;
  const confirm=$('rpConfirm').value;
  const errEl=$('rpErr');
  errEl.style.display='none';
  if(!oldPass||!newPass||!confirm){errEl.textContent='Preencha todos os campos';errEl.style.display='block';return;}
  if(newPass.length<4){errEl.textContent='A nova senha deve ter pelo menos 4 caracteres';errEl.style.display='block';return;}
  if(newPass!==confirm){errEl.textContent='As senhas não coincidem';errEl.style.display='block';return;}
  const{data:userData}=await sb.from('users').select('password_hash').eq('nick',me.nick).maybeSingle();
  if(!userData){errEl.textContent='Erro ao buscar usuário';errEl.style.display='block';return;}
  // Suporta hash antigo (base64) para migração
  const oldHash = userData.password_hash.startsWith('pbkdf2:')
    ? await hashPassword(oldPass, me.nick)
    : legacyHash(oldPass);
  if(userData.password_hash!==oldHash){errEl.textContent='Senha atual incorreta';errEl.style.display='block';return;}
  const newHash = await hashPassword(newPass, me.nick);
  const{error}=await sb.from('users').update({password_hash:newHash}).eq('nick',me.nick);
  if(error){errEl.textContent='Erro: '+error.message;errEl.style.display='block';return;}
  setCookie('yk_hash',newHash,30);
  $('resetPassModal').classList.add('hidden');
  toast('Senha redefinida com sucesso! 🔑');
}

function updateMyProfileUI(){
  $('myName').textContent=me.display_name||me.nick;
  $('myBio').textContent=me.bio||'';
  // Site
  const siteDiv=$('mySite');
  if(me.site){
    siteDiv.style.display='block';
    $('mySiteTxt').textContent=me.site.replace(/^https?:\/\//,'');
    $('mySiteLink').href=me.site.startsWith('http')?me.site:'https://'+me.site;
  }else{
    siteDiv.style.display='none';
  }
  if(me.photo){
    $('myAvEmoji').style.display='none';
    $('myAvImg').src=me.photo;
    $('myAvImg').style.display='block';
  } else {
    $('myAvEmoji').textContent=avatarOf(me.nick);
    $('myAvEmoji').style.display='';
    $('myAvImg').style.display='none';
  }
}

// ── FOTO DE PERFIL ──
async function uploadAvatar(input){
  if(!input.files[0])return;
  const file=input.files[0];
  if(file.size>2*1024*1024)return toast('Foto muito grande! Máx 2MB');
  toast('Enviando foto...');
  const b64=await toB64(file);
  const{error}=await sb.from('users').update({photo:b64}).eq('nick',me.nick);
  if(error)return toast('Erro ao salvar foto: '+error.message);
  me.photo=b64;
  updateMyProfileUI();
  toast('Foto atualizada! 📸');
}

// ── POSTAGENS ──
let feedPage=0;
const FEED_PAGE_SIZE=20;

let postVidBase64=null;
function previewPostImg(input){
  if(!input.files[0]){
    postImgBase64=null;postVidBase64=null;
    $('postImgPreview').style.display='none';
    $('postVidPreview').style.display='none';
    return;
  }
  const file=input.files[0];
  if(file.type.startsWith('video')){
    if(file.size>30*1024*1024){toast('Vídeo muito grande! Máx 30MB');input.value='';return;}
    toB64(file).then(b64=>{
      postVidBase64=b64;postImgBase64=null;
      $('postImgPreview').style.display='none';
      $('postVidPreview').src=b64;$('postVidPreview').style.display='block';
    });
  } else {
    if(file.size>3*1024*1024){toast('Imagem muito grande! Máx 3MB');input.value='';return;}
    toB64(file).then(b64=>{
      postImgBase64=b64;postVidBase64=null;
      $('postVidPreview').style.display='none';
      $('postImgPreview').src=b64;$('postImgPreview').style.display='block';
    });
  }
}

async function loadFeed(append=false){
  if(!append)feedPage=0;
  const from=feedPage*FEED_PAGE_SIZE;
  const{data}=await sb.from('posts').select('*').order('created_at',{ascending:false}).range(from,from+FEED_PAGE_SIZE-1);
  const posts=data||[];
  if(!append){
    allPosts=posts;
    renderFeed(allPosts,posts.length===FEED_PAGE_SIZE);
  } else {
    allPosts=[...allPosts,...posts];
    renderFeed(allPosts,posts.length===FEED_PAGE_SIZE);
  }
  // Carregar miniaturas de comentários para todos os posts visíveis
  for(const p of posts) loadCommentPreview(p.id);
  $('stPosts').textContent=allPosts.filter(p=>(p.author_nick||p.nick)===me.nick).length;
}

async function loadMoreFeed(){
  feedPage++;
  await loadFeed(true);
}

async function sendPost(){
  const text=$('postTxt').value.trim();
  if(!text&&!postImgBase64&&!postVidBase64)return toast('Escreva algo ou adicione uma foto/vídeo!');
  const btn=document.querySelector('[onclick="sendPost()"]');
  if(btn){btn.disabled=true;btn.textContent='Postando...';}
  const media=postVidBase64||postImgBase64||null;
  const mtype=postVidBase64?'video':postImgBase64?'image':null;
  const{error}=await sb.from('posts').insert({
    author_nick:me.nick,
    display_name:me.display_name||me.nick,
    author_photo:me.photo||null,
    content:esc(text),
    image:media,
    media_type:mtype,
    likes:[],
    created_at:new Date().toISOString()
  });
  if(btn){btn.disabled=false;btn.textContent='Postar';}
  if(error)return toast('Erro: '+error.message);
  $('postTxt').value='';
  updateCharCount('postTxt','postCharCount',500);
  postImgBase64=null;postVidBase64=null;
  $('postImgPreview').style.display='none';
  $('postVidPreview').style.display='none';
  $('postImgInput').value='';
  toast('Postagem publicada! 🎉');
}

function renderFeed(posts,hasMore=false){
  const w=$('feedWall');
  if(!posts.length){w.innerHTML='<div class="empty">Nenhuma postagem ainda. Seja o primeiro! 🌟</div>';return;}
  const isAdmin = me && (me._isAdmin || me.nick==='apexzinn');
  w.innerHTML=posts.map(p=>{
    const nick=p.author_nick||p.nick||'?';
    const photo=p.author_photo||p.photo||null;
    const name=p.display_name||nick;
    const content=p.content||p.text||'';
    const likes=Array.isArray(p.likes)?p.likes:[];
    const liked=likes.includes(me.nick);
    const likesStr=JSON.stringify(likes).replace(/"/g,'&quot;');
    // Admin badge & font
    const admInfo = adminUsersCache[nick];
    const isPostAdm = admInfo && admInfo.is_admin;
    const admBadge = isPostAdm ? '<span class="title-badge title-admin">⭐ ADM ⭐</span>' : '';
    const fontCss = isPostAdm && admInfo.font_style && admInfo.font_style!=='normal'
      ? (admInfo.font_style==='cursive'?'font-family:\'Poppins\',Georgia,serif;font-style:italic;':admInfo.font_style==='bold'?'font-family:\'Poppins\',Arial,sans-serif;font-weight:900;letter-spacing:1px;':admInfo.font_style==='pixel'?'font-family:\'Press Start 2P\',monospace;letter-spacing:2px;font-size:.85em;':'')
      : '';
    return`<div class="post-item" id="post-${p.id}">
      <div class="post-hdr">
        <div onclick="showUserProfile('${esc(nick)}')" style="cursor:pointer">${avHtml(nick,photo,32)}</div>
        <div>
          <div class="clickable-nick" onclick="showUserProfile('${esc(nick)}')" style="${fontCss}">${esc(name)}${admBadge}</div>
          <div style="font-size:10px;color:var(--muted)">@${esc(nick)}</div>
        </div>
        <span class="post-time">${timeAgo(p.created_at)}</span>
      </div>
      ${content?`<div class="post-txt">${content}</div>`:''}
      ${p.image&&p.media_type==='video'?`<video class="post-img" src="${p.image}" controls style="max-height:300px;width:100%;border-radius:var(--radius);margin-bottom:6px"></video>`:''}
      ${p.image&&p.media_type!=='video'?`<img class="post-img" src="${p.image}" onclick="this.style.maxHeight=this.style.maxHeight==='none'?'300px':'none'" title="Clique para expandir">`:''}
      ${p.image&&!p.media_type?`<img class="post-img" src="${p.image}" onclick="this.style.maxHeight=this.style.maxHeight==='none'?'300px':'none'" title="Clique para expandir">`:''}
      <div class="post-actions">
        <button class="post-btn ${liked?'liked':''}" onclick="toggleLike('${p.id}',${JSON.stringify(likes)})">♥ ${likes.length}${liked?' curtido':' curtir'}</button>
        <button class="post-btn" onclick="toggleComments('${p.id}')">💬 comentar</button>
        <button class="post-btn" onclick="sharePost('${p.id}','${esc(name).replace(/'/g,"\\'")}','${(p.content||p.text||'').replace(/'/g,"\\'").replace(/\n/g,' ').substring(0,80)}')" title="Compartilhar">↗ share</button>
        ${isAdmin&&nick!==me.nick?`<button class="post-btn delete-own" onclick="adminDeletePost('${p.id}')">🗑️ adm</button>`:(nick===me.nick?`<button class="post-btn delete-own" onclick="deleteOwnPost('${p.id}')">🗑️</button>`:'')}
      </div>
      <div id="comment-preview-${p.id}" class="comment-preview-strip"></div>
      <div id="comments-${p.id}" class="post-comments hidden">
        <div id="comments-list-${p.id}"><div class="loading" style="padding:6px">Carregando...</div></div>
        <div class="comment-inp-row">
          <input class="comment-inp" id="comment-inp-${p.id}" placeholder="Comentar..." maxlength="200">
          <label class="comment-photo-btn" for="comment-img-${p.id}" title="Foto no comentário">📷</label>
          <input type="file" id="comment-img-${p.id}" accept="image/*" style="display:none" onchange="previewCommentImg(this,'${p.id}')">
          <button class="comment-send" onclick="sendComment('${p.id}')">Enviar</button>
        </div>
        <img id="comment-img-preview-${p.id}" style="display:none" class="comment-photo-preview" onclick="clearCommentImg('${p.id}')">
      </div>
    </div>`;
  }).join('');
  if(hasMore){
    w.innerHTML+=`<div style="text-align:center;padding:14px 0">
      <button class="btn-s" style="background:var(--blue);padding:7px 22px;font-size:12px" onclick="loadMoreFeed()">⬇ Carregar mais</button>
    </div>`;
  }
}

// Guarda b64 temporário por postId
const commentImgs={};

function previewCommentImg(input,postId){
  const file=input.files[0];
  if(!file)return;
  if(file.size>2*1024*1024){toast('Imagem muito grande! Máx 2MB');input.value='';return;}
  toB64(file).then(b64=>{
    commentImgs[postId]=b64;
    const prev=$('comment-img-preview-'+postId);
    prev.src=b64;prev.style.display='block';
    prev.title='Clique para remover';
  });
}

function clearCommentImg(postId){
  delete commentImgs[postId];
  const prev=$('comment-img-preview-'+postId);
  prev.src='';prev.style.display='none';
  $('comment-img-'+postId).value='';
}

async function toggleLike(postId,currentLikes){
  const idx=currentLikes.indexOf(me.nick);
  const newLikes=idx>=0?currentLikes.filter(n=>n!==me.nick):[...currentLikes,me.nick];
  await sb.from('posts').update({likes:newLikes}).eq('id',postId);
  // Atualizar botão localmente sem recarregar tudo
  const post=allPosts.find(p=>p.id===postId);
  if(post){
    post.likes=newLikes;
    const btn=document.querySelector(`#post-${postId} .post-btn.liked, #post-${postId} .post-btn:not(.liked)`);
    const allBtns=document.querySelectorAll(`#post-${postId} .post-actions .post-btn`);
    if(allBtns[0]){
      const liked2=newLikes.includes(me.nick);
      allBtns[0].className='post-btn'+(liked2?' liked':'');
      allBtns[0].textContent=`♥ ${newLikes.length}${liked2?' curtido':' curtir'}`;
      allBtns[0].setAttribute('onclick',`toggleLike('${postId}',${JSON.stringify(newLikes)})`);
    }
  }
}

async function toggleComments(postId){
  const el=$('comments-'+postId);
  el.classList.toggle('hidden');
  if(!el.classList.contains('hidden'))loadComments(postId);
}

// ── Miniatura de comentários visível embaixo do post ──
const _commentPreviewCache={};
async function loadCommentPreview(postId){
  const el=$('comment-preview-'+postId);
  if(!el) return;
  const{data}=await sb.from('comments').select('nick,display_name,author_photo,text,image')
    .eq('post_id',postId).order('created_at',{ascending:false}).limit(2);
  const comments=(data||[]).reverse(); // mostrar em ordem crescente
  _commentPreviewCache[postId]=data?data.length:0;

  if(!comments.length){ el.innerHTML=''; return; }

  // buscar total para mostrar "ver X comentários"
  const{count}=await sb.from('comments').select('*',{count:'exact',head:true}).eq('post_id',postId);
  const total=count||comments.length;

  el.innerHTML=comments.map(c=>{
    const cNick=c.nick||'?';
    const avHtml=c.author_photo
      ?`<img src="${c.author_photo}">`
      :`<span>${avatarOf(cNick)}</span>`;
    const txtPreview=c.text?esc(c.text).substring(0,60)+(c.text.length>60?'…':''):'';
    const imgThumb=c.image?`<img class="comment-preview-img" src="${c.image}">`:'';
    return`<div class="comment-preview-item">
      <div class="comment-preview-av">${avHtml}</div>
      <div style="flex:1;min-width:0;">
        <span class="comment-preview-nick">${esc(c.display_name||cNick)}</span>
        <span class="comment-preview-txt">${txtPreview}</span>${imgThumb}
      </div>
    </div>`;
  }).join('')
  +(total>2?`<div class="comment-preview-more" onclick="toggleComments('${postId}')">Ver todos os ${total} comentários</div>`
            :`<div class="comment-preview-more" onclick="toggleComments('${postId}')">💬 comentar</div>`);
}

async function loadComments(postId){
  const{data}=await sb.from('comments').select('*').eq('post_id',postId).order('created_at',{ascending:true});
  const el=$('comments-list-'+postId);
  if(!el)return;
  if(!data||!data.length){el.innerHTML='<div style="color:var(--muted);font-size:11px;padding:4px 0">Nenhum comentário ainda</div>';return;}
  el.innerHTML=data.map(c=>{
    const cNick=c.nick||'?';
    const cAdm=adminUsersCache[cNick];
    const cBadge=cAdm&&cAdm.is_admin?'<span class="title-badge title-admin" style="font-size:9px;padding:0 4px;vertical-align:middle;">ADM</span>':'';
    const cFontStyle=cAdm&&cAdm.is_admin&&cAdm.font_style&&cAdm.font_style!=='normal'?(cAdm.font_style==='cursive'?'font-family:\'Poppins\',Georgia,serif;font-style:italic;':cAdm.font_style==='bold'?'font-family:\'Poppins\',sans-serif;font-weight:900;':cAdm.font_style==='pixel'?'font-family:\'Press Start 2P\',monospace;font-size:.8em;':''):'';
    return`<div class="comment-item">
    <div class="comment-av">${c.author_photo?`<img src="${c.author_photo}">`:`${avatarOf(cNick)}`}</div>
    <div>
      <span class="comment-nick" style="${cFontStyle}">${esc(c.display_name||cNick)}${cBadge}</span>
      <span class="comment-txt"> ${esc(c.text||'')}</span>
      ${c.image?`<img class="comment-img" src="${c.image}" onclick="this.style.maxWidth=this.style.maxWidth?'':'100%'">`:''}
    </div>
  </div>`;
  }).join('');
}

async function sendComment(postId){
  const inp=$('comment-inp-'+postId);
  const text=inp.value.trim();
  const img=commentImgs[postId]||null;
  if(!text&&!img)return;
  await sb.from('comments').insert({
    post_id:postId,
    nick:me.nick,
    display_name:me.display_name||me.nick,
    author_photo:me.photo||null,
    text:esc(text||''),
    image:img
  });
  inp.value='';
  clearCommentImg(postId);
  loadComments(postId);
  loadCommentPreview(postId);
}

// ── SCRAPS ──
async function loadScraps(){
  const{data}=await sb.from('scraps').select('*').order('created_at',{ascending:false}).limit(40);
  renderScraps(data||[]);
}

async function useAnyNickForScrap(){
  const nick=$('scrapAnyNick').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  if(!nick)return toast('Digite um nickname');
  if(nick===me.nick)return toast('Você não pode mandar recado pra si mesmo!');
  const{data}=await sb.from('users').select('nick,display_name').eq('nick',nick).maybeSingle();
  if(!data)return toast('Usuário "'+nick+'" não encontrado');
  // Adicionar/selecionar no select
  const sel=$('scrapTarget');
  let opt=sel.querySelector('option[value="'+nick+'"]');
  if(!opt){
    opt=document.createElement('option');
    opt.value=nick;
    opt.textContent=(data.display_name||nick)+' (@'+nick+')';
    sel.appendChild(opt);
  }
  sel.value=nick;
  $('scrapAnyNick').value='';
  toast('Destinatário: @'+nick+' ✓');
}

async function sendScrap(){
  const to=$('scrapTarget').value,text=$('scrapTxt').value.trim();
  if(!to)return toast('Selecione ou busque para quem enviar!');
  if(!text)return toast('Escreva algo no recado!');
  const{error}=await sb.from('scraps').insert({from_nick:me.nick,to_nick:to,text:esc(text)});
  if(error)return toast('Erro: '+error.message);
  $('scrapTxt').value='';
  updateCharCount('scrapTxt','scrapCharCount',300);
  toast('Recado enviado para @'+to+' ♥');
  loadScraps();
}
function renderScraps(scraps){
  const w=$('scrapsWall');
  if(!scraps.length){w.innerHTML='<div class="empty">Nenhum recado ainda 📝</div>';return;}
  const isAdmin = me && (me._isAdmin || me.nick==='apexzinn');
  w.innerHTML=scraps.map(s=>`
    <div class="scrap-item" id="scrap-${s.id}">
      <div class="scrap-hdr">
        <div>
          <span class="clickable-nick" onclick="showUserProfile('${esc(s.from_nick)}')">${esc(s.from_nick)}</span>
          <span class="scrap-arr">→</span>
          <span class="clickable-nick scrap-to" onclick="showUserProfile('${esc(s.to_nick)}')">${esc(s.to_nick)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="scrap-time">${timeAgo(s.created_at)}</span>
          ${s.from_nick===me.nick?`<button class="post-btn" style="color:#c00;font-size:11px;padding:1px 6px" onclick="deleteOwnScrap('${s.id}')" title="Apagar meu recado">🗑️</button>`:''}
          ${isAdmin&&s.from_nick!==me.nick?`<button class="post-btn" style="color:#c00;font-size:11px;padding:1px 6px" onclick="adminDeleteScrap('${s.id}')">🗑️ adm</button>`:''}
        </div>
      </div>
      <div class="scrap-txt">${esc(s.text)}</div>
    </div>`).join('');
}

async function deleteOwnScrap(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de recado inválido');
  if(!confirm('Apagar seu recado?'))return;
  const{error}=await sb.from('scraps').delete().eq('id',id).eq('from_nick',me.nick);
  if(error)return toast('Erro ao apagar: '+error.message);
  toast('Recado apagado 🗑️');loadScraps();
}

async function adminDeletePost(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de post inválido');
  if(!confirm('Apagar este post?'))return;
  // Verifica se o post existe antes de apagar
  const{data:postCheck}=await sb.from('posts').select('id').eq('id',id).maybeSingle();
  if(!postCheck)return toast('Post não encontrado');
  const{error:errCom}=await sb.from('comments').delete().eq('post_id',id);
  if(errCom)console.warn('Erro ao apagar comentários:',errCom.message);
  const{error}=await sb.from('posts').delete().eq('id',id);
  if(error)return toast('Erro ao apagar post: '+error.message);
  toast('Post apagado! 🗑️');
  loadFeed();
}
async function adminDeleteScrap(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de recado inválido');
  if(!confirm('Apagar este recado?'))return;
  const{error}=await sb.from('scraps').delete().eq('id',id);
  if(error)return toast('Erro ao apagar: '+error.message);
  toast('Recado apagado! 🗑️');
  loadScraps();
}

// ── MÚSICAS ──
async function loadCommunityMusic(){
  const{data}=await sb.from('music').select('*').order('created_at',{ascending:false}).limit(50);
  playlist=(data||[]).filter(m=>m.audio_data);
  renderMusicList(data||[]);
}

function renderMusicList(tracks){
  const el=$('musicList');
  if(!tracks.length){el.innerHTML='<div class="empty">Nenhuma música ainda! Adicione a primeira 🎶</div>';return;}
  el.innerHTML=tracks.map(m=>{
    const hasAudio=!!m.audio_data;
    const isCur=currentTrackIdx>=0&&playlist[currentTrackIdx]&&playlist[currentTrackIdx].id===m.id;
    const isPlay=isCur&&!gAudio.paused;
    const canDelete=me&&(m.added_by===me.nick||me.nick==='apexzinn'||me._isAdmin);
    return`<div class="music-item" id="mitem-${m.id}">
      <div class="music-icon">${hasAudio?'🎵':'📝'}</div>
      <div class="music-info">
        <div class="music-title">${esc(m.title)}</div>
        <div class="music-artist">${esc(m.artist)}${m.added_by?' · por '+esc(m.added_by):''}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
        ${hasAudio?`<button class="music-play${isCur?' playing':''}" id="playbtn-${m.id}" onclick="playTrackById('${m.id}')">${isPlay?'⏸':'▶'}</button>`:`<span style="font-size:10px;color:var(--muted)">sem áudio</span>`}
        ${canDelete?`<button onclick="deleteMusic('${m.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:2px 4px" title="Remover">🗑️</button>`:''}
      </div>
    </div>`;
  }).join('');
  const commEl=$('communityMusicList');
  if(commEl)commEl.innerHTML=el.innerHTML;
}

function refreshPlayButtons(){
  if(currentTrackIdx<0)return;
  const cur=playlist[currentTrackIdx];
  if(!cur)return;
  document.querySelectorAll('.music-play').forEach(btn=>{
    const id=btn.id.replace('playbtn-','');
    const isCur=id===String(cur.id);
    btn.classList.toggle('playing',isCur);
    btn.textContent=isCur&&!gAudio.paused?'⏸':'▶';
  });
  $('playPauseBtn').textContent=gAudio.paused?'▶':'⏸';
}

function playTrackById(id){
  const idx=playlist.findIndex(m=>m.id===id||String(m.id)===String(id));
  if(idx<0){toast('Música sem áudio');return;}
  if(currentTrackIdx===idx){togglePlayPause();return;}
  loadTrack(idx);
}

function loadTrack(idx){
  if(idx<0||idx>=playlist.length)return;
  currentTrackIdx=idx;
  const m=playlist[idx];
  // Revogar blob anterior
  if(currentBlobUrl){URL.revokeObjectURL(currentBlobUrl);currentBlobUrl=null;}
  // Converter base64 para Blob para compatibilidade máxima
  try{
    const b64=m.audio_data;
    const arr=b64.split(',');
    const mime=arr[0].match(/:(.*?);/)[1];
    const bstr=atob(arr[1]);
    const bytes=new Uint8Array(bstr.length);
    for(let i=0;i<bstr.length;i++)bytes[i]=bstr.charCodeAt(i);
    const blob=new Blob([bytes],{type:mime});
    currentBlobUrl=URL.createObjectURL(blob);
    gAudio.src=currentBlobUrl;
  }catch(e){
    // Fallback direto
    gAudio.src=m.audio_data;
  }
  gAudio.load();
  gAudio.play().then(()=>{
    $('playPauseBtn').textContent='⏸';
    refreshPlayButtons();
  }).catch(err=>{
    toast('Erro ao tocar: '+err.message);
    console.error(err);
  });
  $('playerTitle').textContent=m.title;
  $('playerArtist').textContent=m.artist;
  $('audioPlayerUI').classList.remove('hidden');
  $('nowPlayingCard').style.display='';
  $('nowPlayingCardTxt').textContent=m.title;
  $('nowPlayingCardArtist').textContent=m.artist;
  refreshPlayButtons();
}

function togglePlayPause(){
  if(!gAudio.src)return;
  if(gAudio.paused){
    gAudio.play().then(()=>{$('playPauseBtn').textContent='⏸';refreshPlayButtons();}).catch(e=>toast('Erro: '+e.message));
  }else{
    gAudio.pause();$('playPauseBtn').textContent='▶';refreshPlayButtons();
  }
}

function prevTrack(){if(playlist.length)loadTrack((currentTrackIdx-1+playlist.length)%playlist.length);}
function nextTrack(){if(playlist.length)loadTrack((currentTrackIdx+1)%playlist.length);}

function seekAudio(e){
  if(!gAudio.duration)return;
  const rect=e.currentTarget.getBoundingClientRect();
  gAudio.currentTime=((e.clientX-rect.left)/rect.width)*gAudio.duration;
}

gAudio.addEventListener('timeupdate',()=>{
  if(!gAudio.duration)return;
  $('audioProgressFill').style.width=((gAudio.currentTime/gAudio.duration)*100)+'%';
  $('audioTime').textContent=fmtTime(gAudio.currentTime)+' / '+fmtTime(gAudio.duration);
});
gAudio.addEventListener('ended',()=>nextTrack());
gAudio.addEventListener('play',()=>refreshPlayButtons());
gAudio.addEventListener('pause',()=>refreshPlayButtons());

function handleMusicFile(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>5*1024*1024){toast('Arquivo muito grande! Máx 5MB');input.value='';return;}
  const prog=$('uploadProg'),bar=$('uploadProgBar'),txt=$('uploadAreaTxt');
  prog.style.display='block';bar.style.width='0%';txt.textContent='Lendo arquivo...';
  const reader=new FileReader();
  let fake=0;
  const fakeInt=setInterval(()=>{fake=Math.min(fake+10,90);bar.style.width=fake+'%';},100);
  reader.onload=()=>{clearInterval(fakeInt);bar.style.width='100%';musicFileBase64=reader.result;txt.textContent='✅ '+file.name;setTimeout(()=>{prog.style.display='none';},500);};
  reader.onerror=()=>{clearInterval(fakeInt);toast('Erro ao ler arquivo');txt.textContent='Clique para escolher';};
  reader.readAsDataURL(file);
}

async function addMusic(){
  const title=$('musicTitle').value.trim(),artist=$('musicArtist').value.trim();
  if(!title||!artist)return toast('Preencha título e artista!');
  if(!musicFileBase64)return toast('Selecione um arquivo de áudio!');
  toast('Adicionando música...');
  const{error}=await sb.from('music').insert({title:esc(title),artist:esc(artist),audio_data:musicFileBase64,added_by:me.nick});
  if(error)return toast('Erro: '+error.message);
  $('musicTitle').value='';$('musicArtist').value='';$('musicFileInput').value='';
  $('uploadAreaTxt').textContent='Clique para escolher o arquivo de áudio';
  musicFileBase64=null;
  await loadCommunityMusic();
  toast('Música adicionada! 🎵');
}

async function deleteMusic(id){
  if(!confirm('Remover esta música?'))return;
  // Se estiver tocando, parar
  if(playlist[currentTrackIdx]&&String(playlist[currentTrackIdx].id)===String(id)){
    gAudio.pause();gAudio.src='';
    $('audioPlayerUI').classList.add('hidden');
    $('nowPlayingCard').style.display='none';
    currentTrackIdx=-1;
  }
  await sb.from('music').delete().eq('id',id);
  toast('Música removida 🗑️');
  await loadCommunityMusic();
}

// ── DM ──
async function loadDmUnread(){
  const{data}=await sb.from('dms').select('from_nick').eq('to_nick',me.nick).eq('read',false);
  unreadCounts={};
  (data||[]).forEach(m=>{unreadCounts[m.from_nick]=(unreadCounts[m.from_nick]||0)+1;});
  updateDmBadge();
}
function updateDmBadge(){
  const total=Object.values(unreadCounts).reduce((a,b)=>a+b,0);
  const badge=$('dmBadge');const mbadge=$('mDmBadge');
  if(!badge||!mbadge)return;
  if(total>0){
    badge.textContent=total;badge.classList.remove('hidden');
    mbadge.textContent=total;mbadge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');mbadge.classList.add('hidden');
  }
  // Título dinâmico
  const totalNotif=total+scrapUnread;
  document.title=totalNotif>0?`(${totalNotif}) Yakult.br`:'Yakult.br';
}
async function loadDmList(){
  const{data:sent}=await sb.from('dms').select('to_nick,text,created_at').eq('from_nick',me.nick).order('created_at',{ascending:false});
  const{data:recv}=await sb.from('dms').select('from_nick,text,created_at').eq('to_nick',me.nick).order('created_at',{ascending:false});
  const convMap={};
  (sent||[]).forEach(m=>{const k=m.to_nick;if(!convMap[k]||new Date(m.created_at)>new Date(convMap[k].ts))convMap[k]={partner:k,preview:m.text,ts:m.created_at,unread:0};});
  (recv||[]).forEach(m=>{const k=m.from_nick;if(!convMap[k]||new Date(m.created_at)>new Date(convMap[k].ts))convMap[k]={partner:k,preview:m.text,ts:m.created_at,unread:unreadCounts[k]||0};else if(convMap[k])convMap[k].unread=unreadCounts[k]||0;});
  const convs=Object.values(convMap).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  const el=$('dmList');
  if(!convs.length){el.innerHTML='<div class="empty">Nenhuma conversa ainda</div>';return;}
  // Buscar fotos e nomes dos parceiros
  const partners=convs.map(c=>c.partner);
  const{data:usersData}=await sb.from('users').select('nick,photo,display_name').in('nick',partners.length?partners:['__none__']);
  const uMap={};(usersData||[]).forEach(u=>{uMap[u.nick]={photo:u.photo,name:u.display_name||u.nick};});
  el.innerHTML=convs.map(c=>{
    const u=uMap[c.partner]||{};
    const preview=c.preview?c.preview.substring(0,40)+(c.preview.length>40?'…':''):'[mídia]';
    return`<div class="dm-conv" onclick="openDmConv('${esc(c.partner)}')">
      <div class="dm-av">${avHtml(c.partner,u.photo||null,36)}</div>
      <div class="dm-info">
        <div class="dm-nick">${esc(u.name||c.partner)}</div>
        <div class="dm-preview">${esc(preview)}</div>
      </div>
      <div class="dm-meta">
        <span class="dm-time">${timeAgo(c.ts)}</span>
        ${c.unread>0?`<span class="dm-unread">${c.unread}</span>`:''}
      </div>
    </div>`;
  }).join('');
}
async function openDmWith(){
  const nick=$('dmNewNick').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  if(!nick)return toast('Digite um nickname');
  if(nick===me.nick)return toast('Você não pode mandar DM pra si mesmo!');
  const{data}=await sb.from('users').select('nick').eq('nick',nick).maybeSingle();
  if(!data)return toast('Usuário "'+nick+'" não encontrado');
  $('dmNewNick').value='';openDmConv(nick);
}
async function openDmConv(partner){
  currentDmPartner=partner;
  $('dmConvList').classList.add('hidden');$('dmChatWindow').classList.remove('hidden');
  // Buscar foto e nome do parceiro para o cabeçalho
  const{data:pData}=await sb.from('users').select('nick,photo,display_name').eq('nick',partner).maybeSingle();
  $('dmChatAv').innerHTML=avHtml(partner,pData?.photo||null,32);
  $('dmChatName').textContent=pData?.display_name||partner;
  await sb.from('dms').update({read:true}).eq('to_nick',me.nick).eq('from_nick',partner);
  delete unreadCounts[partner];updateDmBadge();
  await loadDmMessages();subscribeDmChannel();subscribeTyping(partner);
}
function closeDmWindow(){
  if(dmChannel){sb.removeChannel(dmChannel);dmChannel=null;}
  if(typingChannel){sb.removeChannel(typingChannel);typingChannel=null;}
  currentDmPartner=null;
  $('dmChatWindow').classList.add('hidden');$('dmConvList').classList.remove('hidden');
  loadDmList();
}
async function loadDmMessages(){
  const key=dmKey(me.nick,currentDmPartner);
  const{data}=await sb.from('dms').select('*').eq('conv_key',key).order('created_at',{ascending:true});
  const el=$('dmMessages');
  if(!data||!data.length){el.innerHTML='<div style="text-align:center;color:var(--muted);padding:30px 0;font-size:12px">Diga olá! 👋</div>';return;}
  el.innerHTML=data.map(m=>{
    const mediaHtml=m.media_type&&m.media_data
      ?m.media_type.startsWith('image')?`<img src="${m.media_data}" style="max-width:200px;max-height:180px;border-radius:8px;display:block;margin-top:4px;cursor:pointer" onclick="this.style.maxWidth=this.style.maxWidth?'':'none'">`
        :m.media_type.startsWith('video')?`<video src="${m.media_data}" controls style="max-width:220px;max-height:160px;border-radius:8px;display:block;margin-top:4px"></video>`
        :m.media_type.startsWith('audio')?`<audio src="${m.media_data}" controls style="display:block;margin-top:4px;max-width:220px"></audio>`
        :''
      :'';
    return`<div style="display:flex;flex-direction:column;align-items:${m.from_nick===me.nick?'flex-end':'flex-start'}"><div class="dm-bubble ${m.from_nick===me.nick?'mine':'theirs'}">${m.text?esc(m.text):''}${mediaHtml}<div class="dm-bubble-time">${timeAgo(m.created_at)}</div></div></div>`;
  }).join('');
  el.scrollTop=el.scrollHeight;
}
// ── MÍDIA NA DM ──
function handleDmFile(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>10*1024*1024){toast('Arquivo muito grande! Máx 10MB');input.value='';return;}
  toB64(file).then(b64=>{
    dmMediaB64=b64;dmMediaType=file.type;
    $('dmMediaPreview').style.display='block';
    $('dmImgPrev').style.display='none';$('dmVidPrev').style.display='none';$('dmAudPrev').style.display='none';
    if(file.type.startsWith('image')){$('dmImgPrev').src=b64;$('dmImgPrev').style.display='block';}
    else if(file.type.startsWith('video')){$('dmVidPrev').src=b64;$('dmVidPrev').style.display='block';}
    else if(file.type.startsWith('audio')){$('dmAudPrev').src=b64;$('dmAudPrev').style.display='block';}
    input.value='';
  });
}
function clearDmMedia(){
  dmMediaB64=null;dmMediaType=null;
  $('dmMediaPreview').style.display='none';
  $('dmImgPrev').src='';$('dmVidPrev').src='';$('dmAudPrev').src='';
}
async function toggleDmVoice(){
  const useNative=isSecureContext()&&typeof MediaRecorder!=='undefined'&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&!/iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!useNative){$('dmAudioFallback').click();return;}
  if(!dmVoiceRecording){
    const granted=await requestMicPermission();
    if(!granted)return;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      dmVoiceChunks=[];
      const mimeType=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')?'audio/ogg;codecs=opus':'';
      dmVoiceRec=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
      const finalMime=dmVoiceRec.mimeType||'audio/webm';
      dmVoiceRec.ondataavailable=e=>{if(e.data&&e.data.size>0)dmVoiceChunks.push(e.data);};
      dmVoiceRec.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(dmVoiceChunks,{type:finalMime});
        const reader=new FileReader();
        reader.onload=()=>{
          dmMediaB64=reader.result;dmMediaType=finalMime.split(';')[0];
          $('dmMediaPreview').style.display='block';
          $('dmImgPrev').style.display='none';$('dmVidPrev').style.display='none';
          $('dmAudPrev').src=reader.result;$('dmAudPrev').style.display='block';
          toast('Áudio gravado! Envie agora 🎤');
        };
        reader.readAsDataURL(blob);
      };
      dmVoiceRec.start(200);
      dmVoiceRecording=true;
      $('dmVoiceBtn').textContent='⏹';
      $('dmVoiceBtn').style.background='#ffcccc';
      toast('Gravando... Toque ⏹ para parar 🎤');
    }catch(e){
      dmVoiceRecording=false;
    }
  }else{
    try{dmVoiceRec.stop();}catch(e){}
    dmVoiceRecording=false;
    $('dmVoiceBtn').textContent='🎤';
    $('dmVoiceBtn').style.background='';
  }
}

async function sendDm(){
  const text=$('dmInput').value.trim();
  if((!text&&!dmMediaB64)||!currentDmPartner)return;
  const key=dmKey(me.nick,currentDmPartner);
  $('dmInput').value='';
  const sendBtn=document.querySelector('[onclick="sendDm()"]');
  if(sendBtn){sendBtn.disabled=true;}
  const{error}=await sb.from('dms').insert({from_nick:me.nick,to_nick:currentDmPartner,text:esc(text||''),conv_key:key,read:false,media_data:dmMediaB64||null,media_type:dmMediaType||null});
  if(sendBtn){sendBtn.disabled=false;}
  clearDmMedia();
  if(!error)loadDmMessages();
}
function subscribeDmChannel(){
  if(dmChannel)sb.removeChannel(dmChannel);
  const key=dmKey(me.nick,currentDmPartner);
  dmChannel=sb.channel('dm-'+key).on('postgres_changes',{event:'INSERT',schema:'public',table:'dms',filter:`conv_key=eq.${key}`},async()=>{
    await sb.from('dms').update({read:true}).eq('to_nick',me.nick).eq('from_nick',currentDmPartner);
    loadDmMessages();
  }).subscribe();
}

// ── AMIGOS ──
async function loadFriends(){
  const{data}=await sb.from('friends').select('friend_nick').eq('nick',me.nick);
  myFriends=(data||[]).map(r=>r.friend_nick);
  await renderFriends();populateTarget();
  $('stFriends').textContent=myFriends.length;
  const fc=$('friendCount');if(fc)fc.textContent='('+myFriends.length+')';
}
async function addFriend(){
  const nick=$('friendInp').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  if(!nick)return toast('Digite um nickname');
  await sendFriendRequest(nick);
  $('friendInp').value='';
  $('friendSearchResults').innerHTML='';
}

// ── SISTEMA DE PEDIDOS DE AMIZADE ──
async function sendFriendRequest(nick){
  if(!nick)return toast('Digite um nickname');
  if(nick===me.nick)return toast('Você não pode se adicionar!');
  if(myFriends.includes(nick))return toast(nick+' já é seu amigo!');
  if(sentFriendRequests.has(nick))return toast('Pedido já enviado para '+nick+'!');
  const{data}=await sb.from('users').select('nick').eq('nick',nick).maybeSingle();
  if(!data)return toast('Usuário "'+nick+'" não encontrado');
  // Verificar se já tem pedido pendente desse nick para mim (aceita direto)
  const pending=friendRequests.find(r=>r.from_nick===nick);
  if(pending){
    await acceptFriendRequest(nick);
    return;
  }
  // Inserir na tabela friend_requests
  const{error}=await sb.from('friend_requests').insert({from_nick:me.nick,to_nick:nick,status:'pending'}).select().maybeSingle().catch(()=>({error:null}));
  if(error&&!error.message.includes('duplicate'))return toast('Erro: '+error.message);
  sentFriendRequests.add(nick);
  toast('Pedido de amizade enviado para @'+nick+' 💌');
}

async function acceptFriendRequest(fromNick){
  await sb.from('friends').upsert([
    {nick:me.nick,friend_nick:fromNick},
    {nick:fromNick,friend_nick:me.nick}
  ],{onConflict:'nick,friend_nick',ignoreDuplicates:true});
  await sb.from('friend_requests').delete().eq('from_nick',fromNick).eq('to_nick',me.nick);
  friendRequests=friendRequests.filter(r=>r.from_nick!==fromNick);
  await loadFriends();
  toast('@'+fromNick+' agora é seu amigo! 🎉');
  renderNotifTab();
}

async function rejectFriendRequest(fromNick){
  await sb.from('friend_requests').delete().eq('from_nick',fromNick).eq('to_nick',me.nick);
  friendRequests=friendRequests.filter(r=>r.from_nick!==fromNick);
  renderNotifTab();
  toast('Pedido de @'+fromNick+' recusado.');
}

async function loadFriendRequests(){
  if(!me)return;
  const{data}=await sb.from('friend_requests').select('*').eq('to_nick',me.nick).eq('status','pending');
  friendRequests=data||[];
  // Também carregar pedidos que eu enviei
  const{data:sent}=await sb.from('friend_requests').select('to_nick').eq('from_nick',me.nick).eq('status','pending');
  sentFriendRequests=new Set((sent||[]).map(r=>r.to_nick));
  // Adicionar às notificações
  friendRequests.forEach(r=>{
    const exists=notifications.find(n=>n.type==='friend_req'&&n.nick===r.from_nick);
    if(!exists){
      addNotifSilent('friend_req','👋 @'+r.from_nick+' quer ser seu amigo!',r.from_nick);
    }
  });
  updateNotifBadge();
  renderNotifTab();
  renderNotifPanel();
  // Atualizar badge de pedidos
  const fReqBadge=$('friendReqBadge');
  if(fReqBadge){
    fReqBadge.textContent=friendRequests.length;
    fReqBadge.style.display=friendRequests.length>0?'inline-block':'none';
  }
}

// Adicionar notificação silenciosamente (sem incrementar contador se já existe)
function addNotifSilent(type,text,nick=''){
  const n={id:Date.now()+Math.random(),type,text,nick,time:new Date().toISOString(),read:false};
  notifications.unshift(n);
  if(notifications.length>50)notifications=notifications.slice(0,50);
  notifUnread++;
  try{localStorage.setItem('yk_notifs_'+me.nick,JSON.stringify(notifications.slice(0,30)));}catch(e){}
}

let friendSearchTimer=null;
async function searchUsers(q){
  const res=$('friendSearchResults');
  if(!res)return;
  if(!q||q.length<2){res.innerHTML='';return;}
  clearTimeout(friendSearchTimer);
  friendSearchTimer=setTimeout(async()=>{
    const{data}=await sb.from('users').select('nick,display_name,photo').ilike('nick','%'+q+'%').limit(6);
    if(!data||!data.length){res.innerHTML='<div style="font-size:11px;color:var(--muted);padding:4px 0">Nenhum usuário encontrado</div>';return;}
    res.innerHTML=data.filter(u=>u.nick!==me.nick).map(u=>`
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
        ${avHtml(u.nick,u.photo,28)}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:bold;color:var(--blue-dark)">${esc(u.display_name||u.nick)}</div>
          <div style="font-size:10px;color:var(--muted)">@${esc(u.nick)}</div>
        </div>
        ${myFriends.includes(u.nick)
          ?'<span style="font-size:10px;color:#2a9d2a">✓ amigo</span>'
          :`<button class="btn-s" style="margin:0;padding:3px 10px;font-size:11px" onclick="quickAddFriend('${esc(u.nick)}')">+ Adicionar</button>`}
      </div>`).join('');
  },350);
}

async function quickAddFriend(nick){
  await sendFriendRequest(nick);
  searchUsers($('friendInp').value);
}
async function renderFriends(){
  const{data:od}=await sb.from('online').select('nick').gte('last_seen',new Date(Date.now()-60000).toISOString());
  const os=new Set((od||[]).map(r=>r.nick));
  const{data:usersData}=await sb.from('users').select('nick,photo,display_name').in('nick',myFriends.length?myFriends:['__none__']);
  const photoMap={};(usersData||[]).forEach(u=>{photoMap[u.nick]={photo:u.photo,name:u.display_name||u.nick};});
  const html=myFriends.length?myFriends.map(f=>`<div class="fcard" title="${esc(photoMap[f]?.name||f)}">
    <div onclick="showUserProfile('${esc(f)}')">${avHtml(f,photoMap[f]?.photo,50)}</div>
    <div class="fname" onclick="showUserProfile('${esc(f)}')">${esc(photoMap[f]?.name||f)}</div>
    <div class="fstatus ${os.has(f)?'on':'off'}">${os.has(f)?'● online':'○ offline'}</div>
    <button onclick="removeFriend('${esc(f)}')" style="margin-top:3px;background:none;border:none;color:var(--muted);font-size:10px;cursor:pointer;padding:1px 4px;border-radius:3px" title="Remover amigo">✕</button>
  </div>`).join(''):'<div class="empty">Nenhum amigo ainda 😢</div>';
  $('fGrid').innerHTML=html;$('fGridSide').innerHTML=html;
}
function startDmFriend(nick){showTab('dm');setTimeout(()=>openDmConv(nick),100);}
async function removeFriend(nick){
  if(!confirm('Remover '+nick+' da sua lista de amigos?'))return;
  await sb.from('friends').delete().eq('nick',me.nick).eq('friend_nick',nick);
  await sb.from('friends').delete().eq('nick',nick).eq('friend_nick',me.nick);
  await loadFriends();toast(nick+' removido dos amigos');
}
function populateTarget(){
  const sel=$('scrapTarget');
  sel.innerHTML='<option value="">Para quem? (seus amigos)</option>';
  // Buscar nomes dos amigos para exibir melhor
  if(!myFriends.length)return;
  sb.from('users').select('nick,display_name').in('nick',myFriends).then(({data})=>{
    const names={};(data||[]).forEach(u=>{names[u.nick]=u.display_name||u.nick;});
    myFriends.forEach(f=>{
      const o=document.createElement('option');
      o.value=f;
      o.textContent=names[f]?`${names[f]} (@${f})`:f;
      sel.appendChild(o);
    });
  });
}

// ── COMUNIDADES ──
async function loadCommunities(){
  const{data}=await sb.from('communities').select('*').order('created_at',{ascending:false});
  renderCommunities(data||[]);
}
async function createCommunity(){
  const name=$('commName').value.trim(),emoji=$('commEmoji').value.trim()||'🌐';
  if(name.length<3)return toast('Nome muito curto');
  const{error}=await sb.from('communities').insert({name:esc(name),emoji,creator:me.nick,member_count:1});
  if(error)return toast('Erro: '+error.message);
  $('commName').value='';$('commEmoji').value='';await loadCommunities();toast('Comunidade criada! 🎉');
}
async function joinCommunity(id){
  await sb.from('community_members').upsert({community_id:id,nick:me.nick},{onConflict:'community_id,nick',ignoreDuplicates:true});
  const{count}=await sb.from('community_members').select('*',{count:'exact',head:true}).eq('community_id',id);
  await sb.from('communities').update({member_count:count}).eq('id',id);
  await loadCommunities();toast('Você entrou! 🏘️');
}
function renderCommunities(comms){
  const el=$('commList');
  if(!comms.length){el.innerHTML='<div class="empty">Nenhuma comunidade ainda!</div>';return;}
  el.innerHTML=comms.map(c=>`<div class="comm-item">
    <div class="comm-icon">${c.emoji||'🌐'}</div>
    <div class="comm-info"><div class="comm-name">${esc(c.name)}</div><div class="comm-members">${c.member_count||1} membro(s) · por ${esc(c.creator)}</div></div>
    <button class="btn-s" style="margin:0;padding:4px 10px;font-size:12px" onclick="openCommRoom('${c.id}','${esc(c.name).replace(/'/g,"\\'")}','${c.emoji||'🌐'}')">Entrar →</button>
  </div>`).join('');
  // Contar comunidades criadas pelo usuário
  const myCommsCount=comms.filter(c=>c.creator===me.nick).length;
  $('stComms').textContent=myCommsCount;
}

// ── SALA DA COMUNIDADE ──
let currentCommId=null,commChatChannel=null;
let commChatMediaB64=null,commChatMediaType=null;
let commVoiceRec=null,commVoiceChunks=[],commVoiceRecording=false;
let commImgBase64=null,commVidBase64=null,commAudBase64=null;
let commPostVoiceRec=null,commPostVoiceChunks=[],commPostVoiceRecording=false;

function openCommRoom(id,name,emoji){
  currentCommId=id;
  $('commRoomName').textContent=name;
  $('commRoomIcon').textContent=emoji||'🌐';
  $('commMainView').classList.add('hidden');
  $('commRoomView').classList.remove('hidden');
  switchCommTab('chat');
  loadCommMemberCount(id);
  joinCommunity(id);
}
function closeCommRoom(){
  currentCommId=null;
  if(commChatChannel){sb.removeChannel(commChatChannel);commChatChannel=null;}
  $('commRoomView').classList.add('hidden');
  $('commMainView').classList.remove('hidden');
}
async function loadCommMemberCount(id){
  const{count}=await sb.from('community_members').select('*',{count:'exact',head:true}).eq('community_id',id);
  $('commRoomMembers').textContent=(count||1)+' membros';
}

function switchCommTab(tab){
  ['chat','feed'].forEach(t=>{
    const btn=$('ctab-'+t),view=$('comm'+t.charAt(0).toUpperCase()+t.slice(1)+'View');
    if(btn)btn.classList.toggle('active',t===tab);
    if(view)view.classList.toggle('hidden',t!==tab);
  });
  if(tab==='chat'){loadCommChat();subscribeCommChat();}
  if(tab==='feed'){loadCommFeed();}
}

// ── CHAT DO GRUPO ──
async function loadCommChat(){
  if(!currentCommId)return;
  const{data}=await sb.from('community_chat').select('*').eq('community_id',currentCommId).order('created_at',{ascending:true}).limit(60);
  renderCommChat(data||[]);
}

function renderCommChat(msgs){
  const el=$('commChatMessages');
  if(!msgs.length){el.innerHTML='<div style="text-align:center;color:var(--muted);padding:30px 0;font-size:12px">Seja o primeiro a falar! 👋</div>';return;}
  el.innerHTML=msgs.map(m=>{
    const isMine=m.nick===me.nick;
    const mediaHtml=m.media_type&&m.media_data
      ?m.media_type.startsWith('image')?`<img src="${m.media_data}" onclick="this.style.maxWidth=this.style.maxWidth?'':'300px'">`
        :m.media_type.startsWith('video')?`<video src="${m.media_data}" controls></video>`
        :m.media_type.startsWith('audio')?`<audio src="${m.media_data}" controls></audio>`
        :''
      :'';
    const isAdm=me&&(me._isAdmin||me.nick==='apexzinn');
    return`<div class="cmsg ${isMine?'mine':'theirs'}">
      ${!isMine?`<div class="cmsg-nick clickable-nick" onclick="showUserProfile('${esc(m.nick)}')">${esc(m.display_name||m.nick)}</div>`:''}
      <div class="cmsg-bubble">
        ${m.text?esc(m.text):''}${mediaHtml}
        <div class="cmsg-time">${timeAgo(m.created_at)}${isAdm?` <button class="cmsg-del" onclick="adminDeleteChatMsg('${m.id}')">🗑️</button>`:isMine?` <button class="cmsg-del" onclick="adminDeleteChatMsg('${m.id}')">🗑️</button>`:''}</div>
      </div>
    </div>`;
  }).join('');
  el.scrollTop=el.scrollHeight;
}

function subscribeCommChat(){
  if(commChatChannel)sb.removeChannel(commChatChannel);
  if(!currentCommId)return;
  commChatChannel=sb.channel('comm-chat-'+currentCommId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'community_chat',filter:`community_id=eq.${currentCommId}`},()=>loadCommChat())
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'community_chat'},()=>loadCommChat())
    .subscribe();
}

async function sendCommChat(){
  if(!currentCommId)return;
  const text=$('commChatInput').value.trim();
  if(!text&&!commChatMediaB64)return;
  const row={
    community_id:currentCommId,nick:me.nick,
    display_name:me.display_name||me.nick,
    text:text?esc(text):'',
    media_data:commChatMediaB64||null,
    media_type:commChatMediaType||null,
    created_at:new Date().toISOString()
  };
  await sb.from('community_chat').insert(row);
  $('commChatInput').value='';
  clearCommChatMedia();
  botScanMessage(row);
}

function handleCommChatFile(input){
  const file=input.files[0];
  if(!file)return;
  const maxSize=file.type.startsWith('video')?20*1024*1024:8*1024*1024;
  if(file.size>maxSize){toast(file.type.startsWith('video')?'Vídeo muito grande! Máx 20MB':'Arquivo muito grande! Máx 8MB');input.value='';return;}
  toB64(file).then(b64=>{
    commChatMediaB64=b64;
    commChatMediaType=file.type;
    $('commChatMediaPreview').style.display='block';
    $('commChatImgPrev').style.display='none';
    $('commChatVidPrev').style.display='none';
    $('commChatAudPrev').style.display='none';
    if(file.type.startsWith('image')){$('commChatImgPrev').src=b64;$('commChatImgPrev').style.display='block';}
    else if(file.type.startsWith('video')){$('commChatVidPrev').src=b64;$('commChatVidPrev').style.display='block';}
    else if(file.type.startsWith('audio')){$('commChatAudPrev').src=b64;$('commChatAudPrev').style.display='block';}
    input.value='';
  });
}

function clearCommChatMedia(){
  commChatMediaB64=null;commChatMediaType=null;
  $('commChatMediaPreview').style.display='none';
  $('commChatImgPrev').src='';$('commChatVidPrev').src='';$('commChatAudPrev').src='';
}

// ── PERMISSÃO DE MICROFONE ──
function isSecureContext(){
  return window.isSecureContext||location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
}
async function requestMicPermission(){
  if(!isSecureContext()||typeof MediaRecorder==='undefined'||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    return false; // vai usar fallback de input
  }
  try{
    if(navigator.permissions){
      const perm=await navigator.permissions.query({name:'microphone'}).catch(()=>null);
      if(perm&&perm.state==='denied'){showMicDeniedDialog();return false;}
    }
    const testStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    testStream.getTracks().forEach(t=>t.stop());
    return true;
  }catch(e){
    if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError'){showMicDeniedDialog();}
    else if(e.name==='NotFoundError'){toast('Nenhum microfone encontrado no dispositivo 😢');}
    else{toast('Erro ao acessar microfone: '+e.message);}
    return false;
  }
}
function showMicDeniedDialog(){
  const existing=$('micPermModal');
  if(existing){existing.classList.remove('hidden');return;}
  const div=document.createElement('div');
  div.id='micPermModal';
  div.className='modal-bg';
  div.innerHTML=`<div class="modal" style="text-align:center">
    <div style="font-size:36px;margin-bottom:8px">🎤</div>
    <h3 style="margin-bottom:8px">Microfone bloqueado</h3>
    <p style="font-size:12px;color:var(--muted);line-height:1.8;margin-bottom:14px;text-align:left">
      O navegador bloqueou o microfone porque o arquivo está aberto localmente.<br><br>
      <b>Para liberar no computador:</b><br>
      1. Clique no <b>🔒 cadeado</b> na barra de endereço<br>
      2. Vá em <b>Permissões do site</b><br>
      3. Em <b>Microfone</b>, selecione <b>Permitir</b><br>
      4. Recarregue a página
    </p>
    <button class="btn-p" onclick="$('micPermModal').classList.add('hidden')">Entendido</button>
  </div>`;
  document.body.appendChild(div);
}

// ── VOZ NO CHAT ──
async function toggleCommVoiceRec(){
  const useNative=isSecureContext()&&typeof MediaRecorder!=='undefined'&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&!/iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!useNative){$('commChatAudioFallback').click();return;}
  if(!commVoiceRecording){
    const granted=await requestMicPermission();
    if(!granted)return;
    try{
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
        toast('Seu navegador não suporta gravação de áudio 😢');return;
      }
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      commVoiceChunks=[];
      // Detectar melhor codec disponível
      const mimeType=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ?'audio/webm;codecs=opus'
        :MediaRecorder.isTypeSupported('audio/webm')
        ?'audio/webm'
        :MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ?'audio/ogg;codecs=opus'
        :'';
      commVoiceRec=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
      const finalMime=commVoiceRec.mimeType||'audio/webm';
      commVoiceRec.ondataavailable=e=>{if(e.data&&e.data.size>0)commVoiceChunks.push(e.data);};
      commVoiceRec.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(commVoiceChunks,{type:finalMime});
        if(blob.size>5*1024*1024){toast('Áudio muito longo! Máx ~5min');return;}
        const reader=new FileReader();
        reader.onload=()=>{
          commChatMediaB64=reader.result;
          commChatMediaType=finalMime.split(';')[0];
          $('commChatMediaPreview').style.display='block';
          $('commChatImgPrev').style.display='none';$('commChatVidPrev').style.display='none';
          $('commChatAudPrev').src=reader.result;$('commChatAudPrev').style.display='block';
          toast('Áudio gravado! Envie agora 🎤');
        };
        reader.readAsDataURL(blob);
      };
      commVoiceRec.start(200);
      commVoiceRecording=true;
      $('commVoiceBtn').classList.add('voice-recording');
      $('commVoiceBtn').textContent='⏹';
      toast('Gravando... Toque de novo para parar 🎤');
    }catch(e){
      commVoiceRecording=false;
      toast('Erro ao gravar: '+e.message);
    }
  }else{
    try{commVoiceRec.stop();}catch(e){}
    commVoiceRecording=false;
    $('commVoiceBtn').classList.remove('voice-recording');
    $('commVoiceBtn').textContent='🎤';
  }
}

async function adminDeleteChatMsg(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de mensagem inválido');
  const{error}=await sb.from('community_chat').delete().eq('id',id);
  if(error)return toast('Erro ao apagar: '+error.message);
  toast('Mensagem apagada! 🗑️');
  botLog('Mensagem apagada manualmente (ID: '+id+')',true);
  loadCommChat();
}

// ── FEED DA COMUNIDADE ──
async function loadCommFeed(){
  if(!currentCommId)return;
  const{data}=await sb.from('community_posts').select('*').eq('community_id',currentCommId).order('created_at',{ascending:false}).limit(30);
  renderCommFeed(data||[]);
}

function previewCommImg(input){
  if(!input.files[0]){commImgBase64=null;commVidBase64=null;$('commPostImgPreview').style.display='none';$('commPostVidPreview').style.display='none';return;}
  const file=input.files[0];
  const maxSize=file.type.startsWith('video')?20*1024*1024:10*1024*1024;
  if(file.size>maxSize){toast(file.type.startsWith('video')?'Vídeo muito grande! Máx 20MB':'Imagem muito grande! Máx 10MB');input.value='';return;}
  // Limpar áudio se havia
  commAudBase64=null;$('commPostAudPreview').style.display='none';$('commPostAudPreview').src='';
  if($('commPostVoiceBtn'))$('commPostVoiceBtn').textContent='🎤 Áudio';
  toB64(file).then(b64=>{
    if(file.type.startsWith('video')){
      commVidBase64=b64;commImgBase64=null;
      $('commPostVidPreview').src=b64;$('commPostVidPreview').style.display='block';
      $('commPostImgPreview').style.display='none';
    }else{
      commImgBase64=b64;commVidBase64=null;
      $('commPostImgPreview').src=b64;$('commPostImgPreview').style.display='block';
      $('commPostVidPreview').style.display='none';
    }
  });
}

async function toggleCommPostVoice(){
  const useNative=isSecureContext()&&typeof MediaRecorder!=='undefined'&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&!/iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!useNative){$('commPostAudioFallback').click();return;}
  if(!commPostVoiceRecording){
    const granted=await requestMicPermission();
    if(!granted)return;
    try{
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
        toast('Seu navegador não suporta gravação de áudio 😢');return;
      }
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      commPostVoiceChunks=[];
      const mimeType=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ?'audio/webm;codecs=opus'
        :MediaRecorder.isTypeSupported('audio/webm')?'audio/webm'
        :MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')?'audio/ogg;codecs=opus':'';
      commPostVoiceRec=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
      const finalMime=commPostVoiceRec.mimeType||'audio/webm';
      commPostVoiceRec.ondataavailable=e=>{if(e.data&&e.data.size>0)commPostVoiceChunks.push(e.data);};
      commPostVoiceRec.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(commPostVoiceChunks,{type:finalMime});
        if(blob.size>8*1024*1024){toast('Áudio muito longo!');return;}
        // Limpar foto/vídeo se havia
        commImgBase64=null;commVidBase64=null;
        $('commPostImgPreview').style.display='none';$('commPostVidPreview').style.display='none';
        $('commPostImgInput').value='';
        const reader=new FileReader();
        reader.onload=()=>{
          commAudBase64=reader.result;
          $('commPostAudPreview').src=reader.result;
          $('commPostAudPreview').style.display='block';
          $('commPostVoiceBtn').textContent='🎤 Áudio';
          $('commPostVoiceBtn').classList.remove('voice-recording');
          toast('Áudio gravado! Poste agora 🎤');
        };
        reader.readAsDataURL(blob);
      };
      commPostVoiceRec.start(200);
      commPostVoiceRecording=true;
      $('commPostVoiceBtn').classList.add('voice-recording');
      $('commPostVoiceBtn').textContent='⏹ Parar';
      toast('Gravando áudio... Toque ⏹ para parar 🎤');
    }catch(e){
      commPostVoiceRecording=false;
      toast('Erro ao gravar: '+e.message);
    }
  }else{
    try{commPostVoiceRec.stop();}catch(e){}
    commPostVoiceRecording=false;
  }
}

function handleCommPostAudioFallback(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>8*1024*1024){toast('Áudio muito grande! Máx 8MB');input.value='';return;}
  commImgBase64=null;commVidBase64=null;
  $('commPostImgPreview').style.display='none';$('commPostVidPreview').style.display='none';
  toB64(file).then(b64=>{
    commAudBase64=b64;
    $('commPostAudPreview').src=b64;$('commPostAudPreview').style.display='block';
    toast('Áudio selecionado! Poste agora 🎤');
  });
}

async function sendCommPost(){
  if(!currentCommId)return;
  const text=$('commPostTxt').value.trim();
  const media=commImgBase64||commVidBase64||commAudBase64||null;
  const mtype=commVidBase64?'video':commImgBase64?'image':commAudBase64?'audio':null;
  if(!text&&!media)return toast('Escreva algo ou adicione uma mídia!');
  const{error}=await sb.from('community_posts').insert({
    community_id:currentCommId,author_nick:me.nick,
    display_name:me.display_name||me.nick,author_photo:me.photo||null,
    content:esc(text),image:media||null,media_type:mtype,
    likes:[],
    created_at:new Date().toISOString()
  });
  if(error)return toast('Erro: '+error.message);
  $('commPostTxt').value='';
  commImgBase64=null;commVidBase64=null;commAudBase64=null;
  $('commPostImgPreview').style.display='none';
  $('commPostVidPreview').style.display='none';
  $('commPostAudPreview').style.display='none';$('commPostAudPreview').src='';
  $('commPostImgInput').value='';
  if($('commPostVoiceBtn'))$('commPostVoiceBtn').textContent='🎤 Áudio';
  toast('Postado! 🎉');loadCommFeed();
}

function renderCommFeed(posts){
  const w=$('commFeedWall');
  if(!posts.length){w.innerHTML='<div class="empty">Nenhuma postagem ainda nesta comunidade! 🌟</div>';return;}
  const isAdmin=me&&(me._isAdmin||me.nick==='apexzinn');
  w.innerHTML=posts.map(p=>{
    const likes=Array.isArray(p.likes)?p.likes:[];
    const liked=likes.includes(me.nick);
    return`<div class="post-item" id="cpost-${p.id}">
    <div class="post-hdr">
      <div onclick="showUserProfile('${esc(p.author_nick)}')" style="cursor:pointer">${avHtml(p.author_nick,p.author_photo,32)}</div>
      <div><div class="clickable-nick" onclick="showUserProfile('${esc(p.author_nick)}')">${esc(p.display_name||p.author_nick)}</div><div style="font-size:10px;color:var(--muted)">@${esc(p.author_nick)}</div></div>
      <span class="post-time">${timeAgo(p.created_at)}</span>
    </div>
    ${p.content?`<div class="post-txt">${p.content}</div>`:''}
    ${p.image&&p.media_type==='video'?`<video class="post-img" src="${p.image}" controls style="max-height:260px"></video>`:''}
    ${p.image&&p.media_type==='audio'?`<audio src="${p.image}" controls style="width:100%;margin-bottom:6px"></audio>`:''}
    ${p.image&&p.media_type==='image'?`<img class="post-img" src="${p.image}" onclick="this.style.maxHeight=this.style.maxHeight==='none'?'300px':'none'" title="Clique para expandir">`:''}
    ${p.image&&!p.media_type?`<img class="post-img" src="${p.image}" onclick="this.style.maxHeight=this.style.maxHeight==='none'?'300px':'none'" title="Clique para expandir">`:''}
    <div class="post-actions">
      <button class="post-btn ${liked?'liked':''}" onclick="toggleCommLike('${p.id}',${JSON.stringify(likes)})">♥ ${likes.length}${liked?' curtido':' curtir'}</button>
      <button class="post-btn" onclick="toggleCommComments('${p.id}')">💬 comentar</button>
      ${isAdmin&&p.author_nick!==me.nick?`<button class="post-btn delete-own" onclick="adminDeleteCommPost('${p.id}')">🗑️ apagar</button>`:(p.author_nick===me.nick?`<button class="post-btn delete-own" onclick="deleteOwnCommPost('${p.id}')">🗑️</button>`:'')}
    </div>
    <div id="ccomments-${p.id}" class="post-comments hidden">
      <div id="ccomments-list-${p.id}"><div class="loading" style="padding:6px">Carregando...</div></div>
      <div class="comment-inp-row">
        <input class="comment-inp" id="ccomment-inp-${p.id}" placeholder="Comentar..." maxlength="200">
        <label class="comment-photo-btn" for="ccomment-img-${p.id}" title="Foto no comentário">📷</label>
        <input type="file" id="ccomment-img-${p.id}" accept="image/*" style="display:none" onchange="previewCommCommentImg(this,'${p.id}')">
        <button class="comment-send" onclick="sendCommComment('${p.id}')">Enviar</button>
      </div>
      <img id="ccomment-img-preview-${p.id}" style="display:none" class="comment-photo-preview" onclick="clearCommCommentImg('${p.id}')">
    </div>
  </div>`;
  }).join('');
}

// ── LIKES E COMENTÁRIOS DA COMUNIDADE ──
const commCommentImgs={};

async function toggleCommLike(postId,currentLikes){
  const idx=currentLikes.indexOf(me.nick);
  const newLikes=idx>=0?currentLikes.filter(n=>n!==me.nick):[...currentLikes,me.nick];
  await sb.from('community_posts').update({likes:newLikes}).eq('id',postId);
  // Atualizar botão localmente
  const allBtns=document.querySelectorAll(`#cpost-${postId} .post-actions .post-btn`);
  if(allBtns[0]){
    const liked=newLikes.includes(me.nick);
    allBtns[0].className='post-btn'+(liked?' liked':'');
    allBtns[0].textContent=`♥ ${newLikes.length}${liked?' curtido':' curtir'}`;
    allBtns[0].setAttribute('onclick',`toggleCommLike('${postId}',${JSON.stringify(newLikes)})`);
  }
}

async function toggleCommComments(postId){
  const el=$('ccomments-'+postId);
  el.classList.toggle('hidden');
  if(!el.classList.contains('hidden'))loadCommComments(postId);
}

async function loadCommComments(postId){
  const{data}=await sb.from('community_post_comments').select('*').eq('post_id',postId).order('created_at',{ascending:true});
  const el=$('ccomments-list-'+postId);
  if(!data||!data.length){el.innerHTML='<div style="color:var(--muted);font-size:11px;padding:4px 0">Nenhum comentário ainda</div>';return;}
  el.innerHTML=data.map(c=>`<div class="comment-item">
    <div class="comment-av">${c.author_photo?`<img src="${c.author_photo}">`:`${avatarOf(c.nick||'?')}`}</div>
    <div>
      <span class="comment-nick">${esc(c.display_name||c.nick)}</span>
      <span class="comment-txt"> ${esc(c.text||'')}</span>
      ${c.image?`<img class="comment-img" src="${c.image}" onclick="this.style.maxWidth=this.style.maxWidth?'':'100%'">`:''}
    </div>
  </div>`).join('');
}

async function sendCommComment(postId){
  const inp=$('ccomment-inp-'+postId);
  const text=inp.value.trim();
  const img=commCommentImgs[postId]||null;
  if(!text&&!img)return;
  await sb.from('community_post_comments').insert({
    post_id:postId,nick:me.nick,
    display_name:me.display_name||me.nick,
    author_photo:me.photo||null,
    text:esc(text||''),image:img
  });
  inp.value='';
  clearCommCommentImg(postId);
  loadCommComments(postId);
}

function previewCommCommentImg(input,postId){
  const file=input.files[0];
  if(!file)return;
  if(file.size>2*1024*1024){toast('Imagem muito grande! Máx 2MB');input.value='';return;}
  toB64(file).then(b64=>{
    commCommentImgs[postId]=b64;
    const prev=$('ccomment-img-preview-'+postId);
    prev.src=b64;prev.style.display='block';
    prev.title='Clique para remover';
  });
}

function clearCommCommentImg(postId){
  delete commCommentImgs[postId];
  const prev=$('ccomment-img-preview-'+postId);
  prev.src='';prev.style.display='none';
  $('ccomment-img-'+postId).value='';
}

async function adminDeleteCommPost(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de post inválido');
  if(!confirm('Apagar este post da comunidade?'))return;
  const{error}=await sb.from('community_posts').delete().eq('id',id);
  if(error)return toast('Erro ao apagar: '+error.message);
  toast('Post apagado! 🗑️');loadCommFeed();
}

// ══════════════════════════════════════════════════════════════════
// ⚠️  EXECUTE ESTE SQL NO SUPABASE → SQL Editor antes de usar:
//
// -- Tabela de posts da comunidade
// create table if not exists public.community_posts (
//   id uuid primary key default gen_random_uuid(),
//   community_id uuid references public.communities(id) on delete cascade,
//   author_nick text not null,
//   display_name text,
//   author_photo text,
//   content text,
//   image text,
//   media_type text,
//   likes text[] default '{}',
//   created_at timestamptz default now()
// );
// alter table public.community_posts enable row level security;
// create policy "allow all community_posts" on public.community_posts for all using (true) with check (true);
// alter publication supabase_realtime add table public.community_posts;
//
// -- Tabela de comentários dos posts da comunidade
// create table if not exists public.community_post_comments (
//   id uuid primary key default gen_random_uuid(),
//   post_id uuid references public.community_posts(id) on delete cascade,
//   nick text not null,
//   display_name text,
//   author_photo text,
//   text text,
//   image text,
//   created_at timestamptz default now()
// );
// alter table public.community_post_comments enable row level security;
// create policy "allow all community_post_comments" on public.community_post_comments for all using (true) with check (true);
// alter publication supabase_realtime add table public.community_post_comments;
//
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// ⚠️  EXECUTE TAMBÉM NO SUPABASE → SQL Editor:
//
// -- Tabela de pedidos de amizade
// create table if not exists public.friend_requests (
//   id uuid primary key default gen_random_uuid(),
//   from_nick text not null,
//   to_nick text not null,
//   status text default 'pending',
//   created_at timestamptz default now(),
//   unique(from_nick, to_nick)
// );
// alter table public.friend_requests enable row level security;
// create policy "allow all friend_requests" on public.friend_requests for all using (true) with check (true);
// alter publication supabase_realtime add table public.friend_requests;
//
// ══════════════════════════════════════════════════════════════════
const BOT_ADMIN='apexzinn';
function toggleBot(){
  const p=$('botPanel');
  p.classList.toggle('open');
}
function botLog(msg,deleted=false){
  const log=$('botLog');
  if(!log)return;
  const item=document.createElement('div');
  item.className='bot-log-item'+(deleted?' deleted':'');
  item.textContent='['+new Date().toLocaleTimeString('pt-BR')+'] '+msg;
  log.appendChild(item);
  log.scrollTop=log.scrollHeight;
}
function clearBotLog(){$('botLog').innerHTML='';}
function getBotBadWords(){
  return $('botBadWords').value.split(',').map(w=>w.trim().toLowerCase()).filter(Boolean);
}
function botScanMessage(msg){
  if(!$('botPanel'))return;
  const text=(msg.text||'').toLowerCase();
  const bad=getBotBadWords().find(w=>text.includes(w));
  if(bad){
    botLog('⚠️ Palavra proibida "'+bad+'" detectada de @'+(msg.nick||'?')+': "'+msg.text+'"',false);
    if($('botAutoDelete')&&$('botAutoDelete').checked){
      setTimeout(async()=>{
        // Apagar a mensagem mais recente do usuário com esse texto
        const{data}=await sb.from('community_chat').select('id').eq('nick',msg.nick).eq('text',msg.text).order('created_at',{ascending:false}).limit(1);
        if(data&&data[0]){
          await sb.from('community_chat').delete().eq('id',data[0].id);
          botLog('🗑️ Mensagem de @'+msg.nick+' deletada automaticamente.',true);
          loadCommChat();
        }
      },800);
    }
  }else{
    botLog('✅ Msg de @'+(msg.nick||'?')+': "'+(msg.text||'[mídia]')+'"');
  }
}
// Escutar TODAS as msgs do grupo ativo para o bot
function subscribeBotChannel(){
  sb.channel('bot-monitor').on('postgres_changes',{event:'INSERT',schema:'public',table:'community_chat'},payload=>{
    if(me&&(me._isAdmin||me.nick===BOT_ADMIN))botScanMessage(payload.new);
  }).subscribe();
}

// ── ONLINE ──
async function loadOnline(){
  const cutoff=new Date(Date.now()-60000).toISOString();
  const{data}=await sb.from('online').select('nick,last_seen').gte('last_seen',cutoff);
  const users=data||[];
  $('onlineTop').textContent='● '+users.length+' online';
  const html=users.length
    ?users.map(u=>`<div class="online-user">
        <div class="odot"></div>
        <span class="oname" style="cursor:pointer;flex:1" onclick="showTab('dm');setTimeout(()=>openDmConv('${esc(u.nick)}'),120)" title="Mandar DM">
          ${avatarOf(u.nick)} ${esc(u.nick)}
        </span>
        ${u.nick!==me.nick?`<button onclick="showTab('dm');setTimeout(()=>openDmConv('${esc(u.nick)}'),120)"
          style="background:none;border:1px solid var(--border);color:var(--blue);border-radius:8px;padding:2px 7px;font-size:10px;cursor:pointer">
          💬</button>`:''}
      </div>`).join('')
    :'<div class="empty">Ninguém online agora 😴</div>';
  $('onlineList').innerHTML=html;
  $('onlineSide').innerHTML=users.slice(0,6).map(u=>`<div class="online-user"><div class="odot"></div><span class="oname" style="cursor:pointer" onclick="showTab('dm');setTimeout(()=>openDmConv('${esc(u.nick)}'),120)">${esc(u.nick)}</span></div>`).join('')||'<div class="empty">Ninguém 😴</div>';
}

async function loadAll(){await Promise.all([loadFriends(),loadFeed(),loadScraps(),loadCommunities(),loadOnline(),loadDmUnread(),loadFriendRequests()]);}

// ── REALTIME ──
function subscribeRealtime(){
  const ch1=sb.channel('posts-rt').on('postgres_changes',{event:'*',schema:'public',table:'posts'},()=>loadFeed()).subscribe();
  const ch2=sb.channel('scraps-rt').on('postgres_changes',{event:'INSERT',schema:'public',table:'scraps'},payload=>{
    loadScraps();
    if(payload.new&&payload.new.to_nick===me.nick){
      scrapUnread++;updateScrapBadge();
      addNotif('scrap','📩 @'+payload.new.from_nick+' te enviou um recado!', payload.new.from_nick);
      toast('📩 Novo recado de @'+payload.new.from_nick+'!');
    }
  }).subscribe();
  const ch3=sb.channel('online-rt').on('postgres_changes',{event:'*',schema:'public',table:'online'},()=>{loadOnline();renderFriends();}).subscribe();
  const ch4=sb.channel('comms-rt').on('postgres_changes',{event:'*',schema:'public',table:'communities'},()=>loadCommunities()).subscribe();
  const ch5=sb.channel('dm-notify').on('postgres_changes',{event:'INSERT',schema:'public',table:'dms',filter:`to_nick=eq.${me.nick}`},async(payload)=>{
    const from=payload.new.from_nick;
    if(from!==currentDmPartner){
      unreadCounts[from]=(unreadCounts[from]||0)+1;
      updateDmBadge();
      addNotif('dm','💬 Nova mensagem de @'+from, from);
      toast('💬 Nova mensagem de @'+from+' — toque em Mensagens para ver');
      loadDmList();
    }
  }).subscribe();
  // Realtime para comentários do feed principal
  const ch6=sb.channel('comments-rt').on('postgres_changes',{event:'INSERT',schema:'public',table:'comments'},payload=>{
    const postId=payload.new.post_id;
    const el=$('comments-'+postId);
    if(el&&!el.classList.contains('hidden'))loadComments(postId);
    if(payload.new.nick!==me.nick){
      const post=allPosts.find(p=>p.id===postId);
      if(post&&(post.author_nick||post.nick)===me.nick){
        addNotif('comment','💬 @'+payload.new.nick+' comentou no seu post!', payload.new.nick);
        toast('💬 @'+payload.new.nick+' comentou no seu post!');
      }
    }
  }).subscribe();
  // Realtime para curtidas — detectar quando alguém curtiu seu post
  const ch6b=sb.channel('likes-rt').on('postgres_changes',{event:'UPDATE',schema:'public',table:'posts'},payload=>{
    if(!payload.new||!me) return;
    const post=payload.new;
    const isMyPost=(post.author_nick||post.nick)===me.nick;
    if(isMyPost){
      const oldLikes=Array.isArray(payload.old?.likes)?payload.old.likes:[];
      const newLikes=Array.isArray(post.likes)?post.likes:[];
      const newLiker=newLikes.find(n=>!oldLikes.includes(n)&&n!==me.nick);
      if(newLiker){
        addNotif('like','♥ @'+newLiker+' curtiu sua postagem!', newLiker);
        // toast sutil sem interferir
      }
    }
  }).subscribe();
  // Realtime para amizades novas
  const ch6c=sb.channel('friends-rt').on('postgres_changes',{event:'INSERT',schema:'public',table:'friends',filter:`friend_nick=eq.${me.nick}`},payload=>{
    if(!payload.new) return;
    const who=payload.new.nick;
    if(who!==me.nick){
      addNotif('follow','👥 @'+who+' agora é seu amigo!', who);
      toast('👥 @'+who+' te adicionou como amigo!');
      loadFriends();
    }
  }).subscribe();
  // Realtime para pedidos de amizade recebidos
  const ch6d=sb.channel('freq-rt').on('postgres_changes',{event:'INSERT',schema:'public',table:'friend_requests',filter:`to_nick=eq.${me.nick}`},payload=>{
    if(!payload.new) return;
    const who=payload.new.from_nick;
    if(who!==me.nick){
      friendRequests.unshift(payload.new);
      toast('👋 @'+who+' quer ser seu amigo!');
      updateNotifBadge();
      renderNotifPanel();
      renderNotifTab();
      const fReqBadge=$('friendReqBadge');
      if(fReqBadge){fReqBadge.textContent=friendRequests.length;fReqBadge.style.display='inline-block';}
    }
  }).subscribe();
  // Realtime para posts e comentários da comunidade
  const ch7=sb.channel('comm-posts-rt').on('postgres_changes',{event:'*',schema:'public',table:'community_posts'},()=>{
    if(currentCommId)loadCommFeed();
  }).subscribe();
  const ch8=sb.channel('comm-post-comments-rt').on('postgres_changes',{event:'INSERT',schema:'public',table:'community_post_comments'},payload=>{
    const postId=payload.new.post_id;
    const el=$('ccomments-'+postId);
    if(el&&!el.classList.contains('hidden'))loadCommComments(postId);
  }).subscribe();
  channels=[ch1,ch2,ch3,ch4,ch5,ch6,ch6b,ch6c,ch6d,ch7,ch8];
  // Inicia escuta de convites de jogo
  iniciarEscutaGameInvite();
}

// ── ENTER ──
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    const id=document.activeElement.id;
    if(id==='lNick'||id==='lPass')login();
    if(id==='rNick'||id==='rPass')register();
    if(id==='friendInp')addFriend();
    if(id==='scrapAnyNick')useAnyNickForScrap();
    if(id==='commName'||id==='commEmoji')createCommunity();
    if(id==='dmInput'){e.preventDefault();sendDm();}
    if(id==='dmNewNick')openDmWith();
    if(id==='commChatInput'){e.preventDefault();sendCommChat();}
  }
  // Ctrl+Enter envia post
  if(e.key==='Enter'&&e.ctrlKey&&document.activeElement.id==='postTxt'){
    e.preventDefault();sendPost();
  }
});

// ── NOVAS FUNÇÕES ──

// Variável global para posts em cache (busca no feed)
let allPosts=[];
let scrapUnread=0;

// ── MODO ESCURO ──
function toggleDark(){
  const isDark=document.body.classList.toggle('dark');
  $('darkBtn').textContent=isDark?'☀️':'🌙';
  localStorage.setItem('yk_dark',isDark?'1':'0');
}
function applyDarkPref(){
  if(localStorage.getItem('yk_dark')==='1'){
    document.body.classList.add('dark');
    const btn=$('darkBtn');if(btn)btn.textContent='☀️';
  }
}
applyDarkPref();

// ── VOLTAR AO TOPO ──
window.addEventListener('scroll',()=>{
  const btn=$('backToTop');if(!btn)return;
  btn.classList.toggle('show',window.scrollY>300);
});

// ── BUSCA NO FEED ──
function filterFeed(q){
  if(!q.trim()){renderFeed(allPosts);return;}
  const low=q.toLowerCase();
  renderFeed(allPosts.filter(p=>{
    const nick=(p.author_nick||p.nick||'').toLowerCase();
    const name=(p.display_name||'').toLowerCase();
    const content=(p.content||p.text||'').toLowerCase();
    return nick.includes(low)||name.includes(low)||content.includes(low);
  }));
}

// ── CONTADOR DE CARACTERES ──
function updateCharCount(textareaId,counterId,max){
  const ta=$(textareaId),c=$(counterId);if(!ta||!c)return;
  const len=ta.value.length;
  c.textContent=len+'/'+max;
  c.className='char-count'+(len>=max?' over':len>=max*0.85?' warn':'');
}

// ── BADGE DE RECADOS NÃO LIDOS ──
function updateScrapBadge(){
  const badge=$('scrapNotif');
  const mbadge=$('mScrapBadge');
  if(!badge||!mbadge)return;
  if(scrapUnread>0){
    badge.textContent=scrapUnread;badge.style.display='inline-block';
    mbadge.textContent=scrapUnread;mbadge.classList.remove('hidden');
  }else{
    badge.style.display='none';mbadge.classList.add('hidden');
  }
}

// Zerar badge ao abrir aba de scraps
function showTab(name){
  if(name!=='reels') closeReelsFullscreen();
  ['feed','scraps','dm','friends','communities','music','reels','games','online','notifications','adminpanel'].forEach(t=>{
    const el=$('tab-'+t);if(el)el.classList.add('hidden');
    const nav=$('nav-'+t);if(nav)nav.classList.remove('active');
    const mnav=$('mnav-'+t);if(mnav)mnav.classList.remove('active');
  });
  const tab=$('tab-'+name);if(tab)tab.classList.remove('hidden');
  const nav=$('nav-'+name);if(nav)nav.classList.add('active');
  const mnav=$('mnav-'+name);if(mnav)mnav.classList.add('active');
  if(name==='dm')loadDmList();
  if(name==='music')loadCommunityMusic();
  if(name==='reels') loadReels();
  if(name==='scraps'){scrapUnread=0;updateScrapBadge();}
  if(name==='notifications'){renderNotifTab();notifUnread=0;updateNotifBadge();}
  if(name==='adminpanel')loadAdminPanel();
  window.scrollTo({top:0,behavior:'smooth'});
}

// ── COMPARTILHAR POST ──
function sharePost(id,author,preview){
  const txt='@'+author+': '+preview+'...';
  if(navigator.share){navigator.share({title:'yakult.br',text:txt}).catch(()=>{});}
  else{
    navigator.clipboard.writeText(txt).then(()=>toast('📋 Texto copiado!')).catch(()=>toast('Não foi possível copiar'));
  }
}

// ── REELS (Instagram style) ──
let reelVideoB64=null,reelVideoMime=null,reelVideoFile=null;
let _reelsMuted=false;

// No-op stubs (fullscreen removido)
function openReelsFullscreen(){}
function closeReelsFullscreen(){
  document.querySelectorAll('#reelsWall video').forEach(v=>v.pause());
}
function closeReels(){
  closeReelsFullscreen();
  showTab('feed');
}

// Upload modal
function openReelUpload(){
  const m=$('reelUploadModal');if(m)m.style.display='flex';
}
function closeReelUpload(){
  const m=$('reelUploadModal');if(m)m.style.display='none';
  $('reelVidPreview').src='';
  $('reelVidPreviewWrap').style.display='none';
  $('reelSelectBtn').style.display='flex';
  $('reelCaptionWrap').style.display='none';
  $('reelCaption').value='';
  $('reelVideoInput').value='';
  reelVideoB64=null;reelVideoMime=null;reelVideoFile=null;
}

function previewReelVideo(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>524288000){toast('❌ Vídeo muito grande! Máx 500 MB');input.value='';return;}
  const objectUrl=URL.createObjectURL(file);
  const vid=$('reelVidPreview');
  vid.src=objectUrl;
  vid.onloadedmetadata=()=>{
    if(vid.duration>300){
      toast('❌ Vídeo muito longo! Máx 5 minutos');
      vid.src='';URL.revokeObjectURL(objectUrl);input.value='';
      $('reelVidPreviewWrap').style.display='none';
      $('reelSelectBtn').style.display='flex';
      $('reelCaptionWrap').style.display='none';
      reelVideoFile=null;reelVideoB64=null;reelVideoMime=null;
      return;
    }
    // Guarda o File para enviar via Storage (sem ler como base64)
    reelVideoFile=file;
    reelVideoB64=null;reelVideoMime=null;
    $('reelVidPreviewWrap').style.display='block';
    $('reelSelectBtn').style.display='none';
    $('reelCaptionWrap').style.display='block';
  };
}

async function publishReel(){
  if(!reelVideoFile&&!reelVideoB64){toast('Selecione um vídeo!');return;}
  const caption=$('reelCaption').value.trim();
  const prog=$('reelUploadProg');
  const bar=$('reelUploadProgBar');
  const btn=$('reelPublishBtn');
  prog.style.display='block';bar.style.width='10%';btn.disabled=true;
  try{
    let videoUrl;
    if(reelVideoFile){
      // Upload via Supabase Storage (suporta arquivos grandes)
      const ext=reelVideoFile.name.split('.').pop()||'mp4';
      const storagePath=`${me.nick}/${Date.now()}.${ext}`;
      bar.style.width='40%';
      const{data:upData,error:upErr}=await sb.storage
        .from('reels')
        .upload(storagePath,reelVideoFile,{contentType:reelVideoFile.type,upsert:false});
      if(upErr)throw upErr;
      bar.style.width='75%';
      const{data:urlData}=sb.storage.from('reels').getPublicUrl(upData.path);
      videoUrl=urlData.publicUrl;
    } else {
      // Fallback: base64 (vídeos antigos/pequenos)
      videoUrl=reelVideoB64;
      bar.style.width='75%';
    }
    const{error:dbErr}=await sb.from('reels').insert({
      author:me.nick,
      author_photo:me.photo||null,
      caption,
      video_url:videoUrl,
      likes:[],
      created_at:new Date().toISOString()
    });
    if(dbErr)throw dbErr;
    bar.style.width='100%';
    setTimeout(()=>{prog.style.display='none';bar.style.width='0%';},600);
    toast('🎬 Reel publicado!');
    reelVideoFile=null;
    closeReelUpload();
    loadReels();
  }catch(e){
    prog.style.display='none';btn.disabled=false;
    toast('Erro ao publicar: '+e.message);
  }
}

async function loadReels(){
  const wall=$('reelsWall');
  if(!wall)return;
  wall.innerHTML='<div class="reel-empty">Carregando reels...</div>';
  const{data,error}=await sb.from('reels').select('*').order('created_at',{ascending:false}).limit(30);
  if(error){
    wall.innerHTML='<div class="reel-empty">Erro ao carregar reels 😕<br><small style="opacity:.6">'+error.message+'</small></div>';
    return;
  }
  if(!data||!data.length){
    wall.innerHTML='<div class="reel-empty">Nenhum reel ainda.<br>Seja o primeiro a postar! 🎬</div>';
    return;
  }
  wall.innerHTML='';
  data.forEach(r=>wall.appendChild(buildReelItem(r)));
  // Auto-play first
  const firstVid=wall.querySelector('video');
  if(firstVid){firstVid.muted=_reelsMuted;firstVid.play().catch(()=>{firstVid.muted=true;firstVid.play().catch(()=>{});});}
  // Intersection observer to auto-play on scroll
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      const vid=e.target.querySelector('video');
      if(!vid)return;
      if(e.isIntersecting){
        document.querySelectorAll('#reelsWall video').forEach(v=>{if(v!==vid)v.pause();});
        vid.muted=_reelsMuted;
        vid.play().catch(()=>{vid.muted=true;vid.play().catch(()=>{});});
        // Show/hide play icon
        const id=e.target.id.replace('reel-','');
        const icon=document.getElementById('rpi-'+id);
        if(icon)icon.classList.remove('visible');
      }else{
        vid.pause();
      }
    });
  },{threshold:0.6});
  wall.querySelectorAll('.reel-item').forEach(item=>obs.observe(item));
}

function buildReelItem(r){
  const likes=Array.isArray(r.likes)?r.likes:[];
  const liked=me&&likes.includes(me.nick);
  const wrap=document.createElement('div');
  wrap.className='reel-item';
  wrap.id='reel-'+r.id;

  const isVideo=r.video_url&&(r.video_url.startsWith('data:video')||r.video_url.match(/\.(mp4|mov|webm)/i)||r.video_url.includes('/reels/')||r.video_url.includes('supabase'));

  wrap.innerHTML=`
    ${isVideo
      ?`<video id="rvid-${r.id}" src="${r.video_url}" loop playsinline preload="none" style="width:100%;height:100%;object-fit:cover;display:block;" onclick="toggleReelPlay('${r.id}')"></video>`
      :`<img class="reel-thumb" src="${r.video_url}" alt="reel" style="width:100%;height:100%;object-fit:cover;">`
    }
    <div class="reel-play-icon" id="rpi-${r.id}">▶</div>

    <!-- Right action buttons -->
    <div class="reel-actions">
      <div class="reel-act">
        <button class="reel-act-btn${liked?' liked':''}" id="rlike-btn-${r.id}" onclick="likeReel('${r.id}')" title="Curtir">
          ${liked?'❤️':'🤍'}
        </button>
        <span class="reel-act-label" id="rlike-cnt-${r.id}">${likes.length||''}</span>
      </div>
      <div class="reel-act">
        <button class="reel-act-btn" onclick="openReelCommentDm('${esc(r.author)}')" title="Mensagem">💬</button>
        <span class="reel-act-label">DM</span>
      </div>
      <div class="reel-act">
        <button class="reel-act-btn" onclick="shareReel('${r.id}','${esc(r.author)}')" title="Compartilhar">➤</button>
        <span class="reel-act-label">Enviar</span>
      </div>
      <div class="reel-act">
        <button class="reel-act-btn" onclick="toggleReelMute('${r.id}')" id="rmute-${r.id}" title="Som">
          ${_reelsMuted?'🔇':'🔊'}
        </button>
      </div>
      ${me&&me.nick===r.author?`<div class="reel-act"><button class="reel-act-btn" onclick="deleteReel('${r.id}')" title="Excluir" style="font-size:20px;">🗑️</button></div>`:''}
    </div>

    <!-- Mute badge bottom-left -->
    <div class="reel-mute-badge" id="rmutebadge-${r.id}" style="display:${_reelsMuted?'flex':'none'}" onclick="toggleReelMute('${r.id}')">🔇</div>

    <!-- Bottom overlay info -->
    <div class="reel-overlay">
      <div class="reel-author-row">
        <div class="reel-av" onclick="openUserProfile('${esc(r.author)}');event.stopPropagation()">
          ${r.author_photo?`<img src="${r.author_photo}">`:`<span>${avatarOf(r.author)}</span>`}
        </div>
        <span class="reel-nick clickable-nick" onclick="openUserProfile('${esc(r.author)}')">@${esc(r.author)}</span>
        ${me&&me.nick!==r.author?`<button class="reel-follow-btn" onclick="addFriendByNick('${esc(r.author)}')">Seguir</button>`:''}
      </div>
      ${r.caption?`<div class="reel-caption">${esc(r.caption)}</div>`:''}
      <div class="reel-audio-row">
        <div class="reel-audio-disc">🎵</div>
        <span>yakult.br · Som original</span>
      </div>
    </div>
  `;
  return wrap;
}

function toggleReelPlay(id){
  const vid=document.getElementById('rvid-'+id);
  if(!vid)return;
  const icon=document.getElementById('rpi-'+id);
  if(vid.paused){
    document.querySelectorAll('#reelsWall video').forEach(v=>{if(v!==vid)v.pause();});
    vid.play().catch(()=>{});
    if(icon)icon.classList.remove('visible');
  }else{
    vid.pause();
    if(icon)icon.classList.add('visible');
  }
}

function toggleReelMute(id){
  _reelsMuted=!_reelsMuted;
  document.querySelectorAll('#reelsWall video').forEach(v=>{v.muted=_reelsMuted;});
  document.querySelectorAll('[id^="rmute-"]').forEach(b=>{b.textContent=_reelsMuted?'🔇':'🔊';});
  document.querySelectorAll('[id^="rmutebadge-"]').forEach(b=>{b.style.display=_reelsMuted?'flex':'none';});
}

async function likeReel(id){
  if(!me)return;
  const{data}=await sb.from('reels').select('likes').eq('id',id).maybeSingle();
  if(!data)return;
  let likes=Array.isArray(data.likes)?data.likes:[];
  const isLiked=likes.includes(me.nick);
  if(isLiked)likes=likes.filter(n=>n!==me.nick);
  else likes=[...likes,me.nick];
  await sb.from('reels').update({likes}).eq('id',id);
  const btn=document.getElementById('rlike-btn-'+id);
  const cnt=document.getElementById('rlike-cnt-'+id);
  const nowLiked=likes.includes(me.nick);
  if(btn){btn.classList.toggle('liked',nowLiked);btn.textContent=nowLiked?'❤️':'🤍';}
  if(cnt)cnt.textContent=likes.length||'';
}

function openReelCommentDm(author){
  if(!author||author===me?.nick)return;
  closeReels();
  showTab('dm');
  setTimeout(()=>openDmWith(author),300);
}

function addFriendByNick(nick){
  if(!nick||nick===me?.nick)return;
  $('friendInp').value=nick;
  addFriend();
  toast('Pedido de amizade enviado para @'+nick+' ✅');
}

function shareReel(id,author){
  const txt='🎬 Reel de @'+author+' no yakult.br';
  if(navigator.share){navigator.share({title:'yakult.br',text:txt}).catch(()=>{});}
  else{navigator.clipboard.writeText(txt).then(()=>toast('📋 Copiado!')).catch(()=>{});}
}

async function deleteReel(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de reel inválido');
  if(!confirm('Excluir este reel?'))return;
  const{error}=await sb.from('reels').delete().eq('id',id);
  if(error)return toast('Erro ao excluir: '+error.message);
  toast('🗑️ Reel excluído');
  loadReels();
}

// ── DELETAR PRÓPRIO POST ──
async function deleteOwnPost(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de post inválido');
  if(!confirm('Apagar sua postagem?'))return;
  // Verifica se o post pertence ao usuário logado antes de apagar
  const{data:postCheck}=await sb.from('posts').select('id').eq('id',id).eq('author_nick',me.nick).maybeSingle();
  if(!postCheck)return toast('Post não encontrado ou sem permissão');
  const{error:errCom}=await sb.from('comments').delete().eq('post_id',id);
  if(errCom)console.warn('Erro ao apagar comentários:',errCom.message);
  const{error}=await sb.from('posts').delete().eq('id',id).eq('author_nick',me.nick);
  if(error)return toast('Erro ao apagar post: '+error.message);
  toast('Post apagado 🗑️');
  loadFeed();
}
async function deleteOwnCommPost(id){
  if(!id||typeof id!=='string'||id.length<5)return toast('Erro: ID de post inválido');
  if(!confirm('Apagar sua postagem?'))return;
  const{data:postCheck}=await sb.from('community_posts').select('id').eq('id',id).eq('author_nick',me.nick).maybeSingle();
  if(!postCheck)return toast('Post não encontrado ou sem permissão');
  const{error}=await sb.from('community_posts').delete().eq('id',id).eq('author_nick',me.nick);
  if(error)return toast('Erro ao apagar post: '+error.message);
  toast('Post apagado 🗑️');
  loadCommFeed();
}

// ── INDICADOR DE DIGITAÇÃO (DM) ──
let typingTimeout=null;
let typingChannel=null;
function sendTypingSignal(){
  if(!currentDmPartner||!me)return;
  const ch='typing-'+dmKey(me.nick,currentDmPartner);
  sb.channel(ch).send({type:'broadcast',event:'typing',payload:{nick:me.nick}}).catch(()=>{});
}
function subscribeTyping(partner){
  if(typingChannel){sb.removeChannel(typingChannel);typingChannel=null;}
  const ch='typing-'+dmKey(me.nick,partner);
  typingChannel=sb.channel(ch).on('broadcast',{event:'typing'},payload=>{
    if(payload.payload.nick===partner){
      const el=$('dmTypingIndicator');if(!el)return;
      el.innerHTML=partner+' está digitando <span class="dot-blink"><span>.</span><span>.</span><span>.</span></span>';
      clearTimeout(typingTimeout);
      typingTimeout=setTimeout(()=>{if(el)el.innerHTML='';},2000);
    }
  }).subscribe();
}

// ── ENTER NO COMMENT INPUT ──
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    const el=document.activeElement;
    if(el&&el.classList.contains('comment-inp')){
      e.preventDefault();
      const id=el.id.replace('comment-inp-','').replace('ccomment-inp-','');
      if(el.id.startsWith('ccomment-'))sendCommComment(id);
      else sendComment(id);
    }
  }
});

// ══════════════════════════════════════════════════════════════════
// ── NOTIFICAÇÕES ──
// ══════════════════════════════════════════════════════════════════
let notifications = [];
let notifUnread = 0;

function addNotif(type, text, nick='', action=null){
  const n = {
    id: Date.now()+Math.random(),
    type, text, nick, action,
    time: new Date().toISOString(),
    read: false
  };
  notifications.unshift(n);
  if(notifications.length > 50) notifications = notifications.slice(0,50);
  notifUnread++;
  updateNotifBadge();
  renderNotifPanel();
  // Salvar no localStorage
  try{ localStorage.setItem('yk_notifs_'+me.nick, JSON.stringify(notifications.slice(0,30))); }catch(e){}
}

function loadNotifications(){
  try{
    const saved = localStorage.getItem('yk_notifs_'+me.nick);
    if(saved) notifications = JSON.parse(saved);
  }catch(e){ notifications=[]; }
  notifUnread = notifications.filter(n=>!n.read).length;
  updateNotifBadge();
  renderNotifPanel();
}

function updateNotifBadge(){
  const badge = $('notifBadge');
  const navBadge = $('notifNavBadge');
  if(notifUnread>0){
    if(badge){ badge.textContent=notifUnread; badge.style.display='flex'; }
    if(navBadge){ navBadge.textContent=notifUnread; navBadge.classList.remove('hidden'); }
  } else {
    if(badge) badge.style.display='none';
    if(navBadge) navBadge.classList.add('hidden');
  }
}

function toggleNotifPanel(){
  const p = $('notifPanel');
  p.classList.toggle('open');
  if(p.classList.contains('open')){
    // Fechar ao clicar fora
    setTimeout(()=>{
      document.addEventListener('click', closeNotifOutside, {once:true});
    }, 10);
  }
}

function closeNotifOutside(e){
  const p = $('notifPanel');
  if(p && !p.contains(e.target) && !$('notifBellBtn').contains(e.target)){
    p.classList.remove('open');
  }
}

function markAllNotifsRead(){
  notifications.forEach(n=>n.read=true);
  notifUnread=0;
  updateNotifBadge();
  renderNotifPanel();
  renderNotifTab();
  try{ localStorage.setItem('yk_notifs_'+me.nick, JSON.stringify(notifications.slice(0,30))); }catch(e){}
}

function clearAllNotifs(){
  notifications=[];notifUnread=0;
  updateNotifBadge();renderNotifPanel();renderNotifTab();
  try{ localStorage.removeItem('yk_notifs_'+me.nick); }catch(e){}
}

const notifIcons = {like:'♥',comment:'💬',scrap:'📩',dm:'💬',follow:'👥',system:'🔔'};

function renderNotifPanel(){
  const el = $('notifList');
  if(!el) return;
  const reqHtml = friendRequests.slice(0,3).map(r=>`
    <div class="notif-item unread" style="flex-direction:column;align-items:flex-start;gap:5px">
      <div style="display:flex;align-items:center;gap:6px">
        <div class="notif-icon">👋</div>
        <div class="notif-txt"><b>@${esc(r.from_nick)}</b> quer ser seu amigo!</div>
      </div>
      <div style="display:flex;gap:6px;padding-left:26px">
        <button class="btn-s" style="margin:0;padding:2px 10px;font-size:10px;background:#2a9d2a" onclick="acceptFriendRequest('${esc(r.from_nick)}')">✓ Aceitar</button>
        <button class="btn-s" style="margin:0;padding:2px 10px;font-size:10px;background:#888" onclick="rejectFriendRequest('${esc(r.from_nick)}')">✕ Recusar</button>
      </div>
    </div>`).join('');
  const notifHtml = notifications.filter(n=>n.type!=='friend_req').slice(0,12).map(n=>`
    <div class="notif-item${n.read?'':' unread'}" onclick="onNotifClick('${n.id}')">
      <div class="notif-icon">${notifIcons[n.type]||'🔔'}</div>
      <div class="notif-body">
        <div class="notif-txt">${esc(n.text)}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
    </div>`).join('');
  if(!reqHtml&&!notifHtml){ el.innerHTML='<div class="notif-empty">Nenhuma notificação ainda 🔕</div>'; return; }
  el.innerHTML = reqHtml + notifHtml;
}

function renderNotifTab(){
  const el = $('notifTabList');
  if(!el) return;
  // Pedidos de amizade pendentes primeiro
  const reqHtml = friendRequests.map(r=>`
    <div class="notif-item unread" style="border-radius:6px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="notif-icon">👋</div>
      <div class="notif-body" style="flex:1">
        <div class="notif-txt"><b>@${esc(r.from_nick)}</b> quer ser seu amigo!</div>
        <div style="display:flex;gap:6px;margin-top:5px">
          <button class="btn-s" style="margin:0;padding:3px 12px;font-size:11px;background:#2a9d2a" onclick="acceptFriendRequest('${esc(r.from_nick)}')">✓ Aceitar</button>
          <button class="btn-s" style="margin:0;padding:3px 12px;font-size:11px;background:#888" onclick="rejectFriendRequest('${esc(r.from_nick)}')">✕ Recusar</button>
        </div>
      </div>
    </div>`).join('');
  const notifHtml = notifications.filter(n=>n.type!=='friend_req').map(n=>`
    <div class="notif-item${n.read?'':' unread'}" onclick="onNotifClick('${n.id}')" style="border-radius:6px;margin-bottom:4px">
      <div class="notif-icon">${notifIcons[n.type]||'🔔'}</div>
      <div class="notif-body">
        <div class="notif-txt">${esc(n.text)}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
    </div>`).join('');
  if(!reqHtml&&!notifHtml){ el.innerHTML='<div class="empty">Nenhuma notificação ainda 🔕</div>'; return; }
  el.innerHTML = reqHtml + notifHtml;
}

function onNotifClick(id){
  const n = notifications.find(x=>String(x.id)===String(id));
  if(!n) return;
  n.read = true;
  updateNotifBadge();
  renderNotifPanel();
  $('notifPanel').classList.remove('open');
  try{ localStorage.setItem('yk_notifs_'+me.nick, JSON.stringify(notifications.slice(0,30))); }catch(e){}
  // Navegar para a aba relevante
  if(n.type==='scrap'){ showTab('scraps'); }
  else if(n.type==='dm'){ showTab('dm'); if(n.nick)setTimeout(()=>openDmConv(n.nick),100); }
  else if(n.type==='like'||n.type==='comment'){ showTab('feed'); }
}

// ══════════════════════════════════════════════════════════════════
// ── PERFIL DE OUTRO USUÁRIO ──
// ══════════════════════════════════════════════════════════════════
async function showUserProfile(nick){
  if(!nick || nick === me.nick){ openEditProfile(); return; }
  const modal = $('userProfileModal');
  modal.classList.remove('hidden');
  $('pmAv').innerHTML = avatarOf(nick);
  $('pmName').textContent = '...';
  $('pmNick').textContent = '@'+nick;
  $('pmBio').textContent = '';
  $('pmPosts').textContent = '—';
  $('pmFriends').textContent = '—';
  $('pmActions').innerHTML = '<div class="loading" style="padding:6px">Carregando...</div>';
  $('pmPostsGrid').innerHTML = '';
  $('pmPostsLabel').style.display = 'none';
  // Varied cover color per nick
  const hues=['135deg,#3a62aa,#628ad2,#e9007e','135deg,#1a6a4a,#27ae60,#2ecc71','135deg,#6c3483,#8e44ad,#e91e63','135deg,#b7410e,#e67e22,#f39c12'];
  let hi=0;for(const ch of nick)hi=(hi*31+ch.charCodeAt(0))%hues.length;
  $('pmCover').style.background='linear-gradient('+hues[hi]+')';
  // Fetch user data + posts
  const [uRes, friendsRes, postsRes] = await Promise.all([
    sb.from('users').select('nick,display_name,bio,photo,site,is_admin,font_style,farm_title').eq('nick',nick).maybeSingle(),
    sb.from('friends').select('*',{count:'exact',head:true}).eq('nick',nick),
    sb.from('posts').select('id,content,image,created_at,likes').eq('author_nick',nick).order('created_at',{ascending:false}).limit(12),
  ]);
  const uData = uRes.data;
  if(!uData){ $('pmName').textContent='Usuário não encontrado'; $('pmActions').innerHTML='<div style="color:var(--muted);font-size:12px;padding:8px">Este usuário não existe ou foi removido.</div>'; return; }
  // Avatar
  $('pmAv').innerHTML = avHtml(nick, uData.photo, 72);
  // Name + admin badge
  const isPostAdm = uData.is_admin;
  const admBadge = isPostAdm ? '<span class="title-badge title-admin" style="font-size:11px;">⭐ ADM ⭐</span>' : '';
  const fCss = isPostAdm && uData.font_style && uData.font_style!=='normal'
    ? (uData.font_style==='cursive'?'font-family:\'Poppins\',Georgia,serif;font-style:italic;':uData.font_style==='bold'?'font-family:\'Poppins\',sans-serif;font-weight:900;letter-spacing:1px;':uData.font_style==='pixel'?'font-family:\'Press Start 2P\',monospace;letter-spacing:2px;font-size:.85em;':'')
    : '';
  $('pmName').innerHTML = `<span style="${fCss}">${esc(uData.display_name||nick)}</span>${admBadge}`;
  $('pmNick').textContent = '@'+nick;
  $('pmBio').textContent = uData.bio || 'Sem bio ainda.';
  // Site
  if(uData.site){
    $('pmSite').style.display='block';
    $('pmSiteTxt').textContent=uData.site.replace(/^https?:\/\//,'');
    $('pmSiteLink').href=uData.site.startsWith('http')?uData.site:'https://'+uData.site;
  } else { $('pmSite').style.display='none'; }
  $('pmPosts').textContent = (postsRes.data||[]).length;
  $('pmFriends').textContent = friendsRes.count || 0;
  const isFriend = myFriends.includes(nick);
  const hasPendingReq = friendRequests.some(r=>r.from_nick===nick);
  const iSentReq = sentFriendRequests.has(nick);
  const isAdm = me._isAdmin || me.nick==='apexzinn';
  $('pmActions').innerHTML = `
    <button class="btn-blue" onclick="closeUserProfile();showTab('dm');setTimeout(()=>openDmConv('${esc(nick)}'),100)">💬 Mensagem</button>
    ${isFriend
      ? `<button class="btn-s" style="background:#888;margin:0" onclick="closeUserProfile();removeFriend('${esc(nick)}')">✕ Remover amigo</button>`
      : hasPendingReq
        ? `<button class="btn-s" style="background:#2a9d2a;margin:0" onclick="closeUserProfile();acceptFriendRequest('${esc(nick)}')">✓ Aceitar pedido</button>`
        : iSentReq
          ? `<button class="btn-s" style="background:#888;margin:0" disabled>Pedido enviado ✓</button>`
          : `<button class="btn-s" style="margin:0" onclick="closeUserProfile();sendFriendRequest('${esc(nick)}')">+ Adicionar amigo</button>`
    }
    ${isAdm ? `<button class="btn-s" style="background:#e07000;margin:0" onclick="adminRenameUser('${esc(nick)}')">✏️ Renomear</button>` : ''}
    ${isAdm ? `<button class="btn-s" style="background:#c00;margin:0" onclick="adminBanUser('${esc(nick)}')">🚫 Banir</button>` : ''}
  `;
  // Posts grid
  const posts = postsRes.data||[];
  if(posts.length){
    $('pmPostsLabel').style.display='block';
    $('pmPostsGrid').innerHTML = posts.map(p=>{
      if(p.image){
        return`<div class="pm-post-thumb" onclick="closeUserProfile();showTab('feed')">
          <img src="${p.image}" loading="lazy">
          <div class="pm-thumb-overlay">♥ ${Array.isArray(p.likes)?p.likes.length:0}</div>
        </div>`;
      } else {
        return`<div class="pm-post-text" onclick="closeUserProfile();showTab('feed')">
          <p>${esc((p.content||'').substring(0,100))}</p>
        </div>`;
      }
    }).join('');
  }
}

function closeUserProfile(){
  $('userProfileModal').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════
// ── PAINEL ADM REAL ──
// ══════════════════════════════════════════════════════════════════
function switchAdmTab(tab){
  ['bot','users','stats'].forEach(t=>{
    const el=$('admTab-'+t); if(el) el.style.display=t===tab?'block':'none';
    const btn=document.querySelector(`[onclick="switchAdmTab('${t}')"]`);
    if(btn) btn.classList.toggle('active',t===tab);
  });
  if(tab==='stats') loadAdmStats();
}

async function admSearchUsers(q){
  const el = $('admUserList');
  if(!q||q.length<2){ el.innerHTML='<div style="color:var(--muted);font-size:11px;text-align:center;padding:10px">Digite para buscar</div>'; return; }
  const {data} = await sb.from('users').select('nick,display_name,photo,is_admin').ilike('nick','%'+q+'%').limit(10);
  if(!data||!data.length){ el.innerHTML='<div style="color:var(--muted);font-size:11px;text-align:center;padding:10px">Nenhum usuário encontrado</div>'; return; }
  el.innerHTML = data.map(u=>`
    <div class="adm-user-row">
      ${avHtml(u.nick,u.photo,24)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:bold;font-size:11px;color:var(--blue-dark)">${esc(u.display_name||u.nick)}</div>
        <div style="font-size:10px;color:var(--muted)">@${esc(u.nick)}${u.is_admin?' 🛡️ ADM':''}</div>
      </div>
      <div class="adm-actions">
        <button class="adm-btn" onclick="admViewUser('${esc(u.nick)}')">👤</button>
        <button class="adm-btn" onclick="admToggleAdmin('${esc(u.nick)}',${!!u.is_admin})" title="${u.is_admin?'Remover ADM':'Tornar ADM'}">${u.is_admin?'⬇ ADM':'⬆ ADM'}</button>
        <button class="adm-btn danger" onclick="adminBanUser('${esc(u.nick)}')">🚫</button>
      </div>
    </div>`).join('');
}

async function admToggleAdmin(nick, isAdmin){
  if(nick===me.nick) return toast('Você não pode alterar seu próprio ADM!');
  if(!confirm((isAdmin?'Remover admin de ':'Tornar admin ')+'@'+nick+'?')) return;
  const {error} = await sb.from('users').update({is_admin:!isAdmin}).eq('nick',nick);
  if(error) return toast('Erro: '+error.message);
  toast((isAdmin?'Admin removido de ':'Admin dado para ')+'@'+nick+' ✓');
  admSearchUsers($('admUserSearch').value);
  botLog((isAdmin?'❌ ADM removido':'✅ ADM dado')+' para @'+nick+' por @'+me.nick);
  loadAdminCache();
}

async function admViewUser(nick){
  closeUserProfile(); // fechar se já aberto
  $('botPanel').classList.remove('open');
  showUserProfile(nick);
}

async function adminRenameUser(nick){
  if(nick===me.nick) return toast('Use "editar perfil" para você mesmo!');
  const newName=prompt('Novo nome de exibição para @'+nick+':');
  if(!newName||!newName.trim()) return;
  const {error}=await sb.from('users').update({display_name:newName.trim()}).eq('nick',nick);
  if(error) return toast('Erro: '+error.message);
  toast('@'+nick+' renomeado para "'+newName.trim()+'" ✓');
  botLog('✏️ @'+nick+' renomeado para "'+newName.trim()+'" por @'+me.nick);
  closeUserProfile();
  loadFeed();loadScraps();
}


async function adminBanUser(nick){
  if(!nick||typeof nick!=='string'||nick.length<3)return toast('Erro: nick inválido');
  if(nick===me.nick) return toast('Você não pode banir a si mesmo!');
  if(nick==='apexzinn') return toast('Não é possível banir o administrador principal!');
  // Verifica se o usuário existe
  const{data:userCheck}=await sb.from('users').select('nick').eq('nick',nick).maybeSingle();
  if(!userCheck)return toast('Usuário @'+nick+' não encontrado');
  if(!confirm('Banir e apagar todas as postagens de @'+nick+'? Esta ação é irreversível!')) return;
  // Apagar posts, comentários, recados (nunca apaga da tabela users)
  const results = await Promise.all([
    sb.from('posts').delete().eq('author_nick',nick),
    sb.from('comments').delete().eq('nick',nick),
    sb.from('scraps').delete().eq('from_nick',nick),
    sb.from('dms').delete().eq('from_nick',nick),
    sb.from('community_chat').delete().eq('nick',nick)
  ]);
  const errs = results.filter(r=>r.error).map(r=>r.error.message);
  if(errs.length) console.warn('Erros ao banir:', errs);
  toast('@'+nick+' banido e conteúdo removido 🚫');
  botLog('🚫 @'+nick+' banido por @'+me.nick, true);
  loadFeed(); loadScraps();
}

async function loadAdmStats(){
  const [{count:uCount},{count:pCount},{count:sCount}] = await Promise.all([
    sb.from('users').select('*',{count:'exact',head:true}),
    sb.from('posts').select('*',{count:'exact',head:true}),
    sb.from('scraps').select('*',{count:'exact',head:true})
  ]);
  const admStatUsers=$('admStatUsers'); if(admStatUsers) admStatUsers.textContent=uCount||0;
  const admStatPosts=$('admStatPosts'); if(admStatPosts) admStatPosts.textContent=pCount||0;
  const admStatScraps=$('admStatScraps'); if(admStatScraps) admStatScraps.textContent=sCount||0;
}

// ══════════════════════════════════════════════════════════════════

// ── IMAGENS PIXEL ART ──
const FARM_IMG = {
  barn: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG4AAABSCAYAAAC14+EtAABA3ElEQVR42u29Z5hlV3km+q618z45V67qCp2DOiqrWlmghBAlQOQkEw1jYw9jBhfNNcEYzICNAGGMZZKhZIEkJCQkJJVyq9W5uzpVVz5Vp06OO++17g9JGHvunRlEI4GH73nOs5/9o07ts9795Xd9C/iD/EH+IH+QP8jvgZDh4WFxZATCH5bi9wi0X73h/N/f/0F+B2UrIAEAIpHoFat7P3J2X/d1ADA6DPE/AvoH+R2REfzSLIbef37foXs+tI1/+52b+VVndb8PAAj5n7Xxd0ToCx9gFBSjoADIC9eXVV52vzIyAmFsAv5ZkeS7NnfJX3n15sTm9UMhZ8tghIqe/2rq841lBB9ttVqtEUCYAPgrbs5HRgSsm6CYAAPAMTws4vZZH+MvPNvzV/qfFrjhYYj33Qd/uK/9PRGdfjMo887Ngx1+OKJKkET4HuCY/rot3YFXPXayeO8xoPo7Ad7EBMcEeByDXV1d3aHy4d215EX9Q+n+dKqjLcPVSKSjXiiXQV7QxPH/RMCNDg+Lt4/Petds6Hp/e1j4Omzfy1ccni+bAlV9LC03yKETFeJwx714daK9OxHZ+djJ1l3H4DZGR0HHx19W8Mjw6LA4m54lKawNJHam/h+tR0q2vyX67Xy4dYuSiK4XBsnftiT+QTPjXO9tlD6ss8DDdMH3nHGn9bJHdb8tuWUrpNv2wn3VYOKvNvQpH/c9wvadtDxB4njTxR3yjrVJxKMa7nt6HgdP1vHaC9OeZbriQ8fcI994emJns4HS60YgjI3Bf7mVrXvnhrex8/1/cniLowtkYGUQjSkbvkmhB4A699AmhfD0N6tuaq1UCdWsEf4jdbc8IvOJsQnnt+lsf+s+7ba9cK9Ymfn06i7147oCP1/1CLOYHBYVWZU5HN8DhYNMUAZzXWSrgqhpmnfJSmX9By5c+Ug6E0jfcQf8kd++hSAAcPmbz0333DR4Y2TTwGvm56oXdiZs//UfTDHmuVygHourssdkm3evDPJQv8CssMXXXiVKifViOk/p/e410n3yKTnywveR3ztT+Uuf1pN+9/oO+W8SQfiFeoA2Wx6ByOETjjV9OtojIQR1CSezTVRNF1FNQN0htD2m+qvSalu5issOLVTvPkZQ/236vJERCBMT4Gabcvn1n8jcKWzmbzB8f0uiE7QhMcrDIJ7HyPyMQVenY+TA44vkwouSZHapTi5/Wwc3Tjs8l/NlO+t+raY1l/p3dFULEwX/90rjbtm6VRofh3fFYNtfnrVC/mYy5Pv5ukLtVotkkhQWB1RCENU1aDogCRSRSBCuY2LjQBInZ/M4Mu8Iqfawt6VN3fznV637Medov4PAH34+1/u333CGwvGxPAg4SGURy6em6nW/03TPfUuQrbs5gsfHKsj+C1CYBBIrFSgrRfSeH4XnUzgNgkd/miP7ji3Trmt0X79A+XSgTfzMxNiEA/57pHHP+7Ql9+y2yJ9u6Q98Nh722VJZcltNmyQSnBqOC6NFUWu5zlLZgUM9OrtUxck5E6bnYbAniFaNQ6IODk81acs1vUvXpnraI8Hz958y7zk16zZe0A4A4Pi3wIW+YJo4RiDgkyMUYxP/5w8+C4ZdQCjf3zi+XLthbo/XYSs2X7ZtIrQk9Kc19O0UML3fxPExhzWKPikHXaxfk8DCjIH1F6WxNF0naloSlve1xnu2JdvP/tY5RyYnJ/3feeBeDEQu6El9KKOKX9o2FGHZEsjxyabY26bQYJiTlkNRKTGXw6cXb04K561LkJXdcSzkKigUHJy9oQtzS1X0pFU0mg5AZNqZEbyMznpS0eAVh5v0wP49rXlCALWjozvQ2Tm4vre3uLS05ON5M0owAYaxCf5Cxi8gNSxgdpb/LywPT2xbub39zcl76AbnI4Ilrj7rzRryvk129KfACUPJsiAGJL6w1yP2s2zapwiJKY8GZI6lkwYMy0e4oZF1KxK8HLS2xXsD1x7/YfWvDbPgnGlfJ5xp83jb3iX3klWdH97eo3/ZtlyvYoESzyVamJB4SCYBmWK54mIp77FYRJXOWR0lyZiERFhF3fBxfK6JUFDDcrGFkEaRjmoQBIaqJdFMXGdpzW7Xo/q7akF9T2kxVIrfEjkmJOV3TN63/9O6nmyPr0imWqVaJXTNimv1/thfB7zoAfOpagGzs+x5xwsRO0Aw8St+cvh5ULWVsXfRKL2E9ojdAdXhl7w2TQ4+sozqSYZa0QALiCjNtUiiOwBhjRuLDqlU1gQ4ooPezhjWnaVh/4+bKC2avhbVuLXsfHz+geOPYhQCxsF+J4EbHR4W//bpp73L+xN/tq5b+mIkYPtTOV7jvqO3ZQhaLSCkq2BcwvyyAypSgRKGzUNhdGRURIMKJhcqqLcceB5QblrYPBCBZbgIByjqdQeGT0l7POL3BCxKHVxyKi2v9YZC24W8uWRUhMnIzb0/NyV+WWA2/EDw9fqTq17fsW7ye6fujm7raZNj6bdmwvFsbV+59O9AA4DZWYbRUWreXn7C84xzrQV/VaPG+KnnKvTSt67AxGIBZw9noCc8rN0UR/5EC32bglh9vorF3S1s6GzDnu8sI9mtYmHWQ2GC82beFYwjmLLny/dg1VYBe5f47xxwo8MQd43Pepev7fjAQEL4UlojfqEhUVmE3tXJ4HsUtscxn7XAORCOSKg0HFACdMbDUFUBhm2j5UnILtewtT8JUWBgNIRIxEfd4IiEKHIlAzYkmoxIvF1ESJTZhoNClZ/7rrZgKBR4M9a5erxDTC/XhXeKMa6ZOdM36smrpGH5g/Im5VLjqJMN9Kc61c74CitbnvwV80WwcyfB+O1+cGX0anG1f1Z4E7hXEGlfm4Z8rYlswUR5mSM728LSPgqWc2AVgfnTFmZPtoCMhqmSAZFxSD0i7bxe9x2Xb1eN2KR539EDGBkRMDHBf2eAu2XrVulvn17yhrvb3reuC19NheGXmwHaNCySSnjgHoGmCqg1gUbLR283h+czlCsEzYYDy/MQjyuwmh4On6rC4wTpMEUoICFfNQHoSIc5SlUHKzojOL3QRKnJSWebzFcxcOQ4faLVEiyHEKHX4X3dUWG23NLOfotM1qdS9PCJapD6lAi+5blrhSu3vb99pDhj3Bg7rH6xQRouAIqREYpbb6XBSwf/Wuojlw/eIkUlXaTFwwY59EwF298WhZSSMHevhx0f0RHNKJh8xEapbOPCD6UhhV3EegguuSaGI3eZYMyH6xlEszVu1Pyd6mBHh33Po/djdJRifPyVB24EEL6ztORtT0fe0xFUv751re4vF0VaazRIR4bAMghkVYZjizCaFG3tDLJEUasDC3kbkaiI1wx3YPvKMNYOJFBtmTg+08LmtRlQ10ZnJoS7d8+jI5VCTPcgSx5Mn2IxV4eiB8ngYJSoho+lB5vshKHaJK9KCz91uDwooShZxHyG2GLcQepKQmpHXEpTild2K7X8vc031HPZYxiBgBEAt06w1OruyyJv0L4mpli88YxHzJZNgjs06DbF6hVRHLqvgfpBjjWrwmhMeFg66YH4HtIBBX4eOHavAYWLKJUZOl+t8nBcJdO31n6idvu5rhsTb4EX6Wp98467MTJCz4TmvWTgRgF6K8Au6W9776ou7WtgHnf9ED0yUSIrB4LwmQNVJ/A8FYUiQyLpQVN92E4EpYIHSAwCJVjZrSEREKBJMrLFJuYLBjRZQXsqBE48tCwArgVf0NGRCmOpaKAtIsAwbNiOgmLTxjltFBGT0cRyklJPJfOVGmlNcvgnAkRNm8K2VwXIpRd248DdFaH2KJa7evVJV0rG3IeLpzAOHt668gvBbcFb+18vOuVjLi1MWGRoZwKaLmB+3MDUfgdWjkPuo5h5ro7sfo74pRKi61ScvKeJ5QUTsY1hzC4bMOY8CyanhFPimsi4S2q+ftDJccP/gjVfmsPExBnRuJeUuI6MQNgFsAs7Uzdu6hK/lgn5KFZMkisXSSIpgREBqiLDtxQsLNlIZWwEZYB7AZRKJtLtFC4EyJwgHVIQC+sIBWSomoKQRqEJHJMLVZhQILgm+jIa8oUmClUfDCIMm2MgHUChXMbh08tIxFTyhtWaEJOW3QOBvLfp/TrOH9HB2kwhcrlOFk/buOe2ReKlXez8Uryv44bklzi3LwTAR0ZGBAe0WJx2Z058oylqvZz3XhvG8e+WMfNkDdoKEW6TQ0gA3W9TEN4cghwC1BhBKC2BRCkiAzrUNpsNXBdGoC7udm2vnDtukp4bAjGEnY007q8mqrM5sqm370wVPl7SF+Tzzzv1RFhKDXaFecWQWFs0SFa0aVAFDyldAfUFHJ3yIKsUCV0B50Ecm7TRnpFgMwcyB1oW8+7fU2G/OJrH/XumML3oghMgGvIR1oCHx6fgCSo4PPS1S5icK2Lf8RxiQQX5hoX+pIyzB1NYMkUM9qXQFgJVioSa0y5efXUHgkHALdm4YWsf6kcFCFaA1Z9gfP8/Fe4JuupnMDpKx8bG/GiaZtR2BGzPp9F2nVp5B2InRdvWIAI9QNsNKuRuF/4kgztjOz5cVnrAxfLPDKgpBgcuGpOM5n/QgiU552fODyajAxROlRA5SdJMteNaf/QrVIoEAXCMvkI+rq8PdHYWbDClDBBffF3TtJFIutT3JFQNDw2LotbiCARthLUAFFnB0ak6Wp6LvjYV5ZqLpkF8w7HZxt4w3bIyRtoSARyfKqJuuRhMh+D6QDoqAxDRkQrDNgxEwwqoSBEKBZAMAjWDoS3EUa7bKNcZqgmRLnfJ5NjjPuYOuuAnRUweBE7NVVAKexBOEmbPU2KU7Kdr+4+NIZ2mq3w/WJfcS/RtyiX2tH9w4YcWCXVJweRFCs/f6xKr4CC9KoTKQYtVnvaJM+kfahuJBEnKVyzGkR7Q0Vyw0bUzjKU9HLGrRWI+7RHHdFE66oDUZV/qUIk9W99bHV++Fdy2cfFvXmt9SRo3/kIyOW8Iu5eqdbs9QanEBa4FDHgukCs0kUn40DWKydkaZhZb6O7iSIdERIMSdJWi2rC9WFiT1/aFaCwooicVwtqBKBoNDl/SEJQ96EGCkC7i+HwDoUQQRquJ/oyGYr6JkqcgFpVQtgna4yrK5RomBAczFRsSo6gtegi5AaxsBDBHG9j0Jg3aak8oXlthsQ8E3h66dONjGBsjpR77HcGLxfeYy03fs/3eoM+e4XnulR/24cY9KB0STvygBDGk0farBaSIv46oVjAWl2AdddEo2xBTQOOYD25brWRvkBgLvB7oD1QTqxRuFG0Kz4c0qGyLXtl2or2jXTsTLbWXBNzw8PN/1yZ4V67uCqg1w2KiJBCrFYGmiOjvpvCZC9cVoCgcqSSgUgCeiErdR7kkIBxQFMYYHO/5KhWHD8t2EQ+JmMw2wOQodFGCIjpQRAeTczbaOjpBXBt97TJyyw0U6jISIQlNq4U1K8IIHqyj0eKg3Ra8N9cwvW4J8YAAvRkAOSFBkkTG96jU/Jn5c2I5+3t7h0XDFh9njmxBEXh0uxyM6VYJbW6umrNJ19ogVxMCKKcIr6VIrFGQ4YZsHbDp8nGbCQw8c14AoTadZx904eeF48vfKh8gjvZ5LFkFUZWJ2kN5farFYQDBjPTw0tKS80JRnL/swL0oAUVXw4qGoM64y1UUSx4yCY6g6sH3Q7BMYKhfBmEOCAVqdgsTp5qIxRm4wDglACUiLE5Rszi0gA4OjrP6Q3jqaBYtLiOiCUjFVOgqweMHsggloxAJ0N8ZxiMHF2DwAOJBFZqkI5QIo/0KhvbVBINtGrqTUZwsOGjupXj2yQoq25tclAhpjbNH6k8e//Ds7LgVaJV0lvXCfkUUXYMvWr67GOrTu8SY7Oce9sjyQx7kjIT6fosXv2ywhqHOxHYG0HFxkDpNkWT/zkL+5z6hYZfHz5W2lopyzH2m9VD+CfLE8iNGI7ZFRiAj+64nwHbdDgAUn3yhnvpy+7i394GOz4JtCCo7BvvEVzUs1Ts11XK6uyAJkgfPjyBfsBCMABJ8CCKH6wVgGBw9XQrAPNQanFTrDMWKAUkWkC8WceiUCcfn2DQUxULRQalsIZmMIioyMFXB6Zk6BKKgo12F4xCA27BNDi5K6OuSsfdEExMZAhUKjt7holXk8DpdcE+EKMoACOGTlOuXSJfHro5fpTjafbInNOqGY2qd0kX2MpVbrtbu5exkdNEAhkAseDxxTpCL0zakIw1vOSEW3aL6M+ugNWUec/+OrOSXyB1EgkNJ8hyBexVE/bhwnZfzvwlVuNx1uE5dKsATIRpkNmnp36v9l5r3ipjKR1+41jiRshWZZ2dNqghU608G4dsBzMybaGvzIIs+BMrBSRDLJRfd7Qp83oTvETimbykB8OEdaVywLobLzu7Gik4NTasJUQ8goDGs6pBxcqEIW1SgSSK60gpUuYXjczYargu4BCsyIhaLBhbyDK4qYvHnwPKT4FuLmaVASWF+D0Vw2IUMkys/DRLH0mhzwfWcgrxNiCqvW3xucd6utB4MdshQqLNHjMJyNYHYOqX6NplH1yokk5GoW3doszcssbNCqxqHCuXyElsppqWrBUM8Ft0ocTHEeeFB26KuUUpeI6fVdrxBXyeEgmGvZi/Kz9pH+C3Ld00Mz7797S/SGfjLrnGzswBAeHt7d8lp1d6RSRDF5D50OUqOnq5CloCujATH9hAJRZHNupA0F6rqQVE0FGpAoQwS0Bk5qz9AEiGNBxWVFKsmppccwAWWyya6ojJiCsVc3sNUrg7CXXTHg7A9B08cyKGjPYiwSCFJHAvZGv9FybbqKpGCSxrTdTGgt0i2PlUP+XEb4dVBYs7Z80E09OAmSfRm3B8X/vXEf1+xonOtZUmOUJCalSrS4R38fCWll8tT3BV1qloLzvHqET9rHHd/HrhEbg+cJQZoSzlH30rTQoCstHLwjBOOKCUl0bN8wSvSVvR8IUCawlBrThBogqkqa5QSvfqPyvvz09g5Dux65RJwAnAESL1noFMKioLNywWXHJ3Ko73dQzykQRNEqFoQuw/VEIxSREIMqiSg2VRQa7oIhVyhI6KTzWszPJXWiawTzpjDI0EK+BZajodgLALX99CWlNGs2QhHomDURkgWcN7aFAiXEOsMIxQQ0NcZIutsaB+ghF3Z1RBOistTW+X80ic6QV5zkhDzXnvutb41+acSoa+etgiY1fiznau+8sFtsYN/NBj+XC1tbYteTC6155ltHDMnqSX8CONOtmuPIwj7yf/wdH2NWZYz7pTHHbNZimyToXZShLf73UI3CdAgp5FhiaIlVbPftA41l9mCXzCn6yetxehr2zY6Mv4aBGQUo2ekL/cbJeAK89Z1RyLw/DALByl6ewGJSHB9H4wpWFxwQDhDXBMQ1yiqZQXzxRL6O3SYFve3rE3j1GmHfOofjhrf/WmWpNo6icCZ354OIRMUMZ/zkUwnQNwmztkQh2s4oGIUkiIiIQvQFRvP7i0gEo6jOx1EUBf51sEA2dkdaqlNZ6EvhJUXbAyTy/riTTliL/XpZMPOzVHhPC2xXHuo9GxYE197wdogb+tWrwwO0Z2SyLk9ZdV8g22XdelZOy/s8ggGwjvYt6V+krYOs6fKe2xuFQNS9ceO1XjS3E00GV2btSXrWfeYkxUIi/kD3Ocxr4hCZJi67StijZnba3z5aLMJgO3CrjPSIfiNEvCzOqMr40H1hul8jXd1UModCb7gYCFroWL5SKUo4BN0ZIJoWQImZhtIhFTENOaXmhCqdY/ftze7987jpZtyC5ZimW5aV0i4IyKycEAhlt1AwxSRSulw6y1oIQnTSw0kY0F43EY6HsVi1cazRxZx9qZ2PL2vRHL5Jpkv2AsHZ82JoNHY2rQ8cnjSqE3PeMc1s9JvNF1l4rThZAumpvnNAceBUpnh4w8vGAc44avENJVi18oia3jXsgS51NQh2S2RaMVmTkwKkAcCHU6JzFtH+CNwpbq75IreIpr1R6wbnSp5XbCT8+ir5LSTczORDWrSDbKkHiUs2C1T2VPuNd7TKL3YcX+FfBy4oOgNq9l8b187RMIIGHziMxHVKtDdoYBwG4W6j0KZw2cOomFAorKvBhXh9FzjnwtV77ZwW+LkzavXPW5HZfrE6YX7JFNdOHtj+7kuqzNF0OC5Nik0gI60jlq1iWRMxeRSC8GghnRQQNn0IcHH/mMVHF5ougYXBcewYmtCfCPnlNYRJL5jB/oldzWHqC65IoHtaINxcaVAJGW27FgTrKWbw9pZ4VWa2JpiomaLJ9ySXYpcKbdbLZE7M5ypLTvVUpSkV+BzbKrxenWD9g4xQy4VZ7yPGw6G9U61T7Ro0/T9dGyLpqsl4bblnzab9izdI6TY+tTKSMQ+bp9ozFT3vNBxZ6+QjwPaJGfHqm5FMmzCKOVEVnRUawIGhwQoYhOaIoH7AjhaiERdGC5zbcsXCjX2w5l04FCrRwwtUmPiX+1jf3mytYDIQJA/rjbMf308f1sinKK64PDevhg/fLqMyZKHaDKOiEKRicl4cG8OkAMgBEhFJewYiCEaVoy6TVpLFa9SbPp78xUXvhCplRqsUbT8hyoVu+VAnivWWStbcU4Xq65frLFDtk1ksSEcLe+zn6Kz4lcLu92sNesc9k9peee0f5S5eKQi6bvVDlVSBP6McXxpLwzbVQJwRY0W1S5C7Yj7OtLbqqsRNZG9vTWf220dJ7HwWdTBWOtp9oMTt0++PtrS/hUAwfi4/4qYylQKwuws2Lp05NWr2sJXGF6dSWKELuY4AgEbkkAgKRJqdQ0StdHZIcBjgqeKRNoz3br1nmnvcz2r7M8nO8XX1Fkr2TVIb/Y1YQiKc0FHW/CasSdz72QtKXb26tRGXfNYvcaIBIEYtovujjAqBkOAMOTKBk5MVdAeldHZG8DsLJc8syjLAenAo17yvl5inxcRqlrDw9K+ZOet3Y7T0664Ky3Hm/zFlPuW3oTwzv5OrQcNO59/sHLJ2d7Ac5OasVZRpKJH+aCzYCuiIqbFVcJaYckyxZaHpkv/Uu1I/A1n2iY7b3l23ZtT0nxQ65QytCkPMNf6uZDQYlI3v1osOd+Cpn5JNdTX1HbPPlFYLDRfUV7lzheuUUGshwIEQSmMXM5BJPZ8z02RCJoNFYZhIpoW4LnMjWqaWDWlv4+t6vrca1Zrtw+WxbauZdlcXdWGM6eVfH9O6u1dlvt6c2Tq9Ssid+1ZnGbfebTwRdsOCQaz0ZXk3DUdzOR82C6DQn0MpFREQjICwSjCggIHjDBOiSaqCa1R32pZLhUopQFZalcWimdZZqtDkCCGA0EhobFu34VAmc8VTVUFlV1aUspXCVG1Q1wyx0P94c1Kj9zmLRg/8Zd4k3QGViYrVX9oxk6KPfxKoaPlgQv7hG7t41LBOxiaKJyqL3qHfc+Po+lyRZSU2rL9fcFkt5CAq7/QtD1jHJ+XFJoOD0McH4f36u62v754W/rPH3luyevt1sR4qAkBITQsglrNQjxJ4JqOl06ExKmS+J1vPVn52KdH0vdftjq+wWMUMvEgUBkuZ6DEA2MEjBOoInBs2cH3dxeva+SMda/aHvns+UO6V3V8sdDwceBYCTs2dCKmOeBEwOklF+dv7sJ3fjaJk8sWMiERzG8ZhAZ0RjmYbUGWSN00/bBhclDBBxGIz30IhBNOqEBqFqmXOL6fXtXz7cebxQ41LH2Ieyymb1BpfdJcKQaDcme5ILTl/K8/uy22Kiywc23TP00HxDXxpxt28ph524HzUtHIutDbqg9X71YNccqLkRuueOjkwBjg/5Lv+UpyTl4MTuKRkGW2jLcQRoWeNpUEVSBbEZDP2VjRDzi27yXCEXGmKN1+b7myPDgYWt8DfunsYl3PtmDWGHcWKjZyNVPIVRmWLbSyVb954HRVcz0OFgodf6i2GOySUkc2rczscM2ar0gqjYQUCKKGQEiEb/iIh2Qcnslj79EKlFDcMk2DVOuC4kFyINNWtWKLtuFq0VQCZ29ZjZUDGXT3puhgfy/aUhlSaRgoFRrKtu7ItniYB54Gu0Rl3G416aNiSnwdN/mzbMH9e4Vo/0gtY0fdkB9vLnHbF8lSRJHXB7P1E5O5lW8xg55NF52KbPCfmrp8VJfcg0upVUfrCws+zjBtXnypwcnYGCD6bkdfV0AoLJlcFCg8N4y5bBEdiQBiEvX0MBeLZe3Ld2bzP+1uJw+AN//k0DFum2ATj8xPvw5ARYfefuU67YmZZftr+4vNLwBw14XDn+2Miu+o6PpiR0b95g+zcx+N79P+/NotHZ+v1Za9toQg5kt1lOoh9CYUVMoGelMhhCMm5haX1KAqQAkmeWE5J0aaNOg6qKuxGDactSZaLJe4bQYIFRPct7IkFNCwbssazC09x1IJwtevjV+UKQe+8dWJ3EPdWuRE/rHGo4lg6jBzJt5ZyVoHOlbEUqvrrdS+dj0pMFXVnqo9LHjimNXfvHGN2VjfWTM3LsvK+05DeTL/89MXAKd/KxT/3ygBT8toSwVESmTOj88YWChU0dtDIVPf1zRVnFjA4z9cbp3qaJO2axmLyinZO29jKPPO1ww8J4r0mCzSnC1Y+887K9X67hev+Z4o0Jwk0tI5G9MPnrcuLva2i21K0PYHMuLW/3F4uvjPj2a/F4gkRfiCHw+L8EwbJ3MuQvEIBN9DWwKQ9RYyaQ+DnQukLWPRwQGRrur3omuHohFBlDHV6CJu8kZ4satJU7oIkwsiUqkguuJBOpUzSEZzuwLV5Q/knz38jOHVz3ZC5rtO0+I5MRVtZ7Wpn3z8yeBtXHDe0t7jnRtf629NakgtMWLvkEq3DlLvT3yRzDaZe37wuvDlbxvuVX9b+zN+o+BElkUxpGmQBR265CCeAhRR9hqGJ+yfaf3zg836A1qw8cV4V5Bm+iPg08U39CR0EgoFw57H4HgMvs/UtoAmLeTlkOczuB7D4Zn5zJahBLRq65bUCp32b8lUu2Lkj+4ozkp3P974SjgSEwQwf0V3FAeP55GvMESSOiTmY9M6Dd19FOv6VWQ6JFTMOgzPxmKxQgQioK+7F3o4ASEQR6StH719fTBbQM20kSsYeOC5JT6VqzbOOadLm3z64AOC5+0SuTOxI7zx0+1B6TWXb1t4bblK3ustSyfEGde1TSd/TpS9tZ3wytFjua37T6ufW3e8IsY+dmzN7eOzFnBmGcy/kamcSD9vryuEV47OWNxxHJJqk8E81wuKori/1HjgmBP4RjLhfVSLUCHdIVc4tUFtXOC6DLrvXvM377jg/nO2DE4999zk9njIjXrV3HfGP//Wn9Zdrp88cOB13W06BKJGRWKT7qEAPX5owe/0peG/n1y+pkmt8NsvzLzd923W3xEmZsMgizyAaEyEHNYRj2vYutIDEykmTzEMb9Fw52N1PjWbZX3dnkC8ImQ9DsspgIcbODmRRaNloisVIpqqk0rLGyyccDoJIZMAThEAX8Up3Hhh551xRfnbkoq/CkxXPZEDSdm+VCBBHMjSj6x/w/vXxCXhy8GfP5x499IMTqiBu+6xQ3/xsJObGAXorjMI4ksCbmwMHCBYsoWnkrWW25YkEvyWH9Zj4lSe3bGUChajivGZaEqYDiUlNBv2+dFOAQSccyoSKIJ4enI+WKuW04W8EQj7GhxueguluU6HUtmqlTxsToOLPl085bDCTPbmUIeo6JK0z265779jcT4eeUq57eJNoVtcy+PRdgXVSgOWYyOCCmTLxtxpG2sG4mgLuogGOeCZ7MTMAvc5RyBYQjCUQzFXRKFYx3K2DM499LSHcNEaHQcWqHXrE3sdQgDOIfBhEIzDm2nge5sC5PUDce+r1HYwkA4x7lO+d9n/Bhcjbvfi4ncvf+vNX57oartg4R++GUktFa7PSGwCDv7iBevGXlFT+Tx1gaONO1ev7NVkzkw3rEWEk8vkiXtn4x+lAfONgYjN0isytXCHJjaMxs2cOZxTsqCJDLFU6p6vPz59wV/9eOID335y5qMkqLdaavqzn77/+I1/c9/Eq3fn3A97rgxZoJw5NjdazZCqSXJmKOm1pbHUlZKu+9wzp775Dz+f/9amdd1EI5wN9cegyzqWihxLdQ7LltC1th1r16nILXqAIpFKvVGrVoqoVi1u1Hze29cGKirMg+Gn0hy5SpMbkGBWzWUAi+T5uR0M4/AJgL0Hsg8lI3r+2qEQzluheecOhQgXVLJ/MbDr+OTJ25eW52vFcuWDUiga/Mn117/5zZQmF3uTnwGAXYD3ipvKnQDGAcRkyQ3LhKmRhDg17x95sNnaG0l7H473eDPhUGTNwvFqh6Ab8BzZp4IocJ8mOQFSulASgKu3BcM/bbkud2yLHNk3+dVVovx3hCp3yrb3JOUOZEk0op2KJEsKZZzBa/LVPCUmotwz1xiB68bNBu14fOnes/rp1UNB2w+FRWH1UAckbuPZvRW0P3sSlhqEqAMxzSW64noL8xVzaGVME1UJjgnkS/Xi6l6EJFHQDk2YeOJQFpWK7A8ODgqnT5/+94sdieg1y1JCqoZkPMAZo2Sy2PhuoXBF4U03bNxOA+HAw08+M3/6xLHDj+9+ZjchBONniAB7Rjkn1CNMUwP08OkWOXCq3Nkmu+8OxDw33Z3xI2naRsTmKgIGRSICiAQInHk+5bls6ea/uGrgpzdflcHVw2k+na3zFe1UvuWaPvVtV/XefM325JcDEYqW5adjKV0JR2TSyLtk+thS0nWtNX0b2r1Me7zZprkXPHJ4NvqjB5ch62EicAGNQhECjeCcrW0IxHQceLIEMZLA5rUqGYqTjKoY2qmTxyvHT5w++PNH9s4IXi4alHzt9JyDZFwhARoAF/zuWq3WxTl/sUjBXzcCAbWP1LNVfG86b4L41G/ZHpotzABjfiQcDni15rcP7dtT4MzPDA8Pi1deeaWCFzdbjowIZzLCfEka9yJ1Ydl05Af2V58rlJrobde3TIlWM9CurqpPu2WTeXk1oCc7hhSSn2qS7Kk6IxAXlorGqv4+U772/C5wzuF4Pi3WgYgGBDUJjPsgNC3OLzbg2XZNUnTNbUJ2LRdEBCdc407TlmN9wlmVAmL96WC6bjr4yvdP0cFu4NpNcRzMWWhPyjiRB6jAMDPfxHnnRuC08vw1SZlAjUf2HlhcteLytDg/z8Tjx8tgAsFgu4ZzNurQZjVeeKLh/mqto9EYFIFddrGVniCyBpEKRJZ9tMcDVwG1v0lFwgXPdk8omvoeSNKfjo+Pe3jRPBIAY2P+f6hW8ZcduPHx5x+obhf/8ZFj+Nr1q9MP9MRkOmc6YkD2X/3EHfkLaTjStekS/EiUBOYTDqPpUBKVv3Xf/vIN9x8pgjHug5GwKDCDSmjjDrVN+BpAQxKnRz3BXyvo4rGIK26QBMjxbpWHYyGSy9aIbZsKlfw3KkGxGDKIHwnISCTKXI+q5Dv3tnD5NoJUOIKwa2Dg1YMolTkq9SY2bW8n86eKeOypRXruKlHd0GehUXDR36HA9inyVYdzXyCturkEVBY54+Smm24iY2NjuP/+SXtkZEQ4duCeQMVgKNUY7e8NYG3G3wZNCx1bLF0i+PaFIuO7PvXpy79y00cxQDS2QjDdA0t795aE9NBrROLsdwqzM5y9Qhr34puzr4oaIQAoS6zoSOGZ+ZbOZYZtN3d9SeYWXS7UiefrlPsCugZVLMAN1oLuelcU7lQ8oYvKlua60Z+FgsafNwzpx4LDPS44r+Zcuo8IzjncYudEfUFgHoXPbGLbnkuJ6IJQTQDnggA7oAq0py0Jl52ACh8+N6GnelHKVXH0QB396xW0aw6W8z7C61M4MuvCa9gQEnEUSy6OHKzAD6tgNsdcqYpHDouo1JjX29srUkI8/nydER/+8AfO/fKXv/r0OatjNcplNC2XiyJHLCG3YJq26Dj9h6fz0uGpyh3XvfmuK/yV+u3h7e3J6hP5yejNO8vKYHKHc+/pz9jLs18E4jp4KQtC+CsBHBgDIQSCz3xRlBn36vSby/P+4KqtziWEyshNec3lJ80p1L0ukQWzyaZwNXwwUVA2ey6L61qilSs0LgtHxKM87LzWbXp+26qwUJ51PhXvVMT8LEN+sg7bFVhbX4C2is4Bryk/I4j8Q8zjhHO4ouALsiTAcykuuKQNsecKeOJADTe9cQB7Dh/HM8/WoagChs+Nor2D4sqrBjB7ZB6Hj9Vx01vXo2Ovg4OTDRSbIhKhONGJiCL8Hts2M1suu6x6zWWXRSKy3h2PBJ74whe+cNdzY19sD4gMlgOqUcqK0XhBu7HrjruWc6eFHYHL1t287fDi02UMDicRWK36+49WBn1HgqBw5q+JfnTrB974buuEpZ7WYhttYJa/xOLzbwIcH7sJAgBPkzCpKfIqiznbKUiUuirzPVIJLUv1bo2u7I21S+2IBUm7QLjPBEL4Wk4JNRu2tyCBzB5rLRR08TEx5Z1HicxFzRcTbQHUciYExYNT8CCrQLBDdw48Vmx0OyEIFOAA8RmI47qYXfYxPdWArwTRH9Og1EsY6NdxcrKOVIRgerEGvtfGYlEA8zQMrAhCyC8i0x2Gf7SOVEhFT0LBjo0pqHOWx44i8s4bb3ggqAdXuI4JGgzzNl2+vjcuQxcNyIosplUKuEZAvbxv2H4wN9y+JYOd71/Lf/y1vQTdIuTugBBqo1C2RVjpmUUKJSg1e9R0ZU/+R5ZVXcDoKMWuXexl17hf0T20mi3ImrBZC4soNiykico7RDntelw9sJDHkWxB4MwHfz43ooAPThXZsRj6MtoKo2UfyQeJvXiqEhAFhQsyJVLIQGdfHJGoT6o1Ax2Z8PpEr9pNJYVz2yEgAJgAUZSwWPTx1LMGelIcAb2Gg7sZYpEIBrtFpIMcDTmOoingiSensbZPh6zVcdAQUcpagCrCdDgKDZNT+MSsW/OBdBTxWGwVQGG7Duy5g5g6dczPliwkKRWWuJL9cU5sHJwjxI3bYTIgC0v7F8Q7v1pH7LhvFh+us7KfU2I+E9JbI/TGkc38/i8+jZOfOFqhU7PfyZy7MbG8a1cRr4DG/ZvqERBJkiAIgqfrCnVsk3ohTkO6jHzVxobVGo8HdEIIQAl9YUYgge8z7D5c5LFQCK6mXzBHsuqagTiKhQoxG2EQX0W9akPRGIHhw/VZhIBHyosmFwUJAnk+CrUcB7IiwWMMi0UXQ31hBMMeVl7YDmd+Ec8+28CpxToSEQ++TLFQsLBppQZd57j0ym5E9hm4+xdlzJcpHjuUR6FEjJAaZdmF7LPt7R07bMNhuad+RBMoCTkR0IKy+71W+wl7y1lnm2uWNGm8THd+bCu8JMFj/30f63vML0cGwzjSLCeFyzJCudDCoX0TpFJl6H/3QGBFzwX37P7KM98G8M7h0WFxfNe497Lmcb9s6nHqO44PxuFJQY8IxAPhxJSJ6HLfh8QpVEVCtcaQKzrIFx3kqw4kSYCiUEI5Jb7Hg5S7QjBCIIJj5ugyKjkPvkfAGSBRCioKcE2XF5eqMOsuqEhAQOD7gMB9XHWejrOvHIKoeHj2QAuze+dQsFVENSCiuzi9aOLKTUGc/6pV4KqM/cctHNhfhCabkIiIUFCBQATY3OmamprJffSjf3b2xMT+/5ZIpOk8G/CPLNho1wgPSUR6Q5vdXXn6tO0GZepBaS3fs+BkDxUQekNGmFkvdS5eqXQqb+pUEJDItVdsgjtpt3IFw05mVOnY+PRMI2t9F6Og49j58pvKkbXPb17wfUQ4JSCCA89QsTzTgiG7zkCiV8nWHdfyNbHedFCu1xEOaPA8H7JEQSGDShKOzi6hzCgnQ5Jba9i0WVXRtkpD9lSTmibzjYZAWobJwiEPYliU2hJB7rUIai0HgiggGhKhShxtvUE0a3XEhyLIZOJIxerY/fQyEt0ZDAw0EIu46B4Kw3PqSHeF0N+r4fBzRTwxD7iEYmNXkFxwVgSxORr65wMng4SQYueqjf+4PH98VG6dUgMhhauCC5tpnDpWNF606qeP5WKqIMpPPXOcXLfyfGxc04a7+SLaUxofaAXIw9962ryvLmqWWxfVlkOLX8uRxqnsSf/koYexDwB2kZc9HaCfAgMgOD7v1hUBApcV5omQVR22CV8LcK99w5paekU42Tx6BJGoju5UCKbtIB3VoRAGkXso1HyEdEFsN+OTyiGqBhwiBKelSsIIdpAlYcGoWsG+cNwpP+VqUrccCcRolCmUNwrE5VSgjgEMrU3AoRqqpSXkzCQSMQ/37ZaQnXOxUrcwfE4IJ5mOqq9BbC6iQjqQmyhiuUFhGR5EKmBqqcqPZ2UyN+8s2HZtDgCmD4ti1DrJzmk3kK8KaE8qJBOg/p2Vtpz00cENwZk8hB8bUtvrOnEwl0fwB9MtZcaX50/XxGqozvtDsfKJp04H0h9ZFe0LNDADk0XetPGKyJ2Jx2q/mL0WfzzVeIGSzl/udIALBBYlBD4jXApbJBEQoXtaCFlBz52YUeWm7CQVIkucIKRKEMChyiLAHHicQFFErOgO0P64vDIUFEGID0KVznBKgO178WZARE9HBE5D8L9vLE4JohC1WYu0mrwfrlcTBAFzkwbuKuoISGlkOjhIRMOpYxTt8X40Fg08tV/Anj0U3TEfvh+AHm5gbrkTcZ2jO97AlNUChUIaJRcN0+uKqm3dVSs3e+LEQzjv7CHsOfkchPoiejuC4JTRDqfc9chn9rlyOiZlao6xcdtq7clygZQdSwp1ioTFgySxJuim7uXLfpucyXhCRIoobDrrCO7hxrTQ8EvxgLqqvAvPvhSC7G8EHKX/NovYsHxQ6hPX0OATF3pUbvpzPuVWNRQTIzysUMSiQaxoj8BnHEbLwkzRAgTGZML5odnyT545ahWoSH3OSJOBedz1kpIozPm+2J2JLd343tdsSLAc6+REQi0nTNsN/35fIe9yiY1aAyQS9HHx9jbMZ008+NAkgmoHLtwUxulcEE88egrpSApnr89gNhfEI0dPo00L4cLNCZzIBnF86iQG+2Rs3xRGcI46zjPTDgBcfvlmqAJBIxriazoU/5mJMkRVERo6q2qb0kG5h6LuQhv/qyNWK+BowXetkD1qw/9FFpM/Uw1rrhEuzqGzUJrkyhVxrkUFNL4ytdupHn7ji1PDX0q754wEJz4jsiAKcGzPqxdtBHQJHnOYpuksoAV4MKBCkDVU6y6eObqAvScXsfd4DjsuiuCSazpZzWB805Z1nzzYcN63v2J90PekJGX6+aDRyL6685mDLeN9gqhM1xsWJYQRAh+e7YeJ2OrMVf3agWOLnHsCbxoWZhfLmC8aLJgeNKqtKiaX6pjLWlCCcVTMOqYLRZxeMDCz4KNu1zFXqGE628Bi3kGxYfLZrIH5bL1ooFgAgFXnvQGt/AlsjS+QshcXJxoRMaQSsl2x43y6suwXqcl6RK81KGtSfxx8qQHMurCXCOylVmR2uzrINygQRJUIOUekARHq+/quD1+y6QPg/CVPUD8zeRwBlRUBrg+PmZYoSzIIo6Jp2YJpmMS2JS4rKkRJhEwUEAoQTvHI/QVkK0xUdY5ys4WLutOXc8f7tOD72zkYGOe4MBQfrHvkDsBQJUnlTMSi5/KBWIeS4C1yXSXrN9atT7O50wWhWHGxVDTQMCTsPjzN21IasiUDpinj2LEakmkZ08tN5OocYApKBsPByTzKdQUBTUO55mKhUIfra78cU//A3f/kDQRTOFKONw6XlF+EYv0w5NyOQksUhAZzPcuRITSQ+qM+tCZMbvzLMlEuiUDYpkE2OfTzU9ycbxL/lAOv6cHen6+HbukLR4cif+/Plh9t7Zo/ilFQ7Pr1tO4MtRk4A+OQRaIoYQVElJ/PEhjnUixZbhGdEIdhNlfHifkyjs+WsVA24LgKKgWTC0Ti89PFN3qW892QKGwnkuxRSWayInohQdomELzKhyA0myZ3HF5lPoUoES4rZB6+YrquLjRaFvd9Cp9SMJ9TAQjYngcQApdxmK4LRiiWFspYcd7FWLt1ENn5EtZc8wbULN0zbMdyPQGMinB9n7S3t4ujo8PiXX/3Watuenbo3Hcujz2094afPHLfDeHL3rOzNnjxkWgy1qFJpiN3pITmEw2Qny8Tz7RsMSE4we1xtPZWUfnHBSKftEGpicj1KSa0fJN9PWs5zy18v2V40wDIrwvaGayccNmwXCaKIo3EKcq1Bk+HQp7ruCza3WHEekOx6qmDMGyPxMMaXNeHrlBEQwJEmRMOxjzD3k5cPxJIan5U8UXmc3AiolIy/WrFqGT0cNL3AUK4QKgPQfQIY0iYVt05ergGLSDD4xS240GSFGzeGMOpmRoch4AIQCojwTJ89A2l8Orhdsy1uzgrWsbGCJBdF2FGY5nbrgPu65AEubW0NG3s2rUEAPbC7h/Gop2r9v9oZEQ4Cgh/+b73nbrmmq3XXRO94Mv7S4W3HVias70J5saXSWFDMuXM39WIL4n1lF8ER8MmvEuBM2WjemuO+ZoW1qlcbn+k9YWZpSVjZGREGPu3ls9vlxD7K/xKYWIC/tq2yDnE99fnbGcp0q8JjmvJCpOpP2Xq01PZmGJUeDAgU0KBzkQAkkjRkw5A1wWcmjVQb/okFZYGtqyNiOuGAnRFOoDupISBziAZ7I3RsCqubjWt9JquiHO0Wa9K7TRNObidx6SUZ6l4WBUqjRa0gERSIQktg2NqvgBQGbGIAttiWMq30NUbwsc+eSV61vSgb+tWbN85iNrCBG5467nCyq6AdPxYFhYHaZmmF0+GWF/3wIUr26OXffAtZw0fO3Vq/0f+5ZF/2TmSIoX0DvHJnzxkNTLBoZzOLq7PGZ4Y1mQ3IMqs2mi5yUDQHQpqapDAJ5T4LsDjGlxfpAJxiXVhLNhsGdvPO2F+/56JZ1/SENLfyFSOjYGPjoI2heCH8ra/O86VWGnGUa0GsbhFqi6Iq1IP3e2K4DMXIUlBf6eGVR06MrEAKHdAAfg+511tAlvZEwbxGGzXBiEijKaBarkFURQZEcFMm1OnYSfAKGxD9mKeshwMcKW/L0XO6u+C58JredRreabXNDQPnHqm7fuG7XmGKzCBAY/+cA9qTR+KFsWTD+xFz1krMT2TxblvOgd9Ax2E2hY++PEb2r/9w8/87e3f/cTnb7vtA5/QNZfNLjTuBoB1E2k+kc8zAGTaqZqmTtWQpsqoerJTMMILjPcuLld0UeAe9ykT2kUfa1RTqvqORl1fXmLiqud8J9yi9zyIZXN0dPQVqVUy7AJ9EFP589euvUnizcsrZePNaNApWTYVs8TfBCLDc8EiAYmkohoimgYoDFXDQ7XBQUWAEpFQUYDlWlwQFQiUQwCBRClCMuBRh+QLhCw1bUpFP+x7BKVFS5KqkAJapFCB7OQKuS7Fl8RW0wdzJIA44Jyg0eLgLoHgUzQcFw0tCj92IbhMUTVMVGs2fvbDA1gx1I33fvRSHLprHGu3DHE57PnlqYc4XZij//qvE+RfHl1+CACOjo3xF8N3rerdfUE09DHW3tbzJJ2FJ6hQ64IyrPdgenIZJwQXKDtI5EStZnLYHsfKYLxxudz7ns8+eMcd5JOfxK5dL22H6pmaE/zLt+aKK0bipdJEzDFzV4kLbDCk8/W9HaHLutIhMGrAs2SAeqASBXE5loomZhaarcG+YKA7IyESlKAqAgK6BrNpo2baOJ41MTNtV1WJNAoJa552BHa4FeGJgBz/W60eCpWaDTtARY3l52OQGEA0U4iGFLNYFBVJ8CgoYVq0/y03tv/xBVsyWHf5TuqYJSIwG8x38YO/ugMFmyJ+1hCkyQWcv0aGtjINu+lyZ2GRfOt+p3bbXn9DpXJ6/ldodgQAv+t/fDPz2Xvu/NwRtbVGVxU3UxR233zehfPf3/d092I3u9I/VZ87H90/O6IsR+px6XpMZz9Z2X3kvt90E8iZHPBMRgA6BvgjI2vlsX875YKc19+/1fOrIiESF3mIELnBZ2fQrLqGt2Uork1nC8uaxjvbUpromSYAEabpQZQATRPR9CQ+P2PPuGhZ8saMF3OEzhPHcyf5rxGMXby566JLV4XHWauJG952Njq7Za4EU6R46AjI/DIOnnRQqLpY26+gZ1UERr0OJRTwWk5A3PUPpz7/g33Z/zo6PCzuGv93lfyXtPgvNSA5Y8HJ/8RwfmEC+cTzhyTQYUCYBdh8pbKYrZkL2WorO18rL8yVW9n/enP4ukvP0250IqGfPnZwMVcyvcXZorkwX/MW5mvOwlLLW8g2vIXZsrOwVDWzLbgtC7Bbyy23WGyUAI6RkRFh3bp1dN26dTSVSgl9s7O0D3j+MzxMX7zfsXatOE8Cy7XFWt+KVFjN5oxYNNNBs3tPYeLhaR6PUrJyCBjqDXPHZqTqEoQlGaxustNzNn1g0n56Ol9/EH19dPY/bAHmnBMAdPzRceCTnAw/+qj49re/nabTaTJx7BjH6Ojz67BjB8HRowBAJ269lZ0JE/dblZERCLEp0MpesNhW0Eo/2DM/bdv8/W+G91xwVRyj/2Xxx5/6zjteNzoyJk5gwl87Bv7oMOj4Y/DAIeJtveLWI7P+3r34j2/6//GPf5H+fd62VasI6B81WzX78sHITVsj6H/4WBOv3qJh3QoJByYd7DnOucU90p0kfGNXGE+drld/MmVfemhycf+ZZiO/YrzK/+2CjYKOjcG/bS/ctQD/xn8FGxuD/6GbhL/sCzv+zPiUcekOevU13T84b9evHCA0Pg6vh2PF13e0Pfn5k96Jbrbi9QD4LVu3ij8aGaGjo7/ewMcXOPv08ufecIpAuevgscVPDW3palz4jgvwTK58uhRqNx87TvHdQ2JdltLkvKFhNJppdrpskYWa1To0mT1wJih1vzfA7doFdvaKwMYru6V1uwAmvuF5xpQSU2rmPBNKBxq6wyTXC+dsACSfB/kUwAZSqcGPXX/+/SPDW3cEYuF42aWnR4ch/sP+/e5NY2P+rpfG02C7sIs98dyBcUJg2h40VVF9j2uO2hPjqy8cwpHT2fdpIe10tVnhdUkQznndOdiwYzAjy+GhFzSX/KcGbhSgwIjw367puvnjf7ziuZvf3f/ca9bHzvUZkrfcslX64c+tL/74fi939Hg498C9ze/df7S+50cjoB9Ij3AOqDddGv/MTR/avnL2sguMK/7LWzRuTffvGofHGEu+dbj/r97zxp03AiCjo6O/9vP/aGRE4Bzk1ETN/8HXHxMSseQalUpyqivt2YJQ2bNw/K7HF/eTJ6ZO357piXvRlF52nEaRUoJd/9k1bt0ICDAvxyX/3Ru2cmnoQk3ZMSR/7u8+uGLf7PhMvzQxdGTFlvOHLnvL9QPdq173xwBw0xjY0bVjHAjr6aSYXsqdYJN7npY6OnuESzetuuma9eGPfeXDl+7/m8984OPb2vV/AhD81Kc+xX5dP33T2BjjnGO6qLz5UKvjTi2VPHrgiUnxyTv3i4Od8bPXXXSV1LvjqqrTbN07/v0D4pHHTwUAmIz9zmB2JmuV/6GiAoDgGfPATOLTFx9rnHPujS4GPqpf9MiPXJSKwHMY98Z34T+OjuATEyM0gzG7uCiXu9a/lg6eHeNqUMNb33rFdTfzwHVDZ+/AsWcf8/fv3X8I6HUZnyUvwXbxF3bh7ANwI7rO0Yyl5fc/RyV1Pjf79xX32gSVyCNUSez/wf2znzAkuwDgjEy8+72QH70wGuJNOyJ/dvAzbfzJ0TZ+zcbIN67ZulUfGYHAAcJ/5WC8UYCCEPQBmx75+nu5v3wna01+l88++hnOs3d6E3f/hfudT1zvnvqX9/p/ceOGw0C7/sK54S/J74yOjtJRvPynCf9Oa9yLpo8DZN2y/J38VKA2sWR6Pz00+B1gr4u9IOT/6+3ljDggVm4hz5vTp4jnWVjYewAHn9knVAs1RKjJHCtNl/LVp7E25n2SLP1aacG/D5x+GeCQ4eFhYSeAXePjPuccN910Ex0bG2Ojw8PCoxj/5V6J3yUhL/c/4//7fAs3be188/Ca6FfWrOpR+7pj4r49x3D88CRrW9Ev7p7O3/rNx5Y+yDlesHj/F5iv33bl5P8Pr0dGh8U+zNJHZ//XizwOcA7gpqXGwWypdbi3k900O78sx1MipaGM8KW7p6+9f6LwZT4KSi7+vxe031Uho6OgNwx3dmUP/8mVX/vERZdXJz5yxZc/9porAAgvaBn5wzL9PiGKP4D2ovy//PWw1rwgejEAAAAASUVORK5CYII=',
  bg: {
    spring: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA4KCw0LCQ4NDA0QDw4RFiQXFhQUFiwgIRokNC43NjMuMjI6QVNGOj1OPjIySGJJTlZYXV5dOEVmbWVabFNbXVn/2wBDAQ8QEBYTFioXFypZOzI7WVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVn/wAARCAC0ArwDASIAAhEBAxEB/8QAGwABAAIDAQEAAAAAAAAAAAAAAAQFAQIDBgf/xABGEAABAwICBAoEDAYCAgMAAAABAAIDBBEFEhMhMVEGFBUiQWFxkZLRMlJygSMzNDVCU1VzgqGxwRYkVGKTlDbhQ0R0ovD/xAAaAQEBAQEBAQEAAAAAAAAAAAAAAQIDBAUG/8QAJxEBAAIBAwQCAwADAQAAAAAAAAECEQMSEyExQVEEUhQiMkKhsQX/2gAMAwEAAhEDEQA/APCreH4+L22/qFot4fj4/bb+oRJ7PqDvSPasLLvSPasL0PliIioIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIuVTUR00Rkle1o12DiBc7gosRno6rhU1tNSMDqmdkTXGwLjtKpBV1uKtzAupac/QGp56CCekLrT4bTU2uOINcRYkLlOrEdn0dL/AM+1ozacJnLmF/10PeVNgqIqiJssMjXxu2OB2qsdA0jUB7woUuH07pM+jDJRrD27Qd6zGt7dbf8AmdP1s9Ii8/FidVQSRx1N6mF7srZNjm7y47lfRvZIwPjc17Dsc03BXatot2fN1dG2lbbZsq/H/mOt+7/cKwVfj/zHW/d/uFZ7MU/qHz1ERed9MREQZW8Px8ftt/ULVbw/Hx+239QiT2fTj6R7VhZPpHtWF6HyxERUEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBUfCmlmqqODQRmTRy53W6BbarxYcA5pa4XBFiCpMZjDdLbLRZ56kqo5Iw6J4c09O9TBKLawudZgbGh01C8wOAuYwLtIA2AdBKraOre8ZJGGKYelE7a1eS1Jq/RaHyaa8dO62MotqC5OdtJXMmQC/NUGaolmnbBTtdJIXAOyi+jB+kQsxGej0XtXTrus3xGZjoTCD8JKC1g9YnoV1gVPLS4NTQzsLJGNOZp6NZXOjwWCBwkqDxmb1njmg72joVovTp02vgfL+TGtPSOgq/HvmOs+7/cKwVfj3zJWfd/uF0ns8dP6h8+RZRed9NhFlEGVvD8fH7bf1C0W8Px8ftt/UIk9n013pHtWFk+ke1YXofLERFQREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBeYx+AUFayvizSS1UgjLDsGro7l6deUx01M2JaOplFNRRPa+GV0YsXWHT09K56mNvV6PjTaL5rLvPJWxwSvOGzANaSSXtsLe9d+DVK10RxPM4S1LcrmfRFj0dyiTYg6ZksT8cpSxzSDaFuu/vXfgwaqPPTk6ShjZ8DKGWDjfXr6elc9Oa7v1er5N9W9P3mHoURF6HzRV+O/MlZ93+4Vgq/HfmSs+7/cKT2ap/UPAIiLzvpiIiDK3h+Pj9tv6rWy3h+Pj9tv6ok9n0s+ke1YWT6R7Vheh8sREVBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQFggO2gHtCyig10bPUb4QtgABYAAdSIgIiKgq/HfmSs+7/cKwUDHfmWs+7/cKT2ap/UPAIs2Sy876bCLNksgyt4fjo/bb+q0sukPx0ftt/VEns+kn0j2rCyfSPasL0PliIioIiICIiAiIgIiICIiAiIgIiICIiAiIgIiKAiIqCIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICgY58y1n3f7hT1Axz5lrPu/3Ck9mqf1DwSLNliy876YiWSyDK3h+Oj9tv6rRdIPlEXtt/UIk9n0g+ke1YVg6nizO5g2lcnUgtzXG/Wu+XzppKIi2dG5hs4ELL4nsF3CwVZxLRERVBERAREQEXSKPSOtcCy7mkGrK4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',
    summer: 'data:image/jpeg;base64,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',
    autumn: 'data:image/jpeg;base64,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',
    winter: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA4KCw0LCQ4NDA0QDw4RFiQXFhQUFiwgIRokNC43NjMuMjI6QVNGOj1OPjIySGJJTlZYXV5dOEVmbWVabFNbXVn/2wBDAQ8QEBYTFioXFypZOzI7WVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVn/wAARCAC0ArwDASIAAhEBAxEB/8QAGgABAAMBAQEAAAAAAAAAAAAAAAEDBAUCBv/EAEgQAAEDAgMCCwUEBwcDBQAAAAEAAgMEEQUSIRUxExQiQVFSVGGRktEycXKB4SMzYsEGNEJTgqGxFiQ1Q3OTlCWiwkRVY4PS/8QAGQEBAQEBAQEAAAAAAAAAAAAAAAECAwQF/8QAKREBAAIBAwQCAgMBAAMAAAAAAAECEQMSURMhMUEyoQThFCJh8DNxgf/aAAwDAQACEQMRAD8A+FXRoPuD8R/Jc5dGg+4PxH8l00/KS0oiL0IL0+N7LZ2luYXFxvWihqY6aZr5IGygG+u9dfEcZpJqZsbIGyEttroG9ymZHzyKXG7iQAL8w5lCoIiICIiAi9sY1zHEyNaRuaQeUvCAiIgIiICIiAiIgK6mnNPIHhjHfEL+HQqUQaayrNVIXGNjNb6DX5nnWZEQEREBERAREQEREBERAREQF7kZwbsuZrtL3abheEQEREBERAREQEREBERAREQEREBERB6Eb3Mc8NJY3e4DQLytkeI1EcDogQQdASNQsjnFzi5xuSblBCIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgtgfEyQGaMvb0A2VtdLTSyE08RZ33sPBZUQEREGTEPumfF+SwLfiH3bPi/JYF59T5LAiIuapXQofuD8R/JYLLfQ/cH4iumn5SWlERehBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQe2OYGuD2FxI0Oa1l4REBERAREQEREBERAREQEREBERBkr/u2fF+SwrfX/AHbPiWGy8+p8lhCKbIuapW+i+4PxFYVuovuT8RXTT8pLQiLdFXRspXxGmjJNvcfevQjCilxu4kAC53DmUICIiAiIgIiICIiAiIgIiICIiAiKWuLXBzTYjUFBCL097pHlzzdx3leUBERAREQEREBERAREQF7iikmfljaXO6AvCkEtNwbHuQX1NHPS/eN5PWG73LOvcs0kzs0ry4968ICIiAiIgIiICIiAiIgIiICL2DHwbrh3CcxB0XhAREQEREBERAREQEREBERAREQEREBERAREQEREBEUgAkAmw6ehBCL6DDMKoZoC984kcWnuy965VfTQ00xbDUCUDmt+amTDIiIqCIiAiIgy133bPi/JYltrvu2e/wDJY159T5LCEUouai3Uf3J+IrEt1H9yfiXTT8pK9ERehBERAREQEREBERARFIBcQACSdwCCEUkFpIIII3gqEBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAW6CgbLTPlNRGC0Xtfd7+hYUQS9uV5bcOsbXG4qERAREQEREBERARS1pc4NFrk21NlL2Fjy11rjoN0HlERAREQS17mXyuLb6GxtdQiICIiAiIgIiIM1b92z3rEttb9233rGvPqfJYQilFzVK20n3R96xrZSfdH4l00/KSvREXoQREQEXpjDI8Nba56TYKHAtcWm1xpoghERAREQFfS1LqWQOa1rtdQR+fMqEQX1VS6qkzOa1utwAPz51QiICIiAiIgIgF92qnKeg+CCEU2PQVCAiIgIiICIvccr4iTG4tJFjbnCDwiIgIiICIiAiIgIiICIiAi9yxuidlcW3tfkkFeEBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBEQb9dEBF6ka1ryGPzt6bWXlBnrPu2+9Y1srPu2+9ZF59T5LCEUouapWyk+6PxLEunh36ufiP5Lpp/IEWktB3gFVui52+C9LOFSL01l73cBZeToVAREQEREBERARXRtYR0nnuvQY0G9kXCgNJ3C6nI7qlaEQwzEEb1CvkkYwcsjXcOc+4c6htLUVLc0YbAzeC8XLvlzfNSZwk9lQFzZWtiA36laocFLwC+pnDnb8jrA+4cy1D9HGka1tUD0Zx6Kbk3Q54AG4WRbZcCromudBPHNG0XDHN5Z7r33rnmQxyGOdjoZBoWu3X7juKsWiWomJe1DmNI3KV7jjfK7Kxpce4LQpETRv1Tgm9CvlhkhdaRpHfzKp17cnegzuGVx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',
  },
  plants: {
    wheat:   'data:image/png;base64,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',
    corn:    'data:image/png;base64,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',
    tomato:  'data:image/png;base64,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',
    carrot:  'data:image/png;base64,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',
    grape:   'data:image/png;base64,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',
    straw:   'data:image/png;base64,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',
    pump:    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAJSUlEQVR42u1Ya2ydZR3/PZfzXs6193VtdwXWrbuU7XRblY1OLgLZzAxJicEQAjFLMEE/SEBD9DAVP5BoNEE+EBONkQ+k4lRinOKQwzbcpWdjAyprN2i79rQ9PZee63t73ufxA8MQVNilBRL7+/o+//f//P73509wdaA9G27c2RQM7pO52b3LGqPmqmaT3rzWwPjEHNJ5H1vWNaE8V1LD0y5OTVbmMlp0ltQ3PD48PfnyxNBQHgABoHCNYFd6cQDq7t27V9Xy2eMN0rtx44plLDM1qaZzBWm5mmxvjMq1q5bK1NC4JEZAdXfeoJhrB+F6DdPZ7N5oKCwvptOvzhcBcrkH+/v72cDAgOzp6fmm4aseVKpfDYHA1AMo2zUIxREOMEQ1H5qmoVBxoHGOsMFhOzbKHkFFAF6AFHhd+LnGcN0PDrz0UuZaifDLPdjV1aUAKELkLDHMSVD2TM0XvOwLIBqFhAZPeMj5HnyLAlr0PcGqA0ZNwNBBOVNM1IgvpDVTrVpYxBWE0AfzoL+/n2QyGXK1SltaWtTAwIC/aP5FLOLTSeIPN7YPQ81Hg1pw9PX18Y/5Rj7LHiAA1LbP7/xiVXiPuwqCKBkKUFbgSjx75uTJA5/VECIA1Kbbbw8Fau7DBud3WsLLOlSNQyBsMpSkjzjl2glY7tODg4cvztfMcyUx/LGElwaDzRXXfTRbqbXYhey+SC73w5A/9/3BI4cfmbOs31d98SiNBnovzVB0IT3Ar0bItm2wAB1VYM0mjd4thLhXEqr39PR8ZdpRVSghgoFA7ZPIgyu1jgSAyQsXpojwvlVHWEoPaE9qMeMMk+qRk7sHJw1CukNM9zSbBgCoLoAl+vr4RyX9p5bEfV2br0eDsbnlGx2/G7jnvdmmobu3vbsudK/lO7dVXZF848SxH70vlLhE4hUAyWRSfFoE/iMpt3R2/7gTfmz7yvrpozbMo35gvScqazcpxe8KRw+cGZkpvWkEi6eHTzz1X3SrT7wKASA39Wz5eoPy16xgeoBU3IeW1ipYFtXwFmF4nerwfYF1PtCj2ZBLOc5Hm5EZtp+ekY5X5PT8K4ODz/wvgyyoBzZs2LBky/LVnXJsLNnl1xDvqIdbyMtZS5OnR/O4/gYTnW0gTGr03bTCqfMz/mM/34Mgn6Unn8/RoVEbZxWDs3TFXVNO4fiRI0cK10List/E8Xg88KUnnmD+qaGfNV2Y/Gmv5jrbWlxs7W2Sfx/Os/Njebq1tY7u+vJquvnBdrryc8tJNOwRmbHpC38apelsidz3+C7BJyekftER+Zni/Yrw9Zue/toL6weSGFooAolEgiaTSbV98+bOyqHDJ7psFd8YcfVbtljcCobobw6laUSGsLbNQPdNBBGzCreaQaiVIdbBcN36VmDKgzcawF+PDNP2ekY3rvCZLDmKOcHOiZdP31/sXPOH0YsXCwmAJq+QyGWX0fqGBi1YrS1vKubC7aaLjiYGPxzEm+8yBByKJaaDaKMHQ3hgowK5U1OolSzUd8fQ2lQBdQRSr+VBhIklbQoduiDNpSzMirPc5HXaJXMtXCOjQigoIhXzwSWno5N1yDsWYgEBQSgs4oHaQSguAe6BjPkglkSlosMvKzgaQ30oiLmChXfGANdphs9zsAmVgtCF30poHlBVPpUgikodI2+XkHYBRRgUFWBSB6GATwmIouAag2sJqPE5wKXQJAXAMH7ehpyuQSNhBCQDoYpCdy9p2b9wndjXqSKggklNVgkFZxwhycAU4BMKonQQVgLggiAIIQCtuRENO9rhxwBuc0BREF4Hyk3YvAifOMrwTEGIoRY8hCrVKtOCEZ7OzSI/UvK7V7fB4y5VyiZESijig6goFPHgqyI41SAnyyiWBVhJwdNdKAiYpCIdKPXqeaaEH+NGA+G5aoVdbQh9rGAymUR/P1i22OF6xB8p6LybWFq944HmqjaZE0p1xkxSzwlmsy6YqaOujiBAg5jN1TD9mg2vqiNLfIwXfVUGodUyp3kSoDNNAVEMa/ssu3xye1+f98zQM2ohGhl9f4gDgN7urffEfPkwr/quzmlXqFxq7WAEbaZEW9BDWytBtFEHkRK5vIOLGYJCRcNsjeKiYMjEeNr1xfFYJDRsBfkrLx47dvCjxpR56cSbb96+TimtnihhCuafeyN5YgIAvrCj74HmdDnBC3OtIerpPU1NCLo2ahAQhEFXBF5Y4dyEi7wfcqx6P51viX730MljzwHApltvXSNtbwURPo8YfOq1ZPL1efVAb2+vGYk0txac0q9qtrUchKwM6eZvIdSTK8edc2dDBd7Q1rZ5yUTpxfpZO+JLD15AESIJdI9BBBxQJZSkOqpLG+dyrdF7C29OH8YSYFnTsroZaf2lYFVX64qYIcN4t6E+dgtxnKmDBw8611SFEokEBYBQKLS2WMr/kQk1ohNtr0n0TXA925fen4t3bGlfHos9FJ6YeXlalkL/bKiSdKRKZk0H01EPE9Ei0iGBsZhGJoM1FCrpGJnKHGjvCN5nXNeyMe3Ong1RHIqoQI+u8W6NsTPlQumXvu+v++AdrtYDBIDas2dPcHJy+k7qqMHUUGocALZv2LDEbGu7zZqZ+l6rJxvXLGlpfHt8QhFqkQd2r8OFkTxGpy3cvK0dmWwR5y5ksG3TdVCeq1Ln82S4RrNZZlzgjaFfV4q5Q4ZrKKHTp0zTWOZZzk8cp/bS2bNnL3vtTq4w3NTW3q13NkhvxypBv8OUpDnliijltNE0sGGVjpAhwVkIdrkKGqAwjCBqtQoIJQhHYmpwZJwN57mfc9mvZCj43GmnerwFeDDA+ezg8ePPz3sZ7evr42NjY9i5c2frDe3t3+Y17zGSt/Y2RwKkDIJ3smUajnHCqSIjYzbxqCJSp+TEW0WStyXhYUZODs+S8TlBgmFO50o2ipai+eLcFg/+7uZgKK+b5rP/OHr0jUu65rcKJRIJun//frljx45Nsmb9ggl/injUBasRKTkC1IQUZQhQgGrwPRe+J2BGwvCEDd+SQJBDQYDZHsB1gDEYHD4YMZRuVhzDSNyxa9c7+/fvxwdL9nw/aAgSCYL160m88Dcaxz4AKaSQAhBHPB5HHCmkEEccQCqVev8hAaTeO3Ppw79/WNi3T2Z27Qokk0n3Si/+f7vcXag9j8IiFrGIRSxiEVeBfwFXPG2T344ojgAAAABJRU5ErkJggg==',
    apple:   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAH3ElEQVR42u2ZbWxT1xnH/+ece+3razuOExzShLyShCQkAeKQkJdi6AtjWrW2kywmtWL9MCE0Jm0fOmnSNjnRNHXS1i9j/TD2YVsrTeuyCrZqWlehETNKhKhhQGoKJAGniRPbie3E7/ft7EPCRIBV07SEaMrvk597j6/Oo+f+n/M/5xKshgBAR0evq1QmX6Op2IlyQiz1Jc6yzhaJy6JIxj6ZQ3VtEUptxfzWxDz5NJ5PfLKYnyLlrvei6fT71y5f+8fKczjWAfZQTAnAq52lf7Lkc8faKh0OkVPbp5OzWkHnXFKY0bm70QgvJIzQTJTv3lVn2KgkMw3lC4n5g0QQ9ZaOPRfGx8cLWCcYAPh8Pur3+3lnZ2dPdcW277J8vodoOWs2p7B4TkOamui8Qui9RJpen16gY7M5Opko0OBMgt4KL5G5VB6pggFFI5WKrvfWNzbOhkKhe16vlwWDwTWthAAAQ0NDHAAIIWGAQnSW/JIaeTlZyLl0RmFYJeQMikU1CyOtgjITIEiYTqkQCAMRBXCZgXBooiAomYySAYDW1laOTT4f8nDs8XhYWVkZB4BoNEr+m4f6/X59vUS8ySab/H/iox6PR3hMl1rF8hgf3Wizf8RePGYMfSg5ulEmCwC8vb332Zqq7a9UOq23w7FYyuPxCKFQyHhg7eAEBG53zw9KShotsdi98ZXr5EkmQLq7u4tsxcV91KW9KT0l7leJnRXpzsyVG5em/zV5n4+0JJOtrp3bj4ou5Q3RBGsRrRyvSZTHZjGrr3cSq8xcc3N761xm6YdV/WV9O1+otN+8fXefw+RQmurq5kRRzMbjcQUjftT8uuXVBUvqxwe+Xk00JHZEwpneCnddymlnyWPHvpHy+/3rlgAFgGAwSAAgmy3YVSp0FgToqjXK9321yOwasJ+YUpZGbWUl3wTACQU3mDnLATWjp+iWfTbSd7y5Y86IvK0J9tcHBwfX1UKsEl9GyxeJouQMfybwa5fSlMoi4c4CkkpBhMqKvV4vAwDGGTWIRikxEF+g5NpUksypIjizz9/X0RNJgGnIEa4lcimBRiI2nidmEIBDF5lCeGZ4eFg3DBCVcgouwEpl5HIGZqctXFEkTpjKMDhI1r0Cwyu+3WQSw3aB/9mmKwWSpliKcp4ucCaWWjm1CPuf7n26jxBwM2hW1wmm4xSJpMrtKUaqqT5mM7RU1+wsW08hsxX/ywFgZia00NrQ9OHSfKYmn1B2LSZlLV5ghG11GOlUqoao2q76puZxldHuBa4MLC7ajKVbBujdVLjZKR8NRyJnXu75QPf71+8VIo+JudvtdDDHzoNxpXBaKRZhrypDVlNA0poen1igtkoXMRWJUCaicML0pk3XTo6OjoY2woYGD54odHe7vyTIdslZ5hQnY8mfRk3mSquL8+xihksphmqz6TtkPv6HjwKBKYATgPCNkAAedyyyfXfPhQWntc/VVmykbseoNKOQ3dvkhjMfnJvweDyC3+/XNoqVWGXWamtrqbW2Vi41M7Nk0pY0VWhLZ7ScTLWrIqN/f+3oa+Hf1Nby+zramKz0/+bOhn1buge4qeuA0jzQ/8eDBw/tWr7tZRtlU/+oswMIOEdr3zPVDr7UnyN4J8nNl8tEnnJSvGWklXN/u3pl0TCeTAGEz0vuF8fcAjkVUCEV1/7o1Z6xNtluNQBDlq27TAaTcibxufNThdNnA9x7+HCD8JeeV1QyNGRsiAoQAnAOvPBM3/cO7qg4cahjy9ZtDhPJm+3kvYvXZyZvzPyqZKvDlOf8ePXWSmXkRujwbz+8EPB6vWx4eFh/4m30uT17KgbaGn/eVmXZ31dvLRVdDoNarZAFg459lp+8lXWNfvsn7/xudxl/6VBDzYDZZk7fWUhePPnuX78FzkHI+rRU4VG9gg4PQ9dMelW7q/ByT62Ap7ZX8KwqUA0EyKfRVSXXd0kl9YtHul68HoqFk+ZC+Cvl5gMOUbIuF46QJ66B1GJSjSyk9Kl5mehOnapGBmAAJwxGKscFfsd4aW+dzdvb1KSSfNPtj68bkaRaAABK189KPJwAmZwE9fl8fPTj8+T0lbvszEc3OWWXQDUFIteRExl06IRwMGpYOEcegq4bCpWZ5Cy5eo5z4fWuLhIIBHQAay5o9uCiFQqFjNlZGOnE4vd5NP5Gu2uLw0JNJDQ9gy/3N6G3cQsy0SX0N9fhQIsL2fkM6airIM+7a6iYLvCCVih/9+RbXyytbgyM3745521tNQVjMWPNRezz+ejQ0JCxd+/ecoNqxxsMi3ebxlsTelKjJkItXEBLjRO1RTpMJgkphUPT87DJFiiqBlXJwW6z80g8yy5PpbNzrPj9mKFeHBkd/dm/syb/y1eIAEB/b9cJs8afzyZzL6oSR8Eq485cQbCLInaWWhGcmMc9SUDzDgkTUxHEk0BXu4BIJI67swo6dgpAXodIRDk/HzvCuXbkCwN9Vbokv3327NkxzjlZi84k3N8Tq6r+LDQuyYL0+6haYPdSWdisTuR1jovxNCAQ6JkcRs7fhSQyGALD1YshMGoHJCuuBabADAncJHCRCYZAGC3ktB2UGg0AbgwODtK1qMLqwynO4T51irnhhhtAAIGVW8sR4F7+icBKuHI9EADcx5aHBpb/c6upiWNkBLHhYRoMBpXN087/oAJrtfhsfqnZZJNNNtlkzfgn/jqMYLEpIH8AAAAASUVORK5CYII=',
  },
  animals: [
    'data:image/png;base64,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',
    'data:image/png;base64,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',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAYAAADPRbkKAAADh0lEQVR42u2YvW8cRRiHn5md270PO5E/4zh2MLaDERAi4QJkBZkCISSQoHGgDEJUNPwBSJtVkKhokCAtoUGRJURDQQM5gdNEjiGJHds4OGcckvgjPu/dee/2Y4YiRpEhKRDEOdA93U7xan+a0fs+M/BXBEBbb2/3wL6jlUNtz3sAPa2tB6a//uh6deq0/uTku28BfOe6ioeMuk8A0yTTe2UqyWqjQwCruTmZuVZ0bvuIucKGBDjLw+deAQwgHEesirh6S8ukGaDQ3r7+4cefTwntPKtF7jyA53maOkUADA0Ndff3P3Fwe00CDA4e7hkeHk7xH0DwP0DeI4ikQYMGDRr80etdd1T92Qm8fD7ZnsgNHvgOvP/OsTeTjV9JAohFZGpxIsr79nz12el87QQID3RdB1id+MIsXpggWN0iljFaJHz57WXvVP6nE8Z1pfA8U8/HSbW3EWcef5T5lQtUo4CmZke/PDzkLm8WbwnPO2UMQog7il2XrlMub6qLc/Mq1FrZ6ayqhdru2eMkrzz39KcvPtV3rK8Px3XrV+xkLtfKY08eQTo2oRGUI0kYVKxnOtP6tZEjZ1qaDg15Htp161PiVHH5Bgvz82Sb0yQYRByi1wNySSS6ssq0ClHX7VTNTp4n17KX3oEhpNQkskrh8lWitQqhjkSYiurb951cmt7+boRlSLQAkeKRgT4sZVMtGRPV9/+jgg0QWmFkghHW9n1FseaHLK/4wops2x0dVYyvSne0Y8dMOAu8kM9vr7l47H7LVTNTS3Ts76SzpwUhQ6RlUSppM3N1jV82t5bOXfevnZubi+9XIH9XQHa8auxaAJVNmx8vXuGlA0dJKYPv+8xeWjZ+JRab6yvfv3G46+2U2i+jrUSXKzVIpZBSGqQS5aB6o8nJToY2YNt8MzFxhTuTe9dCiKUzJw06ha0MxDUWphf4efo3bMfi4GA7UgkwYHSKpcU1SkVItERbNjeLJdZKPqEWxLZiPai8t1xeP/368eO+t0sTXHzw6kioSaGNRBhJEsVIJIMDHThOTWNibQxorYhCxeKST7BVS1vKrsZY4nbRtyqVkMRRumwhitWtkR9mL02OjY1Z4+PjyQMPMNDS3QsB6UwGyEAGIKA1nSEAgmpAlQACcNJpIYQw1HSXrVixcjkdVO8WK8dxVCgUbjYc+W8+Xkn3HxTwdn7Wtbk2aNCgwb/P7weBhQMyV8yQAAAAAElFTkSuQmCC',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAYAAADPRbkKAAAE9ElEQVR42u1YXUwUVxT+7p3ZXXZhWaHAurDAClYUxR8WrMXKtFLRYjXVZKg/NS2aoCQ2aVOr0ZpMaR/qQx/6k/bBh0aMSdPd9KFNbNNWq5tGtEWjRQEbUFlA+ZVdGHZnl52Z24f+vdhqVGRJ+d7P3O+b851zz7lAHEACKAA8W+jOeWNZ2fiP+zexb96sZgdWri4GAFEUuX+L5RFHSElJQUZKAgy8jogWg8Fw9xgaH9QlACA2auaMPAfGxkGg31NkPAggve5eDgBLy3YGiQbwxAgwOiUEEADs8IXDMaSmJvf8enYTIjE6GlR1TedZGLG7foCfbPJAnm394oxSMz9etTQ36/Wk6Jg6fEtGcn4u1c08iVcBRBRFOnCx0VHkyDjgtqfX2cxROPKTYICFpyrD+aGRcPdIUI1LAYIgcF6vV11buqA0IyttmyM7rSeijhi6ggrhjCYWjHHkq6bmF49f8F8RRZHzer3af6VxEpuPRIXTp41jBVZ64VwXsffb4XSaWE+si/Q3N4fwfwCJBw7szkQYpjGNaUzjoXccSZLolFfh8Xi4KXnf1NXVpWzdWlMIAIw9nEzQR/THKQCYTCb3E0vdLS+/VLODkHp9KtmJMMYoAO7dtw9dPHXyDNuyrXLL3fbduMmAIAgcRzkd6YXpPXIwmZDftO2bKrZ5PCLn8YhxbSHidrsNPp9P1ZluFBbYd5e6wnkr5iqcjUZRXe3VAJE9cHFNECjwx2a+bMXK4uJFsw9VFqU881TeCDFYLOzo8fZA++3Ieyd+uvlJa2tr7H6HNzKR5KuqNuYGbweqVq1+fkNJceEq++hxLStVpp4TN8IOp01PdmZZt792LKO/PzTIGCP3I2IiLEQkScLcWQvnBAfkY5kO16fjMawKDqrasHEB1xKwRWMxGlo4P9faeKatqa9vbPBBDuMmoGD5hoYGLS+7YKeucTWj4YgmKxo4nnIVG3fDZkrml+cOJbZc7lSb2nsuLX96jv3nX7rOMwZWXx8fFqIA9CLXkvKALH+0tLzCXlO7Z2ZWjo2ZE63ErHSxaO/nRAmPKarNzE43dmPPviMzAcj/vFRMroUYAPAmdDCiHLAmW97v7r4R6rgxqNERHSoyQebtYi1yWXDnq1++smffkVRBkJT73cImbCbpu90njymh9o5LZ9uzZ81Jd2XOLxkNj+ozHIlU1YzIL5hrTc+wr+vuGTp3rrGhXRAE3u/364gX1NbWGgBw61+oPvj9yebotU41dqVjlF29FmJXLodY27Ww5u9j7LOjX+slT64o+6t+4uYiczg2MwCa05mfkJNTYNSIBgM1YSwQQWfPdYDoVJaHWWXlGrajZtcJl2teuc/nUwVB4uNCwN9dgvCqv/MmIzBiaHAYnX4/XC4XCGWgFESWQ2TN6g3mtw6+80NR0ZIKn69eFUXJKEkSfy9NZsJf5nRNT+ANHBnoH8bVtutIMltgMiZA1RVQwoNyPFFV6GvXbjDwBvrtxx9+sM7rrf9u0osY6KR+v1+f/XjBbAbDczqzkPGIRjnCI9FqQUKiCVFFgxKKgBCdBAJBNr+wlDeZLJvNJrNz0cJioaX10qk/xxHyyAX4/X5dFD2c54v9TUzTWWZaTkWS9TFNU2QaVEKYMSMVSl8YA4FB6ByP4VtjRCMcYwYjLS+vcC8uWVKmMm6w96bctnfv7pjP57vjOb8DgzQO1oB9hAIAAAAASUVORK5CYII=',
    'data:image/png;base64,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',
  ],
};

// ── COLHEITA FELIZ ──
// ══════════════════════════════════════════════════════════════════
const FARM_CROPS = [
  { id:'wheat',  emoji:'🌾', name:'Trigo',      cost:5,  reward:12, time:30,  xp:8,  desc:'Cresce em 30s' },
  { id:'corn',   emoji:'🌽', name:'Milho',      cost:10, reward:25, time:60,  xp:15, desc:'Cresce em 1min' },
  { id:'tomato', emoji:'🍅', name:'Tomate',     cost:18, reward:45, time:120, xp:25, desc:'Cresce em 2min' },
  { id:'carrot', emoji:'🥕', name:'Cenoura',    cost:25, reward:65, time:180, xp:35, desc:'Cresce em 3min' },
  { id:'grape',  emoji:'🍇', name:'Uva',        cost:40, reward:110,time:300, xp:55, desc:'Cresce em 5min', lvlReq:3 },
  { id:'straw',  emoji:'🍓', name:'Morango',    cost:60, reward:160,time:480, xp:80, desc:'Cresce em 8min', lvlReq:5 },
  { id:'pump',   emoji:'🎃', name:'Abóbora',    cost:80, reward:220,time:600, xp:100,desc:'Cresce em 10min',lvlReq:7 },
  { id:'apple',  emoji:'🍎', name:'Maçã',       cost:120,reward:350,time:900, xp:150,desc:'Cresce em 15min',lvlReq:10},
];
let FARM_ROWS = 4, FARM_COLS = 6;
const XP_PER_LEVEL = (lvl) => Math.floor(100 * Math.pow(1.4, lvl - 1));
function farmIsAdmin(){ try{ return me && (me.nick==='apexzinn'||me.role==='admin'||me.is_admin===true); }catch(e){ return false; } }

let farm = {
  coins: 50, level: 1, xp: 0,
  tool: 'plant',
  selectedSeed: 'wheat',
  cells: [],
  owned: ['wheat','corn'],
  season: 0,
  seasonTimer: null,
  tickTimer: null,
  luckBoost: 0,
  offers: [],
  offerTimer: null,
  expansions: 0,
  title: null,
  fontStyle: 'normal',
};

const SEASONS = [
  {name:'🌸 Primavera', bonus:1.0},
  {name:'☀️ Verão',     bonus:1.2},
  {name:'🍂 Outono',    bonus:1.1},
  {name:'❄️ Inverno',   bonus:0.8},
];

async function farmSave(){
  if(!me) return;
  const state = {
    coins: farm.coins, level: farm.level, xp: farm.xp,
    owned: farm.owned, selectedSeed: farm.selectedSeed,
    luckBoost: farm.luckBoost, expansions: farm.expansions,
    title: farm.title, fontStyle: farm.fontStyle,
    stock: farm.stock||{}, harvestTimes: farm.harvestTimes||{},
    spinsLeft: farm.spinsLeft, lastSpinDate: farm.lastSpinDate,
    cells: farm.cells.map(c=>({
      state: c.state==='growing'||c.state==='seeded'?c.state:'empty',
      crop: c.crop, plantedAt: c.plantedAt, waterCount: c.waterCount, readyAt: c.readyAt,
    })),
  };
  // Also save font_style to users table for post rendering
  await Promise.all([
    sb.from('users').update({ farm_state: state, font_style: farm.fontStyle||'normal', farm_title: farm.title||null }).eq('nick', me.nick),
  ]);
}

async function farmLoad(){
  if(!me) return false;
  const {data} = await sb.from('users').select('farm_state').eq('nick', me.nick).maybeSingle();
  if(!data || !data.farm_state) return false;
  const s = data.farm_state;
  farm.coins = s.coins ?? farm.coins;
  farm.level = s.level ?? farm.level;
  farm.xp    = s.xp ?? farm.xp;
  farm.owned = s.owned ?? farm.owned;
  farm.selectedSeed = s.selectedSeed ?? farm.selectedSeed;
  farm.luckBoost = s.luckBoost ?? 0;
  farm.expansions = s.expansions ?? 0;
  farm.title = s.title ?? null;
  farm.fontStyle = s.fontStyle ?? 'normal';
  farm.stock = s.stock ?? {};
  farm.harvestTimes = s.harvestTimes ?? {};
  farm.spinsLeft = s.spinsLeft ?? 10;
  farm.lastSpinDate = s.lastSpinDate ?? '';
  if(Array.isArray(s.cells) && s.cells.length > 0){
    farm.cells = s.cells.map(c=>({
      state: c.state||'empty', crop: c.crop||null,
      plantedAt: c.plantedAt||0, waterCount: c.waterCount||0, readyAt: c.readyAt||0,
    }));
  }
  // Re-add any expansion rows
  if(farm.expansions > 0){
    const expectedCells = (FARM_ROWS + farm.expansions) * FARM_COLS;
    while(farm.cells.length < expectedCells){
      farm.cells.push({state:'empty',crop:null,plantedAt:0,waterCount:0,readyAt:0});
    }
  }
  return true;
}

async function farmInit(){
  // Admin init
  if(farmIsAdmin()){
    farm.coins = 999999999;
    farm.xp = 999999999;
    farm.level = 99;
    farm.luckBoost = 3;
    FARM_CROPS.forEach(c=>{ if(!farm.owned.includes(c.id)) farm.owned.push(c.id); });
  } else {
    // Load saved state for normal users
    const loaded = await farmLoad();
    if(!loaded){
      // First time — default cells
      farm.cells = Array.from({length: FARM_ROWS * FARM_COLS}, () => ({
        state:'empty', crop:null, plantedAt:0, waterCount:0, readyAt:0,
      }));
    }
  }
  if(!farm.cells.length){
    farm.cells = Array.from({length: FARM_ROWS * FARM_COLS}, () => ({
      state:'empty', crop:null, plantedAt:0, waterCount:0, readyAt:0,
    }));
  }
  farmRenderGrid();
  farmUpdateHud();
  farmUpdateSeedSelect();
  farmSetSeason(Math.floor(Math.random()*4));
  farmInitDecorations();
  farmRenderStock();
  clearInterval(farm.tickTimer);
  farm.tickTimer = setInterval(farmTick, 5000);
  clearInterval(farm.seasonTimer);
  farm.seasonTimer = setInterval(()=>farmSetSeason((farm.season+1)%4), 120000);
  // Ofertas de fazendeiros aparecem periodicamente
  clearInterval(farm.offerTimer);
  farmGenerateOffer();
  farm.offerTimer = setInterval(farmGenerateOffer, 45000);
}

function farmSetSeason(s){
  farm.season = s;
  const el = document.getElementById('fSeason');
  if(el) el.textContent = SEASONS[s].name;
  // Set background image
  const bgKeys = ['spring','summer','autumn','winter'];
  const bgEl = document.getElementById('farmBgImg');
  if(bgEl && FARM_IMG && FARM_IMG.bg) bgEl.src = FARM_IMG.bg[bgKeys[s]] || '';
}

function farmInitDecorations(){
  // Barn
  const barnEl = document.getElementById('farmBarnImg');
  if(barnEl && FARM_IMG && FARM_IMG.barn) barnEl.src = FARM_IMG.barn;
  // Animals
  const row = document.getElementById('farmAnimalsRow');
  if(row && FARM_IMG && FARM_IMG.animals){
    row.innerHTML = '';
    FARM_IMG.animals.slice(0,4).forEach((src, i) => {
      const img = document.createElement('img');
      img.src = src;
      img.style.cssText = `height:${36+i%2*6}px;image-rendering:pixelated;filter:drop-shadow(1px 2px 2px rgba(0,0,0,.3));`;
      img.style.animation = `cloudFloat ${3+i}s ease-in-out infinite alternate`;
      row.appendChild(img);
    });
  }
}

function farmTick(){
  let changed = false;
  const now = Date.now();
  farm.cells.forEach(cell => {
    if(cell.state === 'growing'){
      const bonus = SEASONS[farm.season].bonus;
      const elapsed = (now - cell.plantedAt) * bonus;
      const crop = FARM_CROPS.find(c=>c.id===cell.crop);
      if(crop && elapsed >= crop.time * 1000){
        cell.state = 'ready';
        changed = true;
      }
    }
  });
  if(changed){ farmRenderGrid(); farmSetStatus('🌾 Colheita pronta! Clique para colher.'); }
  farmRenderOffers();
}

function farmRenderGrid(){
  const grid = document.getElementById('farmGrid');
  if(!grid) return;
  grid.innerHTML = '';
  farm.cells.forEach((cell, i) => {
    const div = document.createElement('div');
    div.className = 'farm-cell ' + cell.state;
    div.title = farmCellTitle(cell);
    let inner = '';
    if(cell.state === 'empty'){
      inner = '<span style="font-size:14px;opacity:.5">🟫</span>';
    } else if(cell.state === 'plowed'){
      inner = '<div style="width:100%;height:100%;background:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0,rgba(255,255,255,.07) 2px,transparent 2px,transparent 9px);border-radius:4px;"></div>';
    } else if(cell.state === 'seeded'){
      const crop = FARM_CROPS.find(c=>c.id===cell.crop);
      const plantSrc = FARM_IMG && FARM_IMG.plants && crop ? FARM_IMG.plants[crop.id] : null;
      if(plantSrc) inner = `<img src="${plantSrc}" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;opacity:.55;">`;
      else inner = `<span style="font-size:16px;opacity:.7">${crop?crop.emoji:'🌱'}</span>`;
      inner += `<div class="grow-bar"><div class="grow-fill" style="width:${farmGrowPct(cell)}%"></div></div>`;
    } else if(cell.state === 'growing'){
      const crop = FARM_CROPS.find(c=>c.id===cell.crop);
      const pct = farmGrowPct(cell);
      const plantSrc = FARM_IMG && FARM_IMG.plants && crop ? FARM_IMG.plants[crop.id] : null;
      if(plantSrc) inner = `<img src="${plantSrc}" style="width:${28+Math.floor(pct/10)*2}px;height:${28+Math.floor(pct/10)*2}px;object-fit:contain;image-rendering:pixelated;opacity:${0.65+pct/300};">`;
      else inner = `<span style="font-size:${pct<50?18:24}px">${crop?crop.emoji:'🌿'}</span>`;
      inner += `<div class="grow-bar"><div class="grow-fill" style="width:${pct}%"></div></div>`;
    } else if(cell.state === 'ready'){
      const crop = FARM_CROPS.find(c=>c.id===cell.crop);
      const plantSrc = FARM_IMG && FARM_IMG.plants && crop ? FARM_IMG.plants[crop.id] : null;
      if(plantSrc) inner = `<img src="${plantSrc}" style="width:46px;height:46px;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 0 4px #ffe066);">`;
      else inner = `<span style="font-size:28px">${crop?crop.emoji:'🌾'}</span>`;
    }
    div.innerHTML = inner;
    div.onclick = () => farmCellClick(i);
    grid.appendChild(div);
  });
}

function farmGrowPct(cell){
  if(!cell.crop) return 0;
  const crop = FARM_CROPS.find(c=>c.id===cell.crop);
  if(!crop) return 0;
  const bonus = SEASONS[farm.season].bonus;
  const elapsed = (Date.now() - cell.plantedAt) * bonus;
  return Math.min(100, Math.floor((elapsed / (crop.time * 1000)) * 100));
}

function farmCellTitle(cell){
  if(cell.state === 'empty') return 'Canteiro vazio — use Arar para preparar';
  if(cell.state === 'plowed') return 'Arado — use Plantar para semear';
  if(cell.state === 'ready'){
    const crop = FARM_CROPS.find(c=>c.id===cell.crop);
    return `${crop?crop.name:''} pronto para colher!`;
  }
  const crop = FARM_CROPS.find(c=>c.id===cell.crop);
  if(crop){
    const pct = farmGrowPct(cell);
    return `${crop.name} — ${pct}% crescido`;
  }
  return '';
}

function farmCellClick(i){
  const cell = farm.cells[i];
  const tool = farm.tool;
  if(tool === 'plow'){
    if(cell.state === 'empty'){
      cell.state = 'plowed';
      farmSetStatus('Canteiro arado! Agora plante uma semente.');
      farmRenderGrid();
    } else if(cell.state === 'plowed'){
      farmSetStatus('Este canteiro já está arado.');
    } else {
      farmSetStatus('❌ Só é possível arar canteiros vazios.');
    }
    return;
  }
  if(tool === 'plant'){
    if(cell.state !== 'plowed'){
      farmSetStatus('❌ Primeiro are o canteiro com a ferramenta 🔨');
      return;
    }
    const crop = FARM_CROPS.find(c=>c.id===farm.selectedSeed);
    if(!crop){ farmSetStatus('Selecione uma semente.'); return; }
    if(farm.coins < crop.cost){ farmSetStatus(`❌ Sem moedas! Você precisa de 💰 ${crop.cost}.`); return; }
    farm.coins -= crop.cost;
    cell.state = 'seeded';
    cell.crop = crop.id;
    cell.plantedAt = Date.now();
    cell.waterCount = 0;
    cell.readyAt = Date.now() + crop.time * 1000;
    farmSetStatus(`🌱 ${crop.name} plantado! Regue para crescer mais rápido.`);
    farmUpdateHud();
    farmRenderGrid();
    setTimeout(()=>{ if(cell.state==='seeded'){ cell.state='growing'; farmRenderGrid(); } }, 3000);
    return;
  }
  if(tool === 'water'){
    if(cell.state === 'growing' || cell.state === 'seeded'){
      if(cell.waterCount >= 3){ farmSetStatus('💧 Já foi regado o suficiente!'); return; }
      cell.waterCount++;
      // reduce remaining time by 15%
      const now = Date.now();
      const crop = FARM_CROPS.find(c=>c.id===cell.crop);
      if(crop){
        const elapsed = now - cell.plantedAt;
        const remaining = Math.max(0, crop.time * 1000 - elapsed);
        cell.plantedAt = now - (crop.time * 1000 - remaining * 0.85);
      }
      farmSetStatus(`💧 Regado! (${cell.waterCount}/3) Crescimento acelerado!`);
      farmRenderGrid();
    } else {
      farmSetStatus('Não há nada para regar aqui.');
    }
    return;
  }
  if(tool === 'harvest'){
    if(cell.state === 'ready'){
      const crop = FARM_CROPS.find(c=>c.id===cell.crop);
      const xpGain = crop ? crop.xp : 5;
      farm.xp += xpGain;
      if(!farm.stock) farm.stock={};
      // Chance de fruta dourada (3% normal, +5% por nível de sorte)
      const goldenChance = 0.03 + farm.luckBoost * 0.05;
      const isGolden = Math.random() < goldenChance;
      const stockKey = isGolden ? cell.crop + '_gold' : cell.crop;
      farm.stock[stockKey] = (farm.stock[stockKey]||0)+1;
      farm.harvestTimes = farm.harvestTimes||{};
      farm.harvestTimes[stockKey] = Date.now();
      cell.state='empty'; cell.crop=null; cell.waterCount=0;
      farmLevelCheck(); farmUpdateHud(); farmRenderGrid(); farmRenderStock();
      if(isGolden) toast('✨ FRUTA DOURADA! Vale muito mais no leilão!');
      farmSetStatus(isGolden ? '✨ Fruta Dourada no estoque!' : '📦 Colhido! Use Vender ou Leilão.');
      farmSave();
    } else {
      farmSetStatus('Não há nada pronto para colher aqui.');
    }
    return;
  }
}

function farmLevelCheck(){
  const needed = XP_PER_LEVEL(farm.level);
  while(farm.xp >= needed){
    farm.xp -= needed;
    farm.level++;
    farmSetStatus(`🎊 Nível ${farm.level} alcançado! Novas sementes disponíveis na loja!`);
    toast(`🎊 Nível ${farm.level}!`);
    farmUpdateSeedSelect();
  }
}

function farmSelectTool(t){
  farm.tool = t;
  ['plant','water','harvest','plow'].forEach(x=>{
    const el = document.getElementById('ftool-'+x);
    if(el) el.classList.toggle('active', x===t);
  });
  const tips = {plant:'Clique em canteiros arados para plantar',water:'Clique em plantas para regar (-15% tempo)',harvest:'Clique em plantas prontas para colher',plow:'Clique em canteiros vazios para arar'};
  farmSetStatus(tips[t]||'');
  document.getElementById('farmSeedSel').style.display = t==='plant'?'':'none';
  document.getElementById('farmSeedInfo').style.display = t==='plant'?'':'none';
}

function farmSetStatus(msg){
  const el = document.getElementById('farmStatus');
  if(el) el.textContent = msg;
}

function farmUpdateHud(){
  const setEl = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  setEl('fCoins', farmIsAdmin() ? '∞' : farm.coins);
  setEl('fLevel', farmIsAdmin() ? '∞' : farm.level);
  setEl('fXp', farmIsAdmin() ? '∞' : farm.xp);
  setEl('fXpNext', XP_PER_LEVEL(farm.level));
  const badge = document.getElementById('fAdminBadge');
  if(badge) badge.style.display = farmIsAdmin() ? 'inline-flex' : 'none';
  const luck = document.getElementById('fLuckBadge');
  if(luck) luck.textContent = farm.luckBoost > 0 ? '🍀'.repeat(farm.luckBoost) : '';
  // Title badge in HUD
  const tb = document.getElementById('fTitleBadgeHud');
  if(tb) tb.innerHTML = farmGetTitleBadge(me&&me.nick);
}

function farmUpdateSeedSelect(){
  const sel = document.getElementById('farmSeedSel');
  if(!sel) return;
  sel.innerHTML = '';
  FARM_CROPS.forEach(crop => {
    if(farm.owned.includes(crop.id)){
      const opt = document.createElement('option');
      opt.value = crop.id;
      opt.textContent = `${crop.emoji} ${crop.name} (💰${crop.cost})`;
      if(crop.id === farm.selectedSeed) opt.selected = true;
      sel.appendChild(opt);
    }
  });
  sel.onchange = ()=>{ farm.selectedSeed=sel.value; farmUpdateSeedInfo(); };
  farmUpdateSeedInfo();
}

function farmUpdateSeedInfo(){
  const crop = FARM_CROPS.find(c=>c.id===farm.selectedSeed);
  const el = document.getElementById('farmSeedInfo');
  if(el && crop) el.textContent = `→ ${crop.desc} | Vende por 💰${crop.reward}`;
}

function farmOpenShop(){
  const modal = document.getElementById('farmShopModal');
  if(!modal) return;
  modal.style.display = 'flex';
  const disp = document.getElementById('shopCoinsDisplay');
  if(disp) disp.textContent = farm.coins;
  const list = document.getElementById('farmShopItems');
  list.innerHTML = '';
  FARM_CROPS.forEach(crop => {
    const owned = farm.owned.includes(crop.id);
    const locked = crop.lvlReq && farm.level < crop.lvlReq;
    const div = document.createElement('div');
    div.className = 'farm-shop-item';
    div.innerHTML = `
      <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${(FARM_IMG && FARM_IMG.plants && FARM_IMG.plants[crop.id])
          ? `<img src="${FARM_IMG.plants[crop.id]}" style="width:38px;height:38px;object-fit:contain;image-rendering:pixelated;">`
          : `<span style="font-size:28px">${crop.emoji}</span>`}
      </div>
      <div style="flex:1">
        <div style="font-weight:bold;font-size:13px;color:#2d5a2d">${crop.name}</div>
        <div style="font-size:11px;color:#666">${crop.desc} · Vende 💰${crop.reward} · +${crop.xp}XP</div>
        ${locked?`<div style="font-size:11px;color:#e9007e">🔒 Requer nível ${crop.lvlReq}</div>`:''}
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:#555;margin-bottom:4px">💰 ${crop.cost} cada</div>
        ${owned
          ? `<span style="background:#e8f5e9;color:#2d6a1f;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:bold;">✓ Possui</span>`
          : locked
          ? `<button class="farm-buy-btn" disabled>🔒 Bloqueado</button>`
          : farmIsAdmin()
          ? `<button class="farm-buy-btn" onclick="farmBuySeed('${crop.id}',${crop.cost*5})">Comprar 💰${crop.cost*5}</button>`
          : `<button class="farm-buy-btn" disabled style="background:#bbb;cursor:not-allowed;" title="Disponível apenas para ADMs">🔒 Indisponível</button>`}
      </div>`;
    list.appendChild(div);
  });
}

function farmBuySeed(id, price){
  if(farm.owned.includes(id)){ farmSetStatus('Você já tem essa semente!'); return; }
  if(farm.coins < price){ toast(`❌ Sem moedas! Precisa de 💰${price}`); return; }
  farm.coins -= price;
  farm.owned.push(id);
  farm.selectedSeed = id;
  farmUpdateHud();
  farmUpdateSeedSelect();
  const disp = document.getElementById('shopCoinsDisplay');
  if(disp) disp.textContent = farm.coins;
  farmOpenShop(); // refresh shop
  toast(`✅ Semente desbloqueada!`);
  farmSave();
}

function farmCloseShop(){
  const modal = document.getElementById('farmShopModal');
  if(modal) modal.style.display = 'none';
}

// Auto-init when games tab is opened
const _origShowTab = typeof showTab === 'function' ? showTab : null;
document.addEventListener('DOMContentLoaded', ()=>{
  // patch showTab to init farm when games tab opens
  const origShowTab2 = window.showTab;
  window.showTab = function(tab){
    origShowTab2 && origShowTab2(tab);
    if(tab==='games' && !farm._inited){ farm._inited=true; farmInit(); }
    if(tab==='games' && !cafe._inited){ cafe._inited=true; cafeInit(); }
  };
});




// ══════════════════════════════════════════════════════════════════
// ── CAFÉ MANIA ──
// ══════════════════════════════════════════════════════════════════
const CAFE_RECIPES = [
  { id:'sandwich', emoji:'🥪', name:'Sanduíche',      cost:10, time:20,  sell:25,  xp:8,   lvl:1 },
  { id:'coffee',   emoji:'☕', name:'Café Expresso',  cost:8,  time:15,  sell:20,  xp:6,   lvl:1 },
  { id:'cake',     emoji:'🎂', name:'Bolo de Chocolate', cost:30, time:60, sell:75, xp:20, lvl:1 },
  { id:'pizza',    emoji:'🍕', name:'Pizza',          cost:40, time:90,  sell:110, xp:28,  lvl:2 },
  { id:'burger',   emoji:'🍔', name:'Hambúrguer',     cost:25, time:45,  sell:65,  xp:18,  lvl:2 },
  { id:'sushi',    emoji:'🍱', name:'Sushi',          cost:60, time:120, sell:160, xp:40,  lvl:3 },
  { id:'steak',    emoji:'🥩', name:'Filé Mignon',   cost:80, time:150, sell:220, xp:55,  lvl:4 },
  { id:'lobster',  emoji:'🦞', name:'Lagosta',        cost:150,time:300, sell:420, xp:100, lvl:5 },
];

const CAFE_XP_LEVEL = lvl => Math.floor(100 * Math.pow(1.5, lvl - 1));
const CAFE_STOVE_PRICES = [150, 300, 500, 800, 1200];

let cafe = {
  coins: 200, level: 1, xp: 0,
  stoves: [{ state:'empty', recipe:null, startedAt:0, timerId:null }],
  selectedStoveIdx: null,
  _inited: false,
};

function cafeInit() {
  cafeRenderStoves();
  cafeUpdateHud();
  // tick every second
  setInterval(cafeTick, 1000);
}

function cafeTick() {
  let changed = false;
  const now = Date.now();
  cafe.stoves.forEach((stove, i) => {
    if (stove.state === 'cooking') {
      const rec = CAFE_RECIPES.find(r => r.id === stove.recipe);
      if (!rec) return;
      const elapsed = (now - stove.startedAt) / 1000;
      if (elapsed >= rec.time * 2) {
        stove.state = 'burnt';
        changed = true;
        cafeSetStatus(`💀 Fogão ${i+1}: ${rec.name} queimou! Clique para limpar.`);
      } else if (elapsed >= rec.time) {
        stove.state = 'ready';
        changed = true;
        cafeSetStatus(`✅ Fogão ${i+1}: ${rec.name} pronto! Clique para servir!`);
        toast(`✅ ${rec.name} pronto para servir!`);
      }
    }
  });
  if (changed) cafeRenderStoves();
  else cafeUpdateTimers();
}

function cafeUpdateTimers() {
  const now = Date.now();
  cafe.stoves.forEach((stove, i) => {
    if (stove.state !== 'cooking') return;
    const rec = CAFE_RECIPES.find(r => r.id === stove.recipe);
    if (!rec) return;
    const elapsed = (now - stove.startedAt) / 1000;
    const remaining = Math.max(0, rec.time - elapsed);
    const pct = Math.min(100, (elapsed / rec.time) * 100);
    const timerEl = document.getElementById(`cafe-timer-${i}`);
    const fillEl  = document.getElementById(`cafe-fill-${i}`);
    if (timerEl) timerEl.textContent = remaining > 0 ? cafeFmt(remaining) : 'Pronto!';
    if (fillEl)  fillEl.style.width = pct + '%';
  });
}

function cafeFmt(secs) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return m > 0 ? `${m}m${s < 10 ? '0' : ''}${s}s` : `${Math.floor(secs)}s`;
}

function cafeRenderStoves() {
  const container = document.getElementById('cafeStoves');
  if (!container) return;
  container.innerHTML = '';
  cafe.stoves.forEach((stove, i) => {
    const rec = stove.recipe ? CAFE_RECIPES.find(r => r.id === stove.recipe) : null;
    const div = document.createElement('div');
    div.className = 'cafe-stove ' + stove.state;
    div.onclick = () => cafeStoveClick(i);

    let icon = '🍳', name = 'Vazio — clique para cozinhar', timer = '', bar = '', badge = '';
    const now = Date.now();

    if (stove.state === 'empty') {
      icon = '🍳'; name = 'Vazio<br><span style="color:#aaa;font-size:9px">clique para cozinhar</span>';
    } else if (stove.state === 'cooking' && rec) {
      const elapsed = (now - stove.startedAt) / 1000;
      const remaining = Math.max(0, rec.time - elapsed);
      const pct = Math.min(100, (elapsed / rec.time) * 100);
      icon = rec.emoji;
      name = rec.name;
      timer = `<div class="stove-timer" id="cafe-timer-${i}">${cafeFmt(remaining)}</div>`;
      bar = `<div class="stove-bar"><div class="stove-fill" id="cafe-fill-${i}" style="width:${pct}%;background:#e67e22;"></div></div>`;
    } else if (stove.state === 'ready' && rec) {
      icon = rec.emoji;
      name = `<span style="color:#27ae60">${rec.name}</span>`;
      badge = `<div class="stove-badge">✓</div>`;
      timer = `<div class="stove-timer" style="color:#27ae60;font-size:11px">+💰${rec.sell}</div>`;
      bar = `<div class="stove-bar"><div class="stove-fill" style="width:100%;background:#27ae60;"></div></div>`;
    } else if (stove.state === 'burnt' && rec) {
      icon = '💀';
      name = `<span style="color:#888">${rec.name} queimou</span>`;
      badge = `<div class="stove-badge" style="background:#555">✗</div>`;
    }

    div.innerHTML = badge
      + '<div class="stove-icon">' + icon + '</div>'
      + '<div class="stove-name">' + name + '</div>'
      + timer + bar;
    container.appendChild(div);
  });

  // Add stove buy button hint
  if (cafe.stoves.length < 6) {
    const hint = document.createElement('div');
    hint.style.cssText = 'width:110px;height:100px;border:3px dashed #ccc;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#ccc;cursor:pointer;';
    hint.title = 'Comprar fogão';
    hint.textContent = '+';
    hint.onclick = cafeBuyStove;
    container.appendChild(hint);
  }
}

function cafeStoveClick(i) {
  const stove = cafe.stoves[i];
  if (stove.state === 'ready') {
    // Serve
    const rec = CAFE_RECIPES.find(r => r.id === stove.recipe);
    if (rec) {
      cafe.coins += rec.sell;
      cafe.xp += rec.xp;
      cafeSetStatus(`🎉 Servido! +💰${rec.sell} moedas, +${rec.xp} XP`);
      cafeLevelCheck();
    }
    stove.state = 'empty'; stove.recipe = null;
    cafeUpdateHud(); cafeRenderStoves();
    return;
  }
  if (stove.state === 'burnt') {
    stove.state = 'empty'; stove.recipe = null;
    cafeSetStatus('🧹 Fogão limpo.');
    cafeRenderStoves();
    return;
  }
  if (stove.state === 'cooking') {
    cafeSetStatus('⏳ Aguarde o preparo terminar!');
    return;
  }
  // empty — open recipe modal
  cafe.selectedStoveIdx = i;
  cafeOpenRecipe();
}

function cafeOpenRecipe() {
  const modal = document.getElementById('cafeRecipeModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const list = document.getElementById('cafeRecipeList');
  list.innerHTML = '';
  CAFE_RECIPES.forEach(rec => {
    const locked = rec.lvl > cafe.level;
    const noCoins = cafe.coins < rec.cost;
    const div = document.createElement('div');
    div.className = 'cafe-recipe-item' + (locked ? ' locked' : '');
    div.innerHTML = `
      <span style="font-size:32px">${rec.emoji}</span>
      <div style="flex:1">
        <div style="font-weight:bold;font-size:13px;color:#8B2500">${rec.name}</div>
        <div style="font-size:11px;color:#888">⏱ ${cafeFmt(rec.time)} · Custo: 💰${rec.cost} · Venda: 💰${rec.sell} · +${rec.xp}XP</div>
        ${locked ? `<div style="font-size:10px;color:#e9007e">🔒 Nível ${rec.lvl} necessário</div>` : ''}
        ${!locked && noCoins ? `<div style="font-size:10px;color:#e74c3c">Sem moedas suficientes</div>` : ''}
      </div>
      <button style="background:${locked||noCoins?'#ccc':'#c0392b'};color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:${locked||noCoins?'not-allowed':'pointer'};"
        ${locked||noCoins?'disabled':''} onclick="cafeCook('${rec.id}')">
        ${locked?'🔒':'Cozinhar'}
      </button>`;
    list.appendChild(div);
  });
}

function cafeCook(recipeId) {
  const i = cafe.selectedStoveIdx;
  if (i === null) return;
  const rec = CAFE_RECIPES.find(r => r.id === recipeId);
  if (!rec || cafe.coins < rec.cost) return;
  cafe.coins -= rec.cost;
  cafe.stoves[i].state = 'cooking';
  cafe.stoves[i].recipe = recipeId;
  cafe.stoves[i].startedAt = Date.now();
  cafeCloseRecipe();
  cafeUpdateHud();
  cafeRenderStoves();
  cafeSetStatus(`🍳 ${rec.name} no fogo! Pronto em ${cafeFmt(rec.time)}.`);
}

function cafeCloseRecipe() {
  const modal = document.getElementById('cafeRecipeModal');
  if (modal) modal.style.display = 'none';
}

function cafeBuyStove() {
  const priceEl = document.getElementById('cafeStovePrice');
  const idx = cafe.stoves.length - 1;
  const price = CAFE_STOVE_PRICES[Math.min(idx, CAFE_STOVE_PRICES.length - 1)];
  if (cafe.stoves.length >= 6) { cafeSetStatus('Máximo de fogões atingido!'); return; }
  if (cafe.coins < price) { cafeSetStatus(`Sem moedas! Precisa de 💰${price}.`); return; }
  cafe.coins -= price;
  cafe.stoves.push({ state:'empty', recipe:null, startedAt:0 });
  const nextPrice = CAFE_STOVE_PRICES[Math.min(cafe.stoves.length - 1, CAFE_STOVE_PRICES.length - 1)];
  if (priceEl) priceEl.textContent = nextPrice;
  cafeUpdateHud(); cafeRenderStoves();
  toast('🍳 Novo fogão comprado!');
}

function cafeLevelCheck() {
  const needed = CAFE_XP_LEVEL(cafe.level);
  while (cafe.xp >= needed) {
    cafe.xp -= needed;
    cafe.level++;
    toast(`🎊 Café Mania: Nível ${cafe.level}!`);
  }
  cafeUpdateHud();
}

function cafeUpdateHud() {
  const s = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  s('cafeCoins', cafe.coins);
  s('cafeLevel', cafe.level);
  s('cafeXp', cafe.xp);
  s('cafeXpNext', CAFE_XP_LEVEL(cafe.level));
  const idx = Math.min(cafe.stoves.length - 1, CAFE_STOVE_PRICES.length - 1);
  s('cafeStovePrice', CAFE_STOVE_PRICES[idx]);
}

function cafeSetStatus(msg) {
  const el = document.getElementById('cafeStatus');
  if (el) el.textContent = msg;
}




// ── TÍTULOS & ESTILOS DE PERFIL ──
const FARM_TITLES = [
  { id:'admin',      label:'⭐ ADM ⭐',       css:'title-admin',      desc:'Exclusivo de administradores',    adminOnly:true },
  { id:'lenda',      label:'🏆 Lenda',        css:'title-lenda',      desc:'Top vendedor do leilão',          shop:true, price:5000 },
  { id:'mestre',     label:'💎 Mestre',       css:'title-mestre',     desc:'Nível 20+ na fazenda',            lvlReq:20 },
  { id:'fazendeiro', label:'🌾 Fazendeiro',   css:'title-fazendeiro', desc:'Primeiro título desbloqueado',    default:true },
  { id:'novato',     label:'🌱 Novato',       css:'title-novato',     desc:'Começando a jornada',             default:true },
];
const FARM_FONTS = [
  { id:'normal',   label:'Normal',       css:'',             desc:'Padrão' },
  { id:'cursive',  label:'Cursivo ✒️',   css:'font-cursive', desc:'Estilo elegante', shop:true, price:1000 },
  { id:'bold',     label:'Negrito 🔥',   css:'font-bold',    desc:'Destaque máximo',  shop:true, price:1000 },
  { id:'pixel',    label:'Pixel 👾',     css:'font-pixel',   desc:'Estilo retrô',     shop:true, price:1000 },
];

function farmGetTitleBadge(nick){
  if(farmIsAdmin()) return '<span class="title-badge title-admin">⭐ ADM ⭐</span>';
  if(!farm.title) return '';
  const t=FARM_TITLES.find(x=>x.id===farm.title);
  if(!t) return '';
  return `<span class="title-badge ${t.css}">${t.label}</span>`;
}

function farmOpenTitleShop(){
  const modal=document.getElementById('farmTitleModal');
  if(!modal) return;
  const list=document.getElementById('fTitleList');
  list.innerHTML='';
  FARM_TITLES.filter(t=>!t.adminOnly).forEach(t=>{
    const owned=farm.title===t.id||t.default;
    const locked=t.lvlReq&&farm.level<t.lvlReq;
    const d=document.createElement('div');
    d.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;border:2px solid #eee;border-radius:8px;margin-bottom:6px;background:#fafafa;';
    d.innerHTML=`
      <span class="title-badge ${t.css}" style="font-size:12px;">${t.label}</span>
      <div style="flex:1"><div style="font-size:11px;color:#555">${t.desc}</div>${locked?`<div style="font-size:10px;color:#e9007e">🔒 Nível ${t.lvlReq}</div>`:''}</div>
      ${farm.title===t.id?'<span style="color:#27ae60;font-size:12px;font-weight:bold;">✓ Ativo</span>':
        t.default?`<button onclick="farmEquipTitle('${t.id}')" style="background:#27ae60;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;">Usar</button>`:
        locked?`<button disabled style="background:#ccc;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;">🔒</button>`:
        t.shop?`<button onclick="farmBuyTitle('${t.id}')" style="background:#e9007e;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;">💰${t.price}</button>`:''}`;
    list.appendChild(d);
  });
  // Fonts
  const flist=document.getElementById('fFontList');
  flist.innerHTML='';
  FARM_FONTS.forEach(f=>{
    const active=farm.fontStyle===f.id;
    const d=document.createElement('div');
    d.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 8px;border:2px solid #eee;border-radius:8px;margin-bottom:4px;';
    d.innerHTML=`
      <span class="${f.css}" style="font-size:13px;font-weight:bold;color:#333;min-width:80px;">${f.label}</span>
      <span style="flex:1;font-size:10px;color:#888">${f.desc}</span>
      ${active?'<span style="color:#27ae60;font-size:12px;font-weight:bold;">✓</span>':
        f.shop?`<button onclick="farmBuyFont('${f.id}')" style="background:#8e44ad;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;">💰${f.price}</button>`:
        `<button onclick="farmEquipFont('${f.id}')" style="background:#3498db;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;">Usar</button>`}`;
    flist.appendChild(d);
  });
  modal.style.display='flex';
}
// ── INIT ──
(async()=>{
  // Desabilita botões até o Supabase estar pronto
  const loginBtn=document.querySelector('#loginPage .btn-p');
  const regBtn=document.querySelector('#registerPage .btn-p');
  if(loginBtn){loginBtn.disabled=true;loginBtn.textContent='carregando...';}
  if(regBtn){regBtn.disabled=true;regBtn.textContent='carregando...';}
  try{
    await initSupabase();
  } catch(e){
    if(loginBtn){loginBtn.textContent='erro ao conectar — recarregue';}
    console.error('initSupabase falhou:',e);
    return;
  }
  if(loginBtn){loginBtn.disabled=false;loginBtn.textContent='entrar';}
  if(regBtn){regBtn.disabled=false;regBtn.textContent='cadastrar';}
  await tryAutoLogin();
})();
function farmEquipTitle(id){ farm.title=id; farmOpenTitleShop(); toast('✅ Título equipado!'); farmSave(); }
function farmBuyTitle(id){
  const t=FARM_TITLES.find(x=>x.id===id);
  if(!t||!t.price) return;
  if(!farmIsAdmin()&&farm.coins<t.price){ toast('Sem moedas!'); return; }
  if(!farmIsAdmin()) farm.coins-=t.price;
  farm.title=id; farmUpdateHud(); farmOpenTitleShop();
  toast(`🏆 Título "${t.label}" desbloqueado!`);
  farmSave();
}
function farmEquipFont(id){ farm.fontStyle=id; farmOpenTitleShop(); toast('✅ Estilo equipado!'); farmSave(); }
function farmBuyFont(id){
  const f=FARM_FONTS.find(x=>x.id===id);
  if(!f||!f.price) return;
  if(!farmIsAdmin()&&farm.coins<f.price){ toast('Sem moedas!'); return; }
  if(!farmIsAdmin()) farm.coins-=f.price;
  farm.fontStyle=id; farmUpdateHud(); farmOpenTitleShop();
  toast(`✅ Estilo "${f.label}" desbloqueado!`);
  farmSave();
}

// ── ESTOQUE & VENDA & LEILÃO ──
if(!farm.stock) farm.stock={};
if(!farm.spinsLeft) farm.spinsLeft=10;
if(!farm.lastSpinDate) farm.lastSpinDate='';

function farmRenderStock(){
  const el=document.getElementById('farmStockPanel');
  if(!el) return;
  const entries=Object.entries(farm.stock||{}).filter(([,q])=>q>0);
  if(!entries.length){ el.innerHTML='<div style="color:#aaa;font-size:11px;padding:6px;text-align:center">Estoque vazio — colha suas plantações!</div>'; return; }
  el.innerHTML='';
  entries.forEach(([stockId,qty])=>{
    const isGold=stockId.endsWith('_gold');
    const cropId=isGold?stockId.replace('_gold',''):stockId;
    const crop=FARM_CROPS.find(c=>c.id===cropId); if(!crop) return;
    const rot=farmStockRot(stockId);
    const goldMult=isGold?10:1;
    const d=document.createElement('div');
    d.style.cssText=`display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;border:2px solid ${rot?'#e74c3c':isGold?'#f39c12':'#d5e8c4'};margin-bottom:4px;background:${isGold?'linear-gradient(135deg,#fffde7,#fff9c4)':'#fff'};`;
    d.innerHTML=`
      <span style="font-size:22px;${isGold?'filter:drop-shadow(0 0 4px #f39c12)':''}">${crop.emoji}${isGold?'✨':''}</span>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:bold;color:${isGold?'#b7770d':'#2d5a2d'}">${isGold?'✨ ':''} ${crop.name}${isGold?' Dourad@':''} ×${qty}</div>
        ${rot?'<div style="font-size:10px;color:#e74c3c">⚠️ Apodrecendo!</div>':`<div style="font-size:10px;color:#888">Base: 💰${crop.reward*goldMult} cada${isGold?' (10×!)':''}</div>`}
      </div>
      <button onclick="farmOpenSell('${stockId}')" style="background:#3498db;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:bold;cursor:pointer;">💰 Vender</button>
      <button onclick="farmOpenAuction('${stockId}')" style="background:linear-gradient(135deg,#f39c12,#e67e22);color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:bold;cursor:pointer;">🔨 Leilão</button>`;
    el.appendChild(d);
  });
}

// Apodrecimento: itens ficam 10min no estoque antes de apodrecer
if(!farm.harvestTimes) farm.harvestTimes={};
function farmStockRot(id){
  const t=farm.harvestTimes[id]||0;
  return t && (Date.now()-t)>600000;
}

// ── VENDA DIRETA ──
let _sellCropId=null;
function farmOpenSell(id){
  _sellCropId=id;
  const isGold=id.endsWith('_gold');
  const cropId=isGold?id.replace('_gold',''):id;
  const crop=FARM_CROPS.find(c=>c.id===cropId);
  const goldMult=isGold?10:1;
  const qty=farm.stock[id]||0;
  const modal=document.getElementById('farmSellModal');
  if(!modal) return;
  document.getElementById('fSellTitle').textContent=`Vender ${crop.emoji} ${crop.name} (×${qty})`;
  document.getElementById('fSellBase').textContent=crop.reward*goldMult;
  document.getElementById('fSellQty').max=qty; document.getElementById('fSellQty').value=qty;
  document.getElementById('fSellTotal').textContent=crop.reward*goldMult*qty;
  document.getElementById('fSellQty').oninput=()=>{
    const q=parseInt(document.getElementById('fSellQty').value)||0;
    document.getElementById('fSellTotal').textContent=crop.reward*goldMult*q;
  };
  modal.style.display='flex';
}
function farmCloseSell(){ document.getElementById('farmSellModal').style.display='none'; }
function farmConfirmSell(){
  const isGold=_sellCropId.endsWith('_gold');
  const cropId=isGold?_sellCropId.replace('_gold',''):_sellCropId;
  const crop=FARM_CROPS.find(c=>c.id===cropId); if(!crop) return;
  const goldMult=isGold?10:1;
  const qty=parseInt(document.getElementById('fSellQty').value)||0;
  if(qty<=0||qty>(farm.stock[_sellCropId]||0)){ farmSetStatus('Quantidade inválida.'); return; }
  const earned=crop.reward*goldMult*qty;
  farm.stock[_sellCropId]-=qty;
  if(!farmIsAdmin()) farm.coins+=earned;
  farmUpdateHud(); farmRenderStock(); farmCloseSell();
  toast(`💰 Vendido! +${earned} moedas`);
  farmSetStatus(`💰 Vendeu ${qty}x ${crop.name} por 💰${earned}`);
  farmSave();
}

// ── LEILÃO ──
let _auctionCropId=null, _auctionActive=false, _auctionOffers=[], _auctionTimer=null, _auctionSecsLeft=0;
function farmOpenAuction(id){
  _auctionCropId=id; _auctionActive=false; _auctionOffers=[];
  const isGold=id.endsWith('_gold');
  const cropId=isGold?id.replace('_gold',''):id;
  const crop=FARM_CROPS.find(c=>c.id===cropId);
  const goldMult=isGold?10:1;
  const qty=farm.stock[id]||0;
  const modal=document.getElementById('farmAuctionModal');
  if(!modal) return;
  document.getElementById('fAucName').textContent=`${crop.emoji} ${crop.name} ×${qty}`;
  document.getElementById('fAucOffers').innerHTML='<div style="color:#aaa;font-size:12px;text-align:center;padding:10px;">Clique em Iniciar para começar o leilão!</div>';
  document.getElementById('fAucStatus').textContent='';
  document.getElementById('fAucTimer').textContent='';
  document.getElementById('fAucStartBtn').style.display='';
  document.getElementById('fAucAcceptBtn').style.display='none';
  document.getElementById('fAucRejectBtn').style.display='none';
  modal.style.display='flex';
}
function farmCloseAuction(){
  clearInterval(_auctionTimer);
  document.getElementById('farmAuctionModal').style.display='none';
}
function farmStartAuction(){
  const crop=FARM_CROPS.find(c=>c.id===_auctionCropId);
  const qty=farm.stock[_auctionCropId]||0;
  if(!qty){ farmSetStatus('Sem estoque!'); return; }
  _auctionActive=true; _auctionOffers=[]; _auctionSecsLeft=30;
  document.getElementById('fAucStartBtn').style.display='none';
  document.getElementById('fAucStatus').textContent='🔨 Leilão em andamento...';
  const offerEl=document.getElementById('fAucOffers');
  offerEl.innerHTML='';
  clearInterval(_auctionTimer);

  const BUYER_NAMES2=['João','Maria','Pedro','Ana','Carlos','Luísa','Bruno','Clara','Thiago','Fernanda','Ricardo','Beatriz'];
  // Gera ofertas aleatórias ao longo do tempo
  const totalOffers=3+Math.floor(Math.random()*6)+farm.luckBoost*2;
  let offersMade=0;
  const luckMult=1+farm.luckBoost*0.3;

  _auctionTimer=setInterval(()=>{
    _auctionSecsLeft--;
    document.getElementById('fAucTimer').textContent=`⏱ ${_auctionSecsLeft}s`;
    // Gera oferta aleatória
    if(offersMade<totalOffers && Math.random()<0.35){
      const buyer=BUYER_NAMES2[Math.floor(Math.random()*BUYER_NAMES2.length)];
      // Ofertas variam MUITO: de 1 até 200.000 por unidade
      // Produtos baratos (trigo) tendem a receber menos, caros recebem mais
      const basePrice=crop.reward*(isGold?10:1);
      let roll=Math.random();
      let priceEach;
      if(roll<0.55) priceEach=Math.floor(basePrice*(0.1+Math.random()*1.5)*luckMult); // oferta ruim
      else if(roll<0.85) priceEach=Math.floor(basePrice*(1.5+Math.random()*5)*luckMult); // boa
      else if(roll<0.97) priceEach=Math.floor(basePrice*(5+Math.random()*20)*luckMult); // ótima
      else priceEach=Math.floor(1000+Math.random()*199000*luckMult); // jackpot raro!
      priceEach=Math.max(1,priceEach);
      const total=priceEach*qty;
      const offer={buyer,priceEach,total,qty,id:Date.now()+offersMade};
      _auctionOffers.push(offer);
      offersMade++;
      const div=document.createElement('div');
      div.id='aucOffer'+offer.id;
      const isJackpot=priceEach>5000;
      div.style.cssText=`display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:${isJackpot?'linear-gradient(135deg,#fff9c4,#ffe082)':'#f8f8f8'};border:2px solid ${isJackpot?'#f39c12':'#eee'};margin-bottom:4px;animation:popIn .3s ease;`;
      div.innerHTML=`<span style="font-size:16px">${isJackpot?'🤑':'👤'}</span>
        <div style="flex:1"><div style="font-size:12px;font-weight:bold;color:#333">${buyer}</div>
        <div style="font-size:11px;color:#555">💰 ${priceEach.toLocaleString()} cada · Total: 💰${total.toLocaleString()}</div>
        ${isJackpot?'<div style="font-size:10px;color:#e67e22;font-weight:bold;">🔥 OFERTA JACKPOT!</div>':''}</div>
        <button onclick="farmAcceptAuctionOffer(${offer.id})" style="background:#27ae60;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:bold;cursor:pointer;">✓ Aceitar</button>`;
      offerEl.appendChild(div);
      offerEl.scrollTop=offerEl.scrollHeight;
    }

    if(_auctionSecsLeft<=0){
      clearInterval(_auctionTimer);
      _auctionActive=false;
      if(_auctionOffers.length===0){
        document.getElementById('fAucStatus').textContent='😞 Nenhuma oferta. Estoque permanece.';
        document.getElementById('fAucTimer').textContent='';
        document.getElementById('fAucStartBtn').style.display='';
        document.getElementById('fAucStartBtn').textContent='🔄 Tentar novamente';
      } else {
        document.getElementById('fAucStatus').textContent='⏰ Tempo esgotado! Aceite uma oferta ou feche.';
        document.getElementById('fAucTimer').textContent='';
      }
    }
  },1000);
}
function farmAcceptAuctionOffer(offerId){
  const offer=_auctionOffers.find(o=>o.id===offerId); if(!offer) return;
  clearInterval(_auctionTimer);
  const qty=Math.min(offer.qty, farm.stock[_auctionCropId]||0);
  if(qty<=0){ farmSetStatus('Sem estoque!'); return; }
  const earned=offer.priceEach*qty;
  farm.stock[_auctionCropId]-=qty;
  if(!farmIsAdmin()) farm.coins+=earned;
  farmUpdateHud(); farmRenderStock(); farmCloseAuction();
  toast(`🔨 Leilão! +💰${earned.toLocaleString()} de ${offer.buyer}!`);
  farmSetStatus(`🔨 ${offer.buyer} comprou ${qty}x por 💰${earned.toLocaleString()}!`);
  farmSave();
}

// ── ROLETA ──
const ROLETA_SYMBOLS=['🌽','🌾','🍅','🥕','🍎','🍇','🍓','🎃','⭐','💎','🃏'];
// Combinações e prêmios
const ROLETA_COMBOS=[
  { s:['🃏','🃏','🃏'], prize:'invasion',  label:'🎰 JACKPOT! 3 CORINGAS — Invada uma fazenda!',  chance:0.001 },
  { s:['💎','💎','💎'], prize:'coins',     val:50000, label:'💎 TRIPLE DIAMANTE! +💰50.000!',       chance:0.002 },
  { s:['⭐','⭐','⭐'], prize:'xp',        val:5000,  label:'⭐ TRIPLE ESTRELA! +5000 XP!',          chance:0.005 },
  { s:['🍎','🍎','🍎'], prize:'stock',    crop:'apple', qty:5, label:'🍎 3 Maçãs! +5 no estoque!',  chance:0.01  },
  { s:['🍇','🍇','🍇'], prize:'stock',    crop:'grape', qty:8, label:'🍇 3 Uvas! +8 no estoque!',   chance:0.015 },
  { s:['🍓','🍓','🍓'], prize:'stock',    crop:'straw', qty:8, label:'🍓 3 Morangos! +8 estoque!',  chance:0.015 },
  { s:['🎃','🎃','🎃'], prize:'stock',    crop:'pump',  qty:5, label:'🎃 3 Abóboras! +5 estoque!',  chance:0.02  },
  { s:['🍅','🍅','🍅'], prize:'stock',    crop:'tomato',qty:10,label:'🍅 3 Tomates! +10 estoque!',  chance:0.03  },
  { s:['🥕','🥕','🥕'], prize:'stock',    crop:'carrot',qty:10,label:'🥕 3 Cenouras! +10 estoque!', chance:0.03  },
  { s:['🌽','🌽','🌽'], prize:'coins',    val:500,   label:'🌽 3 Milhos! +💰500!',                  chance:0.05  },
  { s:['🌾','🌾','🌾'], prize:'coins',    val:200,   label:'🌾 3 Trigos! +💰200!',                  chance:0.07  },
  // Pares dourados
  { s:['💎','💎',null], prize:'coins',    val:5000,  label:'💎💎 Par de Diamantes! +💰5.000!',       chance:0.01  },
  { s:['⭐','⭐',null], prize:'xp',       val:1000,  label:'⭐⭐ Par de Estrelas! +1000 XP!',         chance:0.02  },
];

function farmCheckSpinReset(){
  if(farmIsAdmin()){ farm.spinsLeft=9999; return; }
  const today=new Date().toDateString();
  if(farm.lastSpinDate!==today){ farm.spinsLeft=10; farm.lastSpinDate=today; }
}
function farmOpenRoleta(){
  farmCheckSpinReset();
  const modal=document.getElementById('farmRoletaModal');
  if(!modal) return;
  document.getElementById('fRolSpins').textContent=farm.spinsLeft;
  document.getElementById('fRolResult').innerHTML='';
  farmResetReels();
  farmRenderComboTable();
  modal.style.display='flex';
}
function farmCloseRoleta(){ document.getElementById('farmRoletaModal').style.display='none'; }
function farmResetReels(){
  ['fRol1','fRol2','fRol3'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.textContent=ROLETA_SYMBOLS[Math.floor(Math.random()*ROLETA_SYMBOLS.length)];
  });
}
function farmRenderComboTable(){
  const el=document.getElementById('fRolCombos');
  if(!el) return;
  el.innerHTML=ROLETA_COMBOS.slice(0,8).map(c=>
    `<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#ccc;padding:2px 0;">
      <span>${c.s[0]}${c.s[1]}${c.s[2]||'?'}</span>
      <span style="color:#ffe066;flex:1;text-align:right">${c.label.split('!')[0].replace(/.*—\s*/,'').replace(/.*\+/,'+')}</span>
    </div>`
  ).join('');
}
function farmSpin(paid=false){
  farmCheckSpinReset();
  if(!paid && !farmIsAdmin() && farm.spinsLeft<=0){ toast('Sem giros! Compre mais ou volte amanhã.'); return; }
  if(!paid && !farmIsAdmin()) farm.spinsLeft--;
  document.getElementById('fRolSpins').textContent=farm.spinsLeft;
  document.getElementById('fRolResult').innerHTML='<span style="color:#ffe066">🎰 Girando...</span>';
  const ids=['fRol1','fRol2','fRol3'];
  let ticks=0;
  const anim=setInterval(()=>{
    ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=ROLETA_SYMBOLS[Math.floor(Math.random()*ROLETA_SYMBOLS.length)]; });
    ticks++;
    if(ticks>25){
      clearInterval(anim);
      // Determina resultado
      let result=null;
      const roll=Math.random();
      let acc=0;
      for(const combo of ROLETA_COMBOS){
        acc+=combo.chance;
        if(roll<acc){ result=combo; break; }
      }
      let s1,s2,s3;
      if(result){
        s1=result.s[0]; s2=result.s[1]; s3=result.s[2]||ROLETA_SYMBOLS[Math.floor(Math.random()*9)];
        // Garante que s3 não fecha triple se combo é par
        if(result.s[2]===null){ while(s3===s1) s3=ROLETA_SYMBOLS[Math.floor(Math.random()*9)]; }
      } else {
        // Sem prêmio — símbolos aleatórios sem combinar
        s1=ROLETA_SYMBOLS[Math.floor(Math.random()*9)];
        do{ s2=ROLETA_SYMBOLS[Math.floor(Math.random()*9)]; }while(s2===s1);
        do{ s3=ROLETA_SYMBOLS[Math.floor(Math.random()*9)]; }while(s3===s1||s3===s2);
      }
      document.getElementById('fRol1').textContent=s1;
      document.getElementById('fRol2').textContent=s2;
      document.getElementById('fRol3').textContent=s3;
      if(result){
        document.getElementById('fRolResult').innerHTML=`<span style="color:#ffe066;font-weight:bold;font-size:12px;animation:popIn .3s ease">${result.label}</span>`;
        farmApplyRoletaPrize(result);
      } else {
        const msgs=['😅 Quase!','😤 Tente de novo!','🍀 A sorte virá!','😂 Essa não...','💨 Passou!'];
        document.getElementById('fRolResult').textContent=msgs[Math.floor(Math.random()*msgs.length)];
      }
    }
  },55);
}
function farmApplyRoletaPrize(combo){
  if(combo.prize==='coins'){ if(!farmIsAdmin()) farm.coins+=combo.val; farmUpdateHud(); toast(`💰 +${combo.val} moedas!`); }
  else if(combo.prize==='xp'){ farm.xp+=combo.val; farmLevelCheck(); farmUpdateHud(); toast(`⭐ +${combo.val} XP!`); }
  else if(combo.prize==='stock'){
    farm.stock=farm.stock||{};
    farm.stock[combo.crop]=(farm.stock[combo.crop]||0)+combo.qty;
    farmRenderStock();
    toast(`${combo.s[0]} +${combo.qty} ${combo.crop} no estoque!`);
  }
  else if(combo.prize==='invasion'){
    setTimeout(()=>{ farmActivateInvasion(); },800);
  }
}
function farmBuySpins(){
  if(!farmIsAdmin()){ toast('❌ Compras disponíveis apenas para ADMs'); return; }
  farm.spinsLeft+=10;
  document.getElementById('fRolSpins').textContent=farm.spinsLeft;
  toast('🎰 +10 giros!');
}
function farmActivateInvasion(){
  toast('🎉 3 CORINGAS! Você pode invadir a fazenda de um vizinho!');
  farmSetStatus('🃏 Invasão disponível! (lista de vizinhos em breve)');
}
// ── SISTEMA DE OFERTAS DE FAZENDEIROS ──
const BUYER_NAMES = ['João','Maria','Pedro','Ana','Carlos','Luísa','Marcos','Clara','Bruno','Fernanda'];
const OFFER_CROPS = ['wheat','corn','tomato','carrot','grape','straw','pump','apple'];

function farmGenerateOffer(){
  const crop = FARM_CROPS.find(c=>c.id===OFFER_CROPS[Math.floor(Math.random()*OFFER_CROPS.length)]);
  if(!crop) return;
  // luck boosts quantity and price multiplier
  const luckMult = 1 + farm.luckBoost * 0.25;
  const qty = Math.floor((3 + Math.random()*12 + farm.luckBoost*3) * luckMult);
  const priceMult = (1.3 + Math.random()*0.8 + farm.luckBoost*0.15) * luckMult;
  const priceEach = Math.floor(crop.reward * priceMult);
  const buyer = BUYER_NAMES[Math.floor(Math.random()*BUYER_NAMES.length)];
  const offer = { id: Date.now(), buyer, crop: crop.id, qty, priceEach, expires: Date.now()+90000 };
  farm.offers.push(offer);
  if(farm.offers.length > 3) farm.offers.shift();
  farmRenderOffers();
  toast(`📢 ${buyer} quer comprar ${qty}x ${crop.emoji}${crop.name} por 💰${priceEach} cada!`);
}

function farmRenderOffers(){
  const el = document.getElementById('farmOffersPanel');
  if(!el) return;
  if(farm.offers.length === 0){ el.innerHTML='<div style="color:#aaa;font-size:11px;text-align:center;padding:8px;">Aguardando ofertas...</div>'; return; }
  el.innerHTML = '';
  const now = Date.now();
  farm.offers.forEach(offer=>{
    const crop = FARM_CROPS.find(c=>c.id===offer.crop);
    if(!crop) return;
    const secsLeft = Math.max(0, Math.floor((offer.expires - now)/1000));
    const total = offer.qty * offer.priceEach;
    // Count how many ready cells have this crop
    const readyQty = farm.cells.filter(c=>c.state==='ready'&&c.crop===offer.crop).length;
    const canSell = readyQty > 0;
    const div = document.createElement('div');
    div.style.cssText = 'background:#fff;border:2px solid '+(canSell?'#27ae60':'#ddd')+';border-radius:8px;padding:6px 8px;margin-bottom:6px;';
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:20px">${crop.emoji}</span>
        <div style="flex:1">
          <div style="font-size:11px;font-weight:bold;color:#2d5a2d">👤 ${offer.buyer} quer ${offer.qty}x ${crop.name}</div>
          <div style="font-size:10px;color:#555">💰 ${offer.priceEach} cada · Total: 💰${total}</div>
          <div style="font-size:10px;color:#e67e22">⏱ ${secsLeft}s · Prontos: ${readyQty}</div>
        </div>
        <button onclick="farmAcceptOffer(${offer.id})"
          style="background:${canSell?'#27ae60':'#ccc'};color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:bold;cursor:${canSell?'pointer':'not-allowed'};"
          ${canSell?'':'disabled'}>
          ${canSell?'Vender':'Sem estoque'}
        </button>
      </div>`;
    el.appendChild(div);
  });
  // Remove expired
  farm.offers = farm.offers.filter(o=>o.expires > now);
}

function farmAcceptOffer(offerId){
  const offer = farm.offers.find(o=>o.id===offerId);
  if(!offer) return;
  const crop = FARM_CROPS.find(c=>c.id===offer.crop);
  if(!crop) return;
  // Collect ready cells of this crop
  let sold = 0;
  farm.cells.forEach(cell=>{
    if(sold >= offer.qty) return;
    if(cell.state==='ready' && cell.crop===offer.crop){
      cell.state='empty'; cell.crop=null; cell.waterCount=0;
      sold++;
    }
  });
  if(sold === 0){ farmSetStatus('Sem colheita pronta para vender!'); return; }
  const earned = sold * offer.priceEach;
  const xpGain = sold * crop.xp;
  if(!farmIsAdmin()) farm.coins += earned;
  farm.xp += farmIsAdmin() ? 0 : xpGain;
  farm.offers = farm.offers.filter(o=>o.id!==offerId);
  farmLevelCheck();
  farmUpdateHud();
  farmRenderGrid();
  farmRenderOffers();
  farmSetStatus(`🤝 Vendeu ${sold}x ${crop.name} para ${offer.buyer}! +💰${earned}`);
  toast(`💰 +${earned} moedas!`);
}

// ── EXPANSÃO DE PLANTAÇÃO ──
function farmExpandField(){
  const cost = 2500 + farm.expansions * 2500;
  if(!farmIsAdmin() && farm.coins < cost){ toast(`❌ Precisa de 💰${cost}`); return; }
  if(farm.expansions >= 4){ toast('Expansão máxima atingida!'); return; }
  if(!farmIsAdmin()) farm.coins -= cost;
  farm.expansions++;
  // Add a row
  FARM_ROWS++;
  const newCells = Array.from({length:FARM_COLS}, ()=>({state:'empty',crop:null,plantedAt:0,waterCount:0,readyAt:0}));
  farm.cells.push(...newCells);
  // Update grid CSS
  const grid = document.getElementById('farmGrid');
  if(grid) grid.style.gridTemplateRows = `repeat(${FARM_ROWS},52px)`;
  farmUpdateHud();
  farmRenderGrid();
  toast(`🌱 Plantação expandida! Agora ${FARM_ROWS}x${FARM_COLS} canteiros.`);
  farmSetStatus(`✅ Expansão ${farm.expansions}/4 concluída!`);
  // Update button
  const btn = document.getElementById('farmExpandBtn');
  if(btn){
    const nextCost = 2500 + farm.expansions*2500;
    btn.textContent = farm.expansions>=4 ? '🌿 Máximo' : `🌿 Expandir (💰${nextCost})`;
    if(farm.expansions>=4) btn.disabled=true;
  }
}

// ── LOJA DE SORTE (pagamento simbólico) ──
function farmOpenLuckShop(){
  const modal = document.getElementById('farmLuckModal');
  if(modal) modal.style.display='flex';
  // Disable purchase buttons for non-admins
  const isAdm = farmIsAdmin();
  [1,2,3].forEach(n=>{
    const btn = document.getElementById('luckBtn'+n);
    if(btn){
      btn.disabled = !isAdm;
      btn.textContent = isAdm ? 'Ativar' : '🔒 Indisponível';
      btn.style.background = isAdm ? (n===3?'linear-gradient(135deg,#f39c12,#e67e22)':'#27ae60') : '#bbb';
      btn.style.cursor = isAdm ? 'pointer' : 'not-allowed';
    }
  });
  const note = document.getElementById('luckShopNote');
  if(note) note.textContent = isAdm ? '✅ Acesso ADM — ativar gratuitamente' : '🔒 Disponível apenas para ADMs';
}
function farmCloseLuckShop(){
  const modal = document.getElementById('farmLuckModal');
  if(modal) modal.style.display='none';
}
function farmBuyLuck(level, priceLabel){
  if(!farmIsAdmin()){ toast('❌ Compras disponíveis apenas para ADMs'); return; }
  if(farm.luckBoost >= level){ toast('Você já tem esse nível de sorte!'); return; }
  farm.luckBoost = level;
  farmUpdateHud();
  farmCloseLuckShop();
  toast(`🍀 Sorte nível ${level} ativada!`);
  farmSetStatus(`🍀 Sorte ${level}/3 ativa — ofertas com preços ${25*level}% maiores!`);
  farmSave();
}

// Cache de admins para exibição de badges nos posts
let adminUsersCache = {}; // nick -> {is_admin, font_style, farm_title}
async function loadAdminCache(){
  const {data} = await sb.from('users').select('nick,is_admin,font_style,farm_title').eq('is_admin', true);
  adminUsersCache = {};
  (data||[]).forEach(u => { adminUsersCache[u.nick] = u; });
  // Also add hardcoded admin
  if(!adminUsersCache['apexzinn']){
    const {data:kd} = await sb.from('users').select('nick,is_admin,font_style,farm_title').eq('nick','apexzinn').maybeSingle();
    if(kd) adminUsersCache['apexzinn'] = kd;
  }
}

// ═══════════════════════════════════════════════════════════════
// ── CHAMADA DE VOZ — WebRTC com sinalização via Supabase       ──
// ── Fluxo correto:                                             ──
//   1. Caller → ring                                           ──
//   2. Caller → getUserMedia + createOffer + setLocal + offer  ──
//   3. Callee → getUserMedia + setRemote + createAnswer +       ──
//               setLocal + answer                              ──
//   4. Caller → setRemote(answer)                              ──
//   5. ICE candidates trocados bidirecionalmente               ──
// ═══════════════════════════════════════════════════════════════

let VC = {
  peer:null, stream:null, role:null, partner:null,
  muted:false, camOff:false, timerInt:null, secs:0,
  iceBuf:[], sigChannel:null, processedIds:new Set(),
  pendingOffer:null, isVideo:false,
  peers:{}, streams:{}, // grupo: nick→peer/stream
  groupChannel:null, groupRoom:null,
};

// ── TURN credentials Metered.ca ──
const TURN_CONFIG = {
  host:       'global.relay.metered.ca',
  username:   'b5e5e162fd015f761b67cea9',
  credential: '6JY3yCRIDY8h0l3K',
};

const VC_ICE = {
  iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun.relay.metered.ca:80'},
    {urls:'turn:global.relay.metered.ca:80',             username:'b5e5e162fd015f761b67cea9', credential:'6JY3yCRIDY8h0l3K'},
    {urls:'turn:global.relay.metered.ca:80?transport=tcp',username:'b5e5e162fd015f761b67cea9', credential:'6JY3yCRIDY8h0l3K'},
    {urls:'turn:global.relay.metered.ca:443',            username:'b5e5e162fd015f761b67cea9', credential:'6JY3yCRIDY8h0l3K'},
    {urls:'turns:global.relay.metered.ca:443?transport=tcp',username:'b5e5e162fd015f761b67cea9',credential:'6JY3yCRIDY8h0l3K'},
  ],
  iceTransportPolicy:'all',
  bundlePolicy:'max-bundle',
  rtcpMuxPolicy:'require',
  iceCandidatePoolSize:10,
};

const VC_AUDIO_CONSTRAINTS = {
  audio:{
    echoCancellation:true,
    noiseSuppression:true,
    autoGainControl:true,
    channelCount:1,
    sampleRate:48000,
    sampleSize:16
  },
  video:false
};

// Aguarda todos os candidatos ICE (STUN+TURN) antes de enviar offer/answer
function vcWaitIceGathering(peer, maxMs=8000){
  return new Promise(resolve=>{
    if(peer.iceGatheringState==='complete'){resolve();return;}
    let done=false;
    const finish=()=>{if(!done){done=true;resolve();}};
    peer.onicegatheringstatechange=()=>{
      if(peer.iceGatheringState==='complete') finish();
    };
    setTimeout(finish, maxMs);
  });
}

// Ajusta bitrate depois que ICE conecta
function vcSetBitrate(peer){
  try{
    peer.getSenders().forEach(sender=>{
      if(!sender.track) return;
      const params=sender.getParameters();
      if(!params.encodings||!params.encodings.length) params.encodings=[{}];
      if(sender.track.kind==='audio') params.encodings[0].maxBitrate=40000;
      else if(sender.track.kind==='video') params.encodings[0].maxBitrate=600000;
      sender.setParameters(params).catch(()=>{});
    });
  }catch(e){}
}

// ── Inserir sinal no banco ──
async function vcInsertSignal(type, payload=''){
  if(!me||!VC.partner) return;
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try{
    await sb.from('call_signals').insert({
      from_nick: me.nick,
      to_nick:   VC.partner,
      type,
      payload:   body,
      created_at: new Date().toISOString()
    });
  }catch(e){console.warn('vcInsertSignal error',e);}
}

// ── Escutar sinais vindos do parceiro via Realtime ──
function vcStartListening(){
  if(VC.sigChannel){try{sb.removeChannel(VC.sigChannel);}catch(e){}}
  // Canal dedicado ao nick do usuário atual
  VC.sigChannel = sb.channel('vc-listen-'+me.nick+'-'+Date.now())
    .on('postgres_changes',{
      event:'INSERT', schema:'public', table:'call_signals',
      filter:`to_nick=eq.${me.nick}`
    }, row => {
      if(row.new) vcHandleSignal(row.new);
    })
    .subscribe(status=>{
      // Se o Realtime não conectar, ativa o poll de fallback
      if(status === 'SUBSCRIBED') vcStopPoll();
      else vcStartPoll();
    });
}

// ── Poll de fallback caso Realtime falhe ──
let _vcPollInt = null;
let _vcPollAfter = null; // só busca sinais DEPOIS desta data

function vcStartPoll(){
  if(_vcPollInt) return;
  _vcPollAfter = new Date().toISOString();
  _vcPollInt = setInterval(async()=>{
    if(!me||!VC.partner) return;
    const{data} = await sb.from('call_signals')
      .select('*')
      .eq('to_nick', me.nick)
      .eq('from_nick', VC.partner)
      .gt('created_at', _vcPollAfter)
      .order('created_at',{ascending:true});
    if(data&&data.length){
      _vcPollAfter = data[data.length-1].created_at;
      for(const row of data) vcHandleSignal(row);
    }
  }, 1200);
}

function vcStopPoll(){
  clearInterval(_vcPollInt);
  _vcPollInt = null;
}

// ── Processar sinal recebido ──
async function vcHandleSignal(row){
  if(!row) return;
  if(row.from_nick === me.nick) return; // ignorar próprios sinais
  if(VC.processedIds.has(row.id)) return; // já processado
  VC.processedIds.add(row.id);

  // Ignorar sinais de quem não é o parceiro atual (exceto ring)
  if(row.type !== 'ring' && VC.partner && row.from_nick !== VC.partner) return;

  const type = row.type;
  let payload;
  try{ payload = row.payload ? JSON.parse(row.payload) : null; }
  catch(e){ payload = row.payload; }

  console.log('[VC] sinal recebido:', type, 'de', row.from_nick);

  // ── RING: receber chamada ──
  if(type === 'ring'){
    if(VC.role && VC.partner && VC.partner!==row.from_nick){ await vcInsertSignal('busy',''); return; }
    if(VC.role==='callee' && VC.partner===row.from_nick) return;
    if(VC.role==='caller'){ await vcInsertSignal('busy',''); return; }
    VC.partner=row.from_nick; VC.role='callee';
    VC.isVideo = payload && payload.video===true;
    vcShowUI('incoming'); vcRingStart(); return;
  }

  // ── OFFER: callee recebe offer do caller → cria answer ──
  if(type === 'offer'){
    if(VC.role !== 'callee') return;
    if(payload && payload.video === true) VC.isVideo = true;
    if(!VC.peer){ VC.pendingOffer=payload; return; }
    try{
      await VC.peer.setRemoteDescription(new RTCSessionDescription(payload));
      for(const c of VC.iceBuf){
        try{ await VC.peer.addIceCandidate(new RTCIceCandidate(c)); }catch(e){}
      }
      VC.iceBuf = [];
      const answer = await VC.peer.createAnswer();
      await VC.peer.setLocalDescription(answer);
      // Espera coletar todos os candidatos TURN antes de responder
      await vcWaitIceGathering(VC.peer, 8000);
      const finalAns = VC.peer.localDescription;
      await vcInsertSignal('answer', {type:finalAns.type, sdp:finalAns.sdp});
      vcOnConnected();
    }catch(e){ console.error('[VC] offer handling error', e); vcCleanup(); toast('Erro na chamada: '+e.message); }
    return;
  }

  // ── ANSWER: caller recebe answer do callee → conecta ──
  if(type === 'answer'){
    if(VC.role !== 'caller' || !VC.peer) return;
    try{
      await VC.peer.setRemoteDescription(new RTCSessionDescription(payload));
      for(const c of VC.iceBuf){
        try{ await VC.peer.addIceCandidate(new RTCIceCandidate(c)); }catch(e){}
      }
      VC.iceBuf = [];
      vcOnConnected();
    }catch(e){ console.error('[VC] answer handling error', e); vcCleanup(); toast('Erro na chamada: '+e.message); }
    return;
  }

  // ── ICE candidate ──
  if(type === 'ice'){
    if(!payload) return;
    if(VC.peer && VC.peer.remoteDescription && VC.peer.remoteDescription.type){
      try{ await VC.peer.addIceCandidate(new RTCIceCandidate(payload)); }catch(e){}
    } else {
      VC.iceBuf.push(payload);
    }
    return;
  }

  // ── HANGUP / REJECT ──
  if(type === 'hangup' || type === 'reject'){
    const savedPartner = VC.partner || row.from_nick;
    vcCleanup();
    toast(type === 'reject'
      ? (savedPartner + ' recusou a chamada 📵')
      : (savedPartner + ' encerrou a chamada'));
    return;
  }

  // ── BUSY ──
  if(type === 'busy'){
    const savedPartner = VC.partner || row.from_nick;
    vcCleanup();
    toast(savedPartner + ' está em outra chamada 📵');
    return;
  }
}

// ── CALLER: iniciar chamada ──
async function startVoiceCall(){
  if(!currentDmPartner || !me) return;
  if(VC.peer || VC.role) return toast('Já existe uma chamada ativa');
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    return toast('Seu navegador não suporta chamadas de voz');
  }

  VC.partner = currentDmPartner;
  VC.role    = 'caller';
  VC.iceBuf  = [];
  VC.processedIds = new Set();

  vcShowUI('calling');
  vcStartListening();

  // 1. Pegar microfone
  try{
    VC.stream = await navigator.mediaDevices.getUserMedia(VC_AUDIO_CONSTRAINTS);
  }catch(err){
    toast('Microfone: '+err.message);
    vcCleanup(); return;
  }

  // 2. Criar peer e adicionar tracks
  VC.peer = vcBuildPeer();
  VC.stream.getTracks().forEach(t => VC.peer.addTrack(t, VC.stream));

  // 3. Criar offer e esperar todos os candidatos ICE (STUN+TURN)
  try{
    const offer = await VC.peer.createOffer({offerToReceiveAudio:true});
    await VC.peer.setLocalDescription(offer);
    await vcInsertSignal('ring', '');
    await vcWaitIceGathering(VC.peer, 8000);
    const final = VC.peer.localDescription;
    await vcInsertSignal('offer', {type:final.type, sdp:final.sdp});
  }catch(err){
    toast('Erro ao iniciar chamada: '+err.message);
    vcCleanup(); return;
  }
}

// ── CALLER: iniciar chamada de vídeo ──
async function startVideoCall(){
  if(!currentDmPartner || !me) return;
  if(VC.peer || VC.role) return toast('Já existe uma chamada ativa');
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    return toast('Seu navegador não suporta chamadas de vídeo');
  }

  VC.partner = currentDmPartner;
  VC.role    = 'caller';
  VC.isVideo = true;
  VC.iceBuf  = [];
  VC.processedIds = new Set();

  vcShowUI('calling');
  vcStartListening();

  // 1. Pegar câmera + microfone
  try{
    VC.stream = await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
      video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}
    });
    // Mostrar vídeo local como PiP imediatamente
    const locVid=$('vcLocalVideo');
    if(locVid){locVid.srcObject=VC.stream;locVid.style.display='block';}
  }catch(err){
    toast('Câmera/microfone: '+err.message);
    vcCleanup(); return;
  }

  // 2. Criar peer e adicionar tracks
  VC.peer = vcBuildPeer();
  VC.stream.getTracks().forEach(t => VC.peer.addTrack(t, VC.stream));

  // 3. Criar offer com vídeo e esperar todos os candidatos ICE
  try{
    const offer = await VC.peer.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});
    await VC.peer.setLocalDescription(offer);
    await vcInsertSignal('ring', {video: true});
    await vcWaitIceGathering(VC.peer, 8000);
    const final = VC.peer.localDescription;
    await vcInsertSignal('offer', {type:final.type, sdp:final.sdp, video:true});
  }catch(err){
    toast('Erro ao iniciar chamada de vídeo: '+err.message);
    vcCleanup(); return;
  }
}

// ── CALLEE: aceitar chamada ──
async function acceptCall(){
  vcRingStop();
  vcShowUI('connecting');
  VC.iceBuf = [];
  VC.processedIds = new Set();

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    return toast('Seu navegador não suporta chamadas');
  }

  // Pegar microfone (e câmera se for chamada de vídeo)
  try{
    if(VC.isVideo){
      VC.stream = await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
        video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}
      });
      const locVid=$('vcLocalVideo');
      if(locVid){locVid.srcObject=VC.stream;locVid.style.display='block';}
    } else {
      VC.stream = await navigator.mediaDevices.getUserMedia(VC_AUDIO_CONSTRAINTS);
    }
  }catch(err){
    toast('Microfone/câmera: '+err.message);
    vcCleanup(); return;
  }

  // Criar peer e adicionar tracks
  VC.peer = vcBuildPeer();
  VC.stream.getTracks().forEach(t => VC.peer.addTrack(t, VC.stream));

  // Começar a escutar sinais futuros
  vcStartListening();

  // Se o offer já chegou antes do peer ser criado, processar agora
  if(VC.pendingOffer){
    const pending = VC.pendingOffer;
    VC.pendingOffer = null;
    if(pending.video === true) VC.isVideo = true;
    try{
      await VC.peer.setRemoteDescription(new RTCSessionDescription(pending));
      for(const c of VC.iceBuf){ try{ await VC.peer.addIceCandidate(new RTCIceCandidate(c)); }catch(e){} }
      VC.iceBuf = [];
      const answer = await VC.peer.createAnswer();
      await VC.peer.setLocalDescription(answer);
      await vcWaitIceGathering(VC.peer, 8000);
      const finalP = VC.peer.localDescription;
      await vcInsertSignal('answer', {type:finalP.type, sdp:finalP.sdp});
      vcOnConnected();
    }catch(e){ console.error('[VC] pendingOffer error', e); vcCleanup(); toast('Erro na chamada: '+e.message); }
    return;
  }

  // Buscar sinais já existentes no banco (offer pode ter chegado antes do listener)
  await vcFetchPendingSignals();
}

async function rejectCall(){
  const partner = VC.partner;
  VC.partner = VC.partner || partner;
  await vcInsertSignal('reject','');
  vcCleanup();
}

// ── Deixar tocando: fecha o overlay mas mantém o ring para decidir depois ──
function snoozeCall(){
  $('callOverlay').classList.add('hidden');
  // Mostra um toast com opção de retomar
  const t = $('toast');
  t.innerHTML = `📞 Ligação de <b>${VC.partner}</b> &nbsp;
    <button onclick="vcShowUI('incoming')" style="background:var(--blue);color:#fff;border:none;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:bold;cursor:pointer;margin-left:6px;">Ver</button>
    <button onclick="rejectCall()" style="background:#e03030;color:#fff;border:none;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:bold;cursor:pointer;margin-left:4px;">Rejeitar</button>`;
  t.classList.add('show');
  // Não para o ring — fica tocando em background
}

// Busca sinais já pendentes no banco (para o callee que acabou de aceitar)
async function vcFetchPendingSignals(){
  if(!me || !VC.partner) return;
  try{
    const since = new Date(Date.now() - 30000).toISOString(); // últimos 30s
    const{data} = await sb.from('call_signals')
      .select('*')
      .eq('to_nick', me.nick)
      .eq('from_nick', VC.partner)
      .gt('created_at', since)
      .order('created_at', {ascending: true});
    for(const row of (data||[])){
      await vcHandleSignal(row);
    }
  }catch(e){ console.warn('[VC] fetchPending error', e); }
}

async function endCall(){
  await vcInsertSignal('hangup','');
  vcCleanup();
}

// ── Limpeza ──
function vcCleanup(){
  vcRingStop();
  vcTimerStop();
  vcStopPoll();
  if(VC.peer){try{VC.peer.close();}catch(e){} VC.peer=null;}
  if(VC.stream){VC.stream.getTracks().forEach(t=>t.stop()); VC.stream=null;}
  if(VC.sigChannel){try{sb.removeChannel(VC.sigChannel);}catch(e){} VC.sigChannel=null;}
  const audio = $('vcRemoteAudio');
  if(audio){ audio.srcObject=null; audio.src=''; }
  const remVid=$('vcRemoteVideo'), locVid=$('vcLocalVideo');
  if(remVid){remVid.srcObject=null;remVid.style.display='none';}
  if(locVid){locVid.srcObject=null;locVid.style.display='none';}
  const av=$('callAvatar'); if(av) av.style.display='';
  VC.role=null; VC.partner=null; VC.muted=false; VC.camOff=false;
  VC.secs=0; VC.iceBuf=[]; VC.processedIds=new Set(); VC.pendingOffer=null; VC.isVideo=false;
  vcShowInviteBtn(false);
  const invP=$('vcInvitePanel'); if(invP) invP.style.display='none';
  $('callOverlay').classList.add('hidden');
  // Só apaga sinais endereçados a MIM (não prejudica o parceiro)
  if(me) sb.from('call_signals').delete().eq('to_nick',me.nick)
    .lt('created_at', new Date(Date.now()-5000).toISOString()).then(()=>{});
}

// ── Construir RTCPeerConnection ──
function vcBuildPeer(){
  const peer = new RTCPeerConnection(VC_ICE);

  // Enviar ICE candidate assim que gerado
  peer.onicecandidate = async e => {
    if(e.candidate){
      await vcInsertSignal('ice', e.candidate.toJSON());
    }
  };

  // Receber áudio/vídeo remoto
  peer.ontrack = e => {
    console.log('[VC] ontrack recebido', e.track.kind, e.streams);
    const remoteStream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);

    if(VC.isVideo){
      // ── Chamada de VÍDEO ──
      // Áudio E vídeo passam pelo mesmo <video> remoto (sem muted).
      // NÃO atribuímos ao <audio> para evitar conflito de dois elementos
      // reproduzindo o mesmo MediaStream ao mesmo tempo.
      const remVid = $('vcRemoteVideo');
      if(remVid){
        // Só troca srcObject se for um stream diferente (evita reset da reprodução)
        if(remVid.srcObject !== remoteStream){
          remVid.srcObject = remoteStream;
        }
        if(e.track.kind === 'video'){
          remVid.style.display = 'block';
          const av = $('callAvatar'); if(av) av.style.display = 'none';
          const nm = $('callPartnerName'); if(nm) nm.style.textShadow = '0 2px 8px rgba(0,0,0,.8)';
        }
        remVid.play().catch(err => {
          console.warn('[VC] autoplay bloqueado no vídeo:', err.message);
          vcShowUnmuteButton();
        });
      }
    } else {
      // ── Chamada de VOZ ──
      // Só existe trilha de áudio; usa o elemento <audio> dedicado.
      if(e.track.kind !== 'audio') return;
      const audio = $('vcRemoteAudio');
      if(!audio) return;
      audio.srcObject = remoteStream;
      const playPromise = audio.play();
      if(playPromise){
        playPromise.catch(err => {
          console.warn('[VC] autoplay bloqueado:', err.message);
          vcShowUnmuteButton();
        });
      }
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log('[VC] ICE state:', peer.iceConnectionState);
    if(peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed'){
      vcOnConnected();
      vcSetBitrate(peer);
    }
    if(peer.iceConnectionState === 'failed'){
      if(VC.role==='caller' && VC.peer){
        toast('Reconectando... 🔄');
        VC.peer.restartIce();
        VC.peer.createOffer({iceRestart:true, offerToReceiveAudio:true, offerToReceiveVideo:!!VC.isVideo})
          .then(async offer=>{
            await VC.peer.setLocalDescription(offer);
            await vcWaitIceGathering(VC.peer, 8000);
            const final=VC.peer.localDescription;
            return vcInsertSignal('offer',{type:final.type,sdp:final.sdp,restart:true,video:!!VC.isVideo});
          })
          .catch(()=>{ toast('Conexão falhou 📵'); endCall(); });
      } else {
        setTimeout(()=>{ if(VC.peer&&VC.peer.iceConnectionState==='failed'){ toast('Conexão falhou 📵'); endCall(); } }, 8000);
      }
    }
    if(peer.iceConnectionState === 'disconnected'){
      setTimeout(()=>{
        if(VC.peer && VC.peer.iceConnectionState==='disconnected'){
          toast('Reconectando... 🔄');
          if(VC.role==='caller') VC.peer.restartIce();
        }
      }, 5000);
    }
  };

  peer.onconnectionstatechange = () => {
    console.log('[VC] connection state:', peer.connectionState);
  };

  return peer;
}

// ── Desbloquear áudio se autoplay for bloqueado ──
function vcShowUnmuteButton(){
  const actions = $('callActions');
  if(!actions) return;
  const existing = document.getElementById('vcUnmuteBtn');
  if(existing) return;
  const btn = document.createElement('button');
  btn.id = 'vcUnmuteBtn';
  btn.className = 'call-btn mute';
  btn.textContent = '🔊';
  btn.title = 'Clique para ouvir';
  btn.onclick = () => {
    // Em chamada de vídeo o áudio vem do <video>; em chamada de voz, do <audio>
    const el = VC.isVideo ? $('vcRemoteVideo') : $('vcRemoteAudio');
    if(el) el.play().catch(()=>{});
    btn.remove();
  };
  actions.prepend(btn);
}

// ── Quando ICE conectar ──
let _vcConnectedOnce = false;
function vcOnConnected(){
  if(_vcConnectedOnce) return; // evitar chamar 2x
  _vcConnectedOnce = true;
  $('callStatus').textContent = 'Em chamada 🔵';
  vcTimerStart();
  vcShowInviteBtn(true);
}

// ── Mudo ──
function toggleMuteCall(){
  if(!VC.stream) return;
  VC.muted = !VC.muted;
  VC.stream.getAudioTracks().forEach(t => t.enabled = !VC.muted);
  const btn = $('muteBtn');
  if(btn){ btn.textContent = VC.muted ? '🔇' : '🎙️'; btn.className = 'call-btn '+(VC.muted?'muted':'mute'); }
}

// ── Câmera on/off ──
function toggleCamCall(){
  if(!VC.stream) return;
  VC.camOff = !VC.camOff;
  VC.stream.getVideoTracks().forEach(t => t.enabled = !VC.camOff);
  const btn = $('camBtn');
  if(btn){ btn.textContent = VC.camOff ? '🚫' : '📷'; btn.style.opacity = VC.camOff ? '0.5' : '1'; }
  const locVid = $('vcLocalVideo');
  if(locVid) locVid.style.opacity = VC.camOff ? '0.3' : '1';
}

// ── Trocar vídeo local ↔ remoto (clicar no PiP troca os dois) ──
function vcSwapVideos(){
  const remVid = $('vcRemoteVideo');
  const locVid = $('vcLocalVideo');
  if(!remVid || !locVid) return;
  // Toggle tamanhos: pip vira grande e grande vira pip
  if(locVid.classList.contains('pip-big')){
    locVid.classList.remove('pip-big');
    remVid.classList.remove('pip-small');
  } else {
    locVid.classList.add('pip-big');
    remVid.classList.add('pip-small');
  }
}

// ── UI da chamada ──
function vcShowUI(mode){
  _vcConnectedOnce = false;
  $('callOverlay').classList.remove('hidden');
  $('toast').classList.remove('show');
  $('callPartnerName').textContent = VC.partner || '';
  $('callAvatar').innerHTML = avatarOf(VC.partner || '?');
  $('callAvatar').style.display = '';
  $('callTimer').style.display = 'none';
  if(mode === 'calling'){
    $('callStatus').textContent = 'Chamando... 📞';
    $('callActions').innerHTML = `
      <div class="call-btn-wrap">
        <button class="call-btn hangup" onclick="endCall()">📵</button>
        <div class="call-btn-label">Encerrar</div>
      </div>`;
  } else if(mode === 'incoming'){
    $('callStatus').textContent = 'Ligação entrante 📲';
    $('callActions').innerHTML =
      `<div class="call-actions-labeled">
         <div class="call-action-item">
           <button class="call-btn accept call-ring" onclick="acceptCall()">📞</button>
           <span class="call-action-label">Aceitar</span>
         </div>
         <div class="call-action-item">
           <button class="call-btn snooze" onclick="snoozeCall()">🔕</button>
           <span class="call-action-label">Deixar tocando</span>
         </div>
         <div class="call-action-item">
           <button class="call-btn hangup" onclick="rejectCall()">📵</button>
           <span class="call-action-label">Rejeitar</span>
         </div>
       </div>`;
  } else if(mode === 'connecting'){
    $('callStatus').textContent = 'Conectando...';
    $('callActions').innerHTML = vcInCallHTML();
  }
}

function vcInCallHTML(){
  const showCam = VC.isVideo;
  return `<div class="call-btn-wrap">
            <button class="call-btn mute" id="muteBtn" onclick="toggleMuteCall()">🎙️</button>
            <div class="call-btn-label">Mudo</div>
          </div>
          ${showCam?`<div class="call-btn-wrap">
            <button class="call-btn cam-btn" id="camBtn" onclick="toggleCamCall()">📷</button>
            <div class="call-btn-label">Câmera</div>
          </div>`:''}
          <div class="call-btn-wrap">
            <button class="call-btn add-person" id="callAddBtn" onclick="vcToggleInvitePanel()">➕</button>
            <div class="call-btn-label">Adicionar</div>
          </div>
          <div class="call-btn-wrap">
            <button class="call-btn hangup" onclick="endCall()">📵</button>
            <div class="call-btn-label">Encerrar</div>
          </div>`;
}

function vcShowInviteBtn(show){
  const btn = document.getElementById('vcInviteCornerBtn');
  if(!btn) return;
  if(show) btn.classList.add('visible');
  else btn.classList.remove('visible');
}

function vcToggleInvitePanel(){
  const panel = document.getElementById('vcInvitePanel');
  if(!panel) return;
  const isHidden = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = isHidden ? 'block' : 'none';
  if(isHidden) vcRenderFriendsInvite();
}

function vcRenderFriendsInvite(){
  const list = document.getElementById('vcFriendList');
  if(!list) return;
  const inCall = GC.participants.length > 0 ? GC.participants : [me.nick, VC.partner];
  const available = (myFriends||[]).filter(f => !inCall.includes(f) && f !== VC.partner || !inCall.includes(f));
  const friendsToShow = (myFriends||[]).filter(f => f !== me.nick && !GC.participants.includes(f));
  if(friendsToShow.length === 0){
    list.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.5);text-align:center;padding:8px">Nenhum amigo para convidar</div>';
    return;
  }
  list.innerHTML = friendsToShow.map(nick => `
    <div class="vc-friend-item">
      <div class="vc-friend-av">${avatarOf(nick)}</div>
      <div class="vc-friend-nick">${esc(nick)}</div>
      <button class="vc-friend-invite-btn" onclick="vcInviteFriendToCall('${esc(nick)}',this)">Convidar</button>
    </div>
  `).join('');
}

async function vcInviteFriendToCall(nick, btn){
  if(btn){ btn.disabled=true; btn.textContent='Convidando...'; }
  // Se não há chamada de grupo ativa, cria uma escalando a chamada atual
  if(!GC.room){
    GC.room = me.nick+'_'+Date.now();
    GC.participants = [me.nick];
    GC.isVideo = VC.isVideo||false;
    // Reusar stream já obtido
    GC.stream = VC.stream;
    gcStartListening();
    gcShowOverlay();
    // Convidar o parceiro atual para o grupo
    if(VC.partner) await gcInviteNick(VC.partner);
    // Encerrar chamada 1:1 (sinaliza) mas mantém o stream
    await vcInsertSignal('end','');
    VC.role=null; VC.peer=null;
    $('callOverlay').classList.add('hidden');
    vcShowInviteBtn(false);
  }
  await gcInviteNick(nick);
  document.getElementById('vcInvitePanel').style.display='none';
}

// ── Timer ──
function vcTimerStart(){
  VC.secs = 0;
  $('callTimer').style.display = 'block';
  $('callActions').innerHTML = vcInCallHTML();
  VC.timerInt = setInterval(()=>{
    VC.secs++;
    const m = Math.floor(VC.secs/60), s = VC.secs%60;
    $('callTimer').textContent = m+':'+(s<10?'0':'')+s;
  }, 1000);
}
function vcTimerStop(){
  clearInterval(VC.timerInt); VC.timerInt=null;
  $('callTimer').style.display = 'none';
}

// ── Toque de chamada ──
function vcRingStart(){
  try{
    if(window._vcRingCtx){ try{window._vcRingCtx.close();}catch(e){} }
    const ctx = new(window.AudioContext||window.webkitAudioContext)();
    window._vcRingCtx = ctx;
    let on = true;
    window._vcRingStop = ()=>{ on=false; try{ctx.close();}catch(e){} };
    const beep = (freq, dur, delay) => {
      if(!on) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.12, ctx.currentTime+delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+delay+dur);
      o.start(ctx.currentTime+delay);
      o.stop(ctx.currentTime+delay+dur);
    };
    const loop = () => {
      if(!on) return;
      beep(880, 0.2, 0);
      beep(660, 0.2, 0.25);
      setTimeout(loop, 1400);
    };
    loop();
  }catch(e){ console.warn('[VC] ring error', e); }
}
function vcRingStop(){
  try{ if(window._vcRingStop){ window._vcRingStop(); window._vcRingStop=null; } }catch(e){}
}

// ── Listener global (chamadas recebidas em qualquer aba) ──
function vcStartGlobalListener(){
  if(!me) return;
  sb.channel('vc-global-'+me.nick)
    .on('postgres_changes',{
      event:'INSERT', schema:'public', table:'call_signals',
      filter:`to_nick=eq.${me.nick}`
    }, row => {
      if(!row.new) return;
      // Sinal de grupo
      if(row.new.type&&row.new.type.startsWith('group:')){
        gcHandleSignal(row.new); return;
      }
      if(row.new.type==='ring'){
        if(VC.role){
          if(VC.partner!==row.new.from_nick){
            const saved=VC.partner; VC.partner=row.new.from_nick;
            vcInsertSignal('busy','').then(()=>{VC.partner=saved;});
          } return;
        }
        VC.partner=row.new.from_nick; VC.role='callee';
        VC.isVideo=(()=>{try{const p=row.new.payload;if(!p||p==='')return false;const obj=typeof p==='object'?p:JSON.parse(p);return obj.video===true;}catch(e){return false;}})();
        VC.processedIds=new Set(); vcShowUI('incoming'); vcRingStart();
      }
    })
    .subscribe();
}

// ═══════════════════════════════════════════════════════════════
// ── CHAMADA EM GRUPO — até 5 participantes (mesh WebRTC)      ──
// ═══════════════════════════════════════════════════════════════

const GC = {
  room: null,         // id único da sala
  peers: {},          // nick → RTCPeerConnection
  streams: {},        // nick → MediaStream
  iceBufs: {},        // nick → []
  stream: null,       // meu stream local
  muted: false,
  channel: null,      // canal Realtime
  processedIds: new Set(),
  participants: [],   // nicks confirmados na sala
  isVideo: false,
};
const GC_MAX = 5;

// ── Helpers ──
function gcEl(id){ return document.getElementById(id); }

function gcInsert(toNick, type, payload=''){
  if(!me||!GC.room) return Promise.resolve();
  const body = typeof payload==='string'?payload:JSON.stringify(payload);
  return sb.from('call_signals').insert({
    from_nick:me.nick, to_nick:toNick, type:'group:'+type,
    payload: JSON.stringify({room:GC.room, data:body}),
    created_at:new Date().toISOString()
  }).then(()=>{}).catch(e=>console.warn('gcInsert err',e));
}

// ── Iniciar chamada em grupo (eu inicio convidando o parceiro atual) ──
async function startGroupCall(){
  if(!currentDmPartner||!me) return;
  if(GC.room) return toast('Já existe uma chamada em grupo ativa');
  if(VC.role) return toast('Encerre a chamada atual primeiro');

  GC.room = me.nick+'_'+Date.now();
  GC.participants = [me.nick];
  GC.isVideo = false;

  try{
    GC.stream = await navigator.mediaDevices.getUserMedia(
      {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}
    );
  }catch(e){ toast('Microfone: '+e.message); gcCleanup(); return; }

  gcStartListening();
  gcShowOverlay();

  // Convidar o parceiro atual
  await gcInviteNick(currentDmPartner);
}

// ── Convidar usuário pelo nick ──
async function gcInviteUser(){
  const nick = gcEl('gcInviteNick').value.trim().toLowerCase();
  if(!nick){ toast('Digite um nick'); return; }
  if(nick===me.nick){ toast('Você não pode se convidar'); return; }
  if(GC.participants.includes(nick)){ toast(nick+' já está na chamada'); return; }
  if(GC.participants.length>=GC_MAX){ toast('Limite de '+GC_MAX+' participantes'); return; }
  gcEl('gcInviteNick').value='';
  await gcInviteNick(nick);
}

async function gcInviteNick(nick){
  await gcInsert(nick,'ring',{video:GC.isVideo, initiator:me.nick});
  toast('Convidando '+nick+'...');
  // Adicionar slot "aguardando" na grade
  gcAddPendingSlot(nick);
}

// ── Escutar sinais de grupo ──
function gcStartListening(){
  if(GC.channel){try{sb.removeChannel(GC.channel);}catch(e){}}
  GC.channel = sb.channel('gc-listen-'+me.nick+'-'+Date.now())
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'call_signals',
      filter:`to_nick=eq.${me.nick}`}, row=>{
      if(row.new) gcHandleSignal(row.new);
    })
    .subscribe();
}

// ── Processar sinal de grupo ──
async function gcHandleSignal(row){
  if(!row||!row.type||!row.type.startsWith('group:')) return;
  if(GC.processedIds.has(row.id)) return;
  GC.processedIds.add(row.id);
  if(row.from_nick===me.nick) return;

  let envelope;
  try{ envelope=JSON.parse(row.payload); }catch(e){ return; }
  const{room, data:rawData}=envelope;
  const type=row.type.replace('group:','');
  const from=row.from_nick;
  let payload;
  try{ payload=rawData?JSON.parse(rawData):null; }catch(e){payload=rawData;}

  // ring: alguém me convidando
  if(type==='ring'){
    if(GC.room&&GC.room!==room) return; // sala diferente → ignorar
    if(VC.role) return; // em outra chamada p2p
    GC.room=room;
    GC.isVideo=payload&&payload.video;
    GC.participants=[me.nick];
    gcStartListening();
    // Mostrar notificação de chamada em grupo
    gcShowIncoming(from, payload&&payload.initiator||from);
    return;
  }

  // Só processar sinais da minha sala
  if(room!==GC.room) return;

  if(type==='join'){
    // Outro participante entrou: eu (se já estiver na sala) crio offer para ele
    if(!GC.stream) return;
    if(!GC.participants.includes(from)) GC.participants.push(from);
    gcUpdateParticipantList();
    await gcCreatePeerFor(from, true);
    return;
  }
  if(type==='offer'){
    if(!GC.stream) return;
    await gcHandleOffer(from, payload);
    return;
  }
  if(type==='answer'){
    const peer=GC.peers[from];
    if(!peer) return;
    try{
      await peer.setRemoteDescription(new RTCSessionDescription(payload));
      for(const c of (GC.iceBufs[from]||[])){ try{await peer.addIceCandidate(new RTCIceCandidate(c));}catch(e){} }
      GC.iceBufs[from]=[];
    }catch(e){console.error('[GC] answer err',e);}
    return;
  }
  if(type==='ice'){
    if(!payload) return;
    const peer=GC.peers[from];
    if(peer&&peer.remoteDescription&&peer.remoteDescription.type){
      try{await peer.addIceCandidate(new RTCIceCandidate(payload));}catch(e){}
    } else {
      if(!GC.iceBufs[from]) GC.iceBufs[from]=[];
      GC.iceBufs[from].push(payload);
    }
    return;
  }
  if(type==='leave'){
    gcRemoveParticipant(from);
    return;
  }
}

// ── Criar peer para um participante ──
async function gcCreatePeerFor(nick, asInitiator){
  if(GC.peers[nick]){ try{GC.peers[nick].close();}catch(e){} }
  const peer=new RTCPeerConnection({
    iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}],
    iceCandidatePoolSize:10,
  });
  GC.peers[nick]=peer;
  GC.iceBufs[nick]=GC.iceBufs[nick]||[];

  // Meu stream → peer
  if(GC.stream) GC.stream.getTracks().forEach(t=>peer.addTrack(t,GC.stream));

  peer.onicecandidate=async e=>{
    if(e.candidate) await gcInsert(nick,'ice',e.candidate.toJSON());
  };

  peer.ontrack=e=>{
    const stream=e.streams&&e.streams[0]?e.streams[0]:new MediaStream([e.track]);
    GC.streams[nick]=stream;
    gcUpdateParticipantTile(nick, stream);
  };

  peer.oniceconnectionstatechange=()=>{
    if(peer.iceConnectionState==='disconnected'||peer.iceConnectionState==='failed'){
      gcRemoveParticipant(nick);
    }
  };

  if(asInitiator){
    try{
      const offer=await peer.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:GC.isVideo});
      await peer.setLocalDescription(offer);
      await gcInsert(nick,'offer',{type:offer.type,sdp:offer.sdp});
    }catch(e){console.error('[GC] createOffer err',e);}
  }
  return peer;
}

// ── Receber offer ──
async function gcHandleOffer(from, sdp){
  const peer=await gcCreatePeerFor(from, false);
  try{
    await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    for(const c of (GC.iceBufs[from]||[])){ try{await peer.addIceCandidate(new RTCIceCandidate(c));}catch(e){} }
    GC.iceBufs[from]=[];
    const answer=await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await gcInsert(from,'answer',{type:answer.type,sdp:answer.sdp});
  }catch(e){console.error('[GC] handleOffer err',e);}
}

// ── Aceitar chamada em grupo ──
async function gcAccept(){
  vcRingStop();
  gcEl('groupCallOverlay').classList.remove('hidden');
  document.getElementById('gcIncomingToast')?.remove();

  try{
    GC.stream=await navigator.mediaDevices.getUserMedia(
      {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}
    );
  }catch(e){ toast('Microfone: '+e.message); gcCleanup(); return; }

  GC.participants=[me.nick];
  gcUpdateParticipantList();
  gcShowOverlay();
  gcStartListening();

  // Avisar todos que entrei
  // Como não sei quem mais está, aviso o initiator e confio que ele avisa os outros
  // O sinal 'join' vai para a sala inteira via broadcast (to_nick usa wildcard '*room')
  // Simplificação: enviamos join para quem nos ringou
  const initiator = GC._pendingInitiator||'';
  if(initiator){
    await gcInsert(initiator,'join','');
    if(!GC.participants.includes(initiator)) GC.participants.push(initiator);
  }
  gcUpdateParticipantList();
}

async function gcReject(){
  document.getElementById('gcIncomingToast')?.remove();
  vcRingStop();
  const initiator=GC._pendingInitiator||'';
  if(initiator) await gcInsert(initiator,'leave','');
  GC.room=null; GC._pendingInitiator=null;
}

// ── Sair da chamada em grupo ──
async function gcLeave(){
  // Avisar todos os participantes
  for(const nick of GC.participants.filter(n=>n!==me.nick)){
    await gcInsert(nick,'leave','').catch(()=>{});
  }
  gcCleanup();
}

function gcCleanup(){
  vcRingStop();
  for(const nick in GC.peers){ try{GC.peers[nick].close();}catch(e){} }
  if(GC.stream){GC.stream.getTracks().forEach(t=>t.stop()); GC.stream=null;}
  if(GC.channel){try{sb.removeChannel(GC.channel);}catch(e){} GC.channel=null;}
  GC.peers={}; GC.streams={}; GC.iceBufs={}; GC.room=null;
  GC.participants=[]; GC.muted=false; GC.processedIds=new Set();
  GC._pendingInitiator=null;
  gcEl('groupCallOverlay')?.classList.add('hidden');
}

function gcToggleMute(){
  if(!GC.stream) return;
  GC.muted=!GC.muted;
  GC.stream.getAudioTracks().forEach(t=>t.enabled=!GC.muted);
  const btn=gcEl('gcMuteBtn');
  if(btn){ btn.textContent=GC.muted?'🔇':'🎙️'; }
}

// ── UI ──
function gcShowOverlay(){
  gcEl('groupCallOverlay').classList.remove('hidden');
  gcUpdateParticipantList();
  gcEl('gcInvitePanel').classList.remove('hidden');
  gcEl('gcBar').innerHTML=`
    <button class="call-btn mute" id="gcMuteBtn" onclick="gcToggleMute()" title="Mudo">🎙️</button>
    <button class="call-btn snooze" onclick="gcEl('gcInvitePanel').classList.toggle('hidden')" title="Convidar">➕</button>
    <button class="call-btn hangup" onclick="gcLeave()" title="Sair">📵</button>`;
}

function gcUpdateParticipantList(){
  gcEl('gcStatus').textContent=GC.participants.length+'/'+GC_MAX+' participantes';
  gcRenderGrid();
}

function gcRenderGrid(){
  const grid=gcEl('gcGrid');
  if(!grid) return;
  grid.innerHTML=GC.participants.map(nick=>{
    const isSelf=nick===me.nick;
    const stream=isSelf?GC.stream:GC.streams[nick];
    const hasVideo=stream&&stream.getVideoTracks().length>0;
    return`<div class="group-participant" id="gctile-${nick}">
      ${hasVideo
        ?`<video id="gcvid-${nick}" autoplay playsinline ${isSelf?'muted':''} style="width:100%;border-radius:8px;aspect-ratio:4/3;object-fit:cover;background:#111;display:block;"></video>`
        :`<div class="gp-av">${avatarOf(nick)}</div>`}
      <div class="gp-name">${isSelf?'Você':esc(nick)}</div>
    </div>`;
  }).join('')
  +(GC.participants.length<GC_MAX
    ?`<div class="group-add-btn" onclick="gcEl('gcInvitePanel').classList.remove('hidden');gcEl('gcInviteNick').focus()">
        <span style="font-size:20px">➕</span>
        <span>Convidar</span>
      </div>`:'');

  // Atachar streams aos videos
  for(const nick of GC.participants){
    const vid=gcEl('gcvid-'+nick);
    if(!vid) continue;
    const stream=nick===me.nick?GC.stream:GC.streams[nick];
    if(stream&&vid.srcObject!==stream){ vid.srcObject=stream; vid.play().catch(()=>{}); }
  }
}

function gcAddPendingSlot(nick){
  if(!GC.participants.includes(nick)) GC.participants.push(nick);
  gcUpdateParticipantList();
}

function gcUpdateParticipantTile(nick, stream){
  gcAddPendingSlot(nick);
  const vid=gcEl('gcvid-'+nick);
  if(vid){ vid.srcObject=stream; vid.play().catch(()=>{}); }
  // Conectar áudio
  const audio=new Audio();
  audio.srcObject=stream;
  audio.autoplay=true;
  audio.play().catch(()=>{});
}

function gcRemoveParticipant(nick){
  if(GC.peers[nick]){ try{GC.peers[nick].close();}catch(e){} delete GC.peers[nick]; }
  delete GC.streams[nick];
  GC.participants=GC.participants.filter(n=>n!==nick);
  gcUpdateParticipantList();
  toast(nick+' saiu da chamada');
}

function gcShowIncoming(from, initiator){
  GC._pendingInitiator=initiator;
  vcRingStart();
  // Remover toast anterior se existir
  document.getElementById('gcIncomingToast')?.remove();
  const t=document.createElement('div');
  t.id='gcIncomingToast';
  t.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a2540;color:#fff;padding:14px 18px;border-radius:12px;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px;text-align:center;min-width:260px;';
  t.innerHTML=`<div style="margin-bottom:8px">👥 <b>${esc(from)}</b> te convidou para uma chamada em grupo</div>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button onclick="gcAccept()" style="background:#20a050;color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:12px;">Entrar 📞</button>
      <button onclick="gcReject()" style="background:#e03030;color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:12px;">Recusar 📵</button>
    </div>`;
  document.body.appendChild(t);
}

// ── Listener global também escuta sinais de grupo ──
// (já integrado no vcStartGlobalListener via gcHandleSignal)


// ══════════════════════════════════════════════════════════════════
// ── NOTIFICAÇÕES — Service Worker (yakult.net.br/sw.js)          ──
// ══════════════════════════════════════════════════════════════════

let _swReg = null;
const _notifShown = new Set();

// ── Registrar SW ──
async function registrarSW() {
  if(!('serviceWorker' in navigator)) return false;
  try {
    _swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[SW] registrado:', _swReg.scope);
    // Ouvir mensagens do SW (clique na notificação)
    navigator.serviceWorker.addEventListener('message', e => {
      if(!e.data) return;
      if(e.data.type === 'NOTIF_CLICK') tratarCliqueNotif(e.data.data);
    });
    return true;
  } catch(err) {
    console.warn('[SW] falha:', err);
    return false;
  }
}

// ── Enviar dados do usuário logado para o SW ──
function swEnviarInit() {
  const sw = _swReg && (_swReg.active || _swReg.installing || _swReg.waiting);
  if(!sw || !me) return;
  sw.postMessage({
    type: 'INIT',
    nick: me.nick,
    supaUrl: SUPA_URL,
    supaKey: SUPA_KEY,
    lastChecked: new Date(Date.now() - 10000).toISOString()
  });
}

function swEnviarLogout() {
  const sw = _swReg && _swReg.active;
  if(sw) sw.postMessage({ type: 'LOGOUT' });
}

// ── Ação ao clicar na notificação ──
function tratarCliqueNotif(data) {
  if(!data) return;
  window.focus();
  if(data.type === 'dm' && data.from) {
    showTab('dm');
    setTimeout(() => openDmConv(data.from), 250);
  } else if(data.type === 'call' || data.type === 'video') {
    if(VC.role === 'callee') vcShowUI('incoming');
  }
}

// ── Pedir permissão (precisa de gesto do usuário) ──
async function pedirPermissaoNotif() {
  if(!('Notification' in window)) return false;
  if(Notification.permission === 'granted') return true;
  if(Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch(e) { return false; }
}

// ── Disparar notificação (fallback quando app está aberto em background) ──
function dispararNotif(titulo, corpo, opcoes = {}) {
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const tag = opcoes.tag || ('yk-' + Date.now());
  if(_notifShown.has(tag)) return;
  _notifShown.add(tag);
  setTimeout(() => _notifShown.delete(tag), 30000);
  try {
    const n = new Notification(titulo, {
      body: corpo,
      icon: '/favicon.ico',
      tag,
      renotify: true,
      requireInteraction: opcoes.requireInteraction || false,
    });
    n.onclick = () => { tratarCliqueNotif(opcoes.data || {}); n.close(); };
    if(!opcoes.requireInteraction) setTimeout(() => n.close(), 8000);
  } catch(e) { console.warn('[Notif]', e); }
}

// ── PAINEL ADMIN ──────────────────────────────────────────────
let _adminAllUsers = [];

async function loadAdminPanel() {
  if (!me || !me._isAdmin) return;
  const el = $('adminUserList');
  el.innerHTML = '<div class="loading">Carregando usuários...</div>';
  try {
    const res = await fetch(`/admin/users?nick=${encodeURIComponent(me.nick)}&token=${encodeURIComponent(getCookie('yk_token')||sessionStorage.getItem('yk_token')||'')}`);
    // tenta pegar o token da sessão atual — ele pode estar só em memória
    // fallback: usa sessionToken salvo em variável global
    const users = await res.json();
    if (!res.ok) { el.innerHTML = '<div class="empty">Sem acesso</div>'; return; }
    _adminAllUsers = users;
    $('adminStatUsers').textContent = users.length;
    $('adminStatAdmins').textContent = users.filter(u => u.is_admin).length;
    adminRenderUsers(users);
  } catch(e) {
    el.innerHTML = '<div class="empty">Erro ao carregar</div>';
  }
}

function adminFilterUsers(q) {
  const filtered = q
    ? _adminAllUsers.filter(u =>
        u.nick.includes(q.toLowerCase()) ||
        (u.display_name||'').toLowerCase().includes(q.toLowerCase()))
    : _adminAllUsers;
  adminRenderUsers(filtered);
}

function adminRenderUsers(users) {
  const el = $('adminUserList');
  if (!users.length) { el.innerHTML = '<div class="empty">Nenhum usuário encontrado</div>'; return; }
  el.innerHTML = users.map(u => `
    <div class="admin-user-row" id="adm-row-${u.nick}">
      <div class="admin-user-info">
        <div class="admin-user-nick">@${esc(u.nick)}${u.is_admin?'<span class="admin-badge-adm">ADM</span>':''}</div>
        <div class="admin-user-name" id="adm-name-${u.nick}">${esc(u.display_name||u.nick)}</div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="admin-btn" onclick="adminRenameUser('${esc(u.nick)}')" title="Renomear display name">✏️ Nome</button>
        ${u.nick !== me.nick ? `
          ${u.is_admin
            ? `<button class="admin-btn" onclick="adminSetAdmin('${esc(u.nick)}',false)" title="Remover admin">⬇️ ADM</button>`
            : `<button class="admin-btn success" onclick="adminSetAdmin('${esc(u.nick)}',true)" title="Tornar admin">⭐ ADM</button>`}
          <button class="admin-btn danger" onclick="adminDeleteUser('${esc(u.nick)}')" title="Deletar usuário">🗑️ Del</button>
        ` : '<span style="font-size:10px;color:var(--muted);padding:3px 6px">você</span>'}
      </div>
    </div>`).join('');
}

async function adminRenameUser(nick) {
  const currentName = ($('adm-name-'+nick)||{}).textContent || nick;
  const newName = prompt(`Novo nome de exibição para @${nick}:`, currentName);
  if (!newName || newName.trim() === currentName) return;

  const token = getCookie('yk_token') || _adminSessionToken || '';
  const res = await fetch('/admin/rename-user', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ adminNick: me.nick, sessionToken: token, targetNick: nick, newDisplayName: newName.trim() })
  });
  const json = await res.json();
  if (!res.ok) return toast('Erro: ' + (json.error||'?'));
  toast(`✏️ @${nick} renomeado para "${newName.trim()}"!`);
  const nameEl = $('adm-name-'+nick);
  if (nameEl) nameEl.textContent = newName.trim();
  const u = _adminAllUsers.find(x => x.nick === nick);
  if (u) u.display_name = newName.trim();
  // Atualiza cache de admins
  loadAdminCache();
}

async function adminSetAdmin(nick, value) {
  const msg = value ? `Tornar @${nick} ADMIN?` : `Remover admin de @${nick}?`;
  if (!confirm(msg)) return;
  const token = getCookie('yk_token') || _adminSessionToken || '';
  const res = await fetch('/admin/set-admin', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ adminNick: me.nick, sessionToken: token, targetNick: nick, value })
  });
  const json = await res.json();
  if (!res.ok) return toast('Erro: ' + (json.error||'?'));
  toast(value ? `⭐ @${nick} agora é admin!` : `@${nick} não é mais admin`);
  loadAdminPanel();
  loadAdminCache();
}

async function adminDeleteUser(nick) {
  if (!confirm(`⚠️ DELETAR @${nick} permanentemente?\n\nIsso irá apagar todos os posts, recados e mensagens do usuário.\n\nTem certeza?`)) return;
  const token = getCookie('yk_token') || _adminSessionToken || '';
  const res = await fetch('/admin/delete-user', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ adminNick: me.nick, sessionToken: token, targetNick: nick })
  });
  const json = await res.json();
  if (!res.ok) return toast('Erro: ' + (json.error||'?'));
  toast(`🗑️ @${nick} deletado!`);
  _adminAllUsers = _adminAllUsers.filter(u => u.nick !== nick);
  $('adminStatUsers').textContent = _adminAllUsers.length;
  $('adminStatAdmins').textContent = _adminAllUsers.filter(u => u.is_admin).length;
  adminRenderUsers(_adminAllUsers);
}

// Guarda sessionToken em memória para usar nas rotas admin
let _adminSessionToken = '';


// ── GAME LAUNCHER ──────────────────────────────────────────
function openGame(game) {
  if(game === 'royale') {
    const wrap = document.getElementById('gameRoyaleWrap');
    wrap.style.display = 'flex';
    const iframe = document.getElementById('iframeRoyale');
    if(!iframe.src || iframe.src === window.location.href) {
      iframe.src = '/clash.html';
    }
  } else if(game === 'farm') {
    document.getElementById('gameFarmWrap').style.display = 'block';
  }
}

function closeGame(game) {
  if(game === 'royale') {
    document.getElementById('gameRoyaleWrap').style.display = 'none';
  }
}

// ── SISTEMA DE CONVITE DE JOGO (Supabase Realtime Broadcast) ──────────────
let _gameInviteCh = null;

function iniciarEscutaGameInvite() {
  if (!me) return;
  if (_gameInviteCh) { try { sb.removeChannel(_gameInviteCh); } catch(e){} }

  _gameInviteCh = sb.channel('game-invite-' + me.nick)
    .on('broadcast', { event: 'game_invite' }, ({ payload }) => {
      const iframe = document.getElementById('iframeRoyale');
      const wrap   = document.getElementById('gameRoyaleWrap');
      const from   = payload.from;

      if (wrap.style.display !== 'none' && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'GAME_INVITE_INCOMING', from }, '*');
      } else {
        // Abre o clash e entrega o convite assim que carregar
        openGame('royale');
        const tryDeliver = (attempts) => {
          if (attempts <= 0) return;
          try {
            iframe.contentWindow.postMessage({ type: 'GAME_INVITE_INCOMING', from }, '*');
          } catch(e) {
            setTimeout(() => tryDeliver(attempts - 1), 400);
          }
        };
        iframe.onload = () => { tryDeliver(5); iframe.onload = null; };
        toast('⚔️ ' + from + ' te desafiou no Yakult Royale!');
      }
    })
    .on('broadcast', { event: 'game_accept' }, ({ payload }) => {
      const iframe = document.getElementById('iframeRoyale');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'GAME_INVITE_ACCEPTED', from: payload.from }, '*');
      }
    })
    .on('broadcast', { event: 'game_decline' }, ({ payload }) => {
      const iframe = document.getElementById('iframeRoyale');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'GAME_INVITE_DECLINED', from: payload.from }, '*');
      }
    })
    .subscribe();
}

// Escuta mensagens vindas do iframe do clash.html
window.addEventListener('message', function(e) {
  if (!me || !sb) return;
  const d = e.data;
  if (!d || typeof d !== 'object') return;

  if (d.type === 'GAME_REQUEST_NICK') {
    const iframe = document.getElementById('iframeRoyale');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'GAME_MY_NICK', nick: me.nick }, '*');
    }
    return;
  }

  // Helper: envia broadcast para o canal do destinatário
  function sendGameBroadcast(toNick, event, payload) {
    const chName = 'game-invite-' + toNick;
    // Verifica se já existe canal subscrito para esse nick
    let ch = sb.getChannels?.()?.find?.(c => c.topic === 'realtime:' + chName);
    if (ch && ch.state === 'joined') {
      ch.send({ type: 'broadcast', event, payload });
    } else {
      // Cria canal temporário só para enviar
      const tmp = sb.channel(chName);
      tmp.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          tmp.send({ type: 'broadcast', event, payload });
          // Remove após 3s para não acumular canais
          setTimeout(() => { try { sb.removeChannel(tmp); } catch(e){} }, 3000);
        }
      });
    }
  }

  if (d.type === 'GAME_SEND_INVITE') {
    sendGameBroadcast(d.to, 'game_invite', { from: me.nick });
    return;
  }
  if (d.type === 'GAME_ACCEPT_INVITE') {
    sendGameBroadcast(d.to, 'game_accept', { from: me.nick });
    return;
  }
  if (d.type === 'GAME_DECLINE_INVITE') {
    sendGameBroadcast(d.to, 'game_decline', { from: me.nick });
    return;
  }
});

// ── Escuta de DMs (fallback Realtime enquanto app está aberto) ──
let _dmNotifCh = null;
function iniciarEscutaDmNotif() {
  if(!me) return;
  if(_dmNotifCh) { try { sb.removeChannel(_dmNotifCh); } catch(e){} }
  _dmNotifCh = sb.channel('dm-push-' + me.nick + '-' + Date.now())
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'dms',
      filter: `to_nick=eq.${me.nick}`
    }, row => {
      if(!row.new) return;
      const from = row.new.from_nick;
      if(from === me.nick) return;
      if(document.visibilityState === 'visible' && currentDmPartner === from) return;
      const texto = row.new.text || '';
      const preview = texto ? (texto.length > 80 ? texto.slice(0,77)+'...' : texto) : '📎 Mídia';
      dispararNotif('💬 ' + from + ' · yakult.net.br', preview, {
        tag: 'dm-' + from,
        data: { type: 'dm', from }
      });
      // Avisar SW para não duplicar
      if(_swReg && _swReg.active) {
        _swReg.active.postMessage({ type: 'UPDATE_CHECKED', lastChecked: new Date().toISOString() });
      }
    })
    .subscribe();
}

// ── Notificação de chamada ──
let _callNotif = null;
function notificarChamada(parceiro, isVideo) {
  if(_callNotif) { try { _callNotif.close(); } catch(e){} _callNotif = null; }
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const titulo = (isVideo ? '📹 Chamada de vídeo' : '📞 Chamada de voz') + ' · yakult.net.br';
  _notifShown.delete('call-' + parceiro);
  try {
    _callNotif = new Notification(titulo, {
      body: parceiro + ' está te ligando — toque para atender',
      icon: '/favicon.ico',
      tag: 'call-' + parceiro,
      renotify: true,
      requireInteraction: true,
    });
    _callNotif.onclick = () => {
      window.focus();
      vcShowUI('incoming');
      if(_callNotif) { _callNotif.close(); _callNotif = null; }
    };
  } catch(e) {}
}
function fecharNotifChamada() {
  if(_callNotif) { try { _callNotif.close(); } catch(e){} _callNotif = null; }
}

// ── Hookar vcShowUI para disparar notif de chamada ──
{
  const _orig = vcShowUI;
  vcShowUI = function(mode) {
    _orig.call(this, mode);
    if(mode === 'incoming' && VC.partner) notificarChamada(VC.partner, VC.isVideo);
    if(mode === 'connecting' || mode === 'calling') fecharNotifChamada();
  };
}

// ── Hookar acceptCall / rejectCall ──
{
  const _origAcc = acceptCall;
  acceptCall = async function() { fecharNotifChamada(); return _origAcc.apply(this, arguments); };
  const _origRej = rejectCall;
  rejectCall = async function() { fecharNotifChamada(); return _origRej.apply(this, arguments); };
}

// ── Mostrar botão de ativar notificações na topbar ──
function mostrarBotaoNotif() {
  if(document.getElementById('notifEnableBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'notifEnableBtn';
  btn.textContent = '🔔';
  btn.title = 'Ativar notificações';
  btn.style.cssText = 'background:var(--pink);color:#fff;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;animation:pulse 2s infinite;';
  btn.onclick = async () => {
    const ok = await pedirPermissaoNotif();
    btn.remove();
    if(ok) {
      toast('🔔 Notificações ativadas!');
      swEnviarInit();
      iniciarEscutaDmNotif();
    } else {
      toast('❌ Bloqueado. Ative nas configurações do browser.');
    }
  };
  const tr = document.querySelector('.topbar-right');
  if(tr) tr.insertBefore(btn, tr.firstChild);
}

// ── Inicializar sistema de notificações após login ──
async function iniciarNotificacoes() {
  if(!me) return;
  if(!('Notification' in window)) return;

  // Registrar SW sempre (independente de permissão)
  await registrarSW();

  if(Notification.permission === 'granted') {
    // Já tem permissão — ativar tudo imediatamente
    swEnviarInit();
    iniciarEscutaDmNotif();
  } else if(Notification.permission === 'default') {
    // Mostrar botão para pedir permissão via gesto
    mostrarBotaoNotif();
    // SW registrado — quando usuário aceitar, o SW já estará pronto
  }
  // Se 'denied', não faz nada
}

// ── Hookar doLogin ──
{
  const _orig = doLogin;
  doLogin = async function(data) {
    await _orig.call(this, data);
    setTimeout(iniciarNotificacoes, 1200);
  };
}

// ── Hookar logout para avisar o SW ──
{
  const _orig = logout;
  logout = function() {
    swEnviarLogout();
    if(_dmNotifCh) { try { sb.removeChannel(_dmNotifCh); } catch(e){} _dmNotifCh = null; }
    _orig.apply(this, arguments);
  };
}

