import { supabase } from "./supabase.js";
import { realizarSorteo as calcSorteo, nombreCaso } from "./logica_juego.js";

/* ════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════ */
const MC  = () => document.getElementById("mainContent");
const $   = id => document.getElementById(id);

const swal$ = {
  background: '#131009', color: '#e6dcc8',
  confirmButtonColor: '#8b1a1a', cancelButtonColor: '#221c14',
};

const toast = (title, icon = "success") => Swal.fire({
  title, icon, toast: true, position: "top-end",
  showConfirmButton: false, timer: 2800, timerProgressBar: true,
  background: '#1b1610', color: '#e6dcc8',
  iconColor: icon === "success" ? "#4ade80" : icon === "error" ? "#f87171" : "#d4a017"
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
  try {
    return new Date(d).toLocaleDateString("es-BO", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return "—"; }
}
function fmtDateShort(d) {
  try {
    return new Date(d).toLocaleDateString("es-BO", {
      day: "2-digit", month: "short", year: "numeric"
    });
  } catch { return "—"; }
}
function fmtMoney(n) { return `Bs ${Number(n || 0).toFixed(2)}`; }

function badge(est) {
  const map = {
    pendiente:   ["bdg bdg-p",      "⏳ Pendiente"],
    aprobado:    ["bdg bdg-ok",     "✅ Aprobado"],
    rechazado:   ["bdg bdg-bad",    "❌ Rechazado"],
    activo:      ["bdg bdg-ok",     "Activo"],
    inactivo:    ["bdg bdg-closed", "Inactivo"],
    suspendido:  ["bdg bdg-bad",    "Suspendido"],
    abierta:     ["bdg bdg-open",   "Abierta"],
    cerrada:     ["bdg bdg-closed", "Cerrada"],
    sorteada:    ["bdg bdg-win",    "Sorteada ✓"],
    ganada:      ["bdg bdg-win",    "🏆 Ganador"],
    perdida:     ["bdg bdg-bad",    "Perdida"],
  };
  const [cls, label] = map[est] || ["bdg bdg-p", est];
  return `<span class="${cls}">${label}</span>`;
}

/** Badge especial para método de pago — resalta boletos gratis */
function badgeMetodo(metodo) {
  if (metodo === "gratis") {
    return `<span class="bdg bdg-gratis"><i class="bi bi-gift-fill"></i> Gratis</span>`;
  }
  return `<span style="font-size:.82rem;color:var(--muted)">${metodo ?? "—"}</span>`;
}

function initDT(id, opts = {}) {
  setTimeout(() => {
    try {
      if (window.jQuery && window.jQuery.fn.DataTable) {
        if (window.jQuery.fn.DataTable.isDataTable(`#${id}`)) {
          window.jQuery(`#${id}`).DataTable().destroy();
        }
        window.jQuery(`#${id}`).DataTable({
          language: {
            search: "Buscar:", lengthMenu: "Mostrar _MENU_",
            info: "_START_–_END_ de _TOTAL_",
            paginate: { previous: "‹", next: "›" },
            zeroRecords: "Sin resultados", emptyTable: "Sin datos"
          },
          pageLength: 10, ...opts
        });
      }
    } catch(e) { console.warn("DataTable init error:", e); }
  }, 80);
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
  return `<button class="btn btn-ghost btn-md" onclick="window.__back()">
    <i class="bi bi-arrow-left"></i> ${label}
  </button>`;
}

/* ════════════════════════════════════════════
   AUTH
════════════════════════════════════════════ */
let currentUser = null;

try {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    window.location.href = "../../auth/login.html";
    throw new Error("no-user");
  }
  currentUser = user;
} catch(e) {
  if (e.message !== "no-user") {
    console.error("Auth error:", e);
    window.location.href = "../../auth/login.html";
  }
  throw 0;
}

const { data: me, error: meErr } = await supabase
  .from("profiles")
  .select("username, rol, estado")
  .eq("id", currentUser.id)
  .single();

if (meErr || !me || me.estado !== "activo" || me.rol !== "trabajador") {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html";
  throw 0;
}

const ini = (me.username || "?")[0].toUpperCase();
["tbAvatar", "sbAvatar"].forEach(id => { if ($(id)) $(id).textContent = ini; });
["tbName",   "sbName"  ].forEach(id => { if ($(id)) $(id).textContent = me.username; });

/* ════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════ */
async function doLogout() {
  const r = await confirm$("¿Cerrar sesión?", "Regresarás al inicio.", "Sí, salir");
  if (r.isConfirmed) {
    await supabase.auth.signOut();
    window.location.href = "../../auth/login.html";
  }
}
if ($("logoutBtn"))  $("logoutBtn").addEventListener("click",  doLogout);
if ($("logoutBtn2")) $("logoutBtn2").addEventListener("click", doLogout);

/* ════════════════════════════════════════════
   SIDEBAR STATS
════════════════════════════════════════════ */
async function loadSidebarStats() {
  try {
    const [
      { count: pend },
      { count: rondas },
      { count: aprobados },
      { count: gans },
      { count: boletosGratis }
    ] = await Promise.all([
      supabase.from("payments").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
      supabase.from("rounds").select("*", { count: "exact", head: true }).eq("estado", "abierta"),
      supabase.from("payments").select("*", { count: "exact", head: true })
        .eq("estado", "aprobado").eq("revisado_por", currentUser.id),
      supabase.from("rounds").select("*", { count: "exact", head: true }).eq("estado", "sorteada"),
      supabase.from("boletos_gratis").select("*", { count: "exact", head: true }).eq("usado", false),
    ]);

    if ($("sbPend"))         $("sbPend").textContent         = pend         ?? 0;
    if ($("sbRondas"))       $("sbRondas").textContent       = rondas       ?? 0;
    if ($("sbAprobados"))    $("sbAprobados").textContent    = aprobados    ?? 0;
    if ($("sbGanadores"))    $("sbGanadores").textContent    = gans         ?? 0;
    if ($("sbBoletosGratis"))$("sbBoletosGratis").textContent= boletosGratis?? 0;

    const navBadge = $("navBadgePend");
    if (navBadge) {
      navBadge.textContent   = pend ?? 0;
      navBadge.style.display = (pend ?? 0) > 0 ? "inline-flex" : "none";
    }

    // Badge de boletos gratis disponibles en el nav
    const navBadgeGratis = $("navBadgeGratis");
    if (navBadgeGratis) {
      navBadgeGratis.textContent   = boletosGratis ?? 0;
      navBadgeGratis.style.display = (boletosGratis ?? 0) > 0 ? "inline-flex" : "none";
    }
  } catch(e) {
    console.warn("loadSidebarStats error:", e);
  }
}

/* ════════════════════════════════════════════
   ROUTER
════════════════════════════════════════════ */
window.__setView = function(view) {
  setActive(view);
  window.__back = null;
  const map = {
    dashboard,
    sorteos,
    comprobantes: comprobantesGlobal,
    ganadores,
    historial,
    fidelidad: boletosGratisView,
  };
  if (map[view]) map[view]();
};

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (window.innerWidth < 769) {
      const sb = $("sidebar"), ov = $("sidebarOverlay");
      if (sb) sb.classList.remove("open");
      if (ov) ov.classList.remove("open");
    }
    window.__setView(btn.dataset.view);
  });
});

/* ════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════ */
async function dashboard() {
  setActive("dashboard");
  loadingView();

  try {
    const [
      { count: totalPend },
      { count: rondasAbiertas },
      { count: aprobadosPorMi },
      { count: rechazadosPorMi },
      { data: recientes },
      { data: rondasData },
      { count: gratisDisponibles }
    ] = await Promise.all([
      supabase.from("payments").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
      supabase.from("rounds").select("*", { count: "exact", head: true }).eq("estado", "abierta"),
      supabase.from("payments").select("*", { count: "exact", head: true })
        .eq("estado", "aprobado").eq("revisado_por", currentUser.id),
      supabase.from("payments").select("*", { count: "exact", head: true })
        .eq("estado", "rechazado").eq("revisado_por", currentUser.id),
      supabase.from("payments")
        .select("id,monto,metodo,estado,created_at,boletos_solicitados,profiles!payments_user_id_fkey(username),rounds(id,numero,games(nombre))")
        .eq("estado", "pendiente")
        .order("created_at", { ascending: true })
        .limit(8),
      supabase.from("rounds")
        .select("id,numero,estado,created_at,games(nombre)")
        .eq("estado", "abierta")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("boletos_gratis").select("*", { count: "exact", head: true }).eq("usado", false),
    ]);

    const rondasConCupos = await Promise.all((rondasData || []).map(async r => {
      const { data: bRows } = await supabase
        .from("participations").select("boletos").eq("round_id", r.id);
      const cupos = (bRows || []).reduce((s, x) => s + (x.boletos || 1), 0);
      return { ...r, cupos };
    }));

    // Separar pagos gratis de pagos normales para alertas diferenciadas
    const pagosGratis  = (recientes || []).filter(p => p.metodo === "gratis");
    const pagosNormal  = (recientes || []).filter(p => p.metodo !== "gratis");

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-speedometer2"></i>Dashboard</div>
          <div class="ph-sub">${new Date().toLocaleDateString("es-BO",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="sc"><div class="sc-bar r"></div><div class="sc-icon">⏳</div>
          <div class="sc-val">${totalPend ?? 0}</div><div class="sc-lbl">Pagos pendientes</div></div>
        <div class="sc"><div class="sc-bar g"></div><div class="sc-icon">🎟️</div>
          <div class="sc-val">${rondasAbiertas ?? 0}</div><div class="sc-lbl">Rondas abiertas</div></div>
        <div class="sc"><div class="sc-bar gr"></div><div class="sc-icon">✅</div>
          <div class="sc-val">${aprobadosPorMi ?? 0}</div><div class="sc-lbl">Aprobé</div></div>
        <div class="sc"><div class="sc-bar b"></div><div class="sc-icon">🎁</div>
          <div class="sc-val">${gratisDisponibles ?? 0}</div><div class="sc-lbl">Boletos gratis</div></div>
      </div>

      ${(totalPend ?? 0) > 0 ? `
      <div class="alert-pend">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>Hay <strong style="color:var(--gold2)">${totalPend}</strong>
          comprobante${totalPend !== 1 ? "s" : ""} pendiente${totalPend !== 1 ? "s" : ""} esperando revisión.</span>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto"
          onclick="window.__setView('comprobantes')">
          Revisar ahora <i class="bi bi-arrow-right"></i>
        </button>
      </div>` : `
      <div style="background:rgba(58,138,58,.07);border:1px solid rgba(58,138,58,.2);border-radius:10px;padding:.75rem 1rem;margin-bottom:1.1rem;font-size:.88rem;color:#4ade80;display:flex;align-items:center;gap:.5rem">
        <i class="bi bi-check-circle-fill"></i> ¡Todo al día! Sin comprobantes pendientes.
      </div>`}

      ${pagosGratis.length > 0 ? `
      <div style="background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.25);border-radius:10px;padding:.75rem 1rem;margin-bottom:1.1rem;font-size:.88rem;color:#c4b5fd;display:flex;align-items:center;gap:.7rem;flex-wrap:wrap">
        <i class="bi bi-gift-fill" style="font-size:1.1rem;flex-shrink:0"></i>
        <span><strong style="color:#c4b5fd">${pagosGratis.length}</strong> inscripción${pagosGratis.length !== 1 ? "es" : ""} con boleto gratis pendiente${pagosGratis.length !== 1 ? "s" : ""} de confirmar.</span>
        <button class="btn btn-sm" style="margin-left:auto;background:rgba(139,92,246,.18);color:#c4b5fd;border:1px solid rgba(139,92,246,.3)"
          onclick="window.__setView('comprobantes')">
          Revisar <i class="bi bi-arrow-right"></i>
        </button>
      </div>` : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.1rem" id="dashGrid">
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title"><i class="bi bi-hourglass-split"></i>Comprobantes urgentes</div>
            <button class="btn btn-ghost btn-sm" onclick="window.__setView('comprobantes')">Ver todos →</button>
          </div>
          <div class="panel-body">
            ${!(recientes?.length)
              ? `<div class="empty"><i class="bi bi-inbox"></i><p>Sin pendientes. ¡Todo al día!</p></div>`
              : recientes.map(p => `
                <div class="act-row">
                  <div class="act-left">
                    <div class="act-av">${(p.profiles?.username || "?")[0].toUpperCase()}</div>
                    <div>
                      <div class="act-name">
                        ${p.profiles?.username ?? "—"}
                        ${p.metodo === "gratis" ? `<span class="bdg bdg-gratis" style="margin-left:.3rem;font-size:.62rem"><i class="bi bi-gift-fill"></i> Gratis</span>` : ""}
                      </div>
                      <div class="act-date">${p.rounds?.games?.nombre ?? "Sorteo"} · R${p.rounds?.numero ?? "?"} · ${p.boletos_solicitados || 1} boleto${(p.boletos_solicitados || 1) !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.2rem">
                    <span class="act-amount">${p.metodo === "gratis" ? '<span style="color:#c4b5fd;font-size:.82rem">🎁 Gratis</span>' : fmtMoney(p.monto)}</span>
                    <button class="btn btn-success btn-sm" onclick="window.__aprobarDesdeCard('${p.id}')">
                      <i class="bi bi-check-lg"></i> Aprobar
                    </button>
                  </div>
                </div>`).join("")}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div class="panel-title"><i class="bi bi-ticket-perforated-fill"></i>Rondas activas</div>
            <button class="btn btn-ghost btn-sm" onclick="window.__setView('sorteos')">Ver sorteos →</button>
          </div>
          <div class="panel-body">
            ${!rondasConCupos.length
              ? `<div class="empty"><i class="bi bi-ticket-perforated"></i><p>Sin rondas abiertas</p></div>`
              : rondasConCupos.map(r => {
                  const pct = Math.round((r.cupos / 25) * 100);
                  return `
                  <div style="margin-bottom:.9rem">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.3rem">
                      <span style="font-size:.88rem;font-weight:600">${r.games?.nombre ?? "—"} <span style="color:var(--muted)">R${r.numero}</span></span>
                      <span style="font-family:'Oswald',sans-serif;font-size:.82rem;color:var(--gold2)">${r.cupos}/25${r.cupos>=25?" ✅":""}</span>
                    </div>
                    <div class="prog-bg"><div class="prog-fill${r.cupos>=25?" full":pct>=80?" almost":""}" style="width:${pct}%"></div></div>
                  </div>`
                }).join("")}
          </div>
        </div>
      </div>`;

    if (window.innerWidth < 700) {
      const dg = document.getElementById("dashGrid");
      if (dg) dg.style.gridTemplateColumns = "1fr";
    }

  } catch(e) {
    console.error("Dashboard error:", e);
    MC().innerHTML = `
      <div class="ph"><div class="ph-left">
        <div class="ph-title"><i class="bi bi-speedometer2"></i>Dashboard</div>
      </div></div>
      <div class="panel"><div class="panel-body">
        <div class="empty">
          <i class="bi bi-exclamation-triangle"></i>
          <p>Error al cargar el dashboard.<br>
          <button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="dashboard()">
            <i class="bi bi-arrow-clockwise"></i> Reintentar
          </button></p>
        </div>
      </div></div>`;
  }
}

/* Aprobar desde dashboard card */
window.__aprobarDesdeCard = async (payId) => {
  const r = await confirm$("Aprobar pago", "¿El comprobante es válido?", "✅ Aprobar");
  if (!r.isConfirmed) return;
  loading$("Aprobando...");

  try {
    const { data: pago, error } = await supabase.from("payments")
      .select("user_id, boletos_solicitados, round_id, metodo").eq("id", payId).single();
    if (error || !pago) throw error || new Error("Pago no encontrado");

    const boletos = pago.boletos_solicitados || 1;

    // Si el pago es con boleto gratis, consumirlo
    if (pago.metodo === "gratis") {
      await consumirBoletoGratis(pago.user_id, pago.round_id);
    }

    await supabase.from("payments")
      .update({ estado: "aprobado", revisado_por: currentUser.id }).eq("id", payId);

    const { data: partExist } = await supabase.from("participations")
      .select("id,boletos")
      .eq("round_id", pago.round_id)
      .eq("user_id", pago.user_id)
      .maybeSingle();

    if (partExist) {
      await supabase.from("participations")
        .update({ boletos: (partExist.boletos || 1) + boletos }).eq("id", partExist.id);
    } else {
      await supabase.from("participations").insert({
        round_id: pago.round_id, user_id: pago.user_id, boletos,
        resultado: "pendiente",
        es_gratis: pago.metodo === "gratis"
      });
    }
    Swal.close();
    toast(`Aprobado · ${boletos} boleto${boletos !== 1 ? "s" : ""}${pago.metodo === "gratis" ? " 🎁" : ""}`);
    await Promise.all([loadSidebarStats(), dashboard()]);
  } catch(e) {
    Swal.close();
    ok$("Error", e.message || "No se pudo aprobar", "error");
  }
};

/* ════════════════════════════════════════════
   HELPER: consumir boleto gratis
   Marca como usado el boleto gratis más antiguo disponible del usuario
════════════════════════════════════════════ */
async function consumirBoletoGratis(userId, roundId) {
  const { data: boleto } = await supabase
    .from("boletos_gratis")
    .select("id")
    .eq("user_id", userId)
    .eq("usado", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!boleto) return; // No hay boleto gratis disponible, continuar igual

  await supabase.from("boletos_gratis").update({
    usado: true,
    usado_en_round: roundId,
    usado_at: new Date().toISOString()
  }).eq("id", boleto.id);
}

/* ════════════════════════════════════════════
   SORTEOS
════════════════════════════════════════════ */
async function sorteos() {
  setActive("sorteos");
  loadingView();

  try {
    const { data: games, error: gErr } = await supabase
      .from("games")
      .select("*")
      .eq("estado", "activo")
      .order("created_at", { ascending: false });

    if (gErr) throw gErr;

    const gamesData = await Promise.all((games || []).map(async g => {
      const { data: roundsData } = await supabase
        .from("rounds")
        .select("id,numero,estado")
        .eq("game_id", g.id)
        .order("numero", { ascending: false });

      const activeRound = roundsData?.find(r => r.estado === "abierta");
      const totalRondas = roundsData?.length ?? 0;
      let cupos = 0, compPend = 0, gratisEnRonda = 0;

      if (activeRound) {
        const [{ data: bRows }, { count: cp }, { count: gr }] = await Promise.all([
          supabase.from("participations").select("boletos").eq("round_id", activeRound.id),
          supabase.from("payments").select("*", { count: "exact", head: true })
            .eq("round_id", activeRound.id).eq("estado", "pendiente"),
          supabase.from("participations").select("*", { count: "exact", head: true })
            .eq("round_id", activeRound.id).eq("es_gratis", true),
        ]);
        cupos        = (bRows || []).reduce((s, x) => s + (x.boletos || 1), 0);
        compPend     = cp ?? 0;
        gratisEnRonda= gr ?? 0;
      }
      return { ...g, activeRound, totalRondas, cupos, compPend, gratisEnRonda };
    }));

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-ticket-perforated-fill"></i>Sorteos</div>
          <div class="ph-sub">Rondas activas · Revisa comprobantes y realiza sorteos</div>
        </div>
      </div>
      ${!gamesData.length
        ? `<div class="panel"><div class="panel-body">
             <div class="empty"><i class="bi bi-ticket-perforated"></i><p>No hay sorteos activos</p></div>
           </div></div>`
        : `<div class="sorteo-grid">
            ${gamesData.map(g => {
              const ar  = g.activeRound;
              const pct = ar ? Math.round((g.cupos / 25) * 100) : 0;
              const lleno = ar && g.cupos >= 25;
              const gNom  = (g.nombre || "").replace(/'/g, "\\'");
              return `
              <div class="sorteo-card">
                <div class="sorteo-card-head">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
                    <div>
                      <h3>${g.nombre}</h3>
                      <p>${g.descripcion || "Sin descripción"}</p>
                    </div>
                    ${badge(g.estado)}
                  </div>
                  <div style="margin-top:.55rem;display:flex;align-items:center;gap:.6rem;font-size:.8rem;color:var(--muted)">
                    <i class="bi bi-arrow-repeat"></i>${g.totalRondas} ronda${g.totalRondas !== 1 ? "s" : ""} realizadas
                    ${g.precio_boleto > 0 ? `<span>·</span><i class="bi bi-tag"></i>${fmtMoney(g.precio_boleto)}/boleto` : ""}
                  </div>
                </div>

                <div class="sorteo-card-mid">
                  ${ar ? `
                    <div class="prog-label">
                      <span>Ronda #${ar.numero} — cupos</span>
                      <span>${g.cupos}/25 ${lleno ? "· ✅ LISTA" : ""}</span>
                    </div>
                    <div class="prog-bg">
                      <div class="prog-fill${lleno ? " full" : pct >= 80 ? " almost" : ""}" style="width:${pct}%"></div>
                    </div>
                    <div style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
                      ${g.compPend > 0
                        ? `<div style="font-size:.77rem;color:var(--gold2)">
                             <i class="bi bi-exclamation-triangle"></i>
                             ${g.compPend} comprobante${g.compPend > 1 ? "s" : ""} pendiente${g.compPend > 1 ? "s" : ""}
                           </div>`
                        : ""}
                      ${g.gratisEnRonda > 0
                        ? `<div style="font-size:.77rem;color:#c4b5fd">
                             <i class="bi bi-gift-fill"></i>
                             ${g.gratisEnRonda} boleto${g.gratisEnRonda > 1 ? "s" : ""} gratis
                           </div>`
                        : ""}
                    </div>
                  ` : `
                    <div style="text-align:center;padding:.6rem 0;color:var(--muted);font-size:.87rem">
                      <i class="bi bi-moon-stars"></i> Sin ronda activa
                    </div>`}
                </div>

                <div class="sorteo-card-foot">
                  <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                    <button class="btn btn-ghost btn-sm"
                      onclick="window.__verRondas('${g.id}','${gNom}')">
                      <i class="bi bi-layers"></i> Rondas
                    </button>
                    ${ar ? `
                      <button class="btn btn-info btn-sm"
                        onclick="window.__verParticipantes('${ar.id}','${gNom}','${ar.numero}')">
                        <i class="bi bi-people"></i> Participantes
                      </button>
                      <button class="btn btn-ghost btn-sm"
                        onclick="window.__verComprobantes('${ar.id}','${gNom}','${ar.numero}')">
                        <i class="bi bi-receipt"></i> Comprobantes
                        ${g.compPend > 0
                          ? `<span style="background:var(--red2);color:#fff;border-radius:10px;padding:0 .38rem;font-size:.68rem">${g.compPend}</span>`
                          : ""}
                      </button>
                      ${lleno ? `
                        <button class="btn btn-gold btn-sm"
                          onclick="window.__realizarSorteo('${ar.id}','${gNom}','${ar.numero}')">
                          <i class="bi bi-shuffle"></i> Sortear
                        </button>` : ""}
                    ` : ""}
                  </div>
                </div>
              </div>`
            }).join("")}
          </div>`}`;

  } catch(e) {
    console.error("Sorteos error:", e);
    MC().innerHTML = `<div class="panel"><div class="panel-body">
      <div class="empty"><i class="bi bi-exclamation-triangle"></i>
        <p>Error al cargar sorteos.<br>
        <button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="sorteos()">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button></p>
      </div></div></div>`;
  }
}

/* ── Historial de rondas de un sorteo ── */
window.__verRondas = async (gameId, gameNombre) => {
  loadingView();
  try {
    const { data: rounds } = await supabase
      .from("rounds")
      .select("id,numero,estado,sorteado_at,created_at,profiles(username)")
      .eq("game_id", gameId)
      .order("numero", { ascending: false });

    const roundsData = await Promise.all((rounds || []).map(async r => {
      const [{ data: bRows }, { count: gratisCount }] = await Promise.all([
        supabase.from("participations").select("boletos").eq("round_id", r.id),
        supabase.from("participations").select("*", { count: "exact", head: true })
          .eq("round_id", r.id).eq("es_gratis", true),
      ]);
      const cupos = (bRows || []).reduce((s, x) => s + (x.boletos || 1), 0);
      return { ...r, cupos, gratisCount: gratisCount ?? 0 };
    }));

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-layers"></i>Rondas</div>
          <div class="ph-sub">${gameNombre} · ${roundsData.length} ronda${roundsData.length !== 1 ? "s" : ""}</div>
        </div>
        ${renderBackBtn("Volver a sorteos", sorteos)}
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="bi bi-list-ol"></i>Historial de rondas</div></div>
        <div class="panel-body" style="overflow-x:auto">
          <table id="tblRondas" style="width:100%">
            <thead><tr><th>Ronda</th><th>Estado</th><th>Cupos</th><th>Gratis</th><th>Ganador</th><th>Sorteado</th><th>Inicio</th><th>Acciones</th></tr></thead>
            <tbody>
              ${roundsData.map(r => {
                const gNom = gameNombre.replace(/'/g, "\\'");
                return `
                <tr>
                  <td><span style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:var(--gold2)">R${r.numero}</span></td>
                  <td>${badge(r.estado)}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:.5rem">
                      <div class="prog-bg" style="width:80px">
                        <div class="prog-fill${r.cupos >= 25 ? " full" : ""}" style="width:${Math.round(r.cupos/25*100)}%"></div>
                      </div>
                      <span style="font-size:.82rem;color:var(--muted)">${r.cupos}/25</span>
                    </div>
                  </td>
                  <td>
                    ${r.gratisCount > 0
                      ? `<span style="color:#c4b5fd;font-size:.82rem"><i class="bi bi-gift-fill"></i> ${r.gratisCount}</span>`
                      : `<span style="color:var(--dim);font-size:.78rem">—</span>`}
                  </td>
                  <td>${r.profiles ? `<strong style="color:var(--gold2)">${r.profiles.username}</strong>` : '<span style="color:var(--muted)">—</span>'}</td>
                  <td style="color:var(--muted)">${r.sorteado_at ? fmtDate(r.sorteado_at) : "—"}</td>
                  <td style="color:var(--muted)">${fmtDateShort(r.created_at)}</td>
                  <td>
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap">
                      <button class="btn btn-info btn-sm" onclick="window.__verParticipantes('${r.id}','${gNom}','${r.numero}')"><i class="bi bi-people"></i></button>
                      <button class="btn btn-ghost btn-sm" onclick="window.__verComprobantes('${r.id}','${gNom}','${r.numero}')"><i class="bi bi-receipt"></i></button>
                      ${r.estado === "abierta" && r.cupos >= 25
                        ? `<button class="btn btn-gold btn-sm" onclick="window.__realizarSorteo('${r.id}','${gNom}','${r.numero}')"><i class="bi bi-shuffle"></i></button>`
                        : ""}
                    </div>
                  </td>
                </tr>`}).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    initDT("tblRondas", { order: [[0, "desc"]], columnDefs: [{ orderable: false, targets: 7 }] });
  } catch(e) {
    console.error("verRondas error:", e);
    MC().innerHTML = `<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error al cargar rondas</p></div></div></div>`;
  }
};

/* ── Participantes de una ronda ── */
window.__verParticipantes = async (roundId, gameNombre, num) => {
  loadingView();
  try {
    const { data } = await supabase
      .from("participations")
      .select("id,boletos,resultado,es_gratis,created_at,profiles(username,email)")
      .eq("round_id", roundId);

    const totalBoletos = (data || []).reduce((s, x) => s + (x.boletos || 1), 0);
    const totalGratis  = (data || []).filter(p => p.es_gratis).length;

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-people"></i>Participantes</div>
          <div class="ph-sub">${gameNombre} · Ronda ${num} · ${data?.length ?? 0} jugadores · ${totalBoletos} boletos${totalGratis > 0 ? ` · <span style="color:#c4b5fd">${totalGratis} gratis 🎁</span>` : ""}</div>
        </div>
        ${renderBackBtn("Volver a sorteos", sorteos)}
      </div>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-list-ol"></i>Lista de participantes</div>
          <span style="font-size:.82rem;color:var(--muted)">${data?.length ?? 0} de 25 cupos</span>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          <table id="tblPart" style="width:100%">
            <thead><tr><th>#</th><th>Usuario</th><th>Email</th><th>Boletos</th><th>Tipo</th><th>Resultado</th><th>Inscripción</th></tr></thead>
            <tbody>
              ${(data || []).map((p, i) => `
                <tr>
                  <td style="color:var(--muted);font-family:'Oswald',sans-serif">${i + 1}</td>
                  <td><strong>${p.profiles?.username ?? "—"}</strong></td>
                  <td style="color:var(--muted)">${p.profiles?.email ?? "—"}</td>
                  <td>
                    <span style="background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.2);border-radius:6px;padding:.15rem .55rem;font-family:'Oswald',sans-serif;font-size:.8rem;color:var(--gold2)">
                      🎟️ ${p.boletos || 1}
                    </span>
                  </td>
                  <td>
                    ${p.es_gratis
                      ? `<span class="bdg bdg-gratis"><i class="bi bi-gift-fill"></i> Gratis</span>`
                      : `<span style="color:var(--dim);font-size:.78rem">—</span>`}
                  </td>
                  <td>${badge(p.resultado)}</td>
                  <td style="color:var(--muted)">${fmtDate(p.created_at)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    initDT("tblPart", { pageLength: 25, columnDefs: [{ orderable: false, targets: [0, 4, 5] }] });
  } catch(e) {
    console.error("verParticipantes error:", e);
  }
};

/* ── Realizar sorteo ── */
window.__realizarSorteo = async (roundId, gameNombre, num) => {
  const r = await confirm$(
    `Sortear Ronda ${num}`,
    `<strong style="color:#fff">${gameNombre}</strong><br><br>Se aplicará la lógica de premiación ponderada. <strong>No se puede deshacer.</strong>`,
    "🎲 Realizar sorteo"
  );
  if (!r.isConfirmed) return;
  loading$("Realizando sorteo...");

  try {
    const { data: parts } = await supabase
      .from("participations")
      .select("id,user_id,boletos,profiles(username)")
      .eq("round_id", roundId)
      .eq("resultado", "pendiente");

    if (!parts?.length) { Swal.close(); ok$("Sin participantes", "", "warning"); return; }

    const participantes = parts.map(p => ({
      id: p.id, user_id: p.user_id,
      username: p.profiles?.username || "—",
      boletos: p.boletos || 1
    }));

    const resultado = calcSorteo(participantes);
    const { caso, ganadores, premioEspecial } = resultado;
    const g1 = ganadores.find(g => g.lugar === 1);
    const g2 = ganadores.find(g => g.lugar === 2);
    const g3 = ganadores.find(g => g.lugar === 3);

    for (const g of ganadores) {
      await supabase.from("participations")
        .update({ resultado: "ganada", lugar: g.lugar }).eq("id", g.id);
    }
    const ganadorIds = ganadores.map(g => g.id);
    const losers = parts.filter(p => !ganadorIds.includes(p.id)).map(p => p.id);
    if (losers.length) await supabase.from("participations").update({ resultado: "perdida" }).in("id", losers);

    await supabase.from("rounds").update({
      estado: "sorteada",
      ganador_id:      g1?.user_id || null,
      ganador2_id:     g2?.user_id || null,
      ganador3_id:     g3?.user_id || null,
      caso_sorteo:     caso,
      premio_especial: premioEspecial,
      sorteado_at:     new Date().toISOString()
    }).eq("id", roundId);

    Swal.close();
    await Swal.fire({
      title: premioEspecial ? "🎩 ¡CASO ESPECIAL!" : "🏆 ¡Sorteo realizado!",
      html: `
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:.5rem">${nombreCaso(caso)}</div>
        <div style="font-family:'Oswald',sans-serif;font-size:1.5rem;color:#d4a017;margin:.2rem 0">${g1?.username ?? "—"} 🥇</div>
        ${g2 ? `<div style="margin:.18rem 0;font-size:.9rem;color:#93c5fd">🥈 ${g2.username}</div>` : ""}
        ${g3 ? `<div style="font-size:.88rem;color:#d97706">🥉 ${g3.username}</div>` : ""}
        ${premioEspecial ? `<div style="margin-top:.6rem;font-size:.82rem;color:var(--gold2)">🎁 Premio especial activado</div>` : ""}
        <div style="color:var(--muted);font-size:.78rem;margin-top:.5rem">${gameNombre} · Ronda ${num}</div>`,
      icon: "success", confirmButtonText: "Excelente", ...swal$
    });
    await Promise.all([loadSidebarStats(), sorteos()]);
  } catch(e) {
    Swal.close();
    console.error("realizarSorteo error:", e);
    ok$("Error", e.message || "No se pudo completar el sorteo", "error");
  }
};

/* ════════════════════════════════════════════
   COMPROBANTES GLOBALES
════════════════════════════════════════════ */
async function comprobantesGlobal() {
  setActive("comprobantes");
  loadingView();

  try {
    const { data, error } = await supabase
      .from("payments")
      .select("id,monto,metodo,estado,comprobante_url,boletos_solicitados,referencia,created_at,revisado_por,profiles!payments_user_id_fkey(username,email),rounds(id,numero,games(nombre))")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    const sorted = [...(data || [])].sort((a, b) => {
      if (a.estado === "pendiente" && b.estado !== "pendiente") return -1;
      if (a.estado !== "pendiente" && b.estado === "pendiente") return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    const pendCount   = sorted.filter(p => p.estado === "pendiente").length;
    const gratisCount = sorted.filter(p => p.metodo === "gratis").length;

    window.__compMap = {};
    sorted.forEach(p => { window.__compMap[p.id] = { ...p, username: p.profiles?.username }; });

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-receipt"></i>Comprobantes</div>
          <div class="ph-sub">${pendCount} pendiente${pendCount !== 1 ? "s" : ""} · ${sorted.length} total</div>
        </div>
      </div>

      ${pendCount > 0
        ? `<div class="alert-pend">
             <i class="bi bi-exclamation-triangle-fill"></i>
             <span><strong style="color:var(--gold2)">${pendCount}</strong> pago${pendCount !== 1 ? "s" : ""} esperando revisión.</span>
           </div>`
        : `<div style="background:rgba(58,138,58,.07);border:1px solid rgba(58,138,58,.2);border-radius:10px;padding:.75rem 1rem;margin-bottom:1.1rem;font-size:.88rem;color:#4ade80;display:flex;align-items:center;gap:.5rem">
             <i class="bi bi-check-circle-fill"></i> Sin pendientes — todo revisado
           </div>`}

      ${gratisCount > 0 ? `
      <div style="background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.22);border-radius:10px;padding:.65rem 1rem;margin-bottom:1rem;font-size:.85rem;color:#c4b5fd;display:flex;align-items:center;gap:.6rem">
        <i class="bi bi-gift-fill"></i>
        <span><strong>${gratisCount}</strong> registro${gratisCount !== 1 ? "s" : ""} con método <strong>Gratis</strong> — boleto de fidelidad aplicado</span>
      </div>` : ""}

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-cash-stack"></i>Todos los comprobantes</div>
          <span style="font-size:.82rem;color:var(--muted)">${sorted.length} registros</span>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          ${!sorted.length
            ? `<div class="empty"><i class="bi bi-inbox"></i><p>Sin comprobantes</p></div>`
            : `<table id="tblComp" style="width:100%">
                <thead>
                  <tr><th>Usuario</th><th>Email</th><th>Sorteo · Ronda</th><th>Boletos</th><th>Monto</th><th>Método</th><th>Estado</th><th>Fecha</th><th>Imagen</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  ${sorted.map(p => `
                    <tr${p.metodo === "gratis" ? ' style="background:rgba(139,92,246,.04)!important"' : ""}>
                      <td><strong>${p.profiles?.username ?? "—"}</strong></td>
                      <td style="color:var(--muted);font-size:.82rem">${p.profiles?.email ?? "—"}</td>
                      <td style="font-size:.82rem">${p.rounds?.games?.nombre ?? "—"} · R${p.rounds?.numero ?? "?"}</td>
                      <td><span style="font-family:'Oswald',sans-serif;font-size:.85rem;color:var(--gold2)">🎟️ ${p.boletos_solicitados || 1}</span></td>
                      <td style="font-family:'Oswald',sans-serif;color:${p.metodo === "gratis" ? "#c4b5fd" : "var(--gold2)"}">
                        ${p.metodo === "gratis" ? "🎁 Gratis" : fmtMoney(p.monto)}
                      </td>
                      <td>${badgeMetodo(p.metodo)}</td>
                      <td>${badge(p.estado)}</td>
                      <td style="color:var(--muted);font-size:.82rem">${fmtDateShort(p.created_at)}</td>
                      <td>${p.comprobante_url
                        ? `<button class="btn btn-ghost btn-sm" onclick="window.__verImagen('${p.id}')"><i class="bi bi-image"></i> Ver</button>`
                        : `<span style="color:var(--dim);font-size:.8rem">Sin imagen</span>`}</td>
                      <td>${p.estado === "pendiente"
                        ? `<div style="display:flex;gap:.3rem">
                             <button class="btn btn-success btn-sm" onclick="window.__aprobarPago('${p.id}','${p.rounds?.id ?? ""}','','')"><i class="bi bi-check-lg"></i> OK</button>
                             <button class="btn btn-danger btn-sm"  onclick="window.__rechazarPago('${p.id}','${p.rounds?.id ?? ""}','','')"><i class="bi bi-x-lg"></i></button>
                           </div>`
                        : `<span style="color:var(--dim);font-size:.78rem">—</span>`}</td>
                    </tr>`).join("")}
                </tbody>
              </table>`}
        </div>
      </div>`;

    if (sorted.length) {
      initDT("tblComp", { order: [[6, "asc"], [7, "asc"]], columnDefs: [{ orderable: false, targets: [8, 9] }] });
    }
  } catch(e) {
    console.error("comprobantesGlobal error:", e);
    MC().innerHTML = `<div class="panel"><div class="panel-body">
      <div class="empty"><i class="bi bi-exclamation-triangle"></i>
        <p>Error al cargar comprobantes.<br>
        <button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="window.__setView('comprobantes')">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button></p>
      </div></div></div>`;
  }
}

/* ── Ver imagen comprobante ── */
window.__verImagen = (id) => {
  const p = window.__compMap?.[id];
  if (!p) return;
  Swal.fire({
    title: "Comprobante de pago",
    html: `
      ${p.comprobante_url
        ? `<img src="${p.comprobante_url}"
               style="width:100%;max-height:280px;object-fit:contain;border-radius:8px;border:1px solid rgba(139,26,26,.22);margin-bottom:1rem"
               onerror="this.src='https://placehold.co/400x200/131009/d4a017?text=Imagen+no+disponible'">`
        : `<div style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);border-radius:8px;padding:1.5rem;margin-bottom:1rem;text-align:center;color:#c4b5fd;font-size:2rem">🎁<br><span style="font-size:.85rem">Boleto de fidelidad — sin comprobante físico</span></div>`}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Usuario</div><div style="color:#fff">${p.username || "—"}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Monto</div>
          <div style="color:${p.metodo === "gratis" ? "#c4b5fd" : "var(--gold2)"};font-family:'Oswald',sans-serif;font-size:1.1rem">
            ${p.metodo === "gratis" ? "🎁 Gratis" : fmtMoney(p.monto)}
          </div>
        </div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Boletos</div><div>🎟️ ${p.boletos_solicitados || 1}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Método</div><div>${badgeMetodo(p.metodo)}</div></div>
        <div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Fecha</div><div style="color:var(--muted)">${fmtDateShort(p.created_at)}</div></div>
        ${p.referencia ? `<div><div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.18rem">Referencia</div><div>${p.referencia}</div></div>` : ""}
      </div>
      ${p.estado === "pendiente" ? `
        <div style="margin-top:.9rem;display:flex;gap:.5rem;justify-content:center">
          <button class="btn btn-success btn-md" onclick="Swal.close();window.__aprobarPago('${p.id}','${p.rounds?.id ?? ""}','','')">
            <i class="bi bi-check-lg"></i> ${p.metodo === "gratis" ? "Confirmar boleto" : "Aprobar"}
          </button>
          <button class="btn btn-danger btn-md" onclick="Swal.close();window.__rechazarPago('${p.id}','${p.rounds?.id ?? ""}','','')">
            <i class="bi bi-x-lg"></i> Rechazar
          </button>
        </div>` : ""}`,
    showConfirmButton: false, showCloseButton: true, width: 520, ...swal$
  });
};

/* ── Comprobantes de una ronda específica ── */
window.__verComprobantes = async (roundId, gameNombre, num) => {
  loadingView();
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("id,monto,metodo,estado,comprobante_url,boletos_solicitados,referencia,created_at,profiles!payments_user_id_fkey(username,email)")
      .eq("round_id", roundId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const sorted = [...(data || [])].sort((a, b) => {
      if (a.estado === "pendiente" && b.estado !== "pendiente") return -1;
      if (a.estado !== "pendiente" && b.estado === "pendiente") return 1;
      return 0;
    });

    const pendCount   = sorted.filter(p => p.estado === "pendiente").length;
    const gratisCount = sorted.filter(p => p.metodo === "gratis").length;

    window.__compMap = {};
    sorted.forEach(p => {
      window.__compMap[p.id] = { ...p, username: p.profiles?.username, _roundId: roundId };
    });

    const gNomSafe = (gameNombre || "").replace(/'/g, "\\'");

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-receipt"></i>Comprobantes</div>
          <div class="ph-sub">${gameNombre} · Ronda ${num} · ${pendCount} pendiente${pendCount !== 1 ? "s" : ""}</div>
        </div>
        ${renderBackBtn("Volver a sorteos", sorteos)}
      </div>

      ${pendCount > 0
        ? `<div class="alert-pend"><i class="bi bi-exclamation-triangle-fill"></i>
             <span><strong style="color:var(--gold2)">${pendCount}</strong> pago${pendCount !== 1 ? "s" : ""} esperando revisión.</span>
           </div>`
        : `<div style="background:rgba(58,138,58,.07);border:1px solid rgba(58,138,58,.2);border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.88rem;color:#4ade80;display:flex;align-items:center;gap:.5rem">
             <i class="bi bi-check-circle-fill"></i> Todo revisado en esta ronda
           </div>`}

      ${gratisCount > 0 ? `
      <div style="background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.22);border-radius:10px;padding:.65rem 1rem;margin-bottom:1rem;font-size:.85rem;color:#c4b5fd;display:flex;align-items:center;gap:.6rem">
        <i class="bi bi-gift-fill"></i>
        <span><strong>${gratisCount}</strong> inscripción${gratisCount !== 1 ? "es" : ""} con boleto de fidelidad en esta ronda</span>
      </div>` : ""}

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-cash-stack"></i>Comprobantes · ${gameNombre} R${num}</div>
          <span style="font-size:.82rem;color:var(--muted)">${sorted.length} registros</span>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          ${!sorted.length
            ? `<div class="empty"><i class="bi bi-inbox"></i><p>Sin comprobantes en esta ronda</p></div>`
            : `<table id="tblCompR" style="width:100%">
                <thead><tr><th>Usuario</th><th>Email</th><th>Boletos</th><th>Monto</th><th>Método</th><th>Estado</th><th>Fecha</th><th>Imagen</th><th>Acción</th></tr></thead>
                <tbody>
                  ${sorted.map(p => `
                    <tr${p.metodo === "gratis" ? ' style="background:rgba(139,92,246,.04)!important"' : ""}>
                      <td><strong>${p.profiles?.username ?? "—"}</strong></td>
                      <td style="color:var(--muted);font-size:.82rem">${p.profiles?.email ?? "—"}</td>
                      <td><span style="font-family:'Oswald',sans-serif;font-size:.85rem;color:var(--gold2)">🎟️ ${p.boletos_solicitados || 1}</span></td>
                      <td style="font-family:'Oswald',sans-serif;color:${p.metodo === "gratis" ? "#c4b5fd" : "var(--gold2)"}">
                        ${p.metodo === "gratis" ? "🎁 Gratis" : fmtMoney(p.monto)}
                      </td>
                      <td>${badgeMetodo(p.metodo)}</td>
                      <td>${badge(p.estado)}</td>
                      <td style="color:var(--muted)">${fmtDateShort(p.created_at)}</td>
                      <td>${p.comprobante_url
                        ? `<button class="btn btn-ghost btn-sm" onclick="window.__verImagen('${p.id}')"><i class="bi bi-image"></i> Ver</button>`
                        : `<span style="color:var(--dim);font-size:.8rem">${p.metodo === "gratis" ? "🎁" : "Sin imagen"}</span>`}</td>
                      <td>${p.estado === "pendiente"
                        ? `<div style="display:flex;gap:.3rem">
                             <button class="btn btn-success btn-sm" onclick="window.__aprobarPago('${p.id}','${roundId}','${gNomSafe}','${num}')"><i class="bi bi-check-lg"></i> ${p.metodo === "gratis" ? "OK" : "OK"}</button>
                             <button class="btn btn-danger btn-sm"  onclick="window.__rechazarPago('${p.id}','${roundId}','${gNomSafe}','${num}')"><i class="bi bi-x-lg"></i></button>
                           </div>`
                        : `<span style="color:var(--dim);font-size:.78rem">—</span>`}</td>
                    </tr>`).join("")}
                </tbody>
              </table>`}
        </div>
      </div>`;

    if (sorted.length) {
      initDT("tblCompR", { order: [[5, "asc"], [6, "asc"]], columnDefs: [{ orderable: false, targets: [7, 8] }] });
    }
  } catch(e) {
    console.error("verComprobantes error:", e);
    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-receipt"></i>Comprobantes</div>
          <div class="ph-sub">${gameNombre} · Ronda ${num}</div>
        </div>
        ${renderBackBtn("Volver a sorteos", sorteos)}
      </div>
      <div class="panel"><div class="panel-body">
        <div class="empty">
          <i class="bi bi-exclamation-triangle"></i>
          <p>Error al cargar comprobantes: ${e.message || "Error desconocido"}<br>
          <button class="btn btn-ghost btn-sm" style="margin-top:.8rem"
            onclick="window.__verComprobantes('${roundId}','${gameNombre}','${num}')">
            <i class="bi bi-arrow-clockwise"></i> Reintentar
          </button></p>
        </div>
      </div></div>`;
  }
};

/* ── Aprobar pago ── */
window.__aprobarPago = async (id, roundId, gameNombre, num) => {
  const pago0 = window.__compMap?.[id];
  const esGratis = pago0?.metodo === "gratis";

  const r = await confirm$(
    esGratis ? "Confirmar boleto gratis" : "Aprobar pago",
    esGratis
      ? `¿Confirmar la inscripción con boleto de fidelidad de <strong style="color:#fff">${pago0?.username || "este usuario"}</strong>? El boleto quedará marcado como usado.`
      : "¿El comprobante es válido y el monto es correcto?",
    esGratis ? "🎁 Sí, confirmar" : "✅ Sí, aprobar"
  );
  if (!r.isConfirmed) return;
  loading$(esGratis ? "Confirmando boleto..." : "Aprobando...");

  try {
    const { data: pago, error } = await supabase.from("payments")
      .select("user_id, boletos_solicitados, round_id, metodo").eq("id", id).single();
    if (error || !pago) throw error || new Error("Pago no encontrado");

    const boletos = pago.boletos_solicitados || 1;
    const rId     = pago.round_id || roundId;

    // Consumir boleto gratis si aplica
    if (pago.metodo === "gratis") {
      await consumirBoletoGratis(pago.user_id, rId);
    }

    await supabase.from("payments")
      .update({ estado: "aprobado", revisado_por: currentUser.id }).eq("id", id);

    const { data: partExist } = await supabase.from("participations")
      .select("id, boletos").eq("round_id", rId).eq("user_id", pago.user_id).maybeSingle();

    if (partExist) {
      await supabase.from("participations")
        .update({ boletos: (partExist.boletos || 1) + boletos }).eq("id", partExist.id);
    } else {
      await supabase.from("participations").insert({
        round_id: rId, user_id: pago.user_id, boletos,
        resultado: "pendiente",
        es_gratis: pago.metodo === "gratis"
      });
    }

    Swal.close();
    toast(
      esGratis
        ? `🎁 Boleto gratis confirmado · inscrito en ronda`
        : `✅ Aprobado · ${boletos} boleto${boletos !== 1 ? "s" : ""} confirmado${boletos !== 1 ? "s" : ""}`
    );
    await loadSidebarStats();

    if (roundId && gameNombre) {
      window.__verComprobantes(rId, gameNombre, num);
    } else {
      comprobantesGlobal();
    }
  } catch(e) {
    Swal.close();
    ok$("Error", e.message || "No se pudo aprobar", "error");
  }
};

/* ── Rechazar pago ── */
window.__rechazarPago = async (id, roundId, gameNombre, num) => {
  const pago0 = window.__compMap?.[id];
  const esGratis = pago0?.metodo === "gratis";

  const r = await confirm$(
    esGratis ? "Rechazar boleto gratis" : "Rechazar pago",
    esGratis
      ? "¿Rechazar esta inscripción? El boleto de fidelidad <strong>no se consumirá</strong> y quedará disponible para el usuario."
      : "¿Rechazar este comprobante?",
    "❌ Sí, rechazar"
  );
  if (!r.isConfirmed) return;
  loading$("Rechazando...");

  try {
    await supabase.from("payments")
      .update({ estado: "rechazado", revisado_por: currentUser.id }).eq("id", id);
    Swal.close();
    toast(
      esGratis ? "Inscripción rechazada · boleto gratis conservado" : "Pago rechazado",
      "error"
    );
    await loadSidebarStats();

    if (roundId && gameNombre) {
      window.__verComprobantes(roundId, gameNombre, num);
    } else {
      comprobantesGlobal();
    }
  } catch(e) {
    Swal.close();
    ok$("Error", e.message || "No se pudo rechazar", "error");
  }
};

/* ════════════════════════════════════════════
   GANADORES
════════════════════════════════════════════ */
async function ganadores() {
  setActive("ganadores");
  loadingView();

  try {
    const { data } = await supabase
      .from("rounds")
      .select("id,numero,sorteado_at,caso_sorteo,premio_especial,games(nombre),ganador_id,ganador2_id,ganador3_id")
      .eq("estado", "sorteada")
      .not("ganador_id", "is", null)
      .order("sorteado_at", { ascending: false });

    if (!data?.length) {
      MC().innerHTML = `
        <div class="ph"><div class="ph-left">
          <div class="ph-title"><i class="bi bi-trophy-fill"></i>Ganadores</div>
          <div class="ph-sub">0 sorteos realizados</div>
        </div></div>
        <div class="panel"><div class="panel-body">
          <div class="empty"><i class="bi bi-trophy"></i><p>Aún no hay ganadores</p></div>
        </div></div>`;
      return;
    }

    const allIds = [...new Set(data.flatMap(r =>
      [r.ganador_id, r.ganador2_id, r.ganador3_id].filter(Boolean)))];
    const { data: profs } = await supabase
      .from("profiles").select("id,username").in("id", allIds);
    const pMap = {};
    (profs || []).forEach(p => pMap[p.id] = p.username);

    const casoNombres = { GRAN_PADRINO:"Gran Padrino", DOBLE_PADRINO:"Doble Padrino", GRAN_PATRON:"Gran Patron", ESTANDAR:"Estandar" };
    const casoColors  = { GRAN_PADRINO:"var(--gold2)", DOBLE_PADRINO:"#93c5fd", GRAN_PATRON:"var(--gold2)", ESTANDAR:"var(--muted)" };
    const casoIcons   = { GRAN_PADRINO:"bi-shield-fill-check", DOBLE_PADRINO:"bi-people-fill", GRAN_PATRON:"bi-star-fill", ESTANDAR:"bi-shuffle" };

    function avatar(uid, size = 32) {
      const u = uid ? (pMap[uid] || "?") : "?";
      return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--gold2));display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:${Math.round(size*.38)}px;font-weight:700;color:#fff;flex-shrink:0">${u[0].toUpperCase()}</div>`;
    }

    function podiumSlot(uid, lugar) {
      const colores = { 1:"var(--gold2)", 2:"#93c5fd", 3:"#d97706" };
      const iconos  = { 1:"bi-award-fill", 2:"bi-award", 3:"bi-star-fill" };
      const labels  = { 1:"1er", 2:"2do", 3:"3er" };
      if (!uid) return `
        <div style="display:flex;align-items:center;gap:.5rem;opacity:.3">
          <div style="width:32px;height:32px;border-radius:50%;border:1px dashed var(--dim);flex-shrink:0"></div>
          <span style="font-size:.78rem;color:var(--dim)">${labels[lugar]} lugar — sin ganador</span>
        </div>`;
      return `
        <div style="display:flex;align-items:center;gap:.55rem">
          ${avatar(uid, 32)}
          <div>
            <div style="font-family:'Oswald',sans-serif;font-size:.95rem;font-weight:700;color:${colores[lugar]}">${pMap[uid] || "—"}</div>
            <div style="display:flex;align-items:center;gap:.22rem;font-size:.68rem;color:${colores[lugar]};margin-top:.08rem">
              <i class="bi ${iconos[lugar]}"></i> ${labels[lugar]} lugar
            </div>
          </div>
        </div>`;
    }

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-trophy-fill"></i>Ganadores</div>
          <div class="ph-sub">${data.length} sorteo${data.length!==1?"s":""} realizado${data.length!==1?"s":""}</div>
        </div>
      </div>
      <div id="ganadoresWrap">
        ${data.map((r, i) => {
          const caso    = r.caso_sorteo || "ESTANDAR";
          const casoNom = casoNombres[caso] || caso;
          const casoCol = casoColors[caso]  || "var(--muted)";
          const casoIco = casoIcons[caso]   || "bi-shuffle";
          const fecha   = r.sorteado_at
            ? new Date(r.sorteado_at).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})
            : "—";
          return `
          <div class="gan-row" style="background:var(--ink2);border:1px solid var(--border);border-radius:12px;padding:1rem 1.2rem;margin-bottom:.75rem;transition:border-color .18s"
               onmouseenter="this.style.borderColor='rgba(212,160,23,.3)'" onmouseleave="this.style.borderColor='rgba(139,26,26,.22)'">
            <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-bottom:.85rem;padding-bottom:.75rem;border-bottom:1px solid rgba(139,26,26,.12)">
              <div style="width:28px;height:28px;border-radius:50%;background:rgba(212,160,23,.1);border:1px solid rgba(212,160,23,.2);display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:.82rem;font-weight:700;color:var(--gold2);flex-shrink:0">${i+1}</div>
              <div style="flex:1;min-width:0">
                <div style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.games?.nombre ?? "—"}</div>
                <div style="font-size:.75rem;color:var(--muted);margin-top:.08rem;display:flex;align-items:center;gap:.5rem">
                  <span style="font-family:'Oswald',sans-serif;color:var(--gold2);font-size:.8rem">Ronda ${r.numero}</span>
                  <span>·</span><span>${fecha}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:.35rem;background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.14);border-radius:6px;padding:.25rem .65rem;flex-shrink:0">
                <i class="bi ${casoIco}" style="font-size:.78rem;color:${casoCol}"></i>
                <span style="font-family:'Oswald',sans-serif;font-size:.72rem;font-weight:600;color:${casoCol};letter-spacing:.08em;text-transform:uppercase">${casoNom}</span>
                ${r.premio_especial ? `<i class="bi bi-gift-fill" style="font-size:.75rem;color:var(--gold2);margin-left:.2rem"></i>` : ""}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
              <div style="background:rgba(212,160,23,.04);border:1px solid rgba(212,160,23,.1);border-radius:8px;padding:.65rem .8rem">${podiumSlot(r.ganador_id,1)}</div>
              <div style="background:rgba(26,90,154,.04);border:1px solid rgba(26,90,154,.1);border-radius:8px;padding:.65rem .8rem">${podiumSlot(r.ganador2_id,2)}</div>
              <div style="background:rgba(180,80,10,.04);border:1px solid rgba(180,80,10,.1);border-radius:8px;padding:.65rem .8rem">${podiumSlot(r.ganador3_id,3)}</div>
            </div>
          </div>`;
        }).join("")}
      </div>`;
  } catch(e) {
    console.error("ganadores error:", e);
    MC().innerHTML = `<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error al cargar ganadores</p></div></div></div>`;
  }
}

/* ════════════════════════════════════════════
   BOLETOS GRATIS — Vista de fidelidad
   Consulta de solo lectura: quién tiene boletos
   disponibles y el historial de uso
════════════════════════════════════════════ */
async function boletosGratisView() {
  setActive("fidelidad");
  loadingView();

  try {
    const [
      { data: disponibles, error: e1 },
      { data: usados,      error: e2 }
    ] = await Promise.all([
      supabase.from("boletos_gratis")
        .select("id,origen,created_at,profiles(username,email)")
        .eq("usado", false)
        .order("created_at", { ascending: true }),
      supabase.from("boletos_gratis")
        .select("id,origen,usado_at,created_at,profiles(username,email),rounds(numero,games(nombre))")
        .eq("usado", true)
        .order("usado_at", { ascending: false })
        .limit(150),
    ]);

    if (e1 || e2) throw e1 || e2;

    // Agrupar disponibles por usuario para mostrar cuántos tiene cada uno
    const porUsuario = {};
    (disponibles || []).forEach(b => {
      const uid = b.profiles?.username || "?";
      if (!porUsuario[uid]) porUsuario[uid] = { username: uid, email: b.profiles?.email || "—", count: 0, origenes: [] };
      porUsuario[uid].count++;
      if (!porUsuario[uid].origenes.includes(b.origen)) porUsuario[uid].origenes.push(b.origen);
    });
    const usuariosConGratis = Object.values(porUsuario).sort((a, b) => b.count - a.count);

    const origenLabel = (o) => {
      const map = {
        referido:    "👥 Referido",
        promo:       "🎉 Promoción",
        fidelidad:   "⭐ Fidelidad",
        manual:      "🔧 Manual",
        bienvenida:  "🎁 Bienvenida",
      };
      return map[o] || `📌 ${o}`;
    };

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-gift-fill"></i>Boletos de Fidelidad</div>
          <div class="ph-sub">
            <span style="color:#c4b5fd;font-weight:600">${disponibles?.length ?? 0}</span> disponibles en
            <span style="color:#c4b5fd;font-weight:600">${usuariosConGratis.length}</span> usuario${usuariosConGratis.length !== 1 ? "s" : ""}
            · ${usados?.length ?? 0} histórico de usos
          </div>
        </div>
      </div>

      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="sc">
          <div class="sc-bar" style="background:#8b5cf6"></div>
          <div class="sc-icon">🎁</div>
          <div class="sc-val" style="color:#c4b5fd">${disponibles?.length ?? 0}</div>
          <div class="sc-lbl">Disponibles</div>
        </div>
        <div class="sc">
          <div class="sc-bar gr"></div>
          <div class="sc-icon">✅</div>
          <div class="sc-val">${usados?.length ?? 0}</div>
          <div class="sc-lbl">Usados</div>
        </div>
        <div class="sc">
          <div class="sc-bar g"></div>
          <div class="sc-icon">👤</div>
          <div class="sc-val" style="color:var(--gold2)">${usuariosConGratis.length}</div>
          <div class="sc-lbl">Usuarios con saldo</div>
        </div>
      </div>

      <!-- Usuarios con boletos disponibles -->
      <div class="panel" style="margin-bottom:1.2rem">
        <div class="panel-head">
          <div class="panel-title">
            <i class="bi bi-person-check-fill" style="color:#c4b5fd"></i>
            Usuarios con boletos disponibles
          </div>
          <span style="font-size:.82rem;color:var(--muted)">${usuariosConGratis.length} usuario${usuariosConGratis.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          ${!usuariosConGratis.length
            ? `<div class="empty"><i class="bi bi-inbox"></i><p>Sin boletos gratis disponibles</p></div>`
            : `<table id="tblGratisDisp" style="width:100%">
                <thead><tr><th>Usuario</th><th>Email</th><th>Boletos disponibles</th><th>Origen(es)</th></tr></thead>
                <tbody>
                  ${usuariosConGratis.map(u => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:.5rem">
                          <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6d28d9,#8b5cf6);display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:.75rem;font-weight:700;color:#fff;flex-shrink:0">${u.username[0].toUpperCase()}</div>
                          <strong>${u.username}</strong>
                        </div>
                      </td>
                      <td style="color:var(--muted);font-size:.82rem">${u.email}</td>
                      <td>
                        <span style="background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);border-radius:6px;padding:.2rem .7rem;font-family:'Oswald',sans-serif;font-size:.9rem;color:#c4b5fd;font-weight:700">
                          🎁 ${u.count}
                        </span>
                      </td>
                      <td style="font-size:.82rem;color:var(--muted)">
                        ${u.origenes.map(o => `<span style="margin-right:.3rem">${origenLabel(o)}</span>`).join("")}
                      </td>
                    </tr>`).join("")}
                </tbody>
              </table>`}
        </div>
      </div>

      <!-- Historial de boletos usados -->
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <i class="bi bi-clock-history"></i>
            Historial de usos
          </div>
          <span style="font-size:.82rem;color:var(--muted)">${usados?.length ?? 0} registros</span>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          ${!usados?.length
            ? `<div class="empty"><i class="bi bi-inbox"></i><p>Sin historial de usos aún</p></div>`
            : `<table id="tblGratisUsados" style="width:100%">
                <thead><tr><th>Usuario</th><th>Email</th><th>Origen</th><th>Ronda usada</th><th>Fecha creación</th><th>Fecha uso</th></tr></thead>
                <tbody>
                  ${usados.map(b => `
                    <tr>
                      <td><strong>${b.profiles?.username ?? "—"}</strong></td>
                      <td style="color:var(--muted);font-size:.82rem">${b.profiles?.email ?? "—"}</td>
                      <td style="font-size:.82rem">${origenLabel(b.origen)}</td>
                      <td style="font-size:.82rem">
                        ${b.rounds
                          ? `<span style="color:var(--gold2);font-family:'Oswald',sans-serif">${b.rounds.games?.nombre ?? "—"} R${b.rounds.numero}</span>`
                          : `<span style="color:var(--dim)">—</span>`}
                      </td>
                      <td style="color:var(--muted)">${fmtDateShort(b.created_at)}</td>
                      <td style="color:var(--muted)">${b.usado_at ? fmtDate(b.usado_at) : "—"}</td>
                    </tr>`).join("")}
                </tbody>
              </table>`}
        </div>
      </div>`;

    if (usuariosConGratis.length) initDT("tblGratisDisp", { order: [[2, "desc"]], columnDefs: [{ orderable: false, targets: [3] }] });
    if (usados?.length)           initDT("tblGratisUsados", { order: [[5, "desc"]] });

  } catch(e) {
    console.error("boletosGratisView error:", e);
    MC().innerHTML = `<div class="panel"><div class="panel-body">
      <div class="empty"><i class="bi bi-exclamation-triangle"></i>
        <p>Error al cargar boletos de fidelidad.<br>
        <button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="window.__setView('fidelidad')">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button></p>
      </div></div></div>`;
  }
}

/* ════════════════════════════════════════════
   MI ACTIVIDAD
════════════════════════════════════════════ */
async function historial() {
  setActive("historial");
  loadingView();

  try {
    const { data: revisados } = await supabase
      .from("payments")
      .select("id,monto,metodo,estado,boletos_solicitados,created_at,profiles!payments_user_id_fkey(username),rounds(numero,games(nombre))")
      .eq("revisado_por", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const aprobados   = (revisados || []).filter(p => p.estado === "aprobado").length;
    const rechazados  = (revisados || []).filter(p => p.estado === "rechazado").length;
    const gratisAprob = (revisados || []).filter(p => p.estado === "aprobado" && p.metodo === "gratis").length;
    const total       = revisados?.length ?? 0;

    MC().innerHTML = `
      <div class="ph">
        <div class="ph-left">
          <div class="ph-title"><i class="bi bi-clock-history"></i>Mi actividad</div>
          <div class="ph-sub">Pagos revisados por mí</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="sc"><div class="sc-bar gr"></div><div class="sc-icon">✅</div>
          <div class="sc-val">${aprobados}</div><div class="sc-lbl">Aprobé</div></div>
        <div class="sc"><div class="sc-bar r"></div><div class="sc-icon">❌</div>
          <div class="sc-val">${rechazados}</div><div class="sc-lbl">Rechacé</div></div>
        <div class="sc"><div class="sc-bar" style="background:#8b5cf6"></div><div class="sc-icon">🎁</div>
          <div class="sc-val" style="color:#c4b5fd">${gratisAprob}</div><div class="sc-lbl">Gratis confirmé</div></div>
        <div class="sc"><div class="sc-bar b"></div><div class="sc-icon">📋</div>
          <div class="sc-val">${total}</div><div class="sc-lbl">Total revisados</div></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-list-check"></i>Historial de revisiones</div>
          <span style="font-size:.82rem;color:var(--muted)">${total} registros</span>
        </div>
        <div class="panel-body" style="overflow-x:auto">
          ${!revisados?.length
            ? `<div class="empty"><i class="bi bi-inbox"></i><p>Aún no has revisado ningún pago</p></div>`
            : `<table id="tblHist" style="width:100%">
                <thead><tr><th>Usuario</th><th>Sorteo · Ronda</th><th>Boletos</th><th>Monto</th><th>Método</th><th>Decisión</th><th>Fecha</th></tr></thead>
                <tbody>
                  ${revisados.map(p => `
                    <tr${p.metodo === "gratis" ? ' style="background:rgba(139,92,246,.04)!important"' : ""}>
                      <td><strong>${p.profiles?.username ?? "—"}</strong></td>
                      <td style="font-size:.82rem">${p.rounds?.games?.nombre ?? "—"} · R${p.rounds?.numero ?? "?"}</td>
                      <td style="font-family:'Oswald',sans-serif;color:var(--gold2)">🎟️ ${p.boletos_solicitados || 1}</td>
                      <td style="font-family:'Oswald',sans-serif;color:${p.metodo === "gratis" ? "#c4b5fd" : "var(--gold2)"}">
                        ${p.metodo === "gratis" ? "🎁 Gratis" : fmtMoney(p.monto)}
                      </td>
                      <td>${badgeMetodo(p.metodo)}</td>
                      <td>${badge(p.estado)}</td>
                      <td style="color:var(--muted)">${fmtDateShort(p.created_at)}</td>
                    </tr>`).join("")}
                </tbody>
              </table>`}
        </div>
      </div>`;

    if (revisados?.length) initDT("tblHist", { order: [[6, "desc"]] });
  } catch(e) {
    console.error("historial error:", e);
    MC().innerHTML = `<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error al cargar historial</p></div></div></div>`;
  }
}

/* ════════════════════════════════════════════
   ARRANQUE
════════════════════════════════════════════ */
try {
  await loadSidebarStats();
} catch(e) {
  console.warn("loadSidebarStats startup error:", e);
}

setTimeout(() => dashboard(), 50);