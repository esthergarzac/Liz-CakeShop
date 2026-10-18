/* =====================================================================
   CHATBOT de Liz CakeShop (respuestas por intención, sin costo ni servidor)
   Se carga DESPUÉS de app.js. Usa la lista "productos" cargada de Supabase.
   EDITA el objeto INFO con tus datos reales.
   ===================================================================== */

const INFO = {
  anticipacion: '3 días',
  horarios: 'Lunes a sábado de 9:00 a 18:00',          // <- CAMBIA por tu horario real
  ubicacion: 'Escobedo, China, General Bravo; Nuevo León',
  instagram: '@LIZ_CakeShop',
  tiktok: 'lizcakeshop',
};

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tiene = (t, lista) => lista.some((p) => t.includes(p));
const raiz = (w) => w.replace(/s$/, '');
let pasoCotizacion = null;   // 'fecha' -> 'detalle' -> 'contacto' -> null

/** Busca hasta 3 productos cuyo nombre comparta palabras con el mensaje */
function buscarProductos(t) {
  const palabras = t.split(/[^a-z0-9]+/).filter((w) => w.length > 3).map(raiz);
  return productos
    .map((p) => ({ p, n: norm(p.nombre).split(/[^a-z0-9]+/).map(raiz).filter((w) => w.length > 3 && palabras.includes(w)).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => x.p);
}

function lineaProducto(p) {
  const aviso = p.stock <= 0 ? ' (agotado por ahora)' : p.stock <= p.stock_minimo ? ' (quedan pocas piezas)' : '';
  return `• ${p.nombre}: ${mxn(p.precio_mxn)}${aviso}`;
}

function respuestaBot(texto) {
  const t = norm(texto);

  // Flujo guiado de cotización (si el visitante responde sin hacer otra pregunta)
  if (tiene(t, ['cancelar', 'olvidalo'])) { pasoCotizacion = null; return 'Sin problema. Si necesitas algo más, aquí estoy 😊'; }
  if (pasoCotizacion && !texto.includes('?')) {
    if (pasoCotizacion === 'fecha') { pasoCotizacion = 'detalle'; return 'Anotado. ¿Para cuántas personas y qué sabor o diseño tienes en mente?'; }
    if (pasoCotizacion === 'detalle') { pasoCotizacion = 'contacto'; return 'Perfecto. ¿Me compartes tu nombre y un teléfono para que Liz te envíe la cotización?'; }
    pasoCotizacion = null;
    return '¡Gracias! Ya le pasé tu solicitud a Liz; te contactará pronto con la cotización.';
  }

  if (tiene(t, ['gracias', 'muchas gracias'])) return '¡Con gusto! Si necesitas algo más, escríbeme.';
  if (tiene(t, ['adios', 'hasta luego', 'bye'])) return '¡Hasta pronto! Gracias por visitar Liz CakeShop 🎂';

  if (tiene(t, ['corporativ', 'reunion', 'masivo', 'empresa', 'oficina'])) {
    pasoCotizacion = 'fecha';
    return 'Para eventos o reuniones abrimos fechas exclusivas de horneado masivo de roles recién hechos. ¿Para qué fecha lo necesitas?';
  }
  if (tiene(t, ['cotiz', 'personaliz', 'boda', 'xv', 'quince', 'bautizo', 'cumple', 'evento', 'encargo', 'encargar', 'pasterol'])) {
    pasoCotizacion = 'fecha';
    return `¡Claro que sí! Hacemos pasteles tradicionales y pasteroles personalizados. Los pedimos con mínimo ${INFO.anticipacion} de anticipación. ¿Para qué fecha sería tu evento?`;
  }

  const encontrados = buscarProductos(t);
  if (encontrados.length) {
    return `Esto es lo que tenemos:\n${encontrados.map(lineaProducto).join('\n')}\nPuedes agregarlos al carrito desde el catálogo.`;
  }
  if (tiene(t, ['precio', 'cuesta', 'cuanto', 'costo', 'vale', 'catalogo', 'menu'])) {
    return 'Todos los precios están en la sección Catálogo y precios. Dime qué postre te interesa y te digo cuánto cuesta.';
  }
  if (tiene(t, ['donde', 'ubicacion', 'direccion', 'estan'])) return `Estamos en ${INFO.ubicacion}. Para pedidos, mejor escríbenos por aquí y te damos los detalles.`;
  if (tiene(t, ['horario', 'abren', 'cierran', 'a que hora'])) return `Nuestro horario es: ${INFO.horarios}.`;
  if (tiene(t, ['anticipacion', 'cuanto tarda', 'cuantos dias', 'con tiempo'])) return `Los pasteles personalizados se piden con mínimo ${INFO.anticipacion} de anticipación. Los postres del catálogo, según disponibilidad.`;
  if (tiene(t, ['mercadito', 'popup', 'pop-up', 'bazar', 'proxima ubicacion'])) return `¡Nos encanta estar cerca de ti! Sigue nuestras redes para saber dónde estaremos: Instagram ${INFO.instagram} y TikTok ${INFO.tiktok}.`;
  if (tiene(t, ['pago', 'pagar', 'transferencia', 'tarjeta', 'efectivo', 'anticipo'])) return 'Liz te confirma las formas de pago al confirmar tu pedido. ¿Quieres que te ayude a armarlo?';
  if (tiene(t, ['envio', 'domicilio', 'entrega', 'entregan'])) return 'Puedes elegir recoger tu pedido o entrega a domicilio; Liz confirma disponibilidad y costo según tu zona.';
  if (tiene(t, ['carrito', 'comprar', 'como pido', 'ordenar', 'pedir'])) return 'Agrega tus postres al carrito desde el catálogo, presiona "Siguiente", llena tus datos y envía tu pedido. Liz lo confirmará contigo.';
  if (tiene(t, ['hola', 'buenas', 'buen dia', 'buenos dias', 'hey'])) return '¡Hola! 👋 ¿Quieres cotizar un pastel, conocer precios o tienes alguna duda?';

  return 'Aún no tengo esa respuesta. Puedo ayudarte con precios, pedidos personalizados, ubicación y horarios. O déjame tu nombre y teléfono y Liz te responderá personalmente.';
}