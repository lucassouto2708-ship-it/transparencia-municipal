'use strict';
/* Checklist Transparência Municipal — front estático (GitHub Pages) + Supabase (Auth, Postgres, Realtime, Edge Function). */

// ---------- tema (claro por padrão) ----------
const theme = {
  get() { try { return localStorage.getItem('tema-checklist'); } catch { return null; } },
  eff() { return this.get() === 'dark' ? 'dark' : 'light'; },
  apply() { document.documentElement.dataset.theme = this.eff(); },
  toggle() { try { localStorage.setItem('tema-checklist', this.eff() === 'dark' ? 'light' : 'dark'); } catch {} this.apply(); const b = document.getElementById('bTema'); if (b) b.innerHTML = this.icon(); },
  icon() { return this.eff() === 'dark' ? ico('sun') : ico('moon'); },
  label() { return this.eff() === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'; }
};

// ---------- ícones (SVG inline, sem biblioteca) ----------
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.3 3.5 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4 4-6 8-6s7.4 2 8 6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  reset: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  list: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  city: '<path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
};
const ico = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
theme.apply();

// ---------- utilitários ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ST = { pendente: 'Pendente', andamento: 'Em andamento', concluido: 'Concluído', na: 'Não se aplica' };
const FL = { D: 'Disponibilidade', A: 'Atualidade', S: 'Série histórica', G: 'Gravação de relatórios', F: 'Filtros de pesquisa' };
const LETTERS = Object.keys(FL);
const ROLES = { master: 'Administrador geral', municipio: 'Município' };
const fmtDate = d => d ? d.split('-').reverse().join('/') : '';
const fmtTs = t => t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const norm = x => String(x).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const iniciais = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map((p, k, a) => (k === 0 || k === a.length - 1) ? p[0] : '').join('').toUpperCase() || '?';

function toast(m) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: m });
  document.body.append(t); setTimeout(() => t.remove(), 3600);
}
function modal(html, onClose) {   // diálogo próprio (confirm/alert nativos são bloqueados em previews embutidos)
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { if (!o.isConnected) return; o.remove(); if (onClose) onClose(); };
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  o.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.append(o); const f = $('input,select,button', o); if (f) f.focus();
  return { el: o, close };
}
function choose(title, msg, opts) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p style="margin:0 0 16px;color:var(--muted)">${msg}</p>
      <div style="display:flex;flex-direction:column;gap:8px">${opts.map(o => `<button class="btn ${o.cls || ''}" style="height:38px" data-v="${o.v}">${esc(o.label)}</button>`).join('')}
      <button class="btn ghost" data-v="">Cancelar</button></div>`);
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { m.close(); res(b.dataset.v || null); } });
    m.el.addEventListener('mousedown', e => { if (e.target === m.el) res(null); });
    m.el.addEventListener('keydown', e => { if (e.key === 'Escape') res(null); });
    $('[data-v=""]', m.el).focus();
  });
}
const ask = (title, msg, okLabel, danger) => choose(title, msg, [{ v: 'ok', label: okLabel || 'Confirmar', cls: danger ? 'danger' : 'primary' }]).then(v => v === 'ok');

// ---------- estado ----------
const cfg = window.APP_CONFIG || {};
let sb = null;
const FILTROS = { q: '', dim: '', exig: '', status: '', resp: '', onlyMine: false };
// me: usuário logado · mun: município aberto (o próprio, ou o que o master abriu) · view: 'painel' (só master) | 'checklist'
const S = { me: null, mun: null, muns: [], resumo: {}, profiles: [], items: [], ciclo: null, cycles: [], view: 'checklist', openDims: null, openItems: new Set(), channel: null, f: { ...FILTROS } };
const isMaster = () => !!S.me && S.me.role === 'master';
const canEdit = () => !!S.me && !!S.mun;   // quem tem um município aberto marca o checklist
const nomeDe = id => (S.profiles.find(p => p.id === id) || {}).nome || '';

// ---------- letras D A S G F ----------
// Estado de cada letra: valor da validação (CSV) + ajuste manual em t.sub_state ('D:g,A:r').
// Letra "não se aplica" na validação é travada: não é preenchida nem editável.
const parseSt = s => Object.fromEntries((s || '').split(',').filter(Boolean).map(x => x.split(':')));
const effFlag = (i, k, t = i.t) => {
  const v = i.f[k]; if (v !== 'atende' && v !== 'não atende') return 'n';
  const o = parseSt(t.sub_state)[k]; if (o === 'g' || o === 'r') return o;
  return v === 'atende' ? 'g' : 'r';
};
const isOk = (i, k, t = i.t) => ({ g: true, r: false, n: null })[effFlag(i, k, t)];
const setFlag = (i, k, val) => { const m = parseSt(i.t.sub_state); m[k] = val; return LETTERS.filter(x => m[x]).map(x => x + ':' + m[x]).join(','); };
const baseOk = f => Object.values(f).every(v => v === 'atende' || v === 'não se aplica');
function nextStatus(i, t) {   // o status acompanha as letras
  const st = LETTERS.map(k => isOk(i, k, t)).filter(v => v !== null);
  if (t.status === 'na') return t.status;
  if (st.length && st.every(Boolean)) return 'concluido';
  if (t.status === 'concluido') return 'andamento';
  if (t.status === 'pendente' && st.some(Boolean)) return 'andamento';
  return t.status;
}

// ---------- dados ----------
const novaTask = i => ({ status: baseOk(i.f) ? 'concluido' : 'pendente', responsavel_id: null, prazo: null, notas: '', link: '', sub_state: '', updated_by_nome: null, updated_at: null });
async function loadData() {   // tudo filtrado pelo município aberto (o banco também só entrega o que a pessoa pode ver)
  const mid = S.mun.id;
  const [c, t, p] = await Promise.all([
    sb.from('criteria').select('*').eq('municipio_id', mid).order('ciclo', { ascending: false }).order('ordem'),
    sb.from('tasks').select('*').eq('municipio_id', mid),
    sb.from('profiles').select('id,nome,email,role,municipio_id').eq('municipio_id', mid).order('nome')]);
  const err = c.error || t.error || p.error; if (err) throw err;
  S.profiles = p.data;
  S.cycles = [...new Set(c.data.map(r => r.ciclo))];
  if (!S.cycles.includes(S.ciclo)) S.ciclo = S.cycles[0] ?? null;
  const tm = new Map(t.data.map(r => [r.criterio_id, r]));
  S.items = c.data.filter(r => r.ciclo === S.ciclo).map(r => {
    const i = { id: r.id, ciclo: r.ciclo, n: r.num, dim: r.dimensao, c: r.criterio, e: r.exigibilidade, ev: r.evidencias || [],
                f: { D: r.disp, A: r.atual, S: r.serie, G: r.grav, F: r.filtros } };
    i.t = tm.get(r.id) || novaTask(i);
    return i;
  });
}
async function loadPainel() {   // master: lista de municípios com o resumo de cada um
  const [m, r] = await Promise.all([sb.from('municipios').select('*').order('nome'), sb.rpc('resumo_municipios')]);
  if (m.error) throw m.error; if (r.error) throw r.error;
  S.muns = m.data; S.resumo = Object.fromEntries((r.data || []).map(x => [x.municipio_id, x]));
}
function descreve(i, a, b) {
  const ch = [];
  if (a.status !== b.status) ch.push(`status: ${ST[a.status]} → ${ST[b.status]}`);
  if (a.responsavel_id !== b.responsavel_id) ch.push(`responsável: ${nomeDe(a.responsavel_id) || '—'} → ${nomeDe(b.responsavel_id) || '—'}`);
  if ((a.prazo || null) !== (b.prazo || null)) ch.push(`prazo: ${fmtDate(a.prazo) || '—'} → ${fmtDate(b.prazo) || '—'}`);
  if (a.notas !== b.notas) ch.push('notas editadas');
  if (a.link !== b.link) ch.push('link editado');
  for (const k of LETTERS) {
    const x = effFlag(i, k, a), y = effFlag(i, k, b);
    if (x !== y) ch.push(`${k} (${FL[k]}): ${x === 'g' ? 'atende' : 'não atende'} → ${y === 'g' ? 'atende' : 'não atende'}`);
  }
  return ch.join('; ');
}
async function patchTask(i, patch, quiet) {
  if (!canEdit()) return;
  const antes = i.t, depois = { ...antes, ...patch, updated_by_nome: S.me.nome, updated_at: new Date().toISOString() };
  const desc = descreve(i, antes, depois); if (!desc) return;
  i.t = depois; replaceItem(i);
  const { error } = await sb.from('tasks').upsert({ criterio_id: i.id, municipio_id: S.mun.id, status: depois.status, responsavel_id: depois.responsavel_id, prazo: depois.prazo || null,
    notas: depois.notas, link: depois.link, sub_state: depois.sub_state, updated_by_nome: depois.updated_by_nome, updated_at: depois.updated_at }, { onConflict: 'criterio_id' });
  if (error) { i.t = antes; replaceItem(i); toast('Não foi possível salvar: ' + error.message); return; }
  sb.from('history').insert({ criterio_id: i.id, municipio_id: S.mun.id, user_id: S.me.id, user_nome: S.me.nome, changes: desc })
    .then(() => { const h = $(`.item[data-id="${i.id}"] [data-hist]`); if (h) loadHistory(h, i.id); });   // atualiza o histórico já com a linha nova
  if (!quiet) toast('Salvo');
}
function assina() {   // tempo real: mudanças de outras pessoas do MESMO município aparecem sozinhas
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  if (!S.mun) return;
  S.channel = sb.channel('tasks-' + S.mun.id).on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: 'municipio_id=eq.' + S.mun.id }, p => {
    const r = p.new; if (!r || !r.criterio_id) return;
    const i = S.items.find(x => x.id === r.criterio_id); if (!i || r.updated_at === i.t.updated_at) return;
    i.t = r; const el = $(`.item[data-id="${i.id}"]`);
    if (el && el.classList.contains('open') && el.contains(document.activeElement)) { renderSummary(); return; }   // não atrapalha quem está digitando
    replaceItem(i);
  }).subscribe();
}

// ---------- autenticação ----------
function renderSetup(msg) {
  $('#app').innerHTML = `<div class="setup"><h1>Configuração pendente</h1><p>${msg}</p>
    <ol><li>Crie um projeto em <b>supabase.com</b>.</li>
    <li>No <b>SQL Editor</b>, rode <code>supabase/schema.sql</code>.</li>
    <li>Em <b>Project Settings → API Keys</b>, copie a <b>Project URL</b> e a chave <b>anon / publishable</b> para o arquivo <code>config.js</code> e publique de novo.</li></ol>
    <p style="color:var(--muted)">Passo a passo completo no <code>README.md</code> do repositório.</p></div>`;
}
function renderAuth(aviso = '') {
  $('#app').innerHTML = `<div class="auth">
    <aside class="auth-brand"><div><div class="logo">${ico('list')}</div>
      <h1>Checklist de Transparência</h1><p>Acompanhe cada critério do Radar da Transparência Pública do seu município.</p>
      <ul><li>${ico('upload')}<span>Importe o CSV da ficha do seu município</span></li>
          <li>${ico('check')}<span>Marque cada critério e subcritério (D A S G F)</span></li>
          <li>${ico('live')}<span>Seus dados ficam separados dos de outros municípios</span></li></ul></div>
      <small>Radar da Transparência Pública · Atricon<br><span class="cred-branco">Desenvolvido por <a href="https://lucas-souto-sites.vercel.app/" target="_blank" rel="noopener"><span class="brilho branco">Lucas Souto</span></a></span></small></aside>
    <section class="auth-form"><form class="login" id="lf">
      <h2>Entrar</h2><p>Use o e-mail e a senha que você recebeu.</p>
      <label class="l" for="em">E-mail</label><input id="em" type="email" autocomplete="email" required>
      <label class="l" for="pw">Senha</label><input id="pw" type="password" autocomplete="current-password" required>
      <div class="err" id="le"></div>${aviso ? `<div class="msg">${esc(aviso)}</div>` : ''}
      <button class="btn primary" id="go">Entrar</button>
      <p style="margin:14px 0 0;text-align:center"><button type="button" class="linkbtn" id="fg">Esqueci a senha</button></p>
      <p style="font-size:12.5px;color:var(--muted);margin:18px 0 0;text-align:center">Não tem acesso? Peça ao administrador para criar o seu usuário.</p>
    ${credito()}</form></section></div>`;
  const erro = m => { $('#le').textContent = m; $('#go').disabled = false; };
  $('#fg').onclick = async () => {
    const em = $('#em').value.trim(); if (!em) return erro('Informe o e-mail para recuperar a senha.');
    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    if (error) return erro(error.message); renderAuth('Enviamos um link para redefinir a senha, se o e-mail estiver cadastrado.');
  };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); $('#go').disabled = true; $('#le').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value });
    if (error) erro(error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message.includes('not confirmed') ? 'Confirme seu e-mail antes de entrar.' : error.message);
  };
}
function renderSemMunicipio() {
  $('#app').innerHTML = `<div class="setup"><h1>Conta sem município</h1><p>Seu usuário ainda não está vinculado a um município. Peça ao administrador para vincular a sua conta e entre de novo.</p>
    <p><button class="btn" id="so">Sair</button></p></div>`;
  $('#so').onclick = () => sb.auth.signOut();
}
let bootando = false;
async function boot(user) {
  if (bootando) return; bootando = true;
  try {
    $('#app').innerHTML = '<div class="carregando">Carregando…</div>';
    const { data: me, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!me) throw new Error('Seu perfil não foi encontrado. Rode o supabase/schema.sql e entre de novo.');
    S.me = me; S.f = { ...FILTROS }; S.openItems.clear(); S.openDims = null; S.mun = null; S.ciclo = null;
    if (me.role === 'master') { S.view = 'painel'; await loadPainel(); return shell(); }
    if (!me.municipio_id) return renderSemMunicipio();
    const { data: m, error: em } = await sb.from('municipios').select('*').eq('id', me.municipio_id).maybeSingle();
    if (em) throw em; if (!m) return renderSemMunicipio();
    S.mun = m; S.view = 'checklist'; await loadData(); assina();
    S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim)); shell();
  } catch (e) {
    $('#app').innerHTML = `<div class="setup"><h1>Não foi possível carregar</h1><p>${esc(e.message || e)}</p><p><button class="btn" id="rt">Tentar de novo</button> <button class="btn" id="so">Sair</button></p></div>`;
    $('#rt').onclick = () => location.reload(); $('#so').onclick = () => sb.auth.signOut();
  } finally { bootando = false; }
}
async function abrirMunicipio(id) {   // (master) abre a ficha de um município
  S.mun = S.muns.find(m => m.id === id); if (!S.mun) return;
  S.ciclo = null; S.openItems.clear(); S.f = { ...FILTROS }; S.view = 'checklist';
  try { await loadData(); } catch (e) { return toast('Erro ao abrir: ' + e.message); }
  assina(); S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim)); shell(); window.scrollTo(0, 0);
}
async function irPainel() {
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  S.mun = null; S.view = 'painel'; S.items = []; S.openItems.clear();
  try { await loadPainel(); } catch (e) { toast('Erro: ' + e.message); }
  shell(); window.scrollTo(0, 0);
}

// ---------- cabeçalho (comum ao painel e ao checklist) ----------
const counted = a => a.filter(i => i.t.status !== 'na');
const done = a => a.filter(i => i.t.status === 'concluido').length;
const pct = a => { const c = counted(a); return c.length ? Math.round(100 * done(c) / c.length) : 0; };
const dimsOf = () => [...new Set(S.items.map(i => i.dim))];

function topbarHTML() {
  const painel = S.view === 'painel', tem = !painel && S.items.length > 0;
  const sub = painel ? 'Painel do administrador geral'
    : `${esc(S.mun.nome)}${S.mun.uf ? ' / ' + esc(S.mun.uf) : ''}${S.ciclo ? ` · <span class="ciclo-txt">Ciclo</span> ${S.cycles.length > 1 ? `<select id="cy" aria-label="Ciclo">${S.cycles.map(c => `<option ${c == S.ciclo ? 'selected' : ''}>${c}</option>`).join('')}</select>` : S.ciclo}` : ''}`;
  return `<header class="topbar"><div class="wrap">
    <div class="brand"><div class="logo">${ico('list')}</div><div><b>Checklist Transparência</b><small>${sub}</small></div></div>
    <a class="cred-top" href="https://lucas-souto-sites.vercel.app/" target="_blank" rel="noopener" title="Desenvolvido por Lucas Souto">por <b class="brilho">Lucas Souto</b></a>
    <span class="spacer"></span>
    ${!painel && isMaster() ? `<button class="btn" id="bvp" title="Voltar ao painel de municípios">${ico('back')}<span class="lbl">Painel</span></button>` : ''}
    ${painel ? '' : `<button class="btn primary" id="bc">${ico('upload')}<span class="lbl">Importar CSV</span></button><input type="file" id="fcsv" accept=".csv,text/csv" hidden>`}
    ${tem ? `<button class="btn" id="bx" title="Exportar andamento em CSV">${ico('download')}<span class="lbl">Exportar</span></button>` : ''}
    <button class="btn iconbtn" id="bTema" title="${theme.label()}" aria-label="${theme.label()}">${theme.icon()}</button>
    <div class="menuwrap"><button class="usr" id="bMenu" aria-haspopup="true" aria-expanded="false"><span class="avatar">${esc(iniciais(S.me.nome))}</span><span class="nm">${esc(S.me.nome)}</span>${ico('down')}</button>
      <div class="menu" id="menu" hidden>
        <div class="who"><b>${esc(S.me.nome)}</b><span>${esc(S.me.email)}</span><br><span class="badge ${S.me.role}">${ROLES[S.me.role]}</span></div><hr>
        <button id="bco">${ico('user')}Minha conta</button>
        ${painel ? '' : `<button id="brad">${ico('ext')}Abrir ficha no Radar</button>`}
        ${isMaster() ? `<button id="bu">${ico('users')}Usuários</button>` : ''}
        ${tem ? `<hr><button id="br" class="danger">${ico('reset')}Zerar ou apagar ficha…</button>` : ''}
        <hr><button id="bo">${ico('logout')}Sair</button></div></div>
  </div></header>`;
}
function bindTopbar() {
  const mn = $('#menu'), bm = $('#bMenu'), fechaMenu = () => { mn.hidden = true; bm.setAttribute('aria-expanded', 'false'); };
  bm.onclick = e => { e.stopPropagation(); mn.hidden = !mn.hidden; bm.setAttribute('aria-expanded', String(!mn.hidden)); };
  mn.addEventListener('click', fechaMenu);
  $('#bTema').onclick = () => theme.toggle();
  $('#bo').onclick = () => sb.auth.signOut(); $('#bco').onclick = openConta;
  if ($('#bu')) $('#bu').onclick = () => openUsuarios();
  if ($('#brad')) $('#brad').onclick = () => window.open(linkRadar(S.mun), '_blank', 'noopener');
  if ($('#bvp')) $('#bvp').onclick = irPainel;
  if ($('#bx')) $('#bx').onclick = exportCSV;
  if ($('#br')) $('#br').onclick = zerar;
  if ($('#bc')) { $('#bc').onclick = () => $('#fcsv').click(); $('#fcsv').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importCSV(f); }; }
  if ($('#cy')) $('#cy').onchange = async e => { S.ciclo = +e.target.value; S.openItems.clear(); await loadData(); S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim)); shell(); };
}
function shell() { S.view === 'painel' && isMaster() ? renderPainel() : renderChecklist(); }

const credito = () => `<footer class="credito">Desenvolvido por <a href="https://lucas-souto-sites.vercel.app/" target="_blank" rel="noopener">Lucas Souto</a></footer>`;

// link do Radar da Transparência já buscando a prefeitura do município aberto
const linkRadar = m => {
  const n = String(m.nome).trim(), q = 'prefeitura municipal de ' + n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return 'https://radardatransparencia.atricon.org.br/painel-6/#q=' + encodeURIComponent(q) + (m.uf ? '&uf=' + encodeURIComponent(m.uf) : '') + '&mun=' + encodeURIComponent(n);
};
// ---------- painel do master ----------
function renderPainel() {
  const rows = S.muns.map(m => {
    const r = S.resumo[m.id] || { criterios: 0, concluidos: 0, na: 0, usuarios: 0 }, base = r.criterios - r.na, p = base > 0 ? Math.round(100 * r.concluidos / base) : 0;
    return `<tr><td><b>${esc(m.nome)}</b>${m.uf ? ` <span class="uf">${esc(m.uf)}</span>` : ''}</td>
      <td class="num2">${r.usuarios}</td><td class="num2">${r.criterios || '—'}</td>
      <td style="min-width:150px">${r.criterios ? `<div class="mprog"><span class="bar"><i style="width:${p}%"></i></span><b>${p}%</b></div>` : '<span class="mut">Sem ficha importada</span>'}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn sm primary" data-abrir="${m.id}">Abrir</button>
        <button class="btn sm" data-usr="${m.id}" title="Usuários deste município">${ico('users')}</button>
        <button class="btn sm danger" data-delm="${m.id}" title="Excluir município" aria-label="Excluir ${esc(m.nome)}">${ico('trash')}</button></td></tr>`;
  }).join('');
  $('#app').innerHTML = `${topbarHTML()}<main class="wrap">
    <div class="pagehead"><div><h2>Municípios</h2><p>Cada município enxerga e edita somente a própria ficha. Você tem acesso a todas.</p></div>
      <div class="actions" style="margin:0"><button class="btn" id="bu2">${ico('users')}Usuários</button><button class="btn primary" id="bnm">${ico('plus')}Novo município</button></div></div>
    ${S.muns.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Município</th><th class="num2">Usuários</th><th class="num2">Critérios</th><th>Progresso</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="vazio"><div class="ic">${ico('city')}</div><h3>Nenhum município cadastrado</h3><p>Crie o primeiro município e depois os usuários dele. Cada usuário só verá e editará a ficha do próprio município.</p>
        <div class="actions"><button class="btn primary" id="bnm2">${ico('plus')}Criar o primeiro município</button></div></div>`}
  </main>${credito()}`;
  bindTopbar();
  $('#bu2').onclick = () => openUsuarios(); $('#bnm').onclick = novoMunicipio; if ($('#bnm2')) $('#bnm2').onclick = novoMunicipio;
  const t = $('.tbl'); if (t) t.addEventListener('click', async e => {
    const ab = e.target.closest('[data-abrir]'), us = e.target.closest('[data-usr]'), dl = e.target.closest('[data-delm]');
    if (ab) return abrirMunicipio(+ab.dataset.abrir);
    if (us) return openUsuarios(+us.dataset.usr);
    if (dl) {
      const m = S.muns.find(x => x.id === +dl.dataset.delm); if (!m) return;
      if (!await ask('Excluir município', `Excluir <b>${esc(m.nome)}</b>? A ficha, o andamento e o histórico desse município serão apagados. Os usuários dele continuam existindo, mas ficam sem município.`, 'Excluir município', true)) return;
      const { error } = await sb.from('municipios').delete().eq('id', m.id); if (error) return toast('Erro: ' + error.message);
      await loadPainel(); renderPainel(); toast('Município excluído');
    }
  });
}
function novoMunicipio() {
  const m = modal(`<h2>Novo município</h2><form id="fm"><label class="l" for="mn">Nome do município</label><input id="mn" type="text" required autocomplete="off" placeholder="Ex.: Mathias Lobato">
    <label class="l" for="mu">UF (opcional)</label><input id="mu" type="text" maxlength="2" autocomplete="off" placeholder="MG" style="text-transform:uppercase;width:90px">
    <div class="err" id="me"></div><div class="actions"><button class="btn primary" id="mc">Criar município</button><button class="btn ghost" type="button" id="mx">Cancelar</button></div></form>`);
  $('#mx', m.el).onclick = m.close;
  $('#fm', m.el).onsubmit = async e => {
    e.preventDefault(); const nome = $('#mn', m.el).value.trim(), uf = $('#mu', m.el).value.trim().toUpperCase() || null;
    const { error } = await sb.from('municipios').insert({ nome, uf });
    if (error) return $('#me', m.el).textContent = /duplicate|unique|municipios_nome_uk/i.test(error.message) ? 'Já existe um município com esse nome.' : error.message;
    m.close(); await loadPainel(); renderPainel(); toast('Município criado');
  };
}

// ---------- checklist ----------
function renderChecklist() {
  const dims = dimsOf(), tem = S.items.length > 0;
  $('#app').innerHTML = `${topbarHTML()}
  <main class="wrap">${tem ? `
    <div class="pagehead"><div><h2>Critérios da ficha</h2><p>Clique nas letras <b>D A S G F</b> para marcar cada subcritério como atende (verde) ou não atende (vermelho).</p></div></div>
    <section class="summary" id="sum"></section>
    <div class="toolbar"><div class="row1">
      <div class="search">${ico('search')}<input type="search" id="fq" placeholder="Buscar critério, nota ou responsável…" value="${esc(S.f.q)}" aria-label="Buscar"></div>
      <select id="fd" aria-label="Dimensão"><option value="">Todas as dimensões</option>${dims.map(d => `<option ${d === S.f.dim ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <select id="fe" aria-label="Exigibilidade"><option value="">Toda exigibilidade</option>${['Essencial', 'Obrigatória', 'Recomendada'].map(x => `<option ${x === S.f.exig ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select id="fr" aria-label="Responsável"><option value="">Todos os responsáveis</option><option value="none" ${S.f.resp === 'none' ? 'selected' : ''}>Sem responsável</option>${S.profiles.map(u => `<option value="${u.id}" ${S.f.resp === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
      <div class="row2"><div id="tabs" style="display:contents"></div><span class="gap"></span>
        <label class="chk"><input type="checkbox" id="fm" ${S.f.onlyMine ? 'checked' : ''}> Somente os meus</label>
        <button class="btn sm ghost" id="fx">Limpar filtros</button><button class="btn sm ghost" id="fo">Expandir tudo</button><button class="btn sm ghost" id="fc">Recolher tudo</button></div></div>
    <div class="legend"><span><b style="color:var(--text)">Letras:</b></span>${LETTERS.map(k => `<span><span class="flag na" style="cursor:default">${k}</span>${FL[k]}</span>`).join('')}</div>
    <div id="list"></div>` : '<div id="list"></div>'}</main>${credito()}`;
  bindTopbar();
  if (tem) {
    const b = (id, k, ev) => $(id).addEventListener(ev || 'input', e => { S.f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; renderList(); });
    b('#fq', 'q'); b('#fd', 'dim', 'change'); b('#fe', 'exig', 'change'); b('#fr', 'resp', 'change'); b('#fm', 'onlyMine', 'change');
    $('#fx').onclick = () => { S.f = { ...FILTROS }; shell(); };
    $('#fo').onclick = () => { dimsOf().forEach(d => S.openDims.add(d)); renderList(); };
    $('#fc').onclick = () => { S.openDims.clear(); renderList(); };
    $('#tabs').addEventListener('click', e => { const t = e.target.closest('[data-st]'); if (!t) return; S.f.status = t.dataset.st; renderTabs(); renderList(); });
  }
  renderSummary(); renderList();
}
function renderTabs() {
  const el = $('#tabs'); if (!el) return;
  const n = s => s ? S.items.filter(i => i.t.status === s).length : S.items.length;
  el.innerHTML = [['', 'Todos'], ['pendente', 'Pendentes'], ['andamento', 'Em andamento'], ['concluido', 'Concluídos'], ['na', 'Não se aplica']]
    .map(([k, l]) => `<button class="tab ${S.f.status === k ? 'on' : ''}" data-st="${k}" aria-pressed="${S.f.status === k}">${l}<em>${n(k)}</em></button>`).join('');
}
function renderSummary() {
  renderTabs();
  const el = $('#sum'); if (!el) return;
  const c = counted(S.items), by = s => c.filter(i => i.t.status === s).length, hoje = new Date().toISOString().slice(0, 10), tot = c.length || 1;
  const nC = by('concluido'), nA = by('andamento'), nP = by('pendente'), nNA = S.items.length - c.length;
  const aberto = ex => c.filter(i => i.e === ex && i.t.status !== 'concluido').length, total = ex => c.filter(i => i.e === ex).length;
  const venc = c.filter(i => i.t.prazo && i.t.prazo < hoje && i.t.status !== 'concluido').length;
  el.innerHTML = `<div class="kpi main"><div class="l">Progresso geral</div>
      <div class="top"><div class="n">${pct(S.items)}%</div><div class="s">${nC} de ${c.length} critérios concluídos</div></div>
      <div class="stack" role="img" aria-label="Distribuição por status"><i class="c" style="width:${100 * nC / tot}%"></i><i class="a" style="width:${100 * nA / tot}%"></i><i class="p" style="width:${100 * nP / tot}%"></i></div>
      <div class="lg"><span><em class="c"></em>Concluídos <b>${nC}</b></span><span><em class="a"></em>Em andamento <b>${nA}</b></span><span><em class="p"></em>Pendentes <b>${nP}</b></span>${nNA ? `<span><em class="n"></em>Não se aplica <b>${nNA}</b></span>` : ''}</div></div>
    <div class="kpi ${aberto('Essencial') ? 'alert' : 'zero'}"><div class="l">Essenciais em aberto</div><div class="n">${aberto('Essencial')}</div><div class="s">de ${total('Essencial')} essenciais</div></div>
    <div class="kpi"><div class="l">Obrigatórias em aberto</div><div class="n">${aberto('Obrigatória')}</div><div class="s">de ${total('Obrigatória')} obrigatórias</div></div>
    <div class="kpi ${venc ? 'alert' : 'zero'}"><div class="l">Prazos vencidos</div><div class="n">${venc}</div><div class="s">${venc ? 'precisam de atenção' : 'nenhum atrasado'}</div></div>`;
}
function vis(i) {
  const f = S.f, t = i.t;
  if (f.dim && i.dim !== f.dim || f.exig && i.e !== f.exig || f.status && t.status !== f.status) return false;
  if (f.resp === 'none' ? t.responsavel_id : f.resp && t.responsavel_id !== f.resp) return false;
  if (f.onlyMine && t.responsavel_id !== S.me.id) return false;
  if (f.q) { const h = (i.n + ' ' + i.c + ' ' + i.dim + ' ' + t.notas + ' ' + nomeDe(t.responsavel_id)).toLowerCase(); if (!f.q.toLowerCase().split(/\s+/).every(w => h.includes(w))) return false; }
  return true;
}
function renderList() {
  const el = $('#list'); if (!el) return;
  if (!S.items.length) {
    el.innerHTML = `<div class="vazio"><div class="ic">${ico('file')}</div><h3>Nenhuma ficha importada</h3>
      <p>Importe o CSV da ficha do Radar da Transparência de <b>${esc(S.mun.nome)}</b> para começar. Cada critério vira um item do checklist, com as letras <b>D A S G F</b> prontas para marcar.</p>
      <ol class="passos"><li><b>Abra a ficha da sua prefeitura no Radar</b> e baixe o CSV.</li><li><b>Importe o CSV</b> aqui.</li></ol>
      <div class="actions"><a class="btn" id="br2" href="${linkRadar(S.mun)}" target="_blank" rel="noopener">${ico('ext')}1. Abrir ${esc(S.mun.nome)} no Radar</a><button class="btn primary" id="bc2">${ico('upload')}2. Importar CSV da ficha</button></div>
      <p style="margin:10px auto 0"><button class="linkbtn" id="bm">Baixar modelo de CSV</button></p>
      <p style="margin:16px auto 0;font-size:12.5px">Formato: separador <code>;</code> e colunas <code>ciclo, dimensao, criterio, exigibilidade, Disponibilidade, Atualidade, Série Histórica, Gravação de Relatórios, Filtros de Pesquisa, autoavaliacao, evidencia</code>.</p></div>`;
    $('#bc2').onclick = () => $('#fcsv').click(); $('#bm').onclick = baixarModelo;
    return;
  }
  const filt = JSON.stringify(S.f) !== JSON.stringify(FILTROS);
  el.innerHTML = dimsOf().map(d => {
    const all = S.items.filter(i => i.dim === d), sh = all.filter(vis); if (!sh.length) return '';
    return `<details class="dim" data-dim="${esc(d)}" ${filt || S.openDims.has(d) ? 'open' : ''}><summary><span class="caret">${ico('chevron')}</span><span class="t">${esc(d)}</span>
      <span class="pct">${done(all)}/${counted(all).length}<b>${pct(all)}%</b></span><span class="bar"><i style="width:${pct(all)}%"></i></span></summary>
      <div class="items">${sh.map(itemHTML).join('')}</div></details>`;
  }).join('') || '<div class="nada">Nenhum critério encontrado com esses filtros.</div>';
  el.querySelectorAll('details.dim').forEach(d => d.addEventListener('toggle', () => d.open ? S.openDims.add(d.dataset.dim) : S.openDims.delete(d.dataset.dim)));
}
function chipsHTML(i) {
  return LETTERS.map(k => {
    const ok = isOk(i, k);
    if (ok === null) return `<span class="flag na" title="${FL[k]}: não se aplica — não precisa ser preenchido">${k}</span>`;
    return `<button type="button" class="flag ${ok ? 'atende' : 'nao'}" data-flag="${k}" data-stop aria-pressed="${ok}" title="${FL[k]}: ${ok ? 'atende' : 'não atende'} — clique para alternar verde/vermelho">${k}</button>`;
  }).join('');
}
function itemHTML(i) {
  const t = i.t, open = S.openItems.has(i.id), resp = nomeDe(t.responsavel_id);
  return `<div class="item s-${t.status} ${open ? 'open' : ''}" data-id="${i.id}"><div class="head" data-toggle><span class="num">${esc(i.n)}</span>
    <div><div class="title">${esc(i.c)}</div><div class="meta"><span class="pill ${slug(i.e)}">${esc(i.e)}</span>
    ${resp ? `<span>Resp.: ${esc(resp)}</span>` : ''}${t.prazo ? `<span>Prazo: ${fmtDate(t.prazo)}</span>` : ''}${t.notas ? '<span class="tag">Notas</span>' : ''}</div></div>
    <div class="flags">${chipsHTML(i)}</div>
    <div class="st ${t.status}" data-stop><select data-status aria-label="Status do critério ${esc(i.n)}">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${t.updated_by_nome ? `<small>${esc(t.updated_by_nome)} · ${fmtTs(t.updated_at)}</small>` : ''}</div></div>
    <div class="detail">${open ? detailHTML(i) : ''}</div></div>`;
}
function detailHTML(i) {
  const t = i.t;
  return `<h4>Subcritérios</h4>
  <div class="subs">${LETTERS.map(k => { const cur = effFlag(i, k);
    const seg = (v, label) => `<button type="button" data-flag="${k}" data-val="${v}" class="${cur === v ? 'on ' + v : ''}" aria-pressed="${cur === v}">${label}</button>`;
    return `<div class="subrow"><span class="subname"><b class="${cur}">${k}</b>${FL[k]}</span><span class="seg">${cur === 'n' ? '<span class="na-note">Não se aplica — não precisa ser preenchido</span>' : seg('g', 'Atende') + seg('r', 'Não atende')}</span></div>`; }).join('')}</div>
  <div class="grid2"><div><h4>Responsável</h4><select data-f="responsavel_id"><option value="">— sem responsável —</option>${S.profiles.map(u => `<option value="${u.id}" ${u.id === t.responsavel_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
  <div><h4>Prazo</h4><input type="date" data-f="prazo" value="${t.prazo || ''}"></div></div>
  <h4>Link da correção / evidência</h4><input type="text" data-f="link" value="${esc(t.link)}" placeholder="https://…">
  <h4>Notas</h4><textarea data-f="notas">${esc(t.notas)}</textarea>
  <div class="actions"><button class="btn primary" data-save>Salvar alterações</button></div>
  <h4>Evidências da validação</h4><div class="links">${i.ev.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join('') || '—'}</div>
  <h4>Histórico</h4><ul class="hist" data-hist><li>carregando…</li></ul>`;
}
async function loadHistory(el, id) {
  const { data, error } = await sb.from('history').select('user_nome,at,changes').eq('criterio_id', id).order('id', { ascending: false }).limit(50);
  if (!el.isConnected) return;
  el.innerHTML = error ? '' : data.length ? data.map(x => `<li>${fmtTs(x.at)} — <b>${esc(x.user_nome)}</b>: ${esc(x.changes)}</li>`).join('') : '<li>Sem alterações ainda.</li>';
}
function replaceItem(i) {
  renderSummary();
  const el = $(`.item[data-id="${i.id}"]`); if (!el) return;
  if (S.f.status && i.t.status !== S.f.status) { renderList(); return; }   // saiu do filtro de status ativo
  const tmp = document.createElement('div'); tmp.innerHTML = itemHTML(i); el.replaceWith(tmp.firstElementChild);
  const n = $(`.item[data-id="${i.id}"]`); if (S.openItems.has(i.id)) loadHistory($('[data-hist]', n), i.id);
  const all = S.items.filter(x => x.dim === i.dim), d = n.closest('details.dim');
  $('.pct', d).innerHTML = `${done(all)}/${counted(all).length}<b>${pct(all)}%</b>`; $('.bar i', d).style.width = pct(all) + '%';
}
document.addEventListener('click', e => {
  if (!e.target.closest('.menuwrap')) { const m = $('#menu'); if (m && !m.hidden) { m.hidden = true; $('#bMenu').setAttribute('aria-expanded', 'false'); } }
  const el = e.target.closest('.item'); if (!el || !S.me) return;
  const i = S.items.find(x => x.id === +el.dataset.id); if (!i) return;
  const fl = e.target.closest('[data-flag]');
  if (fl) {
    const k = fl.dataset.flag, sub_state = setFlag(i, k, fl.dataset.val || (isOk(i, k) === true ? 'r' : 'g'));
    patchTask(i, { sub_state, status: nextStatus(i, { ...i.t, sub_state }) }, true); return;
  }
  if (e.target.closest('[data-save]')) {
    const p = {}; el.querySelectorAll('[data-f]').forEach(f => { const k = f.dataset.f; p[k] = k === 'responsavel_id' ? (f.value || null) : k === 'prazo' ? (f.value || null) : f.value.trim(); });
    patchTask(i, p); return;
  }
  if (e.target.closest('[data-stop]') || e.target.closest('.detail') || !e.target.closest('[data-toggle]')) return;
  S.openItems.has(i.id) ? S.openItems.delete(i.id) : S.openItems.add(i.id);
  el.classList.toggle('open'); $('.detail', el).innerHTML = S.openItems.has(i.id) ? detailHTML(i) : '';
  if (S.openItems.has(i.id)) loadHistory($('[data-hist]', el), i.id);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('#menu'); if (m && !m.hidden) { m.hidden = true; $('#bMenu').focus(); } } });
document.addEventListener('change', e => {
  if (!e.target.matches('[data-status]')) return;
  const i = S.items.find(x => x.id === +e.target.closest('.item').dataset.id); if (i) patchTask(i, { status: e.target.value }, true);
});

// ---------- zerar, importar e exportar (cada um só mexe na ficha do próprio município) ----------
async function zerar() {
  const op = await choose('Zerar ou apagar a ficha', `Ações sobre os <b>${S.items.length} critérios do ciclo ${S.ciclo}</b> de <b>${esc(S.mun.nome)}</b>. Não afeta nenhum outro município e não dá para desfazer.`,
    [{ v: 'tudo', label: 'Limpar marcações (todos pendentes e vermelhos)', cls: 'danger' }, { v: 'csv', label: 'Voltar ao resultado do CSV importado' },
     { v: 'apagar', label: 'Apagar a ficha importada (para importar outra)', cls: 'danger' }]);
  if (!op) return;
  if (op === 'apagar') {
    if (!await ask('Apagar a ficha importada?', `Todos os critérios do ciclo ${S.ciclo}, com andamento e histórico, serão excluídos. Depois você poderá importar o CSV certo.`, 'Apagar a ficha', true)) return;
    const { error } = await sb.from('criteria').delete().eq('municipio_id', S.mun.id).eq('ciclo', S.ciclo);
    if (error) return toast('Erro ao apagar: ' + error.message);
    S.openItems.clear(); S.f = { ...FILTROS }; S.ciclo = null; await loadData(); S.openDims = new Set(); shell(); return toast('Ficha apagada');
  }
  const agora = new Date().toISOString();
  const rows = S.items.map(i => ({ criterio_id: i.id, municipio_id: S.mun.id, status: op === 'tudo' ? 'pendente' : (baseOk(i.f) ? 'concluido' : 'pendente'), responsavel_id: null, prazo: null, notas: '', link: '',
    sub_state: op === 'tudo' ? LETTERS.filter(k => i.f[k] === 'atende' || i.f[k] === 'não atende').map(k => k + ':r').join(',') : '', updated_by_nome: S.me.nome, updated_at: agora }));
  const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'criterio_id' });
  if (error) return toast('Erro ao zerar: ' + error.message);
  rows.forEach(r => { S.items.find(i => i.id === r.criterio_id).t = r; });
  S.openItems.clear(); S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim));
  S.f = { ...FILTROS }; shell(); window.scrollTo(0, 0); toast('Marcações zeradas');
}
function parseCSV(text, sep = ';') {
  text = text.replace(/^﻿/, '');
  if (!text.includes(';') && text.includes(',')) sep = ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
async function importCSV(file) {
  let text = await file.text();
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(await file.arrayBuffer());   // CSV salvo pelo Excel
  const [head, ...rows] = parseCSV(text), h = (head || []).map(norm);
  if (!['dimensao', 'criterio', 'exigibilidade', 'disponibilidade'].every(c => h.includes(c))) return toast('CSV inválido: faltam as colunas da ficha (dimensao, criterio, exigibilidade, Disponibilidade…).');
  const col = c => h.indexOf(c), get = (r, c) => col(c) >= 0 ? (r[col(c)] || '').trim() : '';
  const novo = [];
  rows.forEach(r => {
    const m = get(r, 'criterio').match(/^(\d+\.\d+)\.?\s*(.*)$/s); if (!m) return;
    novo.push({ municipio_id: S.mun.id, ciclo: parseInt(get(r, 'ciclo'), 10) || S.ciclo || new Date().getFullYear(), ordem: novo.length, dimensao: get(r, 'dimensao'), num: m[1], criterio: m[2], exigibilidade: get(r, 'exigibilidade'),
      disp: get(r, 'disponibilidade'), atual: get(r, 'atualidade'), serie: get(r, 'serie historica'), grav: get(r, 'gravacao de relatorios'), filtros: get(r, 'filtros de pesquisa'),
      evidencias: get(r, 'evidencia').split(/\s+/).filter(Boolean) });
  });
  if (!novo.length) return toast('Nenhum critério encontrado no CSV.');
  const ciclos = [...new Set(novo.map(r => r.ciclo))];
  if (!await ask('Importar CSV', `<b>${novo.length}</b> critérios do ciclo <b>${ciclos.join(', ')}</b> em <b>${new Set(novo.map(r => r.dimensao)).size}</b> dimensões, para <b>${esc(S.mun.nome)}</b>. Critérios com o mesmo número no mesmo ciclo são atualizados e <b>mantêm o andamento</b>; os novos começam pelo resultado da validação.`, 'Importar')) return;
  const { data, error } = await sb.from('criteria').upsert(novo, { onConflict: 'municipio_id,ciclo,num' }).select('id,disp,atual,serie,grav,filtros');
  if (error) return toast('Erro ao importar: ' + error.message);
  const tasks = data.map(r => ({ criterio_id: r.id, municipio_id: S.mun.id, status: baseOk({ D: r.disp, A: r.atual, S: r.serie, G: r.grav, F: r.filtros }) ? 'concluido' : 'pendente' }));
  const t = await sb.from('tasks').upsert(tasks, { onConflict: 'criterio_id', ignoreDuplicates: true });
  if (t.error) return toast('Critérios importados, mas falhou criar o andamento: ' + t.error.message);
  S.ciclo = ciclos[0]; S.openItems.clear(); S.f = { ...FILTROS }; await loadData(); S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim)); shell(); toast(`${novo.length} critérios importados`);
}
function baixa(nome, texto, tipo) { Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([texto], { type: tipo })), download: nome }).click(); }
function baixarModelo() {
  baixa('modelo-ficha.csv', '﻿' + [
    'ciclo;dimensao;criterio;exigibilidade;Disponibilidade;Atualidade;Série Histórica;Gravação de Relatórios;Filtros de Pesquisa;autoavaliacao;evidencia',
    '2026;Informações Prioritárias;1.1 Possui sítio oficial próprio na internet?;Essencial;atende;não se aplica;não se aplica;não se aplica;não se aplica;;https://exemplo.gov.br/',
    '2026;Informações Prioritárias;1.2 Possui portal da transparência próprio ou compartilhado na internet?;Essencial;não atende;não se aplica;não se aplica;não se aplica;não se aplica;S----;https://exemplo.gov.br/transparencia'].join('\r\n'), 'text/csv');
}
function exportCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, N = { g: 'atende', r: 'não atende', n: 'não se aplica' };
  const L = ['Dimensão', 'Critério', 'Descrição', 'Exigibilidade', 'D', 'A', 'S', 'G', 'F', 'Status', 'Responsável', 'Prazo', 'Notas', 'Link', 'Atualizado por', 'Atualizado em'];
  const r = S.items.map(i => [i.dim, i.n, i.c, i.e, ...LETTERS.map(k => N[effFlag(i, k)]), ST[i.t.status], nomeDe(i.t.responsavel_id), i.t.prazo, i.t.notas, i.t.link, i.t.updated_by_nome, i.t.updated_at].map(q).join(';'));
  baixa(`checklist-${slug(S.mun.nome) || 'municipio'}-${S.ciclo}.csv`, '﻿' + [L.map(q).join(';'), ...r].join('\r\n'), 'text/csv');
}

// ---------- usuários (somente o master) ----------
async function gerencia(acao, dados) {   // chama a Edge Function "gerenciar-usuarios" (roda no servidor, com a chave de serviço)
  const { data, error } = await sb.functions.invoke('gerenciar-usuarios', { body: { acao, ...dados } });
  if (error) {
    let msg = error.message || 'Falha ao chamar o servidor.';
    try {
      const ctx = error.context;
      if (ctx && ctx.status === 404) msg = 'A função “gerenciar-usuarios” ainda não foi publicada no Supabase. Veja o README (passo 5).';
      else if (ctx && ctx.json) { const j = await ctx.json(); if (j && j.error) msg = j.error; }
    } catch {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
async function pedeSenha(nome) {
  return new Promise(res => {
    const m = modal(`<h2>Nova senha</h2><p style="margin:0 0 4px;color:var(--muted)">Defina uma nova senha para <b>${esc(nome)}</b>.</p>
      <label class="l" for="ps">Senha (mín. 8 caracteres)</label><input id="ps" type="text" autocomplete="off" minlength="8"><div class="err" id="pe"></div>
      <div class="actions"><button class="btn primary" id="po">Salvar senha</button><button class="btn ghost" id="pc">Cancelar</button></div>`);
    $('#pc', m.el).onclick = () => { m.close(); res(null); };
    m.el.addEventListener('mousedown', e => { if (e.target === m.el) res(null); });
    $('#po', m.el).onclick = () => { const v = $('#ps', m.el).value; if (v.length < 8) return $('#pe', m.el).textContent = 'A senha precisa ter ao menos 8 caracteres.'; m.close(); res(v); };
  });
}
async function openUsuarios(munId = null) {
  const m = modal('<div id="ub"><div class="carregando" style="padding:30px">Carregando…</div></div>', () => { if (S.view === 'painel') loadPainel().then(renderPainel).catch(() => {}); });
  let ls = [], muns = [];
  const nomeMun = id => (muns.find(x => x.id === id) || {}).nome || '';
  const draw = async () => {
    const [p, mu] = await Promise.all([sb.from('profiles').select('id,nome,email,role,municipio_id,created_at').order('nome'), sb.from('municipios').select('id,nome,uf').order('nome')]);
    if (p.error || mu.error) return toast((p.error || mu.error).message);
    muns = mu.data; ls = munId ? p.data.filter(u => u.municipio_id === munId) : p.data;
    const opMun = sel => `<option value="">— sem município —</option>${muns.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}`;
    $('#ub', m.el).innerHTML = `<h2>${munId ? 'Usuários de ' + esc(nomeMun(munId)) : 'Usuários'}</h2>
      ${ls.length ? `<div class="tblwrap" style="border:0;box-shadow:none"><table><tr><th>Pessoa</th><th>Município</th><th style="text-align:right">Ações</th></tr>
      ${ls.map(u => { const eu = u.id === S.me.id, ms = u.role === 'master'; return `<tr><td><div class="pessoa"><span class="avatar">${esc(iniciais(u.nome))}</span><span>${esc(u.nome)}${eu ? ' (você)' : ''}<small>${esc(u.email)}</small></span></div></td>
        <td>${ms ? '<span class="badge master">Administrador geral</span>' : `<select data-mun="${u.id}" aria-label="Município de ${esc(u.nome)}">${opMun(u.municipio_id)}</select>`}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm" data-pw="${u.id}" title="Definir nova senha">${ico('key')}Senha</button> <button class="btn sm danger" data-del="${u.id}" ${eu ? 'disabled' : ''} title="Excluir usuário" aria-label="Excluir ${esc(u.nome)}">${ico('trash')}</button></td></tr>`; }).join('')}</table></div>`
      : '<p style="color:var(--muted)">Nenhum usuário neste município ainda.</p>'}
      <h3>Novo usuário</h3><div class="novo"><form id="nu"><div class="grid2"><div><label class="l" for="un">Nome</label><input id="un" type="text" required autocomplete="off"></div>
        <div><label class="l" for="ue">E-mail</label><input id="ue" type="email" required autocomplete="off"></div>
        <div><label class="l" for="up">Senha inicial (mín. 8)</label><input id="up" type="text" required minlength="8" autocomplete="off"></div>
        <div><label class="l" for="ur">Perfil</label><select id="ur"><option value="municipio">Município</option><option value="master">Administrador geral</option></select></div>
        <div id="boxm" style="grid-column:1/-1"><label class="l" for="um">Município do usuário <span style="font-weight:400">(ele só verá e editará a ficha deste município)</span></label><select id="um" required><option value="">Escolha o município…</option>${muns.map(x => `<option value="${x.id}" ${x.id === munId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div></div>
        <div class="err" id="ue2"></div><div class="actions"><button class="btn primary" id="uc">${ico('plus')}Criar usuário</button></div></form></div>
      ${muns.length ? '' : '<p style="font-size:12.5px;color:var(--bad);margin:10px 0 0">Crie um município antes de cadastrar usuários.</p>'}
      <div class="actions" style="justify-content:flex-end"><button class="btn" id="ux">Fechar</button></div>`;
    $('#ux', m.el).onclick = m.close;
    $('#ur', m.el).onchange = e => { const mu = e.target.value === 'municipio'; $('#boxm', m.el).hidden = !mu; $('#um', m.el).required = mu; };
    $('#nu', m.el).onsubmit = async e => {
      e.preventDefault(); const b = $('#uc', m.el), er = $('#ue2', m.el); b.disabled = true; er.textContent = '';
      try { await gerencia('criar', { nome: $('#un', m.el).value.trim(), email: $('#ue', m.el).value.trim(), password: $('#up', m.el).value, role: $('#ur', m.el).value, municipio_id: Number($('#um', m.el).value) || null }); toast('Usuário criado'); await draw(); }
      catch (x) { er.textContent = x.message; b.disabled = false; }
    };
  };
  m.el.addEventListener('change', async e => {
    const id = e.target.dataset.mun; if (!id) return;
    const { error } = await sb.from('profiles').update({ municipio_id: Number(e.target.value) || null }).eq('id', id);
    if (error) { toast('Erro: ' + error.message); return draw(); }
    toast('Município do usuário atualizado'); if (munId) await draw();
  });
  m.el.addEventListener('click', async e => {
    const pw = e.target.closest('[data-pw]'), del = e.target.closest('[data-del]');
    const uid = pw ? pw.dataset.pw : del ? del.dataset.del : null, u = ls.find(x => x.id === uid);
    if (pw && u) { const s = await pedeSenha(u.nome); if (!s) return; try { await gerencia('senha', { id: u.id, password: s }); toast('Senha redefinida'); } catch (x) { toast(x.message); } }
    if (del && u && await ask('Excluir usuário', `Excluir <b>${esc(u.nome)}</b> (${esc(u.email)})? A pessoa perde o acesso. O histórico de alterações dela é mantido.`, 'Excluir', true)) {
      try { await gerencia('excluir', { id: u.id }); toast('Usuário excluído'); await draw(); } catch (x) { toast(x.message); }
    }
  });
  draw();
}
function openConta() {
  const m = modal(`<h2>Minha conta</h2><label class="l">E-mail</label><input type="text" value="${esc(S.me.email)}" disabled>
    <label class="l" for="cn">Nome</label><input id="cn" type="text" value="${esc(S.me.nome)}">
    <label class="l" for="cp">Nova senha (deixe em branco para manter)</label><input id="cp" type="password" autocomplete="new-password" minlength="8">
    <div class="err" id="ce"></div><div class="actions"><button class="btn primary" id="cs">Salvar</button><button class="btn ghost" id="cc">Cancelar</button></div>`);
  $('#cc', m.el).onclick = m.close;
  $('#cs', m.el).onclick = async () => {
    const nome = $('#cn', m.el).value.trim(), pw = $('#cp', m.el).value, err = $('#ce', m.el);
    if (!nome) return err.textContent = 'Informe o nome.';
    if (pw && pw.length < 8) return err.textContent = 'A senha precisa ter ao menos 8 caracteres.';
    if (nome !== S.me.nome) { const { error } = await sb.from('profiles').update({ nome }).eq('id', S.me.id); if (error) return err.textContent = error.message; S.me.nome = nome; const p = S.profiles.find(x => x.id === S.me.id); if (p) p.nome = nome; }
    if (pw) { const { error } = await sb.auth.updateUser({ password: pw }); if (error) return err.textContent = error.message; }
    m.close(); shell(); toast('Conta atualizada');
  };
}
function openRecuperacao() {
  const m = modal(`<h2>Definir nova senha</h2><label class="l" for="np">Nova senha (mín. 8 caracteres)</label><input id="np" type="password" autocomplete="new-password" minlength="8">
    <div class="err" id="ne"></div><div class="actions"><button class="btn primary" id="ns">Salvar</button></div>`);
  $('#ns', m.el).onclick = async () => {
    const pw = $('#np', m.el).value; if (pw.length < 8) return $('#ne', m.el).textContent = 'A senha precisa ter ao menos 8 caracteres.';
    const { error } = await sb.auth.updateUser({ password: pw }); if (error) return $('#ne', m.el).textContent = error.message;
    m.close(); toast('Senha alterada');
  };
}

// ---------- início ----------
(async function init() {
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return renderSetup('Preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> no arquivo <code>config.js</code>.');
  if (!window.supabase) return renderSetup('Não foi possível carregar a biblioteca do Supabase (verifique sua conexão ou bloqueadores de conteúdo).');
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_OUT') { S.me = null; S.mun = null; S.items = []; S.openItems.clear(); S.f = { ...FILTROS }; if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } renderAuth(); }
    else if (ev === 'PASSWORD_RECOVERY') setTimeout(openRecuperacao, 300);
    else if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') && session && !S.me) setTimeout(() => boot(session.user), 0);
  });
  const { data } = await sb.auth.getSession();
  if (!data.session) renderAuth();
  document.addEventListener('visibilitychange', async () => {   // ao voltar para a aba, sincroniza (caso o tempo real tenha caído)
    if (document.hidden || !S.me || S.openItems.size || document.querySelector('.overlay')) return;
    try { if (S.view === 'painel') { await loadPainel(); renderPainel(); } else if (S.mun) { await loadData(); renderSummary(); renderList(); } } catch {}
  });
})();
