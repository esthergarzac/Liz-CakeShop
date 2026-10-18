/* =====================================================================
   LIZ CAKESHOP - Lógica de la landing page (JavaScript vanilla)
   Secciones: 1) Supabase  2) Utilidades  3) Catálogo  4) Carrito
              5) Detalle de producto  6) Contacto  7) Chat  8) Menú
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   1) CONEXIÓN CON SUPABASE
   Pega tu Project URL y tu publishable (o anon) key. Están en:
   Supabase > Project Settings > API Keys.
   NUNCA pongas aquí la "secret" ni la "service_role" key.
--------------------------------------------------------------------- */
const SUPABASE_URL = 'https://qakkmauzrkbnoivjktup.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tB8MgKD6HINhXzG2CgmcAA_G2zq6kDI';

// "supabase" viene del script del CDN cargado en index.html
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------------------------------------------------------------------
   2) UTILIDADES
--------------------------------------------------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const formatoMXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const mxn = (n) => `${formatoMXN.format(n)} MXN`;

/** Crea un elemento con texto seguro (textContent evita inyección de HTML). */
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') nodo.className = v;
    else if (k === 'text') nodo.textContent = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else nodo.setAttribute(k, v);
  });
  hijos.forEach((h) => h && nodo.append(h));
  return nodo;
}

/**
 * Devuelve la URL de la foto de un producto. En la columna foto_url puedes guardar:
 *  - una URL completa (https://...), o
 *  - solo el nombre del archivo del bucket "productos" (ej. "cinnamon-mango.jpg").
 */
function urlFoto(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const v = valor.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return db.storage.from('Productos').getPublicUrl(v).data.publicUrl;
}

/** Imagen del producto, o un recuadro rosa con emoji si no hay foto. */
function crearFoto(url, alt) {
  const fig = el('figure', { class: 'foto' });
  const fuente = urlFoto(url);
  if (fuente) {
    const img = el('img', { src: fuente, alt, loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(el('div', { class: 'sin-foto', text: '🍰' })));
    fig.append(img);
  } else {
    fig.append(el('div', { class: 'sin-foto', text: '🍰' }));
  }
  return fig;
}

let toastTimer;
function mostrarToast(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 2200);
}

/** Estado de stock para la insignia de la tarjeta. */
function estadoStock(p) {
  if (p.stock <= 0) return { clase: 'sin', texto: 'Sin stock' };
  if (p.stock <= p.stock_minimo) return { clase: 'bajo', texto: 'Bajo stock' };
  return null;
}

/** Selector de cantidad  − 1 +  (devuelve el elemento y su API). */
function crearStepper(inicial, max, alCambiar) {
  let valor = inicial;
  const salida = el('output', { text: String(valor) });
  const menos = el('button', { type: 'button', 'aria-label': 'Quitar uno', text: '−' });
  const mas = el('button', { type: 'button', 'aria-label': 'Agregar uno', text: '+' });
  const refrescar = () => {
    salida.textContent = String(valor);
    menos.disabled = valor <= 1;
    mas.disabled = valor >= max;
  };
  menos.addEventListener('click', () => { valor -= 1; refrescar(); alCambiar(valor); });
  mas.addEventListener('click', () => { valor += 1; refrescar(); alCambiar(valor); });
  refrescar();
  return { nodo: el('div', { class: 'stepper' }, menos, salida, mas), obtener: () => valor };
}

/* ---------------------------------------------------------------------
   3) CATÁLOGO: SELECT a la tabla "productos"
   La política RLS solo deja ver productos con activo = true.
--------------------------------------------------------------------- */
let productos = [];

async function cargarProductos() {
  const grid = $('#grid-productos');
  const { data, error } = await db
    .from('productos')
    .select('id, nombre, precio_mxn, stock, stock_minimo, foto_url, notas')
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error al cargar productos:', error);
    grid.replaceChildren(el('p', { class: 'estado-carga', text: 'No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.' }));
    return;
  }
  productos = data;
  pintarCatalogo();
}

function pintarCatalogo() {
  const grid = $('#grid-productos');
  const q = $('#buscar').value.trim().toLowerCase();
  const lista = productos.filter((p) => p.nombre.toLowerCase().includes(q));

  if (!lista.length) {
    grid.replaceChildren(el('p', { class: 'estado-carga', text: q ? 'No encontramos postres con ese nombre.' : 'Pronto tendremos nuevos postres.' }));
    return;
  }

  grid.replaceChildren(...lista.map((p) => {
    const estado = estadoStock(p);
    const agotado = p.stock <= 0;

    const foto = crearFoto(p.foto_url, p.nombre);
    foto.addEventListener('click', () => abrirDetalle(p));

    const titulo = el('h3', { text: p.nombre });
    titulo.addEventListener('click', () => abrirDetalle(p));

    const boton = el('button', { type: 'button', class: 'btn', text: agotado ? 'Sin stock' : 'Agregar al carrito' });
    boton.disabled = agotado;
    boton.addEventListener('click', () => agregarAlCarrito(p, 1));

    return el('article', { class: 'tarjeta' },
      estado && el('span', { class: `insignia ${estado.clase}`, text: estado.texto }),
      foto,
      el('div', { class: 'tarjeta-cuerpo' }, titulo, el('p', { class: 'precio', text: mxn(p.precio_mxn) }), boton)
    );
  }));
}

/* ---------------------------------------------------------------------
   4) CARRITO (se guarda en localStorage para no perderlo al recargar)
--------------------------------------------------------------------- */
const CLAVE_CARRITO = 'liz_carrito';
let carrito = [];

try { carrito = JSON.parse(localStorage.getItem(CLAVE_CARRITO)) || []; } catch { carrito = []; }

function guardarCarrito() {
  try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito)); } catch { /* modo privado */ }
  const total = carrito.reduce((s, i) => s + i.cantidad, 0);
  $$('.contador').forEach((c) => { c.textContent = String(total); c.hidden = total === 0; });
}

function agregarAlCarrito(p, cantidad) {
  const existente = carrito.find((i) => i.id === p.id);
  const actual = existente ? existente.cantidad : 0;
  const nueva = Math.min(actual + cantidad, p.stock);   // no más que el stock disponible
  if (nueva === actual) { mostrarToast('Ya tienes todo el stock disponible en tu carrito'); return; }

  if (existente) existente.cantidad = nueva;
  else carrito.push({ id: p.id, nombre: p.nombre, precio: Number(p.precio_mxn), foto: p.foto_url, stock: p.stock, cantidad: nueva });

  guardarCarrito();
  mostrarToast(`${p.nombre} agregado al carrito`);
}

function pintarCarrito() {
  const cont = $('#carrito-items');
  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  $('#carrito-total').textContent = mxn(total);
  $('#carrito-siguiente').disabled = carrito.length === 0;
 

  if (!carrito.length) {
    cont.replaceChildren(el('p', { class: 'carrito-vacio', text: 'Tu carrito está vacío. Explora el catálogo y agrega tus favoritos.' }));
    return;
  }

  cont.replaceChildren(...carrito.map((item) => {
    const stepper = crearStepper(item.cantidad, item.stock, (n) => {
      item.cantidad = n; guardarCarrito(); pintarCarrito();
    });
    const quitar = el('button', { type: 'button', class: 'btn-quitar', 'aria-label': `Quitar ${item.nombre}` },
      (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
               s.setAttribute('aria-hidden', 'true');
               s.innerHTML = '<use href="#i-trash"/>'; return s; })());
    quitar.addEventListener('click', () => {
      carrito = carrito.filter((i) => i.id !== item.id); guardarCarrito(); pintarCarrito();
    });

    return el('div', { class: 'carrito-fila' },
      el('div', { class: 'carrito-prod' }, crearFoto(item.foto, item.nombre),
        el('div', {}, el('p', { text: item.nombre }), el('p', { text: mxn(item.precio) }))),
      el('div', { class: 'carrito-cant' }, stepper.nodo, quitar),
      el('span', { class: 'carrito-linea', text: formatoMXN.format(item.precio * item.cantidad) })
    );
  }));
}

function abrirCarrito() { pintarCarrito(); $('#dlg-carrito').showModal(); }

/** "Siguiente": manda el resumen del pedido al chat para cotizarlo con Liz. */
function continuarPedido() {
  const lineas = carrito.map((i) => `${i.cantidad} x ${i.nombre}`).join('; ');
  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  $('#dlg-carrito').close();
  abrirChat();
  const input = $('#chat-input');
  input.value = `Hola, quiero cotizar este pedido: ${lineas}. Total aproximado: ${mxn(total)}.`.slice(0, 500);
  input.focus();
}

/* ---------------------------------------------------------------------
   5) DETALLE DE PRODUCTO (modal)
--------------------------------------------------------------------- */
function abrirDetalle(p) {
  const dlg = $('#dlg-producto');
  const agotado = p.stock <= 0;

  const nuevaFoto = crearFoto(p.foto_url, p.nombre);
  $('#pd-img').closest('.foto').replaceWith(nuevaFoto);
  nuevaFoto.firstElementChild.id = 'pd-img';

  $('#pd-nombre').textContent = p.nombre;
  $('#pd-precio').textContent = formatoMXN.format(p.precio_mxn);
  $('#pd-notas').textContent = p.notas || '';

  const cont = $('#pd-stepper');
  const stepper = crearStepper(1, Math.max(p.stock, 1), () => {});
  cont.replaceChildren(agotado ? el('p', { text: 'Sin stock por ahora' }) : stepper.nodo);

  const btn = $('#pd-agregar');
  btn.disabled = agotado;
  btn.onclick = () => { agregarAlCarrito(p, stepper.obtener()); dlg.close(); };
  dlg.showModal();
}

/* ---------------------------------------------------------------------
   6) FORMULARIO DE CONTACTO: INSERT en "mensajes_contacto"
--------------------------------------------------------------------- */
$('#form-contacto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const estado = $('#contacto-estado');
  const boton = $('button[type="submit"]', form);

  if (!form.reportValidity()) return;
  const datos = new FormData(form);

  boton.disabled = true;
  estado.className = '';
  estado.textContent = 'Enviando…';

  const { error } = await db.from('mensajes_contacto').insert({
    nombre: datos.get('nombre').trim(),
    correo: datos.get('correo').trim(),
    mensaje: datos.get('mensaje').trim(),
    origen: 'contacto',
  });

  boton.disabled = false;
  if (error) {
    console.error('Error al enviar mensaje:', error);
    estado.className = 'error';
    estado.textContent = 'No pudimos enviar tu mensaje. Inténtalo de nuevo en un momento.';
    return;
  }
  estado.className = 'ok';
  estado.textContent = '¡Mensaje enviado! Te responderemos pronto.';
  form.reset();
});

/* ---------------------------------------------------------------------
   7) WIDGET DE CHAT
   Cada mensaje del visitante se guarda en "mensajes_contacto" con
   origen = 'chat'. Las respuestas de "Asistente" son una simulación.
--------------------------------------------------------------------- */
const panelChat = $('#chat-panel');
const logChat = $('#chat-log');
let mensajesEnviados = 0;
const idChat = Math.random().toString(36).slice(2, 7).toUpperCase();

const hora = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

function agregarMensaje(texto, propio) {
  const burbuja = el('div', { class: `msg${propio ? ' yo' : ''}` },
    el('small', { text: propio ? 'Tú' : 'Asistente Liz CakeShop' }),
    el('p', { text: texto }),
    el('time', { text: hora() })
  );
  logChat.append(burbuja);
  logChat.scrollTop = logChat.scrollHeight;
}

function abrirChat() {
  panelChat.hidden = false;
  $('#chat-toggle').setAttribute('aria-expanded', 'true');
  if (!logChat.children.length) {
    agregarMensaje('¡Hola! 👋 Bienvenido a Liz CakeShop. ¿Te gustaría cotizar un pastel personalizado o tienes alguna duda?', false);
  }
  $('#chat-input').focus();
}
function cerrarChat() {
  panelChat.hidden = true;
  $('#chat-toggle').setAttribute('aria-expanded', 'false');
}

$('#chat-toggle').addEventListener('click', () => (panelChat.hidden ? abrirChat() : cerrarChat()));
$('#chat-cerrar').addEventListener('click', cerrarChat);
$$('[data-abrir-chat]').forEach((b) => b.addEventListener('click', abrirChat));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panelChat.hidden) cerrarChat(); });

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const texto = input.value.trim();
  if (!texto) return;

  agregarMensaje(texto, true);
  input.value = '';
  mensajesEnviados += 1;

  const { error } = await db.from('mensajes_contacto').insert({
    nombre: `Chat ${idChat}`,
    mensaje: texto,
    origen: 'chat',
  });

  setTimeout(() => agregarMensaje(error
    ? 'No pudimos enviar tu mensaje. Inténtalo de nuevo o usa el formulario de contacto.'
    : respuestaBot(texto), false), 700);
});

/* ---------------------------------------------------------------------
   8) MENÚ, MODALES Y NAVEGACIÓN
--------------------------------------------------------------------- */
// Menú hamburguesa (móvil)
const menu = $('#menu');
$('#btn-menu').addEventListener('click', (e) => {
  const abierto = menu.classList.toggle('abierto');
  e.currentTarget.setAttribute('aria-expanded', String(abierto));
});
menu.addEventListener('click', (e) => { if (e.target.tagName === 'A') menu.classList.remove('abierto'); });

// Resaltar en el menú la sección visible
const enlaces = $$('.menu a');
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach((en) => {
    if (en.isIntersecting) {
      enlaces.forEach((a) => a.classList.toggle('activo', a.getAttribute('href') === `#${en.target.id}`));
    }
  });
}, { rootMargin: '-45% 0px -50% 0px' });
['inicio', 'nosotros', 'catalogo', 'contacto'].forEach((id) => observador.observe($(`#${id}`)));

// Abrir carrito desde cualquier botón de carrito
$$('[data-abrir-carrito]').forEach((b) => b.addEventListener('click', abrirCarrito));
$('#carrito-siguiente').addEventListener('click', () => abrirCheckout());

// Cerrar modales: botón "←" o clic en el fondo oscuro
$$('dialog.modal').forEach((dlg) => {
  $$('[data-cerrar]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
});

// Si una imagen estática no existe aún, ocultarla y dejar el fondo rosa
$$('.foto img').forEach((img) => img.addEventListener('error', () => { img.style.display = 'none'; }));

// Búsqueda en vivo
let filtrando = false;
$('#buscar').addEventListener('input', () => {
  const grid = $('#grid-productos');
  const y = window.scrollY;                       // recordar dónde estaba la pantalla
  if ($('#buscar').value.trim() && !filtrando) { grid.style.minHeight = `${grid.offsetHeight}px`; filtrando = true; }
  if (!$('#buscar').value.trim()) { grid.style.minHeight = ''; filtrando = false; }
  pintarCatalogo();
  window.scrollTo({ top: y, behavior: 'instant' });
});

// Inicio
guardarCarrito();
cargarProductos();