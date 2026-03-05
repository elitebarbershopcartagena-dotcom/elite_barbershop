import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://alsbrkhdqqomyitrvtpd.supabase.co'
const supabaseKey = 'sb_publishable_9O6du7FXnUYZs88VahCXeQ_Z9dqWU1D'

const supabase = createClient(supabaseUrl, supabaseKey)


/**
 * BLADE DB  —  Motor de datos compartido v2
 * Usado por index.html Y admin/index.html
 * Todos los datos viven en localStorage bajo prefijo "blade_"
 *
 * COLECCIONES:
 *   barbers | services | inv | cuts | appointments | blocks | barberDays | contact | accounts
 *
 * FUNCIONES DE NEGOCIO PURAS (no dependen del DOM):
 *   validarDisponibilidad · crearCita · cancelarCita · confirmarCita
 *   obtenerDisponibilidadPorBarbero · asignacionAutomatica
 *   crearBloqueo · eliminarBloqueo · setBarberDay · getBarberDay
 */
const BladeDB = (() => {

  /* ══════════════════════════════════════════════════════
     STORAGE CORE
     ══════════════════════════════════════════════════════ */
  const _get = (k, def = null) => {
    try { const d = localStorage.getItem('blade_' + k); return d ? JSON.parse(d) : def; }
    catch { return def; }
  };
  const _set = (k, v) => {
    try { localStorage.setItem('blade_' + k, JSON.stringify(v)); }
    catch (e) { console.warn('[BladeDB] storage full:', e); }
  };
  function _uid() { return Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

  /* ══════════════════════════════════════════════════════
     DEFAULTS
     ══════════════════════════════════════════════════════ */
  const DEF_BARBERS = [
    { id: 1, name: 'Juan Martínez', role: 'Maestro Barbero',   spec: 'Especialista en fade técnico y diseños a navaja. 8 años de experiencia en barbería clásica.', stars: 5, status: 'disponible', photo: '' },
    { id: 2, name: 'Carlos Ríos',   role: 'Barbero Senior',    spec: 'Experto en afeitado ritual y cuidado de barba. Técnicas italianas y americanas.', stars: 5, status: 'disponible', photo: '' },
    { id: 3, name: 'Andrés Flórez', role: 'Estilista Barbero', spec: 'Cortes modernos y tendencias internacionales. Especialista en tratamientos capilares.', stars: 4, status: 'inactivo', photo: '' },
  ];

  const DEF_SERVICES = [
    { id: 1, name: 'Corte Clásico',       price: 25000, duracion: 30, desc: 'Corte tradicional con tijera y máquina. Terminado a navaja para un acabado impecable y profesional.', icon: '✂️' },
    { id: 2, name: 'Afeitado Ritual',     price: 35000, duracion: 45, desc: 'Experiencia completa con navaja abierta, toallas calientes y bálsamos de primera calidad.', icon: '🪒' },
    { id: 3, name: 'Diseño de Barba',     price: 20000, duracion: 20, desc: 'Perfilado, delineado y sculpting personalizado según tu forma de rostro y estilo único.', icon: '💈' },
    { id: 4, name: 'Combo Premium',       price: 70000, duracion: 90, desc: 'Corte + barba + afeitado + tratamiento capilar. La experiencia completa en una sola sesión.', icon: '⚡' },
    { id: 5, name: 'Fade Degradado',      price: 30000, duracion: 40, desc: 'Técnica de degradado de alta precisión: Low fade, Mid fade o High fade según tu preferencia.', icon: '🔥' },
    { id: 6, name: 'Tratamiento Capilar', price: 28000, duracion: 35, desc: 'Nutrición profunda con productos naturales. Masaje capilar y sellado de cutícula para máximo brillo.', icon: '🌿' },
  ];

  const DEF_INVENTORY = [
    { id: 1, name: 'Cera Americana Gold',  cat: 'Fijadores',     qty: 24, price: 28000, min: 5,  desc: 'Fijación fuerte con acabado brillante.' },
    { id: 2, name: 'Aceite de Barba',      cat: 'Cuidado Barba', qty:  3, price: 45000, min: 5,  desc: 'Hidratación y brillo profundo para barba.' },
    { id: 3, name: 'Máquina Wahl Senior',  cat: 'Herramientas',  qty:  0, price:380000, min: 2,  desc: 'Máquina profesional de corte preciso.' },
    { id: 4, name: 'Shampoo Anticaspa Pro',cat: 'Higiene',        qty: 18, price: 22000, min: 5,  desc: 'Control total de caspa y sebo capilar.' },
    { id: 5, name: 'Bálsamo After Shave',  cat: 'Cuidado Barba', qty:  2, price: 35000, min: 4,  desc: 'Calma e hidrata la piel post-afeitado.' },
    { id: 6, name: 'Navaja Gillette Pro',  cat: 'Herramientas',  qty: 45, price:  8500, min: 10, desc: 'Navaja de afeitar profesional.' },
    { id: 7, name: 'Gel Fijador Negro',    cat: 'Fijadores',     qty: 12, price: 18000, min: 5,  desc: 'Fijación extrema sin residuos ni pegajosidad.' },
    { id: 8, name: 'Tijeras Kamisori 7"',  cat: 'Herramientas',  qty:  4, price:250000, min: 2,  desc: 'Tijera japonesa de precisión milimétrica.' },
  ];

  const DEF_CONTACT = {
    phone: '+57 310 000 0000', email: 'blade@barberia.co', instagram: '@BladeBarberia',
    whatsapp: '573100000000', address: 'Calle del Bouquet #36-127, El Centro',
    city: 'Cartagena, Bolívar', scheduleWeek: 'Lun – Sáb: 8:00 AM – 8:00 PM',
    scheduleSun: 'Dom: 9:00 AM – 3:00 PM',
  };

  /* ── Constantes de horario ── */
  const OPEN_MINS  = 8 * 60;   // 8:00 AM  = 480 min
  const CLOSE_MINS = 20 * 60;  // 8:00 PM  = 1200 min
  const SLOT_MINS  = 15;       // granularidad de la agenda

  const SERVICE_ICONS = ['✂️','🪒','💈','🔥','⚡','🌿','💎','👑','🎯','🧴','🪮','✦','🏆','🎨'];

  /* ══════════════════════════════════════════════════════
     CUENTAS
     ══════════════════════════════════════════════════════ */
  const BUILTIN_ACCOUNTS = {
    admin:  { pass: 'blade2024', name: 'Administrador',   role: 'Administrador',    isAdmin: true,  barberId: null },
    juan:   { pass: 'barber1',   name: 'Juan Martínez',   role: 'Maestro Barbero',  isAdmin: false, barberId: 1    },
    carlos: { pass: 'barber2',   name: 'Carlos Ríos',     role: 'Barbero Senior',   isAdmin: false, barberId: 2    },
    andres: { pass: 'barber3',   name: 'Andrés Flórez',   role: 'Estilista Barbero',isAdmin: false, barberId: 3    },
  };

  /* ══════════════════════════════════════════════════════
     HELPERS INTERNOS — TIEMPO
     ══════════════════════════════════════════════════════ */

  /** "8:30 AM" → 510 (minutos desde medianoche) */
  function labelToMins(label) {
    const m = String(label).match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const pm = m[3].toUpperCase() === 'PM';
    if (pm  && h !== 12) h += 12;
    if (!pm && h === 12) h  =  0;
    return h * 60 + min;
  }

  /** 510 → "8:30 AM" */
  function minsToLabel(total) {
    const h   = Math.floor(total / 60) % 24;
    const m   = total % 60;
    const pm  = h >= 12;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2,'0')} ${pm ? 'PM' : 'AM'}`;
  }

  /* ══════════════════════════════════════════════════════
     MOTOR DE DISPONIBILIDAD (privado)
     ══════════════════════════════════════════════════════ */

  /**
   * Intervalos ocupados de un barbero en una fecha.
   * Fuentes: appointments (pendiente|confirmada) + blocks
   * @returns {{ start:number, end:number }[]}  minutos desde medianoche
   */
  function _getOccupied(barberId, fecha) {
    const occupied = [];

    _get('appointments', [])
      .filter(a => a.barberId === barberId && a.fecha === fecha &&
                   (a.estado === 'pendiente' || a.estado === 'confirmada'))
      .forEach(a => {
        const s = labelToMins(a.hora);
        occupied.push({ start: s, end: s + (a.duracion || 30) });
      });

    _get('blocks', [])
      .filter(b => b.barberId === barberId && b.fecha === fecha)
      .forEach(b => occupied.push({ start: labelToMins(b.horaInicio), end: labelToMins(b.horaFin) }));

    return occupied;
  }

  /** ¿Colisiona [newStart, newStart+dur) con algún intervalo de occupied? */
  function _collision(newStart, dur, occupied) {
    const newEnd = newStart + dur;
    return occupied.some(o => newStart < o.end && newEnd > o.start);
  }

  /* ══════════════════════════════════════════════════════
     REGLAS DE NEGOCIO PURAS
     ══════════════════════════════════════════════════════ */

  /**
   * Valida si un barbero puede atender en fecha+hora con la duración dada.
   * @param  {number} barberId
   * @param  {string} fecha      "YYYY-MM-DD"
   * @param  {string} hora       "8:30 AM"
   * @param  {number} duracion   minutos
   * @returns {{ ok:boolean, razon?:string }}
   */
  function validarDisponibilidad(barberId, fecha, hora, duracion) {
    const barber = _get('barbers', DEF_BARBERS).find(b => b.id === barberId);
    if (!barber)                     return { ok: false, razon: 'Barbero no encontrado.' };
    if (barber.status === 'inactivo') return { ok: false, razon: `${barber.name} está inactivo.` };

    const days = _get('barberDays', {});
    if (days[`${barberId}_${fecha}`] === false)
      return { ok: false, razon: `${barber.name} no trabaja ese día.` };

    const startM = labelToMins(hora);
    const endM   = startM + duracion;
    if (startM < OPEN_MINS)  return { ok: false, razon: 'Hora antes del horario de apertura (8:00 AM).' };
    if (endM   > CLOSE_MINS) return { ok: false, razon: 'El servicio terminaría después del cierre (8:00 PM).' };

    if (_collision(startM, duracion, _getOccupied(barberId, fecha)))
      return { ok: false, razon: `${barber.name} ya tiene un compromiso en ese horario.` };

    return { ok: true };
  }

  /**
   * Crea una cita nueva con validación completa.
   * Regla clave: máx 1 "pendiente" por teléfono (solo citas online).
   *
   * @param {{ clienteName, telefono, servicioId, barberId, fecha, hora, origen? }} datos
   * @returns {{ ok:boolean, razon?:string, cita?:object }}
   */
  function crearCita(datos) {
    const { clienteName, telefono, servicioId, barberId, fecha, hora, origen = 'online' } = datos;

    const services = _get('services', DEF_SERVICES);
    const servicio = services.find(s => s.id === servicioId);
    if (!servicio) return { ok: false, razon: 'Servicio no encontrado.' };

    const duracion = servicio.duracion || 30;

    // Regla de negocio: solo 1 pendiente por teléfono en citas online
    if (origen === 'online') {
      const pendiente = _get('appointments', []).find(a =>
        a.telefono === telefono && a.estado === 'pendiente');
      if (pendiente) return {
        ok: false,
        razon: `Ya tienes una cita pendiente (${pendiente.servicio}, ${pendiente.fecha} a las ${pendiente.hora}). Espera confirmación o cancélala primero.`,
      };
    }

    const val = validarDisponibilidad(barberId, fecha, hora, duracion);
    if (!val.ok) return { ok: false, razon: val.razon };

    const barbers = _get('barbers', DEF_BARBERS);
    const barber  = barbers.find(b => b.id === barberId);

    const cita = {
      id:           _uid(),
      clienteName,
      telefono,
      servicioId,
      servicio:     servicio.name,
      precio:       servicio.price,
      barberId,
      barberName:   barber ? barber.name : '—',
      fecha,
      hora,
      duracion,
      estado:       'pendiente',
      origen,
      creadaEn:     new Date().toISOString(),
      actualizadaEn:new Date().toISOString(),
    };

    const appts = _get('appointments', []);
    appts.push(cita);
    _set('appointments', appts);

    return { ok: true, cita };
  }

  /**
   * Cancela una cita. NUNCA la elimina — solo cambia estado a "cancelada".
   * El slot queda libre de inmediato al recalcular _getOccupied.
   */
  function cancelarCita(id) {
    const appts = _get('appointments', []);
    const idx   = appts.findIndex(a => a.id === id);
    if (idx === -1)                     return { ok: false, razon: 'Cita no encontrada.' };
    if (appts[idx].estado === 'cancelada') return { ok: false, razon: 'La cita ya está cancelada.' };
    appts[idx].estado         = 'cancelada';
    appts[idx].actualizadaEn  = new Date().toISOString();
    _set('appointments', appts);
    return { ok: true };
  }

  /** Confirma una cita pendiente → "confirmada" */
  function confirmarCita(id) {
    const appts = _get('appointments', []);
    const idx   = appts.findIndex(a => a.id === id);
    if (idx === -1)                         return { ok: false, razon: 'Cita no encontrada.' };
    if (appts[idx].estado !== 'pendiente')  return { ok: false, razon: `Estado actual: "${appts[idx].estado}". Solo se puede confirmar desde "pendiente".` };
    appts[idx].estado         = 'confirmada';
    appts[idx].actualizadaEn  = new Date().toISOString();
    _set('appointments', appts);
    return { ok: true };
  }

  /**
   * Slots disponibles de un barbero para una duración de servicio en una fecha.
   * Excluye: slots ocupados por citas activas + bloques manuales.
   * Si soloHoy=true, excluye slots pasados + los próximos 15 min.
   *
   * @returns {string[]}  "8:30 AM", "8:45 AM", ...
   */
  function obtenerDisponibilidadPorBarbero(barberId, fecha, duracion = 30, soloHoy = false) {
    const barbers = _get('barbers', DEF_BARBERS);
    const barber  = barbers.find(b => b.id === barberId);
    if (!barber || barber.status === 'inactivo') return [];

    const days = _get('barberDays', {});
    if (days[`${barberId}_${fecha}`] === false) return [];

    let minMins = OPEN_MINS;
    if (soloHoy) {
      const now     = new Date();
      const nowM    = now.getHours() * 60 + now.getMinutes() + 15;
      const rounded = Math.ceil(nowM / SLOT_MINS) * SLOT_MINS;
      minMins = Math.max(OPEN_MINS, rounded);
    }

    const occupied = _getOccupied(barberId, fecha);
    const slots    = [];

    for (let s = OPEN_MINS; s + duracion <= CLOSE_MINS; s += SLOT_MINS) {
      if (s < minMins) continue;
      if (!_collision(s, duracion, occupied)) slots.push(minsToLabel(s));
    }

    return slots;
  }

  /**
   * Asignación automática: barbero con MÁS tiempo libre para el servicio en la fecha.
   * Criterio: mayor cantidad de slots disponibles.
   * Desempate: menor barberId (determinista).
   *
   * @returns {number|null}  barberId o null
   */
  function asignacionAutomatica(fecha, duracion) {
    const barbers     = _get('barbers', DEF_BARBERS);
    const days        = _get('barberDays', {});
    const disponibles = barbers.filter(b =>
      b.status !== 'inactivo' && days[`${b.id}_${fecha}`] !== false);

    if (!disponibles.length) return null;

    let best = null, bestCount = -1;
    disponibles.forEach(b => {
      const count = obtenerDisponibilidadPorBarbero(b.id, fecha, duracion).length;
      if (count > bestCount || (count === bestCount && best !== null && b.id < best)) {
        best = b.id; bestCount = count;
      }
    });

    return bestCount > 0 ? best : null;
  }

  /* ══════════════════════════════════════════════════════
     BLOQUEOS MANUALES
     ══════════════════════════════════════════════════════ */

  function crearBloqueo(datos) {
    const { barberId, fecha, horaInicio, horaFin, motivo = '' } = datos;
    if (!barberId || !fecha || !horaInicio || !horaFin)
      return { ok: false, razon: 'Faltan campos obligatorios.' };
    if (labelToMins(horaInicio) >= labelToMins(horaFin))
      return { ok: false, razon: 'La hora de inicio debe ser anterior a la hora de fin.' };
    const blocks = _get('blocks', []);
    blocks.push({ id: _uid(), barberId, fecha, horaInicio, horaFin, motivo, creadoEn: new Date().toISOString() });
    _set('blocks', blocks);
    return { ok: true };
  }

  function eliminarBloqueo(id) {
    _set('blocks', _get('blocks', []).filter(b => b.id !== id));
  }

  /* ══════════════════════════════════════════════════════
     DISPONIBILIDAD POR DÍA
     ══════════════════════════════════════════════════════ */

  function setBarberDay(barberId, fecha, disponible) {
    const days = _get('barberDays', {});
    days[`${barberId}_${fecha}`] = disponible;
    _set('barberDays', days);
  }

  function getBarberDay(barberId, fecha) {
    const days = _get('barberDays', {});
    const v    = days[`${barberId}_${fecha}`];
    return v !== false;
  }

  /* ══════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════ */
  return {
    /* ── COLECCIONES BASE ──────────────────────────────── */
    getBarbers:  ()  => _get('barbers', DEF_BARBERS),
    saveBarbers: (v) => _set('barbers', v),

    getServices:  ()  => _get('services', DEF_SERVICES),
    saveServices: (v) => _set('services', v),

    getInventory:  ()  => _get('inv', DEF_INVENTORY),
    saveInventory: (v) => _set('inv', v),

    getCuts:  ()    => _get('cuts', []),
    saveCuts: (v)   => _set('cuts', v),
    addCut:   (cut) => { const cuts = _get('cuts', []); cuts.push({ ...cut, id: _uid() }); _set('cuts', cuts); },

    getContact:  ()  => _get('contact', DEF_CONTACT),
    saveContact: (v) => _set('contact', v),

    getAccounts: () => Object.assign({}, BUILTIN_ACCOUNTS, _get('extra_accounts', {})),
    addAccount:  (username, data) => { const e = _get('extra_accounts', {}); e[username] = data; _set('extra_accounts', e); },
    updateAccountPass: (username, newPass) => {
      const all = Object.assign({}, BUILTIN_ACCOUNTS, _get('extra_accounts', {}));
      const e   = _get('extra_accounts', {});
      e[username] = { ...(all[username] || {}), pass: newPass };
      _set('extra_accounts', e);
    },
    deleteAccount: (username) => { const e = _get('extra_accounts', {}); delete e[username]; _set('extra_accounts', e); },

    /* ── CITAS ─────────────────────────────────────────── */
    getAppointments:  ()  => _get('appointments', []),
    saveAppointments: (v) => _set('appointments', v),

    /* ── BLOQUEOS ──────────────────────────────────────── */
    getBlocks:  ()  => _get('blocks', []),
    saveBlocks: (v) => _set('blocks', v),

    /* ── DÍA POR BARBERO ───────────────────────────────── */
    getBarberDays:  ()  => _get('barberDays', {}),
    saveBarberDays: (v) => _set('barberDays', v),

    /* ── REGLAS DE NEGOCIO ─────────────────────────────── */
    validarDisponibilidad,
    crearCita,
    cancelarCita,
    confirmarCita,
    obtenerDisponibilidadPorBarbero,
    asignacionAutomatica,
    crearBloqueo,
    eliminarBloqueo,
    setBarberDay,
    getBarberDay,

    /* ── HELPERS ───────────────────────────────────────── */
    nextId:      (arr) => arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1,
    randomIcon:  ()    => SERVICE_ICONS[Math.floor(Math.random() * SERVICE_ICONS.length)],
    labelToMins,
    minsToLabel,
    todayISO:    ()    => new Date().toISOString().slice(0, 10),
    OPEN_MINS,
    CLOSE_MINS,
    SLOT_MINS,

    fmt: (n) => {
      if (!n) return '$0';
      if (n >= 1_000_000) return '$' + (n/1_000_000).toFixed(1) + 'M';
      if (n >= 1_000)     return '$' + (n/1_000).toFixed(0) + 'K';
      return '$' + n.toLocaleString('es-CO');
    },
    fmtFull: (n) => '$' + (n || 0).toLocaleString('es-CO'),
    dateStr: (ts) => new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }),
    timeStr: (ts) => new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),

    estadoBadge: (e) => ({
      pendiente:  '<span class="badge b-orange"><span class="bdot"></span>Pendiente</span>',
      confirmada: '<span class="badge b-green"><span class="bdot"></span>Confirmada</span>',
      cancelada:  '<span class="badge b-red"><span class="bdot"></span>Cancelada</span>',
    }[e] || `<span class="badge b-gray">${e}</span>`),

    origenBadge: (o) => o === 'presencial'
      ? '<span class="badge b-blue">Presencial</span>'
      : '<span class="badge b-gray">Online</span>',
  };
})();
