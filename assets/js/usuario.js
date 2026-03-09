import { supabase } from "./supabase.js";
import { uploadFile } from "./cloudinary.js";
import { realizarSorteo, calcularChances, nombreCaso, mensajeNoGanador } from "./logica_juego.js";

/* ═══════════════════════════════════════
   HELPERS BASE
═══════════════════════════════════════ */
const getEl = id => document.getElementById(id);

const swal$ = { background:'#131009', color:'#e6dcc8', confirmButtonColor:'#8b1a1a', cancelButtonColor:'#221c14' };

const toast = (title, icon="success", timer=2800) => Swal.fire({
  title, icon, toast:true, position:"top-end", showConfirmButton:false, timer, timerProgressBar:true,
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

/* ── Countdown helper ── */
function fmtCountdown(ms) {
  if (ms <= 0) return "Vencido";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function msHastaVencer(createdAt) {
  const vence = new Date(createdAt).getTime() + 24 * 3600000;
  return vence - Date.now();
}

/* ═══════════════════════════════════════
   FILTROS COMPACTOS — PILL style
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
        ${c.options.map(o=>`<option value="${o.value}">${o.label}</option>`).join("")}
      </select>
      <i class="bi bi-chevron-down fc-chip-arr"></i>
    </div>`).join("");

  const sortHtml = sortId ? `
    <div class="fc-chip-wrap">
      <select id="${sortId}" class="fc-chip">
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
   AUTH
═══════════════════════════════════════ */
const { data:{ session }, error: sessionError } = await supabase.auth.getSession();
if (!session || sessionError) {
  window.location.href = "../../auth/login.html"; throw 0;
}
const { data:{ user }, error: userError } = await supabase.auth.getUser();
if (!user || userError) {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html"; throw 0;
}
const MY_USER_ID = user.id;

const { data:profile, error:profileError } = await supabase
  .from("profiles").select("*").eq("id", MY_USER_ID).single();
if (!profile || profileError || profile.estado === "suspendido") {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html"; throw 0;
}

/* ═══════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════ */
let currentProfile = { ...profile };
let boletosGratis = 0;
let boletosGratisDetalle = [];
const countdownTimers = new Map();

/* ═══════════════════════════════════════
   BOLETOS GRATIS — LÓGICA CORE
═══════════════════════════════════════ */
const MAX_BOLETOS_GRATIS = 3;

async function limpiarBoletosVencidos() {
  const hace24h = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: vencidos } = await supabase
    .from("boletos_gratis")
    .select("id")
    .eq("user_id", MY_USER_ID)
    .eq("usado", false)
    .lt("created_at", hace24h);

  if (vencidos?.length) {
    await supabase
      .from("boletos_gratis")
      .delete()
      .in("id", vencidos.map(b => b.id))
      .eq("user_id", MY_USER_ID);
  }
  return vencidos?.length || 0;
}

async function refreshProfile() {
  await limpiarBoletosVencidos();

  const { data } = await supabase
    .from("profiles").select("*").eq("id", MY_USER_ID).single();
  if (data) currentProfile = { ...data };

  const { data:bgs } = await supabase
    .from("boletos_gratis")
    .select("id,origen,created_at")
    .eq("user_id", MY_USER_ID)
    .eq("usado", false)
    .order("created_at", { ascending: true });

  boletosGratisDetalle = bgs || [];
  boletosGratis = boletosGratisDetalle.length;
  return currentProfile;
}
await refreshProfile();

/* ── Notificar boleto gratis recibido ── */
function notificarBoletosGratis(boletos, origen="Recompensa") {
  Swal.fire({
    title: `🎁 ¡Boleto${boletos>1?"s":""} gratis!`,
    html: `
      <div style="text-align:center">
        <div style="font-size:2.5rem;margin-bottom:.5rem">🎟️</div>
        <div style="font-size:.95rem;color:var(--cream);margin-bottom:.4rem">
          Tienes <strong style="color:#22c55e">${boletos} boleto${boletos>1?"s":""} gratis</strong> nuevo${boletos>1?"s":""}
        </div>
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:.6rem">Origen: ${origen}</div>
        <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:.6rem .9rem;font-size:.78rem;color:#fbbf24">
          <i class="bi bi-clock"></i> Válidos por <strong>24 horas</strong> — solo 1 por sorteo
        </div>
      </div>`,
    icon:"success", confirmButtonText:"¡Entendido!", ...swal$, timer:8000, timerProgressBar:true,
  });
}

/* ── Otorgar boleto gratis ── */
async function otorgarBoletoGratis(origen) {
  if (boletosGratis >= MAX_BOLETOS_GRATIS) return false;
  const { error } = await supabase.from("boletos_gratis").insert({
    user_id: MY_USER_ID,
    origen,
    usado: false,
  });
  if (!error) {
    await refreshProfile();
    notificarBoletosGratis(1, origen);
    return true;
  }
  return false;
}

/* ── Countdown UI ── */
function iniciarCountdownBoletos() {
  countdownTimers.forEach(t => clearInterval(t));
  countdownTimers.clear();

  boletosGratisDetalle.forEach(b => {
    const el = document.getElementById(`bg-cd-${b.id}`);
    if (!el) return;
    const tick = () => {
      const ms = msHastaVencer(b.created_at);
      if (ms <= 0) {
        el.textContent = "Vencido";
        el.style.color = "#f87171";
        setTimeout(() => refreshProfile().then(() => {
          const active = document.querySelector(".section.active")?.id?.replace("sec-","");
          if (active === "fidelidad") loadFidelidad();
        }), 1000);
        clearInterval(countdownTimers.get(b.id));
        return;
      }
      el.textContent = fmtCountdown(ms);
      if (ms < 7200000) { el.style.color = "#f87171"; el.style.fontWeight = "700"; }
      else if (ms < 21600000) { el.style.color = "#fbbf24"; }
    };
    tick();
    countdownTimers.set(b.id, setInterval(tick, 1000));
  });
}

function initUserUI(prof) {
  const ini = (prof.username?.[0] || "?").toUpperCase();
  const tbName = getEl("tbName");   if (tbName)  tbName.textContent  = prof.username;
  const tbAv   = getEl("tbAvatar"); if (tbAv)    tbAv.textContent    = ini;
  const sbName = getEl("sbName");   if (sbName)  sbName.textContent  = prof.username;
  const sbAv   = getEl("sbAvatar"); if (sbAv)    sbAv.textContent    = ini;
  const sbS    = getEl("sbSaldo");  if (sbS)     sbS.textContent     = Number(prof.total_ganado||0).toFixed(2);
  const hS     = getEl("heroSaldo");if (hS)      hS.textContent      = Number(prof.total_ganado||0).toFixed(2);
  const hBF    = getEl("heroBoletosFree");
  if (hBF) hBF.textContent = boletosGratis > 0 ? `${boletosGratis} gratis 🎁` : "0 disponibles";
}
initUserUI(currentProfile);

async function doLogout() {
  const r = await confirm$("¿Cerrar sesión?", "", "Sí, salir");
  if (r.isConfirmed) {
    supabase.removeAllChannels();
    countdownTimers.forEach(t => clearInterval(t));
    await supabase.auth.signOut();
    window.location.href = "../../auth/login.html";
  }
}
getEl("logoutBtn")  && getEl("logoutBtn").addEventListener("click",  doLogout);
getEl("logoutBtn2") && getEl("logoutBtn2").addEventListener("click", doLogout);

/* ═══════════════════════════════════════
   REALTIME
═══════════════════════════════════════ */
let realtimeSetup = false;
function setupRealtime() {
  if (realtimeSetup) return;
  realtimeSetup = true;

  supabase.channel("rounds-watch")
    .on("postgres_changes", { event:"*", schema:"public", table:"rounds" }, async (payload) => {
      await refreshProfile();
      initUserUI(currentProfile);
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if (active === "sorteos") loadSorteos();
      else if (active === "historial") loadHistorial();
      if (payload.eventType === "UPDATE") {
        const nuevo = payload.new, previo = payload.old;
        if (previo?.estado === "abierta" && nuevo?.estado === "sorteada") {
          toast("🎲 ¡Se realizó un sorteo! Revisa tu historial.", "info", 4000);
        } else if (nuevo?.estado === "abierta" && previo?.estado !== "abierta") {
          toast("🎟️ Nueva ronda disponible", "success", 3000);
        }
      }
    }).subscribe();

  supabase.channel("my-payments-watch")
    .on("postgres_changes", {
      event:"UPDATE", schema:"public", table:"payments",
      filter:`user_id=eq.${MY_USER_ID}`
    }, async (payload) => {
      await refreshProfile();
      initUserUI(currentProfile);
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if (active === "pagos") loadPagos();
      else if (active === "sorteos") loadSorteos();
      const estado = payload.new?.estado;
      if (estado === "aprobado") {
        toast("✅ Tu pago fue aprobado — ¡ya participas en el sorteo!", "success", 4000);
      } else if (estado === "rechazado") {
        Swal.fire({
          title:"⚠️ Pago rechazado",
          html:`Tu comprobante fue rechazado.<br><small style="color:var(--muted)">Revisa "Mis pagos" para más detalles.</small>`,
          icon:"warning", confirmButtonText:"Ver mis pagos", ...swal$,
        }).then(r => { if (r.isConfirmed) loadSection("pagos"); });
      }
    }).subscribe();

  supabase.channel("my-parts-watch")
    .on("postgres_changes", {
      event:"UPDATE", schema:"public", table:"participations",
      filter:`user_id=eq.${MY_USER_ID}`
    }, async (payload) => {
      await refreshProfile();
      initUserUI(currentProfile);
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if (active === "historial") loadHistorial();
      const res = payload.new?.resultado;
      if (res === "ganada") {
        Swal.fire({
          title:"🏆 ¡GANASTE!",
          html:`<div style="text-align:center"><div style="font-size:3rem">🎉</div>
            <div style="color:var(--cream);font-size:1.05rem;margin:.5rem 0">¡Felicidades! Ganaste en el sorteo.</div>
            <div style="font-size:.82rem;color:var(--muted)">El administrador enviará tu premio al QR registrado.</div></div>`,
          icon:"success", confirmButtonText:"¡Genial!", ...swal$,
        });
      } else if (res === "perdida") {
        toast("Sin suerte esta vez. ¡Sigue participando!", "info", 3500);
      }
    }).subscribe();

  supabase.channel("my-boletos-gratis-watch")
    .on("postgres_changes", {
      event:"INSERT", schema:"public", table:"boletos_gratis",
      filter:`user_id=eq.${MY_USER_ID}`
    }, async (payload) => {
      await refreshProfile();
      initUserUI(currentProfile);
      notificarBoletosGratis(1, payload.new?.origen || "Recompensa");
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if (active === "fidelidad") loadFidelidad();
    }).subscribe();

  supabase.channel("my-profile-watch")
    .on("postgres_changes", {
      event:"UPDATE", schema:"public", table:"profiles",
      filter:`id=eq.${MY_USER_ID}`
    }, async (payload) => {
      await refreshProfile();
      initUserUI(currentProfile);
      if (!payload.old?.qr_verificado && payload.new?.qr_verificado) {
        qrState.verificado = true;
        toast("✅ Tu QR fue verificado. ¡Ya puedes participar en sorteos!", "success", 5000);
        const active = document.querySelector(".section.active")?.id?.replace("sec-","");
        if (active === "sorteos") loadSorteos();
      }
    }).subscribe();

  supabase.channel("my-prizes-watch")
    .on("postgres_changes", {
      event:"INSERT", schema:"public", table:"prize_payments",
      filter:`user_id=eq.${MY_USER_ID}`
    }, async (payload) => {
      await refreshProfile();
      initUserUI(currentProfile);
      const monto = payload.new?.monto;
      Swal.fire({
        title:"💰 ¡Premio enviado!",
        html:`<div style="text-align:center">
          <div style="font-size:2rem;margin-bottom:.4rem">🏆</div>
          <div style="color:var(--cream)">Te enviaron <strong style="color:#22c55e">${fmtMoney(monto)}</strong></div>
          <div style="font-size:.8rem;color:var(--muted);margin-top:.3rem">Revisa "Mis premios" para los detalles.</div>
        </div>`,
        icon:"success", confirmButtonText:"Ver mis premios", ...swal$,
      }).then(r => { if (r.isConfirmed) loadSection("premios"); });
    }).subscribe();
}
setupRealtime();

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
        <div class="qgb-sub">Necesitas subir tu QR para comprar boletos y recibir premios si ganas.</div>
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
      <div class="qgb-sub">El administrador está revisando tu QR. Recibirás una notificación cuando sea aprobado.</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()">
      <i class="bi bi-eye"></i> Ver
    </button>
  </div>`;
}

/* ═══════════════════════════════════════
   MODAL SUBIR QR — con guía completa
═══════════════════════════════════════ */
const METODOS_QR = [
  { value:"tigo_money",    label:"Tigo Money",       desc:"QR para recibir pagos por Tigo Money Bolivia" },
  { value:"billetera_bcb", label:"Billetera BCB",    desc:"QR del Banco Central de Bolivia"              },
  { value:"qr_simple",     label:"QR Interbank",     desc:"QR estándar interbancario Bolivia"            },
  { value:"efectivo_cuenta",label:"Cuenta bancaria", desc:"Número de cuenta para depósito directo"       },
];

window.modalAyudaQR = () => {
  Swal.fire({
    title:"💡 ¿Qué QR debo subir?",
    html:`
      <div style="text-align:left;font-size:.88rem">
        <p style="color:var(--muted);margin-bottom:1rem;line-height:1.6">
          Tu QR de cobros es la imagen que usamos para <strong style="color:#fff">enviarte el premio</strong> si ganas un sorteo.
          Es el mismo QR que usas para recibir pagos en tu billetera digital.
        </p>
        <div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:10px;padding:.85rem 1rem;margin-bottom:.85rem">
          <div style="font-family:'Oswald',sans-serif;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:#22c55e;margin-bottom:.5rem">
            ✅ QRs que funcionan
          </div>
          <ul style="padding-left:1.1rem;color:var(--cream);line-height:2">
            <li><strong>Tigo Money</strong> — Abre la app → Cobrar → Mi QR</li>
            <li><strong>Billetera BCB</strong> — App del BCB → Recibir → QR</li>
            <li><strong>QR Interbank</strong> — Tu banco → Recibir → QR genérico</li>
            <li><strong>Cuenta bancaria</strong> — Captura con tu nro. de cuenta</li>
          </ul>
        </div>
        <div style="background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:.85rem 1rem;margin-bottom:.85rem">
          <div style="font-family:'Oswald',sans-serif;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:#fbbf24;margin-bottom:.5rem">
            ⚠️ Recomendaciones importantes
          </div>
          <ul style="padding-left:1.1rem;color:var(--cream);line-height:2">
            <li>Usa una cuenta <strong>que sí uses activamente</strong> para recibir pagos</li>
            <li>El QR debe ser legible y no estar cortado</li>
            <li>Asegúrate de que la imagen sea tuya (no de otra persona)</li>
            <li>Los QRs de Tigo Money <strong>duran 1 año</strong> — renuévalo si vence</li>
            <li>Evita capturas borrosas o muy oscuras</li>
          </ul>
        </div>
        <div style="background:rgba(139,26,26,.1);border:1px solid rgba(139,26,26,.25);border-radius:10px;padding:.75rem 1rem">
          <div style="font-family:'Oswald',sans-serif;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:#f87171;margin-bottom:.4rem">
            ❌ No subas
          </div>
          <ul style="padding-left:1.1rem;color:var(--muted);line-height:1.9;font-size:.82rem">
            <li>QR de pago (para pagar, no cobrar)</li>
            <li>QR de otra persona</li>
            <li>Imagen de WhatsApp o redes sociales</li>
            <li>QR vencido o de cuenta cerrada</li>
          </ul>
        </div>
        <div style="margin-top:1rem;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:.65rem .9rem;font-size:.8rem;color:#a5b4fc">
          <i class="bi bi-shield-check"></i> <strong>Privacidad:</strong> Tu QR solo es visible para el administrador cuando necesite enviarte un premio.
        </div>
      </div>`,
    icon:"info", confirmButtonText:"Entendido, subir QR", cancelButtonText:"Cerrar",
    showCancelButton:true, width:520, ...swal$,
  }).then(r => { if (r.isConfirmed) modalSubirQR(); });
};

window.modalSubirQR = async (esAct=false) => {
  const { value:v } = await Swal.fire({
    title: esAct ? "Actualizar QR de cobros" : "Sube tu QR de cobros",
    html:`
      <div style="text-align:left">
        <div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem">
          <div style="font-size:.82rem;color:var(--cream);line-height:1.6;margin-bottom:.5rem">
            <i class="bi bi-info-circle" style="color:#22c55e"></i>
            <strong style="color:#22c55e"> ¿Qué es esto?</strong> Es tu QR para <em>recibir pagos</em> (Tigo Money, BCB, etc.).
            Si ganas, el admin te envía el premio usando este QR.
          </div>
          <button type="button" onclick="Swal.close();setTimeout(()=>modalAyudaQR(),100)"
            style="background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.28);color:#22c55e;border-radius:7px;padding:.3rem .75rem;font-size:.8rem;cursor:pointer;font-family:'Oswald',sans-serif;letter-spacing:.06em">
            <i class="bi bi-question-circle"></i> Ver guía completa
          </button>
        </div>
        <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:9px;padding:.65rem .9rem;margin-bottom:1rem;font-size:.78rem;color:#fbbf24">
          <i class="bi bi-clock"></i> <strong>Duración del QR:</strong> Los QR de Tigo Money duran ~1 año.
          Actualiza el tuyo si vence para seguir recibiendo premios.
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
          <div style="font-size:.72rem;color:var(--muted);margin-top:.35rem">
            <i class="bi bi-lightbulb" style="color:#fbbf24"></i>
            Captura de pantalla de tu app al mostrar el QR de cobro funciona perfectamente.
          </div>
        </div>
        <img id="qrPreviewImg" style="display:none;max-height:160px;width:100%;object-fit:contain;margin-top:.6rem;border-radius:8px;border:1px solid rgba(212,160,23,.2)">
      </div>`,
    showCancelButton:true,
    confirmButtonText:`<i class='bi bi-upload'></i> ${esAct?'Actualizar':'Subir QR'}`,
    cancelButtonText:"Cancelar", width:520, ...swal$,
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
      if (!file)   { Swal.showValidationMessage("Sube la imagen de tu QR de cobros"); return false; }
      if (file.size > 5*1024*1024) { Swal.showValidationMessage("Imagen muy grande (máx. 5 MB)"); return false; }
      return { metodo, file };
    }
  });
  if (!v) return;

  loading$("Subiendo QR...");
  let qr_url;
  try { qr_url = await uploadFile(v.file, "el-padrino/qr-cobros"); }
  catch { Swal.close(); ok$("Error al subir imagen", "", "error"); return; }

  const { error } = await supabase
    .from("profiles")
    .update({ qr_cobro_url:qr_url, qr_metodo:v.metodo, qr_verificado:false, qr_subido_at:new Date().toISOString() })
    .eq("id", MY_USER_ID);

  Swal.close();
  if (error) { ok$("Error", error.message, "error"); return; }

  qrState = { subido:true, verificado:false, url:qr_url, metodo:v.metodo, subidoAt:new Date().toISOString() };
  await ok$("QR subido correctamente ✅",
    `El administrador lo verificará pronto.<br>
     <small style="color:var(--muted)">Recibirás una notificación cuando sea aprobado.</small><br>
     <small style="color:#fbbf24"><i class="bi bi-clock"></i> Recuerda renovarlo antes de que venza (~1 año).</small>`,
    "success");

  const active = document.querySelector(".section.active")?.id?.replace("sec-","");
  if (active) loadSection(active);
};

window.modalVerMiQR = () => {
  if (!qrState.url) return;
  const ml = { tigo_money:"Tigo Money", billetera_bcb:"Billetera BCB", qr_simple:"QR Interbank", efectivo_cuenta:"Cuenta bancaria" };
  Swal.fire({
    title:"Mi QR de cobros",
    html:`<img src="${qrState.url}" style="width:100%;max-height:280px;object-fit:contain;border-radius:10px;border:1px solid rgba(212,160,23,.22);margin-bottom:.8rem" loading="lazy">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left;margin-bottom:.7rem">
        <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem">
          <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">MÉTODO</div>
          <div>${ml[qrState.metodo]||qrState.metodo||"—"}</div>
        </div>
        <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem">
          <div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">ESTADO</div>
          <div>${qrState.verificado?'<span style="color:#22c55e">✅ Verificado</span>':'<span style="color:#f59e0b">⏳ En revisión</span>'}</div>
        </div>
      </div>
      ${qrState.subidoAt ? `<div style="font-size:.72rem;color:var(--muted);text-align:center">
        <i class="bi bi-calendar3"></i> Subido el ${fmtDateShort(qrState.subidoAt)}
        · <span style="color:#fbbf24"><i class="bi bi-clock"></i> Recuerda renovarlo en ~1 año</span>
      </div>` : ""}`,
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
getEl("btnRefresh") && getEl("btnRefresh").addEventListener("click", async () => {
  const active = document.querySelector(".section.active")?.id?.replace("sec-","") || "sorteos";
  await refreshProfile();
  initUserUI(currentProfile);
  loadSection(active);
  toast("Actualizado", "success", 1500);
});

/* ═══════════════════════════════════════
   HELPERS GENERALES
═══════════════════════════════════════ */

// Niveles extendidos para 3+ años de juego
function getNivel(t) {
  if (t>=500) return { key:"leyenda",      label:"La Leyenda",     clase:"nivel-leyenda"     };
  if (t>=200) return { key:"padrino",      label:"El Padrino",     clase:"nivel-padrino"     };
  if (t>=100) return { key:"capo",         label:"Capo di Tutti",  clase:"nivel-capo"        };
  if (t>=50)  return { key:"patron",       label:"Gran Patrón",    clase:"nivel-patron"      };
  if (t>=20)  return { key:"contendiente", label:"Contendiente",   clase:"nivel-contendiente"};
  if (t>=5)   return { key:"jugador",      label:"Jugador",        clase:"nivel-jugador"     };
  return             { key:"novato",       label:"Novato",         clase:"nivel-novato"      };
}

// Próximo nivel para mostrar progreso
function getProximoNivel(t) {
  if (t>=500) return null;
  const umbrales = [5,20,50,100,200,500];
  const nombres  = ["Jugador","Contendiente","Gran Patrón","Capo di Tutti","El Padrino","La Leyenda"];
  for (let i=0;i<umbrales.length;i++) {
    if (t<umbrales[i]) return { label:nombres[i], requerido:umbrales[i], progreso:t, pct:Math.round((t/umbrales[i])*100) };
  }
  return null;
}

async function verificarFondoRonda(roundId) {
  const { data:pts } = await supabase
    .from("participations")
    .select("boletos, es_gratis")
    .eq("round_id", roundId);
  const gratisEnRonda = (pts||[]).filter(p => p.es_gratis===true).reduce((s,p) => s+(p.boletos||0), 0);
  return { boletosGratisEnRonda:gratisEnRonda, riesgo:gratisEnRonda>=3 };
}

async function estadoBoletoGratisEnRonda(roundId) {
  const { data:miUso } = await supabase
    .from("boletos_gratis")
    .select("id")
    .eq("user_id", MY_USER_ID)
    .eq("usado_en_round", roundId)
    .limit(1);
  const yoUse = (miUso?.length || 0) > 0;

  const { count:totalGratisEnRonda } = await supabase
    .from("participations")
    .select("id", { count:"exact", head:true })
    .eq("round_id", roundId)
    .eq("es_gratis", true);

  const { count:yoGratisEnPart } = await supabase
    .from("participations")
    .select("id", { count:"exact", head:true })
    .eq("round_id", roundId)
    .eq("user_id", MY_USER_ID)
    .eq("es_gratis", true);

  const miGratis = (yoGratisEnPart || 0) > 0;
  const otrosConGratis = Math.max(0, (totalGratisEnRonda||0) - (miGratis ? 1 : 0));

  return { yoUse: yoUse || miGratis, otrosConGratis, totalGratisEnRonda: totalGratisEnRonda||0 };
}

/* ═══════════════════════════════════════
   SORTEOS ACTIVOS
═══════════════════════════════════════ */
async function loadSorteos() {
  const container = getEl("sorteosList"); if (!container) return;
  const tieneContenido = container.children.length > 0 && !container.querySelector(".spin-wrap");
  if (!tieneContenido) container.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const bannerEl = getEl("qrGateBanner");
  if (bannerEl) {
    bannerEl.innerHTML = qrBanner();
    if (boletosGratis > 0 && puedeParticipar()) {
      const bfb = document.createElement("div");
      bfb.className = "boleto-gratis-banner";
      const proxVencer = boletosGratisDetalle.reduce((min,b) => {
        const ms = msHastaVencer(b.created_at);
        return ms < min ? ms : min;
      }, Infinity);
      const urgente = proxVencer < 7200000;
      bfb.innerHTML = `<i class="bi bi-gift-fill bfb-icon" style="${urgente?"color:#f87171":""}"></i><div>
        <div class="bfb-title" style="${urgente?"color:#f87171":""}">
          Tienes ${boletosGratis} boleto${boletosGratis>1?"s":""} gratis
          ${urgente?'<span style="font-size:.72rem;font-weight:400"> — ¡vence pronto!</span>':""}
        </div>
        <div class="bfb-sub">Solo 1 por sorteo · Válido 24h · ${urgente?`<strong style="color:#f87171">¡Menos de 2h!</strong>`:"Úsalo antes de que venza"}</div>
      </div>`;
      bannerEl.appendChild(bfb);
    }
  }

  const { data:rounds, error:rErr } = await supabase
    .from("rounds").select("id,numero,estado,created_at,game_id")
    .eq("estado","abierta").order("created_at",{ascending:false});

  if (rErr || !rounds?.length) {
    container.innerHTML = `<div class="empty"><i class="bi bi-ticket-perforated"></i><p>No hay sorteos activos ahora mismo.<br><small style="color:var(--dim)">El administrador abrirá nuevas rondas pronto.</small></p></div>`;
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
    const { data:allParts } = await supabase
      .from("participations")
      .select("boletos, es_gratis, user_id")
      .eq("round_id", r.id);

    const cupos = (allParts||[]).reduce((s,p) => s+(p.boletos||1), 0);
    const boletosGratisEnRonda = (allParts||[])
      .filter(p => p.es_gratis===true)
      .reduce((s,p) => s+(p.boletos||0), 0);
    const otrosConGratis = (allParts||[])
      .filter(p => p.es_gratis===true && p.user_id !== MY_USER_ID).length;

    const { data:misParts } = await supabase
      .from("participations")
      .select("boletos, es_gratis")
      .eq("round_id", r.id)
      .eq("user_id", MY_USER_ID);

    const misBoletos  = (misParts||[]).reduce((s,p) => s+(p.boletos||1), 0);
    const yoUseGratis = (misParts||[]).some(p => p.es_gratis===true);

    const { data:myPay } = await supabase
      .from("payments")
      .select("id, estado")
      .eq("round_id", r.id)
      .eq("user_id", MY_USER_ID)
      .maybeSingle();

    return { ...r, cupos, game: gamesMap[r.game_id], misBoletos, miPago: myPay,
      boletosGratisEnRonda, yoUseGratis, otrosConGratis };
  }));

  const conMi  = roundsData.filter(r => r.misBoletos > 0);
  const sinMi  = roundsData.filter(r => r.misBoletos === 0);
  sinMi.sort((a,b) => b.cupos - a.cupos);
  const ordenados = [...conMi, ...sinMi];

  container.innerHTML = ordenados.map(r => {
    const pct   = Math.round((r.cupos/25)*100);
    const lleno = r.cupos >= 25;
    const tieneCompPend     = r.miPago?.estado === "pendiente";
    const tieneCompAprobado = r.miPago?.estado === "aprobado";
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
   FIX CRÍTICO: boleto gratis se marca como
   usado SOLO después de que admin apruebe,
   no antes. Ahora se reserva con estado pendiente.
═══════════════════════════════════════ */
window.modalComprarBoleto = async (roundId, gameNombre, numRonda, precioBoleto, cuposActuales) => {
  if (!puedeParticipar()) { modalSubirQR(); return; }
  const cuposLibres = 25 - cuposActuales;
  const maxBoletos  = Math.min(cuposLibres, 3);
  if (maxBoletos <= 0) { toast("Esta ronda ya está llena", "error"); return; }

  const { data:pagoExistente } = await supabase
    .from("payments")
    .select("id,estado,boletos_solicitados")
    .eq("round_id", roundId)
    .eq("user_id", MY_USER_ID)
    .maybeSingle();

  if (pagoExistente?.estado === "aprobado") {
    Swal.fire({
      title:"Ya tienes boletos aprobados",
      html:`Tienes <strong style="color:var(--gold2)">${pagoExistente.boletos_solicitados} boleto${pagoExistente.boletos_solicitados>1?"s":""}</strong> confirmados en esta ronda.<br>
        <small style="color:var(--muted)">Si compras más, deberás enviar un nuevo comprobante.</small>`,
      icon:"info",
      showCancelButton:true,
      confirmButtonText:"Comprar boletos adicionales",
      cancelButtonText:"Cancelar",
      ...swal$
    }).then(r => { if (r.isConfirmed) abrirModalCompra(roundId, gameNombre, numRonda, precioBoleto, cuposLibres, maxBoletos, true); });
    return;
  }

  if (pagoExistente?.estado === "pendiente") {
    Swal.fire({
      title:"Comprobante en revisión",
      html:`<div style="text-align:center">
        <div style="font-size:2rem;margin-bottom:.4rem">⏳</div>
        <div style="color:var(--cream)">Ya enviaste un comprobante por <strong>${pagoExistente.boletos_solicitados} boleto${pagoExistente.boletos_solicitados>1?"s":""}</strong>.</div>
        <div style="font-size:.82rem;color:var(--muted);margin-top:.4rem">Por seguridad, no se puede modificar la cantidad hasta que sea procesado.</div>
      </div>`,
      icon:"warning", confirmButtonText:"Entendido", ...swal$
    });
    return;
  }

  abrirModalCompra(roundId, gameNombre, numRonda, precioBoleto, cuposLibres, maxBoletos, false);
};


async function abrirModalCompra(roundId, gameNombre, numRonda, precioBoleto, cuposLibres, maxBoletos, esAdicional) {
  const gratisStatus    = await estadoBoletoGratisEnRonda(roundId);
  const puedoUsarGratis = boletosGratis > 0 && !gratisStatus.yoUse;

  // ── Obtener QR del admin para mostrar al usuario cuando necesite pagar ──
  let adminQR = null, adminQRMetodo = null;
  if (precioBoleto > 0) {
    const { data:admins } = await supabase
      .from("profiles")
      .select("qr_cobro_url,qr_metodo,username")
      .in("rol", ["admin","trabajador"])
      .eq("qr_verificado", true)
      .not("qr_cobro_url", "is", null)
      .limit(1);
    if (admins?.length) {
      adminQR       = admins[0].qr_cobro_url;
      adminQRMetodo = admins[0].qr_metodo;
    }
  }
  const mlM2 = { tigo_money:"Tigo Money", billetera_bcb:"Billetera BNB / BCB", qr_simple:"QR Interbank", efectivo_cuenta:"Cuenta bancaria" };

  let competenciaHtml = "";
  if (puedoUsarGratis && gratisStatus.otrosConGratis > 0) {
    competenciaHtml = `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.28);border-radius:8px;padding:.6rem .9rem;margin-bottom:.8rem;font-size:.82rem;display:flex;align-items:center;gap:.55rem">
      <i class="bi bi-lightning-charge-fill" style="color:#f59e0b;flex-shrink:0"></i>
      <span style="color:#e6dcc8">${gratisStatus.otrosConGratis} jugador${gratisStatus.otrosConGratis>1?"es ya usan":"ya usa"} boleto gratis aquí. <strong style="color:#fbbf24">¡Compite rápido!</strong></span>
    </div>`;
  }
  if (gratisStatus.yoUse) {
    competenciaHtml = `<div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.22);border-radius:8px;padding:.55rem .9rem;margin-bottom:.8rem;font-size:.82rem;color:#86efac;display:flex;align-items:center;gap:.5rem">
      <i class="bi bi-check-circle-fill"></i> Ya usaste tu boleto gratis en este sorteo.
    </div>`;
  }

  let gratisVencimientoHtml = "";
  if (puedoUsarGratis && boletosGratisDetalle.length > 0) {
    const msVence = msHastaVencer(boletosGratisDetalle[0].created_at);
    const urgente = msVence < 3600000;
    gratisVencimientoHtml = `<div style="font-size:.7rem;color:${urgente?"#f87171":"var(--muted)"};margin-top:.15rem">
      <i class="bi bi-clock"></i> Vence en ${fmtCountdown(msVence)} ${urgente?"⚠️":""}
    </div>`;
  }

  const fondoInfo     = await verificarFondoRonda(roundId);
  const fondoWarnHtml = fondoInfo.riesgo
    ? `<div class="fondo-warn" style="margin-bottom:.8rem"><i class="bi bi-exclamation-triangle-fill"></i>
        <span>Esta ronda tiene ${fondoInfo.boletosGratisEnRonda} boletos gratis. El fondo puede ser menor.</span>
       </div>` : "";

  // ── QR del admin para escanear y pagar — se oculta si el usuario usa solo boleto gratis ──
  const adminQRHtml = adminQR ? `
    <div id="adminQRBox" style="margin-bottom:.85rem">
      <div style="background:rgba(212,160,23,.05);border:1.5px solid rgba(212,160,23,.28);border-radius:12px;overflow:hidden">
        <div style="padding:.5rem .9rem;border-bottom:1px solid rgba(212,160,23,.15);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">
          <div style="font-family:'Oswald',sans-serif;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold2);display:flex;align-items:center;gap:.35rem">
            <i class="bi bi-qr-code-scan"></i> QR para pagar
          </div>
          <span style="font-size:.68rem;color:var(--muted);background:rgba(212,160,23,.08);border-radius:20px;padding:.1rem .55rem">${mlM2[adminQRMetodo]||adminQRMetodo||"QR de cobro"}</span>
        </div>
        <div style="padding:.75rem .75rem .6rem;display:flex;flex-direction:column;align-items:center;gap:.5rem">
          <img src="${adminQR}"
            style="width:100%;max-width:230px;height:auto;min-height:180px;border-radius:8px;border:2px solid rgba(255,255,255,.08);background:#fff;display:block;object-fit:contain"
            loading="eager"
            onerror="this.parentElement.parentElement.parentElement.style.display='none'">
          <div style="font-size:.72rem;color:var(--muted);text-align:center;line-height:1.5">
            <i class="bi bi-1-circle-fill" style="color:var(--gold2)"></i> Escanea con tu app bancaria<br>
            <i class="bi bi-2-circle-fill" style="color:var(--gold2)"></i> Paga el monto exacto<br>
            <i class="bi bi-3-circle-fill" style="color:var(--gold2)"></i> Sube la captura del pago abajo 👇
          </div>
        </div>
      </div>
    </div>` : "";

  // ── Monto a pagar (dinámico) ──
  const montoHtml = precioBoleto > 0 ? `
    <div id="montoPreview" style="background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.22);border-radius:9px;padding:.6rem .9rem;margin-bottom:.85rem;text-align:center">
      <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.1rem">Total a pagar</div>
      <div id="montoPreviewVal" style="font-family:'Oswald',sans-serif;font-size:1.6rem;font-weight:700;color:var(--gold2);line-height:1.1">${fmtMoney(precioBoleto)}</div>
      <div id="montoGratisNote" style="display:none;font-size:.7rem;color:#22c55e;margin-top:.15rem"><i class="bi bi-gift-fill"></i> 1 boleto gratis descontado</div>
    </div>` : "";

  const { value:v } = await Swal.fire({
    title:`${esAdicional?"+ Boletos — ":""}${gameNombre}`,
    html:`<div style="text-align:left">
      ${fondoWarnHtml}
      ${competenciaHtml}
      <div style="background:var(--ink3);border:1px solid var(--bord-g);border-radius:9px;padding:.58rem .88rem;margin-bottom:.8rem">
        <div style="font-family:'Oswald',sans-serif;font-size:.85rem;color:#fff">Ronda #${numRonda}</div>
        <div style="font-size:.74rem;color:var(--muted);margin-top:.05rem">${cuposLibres} cupo${cuposLibres!==1?"s":""} libres · Máx. ${maxBoletos} por compra</div>
      </div>

      ${puedoUsarGratis ? `
      <div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:.6rem .9rem;margin-bottom:.55rem;display:flex;align-items:center;gap:.65rem">
        <i class="bi bi-gift-fill" style="color:#22c55e;font-size:1rem;flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:.84rem;font-weight:600;color:#22c55e">Tienes ${boletosGratis} boleto${boletosGratis>1?"s":""} gratis</div>
          ${gratisVencimientoHtml}
        </div>
      </div>
      <div style="margin-bottom:.8rem;display:flex;align-items:center;gap:.5rem;padding:.5rem .8rem;background:var(--ink3);border:1px solid var(--border);border-radius:8px;cursor:pointer"
        onclick="document.getElementById('usarGratis').click()">
        <input type="checkbox" id="usarGratis" style="accent-color:var(--green2);width:16px;height:16px;flex-shrink:0">
        <label for="usarGratis" style="cursor:pointer;font-size:.87rem;color:var(--cream)">Usar 1 boleto gratis en este sorteo</label>
      </div>` : ""}

      <div class="field" style="margin-bottom:.8rem">
        <label>Cantidad de boletos (máx. ${maxBoletos})</label>
        <div style="display:flex;align-items:center;gap:.6rem;margin-top:.3rem">
          <button type="button" id="btnMenos" style="width:34px;height:34px;border-radius:50%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="bi bi-dash"></i></button>
          <input id="bNum" type="number" min="1" max="${maxBoletos}" value="1"
            style="width:64px;text-align:center;font-family:'Oswald',sans-serif;font-size:1.2rem;font-weight:700;background:var(--ink3);border:1px solid var(--border);color:var(--gold2);border-radius:8px;padding:.4rem">
          <button type="button" id="btnMas" style="width:34px;height:34px;border-radius:50%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="bi bi-plus"></i></button>
        </div>
      </div>

      <div id="pagoSection">
        ${montoHtml}
        ${adminQRHtml}
        <div class="field" style="margin-bottom:.72rem">
          <label>Método de pago *</label>
          <select id="bMetodo" style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.88rem">
            <option value="">— Seleccionar —</option>
            <option value="qr"${adminQRMetodo && adminQRMetodo !== "efectivo_cuenta" ? " selected" : ""}>QR / Tigo Money / Billetera BNB</option>
            <option value="transferencia">Transferencia bancaria</option>
            <option value="yape">Yape</option>
            <option value="manual">Efectivo</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:.72rem">
          <label>Foto del comprobante * <span style="color:var(--muted);font-size:.67rem;text-transform:none;font-weight:400">(captura del pago, máx. 5MB)</span></label>
          <input type="file" id="bComp" accept="image/*"
            style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.42rem .75rem;font-size:.85rem">
          <img id="bPrev" style="display:none;width:100%;max-height:90px;object-fit:contain;margin-top:.45rem;border-radius:7px;border:1px solid var(--border)">
        </div>
        <div class="field">
          <label>Referencia / Nro. operación <span style="font-size:.68rem;font-weight:400;text-transform:none;color:var(--dim)">(opcional)</span></label>
          <input id="bRef" placeholder="Ej: 00123456"
            style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.88rem">
        </div>
        <div style="font-size:.7rem;color:var(--dim);margin-top:.45rem;padding:.38rem .6rem;background:rgba(139,26,26,.05);border:1px solid rgba(139,26,26,.12);border-radius:6px">
          <i class="bi bi-lock-fill" style="color:#f87171"></i> Una vez enviado el comprobante, la cantidad no puede modificarse.
        </div>
      </div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:"<i class='bi bi-send-fill'></i> Enviar comprobante",
    cancelButtonText:"Cancelar",
    width: adminQR ? 480 : 520,
    ...swal$,
    didOpen:() => {
      const act = () => {
        const n   = parseInt(document.getElementById("bNum")?.value || 1);
        const ug  = document.getElementById("usarGratis")?.checked || false;
        const bap = ug ? Math.max(0, n-1) : n;
        const ev  = document.getElementById("montoPreviewVal");
        const nota= document.getElementById("montoGratisNote");
        const ps  = document.getElementById("pagoSection");
        const qrb = document.getElementById("adminQRBox");
        if (ev && precioBoleto>0) ev.textContent = fmtMoney(precioBoleto * bap);
        if (nota) nota.style.display = ug ? "block" : "none";
        // Ocultar sección pago y QR si usa solo boleto gratis
        if (ps)  ps.style.display  = bap===0 ? "none" : "block";
        if (qrb) qrb.style.display = bap===0 ? "none" : "block";
      };
      document.getElementById("btnMenos").addEventListener("click", () => {
        const i = document.getElementById("bNum"); const v2 = parseInt(i.value||1); if (v2>1) i.value=v2-1; act();
      });
      document.getElementById("btnMas").addEventListener("click", () => {
        const i = document.getElementById("bNum"); const v2 = parseInt(i.value||1); if (v2<maxBoletos) i.value=v2+1; act();
      });
      document.getElementById("bNum").addEventListener("input", () => {
        const i = document.getElementById("bNum"); let v2 = parseInt(i.value);
        if (isNaN(v2)||v2<1) i.value=1; else if (v2>maxBoletos) i.value=maxBoletos; act();
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
        if (!file)   { Swal.showValidationMessage("Sube la foto del comprobante de pago"); return false; }
        if (file.size > 5*1024*1024) { Swal.showValidationMessage("Imagen muy grande (máx. 5 MB)"); return false; }
      }
      return { boletos, usarGratis, boletosAPagar, metodo, file, ref };
    }
  });
  if (!v) return;

  loading$("Enviando comprobante…");

  // ════════════════════════════════════════════════════
  // FIX CRÍTICO: Si solo usa boleto gratis (boletosAPagar===0),
  // insertar directamente la participación sin esperar admin.
  // El boleto se marca como usado AQUÍ mismo.
  // ════════════════════════════════════════════════════
  if (v.usarGratis && v.boletosAPagar === 0) {
    // 1. Buscar boleto gratis disponible
    const { data:bgDisp } = await supabase
      .from("boletos_gratis").select("id")
      .eq("user_id", MY_USER_ID)
      .eq("usado", false).limit(1);

    if (!bgDisp?.length) {
      Swal.close();
      ok$("Error", "No se encontró boleto gratis disponible. Recarga la página.", "error");
      return;
    }

    // 2. Marcar boleto como usado
    const { error:bgErr } = await supabase.from("boletos_gratis")
      .update({ usado:true, usado_en_round:roundId, usado_at:new Date().toISOString() })
      .eq("id", bgDisp[0].id)
      .eq("user_id", MY_USER_ID)
      .eq("usado", false); // doble check de seguridad

    if (bgErr) {
      Swal.close();
      ok$("Error", "No se pudo usar el boleto gratis. Intenta de nuevo.", "error");
      return;
    }

    // 3. Insertar participación directamente (sin necesidad de aprobación del admin)
    const { error:partErr } = await supabase.from("participations").insert({
      round_id:   roundId,
      user_id:    MY_USER_ID,
      resultado:  "pendiente",
      boletos:    1,
      es_gratis:  true,
    });

    // 4. Registrar payment informativo (para el historial)
    await supabase.from("payments").insert({
      user_id:    MY_USER_ID,
      round_id:   roundId,
      metodo:     "gratis",
      monto:      0,
      estado:     "aprobado", // se aprueba automáticamente
      referencia: `Boleto gratis — ${bgDisp[0].id}`,
      boletos_solicitados: 1,
    });

    await refreshProfile();
    initUserUI(currentProfile);
    Swal.close();

    if (partErr) {
      ok$("⚠️ Atención",
        `El boleto gratis fue marcado pero hubo un error al registrar la participación.<br>
         <small style="color:var(--muted)">Contacta al administrador con el código: BG-${bgDisp[0].id.slice(0,8)}</small>`,
        "warning");
    } else {
      await Swal.fire({
        title:"🎟️ ¡Participas con boleto gratis!",
        html:`Quedaste inscrito en <strong style="color:var(--gold2)">Ronda #${numRonda}</strong> de ${gameNombre}.<br>
          <small style="color:var(--muted)">Recibirás una notificación cuando se realice el sorteo.</small>`,
        icon:"success", confirmButtonText:"¡Listo!", ...swal$
      });
    }
    loadSorteos();
    return;
  }

  // ════════════════════════════════════════════════════
  // Flujo normal: pago con comprobante (con o sin boleto gratis adicional)
  // ════════════════════════════════════════════════════

  // Marcar boleto gratis si se usó junto con un pago
  if (v.usarGratis) {
    const { data:bgDisp } = await supabase
      .from("boletos_gratis").select("id")
      .eq("user_id", MY_USER_ID)
      .eq("usado", false).limit(1);
    if (bgDisp?.length) {
      await supabase.from("boletos_gratis")
        .update({ usado:true, usado_en_round:roundId, usado_at:new Date().toISOString() })
        .eq("id", bgDisp[0].id)
        .eq("user_id", MY_USER_ID);
    }
  }

  let comprobante_url = null;
  if (v.boletosAPagar>0 && v.file) {
    try { comprobante_url = await uploadFile(v.file, "el-padrino/comprobantes"); }
    catch { Swal.close(); ok$("Error al subir imagen", "", "error"); return; }
  }

  const { error:payError } = await supabase.from("payments").insert({
    user_id:    MY_USER_ID,
    round_id:   roundId,
    metodo:     v.metodo || "manual",
    monto:      precioBoleto * v.boletosAPagar || 0,
    estado:     "pendiente",
    comprobante_url,
    referencia: v.ref || null,
    boletos_solicitados: v.boletos,
  });

  if (payError) { Swal.close(); ok$("Error al registrar pago", payError.message, "error"); return; }

  await refreshProfile();
  initUserUI(currentProfile);
  Swal.close();

  await Swal.fire({
    title:"✅ Comprobante enviado",
    html:`El admin revisará y confirmará tus <strong style="color:var(--gold2)">${v.boletos} boleto${v.boletos>1?"s":""}${v.usarGratis?" (incluye 1 gratis)":""}</strong>.<br>
      <small style="color:var(--muted)">Recibirás una notificación cuando sea aprobado.</small>`,
    icon:"success", confirmButtonText:"OK", ...swal$
  });
  loadSorteos();
}

/* ═══════════════════════════════════════
   MI HISTORIAL
═══════════════════════════════════════ */
async function loadHistorial() {
  const el = getEl("historialList"); if (!el) return;
  const tieneContenido = el.children.length > 0 && !el.querySelector(".spin-wrap");
  if (!tieneContenido) el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data:parts, error } = await supabase
    .from("participations")
    .select("id,boletos,resultado,lugar,es_gratis,created_at,round_id")
    .eq("user_id", MY_USER_ID)
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
    const q     = getEl("hBuscar")?.value.trim().toLowerCase() || "";
    const res   = getEl("hResultado")?.value || "";
    const juego = getEl("hJuego")?.value     || "";
    const orden = getEl("hOrden")?.value     || "desc";
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

window.modalVerGanadores = async (roundId) => {
  loading$("Cargando resultados…");
  const { data:round } = await supabase
    .from("rounds")
    .select("numero,sorteado_at,caso_sorteo,game_id,ganador_id,ganador2_id,ganador3_id")
    .eq("id", roundId).single();
  const { data:game } = round?.game_id
    ? await supabase.from("games").select("nombre").eq("id", round.game_id).single()
    : { data:null };

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
  const tieneContenido = el.children.length > 0 && !el.querySelector(".spin-wrap");
  if (!tieneContenido) el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data:pays, error } = await supabase
    .from("payments")
    .select("id,monto,metodo,estado,boletos_solicitados,comprobante_url,created_at,round_id,referencia")
    .eq("user_id", MY_USER_ID)
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
  const tieneContenido = el.children.length > 0 && !el.querySelector(".spin-wrap");
  if (!tieneContenido) el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data:premiosData, error } = await supabase
    .from("prize_payments")
    .select("id,monto,metodo,referencia,notas,estado,lugar,created_at,round_id")
    .eq("user_id", MY_USER_ID)
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
  const refLink   = `${window.location.origin}/ElJuegoDelPadrino/auth/register.html?ref=${codigoRef}`;

  const { data:refs } = await supabase
    .from("referidos")
    .select("id,referido_id,estado,creado_at,boleto_otorgado,boletos_pagados,profiles!referido_id(username)")
    .eq("referidor_id", MY_USER_ID)
    .order("creado_at", {ascending:false});

  const allRefs      = refs || [];
  const totalRefs    = allRefs.length;
  const refsActivos  = allRefs.filter(r=>r.estado==="completado").length;
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
            <li>Cuando compre <strong style="color:var(--cream)">3 boletos pagados</strong>, recibes <strong style="color:#22c55e">1 boleto gratis</strong> (máx. 3 disponibles)</li>
            <li>Los boletos gratis <strong style="color:#fbbf24">vencen en 24 horas</strong> — úsalos rápido</li>
            <li>Solo puedes usar <strong style="color:var(--cream)">1 boleto gratis por sorteo</strong></li>
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
    .eq("id", MY_USER_ID);
  if (!error) currentProfile.codigo_referido = codigo;
  return codigo;
}
window.copiarCodigo = async c => { try { await navigator.clipboard.writeText(c); } catch {} toast("Código copiado","success"); };
window.copiarLink   = async l => { try { await navigator.clipboard.writeText(l); } catch {} toast("Link copiado","success");  };

/* ═══════════════════════════════════════
   FIDELIDAD — SISTEMA COMPLETO PARA 3+ AÑOS
   Con 3 categorías: Logros, Retos de Temporada,
   Privilegios de Nivel
═══════════════════════════════════════ */
async function loadFidelidad() {
  const el = getEl("fidelidadContent"); if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const [{ data:parts },{ data:pays },{ data:refs },{ data:premios },{ data:bgsDisp }] = await Promise.all([
    supabase.from("participations").select("boletos,resultado,es_gratis,created_at").eq("user_id", MY_USER_ID),
    supabase.from("payments").select("estado,monto,created_at").eq("user_id", MY_USER_ID),
    supabase.from("referidos").select("estado,boleto_otorgado").eq("referidor_id", MY_USER_ID),
    supabase.from("prize_payments").select("lugar,monto").eq("user_id", MY_USER_ID),
    supabase.from("boletos_gratis").select("id,origen,created_at").eq("user_id", MY_USER_ID).eq("usado", false).order("created_at", { ascending: true }),
  ]);

  const totalBoletos   = (parts||[]).reduce((s,p) => s+(p.boletos||1), 0);
  const totalAprobados = (pays||[]).filter(p=>p.estado==="aprobado"&&p.monto>0).length;
  const totalGastado   = (pays||[]).filter(p=>p.estado==="aprobado"&&p.monto>0).reduce((s,p) => s+Number(p.monto||0), 0);
  const totalRefs      = (refs||[]).length;
  const refsActivos    = (refs||[]).filter(r=>r.estado==="completado").length;
  const totalGanadas   = (parts||[]).filter(p=>p.resultado==="ganada").length;
  const totalGanado    = (premios||[]).reduce((s,p) => s+Number(p.monto||0), 0);
  const primerLugar    = (premios||[]).filter(p=>p.lugar===1).length;
  const bgsTotal       = bgsDisp?.length || 0;
  const nivel          = getNivel(totalBoletos);
  const proxNivel      = getProximoNivel(totalBoletos);

  // ── Calcular racha actual (días consecutivos con participación) ──
  const fechasParticipacion = [...new Set((parts||[])
    .map(p => new Date(p.created_at).toDateString()))].sort();
  let rachaActual = 0;
  if (fechasParticipacion.length) {
    rachaActual = 1;
    const hoy = new Date().toDateString();
    const ayer = new Date(Date.now() - 86400000).toDateString();
    const ultima = fechasParticipacion[fechasParticipacion.length - 1];
    if (ultima !== hoy && ultima !== ayer) rachaActual = 0;
    else {
      for (let i = fechasParticipacion.length - 1; i > 0; i--) {
        const diff = new Date(fechasParticipacion[i]) - new Date(fechasParticipacion[i-1]);
        if (diff <= 86400000 * 2) rachaActual++;
        else break;
      }
    }
  }

  // ══════════════════════════════════════
  // LOGROS — 12 total para 3 años de juego
  // ══════════════════════════════════════
  const logros = [
    // Categoría: Inicio
    { id:"primer_sorteo",   cat:"🚀 Iniciación",  nombre:"Bienvenido al juego",  desc:"Participa en tu primer sorteo",             icono:"bi-door-open",          logrado:totalBoletos>=1,  progreso:Math.min(totalBoletos,1), max:1,   recompensa:"Acceso a sorteos especiales" },
    { id:"cinco_sorteos",   cat:"🚀 Iniciación",  nombre:"Arrancando motores",    desc:"Participa en 5 sorteos",                    icono:"bi-speedometer2",       logrado:totalBoletos>=5,  progreso:Math.min(totalBoletos,5), max:5,   recompensa:"1 boleto gratis" },
    { id:"primer_win",      cat:"🚀 Iniciación",  nombre:"Primer golpe",          desc:"Gana tu primer sorteo",                     icono:"bi-star-fill",          logrado:totalGanadas>=1,  progreso:Math.min(totalGanadas,1), max:1,   recompensa:"Boleto gratis + emblema" },
    // Categoría: Constancia
    { id:"decena",          cat:"📅 Constancia",  nombre:"Décimo jugador",        desc:"Compra 10 boletos pagados",                 icono:"bi-stack",              logrado:totalAprobados>=10, progreso:Math.min(totalAprobados,10), max:10, recompensa:"1 boleto gratis (repeatable)" },
    { id:"veinte_sort",     cat:"📅 Constancia",  nombre:"Veterano",              desc:"Participa en 20 sorteos",                   icono:"bi-calendar-check",     logrado:totalBoletos>=20, progreso:Math.min(totalBoletos,20), max:20,  recompensa:"1 boleto gratis" },
    { id:"cincuenta_sort",  cat:"📅 Constancia",  nombre:"El Fiel",               desc:"Participa en 50 sorteos",                   icono:"bi-patch-star-fill",    logrado:totalBoletos>=50, progreso:Math.min(totalBoletos,50), max:50,  recompensa:"2 boletos gratis" },
    { id:"cien_sort",       cat:"📅 Constancia",  nombre:"Cien Rondas",           desc:"Participa en 100 sorteos",                  icono:"bi-award-fill",         logrado:totalBoletos>=100, progreso:Math.min(totalBoletos,100), max:100, recompensa:"3 boletos gratis + nivel especial" },
    // Categoría: Inversión
    { id:"gastador50",      cat:"💰 Inversión",   nombre:"Apostador",             desc:"Invierte Bs 50 en total",                   icono:"bi-bank2",              logrado:totalGastado>=50,  progreso:Math.min(totalGastado,50),  max:50,  recompensa:"1 boleto gratis (repeatable)" },
    { id:"gastador200",     cat:"💰 Inversión",   nombre:"El Patrón",             desc:"Invierte Bs 200 en total",                  icono:"bi-gem",                logrado:totalGastado>=200, progreso:Math.min(totalGastado,200), max:200, recompensa:"2 boletos gratis" },
    { id:"gastador500",     cat:"💰 Inversión",   nombre:"El Gran Patrón",        desc:"Invierte Bs 500 en total",                  icono:"bi-safe-fill",          logrado:totalGastado>=500, progreso:Math.min(totalGastado,500), max:500, recompensa:"3 boletos gratis + insignia" },
    // Categoría: Social
    { id:"racha3",          cat:"👥 Social",      nombre:"El Reclutador",         desc:"Invita 3 amigos activos",                   icono:"bi-people-fill",        logrado:refsActivos>=3,    progreso:Math.min(refsActivos,3),    max:3,   recompensa:"2 boletos gratis" },
    { id:"racha10",         cat:"👥 Social",      nombre:"Red de contactos",      desc:"Invita 10 amigos activos",                  icono:"bi-diagram-3-fill",     logrado:refsActivos>=10,   progreso:Math.min(refsActivos,10),   max:10,  recompensa:"5 boletos gratis + insignia" },
    // Categoría: Élite
    { id:"triple_corona",   cat:"👑 Élite",       nombre:"Triple Corona",         desc:"Gana 3 sorteos en total",                   icono:"bi-trophy-fill",        logrado:totalGanadas>=3,   progreso:Math.min(totalGanadas,3),   max:3,   recompensa:"3 boletos gratis + nombre especial" },
    { id:"gran_ganador",    cat:"👑 Élite",       nombre:"El Gran Ganador",       desc:"Acumula Bs 100 en premios recibidos",       icono:"bi-cash-coin",          logrado:totalGanado>=100,  progreso:Math.min(totalGanado,100),  max:100, recompensa:"5 boletos gratis" },
    { id:"primero_siempre", cat:"👑 Élite",       nombre:"El Primero",            desc:"Gana el 1er lugar en 2 sorteos",            icono:"bi-1-circle-fill",      logrado:primerLugar>=2,    progreso:Math.min(primerLugar,2),    max:2,   recompensa:"Insignia especial + 2 gratis" },
    { id:"doscientos_sort", cat:"👑 Élite",       nombre:"Leyenda",               desc:"Participa en 200 sorteos",                  icono:"bi-fire",               logrado:totalBoletos>=200, progreso:Math.min(totalBoletos,200), max:200, recompensa:"10 boletos gratis + nivel Leyenda" },
  ];

  const logradosCount = logros.filter(l=>l.logrado).length;
  const categorias    = [...new Set(logros.map(l=>l.cat))];

  // ══════════════════════════════════════
  // PRIVILEGIOS POR NIVEL
  // ══════════════════════════════════════
  const privilegios = {
    novato:      ["Participar en sorteos", "Usar boletos gratis", "Sistema de referidos"],
    jugador:     ["Todo lo anterior", "📣 Notificaciones prioritarias de nuevas rondas", "👁️ Ver probabilidades de ganar"],
    contendiente:["Todo lo anterior", "⚡ Acceso anticipado a rondas especiales (próximamente)", "🎯 Sorteos con premios mayores"],
    patron:      ["Todo lo anterior", "💎 Badge especial en tu perfil", "🎁 Boleto gratis mensual (próximamente)", "📊 Estadísticas avanzadas"],
    capo:        ["Todo lo anterior", "🏆 Sección exclusiva Capos", "📬 Contacto directo con el admin", "🎫 Sorteos privados VIP"],
    padrino:     ["Todo lo anterior", "👑 Nombre destacado en cada sorteo", "🎰 Prioridad en sorteos premium", "💰 Comisión de referidos mejorada"],
    leyenda:     ["TODO lo anterior", "🔱 Insignia Leyenda permanente", "🥇 Siempre en el podio de fidelidad", "🎁 Recompensas mensuales especiales"],
  };

  const privList = privilegios[nivel.key] || privilegios.novato;

  // ══════════════════════════════════════
  // RETOS SEMANALES (basados en stats)
  // ══════════════════════════════════════
  const semana = Math.ceil((Date.now() / (1000 * 60 * 60 * 24 * 7)) % 52);
  const retos = [
    { nombre:"Jugador de la semana",  desc:"Participa en 3 sorteos esta semana",  icono:"bi-calendar-week", progreso:Math.min(totalBoletos % 3, 3), max:3, recompensa:"1 boleto gratis" },
    { nombre:"Referido veloz",        desc:"Invita a 1 amigo nuevo",              icono:"bi-person-plus-fill", progreso:Math.min(totalRefs % 2, 1), max:1, recompensa:"1 boleto gratis" },
    { nombre:"Comprador fiel",        desc:"Compra boletos 2 veces esta semana",  icono:"bi-bag-check-fill", progreso:Math.min(totalAprobados % 2, 2), max:2, recompensa:"Descuento próx. compra" },
  ];

  // HTML de boletos con countdown
  const boletosHtml = bgsDisp?.length ? `
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-gift-fill"></i>Boletos gratis disponibles</div>
        <span style="font-size:.72rem;color:var(--muted)">${bgsTotal}/${MAX_BOLETOS_GRATIS} máx.</span>
      </div>
      <div class="panel-body" style="padding:.6rem">
        <div style="background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:.55rem .9rem;margin-bottom:.8rem;font-size:.78rem;color:#fbbf24;display:flex;align-items:center;gap:.5rem">
          <i class="bi bi-clock-fill"></i> Los boletos vencen a las 24 horas de ser emitidos
        </div>
        <div class="item-list">
          ${bgsDisp.map(b => {
            const ms     = msHastaVencer(b.created_at);
            const urgente = ms < 3600000;
            return `
            <div class="list-item" style="${urgente?"border-color:rgba(248,113,113,.3)":""}">
              <div class="li-icon ic-win" style="${urgente?"background:rgba(248,113,113,.12);color:#f87171":""}">
                <i class="bi bi-gift-fill"></i>
              </div>
              <div class="li-body">
                <div class="li-title">Boleto gratis · <span style="font-size:.8rem;color:var(--muted)">${b.origen||"Promoción"}</span></div>
                <div class="li-sub">${fmtDateShort(b.created_at)}</div>
              </div>
              <div class="li-right" style="align-items:flex-end;gap:.15rem">
                <span class="bdg bdg-free"><i class="bi bi-ticket-perforated-fill"></i> Disp.</span>
                <div style="font-size:.72rem;${urgente?"color:#f87171;font-weight:700":"color:var(--muted)"}">
                  <i class="bi bi-clock"></i> <span id="bg-cd-${b.id}">${fmtCountdown(ms)}</span>
                </div>
              </div>
            </div>`
          }).join("")}
        </div>
      </div>
    </div>` : "";

  el.innerHTML = `
    <!-- NIVEL Y PROGRESO -->
    <div class="panel nivel-panel-premium">
      <div class="nivel-panel-bg"></div>
      <div class="panel-body" style="position:relative;z-index:1">
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:${proxNivel?'.8rem':'0'}">
          <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--gold2));display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;border:2px solid rgba(212,160,23,.4)">
            <i class="bi bi-person-badge-fill" style="color:#fff"></i>
          </div>
          <div style="flex:1">
            <div style="font-family:'Oswald',sans-serif;font-size:1.25rem;font-weight:700;color:#fff">${nivel.label}</div>
            <div class="nivel-badge ${nivel.clase}" style="margin-top:.25rem"><i class="bi bi-star-fill"></i> ${totalBoletos} boletos jugados</div>
          </div>
          ${rachaActual > 1 ? `<div style="text-align:center;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);border-radius:10px;padding:.5rem .75rem;flex-shrink:0">
            <div style="font-family:'Oswald',sans-serif;font-size:1.2rem;color:#fbbf24">${rachaActual}</div>
            <div style="font-size:.65rem;color:var(--muted)">días racha</div>
          </div>` : ""}
        </div>
        ${proxNivel ? `<div>
          <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--muted);margin-bottom:.3rem">
            <span>Próximo nivel: <strong style="color:var(--gold2)">${proxNivel.label}</strong></span>
            <span>${proxNivel.progreso}/${proxNivel.requerido} boletos</span>
          </div>
          <div style="height:5px;background:rgba(255,255,255,.06);border-radius:10px;overflow:hidden">
            <div style="height:100%;width:${proxNivel.pct}%;background:linear-gradient(90deg,var(--red),var(--gold2));border-radius:10px;transition:width .5s ease"></div>
          </div>
          <div style="font-size:.7rem;color:var(--dim);margin-top:.25rem">Faltan ${proxNivel.requerido - proxNivel.progreso} boletos más</div>
        </div>` : `<div style="background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.2);border-radius:8px;padding:.6rem .9rem;font-size:.82rem;color:#fbbf24;text-align:center">
          <i class="bi bi-crown-fill"></i> ¡Has alcanzado el nivel máximo! Eres una Leyenda 🏆
        </div>`}
      </div>
    </div>

    <!-- RESUMEN RÁPIDO -->
    <div class="fidelidad-stats-grid">
      <div class="fid-stat"><i class="bi bi-ticket-perforated-fill"></i><div class="fid-stat-val">${totalBoletos}</div><div class="fid-stat-lbl">Boletos</div></div>
      <div class="fid-stat"><i class="bi bi-trophy-fill" style="color:#fbbf24"></i><div class="fid-stat-val">${totalGanadas}</div><div class="fid-stat-lbl">Ganados</div></div>
      <div class="fid-stat"><i class="bi bi-people-fill" style="color:#818cf8"></i><div class="fid-stat-val">${refsActivos}</div><div class="fid-stat-lbl">Referidos</div></div>
      <div class="fid-stat"><i class="bi bi-gift-fill" style="color:#22c55e"></i><div class="fid-stat-val">${bgsTotal}</div><div class="fid-stat-lbl">Gratis disp.</div></div>
      <div class="fid-stat"><i class="bi bi-cash-stack" style="color:#22c55e"></i><div class="fid-stat-val">${fmtMoney(totalGanado)}</div><div class="fid-stat-lbl">Total ganado</div></div>
      <div class="fid-stat"><i class="bi bi-star-fill" style="color:#f59e0b"></i><div class="fid-stat-val">${logradosCount}/${logros.length}</div><div class="fid-stat-lbl">Logros</div></div>
    </div>

    <!-- BOLETOS GRATIS DISPONIBLES -->
    ${bgsTotal > 0 ? `<div class="boleto-gratis-banner">
      <i class="bi bi-gift-fill bfb-icon"></i>
      <div>
        <div class="bfb-title">${bgsTotal} boleto${bgsTotal>1?"s":""} gratis disponible${bgsTotal>1?"s":""}</div>
        <div class="bfb-sub">Solo 1 por sorteo · Vencen en 24h · Máx. ${MAX_BOLETOS_GRATIS} al mismo tiempo</div>
      </div>
      <button class="btn btn-green btn-sm" onclick="loadSection('sorteos')"><i class="bi bi-ticket-perforated-fill"></i> Usar ahora</button>
    </div>` : ""}

    ${boletosHtml}

    <!-- REGLAS -->
    <div style="background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.18);border-radius:10px;padding:.8rem 1rem;margin-bottom:1.2rem;font-size:.82rem;color:var(--muted)">
      <strong style="color:#fff;display:block;margin-bottom:.3rem">
        <i class="bi bi-shield-exclamation" style="color:#f59e0b"></i> Reglas de boletos gratis
      </strong>
      <ul style="padding-left:1rem;line-height:1.8">
        <li>Máximo <strong style="color:var(--cream)">${MAX_BOLETOS_GRATIS}</strong> al mismo tiempo</li>
        <li>Solo <strong style="color:var(--cream)">1 boleto gratis</strong> por sorteo</li>
        <li>Vencen a las <strong style="color:#fbbf24">24 horas</strong> de ser emitidos</li>
        <li>El fondo puede ser menor si hay varios boletos gratis en la misma ronda</li>
      </ul>
    </div>

    <!-- PRIVILEGIOS DEL NIVEL ACTUAL -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-shield-fill-check"></i>Tus privilegios — ${nivel.label}</div>
      </div>
      <div class="panel-body">
        <div style="display:flex;flex-direction:column;gap:.4rem">
          ${privList.map((p,i) => `
          <div style="display:flex;align-items:center;gap:.6rem;padding:.45rem .6rem;background:${i===0?"var(--ink3)":"transparent"};border-radius:7px">
            <i class="bi bi-check-circle-fill" style="color:#22c55e;flex-shrink:0;font-size:.85rem"></i>
            <span style="font-size:.85rem;color:var(--cream)">${p}</span>
          </div>`).join("")}
        </div>
        ${proxNivel ? `<div style="margin-top:.75rem;padding:.6rem .8rem;background:rgba(212,160,23,.05);border:1px solid rgba(212,160,23,.12);border-radius:8px;font-size:.78rem;color:var(--muted)">
          <i class="bi bi-arrow-up-circle" style="color:var(--gold2)"></i>
          Desbloquea más privilegios al alcanzar <strong style="color:var(--gold2)">${proxNivel.label}</strong>
        </div>` : ""}
      </div>
    </div>

    <!-- RETOS SEMANALES -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-lightning-charge-fill" style="color:#f59e0b"></i>Retos de la semana</div>
        <span style="font-size:.68rem;color:var(--muted);background:var(--ink3);border:1px solid var(--border);border-radius:20px;padding:.15rem .6rem">Semana ${semana}</span>
      </div>
      <div class="panel-body" style="padding:.7rem">
        <div style="display:flex;flex-direction:column;gap:.65rem">
          ${retos.map(r => {
            const completo = r.progreso >= r.max;
            const pct      = Math.round((r.progreso/r.max)*100);
            return `
            <div style="background:${completo?"rgba(34,197,94,.04)":"var(--ink3)"};border:1px solid ${completo?"rgba(34,197,94,.2)":"var(--border)"};border-radius:9px;padding:.7rem .9rem">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
                <div style="display:flex;align-items:center;gap:.5rem">
                  <i class="bi ${r.icono}" style="color:${completo?"#22c55e":"#f59e0b"};font-size:.95rem"></i>
                  <span style="font-family:'Oswald',sans-serif;font-size:.88rem;font-weight:600;color:#fff">${r.nombre}</span>
                </div>
                ${completo ? `<span class="bdg bdg-ok" style="font-size:.6rem"><i class="bi bi-check-circle-fill"></i> ¡Listo!</span>` : ""}
              </div>
              <div style="font-size:.78rem;color:var(--muted);margin-bottom:.4rem">${r.desc}</div>
              <div style="height:3px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden;margin-bottom:.3rem">
                <div style="height:100%;width:${Math.min(pct,100)}%;background:${completo?"#22c55e":"linear-gradient(90deg,#f59e0b,#fbbf24)"};border-radius:4px;transition:width .5s ease"></div>
              </div>
              <div style="font-size:.7rem;color:var(--dim)">${r.progreso}/${r.max} · Recompensa: <span style="color:#4ade80">${r.recompensa}</span></div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <!-- LOGROS -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-stars"></i>Logros <span style="font-size:.75rem;font-weight:400;color:var(--muted)">(${logradosCount}/${logros.length})</span></div>
      </div>
      <div class="panel-body" style="padding:.7rem">
        ${categorias.map(cat => {
          const catLogros = logros.filter(l => l.cat === cat);
          const catDone   = catLogros.filter(l => l.logrado).length;
          return `
          <div style="margin-bottom:1rem">
            <div style="font-family:'Oswald',sans-serif;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem;padding:.2rem 0;border-bottom:1px solid var(--border)">
              ${cat} · ${catDone}/${catLogros.length}
            </div>
            <div class="promo-grid">
              ${catLogros.map(l => `
              <div class="promo-card ${l.logrado?"promo-activa":""}">
                <div class="promo-icon"><i class="bi ${l.icono}" style="${l.logrado?"color:#22c55e":""}"></i></div>
                <div class="promo-nombre" style="${l.logrado?"color:#22c55e":""}">${l.nombre}</div>
                <div class="promo-desc">${l.desc}</div>
                <div class="promo-progreso">
                  <div class="promo-prog-label">
                    <span>${l.progreso}/${l.max}</span>
                    <span>${l.logrado?'<span style="color:#22c55e">✓ Logrado</span>':'En progreso'}</span>
                  </div>
                  <div class="promo-prog-bar">
                    <div class="promo-prog-fill" style="width:${Math.min((l.progreso/l.max)*100,100)}%;${l.logrado?"background:#22c55e":""}"></div>
                  </div>
                  <div style="font-size:.66rem;color:${l.logrado?"#22c55e":"var(--dim)"};margin-top:.25rem">
                    <i class="bi bi-gift"></i> ${l.recompensa}
                  </div>
                </div>
                ${l.logrado ? `<div class="promo-tag"><span class="bdg bdg-ok" style="font-size:.58rem"><i class="bi bi-check-circle-fill"></i></span></div>` : ""}
              </div>`).join("")}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;

  setTimeout(() => iniciarCountdownBoletos(), 100);
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
  const mlM            = { tigo_money:"Tigo Money", billetera_bcb:"Billetera BCB", qr_simple:"QR Interbank", efectivo_cuenta:"Cuenta bancaria" };
  const tasaVictoria   = parts?.length ? Math.round((totalGanados/parts.length)*100) : 0;

  // Alerta QR vencimiento (si fue subido hace más de 340 días)
  const qrVenceProx = qrState.subidoAt &&
    (Date.now() - new Date(qrState.subidoAt).getTime()) > (340 * 86400000);

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
    ${qrVenceProx ? `<div style="display:flex;align-items:center;gap:.75rem;background:rgba(245,158,11,.07);border:1.5px solid rgba(245,158,11,.3);border-radius:10px;padding:.85rem 1rem;margin-bottom:1rem">
      <i class="bi bi-clock-history" style="color:#f59e0b;font-size:1.4rem;flex-shrink:0"></i>
      <div>
        <div style="font-family:'Oswald',sans-serif;font-size:.9rem;color:#fff;margin-bottom:.2rem">⚠️ Tu QR puede estar próximo a vencer</div>
        <div style="font-size:.78rem;color:var(--muted)">Los QR de Tigo Money duran ~1 año. Actualízalo para seguir recibiendo premios.</div>
      </div>
      <button class="btn btn-gold btn-sm" onclick="modalSubirQR(true)" style="flex-shrink:0"><i class="bi bi-arrow-repeat"></i> Renovar</button>
    </div>` : ""}
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
          Victoria: <strong style="color:var(--gold2)">${tasaVictoria}%</strong> · ${totalPremios} premio${totalPremios!==1?"s":""} · ${totalBoltGratis} gratis usados · ${refsActivos} referidos activos
        </div>` : ""}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-qr-code"></i>Mi QR de cobros</div>
        <div style="display:flex;align-items:center;gap:.4rem">
          <button class="btn btn-ghost btn-sm" onclick="modalAyudaQR()"><i class="bi bi-question-circle"></i></button>
          ${qrState.subido ? `
          <button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()"><i class="bi bi-eye"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="modalSubirQR(true)"><i class="bi bi-arrow-repeat"></i></button>
          ` : ""}
        </div>
      </div>
      <div class="panel-body">
        ${!qrState.subido
          ? `<div class="qr-empty-state">
              <div class="qes-icon"><i class="bi bi-qr-code-scan"></i></div>
              <div class="qes-title">Sin QR de cobros</div>
              <div class="qes-sub">Necesitas un QR para participar en sorteos y recibir premios.</div>
              <div style="display:flex;gap:.5rem;justify-content:center;margin-top:1rem;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" onclick="modalAyudaQR()"><i class="bi bi-question-circle"></i> ¿Qué es esto?</button>
                <button class="btn btn-red btn-md" onclick="modalSubirQR()"><i class="bi bi-upload"></i> Subir QR</button>
              </div>
             </div>`
          : `<div class="qr-perfil-wrap">
              <img src="${qrState.url}" style="max-height:180px;max-width:100%;border-radius:10px;border:1px solid rgba(212,160,23,.22);object-fit:contain;cursor:pointer" onclick="modalVerMiQR()" loading="lazy" onerror="this.style.display='none'">
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
              ${qrState.subidoAt ? `<div style="font-size:.72rem;color:var(--muted);text-align:center">
                Subido el ${fmtDateShort(qrState.subidoAt)} ·
                <span style="color:#fbbf24"><i class="bi bi-clock"></i> Renueva en ~1 año</span>
              </div>` : ""}
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
  ok$("✅ Contraseña actualizada", "", "success");
};

/* ═══════════════════════════════════════
   ARRANQUE
═══════════════════════════════════════ */
loadSection("sorteos");

// Limpiar vencidos cada 5 min
setInterval(async () => {
  const eliminados = await limpiarBoletosVencidos();
  if (eliminados > 0) {
    await refreshProfile();
    initUserUI(currentProfile);
    const active = document.querySelector(".section.active")?.id?.replace("sec-","");
    if (active === "fidelidad") loadFidelidad();
    else if (active === "sorteos") loadSorteos();
  }
}, 5 * 60 * 1000);
