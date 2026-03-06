/**
 * BLADE — main.js  v3
 * Lógica de la página pública.
 * Toda lógica de negocio se delega a BladeDB (v4 — Supabase híbrido).
 *
 * IMPORTANTE: crearCita, cancelarCita, getAppointments son async.
 * Todas las funciones que las llaman usan await.
 */
document.addEventListener('DOMContentLoaded', async () => {

  /* ── CURSOR ─────────────────────────────────────────────── */
  const cur  = document.getElementById('cur');
  const curR = document.getElementById('curRing');
  let mx = 0, my = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  (function loop() {
    cur.style.left  = mx + 'px'; cur.style.top  = my + 'px';
    rx += (mx - rx) * 0.13;     ry += (my - ry) * 0.13;
    curR.style.left = rx + 'px'; curR.style.top = ry + 'px';
    requestAnimationFrame(loop);
  })();
  document.addEventListener('mouseover', e => {
    if (e.target.closest('a,button,.service-card,.team-card,.product-card,input,select,textarea')) {
      curR.style.width = '54px'; curR.style.height = '54px'; curR.style.borderColor = 'rgba(201,168,76,.85)';
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('a,button,.service-card,.team-card,.product-card,input,select,textarea')) {
      curR.style.width = '36px'; curR.style.height = '36px'; curR.style.borderColor = 'rgba(201,168,76,.4)';
    }
  });

  /* ── HEXAGON CANVAS ─────────────────────────────────────── */
  (function initHex() {
    const canvas = document.getElementById('hexCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, hexes = [];
    const SIZE = 52, GAP = 3;
    function resize() { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; buildGrid(); }
    function buildGrid() {
      hexes = [];
      const cW = SIZE * 1.5, rH = Math.sqrt(3) * SIZE;
      for (let r = -1, rows = Math.ceil(H/rH)+2; r < rows; r++)
        for (let c = -1, cols = Math.ceil(W/cW)+2; c < cols; c++)
          hexes.push({ cx: c*cW, cy: r*rH+(c%2!==0?rH/2:0), r: SIZE-GAP,
            phase: Math.random()*Math.PI*2, speed: .005+Math.random()*.012,
            baseA: .02+Math.random()*.04, peakA: .1+Math.random()*.25,
            color: Math.random()>.65?'201,168,76':'210,205,195', gs: 6+Math.random()*14 });
    }
    function hexPath(cx,cy,r) {
      ctx.beginPath();
      for (let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6; i===0?ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a)):ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}
      ctx.closePath();
    }
    function draw() {
      ctx.clearRect(0,0,W,H); ctx.fillStyle='#07070c'; ctx.fillRect(0,0,W,H);
      hexes.forEach(h => {
        h.phase+=h.speed; const t=(Math.sin(h.phase)+1)/2, al=h.baseA+(h.peakA-h.baseA)*t;
        hexPath(h.cx,h.cy,h.r); ctx.fillStyle=`rgba(${h.color},${al*.22})`; ctx.fill();
        hexPath(h.cx,h.cy,h.r); ctx.strokeStyle=`rgba(${h.color},${al})`; ctx.lineWidth=.5+t*1.5; ctx.stroke();
        if(t>.8){const int=(t-.8)/.2; for(let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6;const px=h.cx+h.r*Math.cos(a),py=h.cy+h.r*Math.sin(a);const g=ctx.createRadialGradient(px,py,0,px,py,h.gs);g.addColorStop(0,`rgba(${h.color},${int*.65})`);g.addColorStop(1,`rgba(${h.color},0)`);ctx.beginPath();ctx.arc(px,py,h.gs,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();}}
      });
      const vig=ctx.createRadialGradient(W/2,H/2,H*.1,W/2,H/2,H*.9);
      vig.addColorStop(0,'rgba(7,7,12,0)');vig.addColorStop(1,'rgba(7,7,12,.8)');
      ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);
      requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize); resize(); draw();
  })();

  /* ── SCROLL REVEAL ──────────────────────────────────────── */
  const revObs = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.1 }
  );
  function observeAll() { document.querySelectorAll('.reveal:not(.visible)').forEach(el => revObs.observe(el)); }
  observeAll();

  /* ── COUNTERS ────────────────────────────────────────────── */
  const cObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const target = parseInt(e.target.dataset.target);
      let v = 0; const step = target / (2000/16);
      const iv = setInterval(() => { v+=step; if(v>=target){v=target;clearInterval(iv);} e.target.textContent=Math.floor(v).toLocaleString(); }, 16);
      cObs.unobserve(e.target);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-target]').forEach(el => cObs.observe(el));

  /* ── NOTIFICATION ────────────────────────────────────────── */
  let notifTimer = null;
  window.showNotif = (title, msg) => {
    clearTimeout(notifTimer);
    document.getElementById('notifT').textContent = title;
    document.getElementById('notifM').textContent = msg;
    const n = document.getElementById('notification');
    n.classList.add('show');
    notifTimer = setTimeout(() => n.classList.remove('show'), 4000);
  };

  /* ══════════════════════════════════════════════════════════
     RENDER — PÁGINA PÚBLICA (síncrono — no usa Supabase)
     ══════════════════════════════════════════════════════════ */
  function renderServices() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;
    const services = BladeDB.getServices();
    if (!services.length) { grid.innerHTML = '<p style="color:var(--muted);text-align:center;padding:60px;grid-column:1/-1;">Sin servicios disponibles.</p>'; return; }
    grid.innerHTML = services.map((s, i) => `
      <div class="service-card reveal reveal-delay-${(i%3)+1}">
        <span class="service-num">0${i+1}</span>
        <div class="service-icon">${s.icon||'✂️'}</div>
        <div class="service-name">${s.name}</div>
        <p class="service-desc">${s.desc}</p>
        <div class="service-price">${BladeDB.fmtFull(s.price)} <span>COP</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">⏱ ${s.duracion||30} min</div>
      </div>`).join('');
    observeAll();
  }

  function renderTeam() {
    const grid = document.getElementById('teamGrid');
    if (!grid) return;
    const barbers = BladeDB.getBarbers();
    grid.innerHTML = barbers.map((b, i) => `
      <div class="team-card reveal reveal-delay-${i+1}">
        <div class="team-photo">
          ${b.photo ? `<img src="${b.photo}" alt="${b.name}">` : `<div class="team-photo-placeholder">${b.name.split(' ').map(n=>n[0]).join('')}</div>`}
          <div class="team-photo-overlay"></div>
          <div class="team-status-badge ${b.status}">
            <span class="status-dot"></span>
            ${b.status==='disponible'?'Disponible':'Inactivo'}
          </div>
        </div>
        <div class="team-info">
          <div class="team-name">${b.name}</div>
          <div class="team-role">${b.role}</div>
          <p class="team-spec">${b.spec}</p>
          <div class="team-rating">
            ${'<span class="star">★</span>'.repeat(b.stars)}${'<span class="star empty">★</span>'.repeat(5-b.stars)}
          </div>
        </div>
      </div>`).join('');
    observeAll();
  }

  function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const items = BladeDB.getInventory().filter(i => i.qty > 0);
    if (!items.length) { grid.innerHTML = '<p style="color:var(--muted);text-align:center;padding:60px;grid-column:1/-1;">Sin productos disponibles en este momento.</p>'; observeAll(); return; }
    grid.innerHTML = items.map((p, i) => `
      <div class="product-card reveal reveal-delay-${(i%4)+1}">
        <div class="product-icon">🛍️</div>
        <div class="product-name">${p.name}</div>
        <p class="product-desc">${p.desc||''}</p>
        <div class="product-price">${BladeDB.fmtFull(p.price)} <span>COP</span></div>
      </div>`).join('');
    observeAll();
  }

  function renderContact() {
    const c = BladeDB.getContact();
    const ids = {
      contactPhone: c.phone, contactEmail: c.email, contactInsta: c.instagram,
      contactAddress: c.address, contactCity: c.city,
      contactSched1: c.scheduleWeek, contactSched2: c.scheduleSun,
      footerPhone: c.phone, footerEmail: c.email, footerInsta: c.instagram,
    };
    Object.entries(ids).forEach(([id, val]) => { const el=document.getElementById(id); if(el) el.textContent=val; });
    const wa = document.getElementById('waBtn');
    if (wa) wa.href = `https://wa.me/${c.whatsapp.replace(/\D/g,'')}?text=Hola%2C%20quiero%20reservar%20una%20cita`;
    const waFloat = document.getElementById('waFloat');
    if (waFloat) waFloat.href = `https://wa.me/${c.whatsapp.replace(/\D/g,'')}?text=Hola%2C%20quiero%20reservar%20una%20cita`;
  }

  /* ══════════════════════════════════════════════════════════
     BOOKING — carga el cache de Supabase al iniciar
     ══════════════════════════════════════════════════════════ */
  let _selectedDuracion = 30;
  let _selectedBarberId = 'auto';

  // Cargar citas y disponibilidad al iniciar para que el motor de slots tenga cache fresco
  await Promise.all([
    BladeDB.getAppointments(),
    BladeDB.getBlocks(),
    BladeDB.getBarberDays(),
  ]);

  function renderBookingServices() {
    const sel = document.getElementById('bookService');
    if (!sel) return;
    const services = BladeDB.getServices();
    sel.innerHTML = `<option value="">Seleccionar servicio...</option>` +
      services.map(s => `<option value="${s.id}" data-dur="${s.duracion||30}">${s.name} — ${BladeDB.fmtFull(s.price)} (${s.duracion||30} min)</option>`).join('');
  }

  function renderBookingBarbers() {
    const sel = document.getElementById('bookBarber');
    if (!sel) return;
    const barbers = BladeDB.getBarbers();
    sel.innerHTML = `<option value="auto">✦ Asignación automática</option>` +
      barbers.map(b => `<option value="${b.id}" ${b.status==='inactivo'?'disabled style="color:grey"':''}>${b.name} — ${b.role}${b.status==='inactivo'?' (inactivo)':''}</option>`).join('');
  }

  function renderTimeSlots() {
    const sel    = document.getElementById('bookTime');
    const dateEl = document.getElementById('bookDate');
    if (!sel || !dateEl) return;

    const fecha   = dateEl.value;
    const today   = BladeDB.todayISO();
    const soloHoy = fecha === today;
    let slots     = [];

    if (_selectedBarberId === 'auto') {
      const barbers  = BladeDB.getBarbers().filter(b => b.status !== 'inactivo');
      const slotsSet = new Set();
      barbers.forEach(b => {
        BladeDB.obtenerDisponibilidadPorBarbero(b.id, fecha, _selectedDuracion, soloHoy)
               .forEach(s => slotsSet.add(s));
      });
      slots = [...slotsSet].sort((a, b) => BladeDB.labelToMins(a) - BladeDB.labelToMins(b));
    } else {
      const bid = parseInt(_selectedBarberId);
      slots = BladeDB.obtenerDisponibilidadPorBarbero(bid, fecha, _selectedDuracion, soloHoy);
    }

    sel.innerHTML = slots.length
      ? `<option value="">Seleccionar hora...</option>` + slots.map(s => `<option value="${s}">${s}</option>`).join('')
      : `<option value="">⚠ Sin horarios disponibles — prueba otra fecha o barbero</option>`;
  }

  document.getElementById('bookService')?.addEventListener('change', function() {
    const opt = this.options[this.selectedIndex];
    _selectedDuracion = parseInt(opt.dataset.dur) || 30;
    renderTimeSlots();
  });

  document.getElementById('bookBarber')?.addEventListener('change', function() {
    _selectedBarberId = this.value === 'auto' ? 'auto' : parseInt(this.value);
    renderTimeSlots();
  });

  const bookDateEl = document.getElementById('bookDate');
  if (bookDateEl) {
    const today = BladeDB.todayISO();
    bookDateEl.min   = today;
    bookDateEl.value = today;
    bookDateEl.addEventListener('change', renderTimeSlots);
    renderTimeSlots();
  }

  /* ── SUBMIT BOOKING FORM — async ─────────────────────────── */
  const bookForm = document.getElementById('bookingForm');
  if (bookForm) {
    bookForm.addEventListener('submit', async e => {
      e.preventDefault();

      const clienteName = document.getElementById('bookName').value.trim();
      const telefono    = document.getElementById('bookPhone').value.trim().replace(/\s/g, '');
      const servicioId  = parseInt(document.getElementById('bookService').value);
      const fecha       = document.getElementById('bookDate').value;
      const hora        = document.getElementById('bookTime').value;

      if (!clienteName || !telefono || !servicioId || !fecha || !hora) {
        showNotif('Campos incompletos', 'Por favor completa todos los campos obligatorios.');
        return;
      }

      let barberId = _selectedBarberId === 'auto'
        ? BladeDB.asignacionAutomatica(fecha, _selectedDuracion)
        : parseInt(_selectedBarberId);

      if (!barberId) {
        showNotif('Sin disponibilidad', 'No hay barberos disponibles para ese día y servicio.');
        return;
      }

      // Deshabilitar botón mientras se procesa
      const submitBtn = bookForm.querySelector('[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Procesando...'; }

      const result = await BladeDB.crearCita({ clienteName, telefono, servicioId, barberId, fecha, hora, origen: 'online' });

      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Solicitar Cita'; }

      if (!result || !result.ok) {
        showNotif('No se pudo reservar', result?.razon || 'Error inesperado. Intenta de nuevo.');
        return;
      }

      const offlineMsg = result.offline ? ' (guardada offline — se sincronizará cuando haya conexión)' : '';
      showNotif(
        '¡Cita Solicitada!',
        `${result.cita.servicio} con ${result.cita.barberName} el ${fecha} a las ${hora}. Pendiente de confirmación.${offlineMsg}`
      );

      bookForm.reset();
      if (bookDateEl) bookDateEl.value = BladeDB.todayISO();
      _selectedDuracion = 30;
      _selectedBarberId = 'auto';
      renderBookingBarbers();
      renderBookingServices();
      renderTimeSlots();

      // Mostrar panel del cliente automáticamente
      document.getElementById('clientePhone').value = telefono;
      await renderClientPanel(telefono);
      document.getElementById('clientPanel')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ══════════════════════════════════════════════════════════
     PANEL CLIENTE — historial por teléfono
     ══════════════════════════════════════════════════════════ */
  window.buscarCitasCliente = async () => {
    const tel = document.getElementById('clientePhone')?.value.trim().replace(/\s/g, '');
    if (!tel) return;
    await renderClientPanel(tel);
  };

  async function renderClientPanel(telefono) {
    const wrap = document.getElementById('clientCitas');
    if (!wrap) return;

    wrap.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:24px 0;text-align:center;">Buscando citas...</div>`;

    // Traer desde Supabase (refresca cache)
    const allAppts = await BladeDB.getAppointments();
    const appts    = allAppts
      .filter(a => a.telefono === telefono)
      .sort((a, b) => new Date(b.creadaEn) - new Date(a.creadaEn));

    if (!appts.length) {
      wrap.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:24px 0;">No se encontraron citas para este número.</div>`;
      return;
    }

    wrap.innerHTML = appts.map(a => `
      <div class="client-cita-row" style="background:var(--surface);border:1px solid var(--border);padding:20px 24px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
          <div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;margin-bottom:6px;">${a.servicio||'—'}</div>
            <div style="font-size:12px;color:var(--muted);line-height:2;">
              <span>👤 ${a.barberName}</span> &nbsp;·&nbsp;
              <span>📅 ${a.fecha}</span> &nbsp;·&nbsp;
              <span>🕐 ${a.hora}</span> &nbsp;·&nbsp;
              <span>⏱ ${a.duracion||30} min</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px;">Precio: <strong style="color:var(--gold);">${BladeDB.fmtFull(a.precio||0)}</strong></div>
            ${a.pending_sync ? '<div style="font-size:10px;color:var(--orange);margin-top:4px;">⚠ Pendiente de sincronización</div>' : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
            ${BladeDB.estadoBadge(a.estado)}
            ${BladeDB.origenBadge(a.origen)}
            ${(a.estado !== 'cancelled' && a.estado !== 'cancelada')
              ? `<button onclick="cancelarMiCita('${a.id}')" style="background:transparent;border:1px solid rgba(239,68,68,.3);color:#f87171;padding:5px 12px;font-size:9px;letter-spacing:2px;text-transform:uppercase;cursor:none;font-family:'DM Sans',sans-serif;transition:all .3s;" onmouseover="this.style.borderColor='#ef4444'" onmouseout="this.style.borderColor='rgba(239,68,68,.3)'">Cancelar</button>`
              : ''}
          </div>
        </div>
      </div>`).join('');
  }

  window.cancelarMiCita = async (id) => {
    if (!confirm('¿Confirmas la cancelación de esta cita?')) return;
    const result = await BladeDB.cancelarCita(id);
    if (!result.ok) { showNotif('Error', result.razon); return; }
    const tel = document.getElementById('clientePhone')?.value.trim().replace(/\s/g, '');
    if (tel) await renderClientPanel(tel);
    renderTimeSlots();
    showNotif('Cita Cancelada', 'Tu cita fue cancelada. El slot ya está disponible.');
  };

  /* ── CROSS-TAB: recarga cuando admin cambia datos ─────────── */
  window.addEventListener('storage', async () => {
    renderServices();
    renderTeam();
    renderProducts();
    renderContact();
    renderBookingBarbers();
    renderBookingServices();
    // Refrescar cache de disponibilidad también
    await BladeDB.getAppointments();
    await BladeDB.getBlocks();
    renderTimeSlots();
  });

  /* ── INIT ────────────────────────────────────────────────── */
  renderServices();
  renderTeam();
  renderProducts();
  renderContact();
  renderBookingBarbers();
  renderBookingServices();
});
