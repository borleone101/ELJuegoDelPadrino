import { supabase } from "./supabase.js";
import { uploadFile } from "./cloudinary.js";
import { realizarSorteo, calcularChances, nombreCaso, mensajeNoGanador } from "./logica_juego.js";

/* ═══════════════════════════════════════
   HELPERS BASE
═══════════════════════════════════════ */
const getEl = id => document.getElementById(id);

const swal$ = { background:'#131009', color:'#e6dcc8', confirmButtonColor:'#8b1a1a', cancelButtonColor:'#221c14' };

const toast = (title, icon="success") => Swal.fire({
  title, icon, toast:true, position:"top-end", showConfirmButton:false, timer:2800, timerProgressBar:true,
  background:'#1b1610', color:'#e6dcc8',
  iconColor: icon==="success"?"#4ade80":icon==="error"?"#f87171":"#d4a017"
});
const confirm$ = (title, html, confirmText="Confirmar") => Swal.fire({
  title, html, icon:"warning", showCancelButton:true,
  confirmButtonText:confirmText, cancelButtonText:"Cancelar", ...swal$
});
const loading$ = (text="Procesando...") => Swal.fire({
  title:text, allowOutsideClick:false, showConfirmButton:false,
  didOpen:()=>Swal.showLoading(), ...swal$
});
const ok$ = (title, html="", icon="success") => Swal.fire({
  title, html, icon, confirmButtonText:"OK", ...swal$
});

function fmtDateShort(d) {
  return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric"});
}
function fmtMoney(n) { return `Bs ${Number(n||0).toFixed(2)}`; }

/* ═══════════════════════════════════════
   FILTROS COMPACTOS — chip style
═══════════════════════════════════════ */
function buildFilterBar({ searchId, searchPlaceholder="Buscar…", chips=[], sortId, countId }) {
  const searchHtml = searchId ? `
    <div class="fc-search">
      <i class="bi bi-search fc-search-ico"></i>
      <input id="${searchId}" type="search" placeholder="${searchPlaceholder}" class="fc-input" autocomplete="off">
    </div>` : "";

  const chipsHtml = chips.map(c => `
    <div class="fc-chip-wrap">
      <select id="${c.id}" class="fc-chip">
        ${c.options.map(o=>`<option value="${o.value}">${o.icon?o.icon+" ":""}${o.label}</option>`).join("")}
      </select>
      <i class="bi bi-chevron-down fc-chip-arr"></i>
    </div>`).join("");

  const sortHtml = sortId ? `
    <div class="fc-chip-wrap">
      <select id="${sortId}" class="fc-chip fc-chip-sort">
        <option value="desc">↓ Reciente</option>
        <option value="asc">↑ Antiguo</option>
      </select>
      <i class="bi bi-chevron-down fc-chip-arr"></i>
    </div>` : "";

  const countHtml = countId ? `<span id="${countId}" class="fc-count"></span>` : "";

  return `
  <div class="filter-compact">
    ${searchHtml}
    <div class="fc-row">
      ${chipsHtml}${sortHtml}
      ${countHtml}
    </div>
  </div>`;
}

function setCount(countId, visible, total) {
  const el = getEl(countId); if (!el) return;
  el.textContent = visible===total ? `${total}` : `${visible}/${total}`;
}

function emptyFilter(msg="Sin resultados") {
  return `<div class="empty" style="padding:1.8rem 1rem">
    <i class="bi bi-funnel"></i>
    <p>${msg}<br><small style="color:var(--dim)">Cambia los filtros</small></p>
  </div>`;
}

/* ═══════════════════════════════════════
   AUTH — verificación estricta de sesión
═══════════════════════════════════════ */
const { data:{ session }, error: sessionError } = await supabase.auth.getSession();
if (!session || sessionError) {
  window.location.href = "../../auth/login.html"; throw 0;
}

// Siempre verificar con el servidor, no solo con caché local
const { data:{ user }, error: userError } = await supabase.auth.getUser();
if (!user || userError) {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html"; throw 0;
}

// Guardar el ID en constante inmutable para todo el módulo
const MY_USER_ID = user.id;

const { data:profile, error:profileError } = await supabase
  .from("profiles").select("*").eq("id", MY_USER_ID).single();

if (!profile || profileError || profile.estado === "suspendido") {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html"; throw 0;
}

/* ═══════════════════════════════════════
   ESTADO GLOBAL — siempre ligado a MY_USER_ID
═══════════════════════════════════════ */
let currentProfile = { ...profile };
let boletosGratis = 0;
let boletosGratisDetalle = [];

async function refreshProfile() {
  // Siempre usar MY_USER_ID, nunca datos de otro usuario
  const { data } = await supabase
    .from("profiles").select("*").eq("id", MY_USER_ID).single();
  if (data) currentProfile = { ...data };

  const { data:bgs } = await supabase
    .from("boletos_gratis")
    .select("id,origen,created_at")
    .eq("user_id", MY_USER_ID)   // ← filtro explícito
    .eq("usado", false);

  boletosGratisDetalle = bgs || [];
  boletosGratis = boletosGratisDetalle.length;
  return currentProfile;
}
await refreshProfile();

function initUserUI(prof) {
  const ini = (prof.username?.[0] || "?").toUpperCase();
  const tbName = getEl("tbName");   if (tbName)  tbName.textContent  = prof.username;
  const tbAv   = getEl("tbAvatar"); if (tbAv)    tbAv.textContent    = ini;
  const sbName = getEl("sbName");   if (sbName)  sbName.textContent  = prof.username;
  const sbAv   = getEl("sbAvatar"); if (sbAv)    sbAv.textContent    = ini;
  const sbS    = getEl("sbSaldo");  if (sbS)     sbS.textContent     = Number(prof.total_ganado||0).toFixed(2);
  const hS     = getEl("heroSaldo");if (hS)      hS.textContent      = Number(prof.total_ganado||0).toFixed(2);
  const hBF    = getEl("heroBoletosFree");
  if (hBF) hBF.textContent = boletosGratis > 0 ? `${boletosGratis} gratis` : "0 gratis";
}
initUserUI(currentProfile);

async function doLogout() {
  const r = await confirm$("¿Cerrar sesión?", "", "Sí, salir");
  if (r.isConfirmed) {
    await supabase.auth.signOut();
    window.location.href = "../../auth/login.html";
  }
}
getEl("logoutBtn")  && getEl("logoutBtn").addEventListener("click",  doLogout);
getEl("logoutBtn2") && getEl("logoutBtn2").addEventListener("click", doLogout);

/* ═══════════════════════════════════════
   QR STATE
═══════════════════════════════════════ */
let qrState = {
  subido:    !!currentProfile.qr_cobro_url,
  verificado:!!currentProfile.qr_verificado,
  url:       currentProfile.qr_cobro_url  || null,
  metodo:    currentProfile.qr_metodo     || null,
  subidoAt:  currentProfile.qr_subido_at  || null,
};

function puedeParticipar() { return qrState.subido && qrState.verificado; }

function qrBanner() {
  if (puedeParticipar()) return "";
  if (!qrState.subido) return `
    <div class="qr-gate-banner">
      <div class="qgb-icon"><i class="bi bi-qr-code-scan"></i></div>
      <div class="qgb-body">
        <div class="qgb-title">Sube tu QR de cobros para participar</div>
        <div class="qgb-sub">Necesitas subir tu QR para comprar boletos y recibir premios.</div>
      </div>
      <button class="btn btn-gold btn-md" onclick="modalSubirQR()">
        <i class="bi bi-upload"></i> Subir QR
      </button>
    </div>`;
  return `
  <div class="qr-gate-banner qgb-pending">
    <div class="qgb-icon"><i class="bi bi-hourglass-split"></i></div>
    <div class="qgb-body">
      <div class="qgb-title">QR pendiente de verificación</div>
      <div class="qgb-sub">El administrador está revisando tu QR.</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()">
      <i class="bi bi-eye"></i> Ver
    </button>
  </div>`;
}

/* ═══════════════════════════════════════
   MODAL SUBIR QR
═══════════════════════════════════════ */
const METODOS_QR = [
  { value:"tigo_money",    label:"Tigo Money",       desc:"QR Tigo Money Bolivia"    },
  { value:"billetera_bcb", label:"Billetera BCB",    desc:"QR del Banco Central"     },
  { value:"qr_simple",     label:"QR Simple / Interbank", desc:"QR estándar bancario" },
  { value:"efectivo_cuenta",label:"Cuenta bancaria", desc:"Depósito en cuenta"       },
];

window.modalSubirQR = async (esAct=false) => {
  const { value:v } = await Swal.fire({
    title: esAct ? "Actualizar QR de cobros" : "Sube tu QR de cobros",
    html:`
      <div style="text-align:left">
        <div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.2);border-radius:10px;padding:.8rem 1rem;margin-bottom:1rem;font-size:.82rem;color:var(--muted)">
          <i class="bi bi-info-circle" style="color:var(--gold2)"></i> Si ganas, el admin usará tu QR para enviarte el premio.
        </div>
        <div class="field" style="margin-bottom:1rem">
          <label>Tipo de pago *</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.2rem">
            ${METODOS_QR.map(m=>`
              <label style="display:flex;align-items:flex-start;gap:.5rem;padding:.6rem .7rem;background:var(--ink3);border:1px solid ${m.value===(qrState.metodo||'')?'var(--gold2)':'var(--border)'};border-radius:8px;cursor:pointer" class="metodo-card" data-val="${m.value}">
                <input type="radio" name="qrMetodo" value="${m.value}" ${m.value===(qrState.metodo||'')?'checked':''} style="margin-top:.15rem;accent-color:var(--red2)">
                <div>
                  <div style="font-size:.85rem;font-weight:600;color:#fff">${m.label}</div>
                  <div style="font-size:.7rem;color:var(--muted)">${m.desc}</div>
                </div>
              </label>`).join("")}
          </div>
        </div>
        <div class="field">
          <label>Imagen del QR * <span style="color:var(--muted);font-size:.68rem;font-weight:400;text-transform:none">(JPG/PNG, máx. 5 MB)</span></label>
          <input type="file" id="qrFileInput" accept="image/jpeg,image/png,image/webp"
            style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem;font-size:.85rem">
        </div>
        <img id="qrPreviewImg" style="display:none;max-height:160px;width:100%;object-fit:contain;margin-top:.6rem;border-radius:8px;border:1px solid rgba(212,160,23,.2)">
      </div>`,
    showCancelButton:true,
    confirmButtonText:`<i class='bi bi-upload'></i> ${esAct?'Actualizar':'Subir QR'}`,
    cancelButtonText:"Cancelar", width:500, ...swal$,
    didOpen:() => {
      document.querySelectorAll(".metodo-card").forEach(c => {
        c.addEventListener("click", () => {
          document.querySelectorAll(".metodo-card").forEach(x => x.style.borderColor = "var(--border)");
          c.style.borderColor = "var(--gold2)";
        });
      });
      document.getElementById("qrFileInput").addEventListener("change", e => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = ev => { const i = document.getElementById("qrPreviewImg"); i.src = ev.target.result; i.style.display = "block"; };
        r.readAsDataURL(f);
      });
    },
    preConfirm:() => {
      const metodo = document.querySelector("input[name='qrMetodo']:checked")?.value;
      const file   = document.getElementById("qrFileInput").files[0];
      if (!metodo) { Swal.showValidationMessage("Selecciona el tipo de pago"); return false; }
      if (!file)   { Swal.showValidationMessage("Sube la imagen de tu QR");   return false; }
      if (file.size > 5*1024*1024) { Swal.showValidationMessage("Imagen muy grande (máx. 5 MB)"); return false; }
      return { metodo, file };
    }
  });
  if (!v) return;

  loading$("Subiendo QR...");
  let qr_url;
  try { qr_url = await uploadFile(v.file, "el-padrino/qr-cobros"); }
  catch { Swal.close(); ok$("Error al subir imagen", "", "error"); return; }

  // Actualizar SOLO el perfil del usuario actual
  const { error } = await supabase
    .from("profiles")
    .update({ qr_cobro_url:qr_url, qr_metodo:v.metodo, qr_verificado:false, qr_subido_at:new Date().toISOString() })
    .eq("id", MY_USER_ID);   // ← siempre MY_USER_ID

  Swal.close();
  if (error) { ok$("Error", error.message, "error"); return; }

  qrState = { subido:true, verificado:false, url:qr_url, metodo:v.metodo, subidoAt:new Date().toISOString() };
  await ok$("QR subido correctamente", "El administrador lo revisará. Una vez verificado podrás comprar boletos.", "success");

  const active = document.querySelector(".section.active")?.id?.replace("sec-","");
  if (active) loadSection(active);
};

window.modalVerMiQR = () => {
  if (!qrState.url) return;
  const ml = { tigo_money:"Tigo Money", billetera_bcb:"Billetera BCB", qr_simple:"QR Simple", efectivo_cuenta:"Cuenta bancaria" };
  Swal.fire({
    title:"Mi QR de cobros",
    html:`<img src="${qrState.url}" style="width:100%;max-height:280px;object-fit:contain;border-radius:10px;border:1px solid rgba(212,160,23,.2);margin-bottom:.8rem">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
        <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem">
          <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">MÉTODO</div>
          <div>${ml[qrState.metodo]||qrState.metodo||"—"}</div>
        </div>
        <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem">
          <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">ESTADO</div>
          <div>${qrState.verificado?'<span style="color:#22c55e">Verificado</span>':'<span style="color:#f59e0b">En revisión</span>'}</div>
        </div>
      </div>`,
    showCancelButton:true,
    confirmButtonText:'<i class="bi bi-arrow-repeat"></i> Actualizar QR',
    cancelButtonText:"Cerrar", width:400, ...swal$
  }).then(r => { if (r.isConfirmed) modalSubirQR(true); });
};

/* ═══════════════════════════════════════
   NAVEGACIÓN
═══════════════════════════════════════ */
const secciones = {
  sorteos:loadSorteos, historial:loadHistorial, pagos:loadPagos,
  premios:loadPremios, referidos:loadReferidos, fidelidad:loadFidelidad, perfil:loadPerfil
};

function loadSection(sec) {
  document.querySelectorAll(".section").forEach(s => { s.classList.remove("active"); s.style.display = "none"; });
  const el = document.getElementById(`sec-${sec}`);
  if (el) { el.style.display = "block"; el.classList.add("active"); }
  document.querySelectorAll("[data-sec]").forEach(b => b.classList.toggle("active", b.dataset.sec === sec));
  if (window.innerWidth < 769) {
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sbOverlay")?.classList.remove("open");
  }
  secciones[sec]?.();
}
document.querySelectorAll("[data-sec]").forEach(btn => btn.addEventListener("click", () => loadSection(btn.dataset.sec)));
getEl("btnRefresh") && getEl("btnRefresh").addEventListener("click", () => {
  const active = document.querySelector(".section.active")?.id?.replace("sec-","") || "sorteos";
  loadSection(active);
});

/* ═══════════════════════════════════════
   HELPERS GENERALES
═══════════════════════════════════════ */
function getNivel(t) {
  if (t>=100) return { key:"padrino",      label:"El Padrino",    clase:"nivel-padrino"      };
  if (t>=50)  return { key:"patron",       label:"Gran Patrón",   clase:"nivel-patron"       };
  if (t>=20)  return { key:"contendiente", label:"Contendiente",  clase:"nivel-contendiente" };
  if (t>=5)   return { key:"jugador",      label:"Jugador",       clase:"nivel-jugador"      };
  return             { key:"novato",       label:"Novato",        clase:"nivel-novato"       };
}

// Info del fondo de la ronda — datos públicos de la ronda, no de usuarios
async function verificarFondoRonda(roundId) {
  // Contar boletos gratis en la ronda (info pública de participación)
  const { data:pts } = await supabase
    .from("participations")
    .select("boletos, es_gratis")
    .eq("round_id", roundId);
  const gratisEnRonda = (pts||[]).filter(p => p.es_gratis===true).reduce((s,p) => s+(p.boletos||0), 0);
  return { boletosGratisEnRonda:gratisEnRonda, riesgo:gratisEnRonda>=3 };
}

/* ═══════════════════════════════════════
   BOLETO GRATIS EN RONDA
   - ¿Ya usé YO uno aquí? → query filtrada por MY_USER_ID
   - ¿Cuántos otros tienen gratis? → conteo anónimo, sin exponer IDs
═══════════════════════════════════════ */
async function estadoBoletoGratisEnRonda(roundId) {
  // Solo mis boletos gratis usados en esta ronda
  const { data:miUso } = await supabase
    .from("boletos_gratis")
    .select("id")
    .eq("user_id", MY_USER_ID)      // ← solo el mío
    .eq("usado_en_round", roundId)
    .limit(1);
  const yoUse = (miUso?.length || 0) > 0;

  // Contar cuántas participaciones gratis hay en la ronda (sin exponer user_ids)
  const { count:totalGratisEnRonda } = await supabase
    .from("participations")
    .select("id", { count:"exact", head:true })
    .eq("round_id", roundId)
    .eq("es_gratis", true);

  // ¿Yo ya participé con gratis? (desde participations)
  const { count:yoGratisEnPart } = await supabase
    .from("participations")
    .select("id", { count:"exact", head:true })
    .eq("round_id", roundId)
    .eq("user_id", MY_USER_ID)      // ← solo el mío
    .eq("es_gratis", true);

  const miGratis = (yoGratisEnPart || 0) > 0;
  // Otros = total gratis en ronda menos el mío
  const otrosConGratis = Math.max(0, (totalGratisEnRonda||0) - (miGratis ? 1 : 0));

  return { yoUse: yoUse || miGratis, otrosConGratis, totalGratisEnRonda: totalGratisEnRonda||0 };
}

/* ═══════════════════════════════════════
   SORTEOS ACTIVOS
   FIX PRINCIPAL: queries separadas para
   datos públicos de la ronda vs datos propios
═══════════════════════════════════════ */
async function loadSorteos() {
  const container = getEl("sorteosList"); if (!container) return;
  container.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const bannerEl = getEl("qrGateBanner");
  if (bannerEl) {
    bannerEl.innerHTML = qrBanner();
    if (boletosGratis > 0 && puedeParticipar()) {
      const bfb = document.createElement("div");
      bfb.className = "boleto-gratis-banner";
      bfb.innerHTML = `<i class="bi bi-gift-fill bfb-icon"></i><div>
        <div class="bfb-title">Tienes ${boletosGratis} boleto${boletosGratis>1?"s":""} gratis</div>
        <div class="bfb-sub">Solo puedes usar 1 por sorteo. ¡Compite rápido, pueden terminar!</div>
      </div>`;
      bannerEl.appendChild(bfb);
    }
  }

  const { data:rounds, error:rErr } = await supabase
    .from("rounds").select("id,numero,estado,created_at,game_id")
    .eq("estado","abierta").order("created_at",{ascending:false});

  if (rErr || !rounds?.length) {
    container.innerHTML = `<div class="empty"><i class="bi bi-ticket-perforated"></i><p>No hay sorteos activos ahora mismo.</p></div>`;
    return;
  }

  const gameIds = [...new Set(rounds.map(r=>r.game_id).filter(Boolean))];
  let gamesMap = {};
  if (gameIds.length) {
    const { data:gd } = await supabase.from("games")
      .select("id,nombre,descripcion,precio_boleto").in("id", gameIds);
    (gd||[]).forEach(g => { gamesMap[g.id] = g; });
  }

  const roundsData = await Promise.all(rounds.map(async r => {

    // ── QUERY 1: datos públicos de la ronda (cupos totales, gratis en ronda)
    //    Solo seleccionamos lo mínimo necesario, sin exponer datos personales
    const { data:allParts } = await supabase
      .from("participations")
      .select("boletos, es_gratis, user_id")
      .eq("round_id", r.id);

    const cupos = (allParts||[]).reduce((s,p) => s+(p.boletos||1), 0);
    const boletosGratisEnRonda = (allParts||[])
      .filter(p => p.es_gratis===true)
      .reduce((s,p) => s+(p.boletos||0), 0);
    // Contar otros con gratis (sin usar sus datos, solo contar)
    const otrosConGratis = (allParts||[])
      .filter(p => p.es_gratis===true && p.user_id !== MY_USER_ID).length;

    // ── QUERY 2: MIS datos en esta ronda — filtrado estrictamente por MY_USER_ID
    const { data:misParts } = await supabase
      .from("participations")
      .select("boletos, es_gratis")
      .eq("round_id", r.id)
      .eq("user_id", MY_USER_ID);   // ← SOLO MIS datos

    const misBoletos   = (misParts||[]).reduce((s,p) => s+(p.boletos||1), 0);
    const yoUseGratis  = (misParts||[]).some(p => p.es_gratis===true);

    // ── QUERY 3: mi pago en esta ronda — filtrado por MY_USER_ID
    const { data:myPay } = await supabase
      .from("payments")
      .select("id, estado")
      .eq("round_id", r.id)
      .eq("user_id", MY_USER_ID)   // ← SOLO MI pago
      .maybeSingle();

    return {
      ...r,
      cupos,
      game: gamesMap[r.game_id],
      misBoletos,
      miPago: myPay,
      boletosGratisEnRonda,
      yoUseGratis,
      otrosConGratis,
    };
  }));

  // Ordenar: mis sorteos primero, luego más llenos primero
  const conMi  = roundsData.filter(r => r.misBoletos > 0);
  const sinMi  = roundsData.filter(r => r.misBoletos === 0);
  sinMi.sort((a,b) => b.cupos - a.cupos);
  const ordenados = [...conMi, ...sinMi];

  container.innerHTML = ordenados.map(r => {
    const pct   = Math.round((r.cupos/25)*100);
    const lleno = r.cupos >= 25;
    const tieneCompPend    = r.miPago?.estado === "pendiente";
    const tieneCompAprobado= r.miPago?.estado === "aprobado";
    const chances    = r.misBoletos > 0 ? calcularChances(r.misBoletos, r.cupos - r.misBoletos) : null;
    const estoyDentro= r.misBoletos > 0;

    const fondoWarn = r.boletosGratisEnRonda >= 3
      ? `<div class="fondo-warn"><i class="bi bi-exclamation-triangle-fill"></i>
          <span>Esta ronda tiene ${r.boletosGratisEnRonda} boleto${r.boletosGratisEnRonda>1?"s":""} gratis — el fondo puede ser menor.</span>
         </div>` : "";

    const gratisWarn = !r.yoUseGratis && r.otrosConGratis > 0 && boletosGratis > 0
      ? `<div class="gratis-competencia-badge">
          <i class="bi bi-lightning-charge-fill"></i>
          ${r.otrosConGratis} jugador${r.otrosConGratis>1?"es ya tienen":"ya tiene"} boleto gratis aquí
         </div>` : "";

    let btnHtml = "";
    if (!puedeParticipar()) {
      btnHtml = !qrState.subido
        ? `<button class="btn btn-gold btn-md" onclick="modalSubirQR()"><i class="bi bi-qr-code-scan"></i> Subir QR</button>`
        : `<button class="btn btn-ghost btn-md" disabled><i class="bi bi-hourglass-split"></i> QR en revisión</button>`;
    } else if (lleno) {
      btnHtml = `<button class="btn btn-ghost btn-md" disabled><i class="bi bi-lock-fill"></i> Ronda llena</button>`;
    } else if (tieneCompPend) {
      btnHtml = `<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Pago en revisión</span>`;
    } else if (tieneCompAprobado && r.misBoletos > 0) {
      btnHtml = `<span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> ${r.misBoletos} boleto${r.misBoletos>1?"s":""}</span>
        <button class="btn btn-ghost btn-sm" onclick="modalComprarBoleto('${r.id}','${(r.game?.nombre||"").replace(/'/g,"\\'")}','${r.numero}',${r.game?.precio_boleto||0},${r.cupos})">
          <i class="bi bi-plus-circle"></i> Más
        </button>`;
    } else {
      const gratisTag = boletosGratis > 0 && !r.yoUseGratis
        ? `<span class="bdg bdg-free" style="margin-left:.3rem"><i class="bi bi-gift-fill"></i> Gratis disp.</span>` : "";
      btnHtml = `<button class="btn btn-red btn-md" onclick="modalComprarBoleto('${r.id}','${(r.game?.nombre||"").replace(/'/g,"\\'")}','${r.numero}',${r.game?.precio_boleto||0},${r.cupos})">
        <i class="bi bi-ticket-perforated-fill"></i> Participar
      </button>${gratisTag}`;
    }

    const activeBorder = estoyDentro ? "style='border-color:rgba(212,160,23,.45)'" : "";
    const topBadge = estoyDentro
      ? `<div class="si-active-badge"><i class="bi bi-person-fill-check"></i> Participando</div>` : "";

    return `<div class="sorteo-item" ${activeBorder}>
      ${topBadge}
      <div class="si-head">
        <div>
          <div class="si-nombre">${r.game?.nombre ?? "—"}</div>
          <div class="si-sub">Ronda #${r.numero}${r.game?.descripcion?" · "+r.game.descripcion:""}</div>
        </div>
        ${r.game?.precio_boleto>0 ? `<div class="si-precio">${fmtMoney(r.game.precio_boleto)}<span>/boleto</span></div>` : ""}
      </div>
      <div class="si-prog">
        <div class="prog-label">
          <span>Participantes</span>
          <span class="${lleno?"text-green":""}"><strong>${r.cupos}</strong>/25${lleno?" 🔒 LLENO":""}</span>
        </div>
        <div class="prog-bg"><div class="prog-fill${lleno?" full":""}" style="width:${Math.min(pct,100)}%"></div></div>
      </div>
      ${chances ? `<div class="chances-bar">
        <div class="cb-header"><span class="cb-label">Tu probabilidad</span><span class="cb-pct">${chances.chance}%</span></div>
        <div class="cb-track"><div class="cb-fill" style="width:${Math.min(chances.chance,100)}%"></div></div>
        <div class="cb-tier"><i class="bi bi-graph-up"></i> ${chances.descripcion}</div>
      </div>` : ""}
      ${gratisWarn}
      ${fondoWarn}
      <div class="si-foot">
        ${r.misBoletos>0 ? `<div class="mi-boletos"><i class="bi bi-ticket-perforated-fill"></i> Mis boletos: <strong>${r.misBoletos}</strong></div>` : "<div></div>"}
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">${btnHtml}</div>
      </div>
    </div>`;
  }).join("");
}

/* ═══════════════════════════════════════
   MODAL COMPRAR BOLETO
═══════════════════════════════════════ */
window.modalComprarBoleto = async (roundId, gameNombre, numRonda, precioBoleto, cuposActuales) => {
  if (!puedeParticipar()) { modalSubirQR(); return; }
  const cuposLibres = 25 - cuposActuales;
  const maxBoletos  = Math.min(cuposLibres, 5);
  if (maxBoletos <= 0) { toast("Esta ronda ya está llena", "error"); return; }

  const gratisStatus  = await estadoBoletoGratisEnRonda(roundId);
  const puedoUsarGratis = boletosGratis > 0 && !gratisStatus.yoUse;

  let competenciaHtml = "";
  if (puedoUsarGratis && gratisStatus.otrosConGratis > 0) {
    competenciaHtml = `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.28);border-radius:8px;padding:.65rem .9rem;margin-bottom:.85rem;font-size:.82rem;display:flex;align-items:center;gap:.6rem">
      <i class="bi bi-lightning-charge-fill" style="color:#f59e0b;flex-shrink:0"></i>
      <span style="color:#e6dcc8">${gratisStatus.otrosConGratis} jugador${gratisStatus.otrosConGratis>1?"es ya usan":"ya usa"} boleto gratis en este sorteo. <strong style="color:#fbbf24">¡Compite rápido!</strong></span>
    </div>`;
  }
  if (gratisStatus.yoUse) {
    competenciaHtml = `<div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.22);border-radius:8px;padding:.6rem .9rem;margin-bottom:.85rem;font-size:.82rem;color:#86efac;display:flex;align-items:center;gap:.5rem">
      <i class="bi bi-check-circle-fill"></i> Ya usaste tu boleto gratis en este sorteo.
    </div>`;
  }

  const fondoInfo    = await verificarFondoRonda(roundId);
  const fondoWarnHtml= fondoInfo.riesgo
    ? `<div class="fondo-warn" style="margin-bottom:.85rem"><i class="bi bi-exclamation-triangle-fill"></i>
        <span>Esta ronda tiene ${fondoInfo.boletosGratisEnRonda} boletos gratis. El fondo puede ser menor.</span>
       </div>` : "";

  const { value:v } = await Swal.fire({
    title:`Participar — ${gameNombre}`,
    html:`<div style="text-align:left;padding-right:.2rem">
      ${fondoWarnHtml}
      ${competenciaHtml}
      <div style="background:var(--ink3);border:1px solid var(--bord-g);border-radius:10px;padding:.7rem 1rem;margin-bottom:.85rem">
        <div style="font-family:'Oswald',sans-serif;font-size:.88rem;color:#fff">Ronda #${numRonda}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.1rem">${cuposLibres} cupo${cuposLibres!==1?"s":""} disponible${cuposLibres!==1?"s":""}</div>
      </div>
      ${puedoUsarGratis ? `
      <div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.22);border-radius:8px;padding:.7rem 1rem;margin-bottom:.7rem;display:flex;align-items:center;gap:.7rem">
        <i class="bi bi-gift-fill" style="color:#22c55e;font-size:1.1rem"></i>
        <div>
          <div style="font-size:.85rem;font-weight:600;color:#22c55e">Tienes ${boletosGratis} boleto${boletosGratis>1?"s":""} gratis</div>
          <div style="font-size:.75rem;color:var(--muted)">Máximo 1 por sorteo</div>
        </div>
      </div>
      <div style="margin-bottom:.85rem;display:flex;align-items:center;gap:.5rem;padding:.55rem .8rem;background:var(--ink3);border:1px solid var(--border);border-radius:8px;cursor:pointer"
        onclick="document.getElementById('usarGratis').click()">
        <input type="checkbox" id="usarGratis" style="accent-color:var(--green2);width:16px;height:16px">
        <label for="usarGratis" style="cursor:pointer;font-size:.88rem;color:var(--cream)">Usar 1 boleto gratis aquí</label>
      </div>` : ""}
      <div class="field" style="margin-bottom:.85rem">
        <label>Cantidad de boletos (máx. ${maxBoletos})</label>
        <div style="display:flex;align-items:center;gap:.6rem;margin-top:.3rem">
          <button type="button" id="btnMenos" style="width:34px;height:34px;border-radius:50%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="bi bi-dash"></i></button>
          <input id="bNum" type="number" min="1" max="${maxBoletos}" value="1"
            style="width:64px;text-align:center;font-family:'Oswald',sans-serif;font-size:1.2rem;font-weight:700;background:var(--ink3);border:1px solid var(--border);color:var(--gold2);border-radius:8px;padding:.4rem">
          <button type="button" id="btnMas" style="width:34px;height:34px;border-radius:50%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="bi bi-plus"></i></button>
        </div>
      </div>
      ${precioBoleto>0 ? `<div id="montoPreview" style="background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:8px;padding:.7rem;margin-bottom:.85rem;text-align:center">
        <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Total a pagar</div>
        <div id="montoPreviewVal" style="font-family:'Oswald',sans-serif;font-size:1.4rem;font-weight:700;color:var(--gold2)">${fmtMoney(precioBoleto)}</div>
        <div id="montoGratisNote" style="display:none;font-size:.72rem;color:#22c55e;margin-top:.2rem"><i class="bi bi-gift-fill"></i> 1 boleto gratis aplicado</div>
      </div>` : ""}
      <div id="pagoSection">
        <div class="field" style="margin-bottom:.75rem">
          <label>Método de pago *</label>
          <select id="bMetodo" style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.88rem">
            <option value="">— Seleccionar —</option>
            <option value="qr">QR / Tigo Money / Billetera</option>
            <option value="transferencia">Transferencia bancaria</option>
            <option value="yape">Yape</option>
            <option value="manual">Efectivo</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:.75rem">
          <label>Comprobante * <span style="font-size:.68rem;color:var(--muted);text-transform:none;font-weight:400">(JPG/PNG, máx. 5MB)</span></label>
          <input type="file" id="bComp" accept="image/*"
            style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem;font-size:.85rem">
          <img id="bPrev" style="display:none;width:100%;max-height:100px;object-fit:contain;margin-top:.5rem;border-radius:8px">
        </div>
        <div class="field">
          <label>Referencia / Nro. operación</label>
          <input id="bRef" placeholder="Opcional"
            style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.88rem">
        </div>
      </div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:"<i class='bi bi-send-fill'></i> Enviar",
    cancelButtonText:"Cancelar", width:520, ...swal$,
    didOpen:() => {
      const act = () => {
        const n   = parseInt(document.getElementById("bNum")?.value || 1);
        const ug  = document.getElementById("usarGratis")?.checked || false;
        const bap = ug ? Math.max(0, n-1) : n;
        const ev  = document.getElementById("montoPreviewVal");
        const nota= document.getElementById("montoGratisNote");
        const ps  = document.getElementById("pagoSection");
        if (ev && precioBoleto>0) ev.textContent = fmtMoney(precioBoleto * bap);
        if (nota) nota.style.display = ug ? "block" : "none";
        if (ps)   ps.style.display   = bap===0 ? "none" : "block";
      };
      document.getElementById("btnMenos").addEventListener("click", () => {
        const i = document.getElementById("bNum"); const v = parseInt(i.value||1); if (v>1) i.value=v-1; act();
      });
      document.getElementById("btnMas").addEventListener("click", () => {
        const i = document.getElementById("bNum"); const v = parseInt(i.value||1); if (v<maxBoletos) i.value=v+1; act();
      });
      document.getElementById("bNum").addEventListener("input", () => {
        const i = document.getElementById("bNum"); let v = parseInt(i.value);
        if (isNaN(v)||v<1) i.value=1; else if (v>maxBoletos) i.value=maxBoletos; act();
      });
      document.getElementById("usarGratis")?.addEventListener("change", act);
      document.getElementById("bComp")?.addEventListener("change", e => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = ev => { const i = document.getElementById("bPrev"); i.src = ev.target.result; i.style.display = "block"; };
        r.readAsDataURL(f);
      });
      if (precioBoleto===0) { const p = document.getElementById("pagoSection"); if (p) p.style.display = "none"; }
    },
    preConfirm:() => {
      const boletos      = parseInt(document.getElementById("bNum").value) || 1;
      const usarGratis   = (document.getElementById("usarGratis")?.checked || false) && puedoUsarGratis;
      const boletosAPagar= usarGratis ? Math.max(0, boletos-1) : boletos;
      const metodo       = document.getElementById("bMetodo")?.value;
      const file         = document.getElementById("bComp")?.files[0];
      const ref          = document.getElementById("bRef")?.value.trim();
      if (boletos<1||boletos>maxBoletos) {
        Swal.showValidationMessage(`Entre 1 y ${maxBoletos} boleto${maxBoletos>1?"s":""}`); return false;
      }
      if (precioBoleto>0 && boletosAPagar>0) {
        if (!metodo) { Swal.showValidationMessage("Selecciona el método de pago"); return false; }
        if (!file)   { Swal.showValidationMessage("Sube el comprobante de pago");  return false; }
        if (file.size > 5*1024*1024) { Swal.showValidationMessage("Imagen muy grande (máx. 5 MB)"); return false; }
      }
      return { boletos, usarGratis, boletosAPagar, metodo, file, ref };
    }
  });
  if (!v) return;

  loading$("Enviando…");

  // Marcar boleto gratis — solo del usuario actual
  if (v.usarGratis) {
    const { data:bgDisp } = await supabase
      .from("boletos_gratis").select("id")
      .eq("user_id", MY_USER_ID)   // ← siempre MY_USER_ID
      .eq("usado", false).limit(1);
    if (bgDisp?.length) {
      await supabase.from("boletos_gratis")
        .update({ usado:true, usado_en_round:roundId, usado_at:new Date().toISOString() })
        .eq("id", bgDisp[0].id)
        .eq("user_id", MY_USER_ID); // ← doble verificación
    }
  }

  let comprobante_url = null;
  if (v.boletosAPagar>0 && v.file) {
    try { comprobante_url = await uploadFile(v.file, "el-padrino/comprobantes"); }
    catch { Swal.close(); ok$("Error al subir imagen", "", "error"); return; }
  }

  const { error:payError } = await supabase.from("payments").insert({
    user_id:    MY_USER_ID,    // ← siempre MY_USER_ID
    round_id:   roundId,
    metodo:     v.boletosAPagar===0 ? "gratis" : (v.metodo||"manual"),
    monto:      precioBoleto * v.boletosAPagar || 0,
    estado:     "pendiente",
    comprobante_url,
    referencia: v.boletosAPagar===0 ? "Boleto gratis" : (v.ref||null),
    boletos_solicitados: v.boletos,
  });

  if (payError) { Swal.close(); ok$("Error al registrar pago", payError.message, "error"); return; }

  await refreshProfile();
  initUserUI(currentProfile);
  Swal.close();

  await Swal.fire({
    title:"¡Listo! Comprobante enviado",
    html:`El admin revisará y confirmará tus <strong style="color:var(--gold2)">${v.boletos} boleto${v.boletos>1?"s":""}${v.usarGratis?" (incluye 1 gratis)":""}</strong>.`,
    icon:"success", confirmButtonText:"OK", ...swal$
  });
  loadSorteos();
};

/* ═══════════════════════════════════════
   MI HISTORIAL
═══════════════════════════════════════ */
async function loadHistorial() {
  const el = getEl("historialList"); if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data:parts, error } = await supabase
    .from("participations")
    .select("id,boletos,resultado,lugar,es_gratis,created_at,round_id")
    .eq("user_id", MY_USER_ID)   // ← solo mis participaciones
    .order("created_at", {ascending:false});

  if (error || !parts?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-clock-history"></i><p>Aún no has participado en ningún sorteo.</p></div>`;
    return;
  }

  const roundIds = [...new Set(parts.map(p=>p.round_id).filter(Boolean))];
  let roundsMap = {};
  if (roundIds.length) {
    const { data:rd } = await supabase
      .from("rounds")
      .select("id,numero,game_id,caso_sorteo,estado,ganador_id,ganador2_id,ganador3_id,sorteado_at")
      .in("id", roundIds);
    const gameIds = [...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm = {};
    if (gameIds.length) {
      const { data:gd } = await supabase.from("games").select("id,nombre").in("id", gameIds);
      (gd||[]).forEach(g => { gm[g.id] = g; });
    }
    (rd||[]).forEach(r => { roundsMap[r.id] = { ...r, game:gm[r.game_id] }; });
  }

  const enriched = parts.map(p => ({
    ...p,
    gameName:   roundsMap[p.round_id]?.game?.nombre || "Sorteo",
    roundNum:   roundsMap[p.round_id]?.numero       || "—",
    roundEstado:roundsMap[p.round_id]?.estado       || "abierta",
    ganador_id: roundsMap[p.round_id]?.ganador_id   || null,
    ganador2_id:roundsMap[p.round_id]?.ganador2_id  || null,
    ganador3_id:roundsMap[p.round_id]?.ganador3_id  || null,
    sorteado_at:roundsMap[p.round_id]?.sorteado_at  || null,
  }));

  const juegosUnicos = [...new Set(enriched.map(e=>e.gameName))].sort();

  const resBdg = p => {
    if (p.resultado==="ganada") {
      const trofeo = p.lugar===1?'🥇':p.lugar===2?'🥈':'🥉';
      return `<span class="bdg bdg-win"><i class="bi bi-trophy-fill"></i> ${trofeo} Ganaste</span>`;
    }
    if (p.resultado==="perdida") return `<span class="bdg bdg-bad"><i class="bi bi-x-circle"></i> Sin suerte</span>`;
    return `<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> En curso</span>`;
  };

  const verGanadoresBtn = p => p.roundEstado==="sorteada"
    ? `<button class="btn btn-ghost btn-sm" style="margin-top:.3rem" onclick="modalVerGanadores('${p.round_id}')">
        <i class="bi bi-eye"></i> Ver ganadores
       </button>` : "";

  const renderItem = p => `
    <div class="list-item">
      <div class="li-icon ${p.resultado==="ganada"?"ic-win":p.resultado==="perdida"?"ic-bad":"ic-pend"}">
        <i class="bi bi-ticket-perforated-fill"></i>
      </div>
      <div class="li-body">
        <div class="li-title">${p.gameName} · Ronda ${p.roundNum}</div>
        <div class="li-sub" style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap">
          <span>${p.boletos||1} boleto${(p.boletos||1)!==1?"s":""}</span>
          ${p.es_gratis===true ? `<span class="bdg bdg-free" style="font-size:.6rem"><i class="bi bi-gift-fill"></i> gratis</span>` : ""}
          <span style="color:var(--dim)">·</span>
          <span>${fmtDateShort(p.created_at)}</span>
        </div>
      </div>
      <div class="li-right">
        ${resBdg(p)}
        ${verGanadoresBtn(p)}
      </div>
    </div>`;

  el.innerHTML = `
    ${buildFilterBar({
      searchId:"hBuscar", searchPlaceholder:"Buscar sorteo…",
      chips:[
        {id:"hResultado", options:[{value:"",label:"Todos"},{value:"ganada",label:"🏆 Ganadas"},{value:"perdida",label:"❌ Perdidas"},{value:"pendiente",label:"⏳ En curso"}]},
        {id:"hJuego",     options:[{value:"",label:"Juego"},{value:"_gratis",label:"🎁 Gratis"},...juegosUnicos.map(j=>({value:j,label:j}))]},
      ],
      sortId:"hOrden", countId:"hCount",
    })}
    <div id="hItems" class="item-list"></div>`;

  const render = () => {
    const q      = getEl("hBuscar")?.value.trim().toLowerCase() || "";
    const res    = getEl("hResultado")?.value || "";
    const juego  = getEl("hJuego")?.value     || "";
    const orden  = getEl("hOrden")?.value     || "desc";
    let f = enriched.filter(p => {
      if (q && !`${p.gameName} ronda ${p.roundNum}`.toLowerCase().includes(q)) return false;
      if (res && p.resultado !== res) return false;
      if (juego=="_gratis" && p.es_gratis!==true) return false;
      else if (juego && juego!="_gratis" && p.gameName!==juego) return false;
      return true;
    });
    if (orden==="asc") f = [...f].reverse();
    getEl("hItems").innerHTML = f.length ? f.map(renderItem).join("") : emptyFilter();
    setCount("hCount", f.length, enriched.length);
  };
  render();
  ["hBuscar","hResultado","hJuego","hOrden"].forEach(id => {
    getEl(id)?.addEventListener("input",  render);
    getEl(id)?.addEventListener("change", render);
  });
}

/* ── Modal Ver Ganadores ── */
window.modalVerGanadores = async (roundId) => {
  loading$("Cargando resultados…");
  const { data:round } = await supabase
    .from("rounds")
    .select("numero,sorteado_at,caso_sorteo,game_id,ganador_id,ganador2_id,ganador3_id")
    .eq("id", roundId).single();
  const { data:game } = round?.game_id
    ? await supabase.from("games").select("nombre").eq("id", round.game_id).single()
    : { data:null };

  // Solo traer username (no datos sensibles) de los ganadores
  const ids = [round?.ganador_id, round?.ganador2_id, round?.ganador3_id].filter(Boolean);
  let usersMap = {};
  if (ids.length) {
    const { data:profs } = await supabase
      .from("profiles").select("id,username").in("id", ids);
    (profs||[]).forEach(p => { usersMap[p.id] = p.username; });
  }
  Swal.close();

  const g1 = round?.ganador_id  ? usersMap[round.ganador_id]  || "—" : null;
  const g2 = round?.ganador2_id ? usersMap[round.ganador2_id] || "—" : null;
  const g3 = round?.ganador3_id ? usersMap[round.ganador3_id] || "—" : null;

  Swal.fire({
    title:`${game?.nombre||"Sorteo"} · Ronda #${round?.numero||"—"}`,
    html:`
      <div style="display:flex;flex-direction:column;gap:.6rem;margin:1rem 0">
        ${g1?`<div style="display:flex;align-items:center;gap:.75rem;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.28);border-radius:10px;padding:.75rem 1rem">
          <span style="font-size:1.4rem">🥇</span>
          <div><div style="font-family:'Oswald',sans-serif;font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em">1er lugar</div>
          <div style="font-size:1.05rem;font-weight:600;color:#fff">${g1}</div></div>
        </div>`:""}
        ${g2?`<div style="display:flex;align-items:center;gap:.75rem;background:rgba(156,163,175,.07);border:1px solid rgba(156,163,175,.2);border-radius:10px;padding:.75rem 1rem">
          <span style="font-size:1.4rem">🥈</span>
          <div><div style="font-family:'Oswald',sans-serif;font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em">2do lugar</div>
          <div style="font-size:1.05rem;font-weight:600;color:#fff">${g2}</div></div>
        </div>`:""}
        ${g3?`<div style="display:flex;align-items:center;gap:.75rem;background:rgba(180,83,9,.07);border:1px solid rgba(180,83,9,.2);border-radius:10px;padding:.75rem 1rem">
          <span style="font-size:1.4rem">🥉</span>
          <div><div style="font-family:'Oswald',sans-serif;font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em">3er lugar</div>
          <div style="font-size:1.05rem;font-weight:600;color:#fff">${g3}</div></div>
        </div>`:""}
      </div>
      ${round?.sorteado_at ? `<div style="font-size:.78rem;color:var(--muted);text-align:center">Sorteado el ${fmtDateShort(round.sorteado_at)}</div>` : ""}`,
    icon:"info", confirmButtonText:"Cerrar", ...swal$, width:400,
  });
};

/* ═══════════════════════════════════════
   MIS PAGOS
═══════════════════════════════════════ */
async function loadPagos() {
  const el = getEl("pagosList"); if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data:pays, error } = await supabase
    .from("payments")
    .select("id,monto,metodo,estado,boletos_solicitados,comprobante_url,created_at,round_id,referencia")
    .eq("user_id", MY_USER_ID)   // ← solo mis pagos
    .order("created_at", {ascending:false});

  if (error || !pays?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-receipt"></i><p>No has realizado pagos aún.</p></div>`;
    return;
  }

  const roundIds = [...new Set(pays.map(p=>p.round_id).filter(Boolean))];
  let roundsMap = {};
  if (roundIds.length) {
    const { data:rd } = await supabase.from("rounds").select("id,numero,game_id").in("id", roundIds);
    const gIds = [...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm = {};
    if (gIds.length) {
      const { data:gd } = await supabase.from("games").select("id,nombre").in("id", gIds);
      (gd||[]).forEach(g => { gm[g.id] = g; });
    }
    (rd||[]).forEach(r => { roundsMap[r.id] = { ...r, game:gm[r.game_id] }; });
  }

  const ml = m => ({qr:"QR",transferencia:"Transf.",yape:"Yape",manual:"Efectivo",gratis:"🎁 Gratis"})[m] || m || "—";
  const esBadge = e => {
    if (e==="aprobado")  return `<span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> OK</span>`;
    if (e==="rechazado") return `<span class="bdg bdg-bad"><i class="bi bi-x-circle-fill"></i> Rechazado</span>`;
    return `<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Revisión</span>`;
  };

  const enriched = pays.map(p => ({
    ...p,
    gameName: roundsMap[p.round_id]?.game?.nombre || "Sorteo",
    roundNum: roundsMap[p.round_id]?.numero       || "—",
    esGratis: p.metodo === "gratis",
  }));
  const juegosUnicos = [...new Set(enriched.map(e=>e.gameName))].sort();

  const renderItem = p => `
    <div class="list-item">
      <div class="li-icon ${p.estado==="aprobado"?"ic-win":p.estado==="rechazado"?"ic-bad":"ic-pend"}">
        <i class="bi bi-receipt"></i>
      </div>
      <div class="li-body">
        <div class="li-title">${p.gameName} · Ronda ${p.roundNum}</div>
        <div class="li-sub">${p.boletos_solicitados||1} boleto${(p.boletos_solicitados||1)!==1?"s":""} · ${ml(p.metodo)} · ${fmtDateShort(p.created_at)}</div>
      </div>
      <div class="li-right">
        <div class="li-amount">${p.esGratis?'<span class="bdg bdg-free"><i class="bi bi-gift-fill"></i> Gratis</span>':fmtMoney(p.monto)}</div>
        ${esBadge(p.estado)}
        ${p.comprobante_url&&!p.esGratis ? `<button class="btn btn-ghost btn-sm" style="margin-top:.25rem" onclick="window.open('${p.comprobante_url}','_blank')"><i class="bi bi-image"></i></button>` : ""}
      </div>
    </div>`;

  el.innerHTML = `
    ${buildFilterBar({
      searchId:"pBuscar", searchPlaceholder:"Buscar…",
      chips:[
        {id:"pEstado", options:[{value:"",label:"Estado"},{value:"aprobado",label:"✅ OK"},{value:"pendiente",label:"⏳ Revisión"},{value:"rechazado",label:"❌ Rechazado"}]},
        {id:"pMetodo", options:[{value:"",label:"Método"},{value:"qr",label:"QR"},{value:"transferencia",label:"Transf."},{value:"yape",label:"Yape"},{value:"manual",label:"Efectivo"},{value:"gratis",label:"🎁 Gratis"}]},
        {id:"pJuego",  options:[{value:"",label:"Juego"},...juegosUnicos.map(j=>({value:j,label:j}))]},
      ],
      sortId:"pOrden", countId:"pCount",
    })}
    <div id="pItems" class="item-list"></div>`;

  const render = () => {
    const q      = getEl("pBuscar")?.value.trim().toLowerCase() || "";
    const estado = getEl("pEstado")?.value || "";
    const metodo = getEl("pMetodo")?.value || "";
    const juego  = getEl("pJuego")?.value  || "";
    const orden  = getEl("pOrden")?.value  || "desc";
    let f = enriched.filter(p => {
      if (q && !`${p.gameName} ronda ${p.roundNum} ${p.referencia||""}`.toLowerCase().includes(q)) return false;
      if (estado && p.estado  !== estado) return false;
      if (metodo && p.metodo  !== metodo) return false;
      if (juego  && p.gameName!== juego)  return false;
      return true;
    });
    if (orden==="asc") f = [...f].reverse();
    const totalVis = f.filter(p=>p.estado==="aprobado"&&!p.esGratis).reduce((s,p)=>s+Number(p.monto||0),0);
    getEl("pItems").innerHTML = f.length
      ? f.map(renderItem).join("") + (f.some(p=>p.estado==="aprobado"&&!p.esGratis)
          ? `<div class="fc-total"><i class="bi bi-calculator"></i> Aprobado: <strong>${fmtMoney(totalVis)}</strong></div>` : "")
      : emptyFilter();
    setCount("pCount", f.length, enriched.length);
  };
  render();
  ["pBuscar","pEstado","pMetodo","pJuego","pOrden"].forEach(id => {
    getEl(id)?.addEventListener("input",  render);
    getEl(id)?.addEventListener("change", render);
  });
}

/* ═══════════════════════════════════════
   MIS PREMIOS
═══════════════════════════════════════ */
async function loadPremios() {
  const el = getEl("premiosList"); if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data:premiosData, error } = await supabase
    .from("prize_payments")
    .select("id,monto,metodo,referencia,notas,estado,lugar,created_at,round_id")
    .eq("user_id", MY_USER_ID)   // ← solo mis premios
    .order("created_at", {ascending:false});

  if (error || !premiosData?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-cash-coin"></i><p>Aún no has recibido premios.<br><small>¡Participa y gana!</small></p></div>`;
    return;
  }

  const roundIds = [...new Set(premiosData.map(p=>p.round_id).filter(Boolean))];
  let roundsMap = {};
  if (roundIds.length) {
    const { data:rd } = await supabase.from("rounds").select("id,numero,game_id").in("id", roundIds);
    const gIds = [...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm = {};
    if (gIds.length) {
      const { data:gd } = await supabase.from("games").select("id,nombre").in("id", gIds);
      (gd||[]).forEach(g => { gm[g.id] = g; });
    }
    (rd||[]).forEach(r => { roundsMap[r.id] = { ...r, game:gm[r.game_id] }; });
  }

  const totalGanado = premiosData.reduce((s,p) => s+Number(p.monto||0), 0);
  const ll = l => l===1?'🥇':l===2?'🥈':'🥉';

  const enriched = premiosData.map(p => ({
    ...p,
    gameName: roundsMap[p.round_id]?.game?.nombre || "Sorteo",
    roundNum: roundsMap[p.round_id]?.numero       || "—",
  }));
  const juegosUnicos = [...new Set(enriched.map(e=>e.gameName))].sort();

  const renderItem = p => `
    <div class="list-item">
      <div class="li-icon ic-win"><span style="font-size:1.1rem">${ll(p.lugar)}</span></div>
      <div class="li-body">
        <div class="li-title">${p.gameName} · Ronda ${p.roundNum}</div>
        <div class="li-sub">${p.metodo==="qr"?"QR":"Efectivo"}${p.referencia?" · "+p.referencia:""}${p.notas?" — "+p.notas:""} · ${fmtDateShort(p.created_at)}</div>
      </div>
      <div class="li-right">
        <div class="li-amount" style="color:#22c55e">+${fmtMoney(p.monto)}</div>
        <span class="bdg bdg-ok" style="font-size:.62rem"><i class="bi bi-check-circle-fill"></i> Recibido</span>
      </div>
    </div>`;

  el.innerHTML = `
    <div class="premios-resumen">
      <div class="pr-box">
        <div class="pr-ico"><i class="bi bi-trophy-fill"></i></div>
        <div><div class="pr-val">${premiosData.length}</div><div class="pr-lbl">Premios</div></div>
      </div>
      <div class="pr-box">
        <div class="pr-ico" style="color:var(--green2)"><i class="bi bi-cash-stack"></i></div>
        <div><div class="pr-val" style="color:var(--green2)">${fmtMoney(totalGanado)}</div><div class="pr-lbl">Total ganado</div></div>
      </div>
    </div>
    ${buildFilterBar({
      searchId:"prBuscar", searchPlaceholder:"Buscar…",
      chips:[
        {id:"prLugar", options:[{value:"",label:"Lugar"},{value:"1",label:"🥇 1ro"},{value:"2",label:"🥈 2do"},{value:"3",label:"🥉 3ro"}]},
        {id:"prJuego", options:[{value:"",label:"Juego"},...juegosUnicos.map(j=>({value:j,label:j}))]},
      ],
      sortId:"prOrden", countId:"prCount",
    })}
    <div id="prItems" class="item-list"></div>`;

  const render = () => {
    const q     = getEl("prBuscar")?.value.trim().toLowerCase() || "";
    const lugar = getEl("prLugar")?.value || "";
    const juego = getEl("prJuego")?.value || "";
    const orden = getEl("prOrden")?.value || "desc";
    let f = enriched.filter(p => {
      if (q && !`${p.gameName} ronda ${p.roundNum} ${p.referencia||""} ${p.notas||""}`.toLowerCase().includes(q)) return false;
      if (lugar && String(p.lugar) !== lugar) return false;
      if (juego && p.gameName !== juego) return false;
      return true;
    });
    if (orden==="asc") f = [...f].reverse();
    const totalVis = f.reduce((s,p) => s+Number(p.monto||0), 0);
    getEl("prItems").innerHTML = f.length
      ? f.map(renderItem).join("") + `<div class="fc-total"><i class="bi bi-calculator"></i> Total visible: <strong style="color:#22c55e">${fmtMoney(totalVis)}</strong></div>`
      : emptyFilter();
    setCount("prCount", f.length, enriched.length);
  };
  render();
  ["prBuscar","prLugar","prJuego","prOrden"].forEach(id => {
    getEl(id)?.addEventListener("input",  render);
    getEl(id)?.addEventListener("change", render);
  });
}

/* ═══════════════════════════════════════
   MIS REFERIDOS
═══════════════════════════════════════ */
async function loadReferidos() {
  const el = getEl("referidosList"); if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const codigoRef = currentProfile.codigo_referido || await generarCodigoReferido();
  const refLink   = `${window.location.origin}/ElJuegoDelPadrino/auth/registro.html?ref=${codigoRef}`;

  const { data:refs } = await supabase
    .from("referidos")
    .select("id,referido_id,estado,creado_at,boleto_otorgado,boletos_pagados,profiles!referido_id(username)")
    .eq("referidor_id", MY_USER_ID)   // ← solo mis referidos
    .order("creado_at", {ascending:false});

  const allRefs     = refs || [];
  const totalRefs   = allRefs.length;
  const refsActivos = allRefs.filter(r=>r.estado==="completado").length;
  const boletosGanados= allRefs.filter(r=>r.boleto_otorgado).length;

  const esBadge = r => {
    if (r.estado==="completado") return `<span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> Activo</span>`;
    if (r.estado==="pendiente")  return `<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> ${r.boletos_pagados||0}/3</span>`;
    return `<span class="bdg bdg-bad">Inactivo</span>`;
  };

  const renderRef = r => `
    <div class="list-item">
      <div class="li-icon ic-ref"><i class="bi bi-person-fill"></i></div>
      <div class="li-body">
        <div class="li-title">${r.profiles?.username||"Usuario"}</div>
        <div class="li-sub">${fmtDateShort(r.creado_at)}${r.boleto_otorgado?` · <span style="color:#4ade80"><i class="bi bi-gift-fill"></i> Boleto otorgado</span>`:""}</div>
      </div>
      <div class="li-right">${esBadge(r)}</div>
    </div>`;

  el.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-share-fill"></i>Tu código de invitación</div></div>
      <div class="panel-body">
        <div class="ref-code-box">
          <div>
            <div class="ref-code">${codigoRef}</div>
            <div class="ref-link">${refLink}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.4rem">
            <button class="btn btn-gold btn-sm" onclick="copiarCodigo('${codigoRef}')"><i class="bi bi-copy"></i> Código</button>
            <button class="btn btn-ghost btn-sm" onclick="copiarLink('${refLink}')"><i class="bi bi-link-45deg"></i> Link</button>
          </div>
        </div>
        <div style="background:rgba(212,160,23,.05);border:1px solid rgba(212,160,23,.15);border-radius:9px;padding:.75rem 1rem;font-size:.82rem;color:var(--muted)">
          <strong style="color:var(--cream);display:block;margin-bottom:.3rem"><i class="bi bi-info-circle" style="color:var(--gold2)"></i> ¿Cómo funciona?</strong>
          <ul style="padding-left:1rem;line-height:1.8">
            <li>Tu amigo se registra con tu código o link</li>
            <li>Cuando el admin confirme <strong style="color:var(--cream)">3 boletos pagados</strong>, recibes <strong style="color:#22c55e">1 boleto gratis</strong> automáticamente</li>
            <li>Solo puedes usar <strong style="color:var(--cream)">1 boleto gratis por sorteo</strong></li>
            <li>¡Compite! Si alguien más tiene boleto gratis en el mismo sorteo, el primero en entrar se queda</li>
          </ul>
        </div>
      </div>
    </div>
    <div class="ref-stats-row">
      <div class="ref-stat"><div class="ref-stat-val">${totalRefs}</div><div class="ref-stat-lbl">Invitados</div></div>
      <div class="ref-stat"><div class="ref-stat-val" style="color:#22c55e">${refsActivos}</div><div class="ref-stat-lbl">Activos</div></div>
      <div class="ref-stat"><div class="ref-stat-val" style="color:var(--gold2)">${boletosGanados}</div><div class="ref-stat-lbl">Boletos ganados</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-person-lines-fill"></i>Mis invitados</div></div>
      <div class="panel-body" style="padding:.6rem">
        ${!totalRefs
          ? `<div class="empty" style="padding:1.5rem"><i class="bi bi-people"></i>
              <p>Aún no has invitado a nadie.<br><small>Comparte tu código y gana boletos gratis.</small></p>
             </div>`
          : `${buildFilterBar({
              searchId:"refBuscar", searchPlaceholder:"Buscar usuario…",
              chips:[
                {id:"refEstado", options:[{value:"",label:"Estado"},{value:"completado",label:"✅ Activos"},{value:"pendiente",label:"⏳ Pendientes"},{value:"inactivo",label:"❌ Inactivos"}]},
                {id:"refBoleto", options:[{value:"",label:"Boleto"},{value:"si",label:"🎁 Con boleto"},{value:"no",label:"Sin boleto"}]},
              ],
              countId:"refCount",
            })}
            <div id="refItems"></div>`
        }
      </div>
    </div>`;

  if (!totalRefs) return;

  const renderRefs = () => {
    const q      = getEl("refBuscar")?.value.trim().toLowerCase() || "";
    const estado = getEl("refEstado")?.value || "";
    const boleto = getEl("refBoleto")?.value || "";
    let f = allRefs.filter(r => {
      if (q && !(r.profiles?.username||"").toLowerCase().includes(q)) return false;
      if (estado && r.estado !== estado) return false;
      if (boleto==="si" && !r.boleto_otorgado) return false;
      if (boleto==="no" &&  r.boleto_otorgado) return false;
      return true;
    });
    getEl("refItems").innerHTML = f.length
      ? `<div class="item-list">${f.map(renderRef).join("")}</div>`
      : emptyFilter("Ningún referido coincide");
    setCount("refCount", f.length, allRefs.length);
  };
  renderRefs();
  ["refBuscar","refEstado","refBoleto"].forEach(id => {
    getEl(id)?.addEventListener("input",  renderRefs);
    getEl(id)?.addEventListener("change", renderRefs);
  });
}

async function generarCodigoReferido() {
  const base  = (currentProfile.username||"USR").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);
  const rand  = Math.random().toString(36).slice(2,6).toUpperCase();
  const ts    = Date.now().toString(36).slice(-2).toUpperCase();
  const codigo= `${base}${rand}${ts}`;
  const { error } = await supabase
    .from("profiles").update({ codigo_referido:codigo })
    .eq("id", MY_USER_ID);   // ← solo mi perfil
  if (!error) currentProfile.codigo_referido = codigo;
  return codigo;
}
window.copiarCodigo = async c => { try { await navigator.clipboard.writeText(c); } catch {} toast("Código copiado","success"); };
window.copiarLink   = async l => { try { await navigator.clipboard.writeText(l); } catch {} toast("Link copiado","success");  };

/* ═══════════════════════════════════════
   FIDELIDAD
═══════════════════════════════════════ */
async function loadFidelidad() {
  const el = getEl("fidelidadContent"); if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  // Todas las queries filtradas por MY_USER_ID
  const { data:parts } = await supabase
    .from("participations").select("boletos")
    .eq("user_id", MY_USER_ID);
  const { data:pays } = await supabase
    .from("payments").select("estado,monto")
    .eq("user_id", MY_USER_ID);
  const { data:refs } = await supabase
    .from("referidos").select("estado")
    .eq("referidor_id", MY_USER_ID);

  const totalBoletos  = (parts||[]).reduce((s,p) => s+(p.boletos||1), 0);
  const totalAprobados= (pays||[]).filter(p=>p.estado==="aprobado").length;
  const totalGastado  = (pays||[]).filter(p=>p.estado==="aprobado").reduce((s,p) => s+Number(p.monto||0), 0);
  const refsActivos   = (refs||[]).filter(r=>r.estado==="completado").length;
  const nivel         = getNivel(totalBoletos);

  const { data:bgsDisp } = await supabase
    .from("boletos_gratis").select("id,origen,created_at")
    .eq("user_id", MY_USER_ID)   // ← solo mis boletos gratis
    .eq("usado", false);
  const bgsTotal = bgsDisp?.length || 0;

  const promos = [
    { id:"decena",    nombre:"Décimo jugador",   desc:"Compra 10 boletos pagados y recibe 1 boleto gratis.",         icono:"bi-stack",            requerido:10, progreso:Math.min(totalAprobados,10),  desbloqueada:totalAprobados>=10,  limitacion:"Por cada 10 boletos" },
    { id:"fiel25",    nombre:"El fiel",          desc:"Participa en 25 sorteos y recibe 2 boletos gratis.",          icono:"bi-patch-star-fill",   requerido:25, progreso:Math.min(totalBoletos,25),   desbloqueada:totalBoletos>=25,    limitacion:"Solo una vez"        },
    { id:"gastador50",nombre:"El Patrón",        desc:"Acumula Bs 50 en compras y recibe 1 boleto gratis.",          icono:"bi-bank2",             requerido:50, progreso:Math.min(totalGastado,50),   desbloqueada:totalGastado>=50,    limitacion:"Por cada Bs 50"      },
    { id:"racha3",    nombre:"Racha ganadora",   desc:"Invita 3 amigos que compren boletos y recibe 2 gratis.",      icono:"bi-lightning-fill",    requerido:3,  progreso:Math.min(refsActivos,3),     desbloqueada:refsActivos>=3,      limitacion:"Cada 3 referidos"    },
  ];

  el.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-shield-fill-check"></i>Tu nivel</div></div>
      <div class="panel-body" style="display:flex;align-items:center;gap:1rem">
        <div style="font-size:2rem;color:var(--gold2)"><i class="bi bi-person-badge-fill"></i></div>
        <div>
          <div style="font-family:'Oswald',sans-serif;font-size:1.1rem;font-weight:700;color:#fff">${nivel.label}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.1rem">${totalBoletos} boleto${totalBoletos!==1?"s":""} jugados</div>
          <div class="nivel-badge ${nivel.clase}" style="margin-top:.35rem"><i class="bi bi-star-fill"></i> ${nivel.label}</div>
        </div>
      </div>
    </div>
    ${bgsTotal>0 ? `<div class="boleto-gratis-banner">
      <i class="bi bi-gift-fill bfb-icon"></i>
      <div>
        <div class="bfb-title">${bgsTotal} boleto${bgsTotal>1?"s":""} gratis disponible${bgsTotal>1?"s":""}</div>
        <div class="bfb-sub">Solo 1 por sorteo. ¡Compite rápido!</div>
      </div>
    </div>` : ""}
    <div style="background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.18);border-radius:10px;padding:.8rem 1rem;margin-bottom:1.2rem;font-size:.82rem;color:var(--muted)">
      <strong style="color:#fff;display:block;margin-bottom:.3rem">
        <i class="bi bi-shield-exclamation" style="color:#f59e0b"></i> Sobre los boletos gratis
      </strong>
      Solo 1 boleto gratis por sorteo. Si alguien más ya tiene boleto gratis en un sorteo, te avisamos. El fondo de premios puede ser menor si hay muchos boletos gratis en una ronda.
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-stars"></i>Promociones</div></div>
      <div class="panel-body" style="padding:.6rem">
        <div class="promo-grid">
          ${promos.map(p=>`
          <div class="promo-card ${p.desbloqueada?"promo-activa":""}">
            <div class="promo-icon"><i class="bi ${p.icono}"></i></div>
            <div class="promo-nombre">${p.nombre}</div>
            <div class="promo-desc">${p.desc}</div>
            <div class="promo-progreso">
              <div class="promo-prog-label">
                <span>${p.progreso}/${p.requerido}</span>
                <span>${p.desbloqueada?'<span style="color:#22c55e">✓ Lista</span>':'En progreso'}</span>
              </div>
              <div class="promo-prog-bar">
                <div class="promo-prog-fill" style="width:${Math.min((p.progreso/p.requerido)*100,100)}%"></div>
              </div>
              <div style="font-size:.68rem;color:var(--dim);margin-top:.25rem">${p.limitacion}</div>
            </div>
            ${p.desbloqueada ? `<div class="promo-tag"><span class="bdg bdg-ok" style="font-size:.58rem"><i class="bi bi-check-circle-fill"></i> Activa</span></div>` : ""}
          </div>`).join("")}
        </div>
      </div>
    </div>
    ${bgsDisp?.length ? `
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-gift-fill"></i>Boletos gratis disponibles</div></div>
      <div class="panel-body" style="padding:.6rem">
        <div class="item-list">
          ${bgsDisp.map(b=>`
          <div class="list-item">
            <div class="li-icon ic-win"><i class="bi bi-gift-fill"></i></div>
            <div class="li-body">
              <div class="li-title">Boleto gratis</div>
              <div class="li-sub">${b.origen||"Promoción"} · ${fmtDateShort(b.created_at)}</div>
            </div>
            <div class="li-right"><span class="bdg bdg-free"><i class="bi bi-ticket-perforated-fill"></i> Disp.</span></div>
          </div>`).join("")}
        </div>
      </div>
    </div>` : ""}`;
}

/* ═══════════════════════════════════════
   MI PERFIL
═══════════════════════════════════════ */
async function loadPerfil() {
  const el = getEl("perfilContent"); if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const prof = await refreshProfile();
  qrState = {
    subido:    !!prof.qr_cobro_url,
    verificado:!!prof.qr_verificado,
    url:       prof.qr_cobro_url || null,
    metodo:    prof.qr_metodo    || null,
    subidoAt:  prof.qr_subido_at || null,
  };
  initUserUI(prof);

  // Todas filtradas por MY_USER_ID en paralelo
  const [{ data:parts },{ data:pays },{ data:premios },{ data:refs }] = await Promise.all([
    supabase.from("participations").select("id,resultado,boletos,es_gratis").eq("user_id", MY_USER_ID),
    supabase.from("payments").select("id,estado,monto").eq("user_id", MY_USER_ID),
    supabase.from("prize_payments").select("id,monto").eq("user_id", MY_USER_ID),
    supabase.from("referidos").select("id,estado").eq("referidor_id", MY_USER_ID),
  ]);

  const totalBoletos   = (parts||[]).reduce((s,p) => s+(p.boletos||1), 0);
  const totalBoltGratis= (parts||[]).filter(p=>p.es_gratis===true).reduce((s,p) => s+(p.boletos||0), 0);
  const totalGanados   = (parts||[]).filter(p=>p.resultado==="ganada").length;
  const totalGastado   = (pays||[]).filter(p=>p.estado==="aprobado"&&p.monto>0).reduce((s,p) => s+Number(p.monto||0), 0);
  const totalGanado    = (premios||[]).reduce((s,p) => s+Number(p.monto||0), 0);
  const totalPremios   = (premios||[]).length;
  const totalRefs      = (refs||[]).length;
  const refsActivos    = (refs||[]).filter(r=>r.estado==="completado").length;
  const nivel          = getNivel(totalBoletos);
  const ini            = (prof?.username?.[0]||"?").toUpperCase();
  const memberSince    = prof?.created_at ? fmtDateShort(prof.created_at) : "—";
  const mlM            = { tigo_money:"Tigo Money", billetera_bcb:"Billetera BCB", qr_simple:"QR Simple", efectivo_cuenta:"Cuenta bancaria" };
  const tasaVictoria   = parts?.length ? Math.round((totalGanados/parts.length)*100) : 0;

  el.innerHTML = `
    <div class="panel perfil-card">
      <div class="perfil-header">
        <div class="perfil-avatar-wrap"><div class="perfil-avatar">${ini}</div></div>
        <div class="perfil-info">
          <div class="perfil-username">${prof?.username ?? "—"}</div>
          <div class="perfil-email"><i class="bi bi-envelope"></i> ${user.email ?? "—"}</div>
          <div class="perfil-since"><i class="bi bi-calendar3"></i> Desde ${memberSince}</div>
          <div class="nivel-badge ${nivel.clase}" style="margin-top:.4rem"><i class="bi bi-star-fill"></i> ${nivel.label}</div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-bar-chart-fill"></i>Mis estadísticas</div></div>
      <div class="panel-body">
        <div class="stats-grid">
          <div class="stat-box"><div class="stat-val">${totalBoletos}</div><div class="stat-lbl"><i class="bi bi-ticket-perforated"></i> Boletos</div></div>
          <div class="stat-box stat-win"><div class="stat-val">${totalGanados}</div><div class="stat-lbl"><i class="bi bi-trophy"></i> Ganados</div></div>
          <div class="stat-box"><div class="stat-val">${fmtMoney(totalGastado)}</div><div class="stat-lbl"><i class="bi bi-arrow-up-circle"></i> Invertido</div></div>
          <div class="stat-box stat-gold"><div class="stat-val">${fmtMoney(totalGanado)}</div><div class="stat-lbl"><i class="bi bi-cash-stack"></i> Ganado</div></div>
          <div class="stat-box"><div class="stat-val">${totalRefs}</div><div class="stat-lbl"><i class="bi bi-people"></i> Referidos</div></div>
          <div class="stat-box stat-win"><div class="stat-val">${boletosGratis}</div><div class="stat-lbl"><i class="bi bi-gift"></i> Gratis disp.</div></div>
        </div>
        ${totalBoletos>0 ? `<div style="margin-top:.8rem;background:rgba(212,160,23,.05);border:1px solid rgba(212,160,23,.12);border-radius:8px;padding:.65rem 1rem;font-size:.82rem;color:var(--muted)">
          <i class="bi bi-info-circle" style="color:var(--gold2)"></i>
          Tasa de victoria: <strong style="color:var(--gold2)">${tasaVictoria}%</strong> · ${totalPremios} premio${totalPremios!==1?"s":""} · ${totalBoltGratis} gratis usados · ${refsActivos} referidos activos
        </div>` : ""}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-qr-code"></i>Mi QR de cobros</div>
        ${qrState.subido ? `<div style="display:flex;gap:.5rem">
          <button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()"><i class="bi bi-eye"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="modalSubirQR(true)"><i class="bi bi-arrow-repeat"></i></button>
        </div>` : ""}
      </div>
      <div class="panel-body">
        ${!qrState.subido
          ? `<div class="qr-empty-state">
              <div class="qes-icon"><i class="bi bi-qr-code-scan"></i></div>
              <div class="qes-title">Sin QR de cobros</div>
              <div class="qes-sub">Requerido para participar.</div>
              <button class="btn btn-red btn-md" style="margin-top:1rem" onclick="modalSubirQR()"><i class="bi bi-upload"></i> Subir QR</button>
             </div>`
          : `<div class="qr-perfil-wrap">
              <img src="${qrState.url}" style="max-height:180px;max-width:100%;border-radius:10px;border:1px solid rgba(212,160,23,.22);object-fit:contain;cursor:pointer"
                onclick="modalVerMiQR()" onerror="this.style.display='none'">
              <div class="qr-details-grid">
                <div class="qr-detail-box">
                  <div class="qdb-label">Método</div>
                  <div class="qdb-val">${mlM[qrState.metodo]||qrState.metodo||"—"}</div>
                </div>
                <div class="qr-detail-box">
                  <div class="qdb-label">Estado</div>
                  <div class="qdb-val">${qrState.verificado
                    ? '<span class="bdg bdg-ok"><i class="bi bi-shield-check"></i> OK</span>'
                    : '<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Revisión</span>'}</div>
                </div>
              </div>
             </div>`
        }
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-person-gear"></i>Cuenta</div></div>
      <div class="panel-body">
        <div class="account-rows">
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-person"></i> Usuario</div>
            <div class="ar-val">${prof?.username ?? "—"}</div>
          </div>
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-envelope"></i> Email</div>
            <div class="ar-val">${user.email ?? "—"}</div>
          </div>
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-hash"></i> Código referido</div>
            <div class="ar-val">
              ${prof?.codigo_referido||"—"}
              ${prof?.codigo_referido ? `<button class="btn btn-ghost btn-sm" onclick="copiarCodigo('${prof.codigo_referido}')"><i class="bi bi-copy"></i></button>` : ""}
            </div>
          </div>
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-shield"></i> Rol</div>
            <div class="ar-val"><span class="bdg bdg-p">${prof?.rol ?? "usuario"}</span></div>
          </div>
        </div>
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
          <button class="btn btn-ghost btn-sm" style="width:100%" onclick="modalCambiarPassword()">
            <i class="bi bi-key"></i> Cambiar contraseña
          </button>
        </div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════
   MODAL CAMBIAR CONTRASEÑA
═══════════════════════════════════════ */
window.modalCambiarPassword = async () => {
  const { value:v } = await Swal.fire({
    title:"Cambiar contraseña",
    html:`<div style="text-align:left">
      <div class="field" style="margin-bottom:.85rem">
        <label>Nueva contraseña *</label>
        <input id="pwNew" type="password" placeholder="Mínimo 6 caracteres"
          style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.95rem">
      </div>
      <div class="field">
        <label>Confirmar *</label>
        <input id="pwConf" type="password" placeholder="Repite la contraseña"
          style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.95rem">
      </div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:"<i class='bi bi-check-lg'></i> Cambiar",
    cancelButtonText:"Cancelar", width:400, ...swal$,
    preConfirm:() => {
      const np = document.getElementById("pwNew").value;
      const cp = document.getElementById("pwConf").value;
      if (np.length<6)  { Swal.showValidationMessage("Mínimo 6 caracteres");          return false; }
      if (np !== cp)    { Swal.showValidationMessage("Las contraseñas no coinciden");  return false; }
      return { password:np };
    }
  });
  if (!v) return;
  loading$("Actualizando...");
  const { error } = await supabase.auth.updateUser({ password:v.password });
  Swal.close();
  if (error) { ok$("Error", error.message, "error"); return; }
  ok$("Contraseña actualizada", "", "success");
};

/* ═══════════════════════════════════════
   ARRANQUE
═══════════════════════════════════════ */
loadSection("sorteos");

