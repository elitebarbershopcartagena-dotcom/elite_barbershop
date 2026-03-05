/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  BLADE DB  —  Motor de datos v4                                  ║
 * ║  Arquitectura híbrida: Supabase (source of truth) +              ║
 * ║  localStorage (cache inteligente + cola offline)                 ║
 * ║                                                                  ║
 * ║  TABLAS SUPABASE:                                                ║
 * ║    appointments → id, client_name, client_phone, barber_id,      ║
 * ║                   date, time, status, created_at                 ║
 * ║    barber_days  → id, barber_id, fecha, disponible, created_at   ║
 * ║    blocks       → id, barber_id, fecha, hora_inicio, hora_fin,   ║
 * ║                   motivo, created_at                             ║
 * ║                                                                  ║
 * ║  Requiere que supabase esté disponible globalmente               ║
 * ║  via: <script src="https://cdn.jsdelivr.net/npm/@supabase/       ║
 * ║        supabase-js@2/dist/umd/supabase.js"></script>             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

/* ── Inicializar cliente Supabase (UMD global) ── */
const _SB_URL = 'https://alsbrkhdqqomyitrvtpd.supabase.co';
const _SB_KEY = 'sb_publishable_9O6du7FXnUYZs88VahCXeQ_Z9dqWU1D';
const _sb = window.supabase.createClient(_SB_URL, _SB_KEY);

const BladeDB = (() => {

  /* ══════════════════════════════════════════════════════════════
     § 1  STORAGE CORE — localStorage con prefijo "blade_"
     ══════════════════════════════════════════════════════════════ */
  const _ls = {
    get: (k, def = null) => {
      try {
        const d = localStorage.getItem('blade_' + k);
        return d !== null ? JSON.parse(d) : def;
      } catch { return def; }
    },
    set: (k, v) => {
      try { localStorage.setItem('blade_' + k, JSON.stringify(v)); }
      catch (e) { console.warn('[BladeDB] localStorage lleno:', e); }
    },
  };

  /** ID temporal para registros creados offline */
  const _tempId = () => 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  /** ¿Hay conexión a internet? */
  const _online = () => navigator.onLine;

  /* ══════════════════════════════════════════════════════════════
     § 2  MAPPERS — columnas Supabase ↔ propiedades del frontend
     ══════════════════════════════════════════════════════════════
     Supabase         → Frontend
     ─────────────────────────────────────────
     client_name      → clienteName
     client_phone     → telefono
     barber_id        → barberId
     date             → fecha
     time             → hora
     status           → estado
     created_at       → creadaEn
  */
  function _apptFromDB(row) {
    if (!row) return null;
    return {
      id:          row.id,
      clienteName: row.client_name,
      telefono:    row.client_phone  || '',
      barberId:    row.barber_id,
      barberName:  row.barber_name   || _barberName(row.barber_id),
      servicio:    row.service_name  || '',
      servicioId:  row.service_id    || null,
      precio:      row.price         || 0,
      duracion:    row.duration      || 30,
      fecha:       row.date,
      hora:        row.time,
      estado:      row.status,
      origen:      row.origin        || 'online',
      creadaEn:    row.created_at,
      pending_sync: row.pending_sync || false,
    };
  }

  function _apptToDB(c) {
    return {
      client_name:  c.clienteName,
      client_phone: c.telefono    || '',
      barber_id:    String(c.barberId),
      barber_name:  c.barberName  || '—',
      service_name: c.servicio    || '',
      service_id:   c.servicioId  || null,
      price:        c.precio      || 0,
      duration:     c.duracion    || 30,
      date:         c.fecha,
      time:         c.hora,
      status:       c.estado      || 'pending',
      origin:       c.origen      || 'online',
    };
  }

  function _blockFromDB(row) {
    return {
      id:         row.id,
      barberId:   row.barber_id,
      fecha:      row.fecha,
      horaInicio: row.hora_inicio,
      horaFin:    row.hora_fin,
      motivo:     row.motivo || '',
      creadoEn:   row.created_at,
    };
  }

  function _dayFromDB(row) {
    return {
      id:         row.id,
      barberId:   row.barber_id,
      fecha:      row.fecha,
      disponible: row.disponible,
    };
  }

  function _barberName(id) {
    const b = _ls.get('barbers', DEF_BARBERS).find(x => String(x.id) === String(id));
    return b ? b.name : '—';
  }

  /* ══════════════════════════════════════════════════════════════
     § 3  DEFAULTS
     ══════════════════════════════════════════════════════════════ */
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

  const OPEN_MINS  = 8 * 60;    // 8:00 AM
  const CLOSE_MINS = 20 * 60;   // 8:00 PM
  const SLOT_MINS  = 15;
  const SERVICE_ICONS = ['✂️','🪒','💈','🔥','⚡','🌿','💎','👑','🎯','🧴','🪮','✦','🏆','🎨'];

  /* ══════════════════════════════════════════════════════════════
     § 4  CUENTAS (solo localStorage)
     ══════════════════════════════════════════════════════════════ */
  const BUILTIN_ACCOUNTS = {
    admin:  { pass: 'blade2024', name: 'Administrador',   role: 'Administrador',    isAdmin: true,  barberId: null },
    juan:   { pass: 'barber1',   name: 'Juan Martínez',   role: 'Maestro Barbero',  isAdmin: false, barberId: 1    },
    carlos: { pass: 'barber2',   name: 'Carlos Ríos',     role: 'Barbero Senior',   isAdmin: false, barberId: 2    },
    andres: { pass: 'barber3',   name: 'Andrés Flórez',   role: 'Estilista Barbero',isAdmin: false, barberId: 3    },
  };

  /* ══════════════════════════════════════════════════════════════
     § 5  HELPERS — TIEMPO
     ══════════════════════════════════════════════════════════════ */
  function labelToMins(label) {
    const m = String(label).match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const pm = m[3].toUpperCase() === 'PM';
    if (pm  && h !== 12) h += 12;
    if (!pm && h === 12) h  =  0;
    return h * 60 + min;
  }

  function minsToLabel(total) {
    const h   = Math.floor(total / 60) % 24;
    const m   = total % 60;
    const pm  = h >= 12;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2,'0')} ${pm ? 'PM' : 'AM'}`;
  }

  /* ══════════════════════════════════════════════════════════════
     § 6  MOTOR DE DISPONIBILIDAD — síncrono, usa cache local
     El cache se refresca automáticamente con getAppointments()
     y getBlocks(). Llamar estas funciones al cargar la página.
     ══════════════════════════════════════════════════════════════ */
  function _getOccupied(barberId, fecha) {
    const out = [];

    _ls.get('cache_appts', [])
      .filter(a =>
        String(a.barberId) === String(barberId) &&
        a.fecha === fecha &&
        (a.estado === 'pending'   || a.estado === 'confirmed' ||
         a.estado === 'pendiente' || a.estado === 'confirmada'))
      .forEach(a => {
        const s = labelToMins(a.hora);
        out.push({ start: s, end: s + (a.duracion || 30) });
      });

    _ls.get('cache_blocks', [])
      .filter(b => String(b.barberId) === String(barberId) && b.fecha === fecha)
      .forEach(b => out.push({ start: labelToMins(b.horaInicio), end: labelToMins(b.horaFin) }));

    return out;
  }

  function _collision(start, dur, occupied) {
    const end = start + dur;
    return occupied.some(o => start < o.end && end > o.start);
  }

  /* ══════════════════════════════════════════════════════════════
     § 7  VALIDACIÓN DE DISPONIBILIDAD — síncrona
     ══════════════════════════════════════════════════════════════ */
  function validarDisponibilidad(barberId, fecha, hora, duracion) {
    const barber = _ls.get('barbers', DEF_BARBERS).find(b => String(b.id) === String(barberId));
    if (!barber)                      return { ok: false, razon: 'Barbero no encontrado.' };
    if (barber.status === 'inactivo') return { ok: false, razon: `${barber.name} está inactivo.` };

    const dayEntry = _ls.get('cache_barber_days', [])
      .find(d => String(d.barberId) === String(barberId) && d.fecha === fecha);
    if (dayEntry && dayEntry.disponible === false)
      return { ok: false, razon: `${barber.name} no trabaja ese día.` };

    const startM = labelToMins(hora);
    const endM   = startM + duracion;
    if (startM < OPEN_MINS)  return { ok: false, razon: 'Hora antes del horario de apertura (8:00 AM).' };
    if (endM   > CLOSE_MINS) return { ok: false, razon: 'El servicio terminaría después del cierre (8:00 PM).' };

    if (_collision(startM, duracion, _getOccupied(barberId, fecha)))
      return { ok: false, razon: `${barber.name} ya tiene un compromiso en ese horario.` };

    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════════
     § 8  APPOINTMENTS — CRUD HÍBRIDO
     ══════════════════════════════════════════════════════════════ */

  /**
   * getAppointments()
   * Trae citas desde Supabase → refresca cache local.
   * Si offline o error → retorna cache.
   */
  async function getAppointments() {
    if (!_online()) {
      console.info('[BladeDB] offline → usando cache de citas');
      return _ls.get('cache_appts', []);
    }
    try {
      const { data, error } = _sb
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map(_apptFromDB);
      _ls.set('cache_appts', mapped);
      return mapped;
    } catch (err) {
      console.error('[getAppointments]', err);
      return _ls.get('cache_appts', []);
    }
  }

  /**
   * crearCita(datos)
   * Online  → Supabase → actualizar cache.
   * Offline → cache local con pending_sync → encolar para sync.
   * Regla:  máx 1 "pending" por teléfono (citas online).
   */
  async function crearCita(datos) {
    const { clienteName, telefono, servicioId, barberId, fecha, hora, origen = 'online' } = datos;

    const services   = _ls.get('services', DEF_SERVICES);
    const servicio   = services.find(s => s.id === servicioId);
    if (!servicio) return { ok: false, razon: 'Servicio no encontrado.' };

    const duracion   = servicio.duracion || 30;
    const barber     = _ls.get('barbers', DEF_BARBERS).find(b => String(b.id) === String(barberId));
    const barberName = barber ? barber.name : '—';

    // ── Regla: solo 1 pendiente por teléfono (citas online) ───
    if (origen === 'online') {
      let existente = null;
      if (_online()) {
        try {
          const { data } = _sb
            .from('appointments')
            .select('service_name, date, time')
            .eq('client_phone', telefono)
            .in('status', ['pending', 'pendiente'])
            .limit(1);
          if (data && data.length) existente = data[0];
        } catch {
          existente = _ls.get('cache_appts', []).find(
            a => a.telefono === telefono &&
                 (a.estado === 'pending' || a.estado === 'pendiente'));
        }
      } else {
        existente = _ls.get('cache_appts', []).find(
          a => a.telefono === telefono &&
               (a.estado === 'pending' || a.estado === 'pendiente'));
      }
      if (existente) {
        const svc = existente.service_name || existente.servicio || '';
        const dt  = existente.date         || existente.fecha    || '';
        const tm  = existente.time         || existente.hora     || '';
        return { ok: false, razon: `Ya tienes una cita pendiente (${svc}, ${dt} a las ${tm}). Espera confirmación o cancélala primero.` };
      }
    }

    // ── Validar disponibilidad ─────────────────────────────────
    const val = validarDisponibilidad(barberId, fecha, hora, duracion);
    if (!val.ok) return { ok: false, razon: val.razon };

    const citaBase = {
      clienteName, telefono, servicioId,
      servicio: servicio.name, precio: servicio.price,
      barberId, barberName, fecha, hora, duracion,
      estado: 'pending', origen,
      creadaEn: new Date().toISOString(),
    };

    // ── Intentar guardar en Supabase ───────────────────────────
    if (_online()) {
      try {
        const { data, error } = _sb
          .from('appointments')
          .insert([_apptToDB(citaBase)])
          .select()
          .single();
        if (error) throw error;

        const cita  = _apptFromDB(data);
        const cache = _ls.get('cache_appts', []);
        cache.unshift(cita);
        _ls.set('cache_appts', cache);
        return { ok: true, cita, offline: false };
      } catch (err) {
        console.warn('[crearCita] Supabase falló, guardando offline:', err);
        // Continúa a modo offline
      }
    }

    // ── Modo offline ───────────────────────────────────────────
    const cita  = { ...citaBase, id: _tempId(), pending_sync: true };
    const cache = _ls.get('cache_appts', []);
    cache.unshift(cita);
    _ls.set('cache_appts', cache);
    _enqueue({ action: 'insert', table: 'appointments', payload: _apptToDB(cita), localId: cita.id });
    return { ok: true, cita, offline: true };
  }

  /**
   * cancelarCita(id)
   * Actualiza cache inmediatamente → luego Supabase.
   * Si offline → encola para sync.
   */
  async function cancelarCita(id) {
    _patchCache('cache_appts', id, { estado: 'cancelled' });

    if (_online()) {
      try {
        const { error } = _sb
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', id);
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        console.error('[cancelarCita]', err);
        _enqueue({ action: 'update', table: 'appointments', id, payload: { status: 'cancelled' } });
      }
    } else {
      _enqueue({ action: 'update', table: 'appointments', id, payload: { status: 'cancelled' } });
    }
    return { ok: true };
  }

  /**
   * confirmarCita(id)
   * Actualiza cache inmediatamente → luego Supabase.
   * Si offline → encola para sync.
   */
  async function confirmarCita(id) {
    _patchCache('cache_appts', id, { estado: 'confirmed' });

    if (_online()) {
      try {
        const { error } = _sb
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', id);
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        console.error('[confirmarCita]', err);
        _enqueue({ action: 'update', table: 'appointments', id, payload: { status: 'confirmed' } });
      }
    } else {
      _enqueue({ action: 'update', table: 'appointments', id, payload: { status: 'confirmed' } });
    }
    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════════
     § 9  BARBER DAYS — Supabase + cache
     ══════════════════════════════════════════════════════════════ */

  /**
   * getBarberDays()
   * Carga disponibilidad de todos los barberos desde Supabase.
   * Refresca cache local.
   */
  async function getBarberDays() {
    if (!_online()) return _ls.get('cache_barber_days', []);
    try {
      const { data, error } = _sb
        .from('barber_days')
        .select('*')
        .order('fecha', { ascending: true });
      if (error) throw error;
      const mapped = (data || []).map(_dayFromDB);
      _ls.set('cache_barber_days', mapped);
      return mapped;
    } catch (err) {
      console.error('[getBarberDays]', err);
      return _ls.get('cache_barber_days', []);
    }
  }

  /**
   * setBarberDay(barberId, fecha, disponible)
   * Actualiza cache inmediatamente (UI no espera).
   * Hace upsert en Supabase o encola si offline.
   */
  async function setBarberDay(barberId, fecha, disponible) {
    const cache = _ls.get('cache_barber_days', []);
    const idx   = cache.findIndex(d => String(d.barberId) === String(barberId) && d.fecha === fecha);
    const entry = { barberId: String(barberId), fecha, disponible };
    if (idx > -1) cache[idx] = entry; else cache.push(entry);
    _ls.set('cache_barber_days', cache);

    const payload = { barber_id: String(barberId), fecha, disponible };

    if (_online()) {
      try {
        const { error } = _sb
          .from('barber_days')
          .upsert([payload], { onConflict: 'barber_id,fecha' });
        if (error) throw error;
        return;
      } catch (err) {
        console.warn('[setBarberDay] encolando offline:', err);
      }
    }
    _enqueue({ action: 'upsert', table: 'barber_days', payload });
  }

  /**
   * getBarberDay(barberId, fecha) — síncrono
   * Lee desde cache. Retorna true por defecto (disponible).
   */
  function getBarberDay(barberId, fecha) {
    const entry = _ls.get('cache_barber_days', [])
      .find(d => String(d.barberId) === String(barberId) && d.fecha === fecha);
    return entry ? entry.disponible !== false : true;
  }

  /* ══════════════════════════════════════════════════════════════
     § 10  BLOCKS — Supabase + cache
     ══════════════════════════════════════════════════════════════ */

  /**
   * getBlocks(barberId?, fecha?)
   * Trae bloqueos desde Supabase con filtros opcionales.
   * Actualiza cache local con merge (no reemplaza todo).
   */
  async function getBlocks(barberId = null, fecha = null) {
    if (!_online()) return _ls.get('cache_blocks', []);
    try {
      let q = _sb.from('blocks').select('*').order('created_at', { ascending: false });
      if (barberId) q = q.eq('barber_id', String(barberId));
      if (fecha)    q = q.eq('fecha', fecha);
      const { data, error } = await q;
      if (error) throw error;
      const mapped = (data || []).map(_blockFromDB);
      let cache = _ls.get('cache_blocks', []);
      mapped.forEach(b => {
        const idx = cache.findIndex(c => c.id === b.id);
        if (idx > -1) cache[idx] = b; else cache.push(b);
      });
      _ls.set('cache_blocks', cache);
      return mapped;
    } catch (err) {
      console.error('[getBlocks]', err);
      return _ls.get('cache_blocks', []);
    }
  }

  /**
   * crearBloqueo(datos)
   * Online  → Supabase → cache.
   * Offline → cache local con pending_sync → encola.
   */
  async function crearBloqueo(datos) {
    const { barberId, fecha, horaInicio, horaFin, motivo = '' } = datos;
    if (!barberId || !fecha || !horaInicio || !horaFin)
      return { ok: false, razon: 'Faltan campos obligatorios.' };
    if (labelToMins(horaInicio) >= labelToMins(horaFin))
      return { ok: false, razon: 'La hora de inicio debe ser anterior a la hora de fin.' };

    const payload = { barber_id: String(barberId), fecha, hora_inicio: horaInicio, hora_fin: horaFin, motivo };

    if (_online()) {
      try {
        const { data, error } = _sb
          .from('blocks').insert([payload]).select().single();
        if (error) throw error;
        const blk   = _blockFromDB(data);
        const cache = _ls.get('cache_blocks', []);
        cache.unshift(blk);
        _ls.set('cache_blocks', cache);
        return { ok: true, bloqueo: blk };
      } catch (err) {
        console.warn('[crearBloqueo] offline fallback:', err);
      }
    }

    const blk   = { id: _tempId(), barberId: String(barberId), fecha, horaInicio, horaFin, motivo, pending_sync: true };
    const cache = _ls.get('cache_blocks', []);
    cache.unshift(blk);
    _ls.set('cache_blocks', cache);
    _enqueue({ action: 'insert', table: 'blocks', payload });
    return { ok: true, bloqueo: blk, offline: true };
  }

  /**
   * eliminarBloqueo(id)
   * Elimina del cache inmediatamente → luego Supabase.
   */
  async function eliminarBloqueo(id) {
    _ls.set('cache_blocks', _ls.get('cache_blocks', []).filter(b => b.id !== id));
    if (_online()) {
      try {
        const { error } = await _sb.from('blocks').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[eliminarBloqueo]', err);
        return { ok: false, razon: err.message };
      }
    }
    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════════
     § 11  DISPONIBILIDAD POR BARBERO — síncrona (usa cache)
     ══════════════════════════════════════════════════════════════ */
  function obtenerDisponibilidadPorBarbero(barberId, fecha, duracion = 30, soloHoy = false) {
    const barber = _ls.get('barbers', DEF_BARBERS).find(b => String(b.id) === String(barberId));
    if (!barber || barber.status === 'inactivo') return [];
    if (!getBarberDay(barberId, fecha)) return [];

    let minMins = OPEN_MINS;
    if (soloHoy) {
      const now  = new Date();
      const nowM = now.getHours() * 60 + now.getMinutes() + 15;
      minMins    = Math.max(OPEN_MINS, Math.ceil(nowM / SLOT_MINS) * SLOT_MINS);
    }

    const occupied = _getOccupied(barberId, fecha);
    const slots    = [];
    for (let s = OPEN_MINS; s + duracion <= CLOSE_MINS; s += SLOT_MINS) {
      if (s < minMins) continue;
      if (!_collision(s, duracion, occupied)) slots.push(minsToLabel(s));
    }
    return slots;
  }

  function asignacionAutomatica(fecha, duracion) {
    const barbers     = _ls.get('barbers', DEF_BARBERS);
    const disponibles = barbers.filter(b => b.status !== 'inactivo' && getBarberDay(b.id, fecha));
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

  /* ══════════════════════════════════════════════════════════════
     § 12  COLA OFFLINE + SYNC AUTOMÁTICO
     ══════════════════════════════════════════════════════════════ */
  function _enqueue(item) {
    const q = _ls.get('sync_queue', []);
    q.push(item);
    _ls.set('sync_queue', q);
  }

  function _patchCache(cacheKey, id, patch) {
    const cache = _ls.get(cacheKey, []);
    const idx   = cache.findIndex(x => x.id === id);
    if (idx > -1) { Object.assign(cache[idx], patch); _ls.set(cacheKey, cache); }
  }

  /**
   * syncPendingAppointments()
   * Procesa la cola offline cuando se restaura la conexión.
   * Llamada automáticamente vía window.addEventListener("online").
   * También puede llamarse manualmente.
   */
  async function syncPendingAppointments() {
    if (!_online()) return { synced: 0, failed: 0 };
    const queue = _ls.get('sync_queue', []);
    if (!queue.length) return { synced: 0, failed: 0 };

    let synced = 0, failed = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        if (item.action === 'insert') {
          const { data, error } = _sb
            .from(item.table).insert([item.payload]).select().single();
          if (error) throw error;

          // Reemplazar id temporal por el UUID real de Supabase
          if (item.table === 'appointments' && item.localId) {
            const cache = _ls.get('cache_appts', []);
            const idx   = cache.findIndex(a => a.id === item.localId);
            if (idx > -1) {
              cache[idx] = { ..._apptFromDB(data), pending_sync: false };
              _ls.set('cache_appts', cache);
            }
          }
          synced++;

        } else if (item.action === 'update') {
          const { error } = _sb
            .from(item.table).update(item.payload).eq('id', item.id);
          if (error) throw error;
          synced++;

        } else if (item.action === 'upsert') {
          const { error } = _sb
            .from(item.table)
            .upsert([item.payload], { onConflict: 'barber_id,fecha' });
          if (error) throw error;
          synced++;
        }
      } catch (err) {
        console.error('[sync] fallo en item:', item, err);
        failed++;
        remaining.push(item);
      }
    }

    _ls.set('sync_queue', remaining);
    console.info(`[BladeDB] Sync: ${synced} subidos, ${failed} pendientes.`);
    return { synced, failed };
  }

  // ── Auto-sync al recuperar conexión ───────────────────────────
  window.addEventListener('online', () => {
    console.info('[BladeDB] Conexión restaurada — sincronizando...');
    syncPendingAppointments();
  });

  /* ══════════════════════════════════════════════════════════════
     § 13  PUBLIC API
     ══════════════════════════════════════════════════════════════ */
  return {

    /* ── localStorage puro ────────────────────────────────────── */
    getBarbers:  ()  => _ls.get('barbers', DEF_BARBERS),
    saveBarbers: (v) => _ls.set('barbers', v),

    getServices:  ()  => _ls.get('services', DEF_SERVICES),
    saveServices: (v) => _ls.set('services', v),

    getInventory:  ()  => _ls.get('inv', DEF_INVENTORY),
    saveInventory: (v) => _ls.set('inv', v),

    getCuts:  ()    => _ls.get('cuts', []),
    saveCuts: (v)   => _ls.set('cuts', v),
    addCut:   (cut) => {
      const cuts = _ls.get('cuts', []);
      cuts.push({ ...cut, id: _tempId() });
      _ls.set('cuts', cuts);
    },

    getContact:  ()  => _ls.get('contact', DEF_CONTACT),
    saveContact: (v) => _ls.set('contact', v),

    getAccounts: () => Object.assign({}, BUILTIN_ACCOUNTS, _ls.get('extra_accounts', {})),
    addAccount:  (username, data) => {
      const e = _ls.get('extra_accounts', {}); e[username] = data; _ls.set('extra_accounts', e);
    },
    updateAccountPass: (username, newPass) => {
      const all = Object.assign({}, BUILTIN_ACCOUNTS, _ls.get('extra_accounts', {}));
      const e   = _ls.get('extra_accounts', {});
      e[username] = { ...(all[username] || {}), pass: newPass };
      _ls.set('extra_accounts', e);
    },
    deleteAccount: (username) => {
      const e = _ls.get('extra_accounts', {}); delete e[username]; _ls.set('extra_accounts', e);
    },

    /* ── Supabase async ───────────────────────────────────────── */
    getAppointments,
    saveAppointments: () => console.warn('[BladeDB] Usa crearCita / cancelarCita / confirmarCita.'),
    crearCita,
    cancelarCita,
    confirmarCita,
    syncPendingAppointments,

    getBarberDays,
    setBarberDay,
    getBarberDay,
    saveBarberDays: () => console.warn('[BladeDB] Usa setBarberDay().'),

    getBlocks,
    saveBlocks: () => console.warn('[BladeDB] Usa crearBloqueo().'),
    crearBloqueo,
    eliminarBloqueo,

    /* ── Síncronas (usan cache) ───────────────────────────────── */
    validarDisponibilidad,
    obtenerDisponibilidadPorBarbero,
    asignacionAutomatica,

    /* ── Estado online / debug ────────────────────────────────── */
    isOnline:       () => _online(),
    getSyncQueue:   () => _ls.get('sync_queue', []),
    clearSyncQueue: () => _ls.set('sync_queue', []),

    /* ── Helpers ──────────────────────────────────────────────── */
    nextId:     (arr) => arr.length ? Math.max(...arr.map(x => +x.id || 0)) + 1 : 1,
    randomIcon: ()    => SERVICE_ICONS[Math.floor(Math.random() * SERVICE_ICONS.length)],
    labelToMins,
    minsToLabel,
    todayISO:   ()    => new Date().toISOString().slice(0, 10),
    OPEN_MINS,
    CLOSE_MINS,
    SLOT_MINS,

    fmt: (n) => {
      if (!n) return '$0';
      if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
      return '$' + n.toLocaleString('es-CO');
    },
    fmtFull: (n) => '$' + (n || 0).toLocaleString('es-CO'),
    dateStr:  (ts) => new Date(ts).toLocaleDateString('es-CO',  { day: '2-digit', month: 'short', year: 'numeric' }),
    timeStr:  (ts) => new Date(ts).toLocaleTimeString('es-CO',  { hour: '2-digit', minute: '2-digit' }),

    // Acepta valores en inglés (Supabase) y español (legacy)
    estadoBadge: (e) => ({
      pending:    '<span class="badge b-orange"><span class="bdot"></span>Pendiente</span>',
      pendiente:  '<span class="badge b-orange"><span class="bdot"></span>Pendiente</span>',
      confirmed:  '<span class="badge b-green"><span class="bdot"></span>Confirmada</span>',
      confirmada: '<span class="badge b-green"><span class="bdot"></span>Confirmada</span>',
      cancelled:  '<span class="badge b-red"><span class="bdot"></span>Cancelada</span>',
      cancelada:  '<span class="badge b-red"><span class="bdot"></span>Cancelada</span>',
    }[e] || `<span class="badge b-gray">${e || '—'}</span>`),

    origenBadge: (o) => o === 'presencial'
      ? '<span class="badge b-blue">Presencial</span>'
      : '<span class="badge b-gray">Online</span>',
  };
})();
