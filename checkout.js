/* =====================================================================
   CHECKOUT: lo que ocurre al presionar "Siguiente" en el carrito
   Pasos: 1 Carrito > 2 Tus datos > 3 Resumen > Pedido enviado
   Se carga DESPUÉS de app.js (usa db, carrito, el, $, mxn, etc.)
   ===================================================================== */

const datosPedido = { nombre: '', telefono: '', correo: '', fecha: '', entrega: 'Recoger', notas: '' };
let dlgCheckout;

const totalCarrito = () => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

function abrirCheckout() {
  if (!carrito.length) return;
  $('#dlg-carrito').close();
  if (!dlgCheckout) {
    dlgCheckout = el('dialog', { class: 'modal modal-checkout', 'aria-label': 'Finalizar pedido' });
    dlgCheckout.addEventListener('click', (e) => { if (e.target === dlgCheckout) dlgCheckout.close(); });
    document.body.append(dlgCheckout);
  }
  pasoDatos();
  dlgCheckout.showModal();
}

/** Flecha "volver" + indicador de pasos */
function encabezado(actual, volver) {
  const atras = el('button', { type: 'button', class: 'modal-volver', 'aria-label': 'Volver', text: '←' });
  atras.addEventListener('click', volver);
  const pasos = el('ol', { class: 'pasos' }, ...['Carrito', 'Tus datos', 'Resumen'].map((t, i) =>
    el('li', { class: i + 1 < actual ? 'hecho' : i + 1 === actual ? 'actual' : '', text: `${i + 1}. ${t}` })));
  return [atras, pasos];
}

const campo = (texto, input) => el('label', {}, texto, input);

/* ---------- Paso 2: datos del cliente ---------- */
function pasoDatos() {
  const d = datosPedido;
  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  const radio = (valor, texto) => {
    const i = el('input', { type: 'radio', name: 'entrega', value: valor });
    i.checked = d.entrega === valor;
    return el('label', { class: 'opcion' }, i, texto);
  };

  const form = el('form', { class: 'form-checkout' },
    campo('Nombre completo *', el('input', { name: 'nombre', required: '', maxlength: '120', value: d.nombre, autocomplete: 'name' })),
    campo('Teléfono / WhatsApp *', el('input', { name: 'telefono', type: 'tel', required: '', pattern: '[0-9 +\\-]{7,20}', title: 'Solo números, de 7 a 20 dígitos', value: d.telefono })),
    campo('Correo (opcional)', el('input', { name: 'correo', type: 'email', maxlength: '200', value: d.correo })),
    campo('¿Para qué fecha lo necesitas? *', el('input', { name: 'fecha', type: 'date', required: '', min: manana, value: d.fecha })),
    el('fieldset', {}, el('legend', { text: '¿Cómo lo prefieres?' }), radio('Recoger', 'Recoger mi pedido'), radio('Domicilio', 'Entrega a domicilio')),
    campo('Notas o dedicatoria (opcional)', el('textarea', { name: 'notas', rows: '2', maxlength: '500', text: d.notas })),
    el('p', { class: 'aviso', text: 'Los pasteles personalizados requieren 3 días de anticipación. Liz confirmará disponibilidad.' }),
    el('button', { type: 'submit', class: 'btn', text: 'Revisar pedido' })
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    Object.assign(datosPedido, Object.fromEntries(new FormData(form)));
    pasoResumen();
  });

  dlgCheckout.replaceChildren(...encabezado(2, () => { dlgCheckout.close(); abrirCarrito(); }), el('h2', { text: 'Tus datos' }), form);
}

/* ---------- Paso 3: resumen y envío ---------- */
function pasoResumen() {
  const d = datosPedido;
  const fecha = new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const filas = carrito.map((i) => el('li', {}, el('span', { text: `${i.cantidad} × ${i.nombre}` }), el('b', { text: formatoMXN.format(i.precio * i.cantidad) })));
  const datos = [['Nombre', d.nombre], ['Teléfono', d.telefono], ['Fecha', fecha],
                 ['Entrega', d.entrega === 'Recoger' ? 'Recoger' : 'A domicilio'], d.notas && ['Notas', d.notas]]
    .filter(Boolean).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]);

  const msg = el('p', { class: 'estado-envio', role: 'status' });
  const enviar = el('button', { type: 'button', class: 'btn', text: 'Enviar pedido' });
  enviar.addEventListener('click', () => enviarPedido(enviar, msg));

  dlgCheckout.replaceChildren(...encabezado(3, pasoDatos), el('h2', { text: 'Resumen de tu pedido' }),
    el('ul', { class: 'resumen' }, ...filas),
    el('p', { class: 'resumen-total' }, 'Total: ', el('b', { text: mxn(totalCarrito()) })),
    el('dl', { class: 'datos' }, ...datos),
    el('p', { class: 'aviso', text: 'Esto es una solicitud de pedido. Liz te contactará para confirmar disponibilidad, costo de entrega y forma de pago.' }),
    msg, enviar);
}

/** Llama a la función crear_pedido de Supabase (valida stock y precios en el servidor) */
async function enviarPedido(btn, msg) {
  const d = datosPedido;
  btn.disabled = true;
  msg.textContent = 'Enviando tu pedido…';

  const { data, error } = await db.rpc('crear_pedido', {
    p_nombre: d.nombre.trim(), p_telefono: d.telefono.trim(), p_correo: d.correo.trim() || null,
    p_fecha: d.fecha, p_entrega: d.entrega, p_notas: d.notas.trim() || null,
    p_items: carrito.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
  });

  if (error) {
    console.error('Error al crear pedido:', error);
    msg.textContent = /stock|disponible/i.test(error.message)
      ? 'Algún producto ya no tiene stock suficiente. Revisa tu carrito.'
      : 'No pudimos enviar tu pedido. Inténtalo de nuevo.';
    btn.disabled = false;
    return;
  }
  carrito = [];
  guardarCarrito();
  pasoListo(data);
}

/* ---------- Confirmación ---------- */
function pasoListo(folio) {
  const cerrar = el('button', { type: 'button', class: 'btn', text: 'Seguir viendo el catálogo' });
  cerrar.addEventListener('click', () => dlgCheckout.close());
  dlgCheckout.replaceChildren(el('div', { class: 'listo' },
    el('p', { class: 'listo-icono', text: '🎂' }),
    el('h2', { text: '¡Pedido enviado!' }),
    el('p', {}, 'Tu folio es ', el('b', { text: `#${folio}` }), '.'),
    el('p', { text: `Liz te contactará al ${datosPedido.telefono} para confirmar detalles, entrega y pago. ¡Gracias por elegir Liz CakeShop!` }),
    cerrar));
  datosPedido.notas = '';
}