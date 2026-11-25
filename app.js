'use strict';
/* Checklist Transparência Municipal — front estático (GitHub Pages) + Supabase (Auth, Postgres, Realtime). */

// ---------- tema ----------
const theme = {
  get() { try { return localStorage.getItem('tema-checklist'); } catch { return null; } },
  eff() { return this.get() || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); },
  apply() { const t = this.get(); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; },
  toggle() { const n = this.eff() === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('tema-checklist', n); } catch {} this.apply(); const b = document.getElementById('bTema'); if (b) b.textContent = this.label(); },
  label() { return this.eff() === 'dark' ? 'Modo claro' : 'Modo escuro'; }
};
theme.apply();

// ---------- utilitários ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ST = { pendente: 'Pendente', andamento: 'Em andamento', concluido: 'Concluído', na: 'Não se aplica' };
const FL = { D: 'Disponibilidade', A: 'Atualidade', S: 'Série histórica', G: 'Gravação de relatórios', F: 'Filtros de pesquisa' };
const LETTERS = Object.keys(FL);
const ROLES = { admin: 'Administrador', editor: 'Editor', viewer: 'Somente leitura' };
const fmtDate = d => d ? d.split('-').reverse().join('/') : '';
const fmtTs = t => t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const norm = x => String(x).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');

function toast(m) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: m });
  document.body.append(t); setTimeout(() => t.remove(), 3200);
}
function modal(html) {   // diálogo próprio (confirm/alert nativos são bloqueados em previews embutidos)
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => o.remove();
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  o.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.append(o); const f = $('input,select,button', o); if (f) f.focus();
  return { el: o, close };
}
function choose(title, msg, opts) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p style="margin:0 0 16px;color:var(--muted)">${msg}</p>
      <div style="display:flex;flex-direction:column;gap:8px">${opts.map(o => `<button class="btn ${o.cls || ''}" style="height:36px" data-v="${o.v}">${esc(o.label)}</button>`).join('')}
      <button class="btn" data-v="">Cancelar</button></div>`);
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { m.close(); res(b.dataset.v || null); } });
    m.el.addEventListener('mousedown', e => { if (e.target === m.el) res(null); });
    m.el.addEventListener('keydown', e => { if (e.key === 'Escape') res(null); });
    $('[data-v=""]', m.el).focus();
  });
}
const ask = (title, msg, okLabel, danger) => choose(title, msg, [{ v: 'ok', label: okLabel || 'Confirmar', cls: danger ? 'danger' : 'primary' }]).then(v => v === 'ok');

// ---------- Supabase ----------
const cfg = window.APP_CONFIG || {};
let sb = null;
const S = { me: null, profiles: [], items: [], ciclo: null, cycles: [], openDims: null, openItems: new Set(), channel: null,
            f: { q: '', dim: '', exig: '', status: '', resp: '', onlyMine: false } };
const canEdit = () => S.me && (S.me.role === 'admin' || S.me.role === 'editor');
const isAdmin = () => S.me && S.me.role === 'admin';
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
async function loadData() {
  const [c, t, p] = await Promise.all([
    sb.from('criteria').select('*').order('ciclo', { ascending: false }).order('ordem'),
    sb.from('tasks').select('*'),
    sb.from('profiles').select('id,nome,email,role').order('nome')]);
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
  if (!canEdit()) { toast('Seu perfil é somente leitura.'); return; }
  const antes = i.t, depois = { ...antes, ...patch, updated_by_nome: S.me.nome, updated_at: new Date().toISOString() };
  const desc = descreve(i, antes, depois); if (!desc) return;
  i.t = depois; replaceItem(i);
  const { error } = await sb.from('tasks').upsert({ criterio_id: i.id, status: depois.status, responsavel_id: depois.responsavel_id, prazo: depois.prazo || null,
    notas: depois.notas, link: depois.link, sub_state: depois.sub_state, updated_by_nome: depois.updated_by_nome, updated_at: depois.updated_at }, { onConflict: 'criterio_id' });
  if (error) { i.t = antes; replaceItem(i); toast('Não foi possível salvar: ' + error.message); return; }
  sb.from('history').insert({ criterio_id: i.id, user_id: S.me.id, user_nome: S.me.nome, changes: desc })
    .then(() => { const h = $(`.item[data-id="${i.id}"] [data-hist]`); if (h) loadHistory(h, i.id); });   // atualiza o histórico já com a linha nova
  if (!quiet) toast('Salvo');
}
function assina() {   // tempo real: mudanças de outras pessoas aparecem sozinhas
  if (S.channel) sb.removeChannel(S.channel);
  S.channel = sb.channel('tasks-live').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, p => {
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
    <li>No <b>SQL Editor</b>, rode <code>supabase/schema.sql</code> e depois <code>supabase/seed.sql</code>.</li>
    <li>Em <b>Project Settings → API</b>, copie a <b>Project URL</b> e a <b>anon public key</b> para o arquivo <code>config.js</code> e publique de novo.</li></ol>
    <p style="color:var(--muted)">Passo a passo completo no <code>README.md</code> do repositório.</p></div>`;
}
function renderAuth(modo = 'login', aviso = '') {
  const cad = modo === 'cadastro';
  $('#app').innerHTML = `<form class="login" id="lf">
    <h1>Checklist Transparência</h1><p>Radar da Transparência Pública · acesso da equipe</p>
    <div class="tabs"><button type="button" data-m="login" class="${cad ? '' : 'on'}">Entrar</button><button type="button" data-m="cadastro" class="${cad ? 'on' : ''}">Criar conta</button></div>
    ${cad ? '<label for="nm">Nome</label><input id="nm" type="text" autocomplete="name" required>' : ''}
    <label for="em">E-mail</label><input id="em" type="email" autocomplete="email" required>
    <label for="pw">Senha${cad ? ' (mín. 8 caracteres)' : ''}</label><input id="pw" type="password" autocomplete="${cad ? 'new-password' : 'current-password'}" minlength="${cad ? 8 : 1}" required>
    <div class="err" id="le"></div>${aviso ? `<div class="msg">${esc(aviso)}</div>` : ''}
    <button class="btn primary" style="width:100%;margin-top:8px" id="go">${cad ? 'Criar conta' : 'Entrar'}</button>
    ${cad ? '<p style="font-size:12px;color:var(--muted);margin:10px 0 0">Novas contas começam como “somente leitura”; um administrador libera a edição.</p>' : '<p style="margin:12px 0 0"><button type="button" class="linkbtn" id="fg">Esqueci a senha</button></p>'}
  </form>`;
  $('#lf').querySelectorAll('[data-m]').forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  const erro = m => { $('#le').textContent = m; $('#go').disabled = false; };
  if ($('#fg')) $('#fg').onclick = async () => {
    const em = $('#em').value.trim(); if (!em) return erro('Informe o e-mail para recuperar a senha.');
    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    if (error) return erro(error.message); renderAuth('login', 'Enviamos um link para redefinir a senha, se o e-mail estiver cadastrado.');
  };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); $('#go').disabled = true; $('#le').textContent = '';
    const email = $('#em').value.trim(), password = $('#pw').value;
    if (cad) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nome: $('#nm').value.trim() } } });
      if (error) return erro(error.message);
      if (!data.session) return renderAuth('login', 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return erro(error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message.includes('not confirmed') ? 'Confirme seu e-mail antes de entrar.' : error.message);
    }
  };
}
let bootando = false;
async function boot(user) {
  if (bootando) return; bootando = true;
  try {
    $('#app').innerHTML = '<div class="carregando">Carregando…</div>';
    const { data: me, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!me) throw new Error('Seu perfil não foi encontrado. Rode o supabase/schema.sql e entre de novo.');
    S.me = me; await loadData(); assina();
    if (!S.openDims) S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim));
    shell();
  } catch (e) {
    $('#app').innerHTML = `<div class="setup"><h1>Não foi possível carregar</h1><p>${esc(e.message || e)}</p><p><button class="btn" id="rt">Tentar de novo</button> <button class="btn" id="so">Sair</button></p></div>`;
    $('#rt').onclick = () => location.reload(); $('#so').onclick = () => sb.auth.signOut();
  } finally { bootando = false; }
}

// ---------- tela principal ----------
const counted = a => a.filter(i => i.t.status !== 'na');
const done = a => a.filter(i => i.t.status === 'concluido').length;
const pct = a => { const c = counted(a); return c.length ? Math.round(100 * done(c) / c.length) : 100; };
const dimsOf = () => [...new Set(S.items.map(i => i.dim))];

function shell() {
  const dims = dimsOf();
  $('#app').innerHTML = `<header class="top"><div class="wrap">
    <h1>Checklist Transparência ${S.cycles.length > 1 ? `<select id="cy" style="width:auto;margin-left:8px">${S.cycles.map(c => `<option ${c == S.ciclo ? 'selected' : ''}>${c}</option>`).join('')}</select>` : (S.ciclo ?? '')}</h1>
    <span class="who">${esc(S.me.nome)} <span class="badge ${S.me.role}">${ROLES[S.me.role]}</span></span>
    <button class="btn" id="bTema">${theme.label()}</button>
    ${isAdmin() ? '<button class="btn" id="bc">Importar CSV</button><input type="file" id="fcsv" accept=".csv,text/csv" hidden>' : ''}
    <button class="btn" id="bx">Exportar CSV</button>
    ${isAdmin() ? '<button class="btn danger" id="br">Zerar</button><button class="btn" id="bu">Usuários</button>' : ''}
    <button class="btn" id="bco">Conta</button><button class="btn" id="bo">Sair</button></div></header>
  <main class="wrap"><section class="summary" id="sum"></section>
  <div class="filters"><input type="search" id="fq" placeholder="Buscar critério, nota, responsável…" value="${esc(S.f.q)}">
    <select id="fd"><option value="">Todas as dimensões</option>${dims.map(d => `<option ${d === S.f.dim ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
    <select id="fe"><option value="">Exigibilidade</option>${['Essencial', 'Obrigatória', 'Recomendada'].map(x => `<option ${x === S.f.exig ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <select id="fs"><option value="">Status</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === S.f.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select id="fr"><option value="">Responsável</option><option value="none" ${S.f.resp === 'none' ? 'selected' : ''}>Sem responsável</option>${S.profiles.map(u => `<option value="${u.id}" ${S.f.resp === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
  <div class="filters row2"><label class="chk"><input type="checkbox" id="fm" ${S.f.onlyMine ? 'checked' : ''}> Somente os meus</label>
    <button class="btn" id="fx">Limpar filtros</button><button class="btn" id="fo">Expandir tudo</button><button class="btn" id="fc">Recolher tudo</button>
    <span class="who">Alterações são salvas na hora e aparecem para toda a equipe.</span></div>
  <div id="list"></div></main>`;
  const b = (id, k, ev) => $(id).addEventListener(ev || 'input', e => { S.f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; renderList(); });
  b('#fq', 'q'); b('#fd', 'dim', 'change'); b('#fe', 'exig', 'change'); b('#fs', 'status', 'change'); b('#fr', 'resp', 'change'); b('#fm', 'onlyMine', 'change');
  $('#fx').onclick = () => { S.f = { q: '', dim: '', exig: '', status: '', resp: '', onlyMine: false }; shell(); };
  $('#fo').onclick = () => { dimsOf().forEach(d => S.openDims.add(d)); renderList(); };
  $('#fc').onclick = () => { S.openDims.clear(); renderList(); };
  $('#bTema').onclick = () => theme.toggle(); $('#bx').onclick = exportCSV;
  $('#bo').onclick = () => sb.auth.signOut(); $('#bco').onclick = openConta;
  if ($('#cy')) $('#cy').onchange = async e => { S.ciclo = +e.target.value; S.openItems.clear(); await loadData(); shell(); };
  if (isAdmin()) {
    $('#bc').onclick = () => $('#fcsv').click();
    $('#fcsv').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importCSV(f); };
    $('#br').onclick = zerar; $('#bu').onclick = openUsuarios;
  }
  renderSummary(); renderList();
}
function renderSummary() {
  const c = counted(S.items), by = s => c.filter(i => i.t.status === s).length, hoje = new Date().toISOString().slice(0, 10);
  const el = $('#sum'); if (!el) return;
  el.innerHTML = `<div class="card"><div class="n">${pct(S.items)}%</div><div class="l">concluído (${by('concluido')} de ${c.length})</div><div class="bar"><i style="width:${pct(S.items)}%"></i></div></div>
  <div class="card"><div class="n">${by('pendente')}</div><div class="l">pendentes</div></div>
  <div class="card"><div class="n">${by('andamento')}</div><div class="l">em andamento</div></div>
  <div class="card"><div class="n">${c.filter(i => i.e === 'Essencial' && i.t.status !== 'concluido').length}</div><div class="l">essenciais em aberto</div></div>
  <div class="card"><div class="n">${c.filter(i => i.t.prazo && i.t.prazo < hoje && i.t.status !== 'concluido').length}</div><div class="l">com prazo vencido</div></div>`;
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
    el.innerHTML = `<div class="empty">Nenhum critério cadastrado.${isAdmin() ? ' Use <b>Importar CSV</b> para carregar a ficha (ou rode <code>supabase/seed.sql</code>).' : ' Peça a um administrador para importar a ficha.'}</div>`; return;
  }
  const filt = Object.values(S.f).some(Boolean);
  el.innerHTML = dimsOf().map(d => {
    const all = S.items.filter(i => i.dim === d), sh = all.filter(vis); if (!sh.length) return '';
    return `<details class="dim" data-dim="${esc(d)}" ${filt || S.openDims.has(d) ? 'open' : ''}><summary><span class="caret">▶</span><span class="t">${esc(d)}</span>
      <span class="pct">${done(all)}/${counted(all).length} · ${pct(all)}%</span><span class="bar"><i style="width:${pct(all)}%"></i></span></summary>
      <div class="items">${sh.map(itemHTML).join('')}</div></details>`;
  }).join('') || '<div class="empty">Nenhum critério encontrado com esses filtros.</div>';
  el.querySelectorAll('details.dim').forEach(d => d.addEventListener('toggle', () => d.open ? S.openDims.add(d.dataset.dim) : S.openDims.delete(d.dataset.dim)));
}
function chipsHTML(i) {
  return LETTERS.map(k => {
    const ok = isOk(i, k);
    if (ok === null) return `<span class="flag na" title="${FL[k]}: não se aplica — não precisa ser preenchido">${k}</span>`;
    return `<button type="button" class="flag ${ok ? 'atende' : 'nao'}" data-flag="${k}" data-stop ${canEdit() ? '' : 'disabled'} aria-pressed="${ok}" title="${FL[k]}: ${ok ? 'atende' : 'não atende'} — clique para alternar verde/vermelho">${k}</button>`;
  }).join('');
}
function itemHTML(i) {
  const t = i.t, open = S.openItems.has(i.id), resp = nomeDe(t.responsavel_id);
  return `<div class="item ${open ? 'open' : ''}" data-id="${i.id}"><div class="head" data-toggle><span class="num">${esc(i.n)}</span>
    <div><div class="title">${esc(i.c)}</div><div class="meta"><span class="pill ${slug(i.e)}">${esc(i.e)}</span>${chipsHTML(i)}
    ${resp ? `<span>Resp.: ${esc(resp)}</span>` : ''}${t.prazo ? `<span>Prazo: ${fmtDate(t.prazo)}</span>` : ''}${t.notas ? '<span class="tag">Notas</span>' : ''}</div></div>
    <div class="st ${t.status}" data-stop><select data-status ${canEdit() ? '' : 'disabled'} aria-label="Status do critério ${esc(i.n)}">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${t.updated_by_nome ? `<small>${esc(t.updated_by_nome)} · ${fmtTs(t.updated_at)}</small>` : ''}</div></div>
    <div class="detail">${open ? detailHTML(i) : ''}</div></div>`;
}
function detailHTML(i) {
  const t = i.t, ro = canEdit() ? '' : 'disabled';
  return `<h4>Subcritérios — defina a situação de cada um</h4>
  <div class="subs">${LETTERS.map(k => { const cur = effFlag(i, k);
    const seg = (v, label) => `<button type="button" data-flag="${k}" data-val="${v}" class="${cur === v ? 'on ' + v : ''}" aria-pressed="${cur === v}" ${ro}>${label}</button>`;
    return `<div class="subrow"><span class="subname"><b class="${cur}">${k}</b>${FL[k]}</span><span class="seg">${cur === 'n' ? '<span class="na-note">Não se aplica — não precisa ser preenchido</span>' : seg('g', 'Atende') + seg('r', 'Não atende')}</span></div>`; }).join('')}</div>
  <div class="grid2"><div><h4>Responsável</h4><select data-f="responsavel_id" ${ro}><option value="">— sem responsável —</option>${S.profiles.map(u => `<option value="${u.id}" ${u.id === t.responsavel_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
  <div><h4>Prazo</h4><input type="date" data-f="prazo" value="${t.prazo || ''}" ${ro}></div></div>
  <h4>Link da correção / evidência</h4><input type="text" data-f="link" value="${esc(t.link)}" placeholder="https://…" ${ro}>
  <h4>Notas</h4><textarea data-f="notas" ${ro}>${esc(t.notas)}</textarea>
  ${ro ? '' : '<div class="actions"><button class="btn primary" data-save>Salvar</button></div>'}
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
  const tmp = document.createElement('div'); tmp.innerHTML = itemHTML(i); el.replaceWith(tmp.firstElementChild);
  const n = $(`.item[data-id="${i.id}"]`); if (S.openItems.has(i.id)) loadHistory($('[data-hist]', n), i.id);
  const all = S.items.filter(x => x.dim === i.dim), d = n.closest('details.dim');
  $('.pct', d).textContent = `${done(all)}/${counted(all).length} · ${pct(all)}%`; $('.bar i', d).style.width = pct(all) + '%';
}
document.addEventListener('click', e => {
  const el = e.target.closest('.item'); if (!el || !S.me) return;
  const i = S.items.find(x => x.id === +el.dataset.id); if (!i) return;
  const fl = e.target.closest('[data-flag]');
  if (fl) {
    if (fl.disabled) return;
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
document.addEventListener('change', e => {
  if (!e.target.matches('[data-status]')) return;
  const i = S.items.find(x => x.id === +e.target.closest('.item').dataset.id); if (i) patchTask(i, { status: e.target.value }, true);
});

// ---------- administração ----------
async function zerar() {
  const op = await choose('Zerar progresso', `Apaga status, letras D A S G F, responsáveis, prazos, notas e links de <b>todos os ${S.items.length} critérios do ciclo ${S.ciclo}</b>, para toda a equipe. Não dá para desfazer.`,
    [{ v: 'tudo', label: 'Limpar tudo (todos pendentes e vermelhos)', cls: 'danger' }, { v: 'csv', label: 'Voltar ao resultado da validação do CSV' }]);
  if (!op) return;
  const agora = new Date().toISOString();
  const rows = S.items.map(i => ({ criterio_id: i.id, status: op === 'tudo' ? 'pendente' : (baseOk(i.f) ? 'concluido' : 'pendente'), responsavel_id: null, prazo: null, notas: '', link: '',
    sub_state: op === 'tudo' ? LETTERS.filter(k => i.f[k] === 'atende' || i.f[k] === 'não atende').map(k => k + ':r').join(',') : '', updated_by_nome: S.me.nome, updated_at: agora }));
  const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'criterio_id' });
  if (error) return toast('Erro ao zerar: ' + error.message);
  rows.forEach(r => { S.items.find(i => i.id === r.criterio_id).t = r; });
  S.openItems.clear(); S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim));
  S.f = { q: '', dim: '', exig: '', status: '', resp: '', onlyMine: false }; shell(); window.scrollTo(0, 0); toast('Progresso zerado');
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
    novo.push({ ciclo: parseInt(get(r, 'ciclo'), 10) || S.ciclo || new Date().getFullYear(), ordem: novo.length, dimensao: get(r, 'dimensao'), num: m[1], criterio: m[2], exigibilidade: get(r, 'exigibilidade'),
      disp: get(r, 'disponibilidade'), atual: get(r, 'atualidade'), serie: get(r, 'serie historica'), grav: get(r, 'gravacao de relatorios'), filtros: get(r, 'filtros de pesquisa'),
      evidencias: get(r, 'evidencia').split(/\s+/).filter(Boolean) });
  });
  if (!novo.length) return toast('Nenhum critério encontrado no CSV.');
  const ciclos = [...new Set(novo.map(r => r.ciclo))];
  if (!await ask('Importar CSV', `<b>${novo.length}</b> critérios do ciclo <b>${ciclos.join(', ')}</b> em <b>${new Set(novo.map(r => r.dimensao)).size}</b> dimensões. Critérios com o mesmo número são atualizados e <b>mantêm o andamento</b>; os novos começam pelo resultado da validação.`, 'Importar')) return;
  const { data, error } = await sb.from('criteria').upsert(novo, { onConflict: 'ciclo,num' }).select('id,disp,atual,serie,grav,filtros');
  if (error) return toast('Erro ao importar: ' + error.message);
  const tasks = data.map(r => ({ criterio_id: r.id, status: baseOk({ D: r.disp, A: r.atual, S: r.serie, G: r.grav, F: r.filtros }) ? 'concluido' : 'pendente' }));
  const t = await sb.from('tasks').upsert(tasks, { onConflict: 'criterio_id', ignoreDuplicates: true });
  if (t.error) return toast('Critérios importados, mas falhou criar o andamento: ' + t.error.message);
  S.ciclo = ciclos[0]; S.openItems.clear(); await loadData(); S.openDims = new Set(S.items.filter(i => i.t.status === 'pendente').map(i => i.dim)); shell(); toast(`${novo.length} critérios importados`);
}
function exportCSV() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, N = { g: 'atende', r: 'não atende', n: 'não se aplica' };
  const L = ['Dimensão', 'Critério', 'Descrição', 'Exigibilidade', 'D', 'A', 'S', 'G', 'F', 'Status', 'Responsável', 'Prazo', 'Notas', 'Link', 'Atualizado por', 'Atualizado em'];
  const r = S.items.map(i => [i.dim, i.n, i.c, i.e, ...LETTERS.map(k => N[effFlag(i, k)]), ST[i.t.status], nomeDe(i.t.responsavel_id), i.t.prazo, i.t.notas, i.t.link, i.t.updated_by_nome, i.t.updated_at].map(q).join(';'));
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + [L.map(q).join(';'), ...r].join('\r\n')], { type: 'text/csv' })), download: `checklist-${S.ciclo}.csv` }); a.click();
}
async function openUsuarios() {
  const { data, error } = await sb.from('profiles').select('id,nome,email,role,created_at').order('created_at');
  if (error) return toast(error.message);
  const m = modal(`<h2>Usuários</h2><table><tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr>
    ${data.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td><select data-role="${u.id}" style="width:auto" ${u.id === S.me.id ? 'disabled title="Você não pode alterar o próprio perfil"' : ''}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</table>
    <p class="who" style="margin-top:12px">Novas contas entram como “Somente leitura”. <b>Editor</b> altera o checklist; <b>Administrador</b> também importa CSV, zera o progresso e gerencia usuários. Para excluir um usuário, use o painel do Supabase (Authentication → Users).</p>
    <div class="actions"><button class="btn" id="uc">Fechar</button></div>`);
  $('#uc', m.el).onclick = m.close;
  m.el.addEventListener('change', async e => {
    const id = e.target.dataset.role; if (!id) return;
    const { error } = await sb.from('profiles').update({ role: e.target.value }).eq('id', id);
    if (error) return toast('Erro: ' + error.message);
    toast('Perfil atualizado'); const p = S.profiles.find(x => x.id === id); if (p) p.role = e.target.value;
  });
}
function openConta() {
  const m = modal(`<h2>Minha conta</h2><div class="form"><label>E-mail</label><input type="text" value="${esc(S.me.email)}" disabled>
    <label for="cn">Nome</label><input id="cn" type="text" value="${esc(S.me.nome)}">
    <label for="cp">Nova senha (deixe em branco para manter)</label><input id="cp" type="password" autocomplete="new-password" minlength="8">
    <div class="err" id="ce"></div><div class="actions"><button class="btn primary" id="cs">Salvar</button><button class="btn" id="cc">Cancelar</button></div></div>`);
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
  const m = modal(`<h2>Definir nova senha</h2><div class="form"><label for="np">Nova senha (mín. 8 caracteres)</label><input id="np" type="password" autocomplete="new-password" minlength="8">
    <div class="err" id="ne"></div><div class="actions"><button class="btn primary" id="ns">Salvar</button></div></div>`);
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
    if (ev === 'SIGNED_OUT') { S.me = null; S.openItems.clear(); if (S.channel) { sb.removeChannel(S.channel); S.channel = null; } renderAuth(); }
    else if (ev === 'PASSWORD_RECOVERY') setTimeout(openRecuperacao, 300);
    else if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') && session && !S.me) setTimeout(() => boot(session.user), 0);
  });
  const { data } = await sb.auth.getSession();
  if (!data.session) renderAuth();
  document.addEventListener('visibilitychange', async () => {   // ao voltar para a aba, sincroniza (caso o tempo real tenha caído)
    if (document.hidden || !S.me || S.openItems.size || document.querySelector('.overlay')) return;
    try { await loadData(); renderSummary(); renderList(); } catch {}
  });
})();
