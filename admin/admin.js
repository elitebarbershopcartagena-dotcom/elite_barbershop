/**
 * BLADE — admin.js  v2
 * Panel Administrativo completo.
 * Toda lógica de negocio se delega a BladeDB.
 * Este archivo solo maneja DOM, eventos y render.
 */
document.addEventListener('DOMContentLoaded', () => {

  /* ── CURSOR ─────────────────────────────────────────────── */
  const cur = document.getElementById('cur'), curR = document.getElementById('curRing');
  let mx = 0, my = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });
  (function loop(){cur.style.left=mx+'px';cur.style.top=my+'px';rx+=(mx-rx)*.14;ry+=(my-ry)*.14;curR.style.left=rx+'px';curR.style.top=ry+'px';requestAnimationFrame(loop);})();
  document.addEventListener('mouseover',e=>{if(e.target.closest('button,input,select,a,.nav-it,.tgl,.tbl tbody tr')){curR.style.width='42px';curR.style.height='42px';curR.style.borderColor='rgba(201,168,76,.8)';}});
  document.addEventListener('mouseout', e=>{if(e.target.closest('button,input,select,a,.nav-it,.tgl,.tbl tbody tr')){curR.style.width='28px';curR.style.height='28px';curR.style.borderColor='rgba(201,168,76,.35)';}});

  /* ── STATE ──────────────────────────────────────────────── */
  let CU = null;

  /* ── NOTIFICATION ────────────────────────────────────────── */
  let notifTimer = null;
  window.showNotif = (t, m) => {
    clearTimeout(notifTimer);
    document.getElementById('notifT').textContent = t;
    document.getElementById('notifM').textContent = m;
    const n = document.getElementById('notif');
    n.classList.add('show');
    notifTimer = setTimeout(() => n.classList.remove('show'), 3400);
  };

  /* ══════════════════════════════════════════════════════════
     LOGIN
     ══════════════════════════════════════════════════════════ */
  window.doLogin = () => {
    const u = document.getElementById('lu').value.trim().toLowerCase();
    const p = document.getElementById('lp').value;
    const acc = BladeDB.getAccounts()[u];
    if (!acc || acc.pass !== p) {
      document.getElementById('lerr').textContent = 'Usuario o contraseña incorrectos.';
      setTimeout(() => document.getElementById('lerr').textContent = '', 3000);
      return;
    }
    CU = { username: u, ...acc };
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const b = BladeDB.getBarbers().find(x => x.id === CU.barberId);
    document.getElementById('sbName').textContent = CU.name;
    document.getElementById('sbRole').textContent = CU.role;
    const avEl = document.getElementById('sbAv');
    if (b && b.photo) avEl.innerHTML = `<img src="${b.photo}">`;
    else avEl.textContent = CU.name.split(' ').map(n=>n[0]).join('').substring(0,2);
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = CU.isAdmin ? '' : 'none');
    initAll();
  };

  window.logout = () => {
    CU = null;
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginWrap').style.display = 'flex';
    document.getElementById('lu').value = ''; document.getElementById('lp').value = '';
  };

  document.getElementById('lp').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  /* ══════════════════════════════════════════════════════════
     NAVIGATION
     ══════════════════════════════════════════════════════════ */
  window.gotoPanel = (id, el) => {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-it').forEach(n => n.classList.remove('active'));
    document.getElementById('panel-' + id).classList.add('active');
    el.classList.add('active');
    const map = {
      dashboard: renderDashboard, cortes: renderCortes, miperfil: renderMyProfile,
      agenda: renderAgenda, bloqueos: renderBloqueos,
      reportes: renderReportes, equipo: renderEquipo, servicios: renderServicios,
      inventario: renderInv, contacto: renderContactForm,
    };
    map[id]?.();
  };

  /* ══════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════ */
  function initAll() {
    document.getElementById('dashDate').textContent = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('cortesUserLabel').textContent = 'Registrando como: ' + CU.name;
    populateBarberFilters();
    renderDashboard();
    renderMyProfile();
    if (CU.isAdmin) { renderAgenda(); renderBloqueos(); renderReportes(); renderEquipo(); renderServicios(); renderInv(); renderContactForm(); }
  }

  /* ── UTILS ───────────────────────────────────────────────── */
  const { fmt, fmtFull, dateStr, timeStr, estadoBadge, origenBadge } = BladeDB;
  const isToday  = ts => new Date(ts).toDateString() === new Date().toDateString();
  const isWeek   = ts => { const d=new Date(ts),n=new Date(),s=new Date(n); s.setDate(n.getDate()-n.getDay()); return d>=s; };
  const isMonth  = ts => { const d=new Date(ts),n=new Date(); return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); };
  const inRange  = (ts,f,t) => { const d=new Date(ts); return d>=new Date(f)&&d<=new Date(t+'T23:59:59'); };

  function filterPeriod(arr, period, from, to) {
    if (period==='today')  return arr.filter(c=>isToday(c.ts||c.creadaEn));
    if (period==='week')   return arr.filter(c=>isWeek(c.ts||c.creadaEn));
    if (period==='month')  return arr.filter(c=>isMonth(c.ts||c.creadaEn));
    if (period==='custom'&&from&&to) return arr.filter(c=>inRange(c.ts||c.creadaEn,from,to));
    return arr;
  }

  function payBadge(c) {
    if (c.payType==='efectivo')       return `<span class="badge b-green"><span class="bdot"></span>Efectivo</span>`;
    if (c.payType==='transferencia')  return `<span class="badge b-gold"><span class="bdot"></span>Transferencia</span>`;
    return `<span class="badge b-purple"><span class="bdot"></span>Mixto</span>`;
  }

  /* ── HORA SLOTS para formularios admin ───────────────────── */
  function buildAllSlots() {
    const slots = [];
    for (let m = BladeDB.OPEN_MINS; m < BladeDB.CLOSE_MINS; m += BladeDB.SLOT_MINS)
      slots.push(BladeDB.minsToLabel(m));
    return slots;
  }

  /* ══════════════════════════════════════════════════════════
     DASHBOARD
     ══════════════════════════════════════════════════════════ */
  let dashFilter = 'all';

  function populateBarberFilters() {
    const barbers = BladeDB.getBarbers();
    const bfb = document.getElementById('barberFilterBtns');
    if (bfb) bfb.innerHTML =
      `<button class="fb active" onclick="setDashFilter('all',this)">Todos</button>` +
      barbers.map(b=>`<button class="fb" onclick="setDashFilter(${b.id},this)">${b.name.split(' ')[0]}</button>`).join('');
    ['dashRecentFilter','repBarber'].forEach(id=>{
      const sel=document.getElementById(id); if(!sel) return;
      sel.innerHTML=`<option value="all">Todos los barberos</option>`+barbers.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    });
  }

  window.setDashFilter = (v, btn) => {
    dashFilter = v;
    document.querySelectorAll('#barberFilterBtns .fb').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); renderDashboard();
  };

  function renderDashboard() {
    let cuts = BladeDB.getCuts();
    const todayCuts = cuts.filter(c=>isToday(c.ts));
    const filt = dashFilter==='all' ? todayCuts : todayCuts.filter(c=>c.barberId==dashFilter);
    const ef=filt.reduce((a,b)=>a+(b.ef||0),0), tr=filt.reduce((a,b)=>a+(b.tr||0),0);

    // KPI de citas de hoy
    const appts = BladeDB.getAppointments();
    const todayISO = BladeDB.todayISO();
    const apptHoy  = appts.filter(a=>a.fecha===todayISO&&a.estado!=='cancelada');
    const pending  = appts.filter(a=>a.estado==='pendiente').length;

    document.getElementById('kpiHoyRow').innerHTML = `
      <div class="kpi"><div class="kpi-l">Cortes Hoy</div><div class="kpi-v white">${filt.length}</div></div>
      <div class="kpi"><div class="kpi-l">Efectivo Hoy</div><div class="kpi-v green">${fmt(ef)}</div><div class="kpi-s">${fmtFull(ef)}</div></div>
      <div class="kpi"><div class="kpi-l">Transferencia Hoy</div><div class="kpi-v">${fmt(tr)}</div><div class="kpi-s">${fmtFull(tr)}</div></div>
      <div class="kpi"><div class="kpi-l">Total Ingresado Hoy</div><div class="kpi-v">${fmt(ef+tr)}</div><div class="kpi-s">${fmtFull(ef+tr)}</div></div>`;

    const allF=dashFilter==='all'?cuts:cuts.filter(c=>c.barberId==dashFilter);
    const aEf=allF.reduce((a,b)=>a+(b.ef||0),0), aTr=allF.reduce((a,b)=>a+(b.tr||0),0);
    document.getElementById('kpiTotalRow').innerHTML = `
      <div class="kpi"><div class="kpi-l">Total Cortes</div><div class="kpi-v white">${allF.length}</div></div>
      <div class="kpi"><div class="kpi-l">Total Efectivo</div><div class="kpi-v green">${fmt(aEf)}</div><div class="kpi-s">${fmtFull(aEf)}</div></div>
      <div class="kpi"><div class="kpi-l">Total Transferencia</div><div class="kpi-v">${fmt(aTr)}</div><div class="kpi-s">${fmtFull(aTr)}</div></div>
      <div class="kpi" style="cursor:none;" onclick="gotoPanel('agenda',document.querySelector('[onclick*=agenda]'))"><div class="kpi-l">Citas Hoy / Pendientes</div><div class="kpi-v white">${apptHoy.length} <span style="font-size:18px;color:var(--orange);">/ ${pending}</span></div><div class="kpi-s" style="color:var(--gold);">Ver agenda →</div></div>`;

    const rf=document.getElementById('dashRecentFilter')?.value||'all';
    const recent=[...(rf==='all'?cuts:cuts.filter(c=>c.barberId==rf))].reverse().slice(0,20);
    document.getElementById('dashRecentBody').innerHTML = recent.length
      ? recent.map(c=>`<tr><td>${c.barberName}</td><td>${c.anon?'<span class="anon-tag">Anónimo</span>':c.client||'—'}</td><td>${c.service}</td><td class="text-green">${fmtFull(c.ef||0)}</td><td class="text-gold">${fmtFull(c.tr||0)}</td><td><span class="text-big">${fmtFull((c.ef||0)+(c.tr||0))}</span></td><td>${payBadge(c)}</td><td class="text-muted" style="font-size:11px;">${dateStr(c.ts)} ${timeStr(c.ts)}</td></tr>`).join('')
      : '<tr><td colspan="8" class="tbl-empty">Sin registros.</td></tr>';
  }

  /* ══════════════════════════════════════════════════════════
     AGENDA — confirmaciones, citas del día, presenciales
     ══════════════════════════════════════════════════════════ */
  function renderAgenda() {
    const dateEl = document.getElementById('agendaDate');
    if (!dateEl) return;
    if (!dateEl.value) dateEl.value = BladeDB.todayISO();
    const fecha    = dateEl.value;
    const filtBarb = document.getElementById('agendaBarberFilter')?.value || 'all';
    const filtEst  = document.getElementById('agendaEstadoFilter')?.value || 'all';

    // Actualizar selector de barberos si está vacío
    const bSel = document.getElementById('agendaBarberFilter');
    if (bSel && bSel.options.length <= 1) {
      bSel.innerHTML = `<option value="all">Todos los barberos</option>` +
        BladeDB.getBarbers().map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    }

    let appts = BladeDB.getAppointments().filter(a=>a.fecha===fecha);
    if (filtBarb !== 'all') appts = appts.filter(a=>a.barberId==filtBarb);
    if (filtEst  !== 'all') appts = appts.filter(a=>a.estado===filtEst);
    appts.sort((a,b)=>BladeDB.labelToMins(a.hora)-BladeDB.labelToMins(b.hora));

    const pending  = appts.filter(a=>a.estado==='pendiente').length;
    const confirmed= appts.filter(a=>a.estado==='confirmada').length;
    const cancelled= appts.filter(a=>a.estado==='cancelada').length;

    document.getElementById('agendaKpi').innerHTML = `
      <div class="kpi"><div class="kpi-l">Total</div><div class="kpi-v white">${appts.length}</div></div>
      <div class="kpi"><div class="kpi-l">Pendientes</div><div class="kpi-v" style="color:var(--orange);">${pending}</div></div>
      <div class="kpi"><div class="kpi-l">Confirmadas</div><div class="kpi-v green">${confirmed}</div></div>
      <div class="kpi"><div class="kpi-l">Canceladas</div><div class="kpi-v red">${cancelled}</div></div>`;

    document.getElementById('agendaBody').innerHTML = appts.length
      ? appts.map(a=>`<tr>
          <td><strong>${a.hora}</strong><div style="font-size:10px;color:var(--muted);">${a.duracion} min</div></td>
          <td>${a.barberName}</td>
          <td>${a.clienteName}</td>
          <td style="font-size:11px;color:var(--muted);">${a.telefono}</td>
          <td>${a.servicio}</td>
          <td class="text-gold">${fmtFull(a.precio||0)}</td>
          <td>${estadoBadge(a.estado)}</td>
          <td>${origenBadge(a.origen)}</td>
          <td style="display:flex;gap:6px;flex-wrap:nowrap;">
            ${a.estado==='pendiente'?`<button class="btn btn-xs ok" onclick="adminConfirmar('${a.id}')">✓ Confirmar</button>`:''}
            ${a.estado!=='cancelada'?`<button class="btn btn-xs danger" onclick="adminCancelar('${a.id}')">✕</button>`:''}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="9" class="tbl-empty">Sin citas para esta fecha.</td></tr>';
  }

  window.adminConfirmar = (id) => {
    const r = BladeDB.confirmarCita(id);
    if (!r.ok) { showNotif('Error', r.razon); return; }
    renderAgenda(); renderDashboard();
    showNotif('✓ Cita Confirmada', 'El cliente será notificado.');
  };

  window.adminCancelar = (id) => {
    if (!confirm('¿Cancelar esta cita? No se eliminará el registro.')) return;
    const r = BladeDB.cancelarCita(id);
    if (!r.ok) { showNotif('Error', r.razon); return; }
    renderAgenda(); renderDashboard();
    showNotif('Cita Cancelada', 'El slot quedó liberado.');
  };

  document.getElementById('agendaDate')?.addEventListener('change', renderAgenda);
  document.getElementById('agendaBarberFilter')?.addEventListener('change', renderAgenda);
  document.getElementById('agendaEstadoFilter')?.addEventListener('change', renderAgenda);

  /* ── CITA PRESENCIAL (admin la crea directamente) ─────────── */
  window.openCitaPresModal = () => {
    // Poblar selects del modal
    const bSel = document.getElementById('cpBarber');
    bSel.innerHTML = BladeDB.getBarbers().map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    const sSel = document.getElementById('cpService');
    sSel.innerHTML = BladeDB.getServices().map(s=>`<option value="${s.id}" data-dur="${s.duracion||30}">${s.name} (${s.duracion||30} min)</option>`).join('');
    // Poblar horas
    document.getElementById('cpFecha').value = BladeDB.todayISO();
    _updateCpHoras();
    document.getElementById('citaPresModal').classList.add('open');
  };

  function _updateCpHoras() {
    const barberId = parseInt(document.getElementById('cpBarber').value);
    const fecha    = document.getElementById('cpFecha').value;
    const opt      = document.getElementById('cpService').options[document.getElementById('cpService').selectedIndex];
    const duracion = parseInt(opt?.dataset.dur) || 30;
    const slots    = BladeDB.obtenerDisponibilidadPorBarbero(barberId, fecha, duracion, fecha === BladeDB.todayISO());
    const hSel     = document.getElementById('cpHora');
    hSel.innerHTML = slots.length
      ? slots.map(s=>`<option value="${s}">${s}</option>`).join('')
      : `<option value="">Sin horarios disponibles</option>`;
  }

  ['cpBarber','cpFecha','cpService'].forEach(id => document.getElementById(id)?.addEventListener('change', _updateCpHoras));

  window.closeCitaPresModal = () => document.getElementById('citaPresModal').classList.remove('open');
  document.getElementById('citaPresModal')?.addEventListener('click', e => { if(e.target===e.currentTarget) closeCitaPresModal(); });

  window.saveCitaPresencial = () => {
    const clienteName = document.getElementById('cpNombre').value.trim();
    const telefono    = document.getElementById('cpTelefono').value.trim().replace(/\s/g,'') || 'presencial';
    const servicioId  = parseInt(document.getElementById('cpService').value);
    const barberId    = parseInt(document.getElementById('cpBarber').value);
    const fecha       = document.getElementById('cpFecha').value;
    const hora        = document.getElementById('cpHora').value;

    if (!clienteName||!servicioId||!barberId||!fecha||!hora) { showNotif('Error','Completa todos los campos.'); return; }
    if (!hora) { showNotif('Error','Sin horarios disponibles para esa selección.'); return; }

    const r = BladeDB.crearCita({ clienteName, telefono, servicioId, barberId, fecha, hora, origen: 'presencial' });
    if (!r.ok) { showNotif('Error', r.razon); return; }

    // Confirmar automáticamente las citas presenciales
    BladeDB.confirmarCita(r.cita.id);

    closeCitaPresModal();
    renderAgenda(); renderDashboard();
    showNotif('✓ Cita Presencial Creada', `${r.cita.servicio} — ${r.cita.barberName} a las ${hora}`);
    ['cpNombre','cpTelefono'].forEach(id => document.getElementById(id).value='');
  };

  /* ══════════════════════════════════════════════════════════
     BLOQUEOS — bloqueos manuales por barbero/fecha
     ══════════════════════════════════════════════════════════ */
  function renderBloqueos() {
    // Poblar selector de barberos
    const bSel = document.getElementById('blkBarber');
    if (bSel) {
      const barbers = BladeDB.getBarbers();
      bSel.innerHTML = barbers.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    }

    // Poblar horas de inicio/fin con todos los slots
    const slots = buildAllSlots();
    ['blkInicio','blkFin'].forEach(id => {
      const sel = document.getElementById(id); if (!sel) return;
      if (sel.options.length <= 1) {
        sel.innerHTML = slots.map(s=>`<option value="${s}">${s}</option>`).join('');
        if (id === 'blkFin') sel.selectedIndex = Math.min(4, slots.length-1);
      }
    });

    if (!document.getElementById('blkFecha').value)
      document.getElementById('blkFecha').value = BladeDB.todayISO();

    _renderBlkList();

    // Disponibilidad por día
    _renderBarberDays();
  }

  function _renderBlkList() {
    const fecha    = document.getElementById('blkFecha')?.value || BladeDB.todayISO();
    const barberId = parseInt(document.getElementById('blkBarber')?.value) || 0;
    const blocks   = BladeDB.getBlocks().filter(b=>b.fecha===fecha&&b.barberId===barberId);
    const tbody    = document.getElementById('blkList');
    if (!tbody) return;
    tbody.innerHTML = blocks.length
      ? blocks.map(b=>`<tr>
          <td>${b.horaInicio} → ${b.horaFin}</td>
          <td class="text-muted">${b.motivo||'Sin motivo'}</td>
          <td><button class="btn btn-xs danger" onclick="eliminarBlk('${b.id}')">✕ Eliminar</button></td>
        </tr>`).join('')
      : '<tr><td colspan="3" class="tbl-empty">Sin bloqueos para esta fecha/barbero.</td></tr>';
  }

  document.getElementById('blkBarber')?.addEventListener('change', _renderBlkList);
  document.getElementById('blkFecha')?.addEventListener('change',  _renderBlkList);

  window.crearBloqueo = () => {
    const barberId   = parseInt(document.getElementById('blkBarber').value);
    const fecha      = document.getElementById('blkFecha').value;
    const horaInicio = document.getElementById('blkInicio').value;
    const horaFin    = document.getElementById('blkFin').value;
    const motivo     = document.getElementById('blkMotivo').value.trim();
    const r = BladeDB.crearBloqueo({ barberId, fecha, horaInicio, horaFin, motivo });
    if (!r.ok) { showNotif('Error', r.razon); return; }
    document.getElementById('blkMotivo').value = '';
    _renderBlkList();
    showNotif('Bloqueo Creado', `${horaInicio} – ${horaFin}`);
  };

  window.eliminarBlk = (id) => {
    BladeDB.eliminarBloqueo(id);
    _renderBlkList();
    showNotif('Bloqueo Eliminado', 'El slot vuelve a estar disponible.');
  };

  /* ── DISPONIBILIDAD POR DÍA ──────────────────────────────── */
  function _renderBarberDays() {
    const wrap = document.getElementById('barberDaysGrid');
    if (!wrap) return;
    const barbers = BladeDB.getBarbers();
    // Mostrar los próximos 7 días
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      days.push(d.toISOString().slice(0,10));
    }
    wrap.innerHTML = barbers.map(b => `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="card-head"><div class="card-title" style="font-size:16px;">${b.name}</div></div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:8px;">
          ${days.map(d => {
            const avail = BladeDB.getBarberDay(b.id, d);
            const label = new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
            return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
              <span style="color:var(--muted);">${label}</span>
              <div class="tgl-grp">
                <button class="tgl ${avail?'on-green':''}" onclick="setDay(${b.id},'${d}',true,this)">✓</button>
                <button class="tgl ${!avail?'on-red':''}"  onclick="setDay(${b.id},'${d}',false,this)">✕</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`).join('');
  }

  window.setDay = (barberId, fecha, disponible, btn) => {
    BladeDB.setBarberDay(barberId, fecha, disponible);
    btn.closest('.tgl-grp').querySelectorAll('.tgl').forEach(t=>t.className='tgl');
    btn.className = 'tgl ' + (disponible?'on-green':'on-red');
    showNotif('Disponibilidad Actualizada', disponible ? `✓ Trabaja el ${fecha}` : `✕ No disponible el ${fecha}`);
  };

  /* ══════════════════════════════════════════════════════════
     CORTES (sin cambios de lógica, se preserva íntegro)
     ══════════════════════════════════════════════════════════ */
  window.autoPrice = () => {
    const opt = document.getElementById('cService').options[document.getElementById('cService').selectedIndex];
    if (parseInt(opt.dataset.p) > 0) document.getElementById('cValue').value = opt.dataset.p;
  };
  window.toggleSplit = () => {
    document.getElementById('splitBox').style.display = document.getElementById('cPayType').value==='mixto'?'block':'none';
  };
  window.calcRemainder = () => {
    const total=parseInt(document.getElementById('cValue').value)||0;
    const ef=parseInt(document.getElementById('sEf').value)||0;
    const tr=parseInt(document.getElementById('sTr').value)||0;
    document.getElementById('sRem').value=total-ef-tr;
  };

  function populateCutServices() {
    const sel = document.getElementById('cService'); if (!sel) return;
    const services = BladeDB.getServices();
    sel.innerHTML = services.map(s=>`<option value="${s.name}" data-p="${s.price}">${s.name} — ${fmtFull(s.price)}</option>`).join('') +
      `<option value="Otro" data-p="0">Otro (valor manual)</option>`;
  }

  window.addCut = () => {
    if (!CU) return;
    const anon    = document.getElementById('cAnon').checked;
    const client  = anon?'':(document.getElementById('cClient').value.trim()||'');
    const service = document.getElementById('cService').value;
    const value   = parseInt(document.getElementById('cValue').value)||0;
    const payType = document.getElementById('cPayType').value;
    if (!value) { showNotif('Error','Ingresa el valor del servicio'); return; }
    let ef=0,tr=0;
    if (payType==='efectivo') ef=value;
    else if (payType==='transferencia') tr=value;
    else { ef=parseInt(document.getElementById('sEf').value)||0; tr=parseInt(document.getElementById('sTr').value)||0; }
    BladeDB.addCut({ barberId:CU.barberId, barberName:CU.name, client, anon, service, ef, tr, payType, ts:new Date().toISOString() });
    ['cClient','cValue','sEf','sTr'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('cAnon').checked=false;
    document.getElementById('splitBox').style.display='none';
    document.getElementById('cPayType').value='efectivo';
    renderCortes();
    showNotif('✓ Corte Registrado',`${service} — ${fmtFull(value)}`);
  };

  window.deleteCut = (id) => {
    if (!confirm('¿Eliminar este registro?')) return;
    BladeDB.saveCuts(BladeDB.getCuts().filter(c=>c.id!==id));
    renderCortes(); showNotif('Eliminado','Registro eliminado');
  };

  function renderCortes() {
    if (!CU) return;
    populateCutServices();
    const period=document.getElementById('myCutsDateFilter')?.value||'today';
    let cuts=BladeDB.getCuts();
    if (!CU.isAdmin) cuts=cuts.filter(c=>c.barberId===CU.barberId);
    cuts=filterPeriod(cuts,period);
    const ef=cuts.reduce((a,b)=>a+(b.ef||0),0), tr=cuts.reduce((a,b)=>a+(b.tr||0),0);
    document.getElementById('myKpiRow').innerHTML=`
      <div class="kpi"><div class="kpi-l">Cortes en período</div><div class="kpi-v white">${cuts.length}</div></div>
      <div class="kpi"><div class="kpi-l">Efectivo</div><div class="kpi-v green">${fmt(ef)}</div><div class="kpi-s">${fmtFull(ef)}</div></div>
      <div class="kpi"><div class="kpi-l">Transferencia</div><div class="kpi-v">${fmt(tr)}</div><div class="kpi-s">${fmtFull(tr)}</div></div>
      <div class="kpi"><div class="kpi-l">Total</div><div class="kpi-v">${fmt(ef+tr)}</div><div class="kpi-s">${fmtFull(ef+tr)}</div></div>`;
    const rows=[...cuts].reverse();
    document.getElementById('myCutsBody').innerHTML=rows.length
      ? rows.map((c,i)=>`<tr><td class="text-muted" style="font-size:11px;">${rows.length-i}</td><td>${c.anon?'<span class="anon-tag">Anónimo (presencial)</span>':c.client||'—'}</td><td>${c.service}</td><td class="text-green">${fmtFull(c.ef||0)}</td><td class="text-gold">${fmtFull(c.tr||0)}</td><td><span class="text-big">${fmtFull((c.ef||0)+(c.tr||0))}</span></td><td>${payBadge(c)}</td><td class="text-muted" style="font-size:11px;">${timeStr(c.ts)}<br><span style="font-size:10px;">${dateStr(c.ts)}</span></td><td><button class="btn btn-xs danger" onclick="deleteCut('${c.id}')">✕</button></td></tr>`).join('')
      : '<tr><td colspan="9" class="tbl-empty">Sin cortes en este período.</td></tr>';
    document.getElementById('myCutsTotals').innerHTML=`
      <div class="tot-item"><div class="tot-lbl">Efectivo</div><div class="tot-val text-green">${fmtFull(ef)}</div></div>
      <div class="tot-item"><div class="tot-lbl">Transferencia</div><div class="tot-val text-gold">${fmtFull(tr)}</div></div>
      <div class="tot-item"><div class="tot-lbl">Total</div><div class="tot-val">${fmtFull(ef+tr)}</div></div>`;
  }

  /* ══════════════════════════════════════════════════════════
     MI PERFIL (sin cambios)
     ══════════════════════════════════════════════════════════ */
  function renderMyProfile() {
    if (!CU) return;
    const b = BladeDB.getBarbers().find(x=>x.id===CU.barberId);
    if (!b) { document.getElementById('profilePhotoPreview').textContent='AD'; return; }
    const prev=document.getElementById('profilePhotoPreview');
    prev.innerHTML=b.photo?`<img src="${b.photo}" style="width:100%;height:100%;object-fit:cover;">`:CU.name.split(' ').map(n=>n[0]).join('').substring(0,2);
    document.getElementById('pName').value=b.name;
    document.getElementById('pRole').value=b.role;
    document.getElementById('pSpec').value=b.spec;
    document.getElementById('pStars').value=b.stars;
    document.getElementById('myTogAvail').className='tgl'+(b.status==='disponible'?' on-green':'');
    document.getElementById('myTogInact').className='tgl'+(b.status==='inactivo'?' on-red':'');
  }

  window.setMyStatus=(s)=>{
    if(!CU||!CU.barberId) return;
    const barbers=BladeDB.getBarbers(),b=barbers.find(x=>x.id===CU.barberId); if(!b) return;
    b.status=s; BladeDB.saveBarbers(barbers); renderMyProfile(); showNotif('Estado Actualizado',`Ahora estás ${s}`);
  };
  window.uploadMyPhoto=(input)=>{
    const f=input.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=e=>{
      const barbers=BladeDB.getBarbers(),b=barbers.find(x=>x.id===CU.barberId); if(!b) return;
      b.photo=e.target.result; BladeDB.saveBarbers(barbers);
      document.getElementById('profilePhotoPreview').innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
      document.getElementById('sbAv').innerHTML=`<img src="${e.target.result}">`;
      showNotif('Foto Actualizada','Tu foto se actualizó en la página pública.');
    }; r.readAsDataURL(f);
  };
  window.saveMyProfile=()=>{
    if(!CU||!CU.barberId){showNotif('Info','El administrador no tiene perfil de barbero.'); return;}
    const barbers=BladeDB.getBarbers(),b=barbers.find(x=>x.id===CU.barberId); if(!b) return;
    b.name=document.getElementById('pName').value.trim()||b.name;
    b.role=document.getElementById('pRole').value.trim()||b.role;
    b.spec=document.getElementById('pSpec').value.trim()||b.spec;
    b.stars=parseInt(document.getElementById('pStars').value)||b.stars;
    BladeDB.saveBarbers(barbers); showNotif('Perfil Guardado','Tu información pública fue actualizada.');
  };
  window.changePassword=()=>{
    const old=document.getElementById('pwOld').value;
    const nw=document.getElementById('pwNew').value;
    const cf=document.getElementById('pwConf').value;
    const accs=BladeDB.getAccounts();
    if(accs[CU.username]?.pass!==old){showNotif('Error','La contraseña actual es incorrecta.'); return;}
    if(!nw||nw.length<4){showNotif('Error','Mínimo 4 caracteres.'); return;}
    if(nw!==cf){showNotif('Error','Las contraseñas no coinciden.'); return;}
    BladeDB.updateAccountPass(CU.username,nw);
    ['pwOld','pwNew','pwConf'].forEach(id=>document.getElementById(id).value='');
    showNotif('Contraseña Actualizada','Cambio exitoso.');
  };

  /* ══════════════════════════════════════════════════════════
     REPORTES (sin cambios de lógica)
     ══════════════════════════════════════════════════════════ */
  function renderReportes() {
    const period=document.getElementById('repPeriod').value;
    const from=document.getElementById('repFrom').value;
    const to=document.getElementById('repTo').value;
    const barberF=document.getElementById('repBarber').value;
    const payF=document.getElementById('repPay').value;
    document.getElementById('customRange').style.display=period==='custom'?'flex':'none';
    let cuts=BladeDB.getCuts();
    cuts=filterPeriod(cuts,period,from,to);
    if(barberF!=='all') cuts=cuts.filter(c=>c.barberId==barberF);
    if(payF!=='all')    cuts=cuts.filter(c=>c.payType===payF);
    const ef=cuts.reduce((a,b)=>a+(b.ef||0),0), tr=cuts.reduce((a,b)=>a+(b.tr||0),0);
    document.getElementById('repKpiRow').innerHTML=`
      <div class="kpi"><div class="kpi-l">Total Cortes</div><div class="kpi-v white">${cuts.length}</div></div>
      <div class="kpi"><div class="kpi-l">Total Efectivo</div><div class="kpi-v green">${fmt(ef)}</div><div class="kpi-s">${fmtFull(ef)}</div></div>
      <div class="kpi"><div class="kpi-l">Total Transferencia</div><div class="kpi-v">${fmt(tr)}</div><div class="kpi-s">${fmtFull(tr)}</div></div>
      <div class="kpi"><div class="kpi-l">Ingreso Total</div><div class="kpi-v">${fmt(ef+tr)}</div><div class="kpi-s">${fmtFull(ef+tr)}</div></div>`;
    const total=ef+tr;
    document.getElementById('repBarberBody').innerHTML=BladeDB.getBarbers().map(b=>{
      const bc=cuts.filter(c=>c.barberId===b.id);
      const bef=bc.reduce((a,x)=>a+(x.ef||0),0),btr=bc.reduce((a,x)=>a+(x.tr||0),0),bt=bef+btr;
      const pct=total>0?((bt/total)*100).toFixed(1):0;
      return `<tr><td><strong>${b.name}</strong></td><td class="text-big">${bc.length}</td><td class="text-green">${fmtFull(bef)}</td><td class="text-gold">${fmtFull(btr)}</td><td class="text-big">${fmtFull(bt)}</td><td><span class="badge b-gray">${pct}%</span></td></tr>`;
    }).join('');
    document.getElementById('repCount').textContent=cuts.length+' registros';
    const sorted=[...cuts].sort((a,b)=>new Date(b.ts)-new Date(a.ts));
    document.getElementById('repTableBody').innerHTML=sorted.length
      ? sorted.map(c=>`<tr><td class="text-muted" style="font-size:11px;">${dateStr(c.ts)}</td><td class="text-muted" style="font-size:11px;">${timeStr(c.ts)}</td><td>${c.barberName}</td><td>${c.anon?'<span class="anon-tag">Anónimo</span>':c.client||'—'}</td><td>${c.service}</td><td class="text-green">${fmtFull(c.ef||0)}</td><td class="text-gold">${fmtFull(c.tr||0)}</td><td><span class="text-big">${fmtFull((c.ef||0)+(c.tr||0))}</span></td><td>${payBadge(c)}</td></tr>`).join('')
      : '<tr><td colspan="9" class="tbl-empty">Sin registros.</td></tr>';
    document.getElementById('repTotLabel').innerHTML=`Efectivo: <strong class="text-green">${fmtFull(ef)}</strong> &nbsp;·&nbsp; Transferencia: <strong class="text-gold">${fmtFull(tr)}</strong> &nbsp;·&nbsp; Total: <strong>${fmtFull(ef+tr)}</strong>`;
  }
  document.getElementById('repPeriod').addEventListener('change', function(){ document.getElementById('customRange').style.display=this.value==='custom'?'flex':'none'; renderReportes(); });
  ['repFrom','repTo','repBarber','repPay'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderReportes));

  /* ══════════════════════════════════════════════════════════
     EXCEL
     ══════════════════════════════════════════════════════════ */
  function buildCutsRows(cuts){
    return cuts.map(c=>({'Fecha':dateStr(c.ts),'Hora':timeStr(c.ts),'Barbero':c.barberName,'Cliente':c.anon?'Anónimo (presencial)':(c.client||'—'),'Servicio':c.service,'Efectivo':c.ef||0,'Transferencia':c.tr||0,'Total':(c.ef||0)+(c.tr||0),'Forma de Pago':c.payType.charAt(0).toUpperCase()+c.payType.slice(1)}));
  }
  window.exportExcelGlobal=()=>{
    const cuts=BladeDB.getCuts(); if(!cuts.length){showNotif('Sin datos','No hay cortes registrados.'); return;}
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(buildCutsRows(cuts)),'Todos los Cortes');
    BladeDB.getBarbers().forEach(b=>{const bc=cuts.filter(c=>c.barberId===b.id); if(bc.length) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(buildCutsRows(bc)),b.name.substring(0,28));});
    const inv=BladeDB.getInventory();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(inv.map(i=>({Producto:i.name,Categoría:i.cat,Cantidad:i.qty,'Precio Unitario':i.price,'Valor Total':i.qty*i.price,'Stock Mínimo':i.min}))),'Inventario');
    XLSX.writeFile(wb,`BLADE_Reporte_${BladeDB.todayISO()}.xlsx`);
    showNotif('✓ Excel Exportado','Archivo descargado.');
  };
  window.exportExcelMyCuts=()=>{
    let cuts=BladeDB.getCuts(); if(!CU.isAdmin) cuts=cuts.filter(c=>c.barberId===CU.barberId);
    if(!cuts.length){showNotif('Sin datos','Sin cortes registrados.'); return;}
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(buildCutsRows(cuts)),'Mis Cortes');
    XLSX.writeFile(wb,`BLADE_${CU.name.replace(' ','_')}_${BladeDB.todayISO()}.xlsx`);
    showNotif('✓ Excel Exportado','Archivo descargado.');
  };
  window.exportExcelInv=()=>{
    const inv=BladeDB.getInventory();
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(inv.map(i=>({Producto:i.name,Categoría:i.cat,Cantidad:i.qty,'Precio Unitario':i.price,'Valor Total':i.qty*i.price}))),'Inventario');
    XLSX.writeFile(wb,`BLADE_Inventario_${BladeDB.todayISO()}.xlsx`);
    showNotif('✓ Excel Exportado','Inventario exportado.');
  };

  /* ══════════════════════════════════════════════════════════
     EQUIPO (sin cambios de lógica)
     ══════════════════════════════════════════════════════════ */
  function renderEquipo() {
    document.getElementById('barberCards').innerHTML=BladeDB.getBarbers().map(b=>`
      <div class="bc"><div class="bc-top">
        <div class="bc-av" id="bcAv_${b.id}">${b.photo?`<img src="${b.photo}">`:b.name.split(' ').map(n=>n[0]).join('').substring(0,2)}</div>
        <div><div class="bc-name">${b.name}</div><div class="bc-role">${b.role}</div></div>
      </div><div class="bc-body">
        <div class="bc-stat"><span class="bc-stat-l">Estado global</span>
          <div class="tgl-grp">
            <button class="tgl ${b.status==='disponible'?'on-green':''}" onclick="setBarberStatus(${b.id},'disponible',this)">Disponible</button>
            <button class="tgl ${b.status==='inactivo'?'on-red':''}"   onclick="setBarberStatus(${b.id},'inactivo',this)">Inactivo</button>
          </div>
        </div>
        <input type="file" id="bpI_${b.id}" accept="image/*" onchange="uploadBarberPhoto(${b.id},this)">
        <button class="upload-btn" onclick="document.getElementById('bpI_${b.id}').click()">📷 Subir Foto</button>
        <button class="btn btn-xs danger" onclick="deleteBarber(${b.id})" style="width:100%;justify-content:center;margin-top:6px;">Eliminar barbero</button>
      </div></div>`).join('');
  }

  window.openBarberModal  = () => document.getElementById('barberModal').classList.add('open');
  window.closeBarberModal = () => document.getElementById('barberModal').classList.remove('open');
  document.getElementById('barberModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeBarberModal(); });

  window.saveNewBarber=()=>{
    const name=document.getElementById('bName').value.trim();
    const user=document.getElementById('bUser').value.trim().toLowerCase();
    const pass=document.getElementById('bPass').value;
    const role=document.getElementById('bRole').value.trim()||'Barbero';
    const spec=document.getElementById('bSpec').value.trim()||'Barbero profesional.';
    const stars=parseInt(document.getElementById('bStars').value)||5;
    const status=document.getElementById('bStatus').value;
    if(!name||!user||!pass){showNotif('Error','Nombre, usuario y contraseña son obligatorios.'); return;}
    if(BladeDB.getAccounts()[user]){showNotif('Error','Ese usuario ya existe.'); return;}
    const barbers=BladeDB.getBarbers(), newId=Date.now();
    barbers.push({id:newId,name,role,spec,stars,status,photo:''});
    BladeDB.saveBarbers(barbers);
    BladeDB.addAccount(user,{pass,name,role,isAdmin:false,barberId:newId});
    closeBarberModal(); renderEquipo(); populateBarberFilters();
    ['bName','bUser','bPass','bRole','bSpec'].forEach(id=>document.getElementById(id).value='');
    showNotif('Barbero Creado',`${name} puede ingresar con usuario "${user}"`);
  };
  window.setBarberStatus=(id,s,btn)=>{
    const barbers=BladeDB.getBarbers(),b=barbers.find(x=>x.id===id); if(!b) return;
    b.status=s; BladeDB.saveBarbers(barbers);
    btn.closest('.tgl-grp').querySelectorAll('.tgl').forEach(t=>t.className='tgl');
    btn.className='tgl '+(s==='disponible'?'on-green':'on-red');
    showNotif('Estado Actualizado',`${b.name} → ${s}`);
  };
  window.uploadBarberPhoto=(id,input)=>{
    const f=input.files[0]; if(!f) return;
    new Promise(res=>{const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(f);}).then(data=>{
      const barbers=BladeDB.getBarbers(),b=barbers.find(x=>x.id===id); if(!b) return;
      b.photo=data; BladeDB.saveBarbers(barbers);
      document.getElementById(`bcAv_${id}`).innerHTML=`<img src="${data}">`;
      showNotif('Foto Actualizada',b.name);
    });
  };
  window.deleteBarber=(id)=>{
    if(!confirm('¿Eliminar este barbero permanentemente?')) return;
    BladeDB.saveBarbers(BladeDB.getBarbers().filter(b=>b.id!==id));
    renderEquipo(); populateBarberFilters(); showNotif('Eliminado','Barbero eliminado.');
  };

  /* ══════════════════════════════════════════════════════════
     SERVICIOS — ahora incluye campo duración
     ══════════════════════════════════════════════════════════ */
  let svcEditId = null;

  function renderServicios() {
    const grid=document.getElementById('svcGrid'); if(!grid) return;
    const services=BladeDB.getServices();
    grid.innerHTML=services.length
      ? services.map(s=>`
        <div class="svc-card">
          <div class="svc-icon">${s.icon||'✂️'}</div>
          <div class="svc-name">${s.name}</div>
          <div class="svc-price">${fmtFull(s.price)} COP</div>
          <div style="font-size:11px;color:var(--muted);margin:4px 0 8px;">⏱ ${s.duracion||30} min</div>
          <p class="svc-desc">${s.desc}</p>
          <div class="svc-acts">
            <button class="btn btn-xs edit" onclick="editService(${s.id})">Editar</button>
            <button class="btn btn-xs danger" onclick="deleteService(${s.id})">Eliminar</button>
          </div>
        </div>`).join('')
      : '<p style="color:var(--muted);padding:40px;grid-column:1/-1;">Sin servicios. Agrega el primero.</p>';
  }

  window.openSvcModal=()=>{
    svcEditId=null;
    document.getElementById('svcMT').textContent='NUEVO SERVICIO';
    ['sName','sDesc','sPrice','sDuracion'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('sDuracion').value='30';
    document.getElementById('svcModal').classList.add('open');
  };
  window.closeSvcModal=()=>document.getElementById('svcModal').classList.remove('open');
  document.getElementById('svcModal').addEventListener('click',e=>{if(e.target===e.currentTarget) closeSvcModal();});

  window.editService=(id)=>{
    const s=BladeDB.getServices().find(x=>x.id===id); if(!s) return;
    svcEditId=id;
    document.getElementById('svcMT').textContent='EDITAR SERVICIO';
    document.getElementById('sName').value=s.name;
    document.getElementById('sDesc').value=s.desc;
    document.getElementById('sPrice').value=s.price;
    document.getElementById('sDuracion').value=s.duracion||30;
    document.getElementById('svcModal').classList.add('open');
  };

  window.saveSvcItem=()=>{
    const name=document.getElementById('sName').value.trim();
    const desc=document.getElementById('sDesc').value.trim();
    const price=parseInt(document.getElementById('sPrice').value)||0;
    const duracion=parseInt(document.getElementById('sDuracion').value)||30;
    if(!name){showNotif('Error','El nombre es obligatorio.'); return;}
    if(!price){showNotif('Error','El precio debe ser mayor a 0.'); return;}
    if(duracion<5||duracion>240){showNotif('Error','La duración debe ser entre 5 y 240 minutos.'); return;}
    const services=BladeDB.getServices();
    if(svcEditId){
      const idx=services.findIndex(s=>s.id===svcEditId);
      if(idx>-1) services[idx]={...services[idx],name,desc,price,duracion};
    } else {
      services.push({id:BladeDB.nextId(services),name,desc,price,duracion,icon:BladeDB.randomIcon()});
    }
    BladeDB.saveServices(services);
    closeSvcModal(); renderServicios();
    showNotif(svcEditId?'Servicio Actualizado':'Servicio Creado',`"${name}" — ${duracion} min`);
  };

  window.deleteService=(id)=>{
    if(!confirm('¿Eliminar este servicio?')) return;
    BladeDB.saveServices(BladeDB.getServices().filter(s=>s.id!==id));
    renderServicios(); showNotif('Eliminado','Servicio eliminado.');
  };

  /* ══════════════════════════════════════════════════════════
     INVENTARIO (sin cambios)
     ══════════════════════════════════════════════════════════ */
  let invFilter='all', invEditId=null;
  const invStatus=i=>i.qty===0?'out':i.qty<=i.min?'low':'ok';

  function renderInv() {
    const inv=BladeDB.getInventory();
    const search=document.querySelector('#panel-inventario .fi')?.value.toLowerCase()||'';
    let items=inv.filter(i=>i.name.toLowerCase().includes(search)||i.cat.toLowerCase().includes(search));
    if(invFilter!=='all') items=items.filter(i=>invStatus(i)===invFilter);
    const lows=inv.filter(i=>invStatus(i)!=='ok').length;
    const val=inv.reduce((a,b)=>a+b.qty*b.price,0);
    document.getElementById('invKpiRow').innerHTML=`
      <div class="kpi"><div class="kpi-l">Total Productos</div><div class="kpi-v white">${inv.length}</div></div>
      <div class="kpi"><div class="kpi-l">Bajo / Agotado</div><div class="kpi-v red">${lows}</div></div>
      <div class="kpi"><div class="kpi-l">Valor Total</div><div class="kpi-v">${fmt(val)}</div><div class="kpi-s">${fmtFull(val)}</div></div>
      <div class="kpi"><div class="kpi-l">Categorías</div><div class="kpi-v white">${[...new Set(inv.map(i=>i.cat))].length}</div></div>`;
    document.getElementById('invBody').innerHTML=items.length
      ? items.map(item=>{
          const s=invStatus(item);
          const badge=s==='ok'?`<span class="badge b-green">OK</span>`:s==='low'?`<span class="badge b-orange">Stock Bajo</span>`:`<span class="badge b-red">Agotado</span>`;
          return `<tr><td><strong>${item.name}</strong></td><td class="text-muted">${item.cat}</td><td><span class="text-big">${item.qty}</span></td><td class="text-gold">${fmtFull(item.price)}</td><td>${fmtFull(item.qty*item.price)}</td><td>${badge}</td><td style="display:flex;gap:6px;"><button class="btn btn-xs ok" onclick="addInvStock(${item.id})">+5</button><button class="btn btn-xs edit" onclick="editInvItem(${item.id})">Editar</button><button class="btn btn-xs danger" onclick="delInvItem(${item.id})">✕</button></td></tr>`;
        }).join('')
      : '<tr><td colspan="7" class="tbl-empty">Sin resultados.</td></tr>';
    document.getElementById('invFootLabel').textContent=items.length+' productos';
    document.getElementById('invFootValue').textContent=fmtFull(val);
  }

  window.setInvFilter=(f,btn)=>{ invFilter=f; document.querySelectorAll('#panel-inventario .fb').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderInv(); };
  window.addInvStock=(id)=>{ const inv=BladeDB.getInventory(),i=inv.find(x=>x.id===id); if(!i) return; i.qty+=5; BladeDB.saveInventory(inv); renderInv(); showNotif('+5 Stock',i.name); };
  window.delInvItem=(id)=>{ if(!confirm('¿Eliminar este producto?')) return; BladeDB.saveInventory(BladeDB.getInventory().filter(i=>i.id!==id)); renderInv(); showNotif('Eliminado','Producto eliminado.'); };
  window.openInvModal=()=>{ invEditId=null; document.getElementById('invMT').textContent='NUEVO PRODUCTO'; ['iName','iQty','iPrice','iMin','iDesc'].forEach(id=>document.getElementById(id).value=''); document.getElementById('iCat').value='Fijadores'; document.getElementById('invModal').classList.add('open'); };
  window.editInvItem=(id)=>{ const i=BladeDB.getInventory().find(x=>x.id===id); if(!i) return; invEditId=id; document.getElementById('invMT').textContent='EDITAR PRODUCTO'; document.getElementById('iName').value=i.name; document.getElementById('iCat').value=i.cat; document.getElementById('iQty').value=i.qty; document.getElementById('iPrice').value=i.price; document.getElementById('iMin').value=i.min; document.getElementById('iDesc').value=i.desc||''; document.getElementById('invModal').classList.add('open'); };
  window.closeInvModal=()=>document.getElementById('invModal').classList.remove('open');
  document.getElementById('invModal').addEventListener('click',e=>{if(e.target===e.currentTarget) closeInvModal();});
  window.saveInvItem=()=>{
    const name=document.getElementById('iName').value.trim();
    const cat=document.getElementById('iCat').value;
    const qty=parseInt(document.getElementById('iQty').value)||0;
    const price=parseInt(document.getElementById('iPrice').value)||0;
    const min=parseInt(document.getElementById('iMin').value)||5;
    const desc=document.getElementById('iDesc').value.trim();
    if(!name){showNotif('Error','El nombre es obligatorio.'); return;}
    if(!price){showNotif('Error','El precio debe ser mayor a 0.'); return;}
    const inv=BladeDB.getInventory();
    const product={id:invEditId||BladeDB.nextId(inv),name,cat,qty,price,min,desc};
    if(invEditId){ const idx=inv.findIndex(i=>i.id===invEditId); if(idx>-1) inv[idx]=product; } else { inv.unshift(product); }
    BladeDB.saveInventory(inv); closeInvModal(); renderInv();
    showNotif(invEditId?'Producto Actualizado':'Producto Agregado',`"${name}" guardado correctamente.`);
  };

  /* ══════════════════════════════════════════════════════════
     CONTACTO (sin cambios)
     ══════════════════════════════════════════════════════════ */
  function renderContactForm(){
    const c=BladeDB.getContact();
    ['cPhone','cEmail','cInsta','cWhatsapp','cAddress','cCity','cSched1','cSched2'].forEach((f,i)=>{
      const el=document.getElementById(f); if(el) el.value=c[['phone','email','instagram','whatsapp','address','city','scheduleWeek','scheduleSun'][i]]||'';
    });
  }
  window.saveContact=()=>{
    const keys=['phone','email','instagram','whatsapp','address','city','scheduleWeek','scheduleSun'];
    const c=BladeDB.getContact();
    ['cPhone','cEmail','cInsta','cWhatsapp','cAddress','cCity','cSched1','cSched2'].forEach((f,i)=>{ const el=document.getElementById(f); if(el) c[keys[i]]=el.value.trim(); });
    BladeDB.saveContact(c); showNotif('Contacto Guardado','Los datos se actualizaron en la página pública.');
  };

});
