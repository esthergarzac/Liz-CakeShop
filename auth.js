/* =====================================================================
   LIZ CAKESHOP - Inicio de sesión (Supabase Auth + redirección por rol)

   Cómo funciona:
   1) Supabase Auth verifica correo + contraseña (la contraseña nunca se
      guarda en nuestras tablas; Supabase la guarda cifrada).
   2) Con la sesión iniciada leemos nuestra tabla "usuarios" para saber el
      rol (Administrador / Empleado) y si la cuenta está activa.
   3) Redirigimos al dashboard que corresponde.
   ===================================================================== */
'use strict';

/* ---------- Conexión (pega tu publishable key; NUNCA la secret) ---------- */
const SUPABASE_URL = 'https://qakkmauzrkbnoivjktup.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tB8MgKD6HINhXzG2CgmcAA_G2zq6kDI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- A dónde va cada rol ---------- */
const DESTINOS = {
  'Administrador': 'dashboard-admin.html',
  'Empleado': 'dashboard-empleado.html',
};

const $ = (sel) => document.querySelector(sel);
const form = $('#form-login');
const cajaError = $('#login-error');
const btnIngresar = $('#btn-ingresar');

/* ---------- Utilidades de interfaz ---------- */
function mostrarError(texto) {
  cajaError.textContent = texto;
  cajaError.hidden = false;
}
function ocultarError() { cajaError.hidden = true; }
function setCargando(cargando) {
  btnIngresar.disabled = cargando;
  btnIngresar.textContent = cargando ? 'INGRESANDO…' : 'INGRESAR';
}

/** Lee el rol del usuario en la tabla "usuarios" (null si no existe o está inactivo). */
async function obtenerRol(userId) {
  const { data, error } = await db
    .from('usuarios')
    .select('activo, roles(nombre)')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data || !data.activo) return null;
  return data.roles ? data.roles.nombre : null;
}

/* ---------- Enviar el formulario ---------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  ocultarError();

  const usuario = $('#usuario').value.trim();
  const password = $('#password').value;

  if (!usuario || !password) {
    mostrarError('Escribe tu cuenta y tu contraseña.');
    return;
  }
  // Supabase Auth inicia sesión con correo electrónico
  if (!usuario.includes('@')) {
    mostrarError('Por ahora inicia sesión con tu correo electrónico.');
    return;
  }

  setCargando(true);

  // 1) Verificar credenciales
  const { data, error } = await db.auth.signInWithPassword({ email: usuario, password });

  if (error) {
    setCargando(false);
    const credencialesMal = error.code === 'invalid_credentials' || error.status === 400;
    mostrarError(credencialesMal
      ? 'Los datos son incorrectos. Revisa tu cuenta y tu contraseña.'
      : 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }

  // 2) Consultar el rol
  const rol = await obtenerRol(data.user.id);
  const destino = DESTINOS[rol];

  if (!destino) {
    await db.auth.signOut();
    setCargando(false);
    mostrarError('Tu cuenta no tiene acceso al panel. Contacta a la persona administradora.');
    return;
  }

  // 3) Redirigir según el rol
  window.location.href = destino;
});

/* ---------- Ojito: mostrar / ocultar contraseña ---------- */
$('#ver-clave').addEventListener('click', (e) => {
  const input = $('#password');
  const mostrar = input.type === 'password';
  input.type = mostrar ? 'text' : 'password';
  e.currentTarget.setAttribute('aria-pressed', String(mostrar));
  e.currentTarget.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  $('#ojo-abierto').hidden = !mostrar;
  $('#ojo-cerrado').hidden = mostrar;
});

/* ---------- Olvidé mi contraseña ---------- */
$('#btn-olvido').addEventListener('click', () => {
  const ayuda = $('#ayuda-olvido');
  ayuda.hidden = !ayuda.hidden;
});

/* ---------- Al abrir la página ---------- */
(async () => {
  // login.html?salir  -> cierra la sesión (útil para pruebas)
  if (new URLSearchParams(location.search).has('salir')) {
    await db.auth.signOut();
    return;
  }
  // Si ya hay una sesión válida, entrar directo a su dashboard
  const { data } = await db.auth.getSession();
  if (data.session) {
    const destino = DESTINOS[await obtenerRol(data.session.user.id)];
    if (destino) window.location.replace(destino);
  }
})();