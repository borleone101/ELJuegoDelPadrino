import { supabase }       from "./supabase.js";
import { realizarSorteo as calcSorteo, nombreCaso } from "./logica_juego.js";
import { uploadFile } from "./cloudinary.js";

/* ════════════════════════════════════════
   HELPERS GLOBALES
════════════════════════════════════════ */
const MC = () => document.getElementById("mainContent");

const swal$ = {
  background: '#131009', color: '#e6dcc8',
  confirmButtonColor: '#8b1a1a', cancelButtonColor: '#221c14',
};

const toast = (title, icon = "success") => Swal.fire({
  title, icon, toast: true, position: "top-end",
  showConfirmButton: false, timer: 2800, timerProgressBar: true,
  background: '#1b1610', color: '#e6dcc8',
  iconColor: icon === "success" ? "#22c55e" : icon === "error" ? "#f87171" : "#d4a017"
});

const confirm$ = (title, html, confirmText = "Confirmar") => Swal.fire({
  title, html, icon: "warning", showCancelButton: true,
  confirmButtonText: confirmText, cancelButtonText: "Cancelar", ...swal$
});

const loading$ = (text = "Procesando...") => Swal.fire({
  title: text, allowOutsideClick: false, showConfirmButton: false,
  didOpen: () => Swal.showLoading(), ...swal$
});

const ok$ = (title, html = "", icon = "success") => Swal.fire({
  title, html, icon, confirmButtonText: "OK", ...swal$
});

function fmtDate(d) {
  return new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(d) {
  return new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n) { return `Bs ${Number(n || 0).toFixed(2)}`; }

function badge(est) {
  const map = {
    pendiente:   ["bdg bdg-p",      "⏳ pendiente"],
    aprobado:    ["bdg bdg-ok",     "✓ aprobado"],
    rechazado:   ["bdg bdg-bad",    "✗ rechazado"],
    activo:      ["bdg bdg-ok",     "activo"],
    inactivo:    ["bdg bdg-closed", "inactivo"],
    suspendido:  ["bdg bdg-bad",    "suspendido"],
    abierta:     ["bdg bdg-open",   "abierta"],
    cerrada:     ["bdg bdg-closed", "cerrada"],
    sorteada:    ["bdg bdg-win",    "sorteada ✓"],
    ganada:      ["bdg bdg-win",    "ganador 🏆"],
    perdida:     ["bdg bdg-bad",    "perdida"],
    admin:       ["bdg bdg-win",    "admin"],
    trabajador:  ["bdg bdg-open",   "trabajador"],
    usuario:     ["bdg bdg-closed", "usuario"],
    enviado:     ["bdg bdg-ok",     "✅ enviado"],
    confirmado:  ["bdg bdg-win",    "✓ confirmado"],
    completado:  ["bdg bdg-ok",     "✓ completado"],
    gratis:      ["bdg bdg-free",   "🎁 gratis"],
  };
  const [cls, label] = map[est] || ["bdg bdg-p", est];
  return `<span class="${cls}">${label}</span>`;
}

function initDT(id, opts = {}) {
  setTimeout(() => {
    if (!document.getElementById(id)) return;
    if ($.fn.DataTable.isDataTable(`#${id}`)) $(`#${id}`).DataTable().destroy();
    $(`#${id}`).DataTable({
      language: {
        search: "Buscar:", lengthMenu: "Mostrar _MENU_",
        info: "_START_–_END_ de _TOTAL_",
        paginate: { previous: "‹", next: "›" },
        zeroRecords: "Sin resultados", emptyTable: "Sin datos"
      },
      pageLength: 15, ...opts
    });
  }, 100);
}

function loadingView() {
  MC().innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;
}

function setActive(view) {
  document.querySelectorAll(".nav-item[data-view]").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view));
}

window.__back = null;
function renderBackBtn(label, fn) {
  window.__back = fn;
  return `<button class="btn btn-ghost btn-md" onclick="window.__back()"><i class="bi bi-arrow-left"></i> ${label}</button>`;
}

/* ════════════════════════════════════════
   VISTA ACTIVA (para realtime)
════════════════════════════════════════ */
let _currentView = "dashboard";
function setCurrentView(v) { _currentView = v; }

/* ════════════════════════════════════════
   HELPER: perfiles por IDs
════════════════════════════════════════ */
async function getProfilesMap(userIds) {
  if (!userIds?.length) return {};
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,email,qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at,saldo,total_ganado")
    .in("id", uniqueIds);
  if (error) { console.error("getProfilesMap error:", error.message); return {}; }
  const map = {};
  (data || []).forEach(p => { map[p.id] = p; });
  return map;
}

/* ════════════════════════════════════════
   SIDEBAR BADGES
════════════════════════════════════════ */
async function updateSidebarBadges() {
  try {
    const [{ count: pend }, { count: qrPend }] = await Promise.all([
      supabase.from("payments").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
      supabase.from("profiles").select("*", { count: "exact", head: true })
        .eq("rol", "usuario").not("qr_cobro_url", "is", null).eq("qr_verificado", false)
    ]);
    const bP = document.getElementById("badgePend");
    const bQ = document.getElementById("badgeQR");
    if (bP) { bP.textContent = pend || 0; bP.style.display = (pend > 0) ? "inline-flex" : "none"; }
    if (bQ) { bQ.textContent = qrPend || 0; bQ.style.display = (qrPend > 0) ? "inline-flex" : "none"; }
  } catch (e) { console.warn("updateSidebarBadges:", e); }
}

/* ════════════════════════════════════════
   REALTIME — Suscripciones en tiempo real
════════════════════════════════════════ */
const viewReloaders = {
  dashboard:        () => dashboard(),
  pagos_pendientes: () => pagos_pendientes(),
  sorteos:          () => sorteos(),
  ganadores:        () => ganadores(),
  enviar_premios:   () => enviar_premios(),
  usuarios:         () => usuarios(),
  qr_usuarios:      () => qr_usuarios(),
  finanzas:         () => finanzas(),
  referidos:        () => referidos(),
  boletos_gratis:   () => boletos_gratis(),
};

// Debounce para evitar recargas múltiples en cascada
let _reloadTimer = null;
function scheduleReload(delay = 600) {
  clearTimeout(_reloadTimer);
  _reloadTimer = setTimeout(() => {
    updateSidebarBadges();
    const reloader = viewReloaders[_currentView];
    if (reloader) reloader();
  }, delay);
}

function initRealtime() {
  // Pagos: cuando llega uno nuevo o cambia estado
  supabase
    .channel("rt-payments")
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
      scheduleReload();
    })
    .subscribe();

  // Participaciones: cuando alguien se une a una ronda
  supabase
    .channel("rt-participations")
    .on("postgres_changes", { event: "*", schema: "public", table: "participations" }, () => {
      scheduleReload();
    })
    .subscribe();

  // Perfiles: cambios de QR, estado, etc.
  supabase
    .channel("rt-profiles")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
      scheduleReload();
    })
    .subscribe();

  // Rondas: cambios de estado
  supabase
    .channel("rt-rounds")
    .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, () => {
      scheduleReload();
    })
    .subscribe();
}

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
const { data: { user } } = await supabase.auth.getUser();
if (!user) { window.location.href = "../../auth/login.html"; throw 0; }

const { data: myProfile, error: profileError } = await supabase
  .from("profiles").select("username,rol,estado").eq("id", user.id).single();

// Debug: mostrar qué pasó si falla
if (profileError || !myProfile) {
  console.error("❌ Error al cargar perfil:", profileError);
  document.getElementById("mainContent").innerHTML = `
    <div style="padding:2rem;text-align:center">
      <div style="color:#f87171;font-size:1.1rem;font-family:'Oswald',sans-serif;margin-bottom:1rem">
        ⚠️ Error al cargar tu perfil de administrador
      </div>
      <div style="color:#8a7a62;font-size:.9rem;margin-bottom:1.5rem">
        ${profileError ? `Error: ${profileError.message} (código: ${profileError.code})` : "El perfil no fue encontrado en la base de datos."}
        <br><br>
        ID de usuario: <code style="color:#d4a017">${user.id}</code>
        <br>Email: <code style="color:#d4a017">${user.email}</code>
      </div>
      <div style="color:#8a7a62;font-size:.82rem;background:#1b1610;border:1px solid rgba(139,26,26,.22);border-radius:8px;padding:1rem;text-align:left;max-width:500px;margin:0 auto">
        <strong style="color:#d4a017">Posibles causas:</strong><br>
        1. Las políticas RLS bloquean la lectura del perfil<br>
        2. No existe un registro en la tabla <code>profiles</code> con este ID<br>
        3. El perfil existe pero con un rol diferente<br><br>
        <strong style="color:#d4a017">Solución rápida:</strong> Ejecuta en Supabase SQL Editor:<br>
        <code style="color:#22c55e">ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;</code><br>
        Si al desactivar RLS funciona, el problema es de políticas.
      </div>
      <button onclick="supabase.auth.signOut().then(()=>location.href='../../auth/login.html')" 
        style="margin-top:1.5rem;background:#8b1a1a;color:#fff;border:none;padding:.6rem 1.5rem;border-radius:6px;font-family:'Oswald',sans-serif;cursor:pointer;font-size:.95rem">
        Cerrar sesión
      </button>
    </div>`;
  throw 0;
}

if (myProfile.estado !== "activo") {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html"; throw 0;
}

if (!["admin","trabajador"].includes(myProfile.rol)) {
  document.getElementById("mainContent").innerHTML = `
    <div style="padding:2rem;text-align:center">
      <div style="color:#f87171;font-size:1.1rem;font-family:'Oswald',sans-serif;margin-bottom:.8rem">⛔ Acceso denegado</div>
      <div style="color:#8a7a62">Tu cuenta tiene rol <strong style="color:#d4a017">${myProfile.rol}</strong>, no <strong>admin</strong> o <strong>trabajador</strong>.</div>
      <button onclick="supabase.auth.signOut().then(()=>location.href='../../auth/login.html')"
        style="margin-top:1.5rem;background:#8b1a1a;color:#fff;border:none;padding:.6rem 1.5rem;border-radius:6px;font-family:'Oswald',sans-serif;cursor:pointer">
        Cerrar sesión
      </button>
    </div>`;
  throw 0;
}

document.getElementById("adminName").textContent = myProfile.username;

async function doLogout() {
  const r = await confirm$("¿Cerrar sesión?", "Serás redirigido al inicio.", "Sí, salir");
  if (r.isConfirmed) { await supabase.auth.signOut(); window.location.href = "../../auth/login.html"; }
}
document.getElementById("logoutBtn").addEventListener("click", doLogout);
document.getElementById("logoutBtn2").addEventListener("click", doLogout);

/* ════════════════════════════════════════
   NAVEGACIÓN
════════════════════════════════════════ */
const views = { dashboard, sorteos, ganadores, usuarios, trabajadores, premios, finanzas, pagos_pendientes, enviar_premios, qr_usuarios, referidos, boletos_gratis };

document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    setActive(btn.dataset.view);
    setCurrentView(btn.dataset.view);
    views[btn.dataset.view]?.();
  });
});

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
async function dashboard() {
  setActive("dashboard");
  setCurrentView("dashboard");
  loadingView();
  updateSidebarBadges();

  const [
    { count: totalUsuarios },
    { count: pagosPend },
    { count: rondasAbiertas },
    { count: totalSorteadas },
    { count: qrPendientes },
    { data: recientes },
    { data: rondasRecientes }
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count:"exact", head:true }).eq("rol","usuario"),
    supabase.from("payments").select("*", { count:"exact", head:true }).eq("estado","pendiente"),
    supabase.from("rounds").select("*", { count:"exact", head:true }).eq("estado","abierta"),
    supabase.from("rounds").select("*", { count:"exact", head:true }).eq("estado","sorteada"),
    supabase.from("profiles").select("*", { count:"exact", head:true }).eq("rol","usuario").not("qr_cobro_url","is",null).eq("qr_verificado",false),
    supabase.from("payments").select("id,monto,metodo,estado,created_at,user_id").order("created_at",{ascending:false}).limit(6),
    supabase.from("rounds").select("id,numero,estado,created_at,game_id").order("created_at",{ascending:false}).limit(5)
  ]);

  const payUserIds = (recientes||[]).map(p=>p.user_id).filter(Boolean);
  const payProfiles = await getProfilesMap(payUserIds);

  const gameIds = [...new Set((rondasRecientes||[]).map(r=>r.game_id).filter(Boolean))];
  let gamesMap = {};
  if (gameIds.length) {
    const { data: gd } = await supabase.from("games").select("id,nombre").in("id",gameIds);
    (gd||[]).forEach(g=>{gamesMap[g.id]=g});
  }

  const rondasConCupos = await Promise.all((rondasRecientes||[]).map(async r => {
    const { data: parts } = await supabase.from("participations").select("boletos").eq("round_id",r.id);
    return { ...r, cupos: (parts||[]).reduce((s,p)=>s+(p.boletos||1),0), game: gamesMap[r.game_id] };
  }));

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-speedometer2"></i>Dashboard</div>
        <div class="ph-sub">${new Date().toLocaleDateString("es-BO",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem">
        <span class="rt-dot" title="Datos en tiempo real"></span>
        <span style="font-size:.72rem;color:var(--muted)">En vivo</span>
      </div>
    </div>

    <div class="stat-grid">
      <div class="sc"><div class="sc-bar r"></div><div class="sc-icon">👥</div><div class="sc-val">${totalUsuarios??0}</div><div class="sc-lbl">Usuarios</div></div>
      <div class="sc"><div class="sc-bar g"></div><div class="sc-icon">⏳</div>
        <div class="sc-val ${(pagosPend??0)>0?'orange':''}">${pagosPend??0}</div>
        <div class="sc-lbl">Pagos pendientes</div>
        ${(pagosPend??0)>0?`<div class="sc-sub" style="color:#f59e0b">Requieren revisión</div>`:""}
      </div>
      <div class="sc"><div class="sc-bar gr"></div><div class="sc-icon">🎟️</div><div class="sc-val">${rondasAbiertas??0}</div><div class="sc-lbl">Rondas abiertas</div></div>
      <div class="sc"><div class="sc-bar b"></div><div class="sc-icon">🏆</div><div class="sc-val">${totalSorteadas??0}</div><div class="sc-lbl">Sorteos realizados</div></div>
      ${(qrPendientes??0)>0?`
      <div class="sc" style="cursor:pointer;border-color:rgba(245,158,11,.25)" onclick="document.querySelector('[data-view=qr_usuarios]').click()">
        <div class="sc-bar" style="background:#f59e0b"></div>
        <div class="sc-icon">📲</div>
        <div class="sc-val orange">${qrPendientes}</div>
        <div class="sc-lbl">QR por verificar</div>
        <div class="sc-sub" style="color:#f59e0b">Haz clic para revisar</div>
      </div>`:""}
    </div>

    ${(pagosPend??0)>0?`
    <div class="fondo-alert warn" style="cursor:pointer" onclick="document.querySelector('[data-view=pagos_pendientes]').click()">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <div>
        <div class="fondo-alert-title">${pagosPend} pago${pagosPend!==1?'s':''} pendiente${pagosPend!==1?'s':''} de aprobación</div>
        <div class="fondo-alert-sub">Haz clic para revisar y aprobar los comprobantes.</div>
      </div>
    </div>`:""}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.1rem" id="dashGrid">
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-clock-history"></i>Últimos pagos</div>
          <button class="btn btn-ghost btn-sm" onclick="document.querySelector('[data-view=pagos_pendientes]').click()">Ver todos →</button>
        </div>
        <div class="panel-body">
          ${!recientes?.length
            ?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin pagos aún</p></div>`
            :recientes.map(p=>`
              <div class="act-row">
                <div class="act-left">
                  <div style="width:32px;height:32px;border-radius:50%;background:rgba(139,26,26,.18);display:flex;align-items:center;justify-content:center;color:var(--gold)"><i class="bi bi-person"></i></div>
                  <div><div class="act-name">${payProfiles[p.user_id]?.username??"—"}</div><div class="act-date">${fmtDateShort(p.created_at)} · ${p.metodo??""}</div></div>
                </div>
                <div style="display:flex;align-items:center;gap:.5rem">
                  <span class="act-amount">${fmtMoney(p.monto)}</span>${badge(p.estado)}
                </div>
              </div>`).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-ticket-perforated-fill"></i>Rondas recientes</div>
          <button class="btn btn-ghost btn-sm" onclick="document.querySelector('[data-view=sorteos]').click()">Ver sorteos →</button>
        </div>
        <div class="panel-body">
          ${!rondasConCupos.length
            ?`<div class="empty"><i class="bi bi-ticket-perforated"></i><p>Sin rondas</p></div>`
            :rondasConCupos.map(r=>{
                const pct=Math.round((r.cupos/25)*100);
                return `<div style="margin-bottom:.9rem">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.3rem">
                    <span style="font-size:.88rem;font-weight:600">${r.game?.nombre??'—'} <span style="color:var(--muted)">R${r.numero}</span></span>
                    ${badge(r.estado)}
                  </div>
                  <div style="display:flex;align-items:center;gap:.65rem">
                    <div style="flex:1"><div class="prog-bg"><div class="prog-fill${r.cupos>=25?' full':''}" style="width:${Math.min(pct,100)}%"></div></div></div>
                    <span style="font-family:'Oswald',sans-serif;font-size:.82rem;color:var(--gold2);flex-shrink:0">${r.cupos}/25</span>
                  </div>
                </div>`;
              }).join("")}
        </div>
      </div>
    </div>`;

  if (window.innerWidth < 700) {
    const dg = document.getElementById("dashGrid");
    if (dg) dg.style.gridTemplateColumns = "1fr";
  }
}

/* ════════════════════════════════════════
   FINANZAS
════════════════════════════════════════ */
async function finanzas() {
  setActive("finanzas");
  setCurrentView("finanzas");
  loadingView();

  const [
    { data: pagosAprobados },
    { data: premiosPagados },
    { count: totalRondas },
    { data: paysMethods }
  ] = await Promise.all([
    supabase.from("payments").select("monto,metodo,created_at").eq("estado","aprobado"),
    supabase.from("prize_payments").select("monto,metodo,created_at"),
    supabase.from("rounds").select("*",{count:"exact",head:true}).eq("estado","sorteada"),
    supabase.from("payments").select("metodo,monto").eq("estado","aprobado")
  ]);

  const totalIngresado = (pagosAprobados||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const totalPremios   = (premiosPagados||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const balance        = totalIngresado - totalPremios;
  const margen         = totalIngresado > 0 ? (balance/totalIngresado)*100 : 0;

  const byMetodo = {};
  (paysMethods||[]).forEach(p=>{
    const k = p.metodo || "manual";
    byMetodo[k] = (byMetodo[k]||0) + Number(p.monto||0);
  });

  const byMes = {};
  (pagosAprobados||[]).forEach(p=>{
    const k = new Date(p.created_at).toLocaleDateString("es-BO",{month:"short",year:"numeric"});
    byMes[k] = (byMes[k]||0) + Number(p.monto||0);
  });

  const mesLabels = Object.keys(byMes).slice(-6);
  const mesMax    = Math.max(...mesLabels.map(k=>byMes[k]),1);
  const metodoNames = { yape:"Yape", qr:"QR/Tigo", transferencia:"Transferencia", manual:"Manual", gratis:"Gratis" };

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-graph-up-arrow"></i>Finanzas</div>
        <div class="ph-sub">Resumen financiero del sistema</div>
      </div>
    </div>

    <div class="fin-grid">
      <div class="fin-card fin-ganancia">
        <div class="fin-icon"><i class="bi bi-arrow-down-circle"></i></div>
        <div class="fin-lbl">Total ingresado</div>
        <div class="fin-val green">${fmtMoney(totalIngresado)}</div>
        <div class="fin-sub">${pagosAprobados?.length??0} pagos aprobados</div>
      </div>
      <div class="fin-card fin-riesgo">
        <div class="fin-icon"><i class="bi bi-arrow-up-circle"></i></div>
        <div class="fin-lbl">Total en premios</div>
        <div class="fin-val orange">${fmtMoney(totalPremios)}</div>
        <div class="fin-sub">${premiosPagados?.length??0} premios enviados · ${totalRondas??0} rondas sorteadas</div>
      </div>
      <div class="fin-card ${balance >= 0 ? 'fin-ganancia' : 'fin-alerta'}">
        <div class="fin-icon"><i class="bi bi-cash-stack"></i></div>
        <div class="fin-lbl">Balance neto</div>
        <div class="fin-val ${balance>=0?'green':'red'}">${fmtMoney(balance)}</div>
        <div class="margen-bar">
          <div class="margen-row"><span class="margen-label">Margen</span><span class="margen-pct">${margen.toFixed(1)}%</span></div>
          <div class="margen-track"><div class="margen-fill ${margen<0?'bad':''}" style="width:${Math.min(Math.abs(margen),100)}%"></div></div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="bi bi-pie-chart"></i>Por método de pago</div></div>
        <div class="panel-body">
          ${Object.keys(byMetodo).length === 0
            ? `<div class="empty"><i class="bi bi-inbox"></i><p>Sin datos</p></div>`
            : Object.entries(byMetodo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
                const pct = totalIngresado > 0 ? (v/totalIngresado)*100 : 0;
                return `<div style="margin-bottom:.85rem">
                  <div style="display:flex;justify-content:space-between;margin-bottom:.22rem;font-size:.85rem">
                    <span>${metodoNames[k]||k}</span>
                    <span style="font-family:'Oswald',sans-serif;color:var(--gold2)">${fmtMoney(v)} <span style="color:var(--muted);font-size:.75rem">${pct.toFixed(1)}%</span></span>
                  </div>
                  <div class="prog-bg"><div class="prog-fill" style="width:${pct}%"></div></div>
                </div>`;
              }).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="bi bi-bar-chart"></i>Ingresos por mes</div></div>
        <div class="panel-body">
          ${mesLabels.length === 0
            ? `<div class="empty"><i class="bi bi-inbox"></i><p>Sin datos</p></div>`
            : mesLabels.map(k=>{
                const pct = (byMes[k]/mesMax)*100;
                return `<div style="margin-bottom:.85rem">
                  <div style="display:flex;justify-content:space-between;margin-bottom:.22rem;font-size:.85rem">
                    <span>${k}</span>
                    <span style="font-family:'Oswald',sans-serif;color:var(--gold2)">${fmtMoney(byMes[k])}</span>
                  </div>
                  <div class="prog-bg"><div class="prog-fill" style="width:${pct}%"></div></div>
                </div>`;
              }).join("")}
        </div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   PAGOS PENDIENTES
════════════════════════════════════════ */
async function pagos_pendientes() {
  setActive("pagos_pendientes");
  setCurrentView("pagos_pendientes");
  loadingView();

  const { data: pays } = await supabase
    .from("payments")
    .select("id,user_id,round_id,monto,metodo,estado,comprobante_url,referencia,boletos_solicitados,created_at")
    .eq("estado","pendiente")
    .order("created_at",{ascending:true});

  const userIds  = (pays||[]).map(p=>p.user_id).filter(Boolean);
  const roundIds = [...new Set((pays||[]).map(p=>p.round_id).filter(Boolean))];
  const profMap  = await getProfilesMap(userIds);

  let roundsMap = {};
  if (roundIds.length) {
    const { data: rds } = await supabase.from("rounds").select("id,numero,game_id").in("id",roundIds);
    const gIds = [...new Set((rds||[]).map(r=>r.game_id).filter(Boolean))];
    let gMap = {};
    if (gIds.length) {
      const { data: gms } = await supabase.from("games").select("id,nombre").in("id",gIds);
      (gms||[]).forEach(g=>{gMap[g.id]=g});
    }
    (rds||[]).forEach(r=>{ roundsMap[r.id] = { ...r, game: gMap[r.game_id] }; });
  }

  window.__payMap = {};
  (pays||[]).forEach(p=>{
    const prof = profMap[p.user_id]||{};
    const round = roundsMap[p.round_id]||{};
    window.__payMap[p.id] = { ...p, username: prof.username, email: prof.email, round };
  });

  const total = (pays||[]).reduce((s,p)=>s+Number(p.monto||0),0);

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-hourglass-split"></i>Pagos pendientes</div>
        <div class="ph-sub">${pays?.length??0} comprobante${pays?.length!==1?"s":""} por revisar · ${fmtMoney(total)} en espera</div>
      </div>
      ${pays?.length>0?`<button class="btn btn-gold btn-md" onclick="aprobarTodos()"><i class="bi bi-check-all"></i> Aprobar todos</button>`:""}
    </div>

    ${pays?.length>0?`
    <div class="fondo-alert warn">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <div>
        <div class="fondo-alert-title">${pays.length} comprobante${pays.length!==1?'s':''} esperando aprobación</div>
        <div class="fondo-alert-sub">Revisa cada comprobante antes de aprobar. Los boletos se asignan automáticamente al aprobar.</div>
      </div>
    </div>`:""}

    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-cash-stack"></i>Comprobantes pendientes</div>
        <span style="font-size:.82rem;color:var(--muted)">${pays?.length??0} registros</span>
      </div>
      <div class="panel-body" style="overflow-x:auto">
        ${!pays?.length
          ?`<div class="empty"><i class="bi bi-check-circle" style="color:#22c55e"></i><p>¡Todo al día! No hay comprobantes pendientes.</p></div>`
          :`<table id="tblPend" style="width:100%">
              <thead><tr><th>Usuario</th><th>Email</th><th>Sorteo/Ronda</th><th>Monto</th><th>Boletos</th><th>Método</th><th>Fecha</th><th>Comprobante</th><th>Acciones</th></tr></thead>
              <tbody>
                ${(pays||[]).map(p=>{
                  const prof = profMap[p.user_id]||{};
                  const round = roundsMap[p.round_id]||{};
                  return `<tr>
                    <td><strong>${prof.username??"—"}</strong></td>
                    <td style="color:var(--muted);font-size:.82rem">${prof.email??"—"}</td>
                    <td style="font-size:.82rem">${round.game?.nombre??'—'} <span style="color:var(--muted)">R${round.numero??'?'}</span></td>
                    <td style="font-family:'Oswald',sans-serif;color:var(--gold2)">${fmtMoney(p.monto)}</td>
                    <td style="font-family:'Oswald',sans-serif;font-weight:700">${p.boletos_solicitados||1}</td>
                    <td>${p.metodo==="gratis"?badge("gratis"):(p.metodo??"—")}</td>
                    <td style="color:var(--muted)">${fmtDateShort(p.created_at)}</td>
                    <td>${p.comprobante_url
                          ?`<button class="btn btn-ghost btn-sm" onclick="modalVerComprobante(window.__payMap['${p.id}'])"><i class="bi bi-image"></i> Ver</button>`
                          :`<span style="color:var(--dim);font-size:.8rem">Sin imagen</span>`}
                    </td>
                    <td><div style="display:flex;gap:.32rem">
                      <button class="btn btn-success btn-sm" onclick="aprobarPagoId('${p.id}','${p.round_id}','${p.metodo||''}')"><i class="bi bi-check-lg"></i> Aprobar</button>
                      <button class="btn btn-danger btn-sm" onclick="rechazarPagoId('${p.id}')"><i class="bi bi-x-lg"></i></button>
                    </div></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>`}
      </div>
    </div>`;

  if (pays?.length) initDT("tblPend",{columnDefs:[{orderable:false,targets:[7,8]}],order:[[6,"asc"]]});
}

window.aprobarPagoId = async (id, roundId, metodo) => {
  const r = await confirm$("Aprobar pago","¿El comprobante es válido?","✅ Sí, aprobar");
  if (!r.isConfirmed) return;
  loading$("Aprobando...");

  const { data: pago, error: pErr } = await supabase.from("payments")
    .select("user_id,boletos_solicitados,round_id,metodo").eq("id",id).single();
  if (pErr || !pago) { Swal.close(); ok$("Error","No se pudo obtener el pago","error"); return; }

  const efectMetodo = metodo || pago.metodo || "";
  const esGratis = efectMetodo === "gratis";
  const boletos = pago.boletos_solicitados || 1;
  const rId = roundId || pago.round_id;

  if (!rId) { Swal.close(); ok$("Error","El pago no tiene ronda asociada","error"); return; }

  const { error: upErr } = await supabase.from("payments")
    .update({ estado:"aprobado", revisado_por: user.id }).eq("id",id);
  if (upErr) { Swal.close(); ok$("Error al aprobar",upErr.message,"error"); return; }

  const { data: partExist } = await supabase.from("participations")
    .select("id,boletos").eq("round_id",rId).eq("user_id",pago.user_id).maybeSingle();
  if (partExist) {
    await supabase.from("participations")
      .update({ boletos: (partExist.boletos||1) + boletos }).eq("id",partExist.id);
  } else {
    await supabase.from("participations").insert({
      round_id: rId, user_id: pago.user_id, boletos, resultado: "pendiente",
      ...(esGratis ? { es_gratis: true } : {})
    });
  }
  Swal.close();
  toast(`Aprobado · ${boletos} boleto${boletos!==1?"s":""} asignado${boletos!==1?"s":""} ✅`);
  pagos_pendientes();
  updateSidebarBadges();
};

window.rechazarPagoId = async (id) => {
  const r = await confirm$("Rechazar pago","¿Rechazar este comprobante?","❌ Rechazar");
  if (!r.isConfirmed) return;
  loading$("Rechazando...");
  await supabase.from("payments").update({ estado:"rechazado", revisado_por: user.id }).eq("id",id);
  Swal.close();
  toast("Pago rechazado","error");
  pagos_pendientes();
  updateSidebarBadges();
};

window.aprobarTodos = async () => {
  const r = await confirm$("Aprobar todos","Se aprobarán <strong>todos</strong> los comprobantes pendientes y se asignarán boletos automáticamente.","✅ Aprobar todos");
  if (!r.isConfirmed) return;
  loading$("Aprobando todos...");

  const { data: pays } = await supabase.from("payments")
    .select("id,user_id,boletos_solicitados,round_id,metodo").eq("estado","pendiente");

  let ok = 0;
  for (const p of (pays||[])) {
    const esGratis = p.metodo === "gratis";
    const boletos = p.boletos_solicitados || 1;
    if (!p.round_id) continue;
    await supabase.from("payments").update({ estado:"aprobado", revisado_por: user.id }).eq("id",p.id);
    const { data: partExist } = await supabase.from("participations")
      .select("id,boletos").eq("round_id",p.round_id).eq("user_id",p.user_id).maybeSingle();
    if (partExist) {
      await supabase.from("participations").update({ boletos:(partExist.boletos||1)+boletos }).eq("id",partExist.id);
    } else {
      await supabase.from("participations").insert({
        round_id: p.round_id, user_id: p.user_id, boletos, resultado: "pendiente",
        ...(esGratis ? { es_gratis: true } : {})
      });
    }
    ok++;
  }
  Swal.close();
  toast(`${ok} pagos aprobados ✅`);
  pagos_pendientes();
  updateSidebarBadges();
};

/* ════════════════════════════════════════
   SORTEOS
════════════════════════════════════════ */
async function sorteos() {
  setActive("sorteos");
  setCurrentView("sorteos");
  loadingView();

  const { data: games } = await supabase.from("games").select("*").order("created_at",{ascending:false});
  const gamesData = await Promise.all((games||[]).map(async g => {
    const { data: roundsData } = await supabase
      .from("rounds").select("id,numero,estado").eq("game_id",g.id).order("numero",{ascending:false});
    const ar = roundsData?.find(r=>r.estado==="abierta");
    let cuposActivos=0, compPend=0;
    if (ar) {
      const { data: parts } = await supabase.from("participations").select("boletos").eq("round_id",ar.id);
      cuposActivos = (parts||[]).reduce((s,p)=>s+(p.boletos||1),0);
      const { count: cp } = await supabase.from("payments").select("*",{count:"exact",head:true}).eq("round_id",ar.id).eq("estado","pendiente");
      compPend = cp ?? 0;
    }
    return { ...g, rounds: roundsData||[], activeRound: ar, cuposActivos, compPend, totalRondas: roundsData?.length??0 };
  }));

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-ticket-perforated-fill"></i>Sorteos</div>
        <div class="ph-sub">Cada sorteo puede tener múltiples rondas de 25 cupos</div>
      </div>
      <button class="btn btn-red btn-md" onclick="modalNuevoSorteo()"><i class="bi bi-plus-lg"></i> Nuevo sorteo</button>
    </div>

    ${!gamesData.length
      ?`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-ticket-perforated"></i><p>No hay sorteos aún.</p></div></div></div>`
      :`<div class="sorteo-grid">${gamesData.map(g=>{
          const ar = g.activeRound;
          const pct = ar ? Math.round((g.cuposActivos/25)*100) : 0;
          const lleno = ar && g.cuposActivos >= 25;
          return `<div class="sorteo-card">
            <div class="sorteo-card-head">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
                <div><h3>${g.nombre}</h3><p>${g.descripcion||"Sin descripción"}</p></div>
                ${badge(g.estado)}
              </div>
              <div style="margin-top:.55rem;display:flex;align-items:center;gap:.6rem;font-size:.8rem;color:var(--muted)">
                <i class="bi bi-arrow-repeat"></i> ${g.totalRondas} ronda${g.totalRondas!==1?"s":""}
                ${g.precio_boleto>0?`<span>·</span><i class="bi bi-tag"></i> ${fmtMoney(g.precio_boleto)}/boleto`:""}
              </div>
            </div>
            <div class="sorteo-card-mid">
              ${ar
                ?`<div class="prog-label"><span>Ronda #${ar.numero} — boletos</span><span>${g.cuposActivos}/25 ${lleno?'· ✅ LISTA':''}</span></div>
                  <div class="prog-bg"><div class="prog-fill${lleno?' full':''}" style="width:${Math.min(pct,100)}%"></div></div>
                  ${g.compPend>0?`<div style="margin-top:.5rem;font-size:.77rem;color:var(--gold2)"><i class="bi bi-exclamation-triangle"></i> ${g.compPend} comprobante${g.compPend>1?'s':''} pendiente${g.compPend>1?'s':''}</div>`:""}`
                :`<div style="text-align:center;padding:.6rem 0;color:var(--muted);font-size:.87rem">
                    <i class="bi bi-moon-stars"></i> Sin ronda activa
                    ${g.estado==='activo'?`<br><button class="btn btn-gold btn-sm" style="margin-top:.5rem" onclick="iniciarRonda('${g.id}','${g.nombre}',${g.totalRondas})"><i class="bi bi-play-fill"></i> Iniciar ronda ${g.totalRondas+1}</button>`:""}
                  </div>`}
            </div>
            <div class="sorteo-card-foot">
              <button class="btn btn-ghost btn-sm" onclick="verRondas('${g.id}','${g.nombre}')"><i class="bi bi-layers"></i> Rondas</button>
              ${ar?`
                <button class="btn btn-info btn-sm" onclick="verParticipantes('${ar.id}','${g.nombre}','${ar.numero}')"><i class="bi bi-people"></i> Participantes</button>
                <button class="btn btn-ghost btn-sm" onclick="verComprobantes('${ar.id}','${g.nombre}','${ar.numero}')">
                  <i class="bi bi-receipt"></i> Comprobantes${g.compPend>0?` <span style="background:var(--red2);color:#fff;border-radius:10px;padding:0 .38rem;font-size:.68rem">${g.compPend}</span>`:""}
                </button>
                ${lleno?`<button class="btn btn-gold btn-sm" onclick="realizarSorteo('${ar.id}','${g.nombre}','${ar.numero}')"><i class="bi bi-shuffle"></i> Sortear</button>`:""}
                <button class="btn btn-danger btn-sm" onclick="cerrarRonda('${ar.id}','${g.nombre}','${ar.numero}')"><i class="bi bi-lock"></i></button>
              `:""}
            </div>
          </div>`;
        }).join("")}</div>`}`;
}

window.modalNuevoSorteo = async () => {
  const { value: v } = await Swal.fire({
    title: "Nuevo Sorteo",
    html: `<div style="text-align:left">
      <div class="field" style="margin-bottom:.9rem"><label>Nombre *</label><input id="sNom" class="swal2-input" placeholder="ej. Mesa Premium" style="margin:0;width:100%"></div>
      <div class="field" style="margin-bottom:.9rem"><label>Descripción</label><input id="sDesc" class="swal2-input" placeholder="Opcional" style="margin:0;width:100%"></div>
      <div class="field"><label>Precio por boleto (Bs)</label><input id="sPrecio" class="swal2-input" type="number" min="0" step="0.50" placeholder="0.00" style="margin:0;width:100%"></div>
    </div>`,
    showCancelButton: true, confirmButtonText: "Crear sorteo", cancelButtonText: "Cancelar", ...swal$,
    preConfirm: () => {
      const n = document.getElementById("sNom").value.trim();
      if (!n) { Swal.showValidationMessage("El nombre es obligatorio"); return false; }
      return { nombre: n, descripcion: document.getElementById("sDesc").value.trim(), precio: parseFloat(document.getElementById("sPrecio").value)||0 };
    }
  });
  if (!v) return;
  loading$("Creando sorteo...");
  const { error } = await supabase.from("games").insert({ nombre:v.nombre, descripcion:v.descripcion, precio_boleto:v.precio, estado:"activo" });
  Swal.close();
  if (error) { ok$("Error",error.message,"error"); return; }
  await ok$("¡Sorteo creado!","Ahora puedes iniciar la primera ronda.","success");
  sorteos();
};

window.iniciarRonda = async (gameId, gameNombre, totalRondas) => {
  const r = await confirm$(`Iniciar Ronda ${totalRondas+1}`,`<strong style="color:#fff">${gameNombre}</strong><br>Se abrirán 25 cupos.`,"🎟️ Iniciar ronda");
  if (!r.isConfirmed) return;
  loading$("Iniciando ronda...");
  const { error } = await supabase.from("rounds").insert({ game_id:gameId, numero:totalRondas+1, estado:"abierta" });
  Swal.close();
  if (error) { ok$("Error",error.message,"error"); return; }
  toast(`Ronda ${totalRondas+1} iniciada`);
  sorteos();
};

window.cerrarRonda = async (roundId, gameNombre, num) => {
  const r = await confirm$(`Cerrar Ronda ${num}`,`<strong style="color:#fff">${gameNombre}</strong><br>No se aceptarán más participantes.`,"Cerrar ronda");
  if (!r.isConfirmed) return;
  await supabase.from("rounds").update({ estado:"cerrada" }).eq("id",roundId);
  toast("Ronda cerrada","info");
  sorteos();
};

window.verRondas = async (gameId, gameNombre) => {
  setCurrentView("__subview__");
  loadingView();
  const { data: rounds } = await supabase.from("rounds")
    .select("id,numero,estado,sorteado_at,created_at,ganador_id,ganador2_id,ganador3_id,caso_sorteo,premio_especial")
    .eq("game_id",gameId).order("numero",{ascending:false});

  const allIds = (rounds||[]).flatMap(r=>[r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean));
  const ganadoresMap = await getProfilesMap(allIds);

  const roundsData = await Promise.all((rounds||[]).map(async r=>{
    const { data: parts } = await supabase.from("participations").select("boletos").eq("round_id",r.id);
    return { ...r, cupos:(parts||[]).reduce((s,p)=>s+(p.boletos||1),0),
      ganador:ganadoresMap[r.ganador_id], ganador2:ganadoresMap[r.ganador2_id], ganador3:ganadoresMap[r.ganador3_id] };
  }));

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-layers"></i>Rondas</div>
        <div class="ph-sub">${gameNombre} · ${roundsData.length} ronda${roundsData.length!==1?"s":""}</div>
      </div>
      ${renderBackBtn("Volver a sorteos",sorteos)}
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-list-ol"></i>Historial de rondas</div></div>
      <div class="panel-body" style="overflow-x:auto">
        <table id="tblRondas" style="width:100%">
          <thead><tr><th>Ronda</th><th>Estado</th><th>Boletos</th><th>Ganadores</th><th>Caso</th><th>Sorteado</th><th>Inicio</th><th>Acciones</th></tr></thead>
          <tbody>${roundsData.map(r=>`<tr>
            <td><span style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:var(--gold2)">R${r.numero}</span></td>
            <td>${badge(r.estado)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:.5rem">
                <div class="prog-bg" style="width:80px"><div class="prog-fill${r.cupos>=25?' full':''}" style="width:${Math.min(Math.round(r.cupos/25*100),100)}%"></div></div>
                <span style="font-size:.82rem;color:var(--muted)">${r.cupos}/25</span>
              </div>
            </td>
            <td>
              ${r.ganador?`<div style="font-size:.82rem"><span style="color:var(--gold2)">🥇</span> <strong>${r.ganador.username}</strong></div>`:'<span style="color:var(--muted)">—</span>'}
              ${r.ganador2?`<div style="font-size:.78rem;color:#93c5fd">🥈 ${r.ganador2.username}</div>`:""}
              ${r.ganador3?`<div style="font-size:.75rem;color:#d97706">🥉 ${r.ganador3.username}</div>`:""}
            </td>
            <td style="font-size:.78rem;color:var(--muted)">${r.caso_sorteo?nombreCaso(r.caso_sorteo):'—'}${r.premio_especial?' <span style="color:var(--gold2)">🎁</span>':''}</td>
            <td style="color:var(--muted)">${r.sorteado_at?fmtDate(r.sorteado_at):'—'}</td>
            <td style="color:var(--muted)">${fmtDateShort(r.created_at)}</td>
            <td>
              <div style="display:flex;gap:.35rem;flex-wrap:wrap">
                <button class="btn btn-info btn-sm" onclick="verParticipantes('${r.id}','${gameNombre}','${r.numero}')"><i class="bi bi-people"></i></button>
                <button class="btn btn-ghost btn-sm" onclick="verComprobantes('${r.id}','${gameNombre}','${r.numero}')"><i class="bi bi-receipt"></i></button>
                ${r.estado==='abierta'&&r.cupos>=25?`<button class="btn btn-gold btn-sm" onclick="realizarSorteo('${r.id}','${gameNombre}','${r.numero}')"><i class="bi bi-shuffle"></i></button>`:""}
                ${r.estado==='abierta'?`<button class="btn btn-danger btn-sm" onclick="cerrarRonda('${r.id}','${gameNombre}','${r.numero}')"><i class="bi bi-lock"></i></button>`:""}
              </div>
            </td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
    </div>`;
  initDT("tblRondas",{order:[[0,"desc"]],columnDefs:[{orderable:false,targets:7}]});
};

window.realizarSorteo = async (roundId, gameNombre, num) => {
  const r = await confirm$(`Sortear Ronda ${num}`,`<strong style="color:#fff">${gameNombre}</strong><br>Lógica ponderada. <strong>No se puede deshacer.</strong>`,"🎲 Realizar sorteo");
  if (!r.isConfirmed) return;
  loading$("Realizando sorteo...");

  const { data: parts } = await supabase.from("participations")
    .select("id,user_id,boletos,resultado").eq("round_id",roundId).eq("resultado","pendiente");
  if (!parts?.length) { Swal.close(); ok$("Sin participantes","","warning"); return; }

  const profilesMap = await getProfilesMap(parts.map(p=>p.user_id));
  const participantes = parts.map(p=>({ id:p.id, user_id:p.user_id, username:profilesMap[p.user_id]?.username||"—", boletos:p.boletos||1 }));

  const resultado = calcSorteo(participantes);
  const { caso, ganadores, premioEspecial } = resultado;

  const g1s = ganadores.filter(g=>g.lugar===1);
  const g1  = g1s[0] || null;
  const g1b = g1s[1] || null;
  const g2  = ganadores.find(g=>g.lugar===2) || null;
  const g3  = ganadores.find(g=>g.lugar===3) || null;

  for (const g of ganadores) {
    await supabase.from("participations").update({ resultado:"ganada", lugar:g.lugar }).eq("id",g.id);
  }
  const ganadorIds = ganadores.map(g=>g.id);
  const losers = parts.filter(p=>!ganadorIds.includes(p.id)).map(p=>p.id);
  if (losers.length) await supabase.from("participations").update({ resultado:"perdida" }).in("id",losers);

  await supabase.from("rounds").update({
    estado:"sorteada",
    ganador_id:  g1?.user_id  || null,
    ganador2_id: g1b?.user_id || g2?.user_id || null,
    ganador3_id: g3?.user_id  || null,
    caso_sorteo: caso, premio_especial: premioEspecial,
    sorteado_at: new Date().toISOString()
  }).eq("id",roundId);

  Swal.close();
  await Swal.fire({
    title: premioEspecial ? "🎩 ¡CASO ESPECIAL!" : "🏆 ¡Sorteo realizado!",
    html: `
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:.5rem">${nombreCaso(caso)}</div>
      ${g1?`<div style="font-family:'Oswald',sans-serif;font-size:1.5rem;color:#d4a017;margin:.2rem 0">${g1.username} 🥇</div>`:""}
      ${g1b?`<div style="font-size:.9rem;color:#d4a017;margin:.12rem 0">${g1b.username} 🥇</div>`:""}
      ${g2?`<div style="margin:.18rem 0;font-size:.9rem;color:#93c5fd">🥈 ${g2.username}</div>`:""}
      ${g3?`<div style="font-size:.88rem;color:#d97706">🥉 ${g3.username}</div>`:""}
      ${premioEspecial?'<div style="margin-top:.6rem;font-size:.82rem;color:var(--gold2)">🎁 Premio especial activado</div>':""}
      <div style="color:var(--muted);font-size:.78rem;margin-top:.5rem">${gameNombre} · Ronda ${num}</div>`,
    icon:"success", confirmButtonText:"Excelente", ...swal$
  });
  sorteos();
};

/* ════════════════════════════════════════
   PARTICIPANTES
════════════════════════════════════════ */
window.verParticipantes = async (roundId, gameNombre, num) => {
  setCurrentView("__subview__");
  loadingView();
  const { data: parts } = await supabase.from("participations")
    .select("id,user_id,boletos,resultado,lugar,es_gratis,created_at").eq("round_id",roundId).order("created_at",{ascending:true});

  const profilesMap = await getProfilesMap((parts||[]).map(p=>p.user_id));
  const totalBoletos = (parts||[]).reduce((s,p)=>s+(p.boletos||1),0);

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-people"></i>Participantes</div>
        <div class="ph-sub">${gameNombre} · Ronda ${num} · ${totalBoletos}/25 boletos · ${parts?.length??0} participantes</div>
      </div>
      ${renderBackBtn("Volver a sorteos",sorteos)}
    </div>
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-list-ol"></i>Lista de participantes</div>
        <span style="font-size:.82rem;color:var(--muted)">${parts?.length??0} participantes · ${totalBoletos} boletos</span>
      </div>
      <div class="panel-body" style="overflow-x:auto">
        ${!parts?.length
          ?`<div class="empty"><i class="bi bi-people"></i><p>Sin participantes aún.</p></div>`
          :`<table id="tblPart" style="width:100%">
              <thead><tr><th>#</th><th>Usuario</th><th>Email</th><th>Boletos</th><th>Tipo</th><th>Resultado</th><th>Lugar</th><th>Inscripción</th></tr></thead>
              <tbody>${parts.map((p,i)=>{
                const prof = profilesMap[p.user_id]||{};
                const lugarEmoji = p.lugar===1?"🥇":p.lugar===2?"🥈":p.lugar===3?"🥉":"—";
                return `<tr>
                  <td style="color:var(--muted);font-family:'Oswald',sans-serif">${i+1}</td>
                  <td><strong>${prof.username??"—"}</strong></td>
                  <td style="color:var(--muted)">${prof.email??"—"}</td>
                  <td><span style="font-family:'Oswald',sans-serif;font-size:.95rem;color:var(--gold2);font-weight:700">${p.boletos||1}</span></td>
                  <td>${p.es_gratis?badge("gratis"):'<span style="color:var(--muted);font-size:.78rem">pago</span>'}</td>
                  <td>${badge(p.resultado)}</td>
                  <td style="font-size:1rem">${p.lugar?lugarEmoji:'<span style="color:var(--muted)">—</span>'}</td>
                  <td style="color:var(--muted)">${fmtDate(p.created_at)}</td>
                </tr>`;
              }).join("")}</tbody>
            </table>`}
      </div>
    </div>`;
  if (parts?.length) initDT("tblPart",{pageLength:25,columnDefs:[{orderable:false,targets:[0,6]}]});
};

/* ════════════════════════════════════════
   COMPROBANTES
════════════════════════════════════════ */
window.verComprobantes = async (roundId, gameNombre, num) => {
  setCurrentView("__subview__");
  loadingView();
  const { data: pays } = await supabase.from("payments")
    .select("id,user_id,monto,metodo,estado,comprobante_url,referencia,boletos_solicitados,created_at")
    .eq("round_id",roundId).order("created_at",{ascending:false});

  const profilesMap = await getProfilesMap((pays||[]).map(p=>p.user_id));
  const pendCount = (pays||[]).filter(p=>p.estado==="pendiente").length;

  window.__compMap = {};
  (pays||[]).forEach(p=>{
    const prof = profilesMap[p.user_id]||{};
    window.__compMap[p.id] = { ...p, username:prof.username, email:prof.email };
  });

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-receipt"></i>Comprobantes</div>
        <div class="ph-sub">${gameNombre} · Ronda ${num} · ${pendCount} pendiente${pendCount!==1?"s":""}</div>
      </div>
      ${renderBackBtn("Volver a sorteos",sorteos)}
    </div>
    ${pendCount>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">${pendCount} comprobante${pendCount!==1?'s':''} esperando revisión</div><div class="fondo-alert-sub">Revisa la imagen antes de aprobar.</div></div></div>`:""}
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-cash-stack"></i>Comprobantes de la ronda</div><span style="font-size:.82rem;color:var(--muted)">${pays?.length??0} registros</span></div>
      <div class="panel-body" style="overflow-x:auto">
        ${!pays?.length
          ?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin comprobantes en esta ronda</p></div>`
          :`<table id="tblComp" style="width:100%">
              <thead><tr><th>Usuario</th><th>Email</th><th>Monto</th><th>Boletos</th><th>Método</th><th>Estado</th><th>Fecha</th><th>Imagen</th><th>Acción</th></tr></thead>
              <tbody>${pays.map(p=>{
                const prof = profilesMap[p.user_id]||{};
                return `<tr>
                  <td><strong>${prof.username??"—"}</strong></td>
                  <td style="color:var(--muted);font-size:.82rem">${prof.email??"—"}</td>
                  <td style="font-family:'Oswald',sans-serif;color:var(--gold2)">${fmtMoney(p.monto)}</td>
                  <td style="font-family:'Oswald',sans-serif;font-weight:700">${p.boletos_solicitados||1}</td>
                  <td>${p.metodo==="gratis"?badge("gratis"):(p.metodo??"—")}</td>
                  <td>${badge(p.estado)}</td>
                  <td style="color:var(--muted)">${fmtDateShort(p.created_at)}</td>
                  <td>${p.comprobante_url
                        ?`<button class="btn btn-ghost btn-sm" onclick="modalVerComprobante(window.__compMap['${p.id}'])"><i class="bi bi-image"></i> Ver</button>`
                        :`<span style="color:var(--dim);font-size:.8rem">Sin imagen</span>`}</td>
                  <td>${p.estado==="pendiente"
                        ?`<div style="display:flex;gap:.32rem">
                            <button class="btn btn-success btn-sm" onclick="aprobarPago('${p.id}','${roundId}','${gameNombre}','${num}')"><i class="bi bi-check-lg"></i> Aprobar</button>
                            <button class="btn btn-danger btn-sm" onclick="rechazarPago('${p.id}','${roundId}','${gameNombre}','${num}')"><i class="bi bi-x-lg"></i></button>
                          </div>`
                        :`<span style="color:var(--dim);font-size:.8rem">—</span>`}</td>
                </tr>`;
              }).join("")}</tbody>
            </table>`}
      </div>
    </div>`;
  if (pays?.length) initDT("tblComp",{columnDefs:[{orderable:false,targets:[7,8]}],order:[[5,"asc"]]});
};

window.modalVerComprobante = (p) => {
  if (!p) return;
  Swal.fire({
    title:"Comprobante de pago",
    html:`<img src="${p.comprobante_url}" style="width:100%;max-height:280px;object-fit:contain;border-radius:8px;border:1px solid rgba(139,26,26,.22);margin-bottom:1rem" onerror="this.src='https://placehold.co/400x200/131009/d4a017?text=No+disponible'">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Usuario</div><div style="color:#fff">${p.username??"—"}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Monto</div><div style="color:var(--gold2);font-family:'Oswald',sans-serif;font-size:1.1rem">${fmtMoney(p.monto)}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Boletos</div><div style="font-family:'Oswald',sans-serif;font-size:1.1rem">${p.boletos_solicitados||1}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Método</div><div>${p.metodo==="gratis"?'🎁 Gratis':(p.metodo??"—")}</div></div>
        ${p.referencia?`<div style="grid-column:1/-1"><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Referencia</div><div>${p.referencia}</div></div>`:""}
      </div>`,
    showConfirmButton:false, showCloseButton:true, width:520, ...swal$
  });
};

window.aprobarPago = async (id, roundId, gameNombre, num) => {
  const r = await confirm$("Aprobar pago","¿El comprobante es válido?","✅ Sí, aprobar");
  if (!r.isConfirmed) return;
  loading$("Aprobando...");
  const { data: pago, error: pErr } = await supabase.from("payments")
    .select("user_id,boletos_solicitados,metodo").eq("id",id).single();
  if (pErr || !pago) { Swal.close(); ok$("Error","No se pudo obtener el pago","error"); return; }
  const esGratis = pago.metodo === "gratis";
  const boletos = pago.boletos_solicitados || 1;
  const { error: upErr } = await supabase.from("payments").update({ estado:"aprobado", revisado_por:user.id }).eq("id",id);
  if (upErr) { Swal.close(); ok$("Error",upErr.message,"error"); return; }
  const { data: partExist } = await supabase.from("participations").select("id,boletos").eq("round_id",roundId).eq("user_id",pago.user_id).maybeSingle();
  if (partExist) {
    await supabase.from("participations").update({ boletos:(partExist.boletos||1)+boletos }).eq("id",partExist.id);
  } else {
    await supabase.from("participations").insert({
      round_id:roundId, user_id:pago.user_id, boletos, resultado:"pendiente",
      ...(esGratis?{es_gratis:true}:{})
    });
  }
  Swal.close();
  toast(`Aprobado · ${boletos} boleto${boletos!==1?"s":""} ✅`);
  updateSidebarBadges();
  verComprobantes(roundId,gameNombre,num);
};

window.rechazarPago = async (id, roundId, gameNombre, num) => {
  const r = await confirm$("Rechazar pago","¿Rechazar este comprobante?","❌ Rechazar");
  if (!r.isConfirmed) return;
  loading$("Rechazando...");
  await supabase.from("payments").update({ estado:"rechazado", revisado_por:user.id }).eq("id",id);
  Swal.close();
  toast("Pago rechazado","error");
  updateSidebarBadges();
  verComprobantes(roundId,gameNombre,num);
};

/* ════════════════════════════════════════
   GANADORES
════════════════════════════════════════ */
async function ganadores() {
  setActive("ganadores");
  setCurrentView("ganadores");
  loadingView();

  const { data: rounds } = await supabase.from("rounds")
    .select("id,numero,sorteado_at,game_id,ganador_id,ganador2_id,ganador3_id,caso_sorteo,premio_especial")
    .eq("estado","sorteada").not("ganador_id","is",null).order("sorteado_at",{ascending:false});

  const allIds = (rounds||[]).flatMap(r=>[r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean));
  const gameIds = [...new Set((rounds||[]).map(r=>r.game_id).filter(Boolean))];
  const roundIds = (rounds||[]).map(r=>r.id);

  const [ganadoresMap, gamesMap, { data: pagosReg }] = await Promise.all([
    getProfilesMap(allIds),
    (async()=>{
      if (!gameIds.length) return {};
      const { data } = await supabase.from("games").select("id,nombre").in("id",gameIds);
      const m={}; (data||[]).forEach(g=>{m[g.id]=g}); return m;
    })(),
    roundIds.length
      ? supabase.from("prize_payments").select("round_id,user_id,lugar,monto,metodo,estado").in("round_id",roundIds)
      : { data: [] }
  ]);

  const pagosMap = {};
  (pagosReg||[]).forEach(p=>{ pagosMap[`${p.round_id}_${p.lugar}`] = p; });

  const btnPago = (pago, roundId, userId, lugar, gameNombre, numRonda, username) => {
    if (!userId) return '<span style="color:var(--dim)">—</span>';
    if (pago) return `<span class="bdg bdg-ok" title="${pago.metodo} · ${fmtMoney(pago.monto)}">✅ ${fmtMoney(pago.monto)}</span>`;
    const gn=(gameNombre||"").replace(/'/g,"\\'");
    const un=(username||"").replace(/'/g,"\\'");
    return `<button class="btn btn-gold btn-sm" onclick="registrarPremio('${roundId}','${userId}',${lugar},'${gn}','${numRonda}','${un}')"><i class="bi bi-cash-coin"></i> Pagar</button>`;
  };

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-trophy-fill"></i>Ganadores</div>
        <div class="ph-sub">${rounds?.length??0} sorteo${rounds?.length!==1?"s":""} realizado${rounds?.length!==1?"s":""}</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-table"></i>Historial completo</div><span style="font-size:.82rem;color:var(--muted)">${rounds?.length??0} registros</span></div>
      <div class="panel-body" style="overflow-x:auto">
        ${!rounds?.length
          ?`<div class="empty"><i class="bi bi-trophy"></i><p>Aún no hay ganadores.</p></div>`
          :`<table id="tblGan" style="width:100%">
              <thead><tr><th>#</th><th>🥇 Ganador</th><th>🥈 2do</th><th>🥉 3ro</th><th>Sorteo</th><th>Ronda</th><th>Caso</th><th>Pago 🥇</th><th>Pago 🥈</th><th>Pago 🥉</th><th>Fecha</th></tr></thead>
              <tbody>${rounds.map((r,i)=>{
                const g1=ganadoresMap[r.ganador_id]||{};
                const g2=ganadoresMap[r.ganador2_id]||{};
                const g3=ganadoresMap[r.ganador3_id]||{};
                const game=gamesMap[r.game_id]||{};
                return `<tr>
                  <td><span style="font-family:'Oswald',sans-serif;font-weight:700;color:var(--gold2)">${i+1}</span></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:.5rem">
                      <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--gold2));display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:.82rem;font-weight:700;color:#fff;flex-shrink:0">${(g1.username??"?")[0].toUpperCase()}</div>
                      <strong>${g1.username??"—"}</strong>
                    </div>
                  </td>
                  <td style="color:#93c5fd">${g2.username||'<span style="color:var(--dim)">—</span>'}</td>
                  <td style="color:#d97706">${g3.username||'<span style="color:var(--dim)">—</span>'}</td>
                  <td>${game.nombre??"—"}</td>
                  <td><span style="font-family:'Oswald',sans-serif;color:var(--gold2)">R${r.numero}</span></td>
                  <td style="font-size:.78rem;color:var(--muted)">${r.caso_sorteo?nombreCaso(r.caso_sorteo):'—'}${r.premio_especial?' 🎁':''}</td>
                  <td>${btnPago(pagosMap[`${r.id}_1`],r.id,r.ganador_id, 1,game.nombre,r.numero,g1.username)}</td>
                  <td>${btnPago(pagosMap[`${r.id}_2`],r.id,r.ganador2_id,2,game.nombre,r.numero,g2.username)}</td>
                  <td>${btnPago(pagosMap[`${r.id}_3`],r.id,r.ganador3_id,3,game.nombre,r.numero,g3.username)}</td>
                  <td style="color:var(--muted)">${r.sorteado_at?fmtDate(r.sorteado_at):"—"}</td>
                </tr>`;
              }).join("")}</tbody>
            </table>`}
      </div>
    </div>`;
  if (rounds?.length) initDT("tblGan",{order:[[10,"desc"]],columnDefs:[{orderable:false,targets:0}],scrollX:true});
}

window.registrarPremio = async (roundId, userId, lugar, gameNombre, numRonda, username) => {
  const lugarLabel = lugar===1?"🥇 1er lugar":lugar===2?"🥈 2do lugar":"🥉 3er lugar";
  const { value: v } = await Swal.fire({
    title:`Registrar pago — ${username}`,
    html:`<div style="text-align:left">
      <div style="background:var(--ink3);border:1px solid var(--bord-g);border-radius:10px;padding:.75rem 1rem;margin-bottom:.85rem">
        <div style="font-family:'Oswald',sans-serif;font-size:.9rem;color:#fff">${gameNombre} · Ronda #${numRonda}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.15rem">${lugarLabel} — <strong style="color:var(--gold2)">${username}</strong></div>
      </div>
      <div class="field" style="margin-bottom:.8rem">
        <label>Monto enviado (Bs) *</label>
        <input id="pMonto" class="swal2-input" type="number" min="0" step="0.50" placeholder="0.00" style="margin:0;width:100%">
      </div>
      <div class="field" style="margin-bottom:.8rem">
        <label>Método de pago *</label>
        <select id="pMetodo" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
          <option value="">— Seleccionar —</option>
          <option value="qr">QR / Tigo Money / Billetera</option>
          <option value="efectivo">Efectivo / Depósito</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:.8rem">
        <label>Referencia / Nro. de transacción</label>
        <input id="pRef" class="swal2-input" placeholder="Opcional" style="margin:0;width:100%">
      </div>
      <div class="field">
        <label>Notas</label>
        <input id="pNotas" class="swal2-input" placeholder="Ej: Pagado el martes" style="margin:0;width:100%">
      </div>
    </div>`,
    showCancelButton:true, confirmButtonText:"💸 Registrar pago", cancelButtonText:"Cancelar", ...swal$,
    preConfirm:()=>{
      const monto=parseFloat(document.getElementById("pMonto").value);
      const metodo=document.getElementById("pMetodo").value;
      if(!monto||monto<=0){Swal.showValidationMessage("Ingresa un monto válido");return false}
      if(!metodo){Swal.showValidationMessage("Selecciona el método");return false}
      return{monto,metodo,referencia:document.getElementById("pRef").value.trim(),notas:document.getElementById("pNotas").value.trim()};
    }
  });
  if (!v) return;
  loading$("Registrando pago...");
  const { error } = await supabase.from("prize_payments").insert({
    round_id:roundId, user_id:userId, lugar, monto:v.monto,
    metodo:v.metodo, referencia:v.referencia||null, notas:v.notas||null,
    estado:"enviado", registrado_por:user.id,
  });
  if (!error) {
    const { data: prof } = await supabase.from("profiles").select("total_ganado").eq("id",userId).single();
    const nuevoTotal = (prof?.total_ganado||0) + v.monto;
    await supabase.from("profiles").update({ total_ganado:nuevoTotal }).eq("id",userId);
  }
  Swal.close();
  if (error) { ok$("Error",error.message,"error"); return; }
  toast(`Premio registrado · ${fmtMoney(v.monto)} a ${username} ✅`);
  ganadores();
};

/* ════════════════════════════════════════
   ENVIAR PREMIOS
════════════════════════════════════════ */
async function enviar_premios() {
  setActive("enviar_premios");
  setCurrentView("enviar_premios");
  loadingView();

  const { data: rounds } = await supabase.from("rounds")
    .select("id,numero,sorteado_at,game_id,ganador_id,ganador2_id,ganador3_id,caso_sorteo")
    .eq("estado","sorteada").not("ganador_id","is",null).order("sorteado_at",{ascending:false});

  const roundIds = (rounds||[]).map(r=>r.id);
  const allGIds  = (rounds||[]).flatMap(r=>[r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean));
  const gameIds  = [...new Set((rounds||[]).map(r=>r.game_id).filter(Boolean))];

  const [ganadoresMap, gamesMap, { data: pagosReg }] = await Promise.all([
    getProfilesMap(allGIds),
    (async()=>{
      if (!gameIds.length) return {};
      const { data } = await supabase.from("games").select("id,nombre").in("id",gameIds);
      const m={}; (data||[]).forEach(g=>{m[g.id]=g}); return m;
    })(),
    roundIds.length
      ? supabase.from("prize_payments").select("round_id,user_id,lugar,monto").in("round_id",roundIds)
      : { data: [] }
  ]);

  const pagadosPorRonda = {};
  (pagosReg||[]).forEach(p=>{
    if (!pagadosPorRonda[p.round_id]) pagadosPorRonda[p.round_id] = new Set();
    pagadosPorRonda[p.round_id].add(p.lugar);
  });

  const pendientes = [];
  const completados = [];

  for (const r of (rounds||[])) {
    const pagados = pagadosPorRonda[r.id] || new Set();
    const lugares = [r.ganador_id?1:null, r.ganador2_id?2:null, r.ganador3_id?3:null].filter(Boolean);
    const todosPagados = lugares.every(l=>pagados.has(l));
    if (todosPagados) completados.push(r);
    else pendientes.push({ ...r, pagados, lugares });
  }

  const renderRondaRow = (r, esPendiente) => {
    const game = gamesMap[r.game_id]||{};
    const g1 = ganadoresMap[r.ganador_id]||{};
    const g2 = ganadoresMap[r.ganador2_id]||{};
    const g3 = ganadoresMap[r.ganador3_id]||{};
    const pagados = r.pagados || new Set();
    const gn = (game.nombre||"").replace(/'/g,"\\'");

    const btnGanador = (uid, username, lugar) => {
      if (!uid) return "";
      const u = (username||"").replace(/'/g,"\\'");
      const emoji = lugar===1?"🥇":lugar===2?"🥈":"🥉";
      if (pagados.has(lugar)) return `<span class="bdg bdg-ok">${emoji} ${username} ✅</span>`;
      if (!esPendiente) return `<span class="bdg bdg-ok">${emoji} ${username} ✅</span>`;
      return `<button class="btn btn-gold btn-sm" onclick="registrarPremio('${r.id}','${uid}',${lugar},'${gn}','${r.numero}','${u}')">
        <i class="bi bi-cash-coin"></i> ${emoji} ${username}
      </button>`;
    };

    return `<div style="background:var(--ink3);border:1px solid var(--border);border-radius:10px;padding:.85rem 1.1rem;margin-bottom:.65rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;flex-wrap:wrap;gap:.4rem">
        <div>
          <span style="font-family:'Oswald',sans-serif;font-weight:600;color:#fff">${game.nombre??"—"}</span>
          <span style="color:var(--muted);font-size:.82rem"> · Ronda ${r.numero}</span>
          ${r.caso_sorteo?`<span class="bdg bdg-p" style="margin-left:.4rem;font-size:.65rem">${nombreCaso(r.caso_sorteo)}</span>`:""}
        </div>
        <span style="font-size:.77rem;color:var(--muted)">${r.sorteado_at?fmtDate(r.sorteado_at):""}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem">
        ${btnGanador(r.ganador_id,g1.username,1)}
        ${btnGanador(r.ganador2_id,g2.username,2)}
        ${btnGanador(r.ganador3_id,g3.username,3)}
      </div>
    </div>`;
  };

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-cash-coin"></i>Enviar premios</div>
        <div class="ph-sub">${pendientes.length} ronda${pendientes.length!==1?"s":""} con premios pendientes</div>
      </div>
    </div>

    ${pendientes.length>0?`
    <div class="fondo-alert warn">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <div>
        <div class="fondo-alert-title">${pendientes.length} ronda${pendientes.length!==1?'s':''} con premios por enviar</div>
        <div class="fondo-alert-sub">Haz clic en cada ganador para registrar su pago.</div>
      </div>
    </div>`:""}

    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-hourglass-split"></i>Premios pendientes</div><span style="font-size:.82rem;color:var(--muted)">${pendientes.length} rondas</span></div>
      <div class="panel-body">
        ${!pendientes.length
          ?`<div class="empty"><i class="bi bi-check-circle" style="color:#22c55e"></i><p>¡Todo enviado! No hay premios pendientes.</p></div>`
          :pendientes.map(r=>renderRondaRow(r,true)).join("")}
      </div>
    </div>

    ${completados.length>0?`
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-check-circle-fill" style="color:#22c55e"></i>Premios completados</div><span style="font-size:.82rem;color:var(--muted)">${completados.length} rondas</span></div>
      <div class="panel-body">
        ${completados.map(r=>renderRondaRow(r,false)).join("")}
      </div>
    </div>`:""}`;
}

/* ════════════════════════════════════════
   USUARIOS
════════════════════════════════════════ */
async function usuarios() {
  setActive("usuarios");
  setCurrentView("usuarios");
  loadingView();
  const { data } = await supabase.from("profiles")
    .select("id,username,email,saldo,total_ganado,estado,created_at,qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at")
    .eq("rol","usuario").order("created_at",{ascending:false});

  const sinQr  = (data||[]).filter(u=>!u.qr_cobro_url).length;
  const pendQr = (data||[]).filter(u=>u.qr_cobro_url&&!u.qr_verificado).length;

  window.__usrMap = {};
  (data||[]).forEach(u=>{window.__usrMap[u.id]=u});

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-people-fill"></i>Usuarios</div>
        <div class="ph-sub">${data?.length??0} usuarios registrados</div>
      </div>
    </div>

    ${pendQr>0?`<div class="fondo-alert warn" style="cursor:pointer" onclick="document.querySelector('[data-view=qr_usuarios]').click()">
      <i class="bi bi-qr-code-scan"></i>
      <div>
        <div class="fondo-alert-title">${pendQr} QR${pendQr!==1?'s':''} pendiente${pendQr!==1?'s':''} de verificación</div>
        <div class="fondo-alert-sub">Haz clic para ir a la sección de verificación rápida.</div>
      </div>
    </div>`:""}

    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-list-ul"></i>Lista de usuarios</div>
        <span style="font-size:.82rem;color:var(--muted)">
          ${sinQr>0?`<span style="color:#f87171">${sinQr} sin QR</span> · `:""}
          ${pendQr>0?`<span style="color:#f59e0b">${pendQr} por verificar</span> · `:""}
          <span style="color:#22c55e">${(data?.length??0)-sinQr-pendQr} verificados</span>
        </span>
      </div>
      <div class="panel-body" style="overflow-x:auto">
        <table id="tblUsr" style="width:100%">
          <thead><tr><th>Usuario</th><th>Email</th><th>Saldo</th><th>Ganado</th><th>Estado</th><th>QR Cobros</th><th>Registro</th><th>Acciones</th></tr></thead>
          <tbody>${renderUsrRows(data||[])}</tbody>
        </table>
      </div>
    </div>`;
  initDT("tblUsr",{columnDefs:[{orderable:false,targets:[5,7]}]});
}

function renderUsrRows(data) {
  const metodoLabel = {tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Simple",efectivo_cuenta:"Efectivo/Cuenta"};
  return data.map(u=>{
    let qrCell = "";
    if (!u.qr_cobro_url) {
      qrCell = `<span style="color:var(--dim);font-size:.78rem"><i class="bi bi-x-circle"></i> Sin QR</span>`;
    } else if (!u.qr_verificado) {
      qrCell = `<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
        <span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Pendiente</span>
        <button class="btn btn-ghost btn-sm" onclick="verQrUsuario(window.__usrMap['${u.id}'])"><i class="bi bi-eye"></i></button>
        <button class="btn btn-success btn-sm" onclick="accionVerificarQr('${u.id}','${u.username}')"><i class="bi bi-check-lg"></i></button>
        <button class="btn btn-danger btn-sm" onclick="accionRechazarQr('${u.id}','${u.username}')"><i class="bi bi-x-lg"></i></button>
      </div>`;
    } else {
      qrCell = `<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
        <span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> Verificado</span>
        ${u.qr_metodo?`<span style="font-size:.72rem;color:var(--muted)">${metodoLabel[u.qr_metodo]||u.qr_metodo}</span>`:""}
        <button class="btn btn-ghost btn-sm" onclick="verQrUsuario(window.__usrMap['${u.id}'])"><i class="bi bi-eye"></i></button>
      </div>`;
    }
    return `<tr>
      <td><strong>${u.username}</strong></td>
      <td style="color:var(--muted)">${u.email??"—"}</td>
      <td style="font-family:'Oswald',sans-serif;color:var(--gold2)">${fmtMoney(u.saldo)}</td>
      <td style="font-family:'Oswald',sans-serif;color:#22c55e">${fmtMoney(u.total_ganado)}</td>
      <td>${badge(u.estado)}</td>
      <td>${qrCell}</td>
      <td style="color:var(--muted)">${fmtDateShort(u.created_at)}</td>
      <td><div style="display:flex;gap:.32rem">
        ${u.estado==="activo"
          ?`<button class="btn btn-danger btn-sm" onclick="toggleUser('${u.id}','suspendido','${u.username}')"><i class="bi bi-slash-circle"></i> Suspender</button>`
          :`<button class="btn btn-success btn-sm" onclick="toggleUser('${u.id}','activo','${u.username}')"><i class="bi bi-check-circle"></i> Activar</button>`}
      </div></td>
    </tr>`;
  }).join("");
}

window.verQrUsuario = (u) => {
  if (!u?.qr_cobro_url) return;
  const metodoLabel = {tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Simple",efectivo_cuenta:"Efectivo/Cuenta"};
  Swal.fire({
    title:`QR de cobros — ${u.username}`,
    html:`<img src="${u.qr_cobro_url}" style="width:100%;max-height:340px;object-fit:contain;border-radius:10px;border:1px solid rgba(212,160,23,.2);margin-bottom:1rem" onerror="this.src='https://placehold.co/300x300/131009/d4a017?text=QR+no+disponible'">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Usuario</div><div style="color:#fff">${u.username}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Método</div><div>${metodoLabel[u.qr_metodo]||u.qr_metodo||"—"}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Estado</div><div>${u.qr_verificado?'<span style="color:#22c55e">✅ Verificado</span>':'<span style="color:#f59e0b">⏳ Pendiente</span>'}</div></div>
        ${u.qr_subido_at?`<div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Subido</div><div style="color:var(--muted)">${fmtDateShort(u.qr_subido_at)}</div></div>`:""}
      </div>`,
    showConfirmButton:false, showCloseButton:true, width:480, ...swal$
  });
};

/* ════════════════════════════════════════
   QR — Funciones base (sin redirección de vista)
════════════════════════════════════════ */
async function _doVerificarQr(userId, username) {
  const r = await confirm$(`Verificar QR de ${username}`,"El QR es válido y el usuario podrá recibir premios.","✅ Verificar");
  if (!r.isConfirmed) return false;
  loading$("Verificando...");

  // Ejecutar el UPDATE y pedir los datos devueltos para confirmar que funcionó
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ qr_verificado: true })
    .eq("id", userId)
    .select("id, qr_verificado");

  Swal.close();

  if (error) {
    console.error("Error al verificar QR:", error);
    ok$("Error al verificar", `Código: ${error.code || "?"}<br>${error.message}`, "error");
    return false;
  }

  // Verificar que realmente se actualizó la fila
  if (!updated || updated.length === 0) {
    ok$(
      "No se pudo verificar",
      "El servidor no actualizó el registro. Puede ser un problema de permisos (RLS). Asegúrate de que el admin tenga política UPDATE sobre profiles.",
      "error"
    );
    return false;
  }

  if (updated[0].qr_verificado !== true) {
    ok$("Fallo silencioso", "El UPDATE se ejecutó pero qr_verificado no cambió a true.", "error");
    return false;
  }

  // Actualizar el mapa local
  if (window.__usrMap?.[userId]) window.__usrMap[userId].qr_verificado = true;
  toast(`QR de ${username} verificado ✅`);
  updateSidebarBadges();
  return true;
}

async function _doRechazarQr(userId, username) {
  const r = await confirm$(`Rechazar QR de ${username}`,"Se eliminará el QR. El usuario deberá subir uno nuevo.","❌ Rechazar QR");
  if (!r.isConfirmed) return false;
  loading$("Rechazando...");

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ qr_cobro_url: null, qr_metodo: null, qr_verificado: false, qr_subido_at: null })
    .eq("id", userId)
    .select("id, qr_cobro_url, qr_verificado");

  Swal.close();

  if (error) {
    console.error("Error al rechazar QR:", error);
    ok$("Error al rechazar", `Código: ${error.code || "?"}<br>${error.message}`, "error");
    return false;
  }

  if (!updated || updated.length === 0) {
    ok$(
      "No se pudo rechazar",
      "El servidor no actualizó el registro. Puede ser un problema de permisos (RLS).",
      "error"
    );
    return false;
  }

  if (window.__usrMap?.[userId]) {
    window.__usrMap[userId].qr_cobro_url = null;
    window.__usrMap[userId].qr_verificado = false;
    window.__usrMap[userId].qr_metodo = null;
    window.__usrMap[userId].qr_subido_at = null;
  }
  toast(`QR de ${username} rechazado — debe subir uno nuevo`, "error");
  updateSidebarBadges();
  return true;
}

/* Desde vista "usuarios" — recarga usuarios */
window.accionVerificarQr = async (userId, username) => {
  const ok = await _doVerificarQr(userId, username);
  if (ok) { await new Promise(res => setTimeout(res, 300)); usuarios(); }
};

window.accionRechazarQr = async (userId, username) => {
  const ok = await _doRechazarQr(userId, username);
  if (ok) { await new Promise(res => setTimeout(res, 300)); usuarios(); }
};

/* Desde vista "qr_usuarios" — recarga qr_usuarios */
window.verificarQrDesdeQRView = async (userId, username) => {
  const ok = await _doVerificarQr(userId, username);
  if (ok) { await new Promise(res => setTimeout(res, 300)); qr_usuarios(); }
};

window.rechazarQrDesdeQRView = async (userId, username) => {
  const ok = await _doRechazarQr(userId, username);
  if (ok) { await new Promise(res => setTimeout(res, 300)); qr_usuarios(); }
};

window.toggleUser = async (id, estado, nombre) => {
  const accion = estado==="suspendido"?"Suspender":"Activar";
  const r = await confirm$(`${accion} a ${nombre}`,"","Confirmar");
  if (!r.isConfirmed) return;
  loading$();
  await supabase.from("profiles").update({estado}).eq("id",id);
  Swal.close();
  toast(estado==="suspendido"?`${nombre} suspendido`:`${nombre} activado`, estado==="suspendido"?"error":"success");
  usuarios();
};

/* ════════════════════════════════════════
   QR PENDIENTES (sección dedicada)
════════════════════════════════════════ */
async function qr_usuarios() {
  setActive("qr_usuarios");
  setCurrentView("qr_usuarios");
  loadingView();

  const { data } = await supabase.from("profiles")
    .select("id,username,email,qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at")
    .eq("rol","usuario").not("qr_cobro_url","is",null)
    .order("qr_subido_at",{ascending:true});

  const pendientes  = (data||[]).filter(u=>!u.qr_verificado);
  const verificados = (data||[]).filter(u=>u.qr_verificado);
  const metodoLabel = {tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Simple",efectivo_cuenta:"Efectivo/Cuenta"};

  window.__usrMap = window.__usrMap || {};
  (data||[]).forEach(u=>{window.__usrMap[u.id]=u});

  const renderQrBox = (u, esPendiente) => `
    <div class="qr-user-box">
      <img class="qrb-img" src="${u.qr_cobro_url}" alt="QR ${u.username}" onclick="verQrUsuario(window.__usrMap['${u.id}'])"
        onerror="this.src='https://placehold.co/64x64/131009/d4a017?text=QR'">
      <div class="qrb-body">
        <div class="qrb-name">${u.username}</div>
        <div class="qrb-meta">
          <span>${u.email??"—"}</span>
          ${u.qr_metodo?`<span>·</span><span>${metodoLabel[u.qr_metodo]||u.qr_metodo}</span>`:""}
          ${u.qr_subido_at?`<span>·</span><span>${fmtDateShort(u.qr_subido_at)}</span>`:""}
        </div>
        ${esPendiente?`<div style="display:flex;gap:.4rem;margin-top:.6rem;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="verQrUsuario(window.__usrMap['${u.id}'])"><i class="bi bi-eye"></i> Ver ampliado</button>
          <button class="btn btn-success btn-sm" onclick="verificarQrDesdeQRView('${u.id}','${u.username}')"><i class="bi bi-check-lg"></i> Verificar</button>
          <button class="btn btn-danger btn-sm" onclick="rechazarQrDesdeQRView('${u.id}','${u.username}')"><i class="bi bi-x-lg"></i> Rechazar</button>
        </div>`:`<div style="margin-top:.4rem">${badge("aprobado")}</div>`}
      </div>
    </div>`;

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-qr-code-scan"></i>QR de cobros</div>
        <div class="ph-sub">${pendientes.length} pendiente${pendientes.length!==1?"s":""} · ${verificados.length} verificado${verificados.length!==1?"s":""}</div>
      </div>
    </div>

    ${pendientes.length>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div>
      <div class="fondo-alert-title">${pendientes.length} QR${pendientes.length!==1?'s':''} esperando verificación</div>
      <div class="fondo-alert-sub">Revisa la imagen del QR antes de verificar.</div>
    </div></div>`:""}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="bi bi-hourglass-split"></i>Pendientes</div><span style="font-size:.82rem;color:var(--muted)">${pendientes.length}</span></div>
        <div class="panel-body">
          ${!pendientes.length
            ?`<div class="empty"><i class="bi bi-check-circle" style="color:#22c55e"></i><p>¡Todo verificado!</p></div>`
            :pendientes.map(u=>renderQrBox(u,true)).join("")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="bi bi-check-circle-fill" style="color:#22c55e"></i>Verificados</div><span style="font-size:.82rem;color:var(--muted)">${verificados.length}</span></div>
        <div class="panel-body">
          ${!verificados.length
            ?`<div class="empty"><i class="bi bi-qr-code"></i><p>Ninguno verificado aún</p></div>`
            :verificados.map(u=>renderQrBox(u,false)).join("")}
        </div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   REFERIDOS
════════════════════════════════════════ */
async function referidos() {
  setActive("referidos");
  setCurrentView("referidos");
  loadingView();

  const { data } = await supabase.from("referidos")
    .select("id,estado,boleto_otorgado,boletos_pagados,creado_at,referidor_id,referido_id")
    .order("creado_at",{ascending:false});

  const allIds = (data||[]).flatMap(r=>[r.referidor_id,r.referido_id].filter(Boolean));
  const profMap = await getProfilesMap(allIds);

  const total = (data||[]).length;
  const completados = (data||[]).filter(r=>r.estado==="completado").length;
  const boletosOtorgados = (data||[]).filter(r=>r.boleto_otorgado).length;

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-share-fill"></i>Referidos</div>
        <div class="ph-sub">${total} referido${total!==1?"s":""} registrados · ${completados} completados</div>
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:1.3rem">
      <div class="sc"><div class="sc-bar g"></div><div class="sc-icon">🔗</div><div class="sc-val">${total}</div><div class="sc-lbl">Total referidos</div></div>
      <div class="sc"><div class="sc-bar gr"></div><div class="sc-icon">✅</div><div class="sc-val green">${completados}</div><div class="sc-lbl">Completados</div></div>
      <div class="sc"><div class="sc-bar b"></div><div class="sc-icon">🎟️</div><div class="sc-val blue">${boletosOtorgados}</div><div class="sc-lbl">Boletos otorgados</div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-list-ul"></i>Historial de referidos</div></div>
      <div class="panel-body" style="overflow-x:auto">
        ${!data?.length
          ?`<div class="empty"><i class="bi bi-share"></i><p>No hay referidos aún.</p></div>`
          :`<table id="tblRef" style="width:100%">
              <thead><tr><th>Referidor</th><th>Referido</th><th>Estado</th><th>Boleto otorgado</th><th>Boletos pagados</th><th>Fecha</th></tr></thead>
              <tbody>${data.map(r=>{
                const ref1 = profMap[r.referidor_id]||{};
                const ref2 = profMap[r.referido_id]||{};
                return `<tr>
                  <td><strong>${ref1.username??"—"}</strong></td>
                  <td>${ref2.username??"—"}</td>
                  <td>${badge(r.estado)}</td>
                  <td>${r.boleto_otorgado?'<span class="bdg bdg-ok">✅ Sí</span>':'<span class="bdg bdg-closed">No</span>'}</td>
                  <td style="font-family:'Oswald',sans-serif;color:var(--gold2)">${r.boletos_pagados||0}</td>
                  <td style="color:var(--muted)">${fmtDateShort(r.creado_at)}</td>
                </tr>`;
              }).join("")}</tbody>
            </table>`}
      </div>
    </div>`;
  if (data?.length) initDT("tblRef",{order:[[5,"desc"]]});
}

/* ════════════════════════════════════════
   BOLETOS GRATIS
════════════════════════════════════════ */
async function boletos_gratis() {
  setActive("boletos_gratis");
  setCurrentView("boletos_gratis");
  loadingView();

  const { data } = await supabase.from("boletos_gratis")
    .select("id,user_id,origen,usado,usado_at,created_at,usado_en_round")
    .order("created_at",{ascending:false});

  const allIds = (data||[]).map(b=>b.user_id).filter(Boolean);
  const profMap = await getProfilesMap(allIds);

  const total   = (data||[]).length;
  const usados  = (data||[]).filter(b=>b.usado).length;
  const libres  = total - usados;

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-gift-fill"></i>Boletos gratis</div>
        <div class="ph-sub">${total} boleto${total!==1?"s":""} generados · ${libres} disponibles</div>
      </div>
      <button class="btn btn-gold btn-md" onclick="asignarBoletoGratis()"><i class="bi bi-plus-lg"></i> Asignar boleto</button>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:1.3rem">
      <div class="sc"><div class="sc-bar g"></div><div class="sc-icon">🎟️</div><div class="sc-val">${total}</div><div class="sc-lbl">Total generados</div></div>
      <div class="sc"><div class="sc-bar gr"></div><div class="sc-icon">✅</div><div class="sc-val green">${libres}</div><div class="sc-lbl">Disponibles</div></div>
      <div class="sc"><div class="sc-bar r"></div><div class="sc-icon">🔒</div><div class="sc-val red">${usados}</div><div class="sc-lbl">Usados</div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-list-ul"></i>Historial</div></div>
      <div class="panel-body" style="overflow-x:auto">
        ${!data?.length
          ?`<div class="empty"><i class="bi bi-gift"></i><p>No hay boletos gratis registrados.</p></div>`
          :`<table id="tblBG" style="width:100%">
              <thead><tr><th>Usuario</th><th>Email</th><th>Origen</th><th>Estado</th><th>Usado en</th><th>Creado</th></tr></thead>
              <tbody>${data.map(b=>{
                const prof = profMap[b.user_id]||{};
                return `<tr>
                  <td><strong>${prof.username??"—"}</strong></td>
                  <td style="color:var(--muted)">${prof.email??"—"}</td>
                  <td style="font-size:.82rem;color:var(--muted)">${b.origen||"—"}</td>
                  <td>${b.usado?badge("rechazado"):'<span class="bdg bdg-free">🎁 Disponible</span>'}</td>
                  <td style="color:var(--muted);font-size:.82rem">${b.usado_at?fmtDateShort(b.usado_at):"—"}</td>
                  <td style="color:var(--muted)">${fmtDateShort(b.created_at)}</td>
                </tr>`;
              }).join("")}</tbody>
            </table>`}
      </div>
    </div>`;
  if (data?.length) initDT("tblBG",{order:[[5,"desc"]]});
}

window.asignarBoletoGratis = async () => {
  const { data: usrs } = await supabase.from("profiles").select("id,username,email").eq("rol","usuario").eq("estado","activo").order("username");
  if (!usrs?.length) { ok$("Sin usuarios","No hay usuarios activos.","warning"); return; }

  const opts = usrs.map(u=>`<option value="${u.id}">${u.username} — ${u.email||""}</option>`).join("");
  const { value: v } = await Swal.fire({
    title:"Asignar boleto gratis",
    html:`<div style="text-align:left">
      <div class="field" style="margin-bottom:.85rem">
        <label>Usuario *</label>
        <select id="bgUser" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
          <option value="">— Seleccionar —</option>${opts}
        </select>
      </div>
      <div class="field">
        <label>Origen / Motivo</label>
        <input id="bgOrigen" class="swal2-input" placeholder="ej. Promoción de lanzamiento, referido" style="margin:0;width:100%">
      </div>
    </div>`,
    showCancelButton:true, confirmButtonText:"🎁 Asignar", cancelButtonText:"Cancelar", ...swal$,
    preConfirm:()=>{
      const uid=document.getElementById("bgUser").value;
      if(!uid){Swal.showValidationMessage("Selecciona un usuario");return false}
      return{user_id:uid,origen:document.getElementById("bgOrigen").value.trim()||"manual admin"};
    }
  });
  if (!v) return;
  loading$("Asignando boleto gratis...");
  const { error } = await supabase.from("boletos_gratis").insert({ user_id:v.user_id, origen:v.origen, usado:false });
  Swal.close();
  if (error) { ok$("Error",error.message,"error"); return; }
  toast("Boleto gratis asignado 🎁");
  boletos_gratis();
};

/* ════════════════════════════════════════
   TRABAJADORES
════════════════════════════════════════ */
async function trabajadores() {
  setActive("trabajadores");
  setCurrentView("trabajadores");
  loadingView();
  const { data } = await supabase.from("profiles")
    .select("id,username,email,estado,created_at").eq("rol","trabajador").order("created_at",{ascending:false});

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-person-badge-fill"></i>Trabajadores</div>
        <div class="ph-sub">${data?.length??0} trabajador${data?.length!==1?"es":""}</div>
      </div>
      <button class="btn btn-red btn-md" onclick="modalNuevoTrabajador()"><i class="bi bi-person-plus-fill"></i> Nuevo trabajador</button>
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-list-ul"></i>Lista de trabajadores</div></div>
      <div class="panel-body" style="overflow-x:auto">
        ${!data?.length
          ?`<div class="empty"><i class="bi bi-person-badge"></i><p>Sin trabajadores. Crea el primero.</p></div>`
          :`<table id="tblTrab" style="width:100%">
              <thead><tr><th>Usuario</th><th>Email</th><th>Estado</th><th>Alta</th><th>Acciones</th></tr></thead>
              <tbody>${data.map(t=>`<tr>
                <td><strong>${t.username}</strong></td>
                <td style="color:var(--muted)">${t.email??"—"}</td>
                <td>${badge(t.estado)}</td>
                <td style="color:var(--muted)">${fmtDateShort(t.created_at)}</td>
                <td><div style="display:flex;gap:.32rem;flex-wrap:wrap">
                  ${t.estado==="activo"
                    ?`<button class="btn btn-danger btn-sm" onclick="toggleTrab('${t.id}','suspendido','${t.username}')"><i class="bi bi-slash-circle"></i> Suspender</button>`
                    :`<button class="btn btn-success btn-sm" onclick="toggleTrab('${t.id}','activo','${t.username}')"><i class="bi bi-check-circle"></i> Activar</button>`}
                  <button class="btn btn-danger btn-sm" onclick="deleteTrab('${t.id}','${t.username}')"><i class="bi bi-trash"></i></button>
                </div></td>
              </tr>`).join("")}</tbody>
            </table>`}
      </div>
    </div>`;
  if (data?.length) initDT("tblTrab",{columnDefs:[{orderable:false,targets:4}]});
}

window.modalNuevoTrabajador = async () => {
  const { value: v } = await Swal.fire({
    title:"Nuevo Trabajador",
    html:`<div style="text-align:left">
      <div class="field" style="margin-bottom:.85rem"><label>Usuario *</label><input id="tU" class="swal2-input" placeholder="nombre_usuario" style="margin:0;width:100%"></div>
      <div class="field" style="margin-bottom:.85rem"><label>Email *</label><input id="tE" class="swal2-input" type="email" placeholder="correo@ejemplo.com" style="margin:0;width:100%"></div>
      <div class="field"><label>Contraseña * (mín. 6 caracteres)</label><input id="tP" class="swal2-input" type="password" placeholder="••••••••" style="margin:0;width:100%"></div>
    </div>`,
    showCancelButton:true, confirmButtonText:"Crear trabajador", cancelButtonText:"Cancelar", ...swal$,
    preConfirm:()=>{
      const u=document.getElementById("tU").value.trim(), e=document.getElementById("tE").value.trim(), p=document.getElementById("tP").value;
      if(!u||!e||!p){Swal.showValidationMessage("Todos los campos son obligatorios");return false}
      if(p.length<6){Swal.showValidationMessage("Mínimo 6 caracteres");return false}
      return{username:u,email:e,password:p};
    }
  });
  if (!v) return;
  loading$("Creando trabajador...");
  const { data: authData, error: authErr } = await supabase.auth.signUp({ email:v.email, password:v.password });
  if (authErr || !authData?.user) { Swal.close(); ok$("Error auth",authErr?.message||"No se pudo crear el usuario","error"); return; }
  const { error: pe } = await supabase.from("profiles").insert({ id:authData.user.id, username:v.username, email:v.email, rol:"trabajador", estado:"activo" });
  Swal.close();
  if (pe) { ok$("Error de perfil",pe.message,"error"); return; }
  await ok$("¡Trabajador creado!",`${v.username} puede iniciar sesión.`);
  trabajadores();
};

window.toggleTrab = async (id, estado, nombre) => {
  const accion = estado==="suspendido"?"Suspender":"Activar";
  const r = await confirm$(`${accion} a ${nombre}`,"","Confirmar");
  if (!r.isConfirmed) return;
  loading$();
  await supabase.from("profiles").update({estado}).eq("id",id);
  Swal.close();
  toast(estado==="suspendido"?`${nombre} suspendido`:`${nombre} activado`, estado==="suspendido"?"error":"success");
  trabajadores();
};

window.deleteTrab = async (id, nombre) => {
  const r = await confirm$(`Eliminar a ${nombre}`,"Esta acción <strong>no se puede deshacer</strong>.","Eliminar");
  if (!r.isConfirmed) return;
  loading$("Eliminando...");
  await supabase.from("profiles").delete().eq("id",id);
  Swal.close();
  toast("Trabajador eliminado","info");
  trabajadores();
};

/* ════════════════════════════════════════
   PREMIOS
════════════════════════════════════════ */
async function premios() {
  setActive("premios");
  setCurrentView("premios");
  loadingView();
  const { data } = await supabase.from("prizes").select("*").order("created_at",{ascending:false});

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-award-fill"></i>Premios</div>
        <div class="ph-sub">${data?.length??0} premio${data?.length!==1?"s":""}</div>
      </div>
      <button class="btn btn-red btn-md" onclick="modalNuevoPremio()"><i class="bi bi-plus-lg"></i> Nuevo premio</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1rem">
      ${!data?.length
        ?`<div class="panel" style="grid-column:1/-1"><div class="panel-body"><div class="empty"><i class="bi bi-award"></i><p>Sin premios aún</p></div></div></div>`
        :data.map(p=>`
          <div class="panel" style="overflow:hidden">
            ${p.imagen_url
              ?`<img src="${p.imagen_url}" alt="${p.nombre}" style="width:100%;height:160px;object-fit:cover;border-bottom:1px solid var(--border)">`
              :`<div style="height:100px;background:rgba(139,26,26,.08);display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--border)"><i class="bi bi-image" style="font-size:2rem;color:var(--dim)"></i></div>`}
            <div class="panel-body">
              <div style="font-family:'Oswald',sans-serif;font-size:.98rem;font-weight:600;color:#fff;margin-bottom:.22rem">${p.nombre}</div>
              <div style="font-size:.8rem;color:var(--muted);margin-bottom:.8rem">${p.descripcion||"Sin descripción"}</div>
              <div style="display:flex;align-items:center;justify-content:space-between">
                ${badge(p.estado)}
                <button class="btn btn-danger btn-sm" onclick="deletePremio('${p.id}','${p.nombre}')"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>`).join("")}
    </div>`;
}

window.modalNuevoPremio = async () => {
  const { value: v } = await Swal.fire({
    title:"Nuevo Premio",
    html:`<div style="text-align:left">
      <div class="field" style="margin-bottom:.85rem"><label>Nombre *</label><input id="pN" class="swal2-input" placeholder="ej. iPhone 15 Pro" style="margin:0;width:100%"></div>
      <div class="field" style="margin-bottom:.85rem"><label>Descripción</label><input id="pD" class="swal2-input" placeholder="Opcional" style="margin:0;width:100%"></div>
      <div class="field">
        <label>Imagen</label>
        <input type="file" id="pF" accept="image/*" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem">
        <img id="pPrev" style="display:none;width:100%;max-height:140px;object-fit:contain;margin-top:.55rem;border-radius:8px;border:1px solid var(--border)">
      </div>
    </div>`,
    showCancelButton:true, confirmButtonText:"Guardar", cancelButtonText:"Cancelar", width:500, ...swal$,
    didOpen:()=>{
      document.getElementById("pF").addEventListener("change",e=>{
        const f=e.target.files[0];
        if(f){const r=new FileReader();r.onload=ev=>{const i=document.getElementById("pPrev");i.src=ev.target.result;i.style.display="block"};r.readAsDataURL(f)}
      });
    },
    preConfirm:()=>{
      const n=document.getElementById("pN").value.trim();
      if(!n){Swal.showValidationMessage("El nombre es obligatorio");return false}
      return{nombre:n,descripcion:document.getElementById("pD").value.trim(),file:document.getElementById("pF").files[0]};
    }
  });
  if (!v) return;
  loading$("Guardando...");
  let imagen_url = null;
  if (v.file) {
    try { imagen_url = await uploadFile(v.file,"el-padrino/premios"); }
    catch(e) { Swal.close(); ok$("Error al subir imagen","","error"); return; }
  }
  const { error } = await supabase.from("prizes").insert({ nombre:v.nombre, descripcion:v.descripcion, imagen_url, estado:"activo" });
  Swal.close();
  if (error) { ok$("Error",error.message,"error"); return; }
  toast("Premio guardado");
  premios();
};

window.deletePremio = async (id, nombre) => {
  const r = await confirm$(`Eliminar "${nombre}"`,"No se puede deshacer.","Eliminar");
  if (!r.isConfirmed) return;
  loading$();
  await supabase.from("prizes").delete().eq("id",id);
  Swal.close();
  toast("Premio eliminado","info");
  premios();
};

/* ════════════════════════════════════════
   ARRANQUE
════════════════════════════════════════ */
initRealtime();
dashboard();