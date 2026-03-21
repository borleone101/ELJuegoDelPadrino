import { supabase } from "./supabase.js";
import { uploadFile } from "./cloudinary.js";
import { calcularChances, getModoGanadores, getSorteoTheme } from "./logica_juego.js";

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
  title, html, icon:"warning", showCancelButton:true, confirmButtonText:confirmText, cancelButtonText:"Cancelar", ...swal$
});
const loading$ = (text="Procesando...") => Swal.fire({
  title:text, allowOutsideClick:false, showConfirmButton:false, didOpen:()=>Swal.showLoading(), ...swal$
});
const ok$ = (title, html="", icon="success") => Swal.fire({
  title, html, icon, confirmButtonText:"OK", ...swal$
});
function fmtDateShort(d) { return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric"}); }
function fmtMoney(n) { return `Bs ${Number(n||0).toFixed(2)}`; }
function fmtMoneyRedondo(n) {
  const v = Number(n||0);
  if(v === Math.round(v)) return `Bs ${Math.round(v)}`;
  return `Bs ${v.toFixed(2)}`;
}

/* ═══════════════════════════════════════
   ALERTAS DE URGENCIA / FOMO
═══════════════════════════════════════ */
const URGENCY_MSGS = {
  10: [
    { emoji:"🔥", title:"¡10 cupos y se llena!", body:"El sorteo se cierra pronto. ¡Asegura tu lugar ahora!" },
    { emoji:"⚡", title:"Quedan solo 10 cupos", body:"Otros jugadores ya están viendo esto. ¡No pierdas tu chance!" },
    { emoji:"🎯", title:"¡10 spots restantes!", body:"La ronda se llena rápido. ¿Vas a dejar que otro gane?" },
  ],
  5: [
    { emoji:"🚨", title:"¡Solo 5 cupos!", body:"Casi lleno. Entra ahora antes de que sea demasiado tarde." },
    { emoji:"💥", title:"¡Últimos 5 cupos!", body:"El sorteo se cierra en cualquier momento. ¡Actúa ya!" },
    { emoji:"⏳", title:"5 cupos... y contando", body:"Cada segundo que pasa alguien puede tomar tu lugar." },
  ],
  3: [
    { emoji:"😱", title:"¡3 cupos disponibles!", body:"Esto se acaba. Entra ahora o espera la próxima ronda." },
    { emoji:"🔴", title:"¡URGENTE! Solo 3 cupos", body:"La ronda está a punto de cerrarse. ¡Última oportunidad!" },
    { emoji:"🎰", title:"¡3 spots nada más!", body:"Literalmente quedan 3 lugares. ¿Vas a ser uno de ellos?" },
  ],
  1: [
    { emoji:"😤", title:"¡EL ÚLTIMO CUPO!", body:"Solo queda 1 lugar. O entras ahora, o te quedas fuera." },
    { emoji:"🏆", title:"¡1 cupo final!", body:"El último spot está esperando. ¿Quién se lo lleva?" },
  ],
};

const _urgencyShown = new Set();
const _winnerShown = new Set();

function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function showUrgencyAlert(round, cuposLibres) {
  const thresholds = [10, 5, 3, 1];
  for (const t of thresholds) {
    const key = `${round.id}-${t}`;
    if (cuposLibres <= t && !_urgencyShown.has(key)) {
      _urgencyShown.add(key);
      const msgs = URGENCY_MSGS[t];
      const msg = getRandomItem(msgs);
      const gameName = round.game?.nombre || "El sorteo";
      const precio = round.game?.precio_boleto || 0;
      if (!puedeParticipar()) return;
      Swal.fire({
        html: `
          <div style="text-align:center;padding:.5rem 0">
            <div style="font-size:3.5rem;line-height:1;margin-bottom:.6rem;animation:urgencyBounce .6s ease infinite alternate">${msg.emoji}</div>
            <div style="font-family:'Oswald',sans-serif;font-size:1.35rem;font-weight:700;color:#fff;margin-bottom:.4rem;letter-spacing:.03em">${msg.title}</div>
            <div style="font-size:.88rem;color:#8a7a62;margin-bottom:.9rem;line-height:1.5">${msg.body}</div>
            <div style="background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.2);border-radius:9px;padding:.6rem 1rem;margin-bottom:.75rem;display:inline-block">
              <span style="font-family:'Oswald',sans-serif;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#8a7a62">Sorteo</span><br>
              <span style="font-family:'Oswald',sans-serif;font-size:1.05rem;font-weight:700;color:#fff">${gameName}</span>
              <span style="font-size:.78rem;color:#8a7a62"> · Ronda #${round.numero}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;font-size:.78rem;color:#8a7a62">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;animation:urgencyPulse 1s ease infinite"></span>
              <strong style="color:${cuposLibres<=3?"#ef4444":"#fbbf24"}">${cuposLibres} cupo${cuposLibres!==1?"s":""} disponible${cuposLibres!==1?"s":""}</strong>
              ${precio>0 ? `<span>·</span><span style="color:#d4a017">${fmtMoney(precio)}/boleto</span>` : '<span>·</span><span style="color:#22c55e">¡Gratis!</span>'}
            </div>
          </div>`,
        showCancelButton: true,
        confirmButtonText: `${msg.emoji} ¡Participar ahora!`,
        cancelButtonText: "Ahora no",
        confirmButtonColor: cuposLibres <= 3 ? '#991b1b' : '#8b1a1a',
        cancelButtonColor: '#221c14',
        background: '#131009',
        color: '#e6dcc8',
        timer: 18000,
        timerProgressBar: true,
        didOpen: () => {
          if (!document.getElementById('urgency-swal-styles')) {
            const style = document.createElement('style');
            style.id = 'urgency-swal-styles';
            style.textContent = `
              @keyframes urgencyBounce { from{transform:scale(1) rotate(-3deg)} to{transform:scale(1.15) rotate(3deg)} }
              @keyframes urgencyPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:.7} }
              .urgency-swal-popup { border-color: rgba(239,68,68,.35) !important; box-shadow: 0 0 40px rgba(139,26,26,.4), 0 0 80px rgba(0,0,0,.6) !important; }
            `;
            document.head.appendChild(style);
          }
        }
      }).then(result => {
        if (result.isConfirmed) {
          loadSection("sorteos");
          setTimeout(() => {
            window.abrirPanelCompra(round.id, gameName, round.numero, precio, round.cupos || 0, round.game?.capacidad_max || 25);
          }, 300);
        }
      });
      break;
    }
  }
}

const WINNER_TOASTS = [
  { emoji:"🏆", title:"¡Ya hay ganadores!", body:"Los resultados del sorteo están listos. ¡Ve a verlos!" },
  { emoji:"🎉", title:"¡Se cayó el sorteo!", body:"Ya se sortearon los ganadores. ¿Fuiste tú?" },
  { emoji:"👑", title:"¡Tenemos un campeón!", body:"El sorteo terminó. Descubre quién ganó ahora." },
  { emoji:"🎰", title:"¡La suerte habló!", body:"El sorteo ya fue realizado. Mira los resultados." },
  { emoji:"💰", title:"¡Premio otorgado!", body:"Ya se eligieron los ganadores del sorteo." },
];

function showWinnerAlert(roundId, gameNombre, numRonda) {
  if (_winnerShown.has(roundId)) return;
  _winnerShown.add(roundId);
  const msg = getRandomItem(WINNER_TOASTS);
  Swal.fire({
    html: `
      <div style="text-align:center;padding:.5rem 0">
        <div style="font-size:3rem;margin-bottom:.5rem;animation:winnerSpin 1s ease both">${msg.emoji}</div>
        <div style="font-family:'Oswald',sans-serif;font-size:1.3rem;font-weight:700;color:#fff;margin-bottom:.35rem;letter-spacing:.03em">${msg.title}</div>
        <div style="font-size:.85rem;color:#8a7a62;margin-bottom:.85rem;line-height:1.5">${msg.body}</div>
        <div style="background:linear-gradient(135deg,rgba(139,26,26,.15),rgba(184,134,11,.1));border:1px solid rgba(212,160,23,.3);border-radius:9px;padding:.6rem 1rem;display:inline-block">
          <span style="font-family:'Oswald',sans-serif;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:#8a7a62">Sorteo finalizado</span><br>
          <span style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:#d4a017">${gameNombre}</span>
          <span style="font-size:.78rem;color:#8a7a62"> · Ronda #${numRonda}</span>
        </div>
        <div style="margin-top:.7rem;font-size:.75rem;color:#4a3c2a">
          <span style="color:#22c55e;font-weight:600">Los premios serán enviados al QR del ganador</span>
        </div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: `${msg.emoji} Ver ganadores`,
    cancelButtonText: "Después",
    confirmButtonColor: '#8b1a1a',
    cancelButtonColor: '#221c14',
    background: '#131009',
    color: '#e6dcc8',
    timer: 20000,
    timerProgressBar: true,
    didOpen: () => {
      if (!document.getElementById('winner-swal-styles')) {
        const style = document.createElement('style');
        style.id = 'winner-swal-styles';
        style.textContent = `@keyframes winnerSpin { 0%{transform:scale(0) rotate(-180deg);opacity:0} 70%{transform:scale(1.2) rotate(10deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }`;
        document.head.appendChild(style);
      }
    }
  }).then(result => {
    if (result.isConfirmed) {
      loadSection("historial");
      setTimeout(() => window.modalVerGanadores(roundId), 400);
    }
  });
}

function toastUrgencia(cupos, roundId, gameNombre, numRonda, precio, cuposActuales, capacidadMax) {
  const thresholds = [10, 5, 3, 1];
  for (const t of thresholds) {
    const key = `toast-${roundId}-${t}`;
    if (cupos <= t && !_urgencyShown.has(key)) {
      _urgencyShown.add(key);
      const color = cupos <= 3 ? '#ef4444' : '#fbbf24';
      const icon = cupos === 1 ? '🔴' : cupos <= 3 ? '🚨' : '⚡';
      Swal.fire({
        html: `<div style="display:flex;align-items:center;gap:.75rem">
          <span style="font-size:1.5rem">${icon}</span>
          <div style="text-align:left">
            <div style="font-family:'Oswald',sans-serif;font-weight:700;color:#fff;font-size:.95rem">${gameNombre} · Ronda #${numRonda}</div>
            <div style="font-size:.8rem;color:${color};font-weight:600">¡Solo ${cupos} cupo${cupos!==1?"s":""}!</div>
          </div>
          ${puedeParticipar() ? `<button onclick="Swal.close();loadSection('sorteos');setTimeout(()=>abrirPanelCompra('${roundId}','${gameNombre.replace(/'/g,"\\'")}','${numRonda}',${precio},${cuposActuales},${capacidadMax}),300)" style="margin-left:auto;font-family:'Oswald',sans-serif;font-size:.8rem;font-weight:700;letter-spacing:.07em;background:#8b1a1a;color:#fff;border:none;border-radius:7px;padding:.42rem .85rem;cursor:pointer;white-space:nowrap;flex-shrink:0">Entrar</button>` : ""}
        </div>`,
        toast: true,
        position: "bottom-end",
        showConfirmButton: false,
        timer: 12000,
        timerProgressBar: true,
        background: '#1b1610',
        color: '#e6dcc8',
      });
      break;
    }
  }
}

/* ── Filtros compactos ── */
function buildFilterBar({ searchId, searchPlaceholder="Buscar…", chips=[], sortId, countId }) {
  const searchHtml = searchId ? `<div class="fc-search"><i class="bi bi-search fc-search-ico"></i><input id="${searchId}" type="search" placeholder="${searchPlaceholder}" class="fc-input" autocomplete="off"></div>` : "";
  const chipsHtml = chips.map(c => `<div class="fc-chip-wrap"><select id="${c.id}" class="fc-chip">${c.options.map(o=>`<option value="${o.value}">${o.label}</option>`).join("")}</select><i class="bi bi-chevron-down fc-chip-arr"></i></div>`).join("");
  const sortHtml = sortId ? `<div class="fc-chip-wrap"><select id="${sortId}" class="fc-chip"><option value="desc">↓ Reciente</option><option value="asc">↑ Antiguo</option></select><i class="bi bi-chevron-down fc-chip-arr"></i></div>` : "";
  const countHtml = countId ? `<span id="${countId}" class="fc-count"></span>` : "";
  return `<div class="filter-compact">${searchHtml}<div class="fc-row">${chipsHtml}${sortHtml}${countHtml}</div></div>`;
}
function setCount(countId, visible, total) {
  const el = getEl(countId); if (!el) return;
  el.textContent = visible===total ? `${total}` : `${visible}/${total}`;
}
function emptyFilter(msg="Sin resultados") {
  return `<div class="empty" style="padding:1.8rem 1rem"><i class="bi bi-funnel"></i><p>${msg}<br><small style="color:var(--dim)">Cambia los filtros</small></p></div>`;
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
const { data:{ session }, error: sessionError } = await supabase.auth.getSession();
if (!session || sessionError) { window.location.href = "../../auth/login.html"; throw 0; }
const { data:{ user }, error: userError } = await supabase.auth.getUser();
if (!user || userError) { await supabase.auth.signOut(); window.location.href = "../../auth/login.html"; throw 0; }
const MY_USER_ID = user.id;
const { data:profile, error:profileError } = await supabase.from("profiles").select("*").eq("id", MY_USER_ID).single();
if (!profile || profileError || profile.estado === "suspendido") { await supabase.auth.signOut(); window.location.href = "../../auth/login.html"; throw 0; }

/* ═══════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════ */
let currentProfile = { ...profile };
let boletosGratis = 0;
let boletosGratisDetalle = [];

async function refreshProfile() {
  const { data } = await supabase.from("profiles").select("*").eq("id", MY_USER_ID).single();
  if (data) currentProfile = { ...data };
  const { data:bgs } = await supabase.from("boletos_gratis").select("id,origen,created_at").eq("user_id", MY_USER_ID).eq("usado", false).order("created_at",{ascending:true});
  boletosGratisDetalle = bgs || [];
  boletosGratis = boletosGratisDetalle.length;
  return currentProfile;
}
await refreshProfile();

function initUserUI(prof) {
  const ini = (prof.username?.[0]||"?").toUpperCase();
  if(getEl("tbName"))  getEl("tbName").textContent  = prof.username;
  if(getEl("tbAvatar"))getEl("tbAvatar").textContent= ini;
  if(getEl("sbName"))  getEl("sbName").textContent  = prof.username;
  if(getEl("sbAvatar"))getEl("sbAvatar").textContent= ini;
  if(getEl("sbSaldo")) getEl("sbSaldo").textContent = Number(prof.total_ganado||0).toFixed(2);
  if(getEl("heroSaldo"))getEl("heroSaldo").textContent = Number(prof.total_ganado||0).toFixed(2);
  const hBF = getEl("heroBoletosFree");
  if(hBF) hBF.textContent = boletosGratis>0 ? `${boletosGratis} gratis 🎁` : "0 disponibles";
}
initUserUI(currentProfile);

async function doLogout() {
  const r = await confirm$("¿Cerrar sesión?","","Sí, salir");
  if(r.isConfirmed){ supabase.removeAllChannels(); await supabase.auth.signOut(); window.location.href="../../auth/login.html"; }
}
getEl("logoutBtn")  && getEl("logoutBtn").addEventListener("click",  doLogout);
getEl("logoutBtn2") && getEl("logoutBtn2").addEventListener("click", doLogout);

/* ═══════════════════════════════════════
   REALTIME
═══════════════════════════════════════ */
let realtimeSetup = false;
function setupRealtime() {
  if(realtimeSetup) return; realtimeSetup = true;

  supabase.channel("rounds-watch")
    .on("postgres_changes",{event:"*",schema:"public",table:"rounds"}, async (payload) => {
      await refreshProfile(); initUserUI(currentProfile);
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if(active==="sorteos") loadSorteos(true);
      else if(active==="historial") loadHistorial();

      if(payload.eventType==="UPDATE"){
        if(payload.old?.estado==="abierta" && payload.new?.estado==="sorteada"){
          let gName = payload.new?.game_nombre || "Sorteo";
          if(payload.new?.game_id) {
            const { data:gd } = await supabase.from("games").select("nombre").eq("id", payload.new.game_id).single();
            if(gd) gName = gd.nombre;
          }
          showWinnerAlert(payload.new.id, gName, payload.new?.numero || "—");
        } else if(payload.new?.estado==="abierta" && payload.old?.estado!=="abierta"){
          toast("🎟️ Nueva ronda disponible","success",3000);
        }
      }

      if(payload.eventType==="UPDATE" && payload.new?.estado==="abierta"){
        _checkRoundUrgency(payload.new);
      }
    }).subscribe();

  supabase.channel("participations-urgency")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"participations"}, async (payload) => {
      if(!puedeParticipar()) return;
      const roundId = payload.new?.round_id;
      if(!roundId) return;

      const { data:round } = await supabase.from("rounds")
        .select("id,numero,estado,game_id")
        .eq("id", roundId)
        .eq("estado","abierta")
        .single();
      if(!round) return;

      let gameData = null;
      if(round.game_id){
        const { data:gd } = await supabase.from("games").select("nombre,precio_boleto,capacidad_max").eq("id",round.game_id).single();
        gameData = gd;
      }

      const capacidadMax = gameData?.capacidad_max || 25;
      const { count } = await supabase.from("participations")
        .select("id", {count:"exact", head:true})
        .eq("round_id", roundId);
      const cuposOcupados = count || 0;
      const cuposLibres = Math.max(0, capacidadMax - cuposOcupados);

      const roundEnriquecida = { ...round, cupos: cuposOcupados, game: gameData };

      const { count:yaCuento } = await supabase.from("participations")
        .select("id",{count:"exact",head:true})
        .eq("round_id",roundId)
        .eq("user_id",MY_USER_ID);
      const yaParticiping = (yaCuento||0) > 0;

      if(!yaParticiping && cuposLibres > 0 && cuposLibres <= 10){
        toastUrgencia(cuposLibres, roundId, gameData?.nombre||"Sorteo", round.numero, gameData?.precio_boleto||0, cuposOcupados, capacidadMax);
        const umbralesModal = [5, 3, 1];
        if(umbralesModal.includes(cuposLibres)){
          setTimeout(() => showUrgencyAlert(roundEnriquecida, cuposLibres), 800);
        }
      }
    }).subscribe();

  supabase.channel("my-payments-watch")
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"payments",filter:`user_id=eq.${MY_USER_ID}`}, async(payload)=>{
      await refreshProfile(); initUserUI(currentProfile);
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if(active==="pagos") loadPagos();
      else if(active==="sorteos") loadSorteos(true);
      const estado = payload.new?.estado;
      if(estado==="aprobado") toast("✅ Pago aprobado — ¡ya participas!","success",4000);
      else if(estado==="rechazado"){
        Swal.fire({title:"⚠️ Pago rechazado",html:`Tu comprobante fue rechazado.<br><small style="color:var(--muted)">Revisa "Mis pagos".</small>`,icon:"warning",confirmButtonText:"Ver pagos",...swal$})
          .then(r=>{ if(r.isConfirmed) loadSection("pagos"); });
      }
    }).subscribe();

  supabase.channel("my-parts-watch")
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"participations",filter:`user_id=eq.${MY_USER_ID}`}, async(payload)=>{
      await refreshProfile(); initUserUI(currentProfile);
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if(active==="historial") loadHistorial();
      const res = payload.new?.resultado;
      if(res==="ganada"){
        Swal.fire({title:"🏆 ¡GANASTE!",html:`<div style="text-align:center"><div style="font-size:3rem">🎉</div><div style="color:var(--cream);font-size:1.05rem;margin:.5rem 0">¡Felicidades! Ganaste en el sorteo.</div><div style="font-size:.82rem;color:var(--muted)">El admin enviará tu premio al QR registrado.</div></div>`,icon:"success",confirmButtonText:"¡Genial!",...swal$});
      } else if(res==="perdida") toast("Sin suerte esta vez. ¡Sigue participando!","info",3500);
    }).subscribe();

  supabase.channel("my-boletos-watch")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"boletos_gratis",filter:`user_id=eq.${MY_USER_ID}`}, async(payload)=>{
      await refreshProfile(); initUserUI(currentProfile);
      toast(`🎁 ¡Boleto gratis recibido! (${payload.new?.origen||"Recompensa"})`,"success",5000);
      const active = document.querySelector(".section.active")?.id?.replace("sec-","");
      if(active==="fidelidad") loadFidelidad();
    }).subscribe();

  supabase.channel("my-profile-watch")
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles",filter:`id=eq.${MY_USER_ID}`}, async(payload)=>{
      await refreshProfile(); initUserUI(currentProfile);
      if(!payload.old?.qr_verificado&&payload.new?.qr_verificado){
        qrState.verificado=true;
        toast("✅ QR verificado. ¡Ya puedes participar!","success",5000);
        const active=document.querySelector(".section.active")?.id?.replace("sec-","");
        if(active==="sorteos") loadSorteos(true);
      }
    }).subscribe();

  supabase.channel("my-prizes-watch")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"prize_payments",filter:`user_id=eq.${MY_USER_ID}`}, async(payload)=>{
      await refreshProfile(); initUserUI(currentProfile);
      const monto=payload.new?.monto;
      Swal.fire({title:"💰 ¡Premio enviado!",html:`<div style="text-align:center"><div style="font-size:2rem">🏆</div><div style="color:var(--cream)">Te enviaron <strong style="color:#22c55e">${fmtMoney(monto)}</strong></div></div>`,icon:"success",confirmButtonText:"Ver premios",...swal$})
        .then(r=>{ if(r.isConfirmed) loadSection("premios"); });
    }).subscribe();
}
setupRealtime();

async function _checkRoundUrgency(roundData) {
  if(!puedeParticipar() || !roundData?.id) return;
  const capacidadMax = roundData.game?.capacidad_max || 25;
  const { count } = await supabase.from("participations")
    .select("id",{count:"exact",head:true})
    .eq("round_id", roundData.id);
  const cuposLibres = Math.max(0, capacidadMax - (count||0));
  if(cuposLibres <= 10 && cuposLibres > 0){
    const { count:yaCuento } = await supabase.from("participations")
      .select("id",{count:"exact",head:true})
      .eq("round_id",roundData.id)
      .eq("user_id",MY_USER_ID);
    if((yaCuento||0) === 0){
      toastUrgencia(cuposLibres, roundData.id, roundData.game?.nombre||"Sorteo", roundData.numero, roundData.game?.precio_boleto||0, count||0, capacidadMax);
    }
  }
}

/* ═══════════════════════════════════════
   QR STATE
═══════════════════════════════════════ */
let qrState = {
  subido:    !!currentProfile.qr_cobro_url,
  verificado:!!currentProfile.qr_verificado,
  url:       currentProfile.qr_cobro_url||null,
  metodo:    currentProfile.qr_metodo||null,
  subidoAt:  currentProfile.qr_subido_at||null,
};
function puedeParticipar() { return qrState.subido && qrState.verificado; }

function qrBanner() {
  if(puedeParticipar()) return "";
  if(!qrState.subido) return `<div class="qr-gate-banner"><div class="qgb-icon"><i class="bi bi-qr-code-scan"></i></div><div class="qgb-body"><div class="qgb-title">Sube tu QR de cobros para participar</div><div class="qgb-sub">Necesitas subir tu QR para comprar boletos y recibir premios.</div></div><button class="btn btn-gold btn-md" onclick="modalSubirQR()"><i class="bi bi-upload"></i> Subir QR</button></div>`;
  return `<div class="qr-gate-banner qgb-pending"><div class="qgb-icon"><i class="bi bi-hourglass-split"></i></div><div class="qgb-body"><div class="qgb-title">QR pendiente de verificación</div><div class="qgb-sub">El administrador está revisando tu QR.</div></div><button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()"><i class="bi bi-eye"></i> Ver</button></div>`;
}

/* ═══════════════════════════════════════
   MODAL SUBIR QR
═══════════════════════════════════════ */
const METODOS_QR = [
  { value:"tigo_money",     label:"Tigo Money",        desc:"QR Tigo Money Bolivia"    },
  { value:"billetera_bcb",  label:"Billetera BCB",     desc:"QR del Banco Central"     },
  { value:"qr_simple",      label:"QR Interbank",      desc:"QR estándar bancario"     },
  { value:"efectivo_cuenta",label:"Cuenta bancaria",   desc:"Depósito en cuenta"       },
];

window.modalSubirQR = async (esAct=false) => {
  const { value:v } = await Swal.fire({
    title: esAct?"Actualizar QR de cobros":"Sube tu QR de cobros",
    html:`<div style="text-align:left">
      <div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.2);border-radius:10px;padding:.8rem 1rem;margin-bottom:1rem;font-size:.82rem;color:var(--muted)">
        <i class="bi bi-info-circle" style="color:var(--gold2)"></i> Si ganas, el admin usará tu QR para enviarte el premio.
      </div>
      <div class="field" style="margin-bottom:1rem">
        <label>Tipo de pago *</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.2rem">
          ${METODOS_QR.map(m=>`<label style="display:flex;align-items:flex-start;gap:.5rem;padding:.6rem .7rem;background:var(--ink3);border:1px solid ${m.value===(qrState.metodo||'')?'var(--gold2)':'var(--border)'};border-radius:8px;cursor:pointer" class="metodo-card" data-val="${m.value}"><input type="radio" name="qrMetodo" value="${m.value}" ${m.value===(qrState.metodo||'')?'checked':''} style="margin-top:.15rem;accent-color:var(--red2)"><div><div style="font-size:.85rem;font-weight:600;color:#fff">${m.label}</div><div style="font-size:.7rem;color:var(--muted)">${m.desc}</div></div></label>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>Imagen del QR * <span style="color:var(--muted);font-size:.68rem;font-weight:400;text-transform:none">(JPG/PNG, máx. 5 MB)</span></label>
        <input type="file" id="qrFileInput" accept="image/jpeg,image/png,image/webp" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem;font-size:.85rem">
      </div>
      <img id="qrPreviewImg" style="display:none;max-height:160px;width:100%;object-fit:contain;margin-top:.6rem;border-radius:8px;border:1px solid rgba(212,160,23,.2)">
    </div>`,
    showCancelButton:true,
    confirmButtonText:`<i class='bi bi-upload'></i> ${esAct?'Actualizar':'Subir QR'}`,
    cancelButtonText:"Cancelar", width:500, ...swal$,
    didOpen:()=>{
      document.querySelectorAll(".metodo-card").forEach(c=>{
        c.addEventListener("click",()=>{ document.querySelectorAll(".metodo-card").forEach(x=>x.style.borderColor="var(--border)"); c.style.borderColor="var(--gold2)"; });
      });
      document.getElementById("qrFileInput").addEventListener("change",e=>{
        const f=e.target.files[0]; if(!f) return;
        const r=new FileReader(); r.onload=ev=>{const i=document.getElementById("qrPreviewImg");i.src=ev.target.result;i.style.display="block";}; r.readAsDataURL(f);
      });
    },
    preConfirm:()=>{
      const metodo=document.querySelector("input[name='qrMetodo']:checked")?.value;
      const file=document.getElementById("qrFileInput").files[0];
      if(!metodo){Swal.showValidationMessage("Selecciona el tipo de pago");return false;}
      if(!file){Swal.showValidationMessage("Sube la imagen de tu QR");return false;}
      if(file.size>5*1024*1024){Swal.showValidationMessage("Imagen muy grande (máx. 5 MB)");return false;}
      return{metodo,file};
    }
  });
  if(!v) return;
  loading$("Subiendo QR...");
  let qr_url;
  try{ qr_url=await uploadFile(v.file,"el-padrino/qr-cobros"); }
  catch{ Swal.close(); ok$("Error al subir imagen","","error"); return; }
  const{error}=await supabase.from("profiles").update({qr_cobro_url:qr_url,qr_metodo:v.metodo,qr_verificado:false,qr_subido_at:new Date().toISOString()}).eq("id",MY_USER_ID);
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  qrState={subido:true,verificado:false,url:qr_url,metodo:v.metodo,subidoAt:new Date().toISOString()};
  await ok$("QR subido correctamente","El admin lo verificará. Recibirás notificación cuando sea aprobado.","success");
  const active=document.querySelector(".section.active")?.id?.replace("sec-","");
  if(active) loadSection(active);
};

window.modalVerMiQR=()=>{
  if(!qrState.url) return;
  const ml={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};
  Swal.fire({
    title:"Mi QR de cobros",
    html:`<img src="${qrState.url}" style="width:100%;max-height:280px;object-fit:contain;border-radius:10px;border:1px solid rgba(212,160,23,.2);margin-bottom:.8rem">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
      <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem"><div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">MÉTODO</div><div>${ml[qrState.metodo]||qrState.metodo||"—"}</div></div>
      <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem"><div style="font-size:.68rem;color:var(--muted);margin-bottom:.2rem">ESTADO</div><div>${qrState.verificado?'<span style="color:#22c55e">✅ Verificado</span>':'<span style="color:#f59e0b">⏳ En revisión</span>'}</div></div>
    </div>`,
    showCancelButton:true, confirmButtonText:'<i class="bi bi-arrow-repeat"></i> Actualizar QR', cancelButtonText:"Cerrar", width:400, ...swal$
  }).then(r=>{if(r.isConfirmed) modalSubirQR(true);});
};

/* ═══════════════════════════════════════
   NAVEGACIÓN
═══════════════════════════════════════ */
const secciones = {
  sorteos:()=>loadSorteos(), historial:loadHistorial, pagos:loadPagos,
  premios:loadPremios, referidos:loadReferidos, fidelidad:loadFidelidad, perfil:loadPerfil
};
function loadSection(sec) {
  document.querySelectorAll(".section").forEach(s=>{s.classList.remove("active");s.style.display="none";});
  const el=document.getElementById(`sec-${sec}`);
  if(el){el.style.display="block";el.classList.add("active");}
  document.querySelectorAll("[data-sec]").forEach(b=>b.classList.toggle("active",b.dataset.sec===sec));
  if(window.innerWidth<769){ document.getElementById("sidebar")?.classList.remove("open"); document.getElementById("sbOverlay")?.classList.remove("open"); }
  secciones[sec]?.();
}
document.querySelectorAll("[data-sec]").forEach(btn=>btn.addEventListener("click",()=>loadSection(btn.dataset.sec)));
getEl("btnRefresh")&&getEl("btnRefresh").addEventListener("click",async()=>{
  const active=document.querySelector(".section.active")?.id?.replace("sec-","");
  await refreshProfile(); initUserUI(currentProfile);
  loadSection(active||"sorteos");
  toast("Actualizado","success",1500);
});

/* ═══════════════════════════════════════
   NIVEL / GAMIFICACIÓN
═══════════════════════════════════════ */
function getNivel(t) {
  if(t>=500) return{key:"leyenda",   label:"La Leyenda",    clase:"nivel-leyenda"    };
  if(t>=200) return{key:"padrino",   label:"El Padrino",    clase:"nivel-padrino"    };
  if(t>=100) return{key:"capo",      label:"Capo di Tutti", clase:"nivel-capo"       };
  if(t>=50)  return{key:"patron",    label:"Gran Patrón",   clase:"nivel-patron"     };
  if(t>=20)  return{key:"contendiente",label:"Contendiente",clase:"nivel-contendiente"};
  if(t>=5)   return{key:"jugador",   label:"Jugador",       clase:"nivel-jugador"    };
  return          {key:"novato",     label:"Novato",        clase:"nivel-novato"     };
}
function getProximoNivel(t) {
  if(t>=500) return null;
  const umbrales=[5,20,50,100,200,500];
  const nombres=["Jugador","Contendiente","Gran Patrón","Capo di Tutti","El Padrino","La Leyenda"];
  for(let i=0;i<umbrales.length;i++) if(t<umbrales[i]) return{label:nombres[i],requerido:umbrales[i],progreso:t,pct:Math.round((t/umbrales[i])*100)};
  return null;
}

/* ═══════════════════════════════════════
   HELPERS RONDAS
═══════════════════════════════════════ */
async function estadoBoletoGratisEnRonda(roundId) {
  const[{data:miUso},{count:totalGratisEnRonda},{count:yoGratisEnPart}]=await Promise.all([
    supabase.from("boletos_gratis").select("id").eq("user_id",MY_USER_ID).eq("usado_en_round",roundId).limit(1),
    supabase.from("participations").select("id",{count:"exact",head:true}).eq("round_id",roundId).eq("es_gratis",true),
    supabase.from("participations").select("id",{count:"exact",head:true}).eq("round_id",roundId).eq("user_id",MY_USER_ID).eq("es_gratis",true),
  ]);
  const miGratis=(yoGratisEnPart||0)>0;
  const otrosConGratis=Math.max(0,(totalGratisEnRonda||0)-(miGratis?1:0));
  return{yoUse:(miUso?.length||0)>0||miGratis,otrosConGratis,totalGratisEnRonda:totalGratisEnRonda||0};
}

/* ═══════════════════════════════════════
   SORTEOS ACTIVOS — Vista lista/grid con imágenes
═══════════════════════════════════════ */
let vistaGrid = localStorage.getItem("vistaGrid")==="true";

async function loadSorteos(silencioso=false) {
  const container=getEl("sorteosList"); if(!container) return;
  if(!silencioso) container.innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;

  const bannerEl=getEl("qrGateBanner");
  if(bannerEl){
    bannerEl.innerHTML=qrBanner();
    if(boletosGratis>0&&puedeParticipar()){
      const bfb=document.createElement("div"); bfb.className="boleto-gratis-banner";
      bfb.innerHTML=`<i class="bi bi-gift-fill bfb-icon"></i><div><div class="bfb-title">Tienes ${boletosGratis} boleto${boletosGratis>1?"s":""} gratis</div><div class="bfb-sub">Solo 1 por sorteo · ¡Úsalos antes de que venzan!</div></div>`;
      bannerEl.appendChild(bfb);
    }
  }

  const[{data:rounds,error:rErr}]=await Promise.all([
    supabase.from("rounds").select("id,numero,estado,created_at,game_id").eq("estado","abierta").order("created_at",{ascending:false})
  ]);
  if(rErr||!rounds?.length){
    container.innerHTML=`<div class="empty"><i class="bi bi-ticket-perforated"></i><p>No hay sorteos activos.<br><small style="color:var(--dim)">El administrador abrirá nuevas rondas pronto.</small></p></div>`;
    return;
  }

  const gameIds=[...new Set(rounds.map(r=>r.game_id).filter(Boolean))];
  let gamesMap={};
  if(gameIds.length){
    const{data:gd}=await supabase.from("games").select("id,nombre,descripcion,precio_boleto,capacidad_max").in("id",gameIds);
    (gd||[]).forEach(g=>{gamesMap[g.id]=g;});
  }

  const roundsData=await Promise.all(rounds.map(async r=>{
    const capacidadMax = gamesMap[r.game_id]?.capacidad_max || 25;
    const[{data:allParts},{data:misParts},{data:myPay}]=await Promise.all([
      supabase.from("participations").select("boletos,es_gratis,user_id").eq("round_id",r.id),
      supabase.from("participations").select("boletos,es_gratis").eq("round_id",r.id).eq("user_id",MY_USER_ID),
      supabase.from("payments").select("id,estado").eq("round_id",r.id).eq("user_id",MY_USER_ID).maybeSingle(),
    ]);
    const cupos=(allParts||[]).reduce((s,p)=>s+(p.boletos||1),0);
    const boletosGratisEnRonda=(allParts||[]).filter(p=>p.es_gratis===true).reduce((s,p)=>s+(p.boletos||0),0);
    const otrosConGratis=(allParts||[]).filter(p=>p.es_gratis===true&&p.user_id!==MY_USER_ID).length;
    const misBoletos=(misParts||[]).reduce((s,p)=>s+(p.boletos||1),0);
    const yoUseGratis=(misParts||[]).some(p=>p.es_gratis===true);
    return{...r,cupos,capacidadMax,game:gamesMap[r.game_id],misBoletos,miPago:myPay,boletosGratisEnRonda,yoUseGratis,otrosConGratis};
  }));

  const conMi=roundsData.filter(r=>r.misBoletos>0);
  const sinMi=roundsData.filter(r=>r.misBoletos===0).sort((a,b)=>b.cupos-a.cupos);
  const ordenados=[...conMi,...sinMi];

  // ── Inyectar CSS de urgencia y sorteo themes ──
  _inyectarCSSorteos();

  const ctrlHtml=`<div class="sorteos-ctrl">
    <span style="font-size:.78rem;color:var(--muted)">${ordenados.length} sorteo${ordenados.length!==1?"s":""}</span>
    <div class="vista-toggle">
      <button class="vt-btn ${!vistaGrid?"active":""}" id="btnVistaLista" title="Lista"><i class="bi bi-list-ul"></i></button>
      <button class="vt-btn ${vistaGrid?"active":""}" id="btnVistaGrid" title="Cuadrícula"><i class="bi bi-grid-fill"></i></button>
    </div>
  </div>`;

  const renderCard=(r,grid=false)=>{
    const capacidadMax = r.capacidadMax || r.game?.capacidad_max || 25;
    const pct=Math.round((r.cupos/capacidadMax)*100);
    const lleno=r.cupos>=capacidadMax;
    const cuposLibres=capacidadMax-r.cupos;
    const tieneCompPend=r.miPago?.estado==="pendiente";
    const tieneCompAprobado=r.miPago?.estado==="aprobado";
    const chances=r.misBoletos>0?calcularChances(r.misBoletos,r.cupos-r.misBoletos,capacidadMax):null;
    const estoyDentro=r.misBoletos>0;
    const modo=getModoGanadores(capacidadMax);
    const theme=getSorteoTheme(r.game?.nombre||"");

    // ── Premio potencial ──
    const totalRecaudado=(r.cupos)*(r.game?.precio_boleto||0);
    const premioPool=totalRecaudado*0.70;
    const premioLabel=r.game?.precio_boleto>0&&r.cupos>0
      ? (modo===1
          ? `<span class="sorteo-premio-hint">🏆 Premio: <strong style="color:#22c55e">${fmtMoneyRedondo(Math.round(premioPool/5)*5)}</strong></span>`
          : `<span class="sorteo-premio-hint">🏆 Hasta: <strong style="color:#22c55e">${fmtMoneyRedondo(Math.round(premioPool*0.5/5)*5)}</strong></span>`)
      : "";

    // ── Badge modo ganadores ──
    const modoBadge = modo === 1
      ? `<span class="sorteo-modo-badge modo-1">🥇 1 Ganador</span>`
      : `<span class="sorteo-modo-badge modo-3">🏅 3 Ganadores</span>`;

    // ── Badge de urgencia ──
    const urgencyBadge = !estoyDentro && !lleno && cuposLibres <= 10 ? `
      <div style="display:inline-flex;align-items:center;gap:.28rem;font-family:'Oswald',sans-serif;font-size:.68rem;font-weight:700;letter-spacing:.06em;color:${cuposLibres<=3?"#ef4444":"#fbbf24"};background:${cuposLibres<=3?"rgba(239,68,68,.12)":"rgba(245,158,11,.1)"};border:1px solid ${cuposLibres<=3?"rgba(239,68,68,.3)":"rgba(245,158,11,.25)"};border-radius:20px;padding:.18rem .6rem;margin-top:.3rem;${cuposLibres<=3?"animation:urgencyPulse2 1.2s ease-in-out infinite":""}">
        ${cuposLibres<=3?"🔴":"⚡"} ${cuposLibres} cupo${cuposLibres!==1?"s":""}
      </div>` : "";

    const fondoWarn=r.boletosGratisEnRonda>=3?`<div class="fondo-warn"><i class="bi bi-exclamation-triangle-fill"></i><span>Esta ronda tiene ${r.boletosGratisEnRonda} boleto${r.boletosGratisEnRonda>1?"s":""} gratis — el fondo puede ser menor.</span></div>`:"";
    const gratisWarn=!r.yoUseGratis&&r.otrosConGratis>0&&boletosGratis>0?`<div class="gratis-competencia-badge"><i class="bi bi-lightning-charge-fill"></i>${r.otrosConGratis} jugador${r.otrosConGratis>1?"es":""}  con boleto gratis aquí</div>`:"";

    let btnHtml="";
    if(!puedeParticipar()){
      btnHtml=!qrState.subido?`<button class="btn btn-gold btn-md" onclick="modalSubirQR()"><i class="bi bi-qr-code-scan"></i> Subir QR</button>`:`<button class="btn btn-ghost btn-md" disabled><i class="bi bi-hourglass-split"></i> QR en revisión</button>`;
    } else if(lleno){
      btnHtml=`<button class="btn btn-ghost btn-md" disabled><i class="bi bi-lock-fill"></i> Llena</button>`;
    } else if(tieneCompPend){
      btnHtml=`<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> En revisión</span>`;
    } else if(tieneCompAprobado&&r.misBoletos>0){
      btnHtml=`<span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> ${r.misBoletos} boleto${r.misBoletos>1?"s":""}</span>
        <button class="btn btn-ghost btn-sm" onclick="abrirPanelCompra('${r.id}','${(r.game?.nombre||"").replace(/'/g,"\\'")}','${r.numero}',${r.game?.precio_boleto||0},${r.cupos},${capacidadMax})"><i class="bi bi-plus-circle"></i> Más</button>`;
    } else {
      const gratisTag=boletosGratis>0&&!r.yoUseGratis?`<span class="bdg bdg-free" style="margin-left:.3rem"><i class="bi bi-gift-fill"></i> Gratis</span>`:"";
      btnHtml=`<button class="btn btn-red btn-md" onclick="abrirPanelCompra('${r.id}','${(r.game?.nombre||"").replace(/'/g,"\\'")}','${r.numero}',${r.game?.precio_boleto||0},${r.cupos},${capacidadMax})"><i class="bi bi-ticket-perforated-fill"></i> Participar</button>${gratisTag}`;
    }

    // ── IMAGEN / HEADER DEL SORTEO ──
    const imgHeader = `
    <div class="sorteo-img-header ${theme.clase}" style="background:${theme.gradient};">
      <div class="sih-overlay"></div>
      <div class="sih-icon">${theme.icon}</div>
      <div class="sih-badges">
        ${modoBadge}
        ${r.game?.precio_boleto===0?`<span class="sih-free-badge">GRATIS</span>`:""}
      </div>
      ${estoyDentro?`<div class="sih-participating"><i class="bi bi-person-fill-check"></i> Participando</div>`:""}
      ${!estoyDentro&&!lleno&&cuposLibres<=5?`<div class="sih-urgency-ribbon">${cuposLibres===1?"¡ÚLTIMO CUPO!":"¡QUEDAN "+cuposLibres+"!"}</div>`:""}
    </div>`;

    if(grid) return `<div class="sorteo-card-grid${estoyDentro?" si-participando":""}" style="${!estoyDentro&&!lleno&&cuposLibres<=3?"border-color:rgba(239,68,68,.35);":""}">
      ${imgHeader}
      <div style="padding:.85rem .9rem .5rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.4rem;margin-bottom:.5rem">
          <div>
            <div class="si-nombre" style="font-size:.95rem">${r.game?.nombre??"—"}</div>
            <div class="si-sub">Ronda #${r.numero}</div>
            ${urgencyBadge}
          </div>
          ${r.game?.precio_boleto>0?`<div class="si-precio" style="font-size:1rem">${fmtMoney(r.game.precio_boleto)}<span>/boleto</span></div>`:"<div class='si-precio' style='font-size:.9rem;color:#22c55e'>¡GRATIS!</div>"}
        </div>
        <div class="prog-label"><span>Participantes</span><span class="${lleno?"text-green":""}"><strong>${r.cupos}</strong>/${capacidadMax}</span></div>
        <div class="prog-bg" style="margin-bottom:.5rem"><div class="prog-fill${lleno?" full":""}" style="width:${Math.min(pct,100)}%;background:${theme.accent}22;background:linear-gradient(90deg,${theme.accent}88,${theme.accent})"></div></div>
        ${chances?`<div style="font-size:.72rem;color:${theme.accent};margin-bottom:.4rem"><i class="bi bi-graph-up"></i> ${chances.chance}% probabilidad</div>`:""}
        ${premioLabel?`<div style="margin-bottom:.3rem">${premioLabel}</div>`:""}
        ${fondoWarn}${gratisWarn}
      </div>
      <div class="si-foot" style="padding:.55rem .9rem">${r.misBoletos>0?`<div class="mi-boletos"><i class="bi bi-ticket-perforated-fill"></i><strong>${r.misBoletos}</strong></div>`:"<div></div>"}<div>${btnHtml}</div></div>
    </div>`;

    return `<div class="sorteo-item${estoyDentro?" si-participando":""}" style="${!estoyDentro&&!lleno&&cuposLibres<=3?"border-color:rgba(239,68,68,.35);":""}">
      ${imgHeader}
      <div class="si-head">
        <div>
          <div class="si-nombre">${r.game?.nombre??"—"}</div>
          <div class="si-sub">Ronda #${r.numero}${r.game?.descripcion?" · "+r.game.descripcion:""}</div>
          ${urgencyBadge}
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${r.game?.precio_boleto>0?`<div class="si-precio">${fmtMoney(r.game.precio_boleto)}<span>/boleto</span></div>`:"<div class='si-precio' style='color:#22c55e'>¡GRATIS!</div>"}
          ${premioLabel?`<div style="margin-top:.2rem">${premioLabel}</div>`:""}
        </div>
      </div>
      <div class="si-prog">
        <div class="prog-label">
          <span>Participantes <span style="color:var(--dim);font-size:.72em">(${modo===1?"1 ganador":"3 ganadores"})</span></span>
          <span class="${lleno?"text-green":""}"><strong>${r.cupos}</strong>/${capacidadMax}${lleno?" 🔒 LLENO":""}</span>
        </div>
        <div class="prog-bg"><div class="prog-fill${lleno?" full":""}" style="width:${Math.min(pct,100)}%;background:linear-gradient(90deg,${theme.accent}88,${theme.accent})"></div></div>
      </div>
      ${chances?`<div class="chances-bar"><div class="cb-header"><span class="cb-label">Tu probabilidad</span><span class="cb-pct" style="color:${theme.accent}">${chances.chance}%</span></div><div class="cb-track"><div class="cb-fill" style="width:${Math.min(chances.chance,100)}%;background:${theme.accent}"></div></div><div class="cb-tier"><i class="bi bi-graph-up"></i> ${chances.descripcion}</div></div>`:""}
      ${gratisWarn}${fondoWarn}
      <div class="si-foot">${r.misBoletos>0?`<div class="mi-boletos"><i class="bi bi-ticket-perforated-fill"></i> Mis boletos: <strong>${r.misBoletos}</strong></div>`:"<div></div>"}<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">${btnHtml}</div></div>
    </div>`;
  };

  container.innerHTML=ctrlHtml+`<div id="sorteosCards" class="${vistaGrid?"sorteos-grid":""}"></div>`;

  const cardsEl=getEl("sorteosCards");
  cardsEl.innerHTML=ordenados.map(r=>renderCard(r,vistaGrid)).join("");

  getEl("btnVistaLista")?.addEventListener("click",()=>{ vistaGrid=false; localStorage.setItem("vistaGrid","false"); cardsEl.className=""; cardsEl.innerHTML=ordenados.map(r=>renderCard(r,false)).join(""); document.querySelectorAll(".vt-btn").forEach((b,i)=>b.classList.toggle("active",i===0)); });
  getEl("btnVistaGrid")?.addEventListener("click",()=>{ vistaGrid=true; localStorage.setItem("vistaGrid","true"); cardsEl.className="sorteos-grid"; cardsEl.innerHTML=ordenados.map(r=>renderCard(r,true)).join(""); document.querySelectorAll(".vt-btn").forEach((b,i)=>b.classList.toggle("active",i===1)); });
}

function _inyectarCSSorteos() {
  if(document.getElementById('sorteo-themes-css')) return;
  const s = document.createElement('style');
  s.id = 'sorteo-themes-css';
  s.textContent = `
    @keyframes urgencyPulse2 { 0%,100%{opacity:1} 50%{opacity:.55} }
    @keyframes sihIconFloat { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-4px) scale(1.06)} }
    @keyframes ribbonShine { 0%{opacity:.8} 50%{opacity:1} 100%{opacity:.8} }

    /* ── Imagen/Header del sorteo ── */
    .sorteo-img-header {
      position:relative;
      height:90px;
      overflow:hidden;
      flex-shrink:0;
    }
    .sorteo-item .sorteo-img-header { height:80px; border-radius:11px 11px 0 0; }
    .sorteo-card-grid .sorteo-img-header { height:85px; border-radius:11px 11px 0 0; }

    .sih-overlay {
      position:absolute;inset:0;
      background:linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.5) 100%);
    }
    .sih-icon {
      position:absolute;
      right:1rem; top:50%; transform:translateY(-50%);
      font-size:2.8rem;
      filter:drop-shadow(0 2px 8px rgba(0,0,0,.5));
      animation:sihIconFloat 3s ease-in-out infinite;
      line-height:1;
    }
    .sorteo-card-grid .sih-icon { font-size:2.2rem; right:.75rem; }

    .sih-badges {
      position:absolute;
      top:.55rem; left:.75rem;
      display:flex;flex-direction:column;gap:.3rem;
    }

    .sih-participating {
      position:absolute;
      bottom:.5rem; left:.75rem;
      font-family:'Oswald',sans-serif;
      font-size:.65rem; font-weight:600; letter-spacing:.07em;
      color:#fff;
      background:rgba(34,197,94,.28);
      border:1px solid rgba(34,197,94,.45);
      border-radius:20px;
      padding:.12rem .55rem;
      display:inline-flex;align-items:center;gap:.25rem;
    }

    .sih-urgency-ribbon {
      position:absolute;
      bottom:0; right:0;
      font-family:'Oswald',sans-serif;
      font-size:.6rem; font-weight:700; letter-spacing:.1em;
      color:#fff;
      background:linear-gradient(135deg,#991b1b,#dc2626);
      padding:.22rem .65rem;
      border-radius:6px 0 0 0;
      animation:ribbonShine 1.4s ease-in-out infinite;
      box-shadow:0 -1px 6px rgba(239,68,68,.4);
    }

    /* ── Badges modo ganadores ── */
    .sorteo-modo-badge {
      font-family:'Oswald',sans-serif;
      font-size:.6rem; font-weight:700; letter-spacing:.08em;
      padding:.1rem .5rem;
      border-radius:20px;
      display:inline-flex;align-items:center;gap:.2rem;
      backdrop-filter:blur(4px);
    }
    .modo-1 {
      background:rgba(212,160,23,.25);
      border:1px solid rgba(212,160,23,.5);
      color:#fcd34d;
    }
    .modo-3 {
      background:rgba(99,102,241,.25);
      border:1px solid rgba(99,102,241,.5);
      color:#a5b4fc;
    }
    .sih-free-badge {
      font-family:'Oswald',sans-serif;
      font-size:.6rem; font-weight:700; letter-spacing:.1em;
      background:rgba(34,197,94,.3);
      border:1px solid rgba(34,197,94,.5);
      color:#4ade80;
      border-radius:20px;
      padding:.1rem .5rem;
    }

    /* ── Premio hint ── */
    .sorteo-premio-hint {
      font-size:.72rem;
      color:var(--muted);
      display:inline-flex;align-items:center;gap:.25rem;
    }
    .sorteo-premio-hint strong { font-family:'Oswald',sans-serif; }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════
   PANEL COMPRA — con capacidad dinámica
═══════════════════════════════════════ */
window.abrirPanelCompra = async (roundId, gameNombre, numRonda, precioBoleto, cuposActuales, capacidadMax=25) => {
  if(!puedeParticipar()){ modalSubirQR(); return; }
  const cap = Number(capacidadMax) || 25;
  const cuposLibres = cap - cuposActuales;
  const maxBoletos = Math.min(cuposLibres, 5);
  if(maxBoletos<=0){ toast("Esta ronda ya está llena","error"); return; }

  const modo = getModoGanadores(cap);
  const modoLabel = modo === 1 ? "🥇 1 ganador" : "🏅 3 ganadores";

  const[{data:pagoExistente},gratisStatus]=await Promise.all([
    supabase.from("payments").select("id,estado,boletos_solicitados").eq("round_id",roundId).eq("user_id",MY_USER_ID).maybeSingle(),
    estadoBoletoGratisEnRonda(roundId),
  ]);

  if(pagoExistente?.estado==="pendiente"){
    Swal.fire({title:"Comprobante en revisión",html:`Ya enviaste un comprobante por <strong>${pagoExistente.boletos_solicitados}</strong> boleto${pagoExistente.boletos_solicitados>1?"s":""}. Espera a que sea procesado.`,icon:"warning",confirmButtonText:"Entendido",...swal$});
    return;
  }

  const esAdicional=pagoExistente?.estado==="aprobado";
  const puedoUsarGratis=boletosGratis>0&&!gratisStatus.yoUse;

  let adminQR=null, adminQRMetodo=null;
  if(precioBoleto>0){
    const{data:admins}=await supabase.from("profiles").select("qr_cobro_url,qr_metodo").in("rol",["admin","trabajador"]).eq("qr_verificado",true).not("qr_cobro_url","is",null).limit(1);
    if(admins?.length){ adminQR=admins[0].qr_cobro_url; adminQRMetodo=admins[0].qr_metodo; }
  }
  const mlM2={tigo_money:"Tigo Money",billetera_bcb:"Billetera BNB / BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};
  const theme = getSorteoTheme(gameNombre);

  let drawer=document.getElementById("compraDrawer");
  if(drawer) drawer.remove();

  drawer=document.createElement("div");
  drawer.id="compraDrawer";
  drawer.className="compra-drawer";
  drawer.innerHTML=`
  <div class="compra-drawer-overlay" onclick="cerrarCompraDrawer()"></div>
  <div class="compra-drawer-panel">
    <div class="compra-drawer-header" style="background:${theme.gradient};position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,.55),rgba(0,0,0,.2))"></div>
      <div style="position:relative;z-index:1">
        <div style="font-family:'Oswald',sans-serif;font-size:1.1rem;font-weight:700;color:#fff">${esAdicional?"+ Boletos — ":""}${gameNombre}</div>
        <div style="font-size:.75rem;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:.5rem;margin-top:.18rem;flex-wrap:wrap">
          <span>Ronda #${numRonda}</span>
          <span>·</span>
          <span>${cuposLibres} cupo${cuposLibres!==1?"s":""} libres</span>
          <span>·</span>
          <span style="color:${theme.accent}">${modoLabel}</span>
        </div>
      </div>
      <div style="position:relative;z-index:1;display:flex;align-items:center;gap:.5rem">
        <span style="font-size:2rem;line-height:1">${theme.icon}</span>
        <button class="compra-close-btn" onclick="cerrarCompraDrawer()" style="background:rgba(0,0,0,.3);border-color:rgba(255,255,255,.2);color:#fff"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>

    <div class="compra-drawer-body" id="compraBody">
      <!-- PASO 1 -->
      <div class="compra-step" id="compraStep1">
        <div class="compra-step-label"><span class="step-num" style="background:${theme.accent};color:#000">1</span> Elige tus boletos</div>

        ${puedoUsarGratis?`
        <div class="compra-gratis-box">
          <div style="display:flex;align-items:center;gap:.75rem">
            <i class="bi bi-gift-fill" style="color:#22c55e;font-size:1.3rem;flex-shrink:0"></i>
            <div><div style="font-family:'Oswald',sans-serif;font-size:.9rem;color:#22c55e">Tienes ${boletosGratis} boleto${boletosGratis>1?"s":""} gratis</div><div style="font-size:.75rem;color:var(--muted)">Solo 1 por sorteo</div></div>
          </div>
          <label class="compra-gratis-toggle">
            <input type="checkbox" id="drawerUsarGratis"><span class="gratis-toggle-label">Usar 1 gratis</span>
          </label>
        </div>`:
        gratisStatus.yoUse?`<div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.22);border-radius:8px;padding:.6rem .9rem;margin-bottom:.75rem;font-size:.82rem;color:#86efac;display:flex;align-items:center;gap:.5rem"><i class="bi bi-check-circle-fill"></i> Ya usaste tu boleto gratis en este sorteo.</div>`:""
        }

        ${!gratisStatus.yoUse&&gratisStatus.otrosConGratis>0&&boletosGratis>0?`<div class="compra-alert-warn"><i class="bi bi-lightning-charge-fill"></i>${gratisStatus.otrosConGratis} jugador${gratisStatus.otrosConGratis>1?"es":""} con boleto gratis aquí. <strong>¡Actúa rápido!</strong></div>`:""}

        <div class="compra-cantidad-ctrl">
          <button class="cantidad-btn" id="drawerMenos" style="border-color:${theme.accent}44"><i class="bi bi-dash-lg"></i></button>
          <div class="cantidad-display">
            <span id="drawerNum" style="color:${theme.accent}">1</span>
            <span style="font-size:.72rem;color:var(--muted)">boleto${1!==1?"s":""}</span>
          </div>
          <button class="cantidad-btn" id="drawerMas" style="border-color:${theme.accent}44"><i class="bi bi-plus-lg"></i></button>
        </div>
        <div style="text-align:center;font-size:.75rem;color:var(--dim);margin-top:.4rem">Máximo ${maxBoletos} por compra</div>

        ${precioBoleto>0?`<div class="compra-monto-preview" style="border-color:${theme.accent}33">
          <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.25rem">Total a pagar</div>
          <div id="drawerMonto" style="font-family:'Oswald',sans-serif;font-size:2rem;font-weight:700;color:${theme.accent}">${fmtMoney(precioBoleto)}</div>
          <div id="drawerGratisNota" style="display:none;font-size:.72rem;color:#22c55e;margin-top:.2rem"><i class="bi bi-gift-fill"></i> 1 boleto gratis aplicado</div>
        </div>`:""}

        ${precioBoleto===0?`<button class="compra-btn-next btn-solo-gratis" id="drawerBtnNext"><i class="bi bi-ticket-perforated-fill"></i> Confirmar participación gratis</button>`:
        `<button class="compra-btn-next" id="drawerBtnNext" style="background:${theme.accent};color:#000">Continuar al pago <i class="bi bi-arrow-right"></i></button>`}
      </div>

      <!-- PASO 2 -->
      <div class="compra-step" id="compraStep2" style="display:none">
        <div class="compra-resumen-fijo" style="border-color:${theme.accent}33">
          <i class="bi bi-ticket-perforated-fill" style="color:${theme.accent}"></i>
          <span id="drawerResumenTxt"></span>
          <span id="drawerResumenMonto" style="font-family:'Oswald',sans-serif;color:${theme.accent};font-weight:700;margin-left:auto"></span>
          <button class="compra-back-btn" id="drawerBack" title="Volver al paso 1"><i class="bi bi-arrow-left"></i></button>
        </div>
        <div class="compra-step-label"><span class="step-num" style="background:${theme.accent};color:#000">2</span> Realiza el pago</div>

        ${adminQR?`
        <div class="compra-qr-box" style="border-color:${theme.accent}44">
          <div class="compra-qr-header" style="color:${theme.accent}">
            <span><i class="bi bi-qr-code-scan"></i> Escanea y paga</span>
            <span class="compra-qr-metodo">${mlM2[adminQRMetodo]||adminQRMetodo||"QR de cobro"}</span>
          </div>
          <div class="compra-qr-img-wrap">
            <img src="${adminQR}" class="compra-qr-img" alt="QR de pago" onerror="this.parentElement.style.display='none'">
          </div>
          <div class="compra-qr-pasos">
            <div class="compra-qr-paso"><span class="paso-num">1</span>Escanea con tu app bancaria</div>
            <div class="compra-qr-paso"><span class="paso-num">2</span>Paga exactamente <strong id="montoExacto">${fmtMoney(precioBoleto)}</strong></div>
            <div class="compra-qr-paso"><span class="paso-num">3</span>Sube la captura del pago aquí abajo 👇</div>
          </div>
        </div>`:""}

        <div class="compra-field" style="margin-bottom:1rem">
          <label>Método de pago *</label>
          <select id="drawerMetodo" class="compra-select">
            <option value="">— Seleccionar —</option>
            <option value="qr"${adminQRMetodo&&adminQRMetodo!=="efectivo_cuenta"?" selected":""}>QR / Tigo Money / Billetera BNB</option>
            <option value="transferencia">Transferencia bancaria</option>
            <option value="yape">Yape</option>
            <option value="manual">Efectivo</option>
          </select>
        </div>

        <div class="compra-field" style="margin-bottom:1rem">
          <label>Foto del comprobante * <span style="font-weight:400;text-transform:none;font-size:.7rem;color:var(--muted)">(captura del pago, máx. 5MB)</span></label>
          <div class="compra-upload-area" id="compraUploadArea">
            <input type="file" id="drawerComp" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;z-index:2">
            <div class="compra-upload-placeholder" id="compraUploadPlaceholder">
              <i class="bi bi-cloud-upload-fill" style="font-size:1.8rem;color:var(--dim)"></i>
              <span>Toca para subir la captura</span>
            </div>
            <img id="drawerPrev" style="display:none;width:100%;max-height:200px;object-fit:contain;border-radius:8px;position:relative;z-index:1">
          </div>
        </div>

        <div class="compra-field" style="margin-bottom:1.2rem">
          <label>Referencia / Nro. operación <span style="font-size:.68rem;font-weight:400;text-transform:none;color:var(--dim)">(opcional)</span></label>
          <input id="drawerRef" placeholder="Ej: 00123456" class="compra-input">
        </div>

        <div style="font-size:.72rem;color:var(--dim);padding:.45rem .7rem;background:rgba(139,26,26,.05);border:1px solid rgba(139,26,26,.12);border-radius:7px;margin-bottom:1.2rem;display:flex;align-items:center;gap:.5rem">
          <i class="bi bi-lock-fill" style="color:#f87171;flex-shrink:0"></i> Una vez enviado, la cantidad de boletos no puede modificarse.
        </div>

        <button class="compra-btn-submit" id="drawerSubmit" style="background:${theme.accent};color:#000"><i class="bi bi-send-fill"></i> Enviar comprobante</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(drawer);
  requestAnimationFrame(()=>{ drawer.classList.add("open"); document.body.style.overflow="hidden"; });

  let boletos=1, usarGratis=false, archivoListo=false;

  const actualizarMonto=()=>{
    const bap=usarGratis?Math.max(0,boletos-1):boletos;
    const mv=getEl("drawerMonto"); if(mv&&precioBoleto>0) mv.textContent=fmtMoney(precioBoleto*bap);
    const gn=getEl("drawerGratisNota"); if(gn) gn.style.display=usarGratis?"block":"none";
    const me=getEl("montoExacto"); if(me) me.textContent=fmtMoney(precioBoleto*bap);
    const nEl=getEl("drawerNum"); if(nEl){ nEl.textContent=boletos; nEl.nextElementSibling.textContent=`boleto${boletos!==1?"s":""}`; }
    const btnN=getEl("drawerBtnNext");
    if(btnN&&precioBoleto>0){
      if(bap===0) btnN.innerHTML=`<i class="bi bi-ticket-perforated-fill"></i> Confirmar participación gratis`;
      else btnN.innerHTML=`Continuar al pago <i class="bi bi-arrow-right"></i>`;
    }
  };

  getEl("drawerMenos")?.addEventListener("click",()=>{ if(boletos>1){boletos--;actualizarMonto();} });
  getEl("drawerMas")?.addEventListener("click",()=>{ if(boletos<maxBoletos){boletos++;actualizarMonto();} });
  getEl("drawerUsarGratis")?.addEventListener("change",e=>{ usarGratis=e.target.checked; actualizarMonto(); });

  let boletosSnap=1, usarGratisSnap=false, bapSnap=1;

  getEl("drawerBtnNext")?.addEventListener("click",()=>{
    const bap=usarGratis?Math.max(0,boletos-1):boletos;
    if(precioBoleto===0||bap===0){ enviarParticipacion(); return; }
    boletosSnap=boletos; usarGratisSnap=usarGratis; bapSnap=bap;
    const rt=getEl("drawerResumenTxt");
    const rm=getEl("drawerResumenMonto");
    if(rt) rt.textContent=`${boletosSnap} boleto${boletosSnap!==1?"s":""}${usarGratisSnap?" (1 gratis)":""}`;
    if(rm) rm.textContent=fmtMoney(precioBoleto*bapSnap);
    const me=getEl("montoExacto"); if(me) me.textContent=fmtMoney(precioBoleto*bapSnap);
    getEl("compraStep1").style.display="none";
    getEl("compraStep2").style.display="block";
    if(getEl("drawerMenos")) getEl("drawerMenos").disabled=true;
    if(getEl("drawerMas")) getEl("drawerMas").disabled=true;
    if(getEl("drawerUsarGratis")) getEl("drawerUsarGratis").disabled=true;
  });

  getEl("drawerBack")?.addEventListener("click",()=>{
    getEl("compraStep1").style.display="block";
    getEl("compraStep2").style.display="none";
    boletosSnap=boletos; usarGratisSnap=usarGratis;
    const compInput=getEl("drawerComp");
    if(compInput){ compInput.value=""; }
    const prev=getEl("drawerPrev"); if(prev){prev.src="";prev.style.display="none";}
    const ph=getEl("compraUploadPlaceholder"); if(ph) ph.style.display="flex";
    if(getEl("drawerMenos")) getEl("drawerMenos").disabled=false;
    if(getEl("drawerMas")) getEl("drawerMas").disabled=false;
    if(getEl("drawerUsarGratis")) getEl("drawerUsarGratis").disabled=false;
  });

  getEl("drawerComp")?.addEventListener("change",e=>{
    const f=e.target.files[0]; if(!f) return;
    archivoListo=true;
    const r2=new FileReader();
    r2.onload=ev=>{
      const prev=getEl("drawerPrev"); const ph=getEl("compraUploadPlaceholder");
      if(prev){ prev.src=ev.target.result; prev.style.display="block"; }
      if(ph) ph.style.display="none";
      const backBtn=getEl("drawerBack");
      if(backBtn){
        backBtn.style.display="none";
        const resumen=document.querySelector(".compra-resumen-fijo");
        if(resumen&&!resumen.querySelector(".compra-lock-badge")){
          const badge=document.createElement("span");
          badge.className="compra-lock-badge";
          badge.innerHTML='<i class="bi bi-lock-fill"></i> Fijo';
          resumen.appendChild(badge);
        }
      }
    };
    r2.readAsDataURL(f);
  });

  getEl("drawerSubmit")?.addEventListener("click",()=>enviarParticipacion());

  async function enviarParticipacion(){
    const _boletos = (typeof boletosSnap!=="undefined" && getEl("compraStep2")?.style.display!=="none") ? boletosSnap : boletos;
    const _usarGratis = (typeof usarGratisSnap!=="undefined" && getEl("compraStep2")?.style.display!=="none") ? usarGratisSnap : usarGratis;
    const bap=_usarGratis?Math.max(0,_boletos-1):_boletos;

    if(precioBoleto>0&&bap>0){
      const metodo=getEl("drawerMetodo")?.value;
      const file=getEl("drawerComp")?.files[0];
      if(!metodo){ toast("Selecciona el método de pago","error"); return; }
      if(!file){ toast("Sube la foto del comprobante","error"); return; }
      if(file.size>5*1024*1024){ toast("Imagen muy grande (máx. 5 MB)","error"); return; }
    }

    cerrarCompraDrawer();
    loading$("Enviando comprobante…");

    if(_usarGratis&&bap===0){
      const{data:bgDisp}=await supabase.from("boletos_gratis").select("id").eq("user_id",MY_USER_ID).eq("usado",false).limit(1);
      if(!bgDisp?.length){ Swal.close(); ok$("Error","No se encontró boleto gratis. Recarga la página.","error"); return; }
      const{error:bgErr}=await supabase.from("boletos_gratis").update({usado:true,usado_en_round:roundId,usado_at:new Date().toISOString()}).eq("id",bgDisp[0].id).eq("user_id",MY_USER_ID).eq("usado",false);
      if(bgErr){ Swal.close(); ok$("Error","No se pudo usar el boleto gratis.","error"); return; }
      const{error:partErr}=await supabase.from("participations").insert({round_id:roundId,user_id:MY_USER_ID,resultado:"pendiente",boletos:1,es_gratis:true});
      await supabase.from("payments").insert({user_id:MY_USER_ID,round_id:roundId,metodo:"gratis",monto:0,estado:"aprobado",referencia:`BG-${bgDisp[0].id.slice(0,8)}`,boletos_solicitados:1});
      await refreshProfile(); initUserUI(currentProfile);
      Swal.close();
      if(partErr){ ok$("⚠️ Atención",`Boleto marcado pero error al registrar. Contacta admin: BG-${bgDisp[0].id.slice(0,8)}`,"warning"); }
      else { await Swal.fire({title:"🎟️ ¡Participas con boleto gratis!",html:`Inscrito en Ronda #${numRonda} de ${gameNombre}.`,icon:"success",confirmButtonText:"¡Listo!",...swal$}); }
      loadSorteos();
      return;
    }

    if(_usarGratis){
      const{data:bgDisp}=await supabase.from("boletos_gratis").select("id").eq("user_id",MY_USER_ID).eq("usado",false).limit(1);
      if(bgDisp?.length) await supabase.from("boletos_gratis").update({usado:true,usado_en_round:roundId,usado_at:new Date().toISOString()}).eq("id",bgDisp[0].id).eq("user_id",MY_USER_ID);
    }

    let comprobante_url=null;
    if(bap>0){
      const file=getEl("drawerComp")?.files[0];
      if(file) try{ comprobante_url=await uploadFile(file,"el-padrino/comprobantes"); }
               catch{ Swal.close(); ok$("Error al subir imagen","","error"); return; }
    }

    const metodo=getEl("drawerMetodo")?.value||"manual";
    const ref=getEl("drawerRef")?.value?.trim()||null;
    const{error:payError}=await supabase.from("payments").insert({
      user_id:MY_USER_ID,round_id:roundId,
      metodo:bap===0?"gratis":metodo,
      monto:precioBoleto*bap||0,
      estado:"pendiente",comprobante_url,referencia:ref,
      boletos_solicitados:_boletos,
    });
    if(payError){ Swal.close(); ok$("Error al registrar pago",payError.message,"error"); return; }
    await refreshProfile(); initUserUI(currentProfile);
    Swal.close();
    await Swal.fire({title:"✅ Comprobante enviado",html:`El admin revisará tus <strong style="color:var(--gold2)">${_boletos} boleto${_boletos>1?"s":""}${_usarGratis?" (incluye 1 gratis)":""}</strong>.<br><small style="color:var(--muted)">Recibirás notificación cuando sea aprobado.</small>`,icon:"success",confirmButtonText:"OK",...swal$});
    loadSorteos();
  }
};

window.cerrarCompraDrawer=()=>{
  const d=document.getElementById("compraDrawer");
  if(!d) return;
  d.classList.remove("open");
  document.body.style.overflow="";
  setTimeout(()=>d.remove(),350);
};

window.modalComprarBoleto=(roundId,gameNombre,numRonda,precioBoleto,cuposActuales,capacidadMax=25)=>window.abrirPanelCompra(roundId,gameNombre,numRonda,precioBoleto,cuposActuales,capacidadMax);

/* ═══════════════════════════════════════
   GANADORES — PANTALLA COMPLETA
═══════════════════════════════════════ */
window.modalVerGanadores = async (roundId) => {
  loading$("Cargando resultados…");

  const[{data:round},{data:allParts}]=await Promise.all([
    supabase.from("rounds").select("numero,sorteado_at,game_id,ganador_id,ganador2_id,ganador3_id").eq("id",roundId).single(),
    supabase.from("participations").select("user_id,boletos,es_gratis").eq("round_id",roundId),
  ]);
  const[{data:game}]=await Promise.all([
    round?.game_id?supabase.from("games").select("nombre,capacidad_max").eq("id",round.game_id).single():{data:null},
  ]);

  const ids=[round?.ganador_id,round?.ganador2_id,round?.ganador3_id,...(allParts||[]).map(p=>p.user_id)].filter(Boolean);
  const uidsUnicos=[...new Set(ids)];
  let usersMap={};
  if(uidsUnicos.length){
    const{data:profs}=await supabase.from("profiles").select("id,username").in("id",uidsUnicos);
    (profs||[]).forEach(p=>{usersMap[p.id]=p.username;});
  }
  Swal.close();

  const g1=round?.ganador_id?usersMap[round.ganador_id]||"—":null;
  const g2=round?.ganador2_id?usersMap[round.ganador2_id]||"—":null;
  const g3=round?.ganador3_id?usersMap[round.ganador3_id]||"—":null;
  const participantes=(allParts||[]).map(p=>({ username:usersMap[p.user_id]||"Usuario", boletos:p.boletos||1, esGratis:p.es_gratis }));
  const modo=getModoGanadores(game?.capacidad_max||25);
  const theme=getSorteoTheme(game?.nombre||"");

  let screen=document.getElementById("ganadoresScreen");
  if(screen) screen.remove();

  screen=document.createElement("div");
  screen.id="ganadoresScreen";
  screen.className="ganadores-screen";
  screen.innerHTML=`
  <div class="ganadores-bg" style="background:radial-gradient(ellipse at center,#1a0d05 0%,#0a0603 100%)">
    <div style="position:absolute;inset:0;background:${theme.gradient};opacity:.15;pointer-events:none"></div>
    <div class="ganadores-stars" id="ganadoresStars"></div>
    <div class="ganadores-content">
      <button class="ganadores-close" onclick="cerrarGanadoresScreen()"><i class="bi bi-x-lg"></i></button>
      <div class="ganadores-titulo-wrap">
        <div class="ganadores-subtitulo">SORTEO FINALIZADO</div>
        <div class="ganadores-titulo">${game?.nombre||"El Padrino"}</div>
        <div class="ganadores-ronda">Ronda #${round?.numero||"—"}${round?.sorteado_at?" · "+fmtDateShort(round.sorteado_at):""}</div>
        <div style="margin-top:.5rem;display:inline-flex;align-items:center;gap:.4rem;font-family:'Oswald',sans-serif;font-size:.7rem;letter-spacing:.1em;color:${theme.accent};background:${theme.accent}18;border:1px solid ${theme.accent}44;border-radius:20px;padding:.18rem .7rem">
          ${theme.icon} ${modo===1?"1 GANADOR":"3 GANADORES"}
        </div>
      </div>

      <div class="ganadores-img-wrap">
        <img src="https://res.cloudinary.com/daxmlrngo/image/upload/v1772453389/9c927cfe-c983-4252-8945-a70b24c03eb1_rtrp4u.png" class="ganadores-img" alt="El Padrino" style="border-color:${theme.accent}88">
        <div class="ganadores-img-glow" style="background:radial-gradient(circle,${theme.accent}22,transparent 70%)"></div>
      </div>

      <div class="ganadores-podio">
        ${g2&&modo===3?`<div class="podio-card podio-2" style="animation-delay:.4s">
          <div class="podio-trofeo">🥈</div>
          <div class="podio-puesto">2do Lugar</div>
          <div class="podio-nombre">${g2}</div>
        </div>`:""}
        ${g1?`<div class="podio-card podio-1" style="animation-delay:.1s;border-color:${theme.accent}66">
          <div class="podio-corona">👑</div>
          <div class="podio-trofeo">🥇</div>
          <div class="podio-puesto">1er Lugar</div>
          <div class="podio-nombre">${g1}</div>
          <div class="podio-rays"></div>
        </div>`:""}
        ${g3&&modo===3?`<div class="podio-card podio-3" style="animation-delay:.6s">
          <div class="podio-trofeo">🥉</div>
          <div class="podio-puesto">3er Lugar</div>
          <div class="podio-nombre">${g3}</div>
        </div>`:""}
      </div>

      <div class="ganadores-creditos-titulo">Participantes</div>
      <div class="ganadores-creditos-scroll" id="ganadoresCreditos">
        <div class="creditos-track" id="creditosTrack">
          ${participantes.map(p=>`
          <div class="credito-item">
            <span class="credito-username">${p.username}</span>
            <span class="credito-info">${p.boletos} boleto${p.boletos>1?"s":""}${p.esGratis?` · <span style="color:#4ade80"><i class="bi bi-gift-fill"></i></span>`:""}</span>
          </div>`).join("")}
          <div style="height:3rem"></div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.appendChild(screen);
  document.body.style.overflow="hidden";
  requestAnimationFrame(()=>screen.classList.add("open"));

  const starsEl=screen.querySelector("#ganadoresStars");
  for(let i=0;i<60;i++){
    const s=document.createElement("div"); s.className="gstar";
    s.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;animation-delay:${Math.random()*3}s;animation-duration:${2+Math.random()*3}s`;
    starsEl.appendChild(s);
  }

  const track=screen.querySelector("#creditosTrack");
  if(track){
    const h=track.scrollHeight;
    track.style.animation=`creditosScroll ${Math.max(8,h/30)}s ${2}s linear infinite`;
  }

  let ganadoresAudio = document.getElementById("ganadoresAudio");
  if(!ganadoresAudio){
    ganadoresAudio = document.createElement("audio");
    ganadoresAudio.id = "ganadoresAudio";
    ganadoresAudio.src = "https://res.cloudinary.com/daxmlrngo/video/upload/v1773625290/Star_Wars_The_Clone_Wars_Main_Title_Original_-_Kevin_Kiner_oywm1u.mp3";
    ganadoresAudio.loop = true;
    ganadoresAudio.volume = 0.55;
    document.body.appendChild(ganadoresAudio);
  }
  ganadoresAudio.currentTime = 0;
  ganadoresAudio.volume = 0;
  const playPromise = ganadoresAudio.play();
  if(playPromise !== undefined){
    playPromise.catch(()=>{
      const closeBtn = screen.querySelector(".ganadores-close");
      if(closeBtn){
        const playBtn = document.createElement("button");
        playBtn.className = "ganadores-play-btn";
        playBtn.innerHTML = '<i class="bi bi-music-note-beamed"></i>';
        playBtn.title = "Activar música";
        playBtn.onclick = ()=>{
          ganadoresAudio.play();
          let v=0; const fi=setInterval(()=>{ v=Math.min(v+0.05,0.55); ganadoresAudio.volume=v; if(v>=0.55) clearInterval(fi); },80);
          playBtn.remove();
        };
        screen.querySelector(".ganadores-content").appendChild(playBtn);
      }
    });
  }
  let vol=0;
  const fadeIn=setInterval(()=>{ vol=Math.min(vol+0.04,0.55); ganadoresAudio.volume=vol; if(vol>=0.55) clearInterval(fadeIn); },100);
};

window.cerrarGanadoresScreen=()=>{
  const s=document.getElementById("ganadoresScreen");
  if(!s) return;
  const audio=document.getElementById("ganadoresAudio");
  if(audio&&!audio.paused){
    let v=audio.volume;
    const fadeOut=setInterval(()=>{ v=Math.max(v-0.06,0); audio.volume=v; if(v<=0){ clearInterval(fadeOut); audio.pause(); audio.currentTime=0; }},80);
  }
  s.classList.remove("open");
  document.body.style.overflow="";
  setTimeout(()=>s.remove(),400);
};

/* ═══════════════════════════════════════
   MI HISTORIAL
═══════════════════════════════════════ */
async function loadHistorial() {
  const el=getEl("historialList"); if(!el) return;
  el.innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;

  const{data:parts,error}=await supabase.from("participations").select("id,boletos,resultado,lugar,es_gratis,created_at,round_id").eq("user_id",MY_USER_ID).order("created_at",{ascending:false});
  if(error||!parts?.length){ el.innerHTML=`<div class="empty"><i class="bi bi-clock-history"></i><p>Aún no has participado en ningún sorteo.</p></div>`; return; }

  const roundIds=[...new Set(parts.map(p=>p.round_id).filter(Boolean))];
  let roundsMap={};
  if(roundIds.length){
    const{data:rd}=await supabase.from("rounds").select("id,numero,game_id,estado,ganador_id,ganador2_id,ganador3_id,sorteado_at").in("id",roundIds);
    const gameIds=[...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm={};
    if(gameIds.length){const{data:gd}=await supabase.from("games").select("id,nombre").in("id",gameIds);(gd||[]).forEach(g=>{gm[g.id]=g;});}
    (rd||[]).forEach(r=>{roundsMap[r.id]={...r,game:gm[r.game_id]};});
  }

  const enriched=parts.map(p=>({...p,gameName:roundsMap[p.round_id]?.game?.nombre||"Sorteo",roundNum:roundsMap[p.round_id]?.numero||"—",roundEstado:roundsMap[p.round_id]?.estado||"abierta",sorteado_at:roundsMap[p.round_id]?.sorteado_at||null}));
  const juegosUnicos=[...new Set(enriched.map(e=>e.gameName))].sort();

  const resBdg=p=>{
    if(p.resultado==="ganada"){const t=p.lugar===1?'🥇':p.lugar===2?'🥈':'🥉';return`<span class="bdg bdg-win"><i class="bi bi-trophy-fill"></i>${t} Ganaste</span>`;}
    if(p.resultado==="perdida") return`<span class="bdg bdg-bad"><i class="bi bi-x-circle"></i> Sin suerte</span>`;
    return`<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> En curso</span>`;
  };

  const renderItem=p=>`<div class="list-item">
    <div class="li-icon ${p.resultado==="ganada"?"ic-win":p.resultado==="perdida"?"ic-bad":"ic-pend"}"><i class="bi bi-ticket-perforated-fill"></i></div>
    <div class="li-body">
      <div class="li-title">${p.gameName} · Ronda ${p.roundNum}</div>
      <div class="li-sub" style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap">
        <span>${p.boletos||1} boleto${(p.boletos||1)!==1?"s":""}</span>
        ${p.es_gratis===true?`<span class="bdg bdg-free" style="font-size:.6rem"><i class="bi bi-gift-fill"></i> gratis</span>`:""}
        <span style="color:var(--dim)">·</span><span>${fmtDateShort(p.created_at)}</span>
      </div>
    </div>
    <div class="li-right">${resBdg(p)}${p.roundEstado==="sorteada"?`<button class="btn btn-ghost btn-sm" style="margin-top:.3rem" onclick="modalVerGanadores('${p.round_id}')"><i class="bi bi-trophy-fill"></i> Ganadores</button>`:""}
    </div>
  </div>`;

  el.innerHTML=`${buildFilterBar({searchId:"hBuscar",searchPlaceholder:"Buscar sorteo…",chips:[{id:"hResultado",options:[{value:"",label:"Todos"},{value:"ganada",label:"🏆 Ganadas"},{value:"perdida",label:"❌ Perdidas"},{value:"pendiente",label:"⏳ En curso"}]},{id:"hJuego",options:[{value:"",label:"Juego"},{value:"_gratis",label:"🎁 Gratis"},...juegosUnicos.map(j=>({value:j,label:j}))]}],sortId:"hOrden",countId:"hCount"})}<div id="hItems" class="item-list"></div>`;

  const render=()=>{
    const q=getEl("hBuscar")?.value.trim().toLowerCase()||"";
    const res=getEl("hResultado")?.value||"";
    const juego=getEl("hJuego")?.value||"";
    const orden=getEl("hOrden")?.value||"desc";
    let f=enriched.filter(p=>{
      if(q&&!`${p.gameName} ronda ${p.roundNum}`.toLowerCase().includes(q)) return false;
      if(res&&p.resultado!==res) return false;
      if(juego==="_gratis"&&p.es_gratis!==true) return false;
      else if(juego&&juego!=="_gratis"&&p.gameName!==juego) return false;
      return true;
    });
    if(orden==="asc") f=[...f].reverse();
    getEl("hItems").innerHTML=f.length?f.map(renderItem).join(""):emptyFilter();
    setCount("hCount",f.length,enriched.length);
  };
  render();
  ["hBuscar","hResultado","hJuego","hOrden"].forEach(id=>{getEl(id)?.addEventListener("input",render);getEl(id)?.addEventListener("change",render);});
}

/* ═══════════════════════════════════════
   MIS PAGOS
═══════════════════════════════════════ */
async function loadPagos() {
  const el=getEl("pagosList"); if(!el) return;
  el.innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;
  const{data:pays,error}=await supabase.from("payments").select("id,monto,metodo,estado,boletos_solicitados,comprobante_url,created_at,round_id,referencia").eq("user_id",MY_USER_ID).order("created_at",{ascending:false});
  if(error||!pays?.length){ el.innerHTML=`<div class="empty"><i class="bi bi-receipt"></i><p>No has realizado pagos aún.</p></div>`; return; }

  const roundIds=[...new Set(pays.map(p=>p.round_id).filter(Boolean))];
  let roundsMap={};
  if(roundIds.length){
    const{data:rd}=await supabase.from("rounds").select("id,numero,game_id").in("id",roundIds);
    const gIds=[...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm={}; if(gIds.length){const{data:gd}=await supabase.from("games").select("id,nombre").in("id",gIds);(gd||[]).forEach(g=>{gm[g.id]=g;});}
    (rd||[]).forEach(r=>{roundsMap[r.id]={...r,game:gm[r.game_id]};});
  }

  const ml=m=>({qr:"QR",transferencia:"Transf.",yape:"Yape",manual:"Efectivo",gratis:"🎁 Gratis"})[m]||m||"—";
  const esBadge=e=>{
    if(e==="aprobado") return`<span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> OK</span>`;
    if(e==="rechazado") return`<span class="bdg bdg-bad"><i class="bi bi-x-circle-fill"></i> Rechazado</span>`;
    return`<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Revisión</span>`;
  };

  const enriched=pays.map(p=>({...p,gameName:roundsMap[p.round_id]?.game?.nombre||"Sorteo",roundNum:roundsMap[p.round_id]?.numero||"—",esGratis:p.metodo==="gratis"}));
  const juegosUnicos=[...new Set(enriched.map(e=>e.gameName))].sort();
  const renderItem=p=>`<div class="list-item">
    <div class="li-icon ${p.estado==="aprobado"?"ic-win":p.estado==="rechazado"?"ic-bad":"ic-pend"}"><i class="bi bi-receipt"></i></div>
    <div class="li-body"><div class="li-title">${p.gameName} · Ronda ${p.roundNum}</div><div class="li-sub">${p.boletos_solicitados||1} boleto${(p.boletos_solicitados||1)!==1?"s":""} · ${ml(p.metodo)} · ${fmtDateShort(p.created_at)}</div></div>
    <div class="li-right"><div class="li-amount">${p.esGratis?'<span class="bdg bdg-free"><i class="bi bi-gift-fill"></i> Gratis</span>':fmtMoney(p.monto)}</div>${esBadge(p.estado)}${p.comprobante_url&&!p.esGratis?`<button class="btn btn-ghost btn-sm" style="margin-top:.25rem" onclick="window.open('${p.comprobante_url}','_blank')"><i class="bi bi-image"></i></button>`:""}</div>
  </div>`;

  el.innerHTML=`${buildFilterBar({searchId:"pBuscar",searchPlaceholder:"Buscar…",chips:[{id:"pEstado",options:[{value:"",label:"Estado"},{value:"aprobado",label:"✅ OK"},{value:"pendiente",label:"⏳ Revisión"},{value:"rechazado",label:"❌ Rechazado"}]},{id:"pMetodo",options:[{value:"",label:"Método"},{value:"qr",label:"QR"},{value:"transferencia",label:"Transf."},{value:"yape",label:"Yape"},{value:"manual",label:"Efectivo"},{value:"gratis",label:"🎁 Gratis"}]},{id:"pJuego",options:[{value:"",label:"Juego"},...juegosUnicos.map(j=>({value:j,label:j}))]}],sortId:"pOrden",countId:"pCount"})}<div id="pItems" class="item-list"></div>`;
  const render=()=>{
    const q=getEl("pBuscar")?.value.trim().toLowerCase()||"";
    const estado=getEl("pEstado")?.value||"";
    const metodo=getEl("pMetodo")?.value||"";
    const juego=getEl("pJuego")?.value||"";
    const orden=getEl("pOrden")?.value||"desc";
    let f=enriched.filter(p=>{
      if(q&&!`${p.gameName} ronda ${p.roundNum} ${p.referencia||""}`.toLowerCase().includes(q)) return false;
      if(estado&&p.estado!==estado) return false;
      if(metodo&&p.metodo!==metodo) return false;
      if(juego&&p.gameName!==juego) return false;
      return true;
    });
    if(orden==="asc") f=[...f].reverse();
    const totalVis=f.filter(p=>p.estado==="aprobado"&&!p.esGratis).reduce((s,p)=>s+Number(p.monto||0),0);
    getEl("pItems").innerHTML=f.length?f.map(renderItem).join("")+(f.some(p=>p.estado==="aprobado"&&!p.esGratis)?`<div class="fc-total"><i class="bi bi-calculator"></i> Aprobado: <strong>${fmtMoney(totalVis)}</strong></div>`:""): emptyFilter();
    setCount("pCount",f.length,enriched.length);
  };
  render();
  ["pBuscar","pEstado","pMetodo","pJuego","pOrden"].forEach(id=>{getEl(id)?.addEventListener("input",render);getEl(id)?.addEventListener("change",render);});
}

/* ═══════════════════════════════════════
   MIS PREMIOS
═══════════════════════════════════════ */
async function loadPremios() {
  const el=getEl("premiosList"); if(!el) return;
  el.innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;
  const{data:premiosData,error}=await supabase.from("prize_payments").select("id,monto,metodo,referencia,notas,estado,lugar,created_at,round_id").eq("user_id",MY_USER_ID).order("created_at",{ascending:false});
  if(error||!premiosData?.length){ el.innerHTML=`<div class="empty"><i class="bi bi-cash-coin"></i><p>Aún no has recibido premios.<br><small>¡Participa y gana!</small></p></div>`; return; }

  const roundIds=[...new Set(premiosData.map(p=>p.round_id).filter(Boolean))];
  let roundsMap={};
  if(roundIds.length){
    const{data:rd}=await supabase.from("rounds").select("id,numero,game_id").in("id",roundIds);
    const gIds=[...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm={}; if(gIds.length){const{data:gd}=await supabase.from("games").select("id,nombre").in("id",gIds);(gd||[]).forEach(g=>{gm[g.id]=g;});}
    (rd||[]).forEach(r=>{roundsMap[r.id]={...r,game:gm[r.game_id]};});
  }

  const totalGanado=premiosData.reduce((s,p)=>s+Number(p.monto||0),0);
  const ll=l=>l===1?'🥇':l===2?'🥈':'🥉';
  const enriched=premiosData.map(p=>({...p,gameName:roundsMap[p.round_id]?.game?.nombre||"Sorteo",roundNum:roundsMap[p.round_id]?.numero||"—"}));
  const juegosUnicos=[...new Set(enriched.map(e=>e.gameName))].sort();

  const renderItem=p=>`<div class="list-item">
    <div class="li-icon ic-win"><span style="font-size:1.1rem">${ll(p.lugar)}</span></div>
    <div class="li-body"><div class="li-title">${p.gameName} · Ronda ${p.roundNum}</div><div class="li-sub">${p.metodo==="qr"?"QR":"Efectivo"}${p.referencia?" · "+p.referencia:""}${p.notas?" — "+p.notas:""} · ${fmtDateShort(p.created_at)}</div></div>
    <div class="li-right"><div class="li-amount" style="color:#22c55e">+${fmtMoney(p.monto)}</div><span class="bdg bdg-ok" style="font-size:.62rem"><i class="bi bi-check-circle-fill"></i> Recibido</span></div>
  </div>`;

  el.innerHTML=`<div class="premios-resumen"><div class="pr-box"><div class="pr-ico"><i class="bi bi-trophy-fill"></i></div><div><div class="pr-val">${premiosData.length}</div><div class="pr-lbl">Premios</div></div></div><div class="pr-box"><div class="pr-ico" style="color:var(--green2)"><i class="bi bi-cash-stack"></i></div><div><div class="pr-val" style="color:var(--green2)">${fmtMoney(totalGanado)}</div><div class="pr-lbl">Total ganado</div></div></div></div>
  ${buildFilterBar({searchId:"prBuscar",searchPlaceholder:"Buscar…",chips:[{id:"prLugar",options:[{value:"",label:"Lugar"},{value:"1",label:"🥇 1ro"},{value:"2",label:"🥈 2do"},{value:"3",label:"🥉 3ro"}]},{id:"prJuego",options:[{value:"",label:"Juego"},...juegosUnicos.map(j=>({value:j,label:j}))]}],sortId:"prOrden",countId:"prCount"})}
  <div id="prItems" class="item-list"></div>`;

  const render=()=>{
    const q=getEl("prBuscar")?.value.trim().toLowerCase()||"";
    const lugar=getEl("prLugar")?.value||"";
    const juego=getEl("prJuego")?.value||"";
    const orden=getEl("prOrden")?.value||"desc";
    let f=enriched.filter(p=>{
      if(q&&!`${p.gameName} ronda ${p.roundNum} ${p.referencia||""} ${p.notas||""}`.toLowerCase().includes(q)) return false;
      if(lugar&&String(p.lugar)!==lugar) return false;
      if(juego&&p.gameName!==juego) return false;
      return true;
    });
    if(orden==="asc") f=[...f].reverse();
    const totalVis=f.reduce((s,p)=>s+Number(p.monto||0),0);
    getEl("prItems").innerHTML=f.length?f.map(renderItem).join("")+`<div class="fc-total"><i class="bi bi-calculator"></i> Total visible: <strong style="color:#22c55e">${fmtMoney(totalVis)}</strong></div>`:emptyFilter();
    setCount("prCount",f.length,enriched.length);
  };
  render();
  ["prBuscar","prLugar","prJuego","prOrden"].forEach(id=>{getEl(id)?.addEventListener("input",render);getEl(id)?.addEventListener("change",render);});
}

/* ═══════════════════════════════════════
   MIS REFERIDOS
═══════════════════════════════════════ */
async function loadReferidos() {
  const el=getEl("referidosList"); if(!el) return;
  el.innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;
  const codigoRef=currentProfile.codigo_referido||await generarCodigoReferido();

  const{data:refs}=await supabase.from("referidos").select("id,referido_id,estado,creado_at,boleto_otorgado,boletos_pagados,profiles!referido_id(username)").eq("referidor_id",MY_USER_ID).order("creado_at",{ascending:false});
  const allRefs=refs||[];
  const totalRefs=allRefs.length;
  const refsActivos=allRefs.filter(r=>r.estado==="completado").length;
  const boletosGanados=allRefs.filter(r=>r.boleto_otorgado).length;

  const esBadge=r=>{
    if(r.estado==="completado") return`<span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> Activo</span>`;
    if(r.estado==="pendiente")  return`<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> ${r.boletos_pagados||0}/3</span>`;
    return`<span class="bdg bdg-bad">Inactivo</span>`;
  };
  const renderRef=r=>`<div class="list-item">
    <div class="li-icon ic-ref"><i class="bi bi-person-fill"></i></div>
    <div class="li-body"><div class="li-title">${r.profiles?.username||"Usuario"}</div><div class="li-sub">${fmtDateShort(r.creado_at)}${r.boleto_otorgado?` · <span style="color:#4ade80"><i class="bi bi-gift-fill"></i> Boleto otorgado</span>`:""}</div></div>
    <div class="li-right">${esBadge(r)}</div>
  </div>`;

  el.innerHTML=`
  <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-share-fill"></i>Tu código de invitación</div></div><div class="panel-body">
    <div class="ref-code-box">
      <div><div class="ref-code">${codigoRef}</div><div class="ref-code-hint">Comparte este código con tus amigos</div></div>
      <button class="btn btn-gold btn-md" onclick="copiarCodigo('${codigoRef}')"><i class="bi bi-copy"></i> Copiar código</button>
    </div>
    <div style="background:rgba(212,160,23,.05);border:1px solid rgba(212,160,23,.15);border-radius:9px;padding:.75rem 1rem;font-size:.82rem;color:var(--muted)">
      <strong style="color:var(--cream);display:block;margin-bottom:.3rem"><i class="bi bi-info-circle" style="color:var(--gold2)"></i> ¿Cómo funciona?</strong>
      <ul style="padding-left:1rem;line-height:1.8"><li>Tu amigo se registra con tu código</li><li>Cuando compre <strong style="color:var(--cream)">3 boletos pagados</strong>, recibes <strong style="color:#22c55e">1 boleto gratis</strong></li><li>Solo 1 boleto gratis por sorteo</li></ul>
    </div>
  </div></div>
  <div class="ref-stats-row">
    <div class="ref-stat"><div class="ref-stat-val">${totalRefs}</div><div class="ref-stat-lbl">Invitados</div></div>
    <div class="ref-stat"><div class="ref-stat-val" style="color:#22c55e">${refsActivos}</div><div class="ref-stat-lbl">Activos</div></div>
    <div class="ref-stat"><div class="ref-stat-val" style="color:var(--gold2)">${boletosGanados}</div><div class="ref-stat-lbl">Boletos ganados</div></div>
  </div>
  <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-person-lines-fill"></i>Mis invitados</div></div>
  <div class="panel-body" style="padding:.6rem">
    ${!totalRefs?`<div class="empty" style="padding:1.5rem"><i class="bi bi-people"></i><p>Aún no has invitado a nadie.</p></div>`:`
    ${buildFilterBar({searchId:"refBuscar",searchPlaceholder:"Buscar usuario…",chips:[{id:"refEstado",options:[{value:"",label:"Estado"},{value:"completado",label:"✅ Activos"},{value:"pendiente",label:"⏳ Pendientes"},{value:"inactivo",label:"❌ Inactivos"}]},{id:"refBoleto",options:[{value:"",label:"Boleto"},{value:"si",label:"🎁 Con boleto"},{value:"no",label:"Sin boleto"}]}],countId:"refCount"})}
    <div id="refItems"></div>`}
  </div></div>`;

  if(!totalRefs) return;
  const renderRefs=()=>{
    const q=getEl("refBuscar")?.value.trim().toLowerCase()||"";
    const estado=getEl("refEstado")?.value||"";
    const boleto=getEl("refBoleto")?.value||"";
    let f=allRefs.filter(r=>{
      if(q&&!(r.profiles?.username||"").toLowerCase().includes(q)) return false;
      if(estado&&r.estado!==estado) return false;
      if(boleto==="si"&&!r.boleto_otorgado) return false;
      if(boleto==="no"&&r.boleto_otorgado) return false;
      return true;
    });
    getEl("refItems").innerHTML=f.length?`<div class="item-list">${f.map(renderRef).join("")}</div>`:emptyFilter("Ningún referido coincide");
    setCount("refCount",f.length,allRefs.length);
  };
  renderRefs();
  ["refBuscar","refEstado","refBoleto"].forEach(id=>{getEl(id)?.addEventListener("input",renderRefs);getEl(id)?.addEventListener("change",renderRefs);});
}

async function generarCodigoReferido() {
  const base=(currentProfile.username||"USR").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);
  const rand=Math.random().toString(36).slice(2,6).toUpperCase();
  const ts=Date.now().toString(36).slice(-2).toUpperCase();
  const codigo=`${base}${rand}${ts}`;
  const{error}=await supabase.from("profiles").update({codigo_referido:codigo}).eq("id",MY_USER_ID);
  if(!error) currentProfile.codigo_referido=codigo;
  return codigo;
}
window.copiarCodigo=async c=>{try{await navigator.clipboard.writeText(c);}catch{}toast("Código copiado","success");};
window.copiarLink=async l=>{try{await navigator.clipboard.writeText(l);}catch{}toast("Link copiado","success");};

/* ═══════════════════════════════════════
   FIDELIDAD
═══════════════════════════════════════ */
async function loadFidelidad() {
  const el=getEl("fidelidadContent"); if(!el) return;
  el.innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;

  const[{data:parts},{data:pays},{data:refs},{data:premios},{data:bgsDisp}]=await Promise.all([
    supabase.from("participations").select("boletos,resultado,es_gratis").eq("user_id",MY_USER_ID),
    supabase.from("payments").select("estado,monto").eq("user_id",MY_USER_ID),
    supabase.from("referidos").select("estado,boleto_otorgado").eq("referidor_id",MY_USER_ID),
    supabase.from("prize_payments").select("lugar,monto").eq("user_id",MY_USER_ID),
    supabase.from("boletos_gratis").select("id,origen,created_at").eq("user_id",MY_USER_ID).eq("usado",false).order("created_at",{ascending:true}),
  ]);

  const totalBoletos   = (parts||[]).reduce((s,p)=>s+(p.boletos||1),0);
  const totalAprobados = (pays||[]).filter(p=>p.estado==="aprobado"&&p.monto>0).length;
  const totalGastado   = (pays||[]).filter(p=>p.estado==="aprobado"&&p.monto>0).reduce((s,p)=>s+Number(p.monto||0),0);
  const totalRefs      = (refs||[]).length;
  const refsActivos    = (refs||[]).filter(r=>r.estado==="completado").length;
  const totalGanadas   = (parts||[]).filter(p=>p.resultado==="ganada").length;
  const totalGanado    = (premios||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const primerLugar    = (premios||[]).filter(p=>p.lugar===1).length;
  const bgsTotal       = bgsDisp?.length||0;
  const nivel          = getNivel(totalBoletos);
  const proxNivel      = getProximoNivel(totalBoletos);

  const grupos = [
    {
      label:"🚀 Iniciación", sub:"Primeros pasos",
      logros:[
        {nombre:"Bienvenido",   desc:"Participa en tu primer sorteo",  icono:"bi-door-open-fill",  logrado:totalBoletos>=1,  prog:Math.min(totalBoletos,1),  max:1,   xp:10},
        {nombre:"Arrancando",   desc:"Participa en 5 sorteos",         icono:"bi-speedometer2",    logrado:totalBoletos>=5,  prog:Math.min(totalBoletos,5),  max:5,   xp:25},
        {nombre:"Primer golpe", desc:"Gana tu primer sorteo",          icono:"bi-star-fill",       logrado:totalGanadas>=1,  prog:Math.min(totalGanadas,1),  max:1,   xp:50},
      ]
    },
    {
      label:"📅 Constancia", sub:"Premio a la lealtad",
      logros:[
        {nombre:"10 pagados",   desc:"Compra 10 boletos pagados",      icono:"bi-stack",           logrado:totalAprobados>=10,prog:Math.min(totalAprobados,10),max:10, xp:40},
        {nombre:"Veterano",     desc:"Participa en 20 sorteos",        icono:"bi-calendar-check",  logrado:totalBoletos>=20, prog:Math.min(totalBoletos,20),  max:20,  xp:60},
        {nombre:"El Fiel",      desc:"Participa en 50 sorteos",        icono:"bi-patch-star-fill", logrado:totalBoletos>=50, prog:Math.min(totalBoletos,50),  max:50,  xp:100},
        {nombre:"Cien Rondas",  desc:"100 sorteos participados",       icono:"bi-award-fill",      logrado:totalBoletos>=100,prog:Math.min(totalBoletos,100), max:100, xp:200},
      ]
    },
    {
      label:"💰 Inversión", sub:"Metas de gasto",
      logros:[
        {nombre:"Apostador",    desc:"Invierte Bs 50 en total",        icono:"bi-bank2",           logrado:totalGastado>=50,  prog:Math.min(totalGastado,50),  max:50,  xp:35},
        {nombre:"El Patrón",    desc:"Invierte Bs 200 en total",       icono:"bi-gem",             logrado:totalGastado>=200, prog:Math.min(totalGastado,200), max:200, xp:80},
        {nombre:"Gran Patrón",  desc:"Invierte Bs 500 en total",       icono:"bi-safe-fill",       logrado:totalGastado>=500, prog:Math.min(totalGastado,500), max:500, xp:150},
      ]
    },
    {
      label:"👥 Social", sub:"Construye tu red",
      logros:[
        {nombre:"Reclutador",   desc:"Invita 3 amigos activos",        icono:"bi-people-fill",     logrado:refsActivos>=3,  prog:Math.min(refsActivos,3),   max:3,   xp:60},
        {nombre:"Red sólida",   desc:"Invita 10 amigos activos",       icono:"bi-diagram-3-fill",  logrado:refsActivos>=10, prog:Math.min(refsActivos,10),  max:10,  xp:120},
      ]
    },
    {
      label:"👑 Élite", sub:"Solo para los mejores",
      logros:[
        {nombre:"Triple Corona",desc:"Gana 3 sorteos",                 icono:"bi-trophy-fill",     logrado:totalGanadas>=3,  prog:Math.min(totalGanadas,3),  max:3,   xp:100},
        {nombre:"Gran Ganador", desc:"Acumula Bs 100 en premios",      icono:"bi-cash-coin",       logrado:totalGanado>=100, prog:Math.min(totalGanado,100), max:100, xp:150},
        {nombre:"El Primero",   desc:"Gana 2 veces en 1er lugar",      icono:"bi-1-circle-fill",   logrado:primerLugar>=2,   prog:Math.min(primerLugar,2),   max:2,   xp:200},
        {nombre:"Leyenda",      desc:"200 sorteos participados",       icono:"bi-fire",            logrado:totalBoletos>=200,prog:Math.min(totalBoletos,200), max:200, xp:500},
      ]
    }
  ];

  const totalLogros   = grupos.flatMap(g=>g.logros).length;
  const logradosTotal = grupos.flatMap(g=>g.logros).filter(l=>l.logrado).length;
  const xpTotal       = grupos.flatMap(g=>g.logros).filter(l=>l.logrado).reduce((s,l)=>s+l.xp, 0);

  function renderGrupos() {
    return grupos.map(g => {
      const done = g.logros.filter(l=>l.logrado).length;
      const logroItems = g.logros.map(l => {
        const pct = Math.min(Math.round((l.prog/l.max)*100), 100);
        return `
        <div class="lg-card ${l.logrado?"lg-done":""}">
          <div class="lg-icon ${l.logrado?"lg-icon-done":""}"><i class="bi ${l.icono}"></i></div>
          <div class="lg-body">
            <div class="lg-nombre">${l.nombre}</div>
            <div class="lg-desc">${l.desc}</div>
            <div class="lg-barra-wrap">
              <div class="lg-barra"><div class="lg-barra-fill ${l.logrado?"lg-barra-ok":""}" style="width:${pct}%"></div></div>
              <span class="lg-prog-txt">${l.prog}/${l.max}</span>
            </div>
          </div>
          <div class="lg-xp ${l.logrado?"lg-xp-done":"lg-xp-lock"}">
            ${l.logrado?`<i class="bi bi-check-circle-fill" style="font-size:.7rem"></i>`:`<i class="bi bi-lock-fill" style="font-size:.65rem"></i>`}
            ${l.xp}
          </div>
        </div>`;
      }).join("");
      return `
      <div class="lg-grupo">
        <div class="lg-grupo-hdr">
          <span class="lg-grupo-label">${g.label}</span>
          <span class="lg-grupo-sub">${g.sub}</span>
          <span class="lg-grupo-count">${done}/${g.logros.length}</span>
        </div>
        <div class="lg-lista">${logroItems}</div>
      </div>`;
    }).join("");
  }

  el.innerHTML = `
  <div class="panel nivel-panel-premium">
    <div class="panel-body nivel-body">
      <div class="nivel-row">
        <div class="nivel-avatar"><i class="bi bi-person-badge-fill"></i></div>
        <div class="nivel-info">
          <div class="nivel-nombre">${nivel.label}</div>
          <div class="nivel-badge ${nivel.clase}"><i class="bi bi-star-fill"></i> ${totalBoletos} boleto${totalBoletos!==1?"s":""}</div>
        </div>
        <div class="nivel-xp-box">
          <div class="nivel-xp-val">${xpTotal} <span>XP</span></div>
          <div class="nivel-xp-sub">${logradosTotal}/${totalLogros} logros</div>
        </div>
      </div>
      ${proxNivel ? `
      <div class="nivel-prog-row">
        <span class="nivel-prog-lbl">→ <strong>${proxNivel.label}</strong></span>
        <span class="nivel-prog-num">${proxNivel.progreso}/${proxNivel.requerido}</span>
      </div>
      <div class="nivel-barra-bg"><div class="nivel-barra-fill" style="width:${proxNivel.pct}%"></div></div>
      <div class="nivel-prog-hint">Faltan ${proxNivel.requerido-proxNivel.progreso} boleto${proxNivel.requerido-proxNivel.progreso!==1?"s":""} más</div>
      ` : `<div class="nivel-max-msg"><i class="bi bi-crown-fill"></i> ¡Nivel máximo alcanzado! 🏆</div>`}
    </div>
  </div>

  <div class="fid-grid">
    <div class="fid-cell"><i class="bi bi-ticket-perforated-fill fid-ico"></i><div class="fid-num">${totalBoletos}</div><div class="fid-lbl">Boletos</div></div>
    <div class="fid-cell"><i class="bi bi-trophy-fill fid-ico" style="color:#fbbf24"></i><div class="fid-num">${totalGanadas}</div><div class="fid-lbl">Ganados</div></div>
    <div class="fid-cell"><i class="bi bi-people-fill fid-ico" style="color:#818cf8"></i><div class="fid-num">${refsActivos}</div><div class="fid-lbl">Referidos</div></div>
    <div class="fid-cell"><i class="bi bi-gift-fill fid-ico" style="color:#22c55e"></i><div class="fid-num">${bgsTotal}</div><div class="fid-lbl">Gratis</div></div>
    <div class="fid-cell"><i class="bi bi-cash-stack fid-ico" style="color:#22c55e"></i><div class="fid-num">${fmtMoney(totalGanado)}</div><div class="fid-lbl">Ganado</div></div>
    <div class="fid-cell"><i class="bi bi-lightning-fill fid-ico" style="color:#fbbf24"></i><div class="fid-num">${xpTotal}</div><div class="fid-lbl">XP</div></div>
  </div>

  ${bgsTotal>0 ? `
  <div class="boleto-gratis-banner">
    <i class="bi bi-gift-fill bfb-icon"></i>
    <div><div class="bfb-title">${bgsTotal} boleto${bgsTotal>1?"s":""} gratis disponible${bgsTotal>1?"s":""}</div><div class="bfb-sub">Solo 1 por sorteo · Vencen en 24h</div></div>
    <button class="btn btn-green btn-sm" onclick="loadSection('sorteos')"><i class="bi bi-ticket-perforated-fill"></i> Usar</button>
  </div>` : ""}

  <div class="panel">
    <div class="panel-head">
      <div class="panel-title"><i class="bi bi-stars"></i>Logros</div>
      <span class="lg-total-badge">${logradosTotal}/${totalLogros}</span>
    </div>
    <div class="panel-body" style="padding:.5rem .75rem .75rem">${renderGrupos()}</div>
  </div>`;
}

/* ═══════════════════════════════════════
   MI PERFIL
═══════════════════════════════════════ */
async function loadPerfil() {
  const el=getEl("perfilContent"); if(!el) return;
  el.innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;

  const prof=await refreshProfile();
  qrState={subido:!!prof.qr_cobro_url,verificado:!!prof.qr_verificado,url:prof.qr_cobro_url||null,metodo:prof.qr_metodo||null,subidoAt:prof.qr_subido_at||null};
  initUserUI(prof);

  const[{data:parts},{data:pays},{data:premios},{data:refs}]=await Promise.all([
    supabase.from("participations").select("id,resultado,boletos,es_gratis").eq("user_id",MY_USER_ID),
    supabase.from("payments").select("id,estado,monto").eq("user_id",MY_USER_ID),
    supabase.from("prize_payments").select("id,monto").eq("user_id",MY_USER_ID),
    supabase.from("referidos").select("id,estado").eq("referidor_id",MY_USER_ID),
  ]);

  const totalBoletos=(parts||[]).reduce((s,p)=>s+(p.boletos||1),0);
  const totalBoltGratis=(parts||[]).filter(p=>p.es_gratis===true).reduce((s,p)=>s+(p.boletos||0),0);
  const totalGanados=(parts||[]).filter(p=>p.resultado==="ganada").length;
  const totalGastado=(pays||[]).filter(p=>p.estado==="aprobado"&&p.monto>0).reduce((s,p)=>s+Number(p.monto||0),0);
  const totalGanado=(premios||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const totalPremios=(premios||[]).length;
  const totalRefs=(refs||[]).length;
  const refsActivos=(refs||[]).filter(r=>r.estado==="completado").length;
  const nivel=getNivel(totalBoletos);
  const ini=(prof?.username?.[0]||"?").toUpperCase();
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};
  const tasaVictoria=parts?.length?Math.round((totalGanados/parts.length)*100):0;

  el.innerHTML=`
  <div class="panel perfil-card">
    <div class="perfil-header">
      <div class="perfil-avatar-wrap"><div class="perfil-avatar">${ini}</div></div>
      <div class="perfil-info">
        <div class="perfil-username">${prof?.username??"—"}</div>
        <div class="perfil-email"><i class="bi bi-envelope"></i> ${user.email??"—"}</div>
        <div class="perfil-since"><i class="bi bi-calendar3"></i> Desde ${prof?.created_at?fmtDateShort(prof.created_at):"—"}</div>
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
      ${totalBoletos>0?`<div style="margin-top:.8rem;background:rgba(212,160,23,.05);border:1px solid rgba(212,160,23,.12);border-radius:8px;padding:.65rem 1rem;font-size:.82rem;color:var(--muted)">
        <i class="bi bi-info-circle" style="color:var(--gold2)"></i> Victoria: <strong style="color:var(--gold2)">${tasaVictoria}%</strong> · ${totalPremios} premio${totalPremios!==1?"s":""} · ${totalBoltGratis} gratis usados · ${refsActivos} refs activos
      </div>`:""}
    </div>
  </div>
  <div class="panel">
    <div class="panel-head"><div class="panel-title"><i class="bi bi-qr-code"></i>Mi QR de cobros</div>
      <div style="display:flex;align-items:center;gap:.4rem">
        ${qrState.subido?`<button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()"><i class="bi bi-eye"></i></button><button class="btn btn-ghost btn-sm" onclick="modalSubirQR(true)"><i class="bi bi-arrow-repeat"></i></button>`:""}
      </div>
    </div>
    <div class="panel-body">${!qrState.subido?`<div class="qr-empty-state"><div class="qes-icon"><i class="bi bi-qr-code-scan"></i></div><div class="qes-title">Sin QR de cobros</div><div class="qes-sub">Requerido para participar y recibir premios.</div><button class="btn btn-red btn-md" style="margin-top:1rem" onclick="modalSubirQR()"><i class="bi bi-upload"></i> Subir QR</button></div>`:
    `<div class="qr-perfil-wrap"><img src="${qrState.url}" style="max-height:180px;max-width:100%;border-radius:10px;border:1px solid rgba(212,160,23,.22);object-fit:contain;cursor:pointer" onclick="modalVerMiQR()" loading="lazy" onerror="this.style.display='none'">
    <div class="qr-details-grid"><div class="qr-detail-box"><div class="qdb-label">Método</div><div class="qdb-val">${mlM[qrState.metodo]||qrState.metodo||"—"}</div></div><div class="qr-detail-box"><div class="qdb-label">Estado</div><div class="qdb-val">${qrState.verificado?'<span class="bdg bdg-ok"><i class="bi bi-shield-check"></i> OK</span>':'<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Revisión</span>'}</div></div></div>
    </div>`}</div>
  </div>
  <div class="panel">
    <div class="panel-head"><div class="panel-title"><i class="bi bi-person-gear"></i>Cuenta</div></div>
    <div class="panel-body"><div class="account-rows">
      <div class="account-row"><div class="ar-label"><i class="bi bi-person"></i> Usuario</div><div class="ar-val">${prof?.username??"—"}</div></div>
      <div class="account-row"><div class="ar-label"><i class="bi bi-envelope"></i> Email</div><div class="ar-val">${user.email??"—"}</div></div>
      <div class="account-row"><div class="ar-label"><i class="bi bi-hash"></i> Código referido</div><div class="ar-val">${prof?.codigo_referido||"—"}${prof?.codigo_referido?`<button class="btn btn-ghost btn-sm" onclick="copiarCodigo('${prof.codigo_referido}')"><i class="bi bi-copy"></i></button>`:""}</div></div>
      <div class="account-row"><div class="ar-label"><i class="bi bi-shield"></i> Rol</div><div class="ar-val"><span class="bdg bdg-p">${prof?.rol??"usuario"}</span></div></div>
    </div>
    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
      <button class="btn btn-ghost btn-sm" style="width:100%" onclick="modalCambiarPassword()"><i class="bi bi-key"></i> Cambiar contraseña</button>
    </div></div>
  </div>`;
}

window.modalCambiarPassword=async()=>{
  const{value:v}=await Swal.fire({
    title:"Cambiar contraseña",
    html:`<div style="text-align:left"><div class="field" style="margin-bottom:.85rem"><label>Nueva contraseña *</label><input id="pwNew" type="password" placeholder="Mínimo 6 caracteres" style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.95rem"></div><div class="field"><label>Confirmar *</label><input id="pwConf" type="password" placeholder="Repite la contraseña" style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem;font-size:.95rem"></div></div>`,
    showCancelButton:true,confirmButtonText:"<i class='bi bi-check-lg'></i> Cambiar",cancelButtonText:"Cancelar",width:400,...swal$,
    preConfirm:()=>{
      const np=document.getElementById("pwNew").value,cp=document.getElementById("pwConf").value;
      if(np.length<6){Swal.showValidationMessage("Mínimo 6 caracteres");return false;}
      if(np!==cp){Swal.showValidationMessage("Las contraseñas no coinciden");return false;}
      return{password:np};
    }
  });
  if(!v) return;
  loading$("Actualizando...");
  const{error}=await supabase.auth.updateUser({password:v.password});
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  ok$("✅ Contraseña actualizada","","success");
};

/* ═══════════════════════════════════════
   ARRANQUE
═══════════════════════════════════════ */
loadSection("sorteos");
