/* ==========================================================
   1. CONSTANTES Y ESTADO
   ========================================================== */
const TOTAL = 151;
const STORAGE_KEY = 'pokemonCapturados';
const API = 'https://pokeapi.co/api/v2/pokemon/';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

const ICONOS = {
  normal: '⚪', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿', ice: '❄️', fighting: '🥊', poison: '☠️', ground: '⛰️',
  flying: '🕊️', psychic: '🔮', bug: '🐛', rock: '🪨', ghost: '👻', dragon: '🐉', fairy: '✨', steel: '⚙️', dark: '🌑',
};
const STATS_ES = { hp: 'HP', attack: 'Ataque', defense: 'Defensa', 'special-attack': 'At. esp.', 'special-defense': 'Def. esp.', speed: 'Velocidad' };

let capturados = cargarColeccion();
let pendiente = null;   // Pokémon consultado, esperando confirmación
let lector = null;      // instancia de Html5Qrcode
let ocupado = false;    // evita procesar varios QR a la vez

/* ==========================================================
   2. UTILIDADES
   ========================================================== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const pad = (n, l = 3) => String(n).padStart(l, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sprite = (id) => `${SPRITES}/${id}.png`;

/* ==========================================================
   3. ANIMACIONES (JS: Web Animations API + requestAnimationFrame)
   ========================================================== */
// Respeta la preferencia del sistema "reducir movimiento"
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Envoltura de element.animate(): no hace nada si el usuario prefiere menos movimiento
function animar(el, keyframes, opciones = {}) {
  if (reducir || !el) return null;
  return el.animate(keyframes, { duration: 400, easing: 'ease-out', ...opciones });
}

// Aparece subiendo y con fade; varios elementos con retraso escalonado
function entrada(elementos, { paso = 50, duracion = 420, desde = 18, max = 24 } = {}) {
  [...elementos].forEach((el, i) => animar(el,
    [{ opacity: 0, transform: `translateY(${desde}px) scale(.97)` }, { opacity: 1, transform: 'none' }],
    { duration: duracion, delay: Math.min(i, max) * paso, fill: 'backwards' }));
}

// Confeti con partículas DOM animadas
function confeti(x, y) {
  if (reducir) return;
  const colores = ['#ef5350', '#ffca28', '#42a5f5', '#66bb6a', '#ab47bc', '#ff7043'];
  for (let i = 0; i < 32; i++) {
    const p = document.createElement('i');
    const t = 6 + Math.random() * 6;
    p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${t}px;height:${t * 0.6}px;background:${colores[i % colores.length]};border-radius:2px;pointer-events:none;z-index:90`;
    document.body.appendChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 130;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 70;
    const a = p.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px,${dy + 160}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)' }
    );
    a.onfinish = () => p.remove();
  }
}

// La tarjeta recién capturada: scroll hasta ella, "pop" y confeti
function destacarCaptura(id) {
  const c = $(`#capturados [data-id="${id}"]`);
  if (!c) return;
  c.style.opacity = '0';
  c.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'center' });
  setTimeout(() => {
    animar(c, [
      { transform: 'scale(.5) rotate(-8deg)', opacity: 0 },
      { transform: 'scale(1.14) rotate(3deg)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 700 });
    c.style.opacity = '';
    const r = c.getBoundingClientRect();
    confeti(r.left + r.width / 2, r.top + r.height / 2);
  }, reducir ? 0 : 500);
}

// Animaciones al abrir el bottom sheet: contenido escalonado, sprite con rebote y barras de stats que crecen
function animarSheet() {
  const raiz = $('#sheet-body > div');
  if (!raiz) return;
  entrada(raiz.children, { paso: 60, duracion: 380, desde: 14 });

  animar($('#sheet-body img'), [
    { transform: 'scale(.4) rotate(-12deg)', opacity: 0 },
    { transform: 'scale(1.12) rotate(4deg)', opacity: 1, offset: 0.65 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
  ], { duration: 650, delay: 120, fill: 'backwards', easing: 'ease-out' });

  $$('#sheet-body .track i').forEach((barra, i) => {
    animar(barra, [{ width: '0%' }, { width: barra.style.width }],
      { duration: 700, delay: 350 + i * 80, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

/* ==========================================================
   4. localStorage
   ========================================================== */
function cargarColeccion() {
  try {
    const datos = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(datos) ? datos : [];   // vacío o dañado → colección nueva
  } catch {
    return [];
  }
}

function persistirColeccion() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capturados));
  } catch {
    mostrarToast('No se pudo guardar tu colección en este dispositivo.', 'error');
  }
}

/* ==========================================================
   5. TOAST
   ========================================================== */
let temporizadorToast;
function mostrarToast(mensaje, tipo = 'info') {
  const toast = $('#toast');
  toast.textContent = mensaje;
  toast.className = `toast show ${tipo}`;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('show'), 3200);

  // Error: sacudida horizontal. Resto: rebote hacia arriba.
  if (tipo === 'error') {
    animar(toast, [
      { transform: 'translate(-50%,0)' }, { transform: 'translate(calc(-50% - 10px),0)' },
      { transform: 'translate(calc(-50% + 10px),0)' }, { transform: 'translate(calc(-50% - 6px),0)' },
      { transform: 'translate(calc(-50% + 6px),0)' }, { transform: 'translate(-50%,0)' },
    ], { duration: 450 });
  } else {
    animar(toast, [
      { transform: 'translate(-50%,20px) scale(.9)' },
      { transform: 'translate(-50%,-8px) scale(1.05)', offset: 0.6 },
      { transform: 'translate(-50%,0) scale(1)' },
    ], { duration: 400 });
  }
}

/* ==========================================================
   6. NAVEGACIÓN Y TEMA
   ========================================================== */
function mostrarVista(vista) {
  const seccion = $(`#view-${vista}`);
  const cambia = seccion.classList.contains('hidden');

  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${vista}`));
  $$('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === vista));
  scrollTo({ top: 0 });

  if (cambia) {
    entrada(seccion.children, { paso: 70, duracion: 450, desde: 20 });
    animar($('.nav button.on'), [
      { transform: 'scale(.85)' }, { transform: 'scale(1.1)', offset: 0.6 }, { transform: 'scale(1)' },
    ], { duration: 350 });
  }
}

function cambiarTema() {
  const oscuro = document.documentElement.classList.toggle('dark');
  localStorage.setItem('tema', oscuro ? 'dark' : 'light');
  // El icono visible gira y crece
  ['.moon', '.sun'].forEach((s) => animar($(s), [
    { transform: 'rotate(-180deg) scale(0)', opacity: 0 },
    { transform: 'rotate(0deg) scale(1)', opacity: 1 },
  ], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' }));
}

/* ==========================================================
   7. PLANTILLAS HTML
   ========================================================== */
const insignias = (tipos) =>
  tipos.map((t) => `<span class="badge t-${t}">${ICONOS[t] || ''} ${cap(t)}</span>`).join('');

const tarjeta = (p) => `
  <button data-id="${p.id}" class="card t-${p.types[0]} p-3 text-left transition active:scale-95">
    <div class="tint relative flex h-32 items-center justify-center rounded-2xl">
      <span class="absolute left-3 top-3 text-[10px] font-extrabold">#${pad(p.id)}</span>
      <span class="absolute right-3 top-3 text-lg">${ICONOS[p.types[0]] || ''}</span>
      <img loading="lazy" class="h-28 w-28 drop-shadow-md" src="${p.image}" alt="${cap(p.name)}">
    </div>
    <h3 class="f mt-3 px-1 font-extrabold">${cap(p.name)}</h3>
    <div class="mt-2 flex flex-wrap gap-1 px-1">${insignias(p.types)}</div>
  </button>`;

const bloqueada = (id) => `
  <div class="card p-3 text-center">
    <div class="dots c2 flex h-20 items-center justify-center rounded-xl">
      <img loading="lazy" class="lock h-16 w-16" src="${sprite(id)}" alt="">
    </div>
    <p class="mut mt-2 text-[10px] font-extrabold">#${pad(id)}</p>
    <p class="soft text-[10px] font-bold">? ???</p>
  </div>`;

const htmlCargando = `
  <div class="py-10 text-center">
    <div class="spin mx-auto"></div>
    <p class="f mt-4 font-bold">Consultando Pokédex...</p>
  </div>`;

const htmlError = `
  <div class="py-8 text-center">
    <div class="text-5xl">⚠️</div>
    <p class="f mt-3 font-extrabold">No pudimos consultar la PokéAPI</p>
    <p class="soft mt-1 text-xs">Revisa tu conexión a Internet e inténtalo de nuevo.</p>
    <button data-act="cancelar" class="btn btn-sec mt-5 w-full">Cerrar</button>
  </div>`;

function ficha(p, modo) {
  const stats = p.stats.map((s) => `
    <div class="flex items-center gap-3">
      <span class="soft w-20 font-bold">${STATS_ES[s.name] || s.name}</span>
      <b class="w-7 text-right">${s.value}</b>
      <div class="track flex-1"><i style="width:${Math.min(100, s.value / 1.8)}%;background:rgb(var(--c))"></i></div>
    </div>`).join('');

  const habilidades = p.abilities.map((a) => `<span class="c2 rounded-full px-3 py-1.5 text-[11px] font-bold">${cap(a.replace(/-/g, ' '))}</span>`).join('');

  const acciones = modo === 'captura'
    ? `<div class="mt-6 flex gap-3"><button data-act="cancelar" class="btn btn-sec">Cancelar</button><button data-act="confirmar" class="btn btn-pri">Capturar</button></div>`
    : `<p class="mut mt-5 text-center text-[11px] font-bold">Capturado el ${new Date(p.capturedAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</p>
       <button data-act="cancelar" class="btn btn-sec mt-3 w-full">Cerrar</button>`;

  return `
    <div class="t-${p.types[0]}">
      <div class="tint flex items-center justify-between rounded-3xl p-5">
        <div>
          <span class="text-[10px] font-extrabold">#${pad(p.id)}</span>
          <h3 class="f text-3xl font-extrabold" style="color:var(--tx)">${cap(p.name)}</h3>
          <div class="mt-3 flex flex-wrap gap-2">${insignias(p.types)}</div>
        </div>
        <img class="h-32 w-32 drop-shadow-lg" src="${p.image}" alt="${cap(p.name)}">
      </div>
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="c2 rounded-2xl p-4"><p class="mut text-[10px] font-bold">ALTURA</p><p class="f text-lg font-extrabold">${p.height} m</p></div>
        <div class="c2 rounded-2xl p-4"><p class="mut text-[10px] font-bold">PESO</p><p class="f text-lg font-extrabold">${p.weight} kg</p></div>
      </div>
      <p class="mut mt-4 text-[10px] font-bold">HABILIDADES</p>
      <div class="mt-2 flex flex-wrap gap-2">${habilidades}</div>
      <p class="mut mt-5 text-[10px] font-bold">ESTADÍSTICAS BASE</p>
      <div class="mt-3 space-y-3 text-xs">${stats}</div>
      ${acciones}
    </div>`;
}

/* ==========================================================
   8. RENDER Y PROGRESO
   ========================================================== */
let primerRender = true;

function renderizarPokedex() {
  const ordenados = [...capturados].sort((a, b) => a.id - b.id);
  const ids = new Set(ordenados.map((p) => p.id));

  $('#vacio').classList.toggle('hidden', ordenados.length > 0);
  $('#capturados').classList.toggle('hidden', ordenados.length === 0);
  $('#capturados').innerHTML = ordenados.map(tarjeta).join('');
  $('#bloqueados').innerHTML = Array.from({ length: TOTAL }, (_, i) => i + 1)
    .filter((id) => !ids.has(id)).map(bloqueada).join('');

  // Solo al abrir la app: tarjetas en cascada y fade de las bloqueadas
  if (primerRender) {
    primerRender = false;
    entrada($$('#capturados > button'), { paso: 45, duracion: 450 });
    animar($('#bloqueados'), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, fill: 'backwards' });
    animar($('[data-act="escanear"]'), [
      { transform: 'scale(0) rotate(-90deg)', opacity: 0 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 600, delay: 400, fill: 'backwards', easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  actualizarProgreso();
}

// Los números, barras y el donut se animan con requestAnimationFrame
let mostrado = 0;      // valor que se está viendo (para animar desde ahí)
let rafProgreso;

function pintarProgreso(v) {
  mostrado = v;
  const r = Math.round(v);
  const pct = (v / TOTAL) * 100;
  const valores = { pad: pad(r, 2), count: r, pending: TOTAL - r, pct: pct.toFixed(1) };

  $$('[data-bind]').forEach((el) => { el.textContent = valores[el.dataset.bind]; });
  $$('[data-bar]').forEach((el) => { el.style.transition = 'none'; el.style.width = `${pct}%`; });
  $('#donut').style.background = `conic-gradient(#ef5350 0 ${pct * 3.6}deg, var(--bd) ${pct * 3.6}deg)`;
}

function actualizarProgreso() {
  const hasta = capturados.length;
  const desde = mostrado;
  const dur = reducir || desde === hasta ? 0 : 1000;
  const t0 = performance.now();

  cancelAnimationFrame(rafProgreso);
  const paso = (t) => {
    const k = dur ? Math.min(1, (t - t0) / dur) : 1;
    const suave = 1 - Math.pow(1 - k, 3);          // ease-out cúbico
    pintarProgreso(desde + (hasta - desde) * suave);
    if (k < 1) rafProgreso = requestAnimationFrame(paso);
  };
  rafProgreso = requestAnimationFrame(paso);
}

/* ==========================================================
   9. BOTTOM SHEET Y DETALLE
   ========================================================== */
function abrirSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').classList.add('open');
  animarSheet();
}

function cerrarSheet() {
  $('#sheet').classList.remove('open');
  pendiente = null;
  if (ocupado && $('#scanner').classList.contains('open')) reanudarLector(0);  // seguir escaneando
}

function abrirDetalle(id) {
  const p = capturados.find((x) => x.id === id);
  if (p) abrirSheet(ficha(p, 'detalle'));
}

/* ==========================================================
   10. POKÉAPI Y CAPTURA
   ========================================================== */
function validarQR(texto) {
  const m = /^pokemon:(\d+)$/.exec(String(texto).trim());
  if (!m) return null;
  const id = Number(m[1]);
  return id >= 1 && id <= TOTAL ? id : null;
}

async function buscarPokemon(id) {
  if (!navigator.onLine) throw new Error('sin conexión');
  const res = await fetch(API + id);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return {
    id: d.id,
    name: d.name,
    image: d.sprites.other['official-artwork'].front_default || d.sprites.front_default,
    types: d.types.map((t) => t.type.name),
    height: d.height / 10,
    weight: d.weight / 10,
    abilities: d.abilities.map((a) => a.ability.name),
    stats: d.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
    capturedAt: null,
  };
}

function guardarPokemon(p) {
  if (capturados.some((x) => x.id === p.id)) return false;   // sin duplicados
  capturados.push({ ...p, capturedAt: new Date().toISOString() });
  persistirColeccion();
  renderizarPokedex();
  return true;
}

function confirmarCaptura() {
  if (!pendiente) return;
  const p = pendiente;
  const nuevo = guardarPokemon(p);
  if (nuevo) mostrarToast(`¡${cap(p.name)} fue agregado a tu Pokédex! ${ICONOS[p.types[0]] || ''}`, 'ok');
  else mostrarToast('Este Pokémon ya había sido capturado.', 'info');
  pendiente = null;
  ocupado = false;
  $('#sheet').classList.remove('open');
  cerrarEscaner();
  mostrarVista('pokedex');
  if (nuevo) destacarCaptura(p.id);
}

/* ==========================================================
   11. ESCÁNER QR
   ========================================================== */
let pulsoLector = null;   // animación infinita del marco mientras escanea

function errorCamara(mensaje) {
  $('#estado-cam').textContent = '';
  $('#err-cam-txt').textContent = mensaje;
  $('#err-cam').classList.remove('hidden');
  animar($('#err-cam'), [
    { opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' },
  ], { duration: 350 });
}

async function abrirEscaner() {
  const overlay = $('#scanner');
  overlay.classList.add('open');
  animar(overlay, [
    { opacity: 0, transform: 'scale(1.05)' }, { opacity: 1, transform: 'scale(1)' },
  ], { duration: 280 });

  $('#err-cam').classList.add('hidden');
  $('#estado-cam').textContent = 'Iniciando cámara...';
  ocupado = false;

  if (typeof Html5Qrcode === 'undefined') return errorCamara('No se pudo cargar el lector QR. Conéctate a Internet una vez e inténtalo de nuevo.');

  try {
    lector = lector || new Html5Qrcode('reader');
    await lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, leerQR, () => {});
    $('#estado-cam').textContent = '● Esperando código QR...';

    // Pulso del marco y parpadeo del texto mientras espera un QR
    if (pulsoLector) pulsoLector.cancel();
    pulsoLector = animar($('#reader'), [
      { boxShadow: '0 0 0 0 rgba(239,83,80,.55)' }, { boxShadow: '0 0 0 16px rgba(239,83,80,0)' },
    ], { duration: 1500, iterations: Infinity, easing: 'ease-out' });
    animar($('#estado-cam'), [{ opacity: 0.4 }, { opacity: 1 }], { duration: 900, iterations: Infinity, direction: 'alternate' });
  } catch (e) {
    const rechazado = /permission|notallowed|denied/i.test(String(e));
    errorCamara(rechazado ? 'Permiso de cámara rechazado. Actívalo en los ajustes del navegador.' : 'No se pudo acceder a la cámara de este dispositivo.');
  }
}

async function cerrarEscaner() {
  const overlay = $('#scanner');
  if (pulsoLector) { pulsoLector.cancel(); pulsoLector = null; }
  $$('#estado-cam').forEach((el) => el.getAnimations().forEach((a) => a.cancel()));

  const salida = animar(overlay, [
    { opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.97)' },
  ], { duration: 200, fill: 'forwards' });
  if (salida) await salida.finished.catch(() => {});
  overlay.classList.remove('open');
  if (salida) salida.cancel();

  try { if (lector && lector.isScanning) await lector.stop(); } catch {}
}

function reanudarLector(retraso) {
  setTimeout(() => {
    ocupado = false;
    try { lector.resume(); } catch {}
  }, retraso);
}

async function leerQR(texto) {
  if (ocupado) return;
  ocupado = true;
  try { lector.pause(true); } catch {}

  const id = validarQR(texto);
  if (!id) {
    mostrarToast('Este código QR no pertenece a la Pokédex.', 'error');
    return reanudarLector(1800);
  }
  if (capturados.some((p) => p.id === id)) {
    mostrarToast('Este Pokémon ya había sido capturado.', 'info');
    return reanudarLector(1800);
  }

  // Destello del marco al leer un QR válido
  animar($('#reader'), [
    { boxShadow: '0 0 0 0 rgba(102,187,106,.9)' }, { boxShadow: '0 0 0 24px rgba(102,187,106,0)' },
  ], { duration: 500 });

  abrirSheet(htmlCargando);
  try {
    pendiente = await buscarPokemon(id);
    abrirSheet(ficha(pendiente, 'captura'));
  } catch {
    abrirSheet(htmlError);
    mostrarToast('No fue posible consultar la información del Pokémon.', 'error');
  }
}

/* ==========================================================
   12. EVENTOS
   ========================================================== */
const ACCIONES = {
  tema: cambiarTema,
  escanear: abrirEscaner,
  reintentar: abrirEscaner,
  'cerrar-scan': cerrarEscaner,
  cancelar: cerrarSheet,
  confirmar: confirmarCaptura,
};

document.addEventListener('click', (e) => {
  const accion = e.target.closest('[data-act]');
  if (accion) return ACCIONES[accion.dataset.act]?.();

  const vista = e.target.closest('[data-view]');
  if (vista) return mostrarVista(vista.dataset.view);

  const carta = e.target.closest('#capturados [data-id]');
  if (carta) abrirDetalle(Number(carta.dataset.id));
});

window.addEventListener('offline', () => mostrarToast('Sin conexión: tu colección sigue disponible.', 'info'));
window.addEventListener('online', () => mostrarToast('Conexión restablecida.', 'ok'));

/* ==========================================================
   13. INICIO Y SERVICE WORKER
   ========================================================== */
renderizarPokedex();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}