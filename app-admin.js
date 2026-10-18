/* =====================================================================
   LIZ CAKESHOP - Panel administrativo (Supabase)
   1) Conexión  2) Utilidades  3) Sesión y rol  4) Datos (SELECT)
   5) Vistas  6) Modales  7) Altas / Cambios / Bajas  8) Eventos
   ===================================================================== */
'use strict';

/* ---------- 1) Conexión (pega tu publishable key; NUNCA la secret) ---------- */
const SUPABASE_URL = 'https://qakkmauzrkbnoivjktup.supabase.co';
const SUPABASE_KEY = 'PEGA_AQUI_TU_PUBLISHABLE_KEY';
const BUCKET = 'Productos';                       // bucket de fotos (respeta mayúsculas)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- 2) Utilidades ---------- */
const $ = (s, c = document) => c.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mxn = (n) => `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)} MXN`;
const num = (n) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => (k === 'class' ? (n.className = v) : k === 'text' ? (n.textContent = v) : n.setAttribute(k, v)));
  kids.forEach((x) => x && n.append(x));
  return n;
};
let tTimer;
function toast(t) {
  const e = $('#toast'); e.textContent = t; e.classList.add('visible');
  clearTimeout(tTimer); tTimer = setTimeout(() => e.classList.remove('visible'), 2400);
}
/** foto_url puede ser una URL completa o solo el nombre del archivo en el bucket */
function urlFoto(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  return /^https?:\/\//i.test(v) ? v : db.storage.from(BUCKET).getPublicUrl(v.trim()).data.publicUrl;
}
// Estado de inventario (misma regla que la base: crítico <= 50% del mínimo)
const estIns = (i) => (i.stock_actual <= i.stock_minimo * 0.5 ? ['Crítico', 'crit'] : i.stock_actual <= i.stock_minimo ? ['Bajo stock', 'bajo'] : ['En stock', 'ok']);
const estProd = (p) => (p.stock <= 0 ? ['Sin stock', 'crit'] : p.stock <= p.stock_minimo ? ['Bajo stock', 'bajo'] : null);
const buscar = (lista, id) => lista.find((x) => String(x.id) === String(id));

/* ---------- 3) Sesión y rol ---------- */
let yo, esAdmin = false, vista = 'inicio';
let roles = [], categorias = [], insumos = [], productos = [], usuarios = [];

async function iniciar() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.replace('login.html');           // sin sesión -> login

  const { data: perfil, error } = await db.from('usuarios')
    .select('id, nombre_completo, activo, roles(nombre)').eq('id', session.user.id).maybeSingle();
  if (error || !perfil || !perfil.activo) { await db.auth.signOut(); return location.replace('login.html'); }

  yo = perfil;
  esAdmin = perfil.roles?.nombre === 'Administrador';
  $('#u-nombre').textContent = `${perfil.nombre_completo.split(' ').slice(0, 2).join(' ')} | ${esAdmin ? 'Admin' : 'Empleado'}`;
  $('[data-vista="usuarios"]').hidden = !esAdmin;                // Empleado: sin pestaña Usuarios
  document.body.classList.remove('cargando');
  await cargar();
  ir('inicio');
}

/* ---------- 4) Datos (SELECT) ---------- */
async function cargar() {
  const r = await Promise.all([
    db.from('roles').select('id, nombre'),
    db.from('categorias_insumos').select('id, nombre').order('nombre'),
    db.from('insumos').select('*, categorias_insumos(nombre)').order('nombre'),
    db.from('productos').select('*').order('nombre'),
    esAdmin ? db.from('usuarios').select('id, nombre_completo, username, activo, rol_id, roles(nombre)').order('nombre_completo') : Promise.resolve({ data: [] }),
  ]);
  const falla = r.find((x) => x.error);
  if (falla) { console.error(falla.error); toast('No se pudieron cargar algunos datos.'); }
  [roles, categorias, insumos, productos, usuarios] = r.map((x) => x.data || []);
}
const recargar = async () => { await cargar(); ir(vista); };

/* ---------- 5) Vistas ---------- */
const buscador = (txt) => `<label class="buscador"><span aria-hidden="true">🔍</span><input id="buscar" type="search" placeholder="Buscar" aria-label="${txt}"></label>`;
const barra = (n, v) => `<div class="barra-fila"><span>${esc(n)}</span><div class="barra"><i style="width:${v}%"></i></div><b>${v}%</b></div>`;

function vInicio() {
  const crit = insumos.filter((i) => estIns(i)[1] === 'crit').length;
  const bajos = productos.filter((p) => p.stock <= p.stock_minimo).length;
  const alertas = [
    ...insumos.filter((i) => i.stock_actual <= i.stock_minimo).map((i) => ({ t: 'Insumo', k: 'i', id: i.id, n: i.nombre, s: `${num(i.stock_actual)} ${i.unidad_medida}`, rojo: estIns(i)[1] === 'crit', a: 'Surtir' })),
    ...productos.filter((p) => p.stock <= p.stock_minimo).map((p) => ({ t: 'Producto', k: 'p', id: p.id, n: p.nombre, s: `${p.stock} un`, rojo: p.stock <= 0, a: 'Producir' })),
  ];
  const total = insumos.reduce((s, i) => s + Number(i.stock_actual), 0) || 1;
  const top = [...insumos].sort((a, b) => b.stock_actual - a.stock_actual).slice(0, 3);
  const porCat = {};
  insumos.forEach((i) => { const c = i.categorias_insumos?.nombre || 'Sin categoría'; porCat[c] = (porCat[c] || 0) + Number(i.stock_actual); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const filas = alertas.map((a) => `<tr><td>${a.t}</td><td>${esc(a.n)}</td><td>${esc(a.s)}</td>
    <td><button class="pill ${a.rojo ? 'rojo' : ''}" data-a="ajustar" data-k="${a.k}" data-id="${a.id}">${a.a}</button></td></tr>`).join('');

  return `<div class="cab">
    <h1>¡Hola, ${esc(yo.nombre_completo.split(' ')[0])}! 👋<br>Resumen del sistema al día de hoy:</h1>
    <div class="kpis">
      <div class="kpi">Insumos críticos<b>${crit} items</b></div>
      <div class="kpi">Productos bajos en stock<b>${bajos} items</b></div>
      ${esAdmin ? `<div class="kpi">Usuarios activos<b>${usuarios.filter((u) => u.activo).length} usuarios</b></div>` : ''}
    </div>
    <button class="btn" data-a="ajustar">+ Ajustar Stock</button>
  </div>
  <div class="medio">
    <section class="card"><h3>⚠️ Alertas de atención urgente:</h3>
      <table class="alertas"><thead><tr><th>Tipo</th><th>Elemento</th><th>Estado</th><th>Acción</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="4">¡Todo en orden! No hay alertas.</td></tr>'}</tbody></table></section>
    <section class="card fecha"><h3>🗓️ ${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))}</h3><b>Última actualización:</b>${ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</section>
    <section class="card acciones-rapidas"><h3>Acciones rápidas:</h3>
      <button class="btn" data-a="nuevo-i">+ Nuevo insumo</button><button class="btn" data-a="nuevo-p">+ Nuevo producto</button>
      ${esAdmin ? '<button class="btn" data-a="ir" data-v="usuarios">Ver usuarios</button>' : ''}</section>
  </div>
  <div class="bajo">
    <section class="card"><h3>Insumos con más existencias:</h3>${top.map((i) => barra(i.nombre, Math.round((i.stock_actual / total) * 100))).join('') || 'Sin datos'}
      <p class="nota">Porcentaje sobre el total de existencias registradas.</p></section>
    <section class="card"><h3>Categorías con más stock:</h3>${cats.map(([n, v]) => barra(n, Math.round((v / total) * 100))).join('') || 'Sin datos'}</section>
  </div>`;
}

function vInsumos() {
  const filas = insumos.map((i) => {
    const [t, c] = estIns(i); const cat = i.categorias_insumos?.nombre || '—';
    return `<tr data-q="${esc(`${i.nombre} ${cat}`.toLowerCase())}"><td>${esc(i.nombre)}</td><td>${esc(cat)}</td>
      <td><span class="stepper"><button data-a="menos-i" data-id="${i.id}" aria-label="Quitar uno">−</button>${num(i.stock_actual)} ${esc(i.unidad_medida)}<button data-a="mas-i" data-id="${i.id}" aria-label="Agregar uno">+</button></span></td>
      <td><span class="chip ${c}">${t}</span></td>
      <td><button class="mas" data-a="menu-i" data-id="${i.id}" aria-label="Opciones de ${esc(i.nombre)}">⋮</button></td></tr>`;
  }).join('');
  return `<div class="herr">${buscador('Buscar insumos')}<button class="mas-btn" data-a="menu-nuevo" aria-label="Agregar insumo o categoría">+</button></div>
    <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Insumo</th><th>Categoría</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
    <tbody>${filas || '<tr><td colspan="5">Aún no hay insumos. Usa el botón +.</td></tr>'}</tbody></table></div>`;
}

function vProductos() {
  const tarjetas = productos.map((p) => {
    const e = estProd(p); const f = urlFoto(p.foto_url);
    return `<article class="tarjeta" data-q="${esc(p.nombre.toLowerCase())}">${e ? `<span class="insignia ${e[1]}">${e[0]}</span>` : ''}
      <div class="foto">${f ? `<img src="${esc(f)}" alt="${esc(p.nombre)}" loading="lazy">` : '🍰'}</div>
      <div class="t-cuerpo"><h3>${esc(p.nombre)}</h3><p>Stock: ${p.stock} unidades</p><p class="precio">${mxn(p.precio_mxn)}</p>
        <span class="stepper rosa"><button data-a="menos-p" data-id="${p.id}" aria-label="Quitar uno">−</button>${p.stock}<button data-a="mas-p" data-id="${p.id}" aria-label="Agregar uno">+</button></span></div>
      <button class="mas" data-a="menu-p" data-id="${p.id}" aria-label="Opciones de ${esc(p.nombre)}">⋮</button></article>`;
  }).join('');
  return `<div class="herr">${buscador('Buscar productos')}<button class="mas-btn" data-a="nuevo-p" aria-label="Nuevo producto">+</button></div>
    <div class="grid">${tarjetas || '<p>Aún no hay productos.</p>'}</div>`;
}

function vUsuarios() {
  const tarjetas = usuarios.map((u) => `<article class="card u-card" data-q="${esc(`${u.nombre_completo} ${u.username}`.toLowerCase())}">
    <div class="u-av">👤<i class="${u.activo ? '' : 'off'}"></i></div>
    <div class="u-info"><b>${esc(u.roles?.nombre || 'Sin rol')}</b><br>Nombre: ${esc(u.nombre_completo)}<br>User name: ${esc(u.username)}</div>
    <button class="btn" data-a="edit-u" data-id="${u.id}">Editar</button></article>`).join('');
  return `<div class="herr">${buscador('Buscar usuarios')}<button class="mas-btn" data-a="nuevo-u" aria-label="Agregar usuario">+</button></div><div class="usuarios">${tarjetas}</div>`;
}

function ir(v) {
  if (v === 'usuarios' && !esAdmin) v = 'inicio';                // protección de la vista
  vista = v;
  document.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('activa', b.dataset.vista === v));
  const y = window.scrollY;
  $('#vista').innerHTML = { inicio: vInicio, insumos: vInsumos, productos: vProductos, usuarios: vUsuarios }[v]();
  window.scrollTo(0, y);
}

/* ---------- 6) Modales ---------- */
const campo = (t, i) => el('label', {}, t, i);
const entrada = (name, type, val, extra = {}) => el('input', { name, type, value: val ?? '', ...extra });
function sel(name, opciones, actual) {
  const s = el('select', { name });
  opciones.forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if (String(v) === String(actual)) o.selected = true; s.append(o); });
  return s;
}
/** Modal con formulario. alAceptar(FormData) puede lanzar Error para mostrar un mensaje. */
function modal(titulo, campos, alAceptar, textoOk = 'Aceptar') {
  const dlg = el('dialog');
  const err = el('p', { class: 'err', role: 'alert' });
  const ok = el('button', { type: 'submit', class: 'btn-azul', text: textoOk });
  const cerrar = el('button', { type: 'button', class: 'btn-azul', text: 'Cerrar' });
  const form = el('form', { class: 'form' }, el('h2', { text: titulo }), ...campos, err, el('div', { class: 'acciones' }, ok, cerrar));
  cerrar.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); ok.disabled = true; err.textContent = '';
    try { await alAceptar(new FormData(form)); dlg.close(); } catch (x) { err.textContent = x.message; ok.disabled = false; }
  });
  dlg.append(form); document.body.append(dlg); dlg.showModal();
}
function opciones(titulo, lista) {
  const dlg = el('dialog');
  const cerrar = el('button', { type: 'button', class: 'btn-azul', text: 'Cerrar' });
  cerrar.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  dlg.append(el('h2', { text: titulo }), el('div', { class: 'opciones' }, ...lista.map(([t, fn]) => {
    const b = el('button', { type: 'button', text: t });
    b.addEventListener('click', () => { dlg.close(); fn(); });
    return b;
  })), el('div', { class: 'acciones' }, cerrar));
  document.body.append(dlg); dlg.showModal();
}
const confirmar = (texto, fn) => modal('Confirmar', [el('p', { text: texto })], fn, 'Eliminar');

/* ---------- 7) Altas (INSERT), Cambios (UPDATE) y Bajas (DELETE) ---------- */
async function run(promesa) {
  const { error } = await promesa;
  if (!error) return;
  console.error(error);
  throw new Error(error.code === '42501' ? 'No tienes permiso para esta acción.'
    : error.code === '23505' ? 'Ya existe un registro con ese dato.' : 'No se pudo guardar. Inténtalo de nuevo.');
}
async function borrar(tabla, id) { await run(db.from(tabla).delete().eq('id', id)); await recargar(); toast('Eliminado'); }

async function cambiarStock(tabla, lista, campoStock, id, delta) {
  const x = buscar(lista, id); if (!x) return;
  const nuevo = Math.max(0, Number(x[campoStock]) + delta);
  const { error } = await db.from(tabla).update({ [campoStock]: nuevo }).eq('id', id);
  if (error) { console.error(error); return toast('No se pudo actualizar el stock.'); }
  x[campoStock] = nuevo; ir(vista);
}

function formInsumo(i) {
  modal(i ? 'Editar insumo' : 'Agregar insumo', [
    campo('Nombre del insumo:', entrada('nombre', 'text', i?.nombre, { required: '', maxlength: 120 })),
    campo('Categoría:', sel('categoria_id', categorias.map((c) => [c.id, c.nombre]), i?.categoria_id)),
    campo('Unidad de medida:', sel('unidad_medida', ['kg', 'g', 'L', 'ml', 'pza'].map((u) => [u, u]), i?.unidad_medida)),
    campo('Stock actual:', entrada('stock_actual', 'number', i?.stock_actual ?? 0, { min: 0, step: 'any', required: '' })),
    campo('Stock mínimo:', entrada('stock_minimo', 'number', i?.stock_minimo ?? 0, { min: 0, step: 'any', required: '' })),
  ], async (f) => {
    const d = { nombre: f.get('nombre').trim(), categoria_id: Number(f.get('categoria_id')) || null, unidad_medida: f.get('unidad_medida'),
                stock_actual: Number(f.get('stock_actual')), stock_minimo: Number(f.get('stock_minimo')) };
    if (!d.nombre) throw new Error('Escribe el nombre.');
    await run(i ? db.from('insumos').update(d).eq('id', i.id) : db.from('insumos').insert(d));
    await recargar(); toast('Insumo guardado');
  });
}
function formCategoria() {
  modal('Agregar categoría', [campo('Nombre de la categoría:', entrada('nombre', 'text', '', { required: '', maxlength: 80 }))], async (f) => {
    await run(db.from('categorias_insumos').insert({ nombre: f.get('nombre').trim() }));
    await recargar(); toast('Categoría guardada');
  });
}
function formProducto(p) {
  const actual = urlFoto(p?.foto_url);
  modal(p ? 'Editar producto' : 'Agregar producto', [
    campo('Nombre del producto: *', entrada('nombre', 'text', p?.nombre, { required: '', maxlength: 120 })),
    campo('Precio en pesos MXN: *', entrada('precio_mxn', 'number', p?.precio_mxn, { required: '', min: 0, step: '0.01' })),
    campo('Stock en almacén:', entrada('stock', 'number', p?.stock ?? 0, { required: '', min: 0, step: '1' })),
    campo('Stock mínimo para tener en almacén: *', entrada('stock_minimo', 'number', p?.stock_minimo ?? 0, { required: '', min: 0, step: '1' })),
    campo('Fotografía del producto:', entrada('foto', 'file', '', { accept: 'image/*' })),
    actual ? el('p', { class: 'ayuda', text: 'Ya tiene foto. Sube otra solo si quieres cambiarla.' }) : null,
    campo('Notas:', el('textarea', { name: 'notas', rows: '2', maxlength: '500', text: p?.notas || '' })),
  ], async (f) => {
    let foto_url = p?.foto_url ?? null;
    const archivo = f.get('foto');
    if (archivo && archivo.size) {                              // subir foto a Storage
      if (!archivo.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
      if (archivo.size > 5 * 1024 * 1024) throw new Error('La foto pesa más de 5 MB.');
      const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const nombre = `${Date.now()}.${ext}`;
      const { error } = await db.storage.from(BUCKET).upload(nombre, archivo, { contentType: archivo.type });
      if (error) { console.error(error); throw new Error('No se pudo subir la foto. Revisa las políticas de Storage.'); }
      foto_url = nombre;
    }
    const d = { nombre: f.get('nombre').trim(), precio_mxn: Number(f.get('precio_mxn')), stock: Math.round(Number(f.get('stock'))),
                stock_minimo: Math.round(Number(f.get('stock_minimo'))), notas: f.get('notas').trim() || null, foto_url };
    await run(p ? db.from('productos').update(d).eq('id', p.id) : db.from('productos').insert(d));
    await recargar(); toast('Producto guardado');
  });
}
/** Ajustar stock: desde "+ Ajustar Stock" (elige el elemento) o desde Surtir / Producir */
function formAjuste(pre) {
  const lista = [...insumos.map((i) => [`i:${i.id}`, `Insumo · ${i.nombre} (${num(i.stock_actual)} ${i.unidad_medida})`]),
                 ...productos.map((p) => [`p:${p.id}`, `Producto · ${p.nombre} (${p.stock} un)`])];
  modal('Ajustar stock', [
    campo('Elemento:', sel('item', lista, pre)),
    campo('Nueva cantidad en existencia:', entrada('cantidad', 'number', '', { required: '', min: 0, step: 'any' })),
  ], async (f) => {
    const [k, id] = f.get('item').split(':'); const v = Number(f.get('cantidad'));
    if (!(v >= 0)) throw new Error('Escribe una cantidad válida.');
    await run(db.from(k === 'i' ? 'insumos' : 'productos').update({ [k === 'i' ? 'stock_actual' : 'stock']: k === 'i' ? v : Math.round(v) }).eq('id', id));
    await recargar(); toast('Stock actualizado');
  });
}
function formUsuario(u) {
  const yoMismo = u && u.id === yo.id;                           // evitar que el admin se bloquee a sí mismo
  const chk = el('input', { type: 'checkbox', name: 'activo' });
  chk.checked = u ? u.activo : true; chk.disabled = !!yoMismo;
  modal(u ? 'Editar usuario' : 'Agregar usuario', [
    u ? null : el('p', { class: 'ayuda', text: 'Primero crea la cuenta en Supabase (Authentication > Users) y pega aquí su UUID para darle acceso al panel.' }),
    u ? null : campo('UUID de la cuenta:', entrada('id', 'text', '', { required: '', pattern: '[0-9a-fA-F\\-]{36}' })),
    campo('Nombre completo:', entrada('nombre_completo', 'text', u?.nombre_completo, { required: '', maxlength: 120 })),
    campo('Correo o nombre de usuario:', entrada('username', 'text', u?.username, { required: '', maxlength: 200 })),
    campo('Rol:', Object.assign(sel('rol_id', roles.map((r) => [r.id, r.nombre]), u?.rol_id), yoMismo ? { disabled: true } : {})),
    el('label', { class: 'chk' }, chk, 'Cuenta activa'),
  ], async (f) => {
    const d = { nombre_completo: f.get('nombre_completo').trim(), username: f.get('username').trim() };
    if (!yoMismo) { d.rol_id = Number(f.get('rol_id')); d.activo = f.get('activo') === 'on'; }
    await run(u ? db.from('usuarios').update(d).eq('id', u.id) : db.from('usuarios').insert({ id: f.get('id').trim(), ...d }));
    await recargar(); toast('Usuario guardado');
  });
}

/* ---------- 8) Eventos ---------- */
const menuFila = (tabla, lista, form, id) => {
  const x = buscar(lista, id);
  opciones(x.nombre, [['Editar', () => form(x)], ...(esAdmin ? [['Eliminar', () => confirmar(`¿Eliminar "${x.nombre}"? Esta acción no se puede deshacer.`, () => borrar(tabla, id))]] : [])]);
};
const ACCIONES = {
  ir: (_, b) => ir(b.dataset.v),
  'mas-i': (id) => cambiarStock('insumos', insumos, 'stock_actual', id, 1),
  'menos-i': (id) => cambiarStock('insumos', insumos, 'stock_actual', id, -1),
  'mas-p': (id) => cambiarStock('productos', productos, 'stock', id, 1),
  'menos-p': (id) => cambiarStock('productos', productos, 'stock', id, -1),
  'nuevo-i': () => formInsumo(),
  'nuevo-p': () => formProducto(),
  'nuevo-u': () => formUsuario(),
  'edit-u': (id) => formUsuario(buscar(usuarios, id)),
  'menu-nuevo': () => opciones('Agregar', [['Agregar insumo', () => formInsumo()], ['Agregar categoría', formCategoria]]),
  'menu-i': (id) => menuFila('insumos', insumos, formInsumo, id),
  'menu-p': (id) => menuFila('productos', productos, formProducto, id),
  ajustar: (id, b) => formAjuste(id ? `${b.dataset.k}:${id}` : ''),
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (b && ACCIONES[b.dataset.a]) ACCIONES[b.dataset.a](b.dataset.id, b);
});
// Búsqueda en tiempo real (filtra filas / tarjetas)
document.addEventListener('input', (e) => {
  if (e.target.id !== 'buscar') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#vista [data-q]').forEach((n) => { n.hidden = !n.dataset.q.includes(q); });
});
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-vista]'); if (b) ir(b.dataset.vista); });
$('#btn-salir').addEventListener('click', async () => { await db.auth.signOut(); location.replace('login.html'); });

iniciar();