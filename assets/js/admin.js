import { supabase } from "./supabase.js";
import { realizarSorteo as calcSorteo, nombreCaso, getSorteoTheme, getModoGanadores } from "./logica_juego.js";
import { uploadFile } from "./cloudinary.js";

/* ════════════════════════════════════════
   HELPERS GLOBALES
════════════════════════════════════════ */
const MC = () => document.getElementById("mainContent");
const swal$ = { background:'#131009', color:'#e6dcc8', confirmButtonColor:'#8b1a1a', cancelButtonColor:'#221c14' };

function notif(msg, tipo="ok", duracion=3500) {
  const stack = document.getElementById("notifStack");
  if (!stack) return;
  const ico = { ok:"bi-check-circle-fill", err:"bi-x-circle-fill", warn:"bi-exclamation-triangle-fill" }[tipo] || "bi-info-circle-fill";
  const el = document.createElement("div");
  el.className = `notif-item notif-${tipo}`;
  el.innerHTML = `<i class="bi ${ico}"></i><span>${msg}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),350); }, duracion);
}

const toast = (msg, tipo="ok") => notif(msg, tipo);
const swalToast = (title, icon="success") => Swal.fire({ title, icon, toast:true, position:"top-end", showConfirmButton:false, timer:2800, timerProgressBar:true, background:'#1b1610', color:'#e6dcc8', iconColor: icon==="success"?"#22c55e":icon==="error"?"#f87171":"#d4a017" });
const confirm$ = (title, html, confirmText="Confirmar") => Swal.fire({ title, html, icon:"warning", showCancelButton:true, confirmButtonText:confirmText, cancelButtonText:"Cancelar", ...swal$ });
const loading$ = (text="Procesando...") => Swal.fire({ title:text, allowOutsideClick:false, showConfirmButton:false, didOpen:()=>Swal.showLoading(), ...swal$ });
const ok$ = (title, html="", icon="success") => Swal.fire({ title, html, icon, confirmButtonText:"OK", ...swal$ });

function fmtDate(d)      { return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
function fmtDateShort(d) { return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric"}); }
function fmtMoney(n)     { return `Bs ${Number(n||0).toFixed(2)}`; }
function fmtMoneyR(n)    { const v=Number(n||0); return v===Math.round(v)?`Bs ${Math.round(v)}`:`Bs ${v.toFixed(2)}`; }
function fmtPct(n)       { return `${Number(n||0).toFixed(1)}%`; }

const CAPACIDAD_DEFAULT = 25;
function getCapacidad(game) { return Number(game?.capacidad_max || CAPACIDAD_DEFAULT); }

function badge(est) {
  const map = {
    pendiente: ["bdg bdg-p","⏳ Pendiente"], aprobado:["bdg bdg-ok","✓ Aprobado"],
    rechazado: ["bdg bdg-bad","✗ Rechazado"], activo:["bdg bdg-ok","Activo"],
    inactivo:  ["bdg bdg-closed","Inactivo"], suspendido:["bdg bdg-bad","Suspendido"],
    abierta:   ["bdg bdg-open","Abierta"], cerrada:["bdg bdg-closed","Cerrada"],
    sorteada:  ["bdg bdg-win","✓ Sorteada"], ganada:["bdg bdg-win","🏆 Ganador"],
    perdida:   ["bdg bdg-bad","Perdida"], admin:["bdg bdg-win","Admin"],
    trabajador:["bdg bdg-open","Trabajador"], usuario:["bdg bdg-closed","Usuario"],
    enviado:   ["bdg bdg-ok","✅ Enviado"], confirmado:["bdg bdg-win","✓ Confirmado"],
    completado:["bdg bdg-ok","✓ Completado"], gratis:["bdg bdg-free","🎁 Gratis"],
  };
  const [cls, label] = map[est] || ["bdg bdg-p", est];
  return `<span class="${cls}">${label}</span>`;
}

function initDT(id, opts={}) {
  setTimeout(() => {
    if (!document.getElementById(id)) return;
    if ($.fn.DataTable.isDataTable(`#${id}`)) $(`#${id}`).DataTable().destroy();
    $(`#${id}`).DataTable({ language:{search:"Buscar:",lengthMenu:"Mostrar _MENU_",info:"_START_–_END_ de _TOTAL_",paginate:{previous:"‹",next:"›"},zeroRecords:"Sin resultados",emptyTable:"Sin datos"}, pageLength:15, ...opts });
  }, 100);
}

function loadingView() { MC().innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`; }
function setActive(view) { document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view)); }

window.__back = null;
function renderBackBtn(label, fn) { window.__back=fn; return `<button class="btn btn-dark btn-md" onclick="window.__back()"><i class="bi bi-arrow-left"></i> ${label}</button>`; }

let _currentView = "dashboard";
function setCurrentView(v) { _currentView = v; }

async function getProfilesMap(userIds) {
  if (!userIds?.length) return {};
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await supabase.from("profiles").select("id,username,email,qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at,saldo,total_ganado").in("id",ids);
  const m={}; (data||[]).forEach(p=>{m[p.id]=p}); return m;
}

/* ── Tema visual del sorteo (mismo que usuario) ── */
function _sorteoHeaderHtml(game, opts={}) {
  const { height="72px", showInfo=true } = opts;
  const theme = getSorteoTheme(game?.nombre||"");
  const modo = getModoGanadores(getCapacidad(game));
  const imgUrl = game?.imagen_url || null;

  if (imgUrl) {
    return `<div style="height:${height};border-radius:9px 9px 0 0;overflow:hidden;position:relative;background:#1b1610">
      <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy" onerror="this.style.display='none'">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,.6) 100%)"></div>
      ${showInfo?`<div style="position:absolute;bottom:.5rem;left:.75rem;display:flex;gap:.3rem;z-index:1">
        <span style="font-family:'Oswald',sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.07em;padding:.1rem .45rem;border-radius:20px;backdrop-filter:blur(6px);${modo===1?"background:rgba(212,160,23,.3);border:1px solid rgba(212,160,23,.5);color:#fcd34d":"background:rgba(99,102,241,.3);border:1px solid rgba(99,102,241,.5);color:#c7d2fe"}">${modo===1?"🥇 1 Ganador":"🏅 3 Ganadores"}</span>
        ${game?.precio_boleto===0?`<span style="font-family:'Oswald',sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.1em;background:rgba(34,197,94,.32);border:1px solid rgba(34,197,94,.5);color:#4ade80;border-radius:20px;padding:.1rem .45rem">GRATIS</span>`:""}
      </div>`:""}
    </div>`;
  }
  return `<div style="height:${height};border-radius:9px 9px 0 0;overflow:hidden;position:relative;background:${theme.gradient}">
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,.45) 100%)"></div>
    <div style="position:absolute;right:.8rem;top:50%;transform:translateY(-50%);font-size:2rem;filter:drop-shadow(0 2px 5px rgba(0,0,0,.5));z-index:1">${theme.icon}</div>
    ${showInfo?`<div style="position:absolute;bottom:.5rem;left:.75rem;display:flex;gap:.3rem;z-index:1">
      <span style="font-family:'Oswald',sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.07em;padding:.1rem .45rem;border-radius:20px;backdrop-filter:blur(6px);${modo===1?"background:rgba(212,160,23,.3);border:1px solid rgba(212,160,23,.5);color:#fcd34d":"background:rgba(99,102,241,.3);border:1px solid rgba(99,102,241,.5);color:#c7d2fe"}">${modo===1?"🥇 1 Ganador":"🏅 3 Ganadores"}</span>
      ${game?.precio_boleto===0?`<span style="font-family:'Oswald',sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.1em;background:rgba(34,197,94,.32);border:1px solid rgba(34,197,94,.5);color:#4ade80;border-radius:20px;padding:.1rem .45rem">GRATIS</span>`:""}
    </div>`:""}
  </div>`;
}

/* ── Campo imagen reutilizable ── */
function _campoImagenSwal(urlActual=null) {
  return `
  <div style="margin-bottom:.9rem">
    <label style="display:block;font-family:'Oswald',sans-serif;font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#8a7a62;margin-bottom:.4rem">
      Imagen del sorteo <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#4a3c2a">(opcional)</span>
    </label>
    <div style="display:flex;gap:0;border-radius:7px;overflow:hidden;border:1px solid rgba(139,26,26,.22);margin-bottom:.5rem">
      <button type="button" id="tabSubirImg" onclick="switchImgTab('subir')"
        style="flex:1;padding:.35rem .5rem;font-family:'Oswald',sans-serif;font-size:.74rem;font-weight:600;letter-spacing:.06em;background:rgba(212,160,23,.14);color:#d4a017;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.3rem;transition:all .18s">
        <i class="bi bi-upload"></i> Subir archivo
      </button>
      <button type="button" id="tabUrlImg" onclick="switchImgTab('url')"
        style="flex:1;padding:.35rem .5rem;font-family:'Oswald',sans-serif;font-size:.74rem;font-weight:600;letter-spacing:.06em;background:rgba(255,255,255,.04);color:#8a7a62;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.3rem;transition:all .18s">
        <i class="bi bi-link-45deg"></i> URL Cloudinary
      </button>
    </div>
    <div id="panelSubirImg">
      <div style="position:relative;background:#1b1610;border:1.5px dashed rgba(139,26,26,.3);border-radius:9px;min-height:68px;display:flex;align-items:center;justify-content:center;overflow:hidden;transition:border-color .2s;cursor:pointer" id="imgDropArea"
        onclick="document.getElementById('imgFileInput').click()"
        ondragover="event.preventDefault();this.style.borderColor='#d4a017'"
        ondragleave="this.style.borderColor='rgba(139,26,26,.3)'"
        ondrop="handleImgDrop(event)">
        <input type="file" id="imgFileInput" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="previewImgFile(this)">
        <div id="imgUploadPh" style="display:flex;flex-direction:column;align-items:center;gap:.3rem;color:#4a3c2a;font-size:.82rem;pointer-events:none">
          <i class="bi bi-cloud-upload-fill" style="font-size:1.6rem;color:#554535"></i>
          <span>Arrastra o toca para elegir (JPG/PNG/WEBP, máx. 4MB)</span>
        </div>
        <img id="imgFilePreview" style="display:none;width:100%;max-height:110px;object-fit:cover;border-radius:7px;position:relative;z-index:1">
      </div>
    </div>
    <div id="panelUrlImg" style="display:none">
      <input type="url" id="imgUrlInput" placeholder="https://res.cloudinary.com/…"
        style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .85rem;font-size:.88rem;outline:none"
        oninput="previewImgUrl(this.value)">
      <div id="imgUrlPreview" style="display:none;margin-top:.45rem;border-radius:7px;overflow:hidden;border:1px solid rgba(212,160,23,.2)">
        <img id="imgUrlPreviewImg" style="width:100%;max-height:100px;object-fit:cover;display:block" onerror="document.getElementById('imgUrlPreview').style.display='none'">
      </div>
    </div>
    ${urlActual?`
    <div id="imgActualWrap" style="margin-top:.5rem">
      <div style="font-size:.68rem;color:#554535;margin-bottom:.3rem;font-family:'Oswald',sans-serif;letter-spacing:.08em;text-transform:uppercase">Imagen actual</div>
      <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid rgba(212,160,23,.2);max-height:90px">
        <img src="${urlActual}" style="width:100%;max-height:90px;object-fit:cover;display:block">
        <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,.6))"></div>
        <label style="position:absolute;bottom:.4rem;right:.5rem;display:flex;align-items:center;gap:.35rem;font-size:.72rem;color:#fff;cursor:pointer">
          <input type="checkbox" id="gQuitarImg" style="accent-color:#f87171;width:13px;height:13px">
          <span>Quitar imagen</span>
        </label>
      </div>
    </div>`:""}
    <div style="font-size:.67rem;color:#3a2e1e;margin-top:.35rem;display:flex;align-items:center;gap:.28rem">
      <i class="bi bi-info-circle" style="color:#d4a017;font-size:.7rem"></i>
      Si no hay imagen, se muestra el tema visual automático según el nombre del sorteo
    </div>
  </div>`;
}

window.switchImgTab = (tab) => {
  const isSubir = tab === 'subir';
  const ps = document.getElementById('panelSubirImg');
  const pu = document.getElementById('panelUrlImg');
  const ts = document.getElementById('tabSubirImg');
  const tu = document.getElementById('tabUrlImg');
  if(ps) ps.style.display = isSubir ? 'block' : 'none';
  if(pu) pu.style.display = isSubir ? 'none' : 'block';
  if(ts) { ts.style.background = isSubir ? 'rgba(212,160,23,.14)' : 'rgba(255,255,255,.04)'; ts.style.color = isSubir ? '#d4a017' : '#8a7a62'; }
  if(tu) { tu.style.background = isSubir ? 'rgba(255,255,255,.04)' : 'rgba(212,160,23,.14)'; tu.style.color = isSubir ? '#8a7a62' : '#d4a017'; }
};

window.previewImgFile = (input) => {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('imgFilePreview');
    const ph  = document.getElementById('imgUploadPh');
    if (img) { img.src = ev.target.result; img.style.display = 'block'; }
    if (ph)  ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.handleImgDrop = (event) => {
  event.preventDefault();
  const area = document.getElementById('imgDropArea');
  if(area) area.style.borderColor = 'rgba(139,26,26,.3)';
  const file = event.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const dt = new DataTransfer(); dt.items.add(file);
  const input = document.getElementById('imgFileInput');
  if(input) { input.files = dt.files; window.previewImgFile(input); }
};

window.previewImgUrl = (url) => {
  const wrap = document.getElementById('imgUrlPreview');
  const img  = document.getElementById('imgUrlPreviewImg');
  if (!url || !url.startsWith('http')) { if(wrap) wrap.style.display='none'; return; }
  if (img)  img.src = url;
  if (wrap) wrap.style.display = 'block';
};

async function _obtenerUrlImagenModal(urlAnterior=null) {
  const panelSubir = document.getElementById('panelSubirImg');
  const quitarChk = document.getElementById('gQuitarImg');

  if (quitarChk?.checked) return null; // quitar imagen

  const isSubir = panelSubir && panelSubir.style.display !== 'none';

  if (isSubir) {
    const file = document.getElementById('imgFileInput')?.files[0];
    if (!file) return urlAnterior; // sin cambio
    if (file.size > 4 * 1024 * 1024) { Swal.showValidationMessage('Imagen muy grande (máx. 4MB)'); return false; }
    try { return await uploadFile(file, 'el-padrino/sorteos'); }
    catch { Swal.showValidationMessage('Error al subir imagen. Intenta de nuevo.'); return false; }
  } else {
    const url = document.getElementById('imgUrlInput')?.value?.trim() || null;
    if (url && !url.startsWith('http')) { Swal.showValidationMessage('URL inválida'); return false; }
    return url || urlAnterior;
  }
}

/* ════════════════════════════════════════
   SIDEBAR BADGES
════════════════════════════════════════ */
async function updateSidebarBadges() {
  try {
    const [{ count:pend }, { count:qrPend }, { data:premPend }] = await Promise.all([
      supabase.from("payments").select("*",{count:"exact",head:true}).eq("estado","pendiente"),
      supabase.from("profiles").select("*",{count:"exact",head:true}).eq("rol","usuario").not("qr_cobro_url","is",null).eq("qr_verificado",false),
      supabase.from("rounds").select("id,ganador_id,ganador2_id,ganador3_id").eq("estado","sorteada").not("ganador_id","is",null),
    ]);
    const rIds = (premPend||[]).map(r=>r.id);
    let premiosPendientes = 0;
    if (rIds.length) {
      const {data:pp} = await supabase.from("prize_payments").select("round_id,lugar").in("round_id",rIds);
      const pagados = new Set((pp||[]).map(p=>`${p.round_id}_${p.lugar}`));
      (premPend||[]).forEach(r=>{
        if (r.ganador_id  && !pagados.has(`${r.id}_1`)) premiosPendientes++;
        if (r.ganador2_id && !pagados.has(`${r.id}_2`)) premiosPendientes++;
        if (r.ganador3_id && !pagados.has(`${r.id}_3`)) premiosPendientes++;
      });
    }
    const set = (id,val) => { const el=document.getElementById(id); if(el){el.textContent=val||0;el.style.display=(val>0)?"inline-flex":"none";} };
    set("badgePend", pend); set("badgeQR", qrPend); set("badgePremios", premiosPendientes);
  } catch(e) { console.warn("badges:",e); }
}

/* ════════════════════════════════════════
   REALTIME
════════════════════════════════════════ */
const viewReloaders = {
  dashboard:()=>dashboard(), pagos_pendientes:()=>pagos_pendientes(),
  sorteos:()=>sorteos(), ganadores:()=>ganadores(), enviar_premios:()=>enviar_premios(),
  usuarios:()=>usuarios(), qr_usuarios:()=>qr_usuarios(), finanzas:()=>finanzas(),
  referidos:()=>referidos(), boletos_gratis:()=>boletos_gratis(),
};
let _reloadTimer=null;
function scheduleReload(delay=700) {
  clearTimeout(_reloadTimer);
  _reloadTimer = setTimeout(()=>{ updateSidebarBadges(); viewReloaders[_currentView]?.(); }, delay);
}
function initRealtime() {
  ["payments","participations","profiles","rounds","prize_payments","boletos_gratis"].forEach(table=>{
    supabase.channel(`rt-${table}`).on("postgres_changes",{event:"*",schema:"public",table},()=>scheduleReload()).subscribe();
  });
}

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
const { data:{ user } } = await supabase.auth.getUser();
if (!user) { window.location.href="../../auth/login.html"; throw 0; }

const { data:myProfile, error:profileError } = await supabase.from("profiles").select("username,rol,estado").eq("id",user.id).single();
if (profileError||!myProfile) { MC().innerHTML=`<div style="padding:2rem;text-align:center;color:#f87171">Error al cargar perfil admin</div>`; throw 0; }
if (myProfile.estado!=="activo"||!["admin","trabajador"].includes(myProfile.rol)) { await supabase.auth.signOut(); window.location.href="../../auth/login.html"; throw 0; }

const adminUsername = myProfile.username;
document.getElementById("adminName").textContent = adminUsername;
document.getElementById("sbName").textContent = adminUsername;
document.getElementById("sbAv").textContent = adminUsername[0].toUpperCase();

async function doLogout() {
  const r=await confirm$("¿Cerrar sesión?","","Sí, salir");
  if(r.isConfirmed){await supabase.auth.signOut();window.location.href="../../auth/login.html";}
}
document.getElementById("logoutBtn").addEventListener("click",doLogout);
document.getElementById("logoutBtn2").addEventListener("click",doLogout);

/* ════════════════════════════════════════
   NAVEGACIÓN
════════════════════════════════════════ */
const views = { dashboard, sorteos, ganadores, usuarios, trabajadores, premios_catalogo, finanzas, pagos_pendientes, enviar_premios, qr_usuarios, referidos, boletos_gratis, configuracion };
document.querySelectorAll("[data-view]").forEach(btn=>{
  btn.addEventListener("click",()=>{ setActive(btn.dataset.view); setCurrentView(btn.dataset.view); views[btn.dataset.view]?.(); });
});

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
async function dashboard() {
  setActive("dashboard"); setCurrentView("dashboard"); loadingView(); updateSidebarBadges();

  const [
    {count:totalUsuarios},{count:pagosPend},{count:rondasAbiertas},{count:totalSorteadas},
    {count:qrPendientes},{data:recientes},{data:rondasRecientes},{data:premiosHoy},{data:pagosHoy}
  ] = await Promise.all([
    supabase.from("profiles").select("*",{count:"exact",head:true}).eq("rol","usuario"),
    supabase.from("payments").select("*",{count:"exact",head:true}).eq("estado","pendiente"),
    supabase.from("rounds").select("*",{count:"exact",head:true}).eq("estado","abierta"),
    supabase.from("rounds").select("*",{count:"exact",head:true}).eq("estado","sorteada"),
    supabase.from("profiles").select("*",{count:"exact",head:true}).eq("rol","usuario").not("qr_cobro_url","is",null).eq("qr_verificado",false),
    supabase.from("payments").select("id,monto,metodo,estado,created_at,user_id").order("created_at",{ascending:false}).limit(7),
    supabase.from("rounds").select("id,numero,estado,created_at,game_id").order("created_at",{ascending:false}).limit(5),
    supabase.from("prize_payments").select("monto").gte("created_at", new Date(Date.now()-86400000).toISOString()),
    supabase.from("payments").select("monto").eq("estado","aprobado").gte("created_at", new Date(Date.now()-86400000).toISOString()),
  ]);

  const payProfiles = await getProfilesMap((recientes||[]).map(p=>p.user_id));
  const gameIds = [...new Set((rondasRecientes||[]).map(r=>r.game_id).filter(Boolean))];
  let gamesMap={};
  if(gameIds.length){const{data:gd}=await supabase.from("games").select("id,nombre,capacidad_max,imagen_url,visible,auto_siguiente_ronda").in("id",gameIds);(gd||[]).forEach(g=>{gamesMap[g.id]=g});}

  const rondasConCupos = await Promise.all((rondasRecientes||[]).map(async r=>{
    const{data:parts}=await supabase.from("participations").select("boletos").eq("round_id",r.id);
    const cap = getCapacidad(gamesMap[r.game_id]);
    return{...r,cupos:(parts||[]).reduce((s,p)=>s+(p.boletos||1),0),capacidad:cap,game:gamesMap[r.game_id]};
  }));

  const totalPremiosHoy = (premiosHoy||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const totalIngresosHoy= (pagosHoy||[]).reduce((s,p)=>s+Number(p.monto||0),0);

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-speedometer2"></i>Dashboard</div>
        <div class="ph-sub">${new Date().toLocaleDateString("es-BO",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
      </div>
      <div style="display:flex;align-items:center;gap:.6rem">
        <span class="rt-dot"></span><span class="rt-label">Actualización automática</span>
        <button class="btn btn-dark btn-sm" onclick="dashboard()"><i class="bi bi-arrow-clockwise"></i> Refrescar</button>
      </div>
    </div>

    ${(pagosPend??0)>0||((qrPendientes??0)>0)?`<div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.2rem">
      ${(pagosPend??0)>0?`<div class="fondo-alert warn" style="cursor:pointer" onclick="document.querySelector('[data-view=pagos_pendientes]').click()">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <div><div class="fondo-alert-title">${pagosPend} pago${pagosPend!==1?"s":""} esperando aprobación</div>
        <div class="fondo-alert-sub">Haz clic para revisar los comprobantes.</div></div>
        <button class="btn btn-gold btn-sm" onclick="event.stopPropagation();document.querySelector('[data-view=pagos_pendientes]').click()"><i class="bi bi-arrow-right"></i> Revisar</button>
      </div>`:""}
      ${(qrPendientes??0)>0?`<div class="fondo-alert warn" style="cursor:pointer" onclick="document.querySelector('[data-view=qr_usuarios]').click()">
        <i class="bi bi-qr-code-scan"></i>
        <div><div class="fondo-alert-title">${qrPendientes} QR${qrPendientes!==1?"s":""} pendientes de verificación</div>
        <div class="fondo-alert-sub">Verifica para que los usuarios puedan participar.</div></div>
        <button class="btn btn-gold btn-sm" onclick="event.stopPropagation();document.querySelector('[data-view=qr_usuarios]').click()"><i class="bi bi-arrow-right"></i> Verificar</button>
      </div>`:""}
    </div>`:""}

    <div class="stat-grid">
      <div class="sc"><div class="sc-bar r"></div><span class="sc-icon">👥</span><div class="sc-val">${totalUsuarios??0}</div><div class="sc-lbl">Usuarios</div></div>
      <div class="sc sc-clickable" onclick="document.querySelector('[data-view=pagos_pendientes]').click()">
        <div class="sc-bar g"></div><span class="sc-icon">⏳</span>
        <div class="sc-val ${(pagosPend??0)>0?"orange":""}">${pagosPend??0}</div>
        <div class="sc-lbl">Pagos pendientes</div>
        ${(pagosPend??0)>0?`<div class="sc-sub" style="color:#f59e0b">Clic para revisar</div>`:""}
      </div>
      <div class="sc"><div class="sc-bar gr"></div><span class="sc-icon">🎟️</span><div class="sc-val">${rondasAbiertas??0}</div><div class="sc-lbl">Rondas abiertas</div></div>
      <div class="sc"><div class="sc-bar b"></div><span class="sc-icon">🏆</span><div class="sc-val">${totalSorteadas??0}</div><div class="sc-lbl">Sorteos realizados</div></div>
      <div class="sc"><div class="sc-bar o"></div><span class="sc-icon">📈</span><div class="sc-val green">${fmtMoney(totalIngresosHoy)}</div><div class="sc-lbl">Ingresos hoy</div></div>
      <div class="sc"><div class="sc-bar p"></div><span class="sc-icon">💸</span><div class="sc-val orange">${fmtMoney(totalPremiosHoy)}</div><div class="sc-lbl">Premios hoy</div></div>
    </div>

    <div class="grid2">
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-clock-history"></i>Últimos pagos</div>
          <button class="btn btn-ghost btn-sm" onclick="document.querySelector('[data-view=pagos_pendientes]').click()">Ver todos →</button>
        </div>
        <div class="panel-body">
          ${!recientes?.length?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin pagos aún</p></div>`
          :recientes.map(p=>`<div class="act-row">
            <div class="act-left">
              <div class="act-av"><i class="bi bi-person"></i></div>
              <div><div class="act-name">${payProfiles[p.user_id]?.username??"—"}</div>
              <div class="act-sub">${fmtDateShort(p.created_at)} · ${p.metodo||"—"}</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:.45rem">
              <span class="act-amount">${fmtMoney(p.monto)}</span>${badge(p.estado)}
            </div>
          </div>`).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="bi bi-ticket-perforated-fill"></i>Rondas activas</div>
          <button class="btn btn-ghost btn-sm" onclick="document.querySelector('[data-view=sorteos]').click()">Ver sorteos →</button>
        </div>
        <div class="panel-body">
          ${!rondasConCupos.length?`<div class="empty"><i class="bi bi-ticket-perforated"></i><p>Sin rondas</p></div>`
          :rondasConCupos.map(r=>{
            const pct=Math.round((r.cupos/r.capacidad)*100);
            const theme = getSorteoTheme(r.game?.nombre||"");
            return `<div style="margin-bottom:.85rem">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.28rem">
                <div style="display:flex;align-items:center;gap:.5rem">
                  <span style="font-size:1rem">${r.game?.imagen_url?"🖼️":theme.icon}</span>
                  <span style="font-size:.88rem;font-weight:600;color:#fff">${r.game?.nombre||'—'} <span class="text-muted">R${r.numero}</span></span>
                </div>
                ${badge(r.estado)}
              </div>
              <div style="display:flex;align-items:center;gap:.65rem">
                <div style="flex:1"><div class="prog-bg"><div class="prog-fill${r.cupos>=r.capacidad?" full":""}" style="width:${Math.min(pct,100)}%;background:linear-gradient(90deg,${theme.accent}88,${theme.accent})"></div></div></div>
                <span style="font-family:'Oswald',sans-serif;font-size:.82rem;color:${theme.accent};flex-shrink:0">${r.cupos}/${r.capacidad}</span>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   SORTEOS — Con imagen y mejoras completas
════════════════════════════════════════ */
async function sorteos() {
  setActive("sorteos"); setCurrentView("sorteos"); loadingView();

  const{data:games}=await supabase.from("games").select("*,visible,auto_siguiente_ronda").order("created_at",{ascending:false});
  const gamesData=await Promise.all((games||[]).map(async g=>{
    const capacidad = getCapacidad(g);
    const{data:roundsData}=await supabase.from("rounds").select("id,numero,estado").eq("game_id",g.id).order("numero",{ascending:false});
    const ar=roundsData?.find(r=>r.estado==="abierta");
    let cuposActivos=0,compPend=0;
    if(ar){
      const{data:parts}=await supabase.from("participations").select("boletos").eq("round_id",ar.id);
      cuposActivos=(parts||[]).reduce((s,p)=>s+(p.boletos||1),0);
      const{count:cp}=await supabase.from("payments").select("*",{count:"exact",head:true}).eq("round_id",ar.id).eq("estado","pendiente");
      compPend=cp??0;
    }
    return{...g,capacidad,rounds:roundsData||[],activeRound:ar,cuposActivos,compPend,totalRondas:roundsData?.length??0};
  }));

  // Calcular límite de sorteos activos
  const sorteosModoActivos = gamesData.filter(g=>g.estado==="activo").length;
  const sorteoAbiertos = gamesData.filter(g=>g.activeRound).length;

  MC().innerHTML=`
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-ticket-perforated-fill"></i>Sorteos</div>
        <div class="ph-sub">${gamesData.length} sorteo${gamesData.length!==1?"s":""} · ${sorteoAbiertos} con ronda activa · máx. 4 simultáneos</div>
      </div>
      <button class="btn btn-red btn-md" onclick="modalNuevoSorteo()"><i class="bi bi-plus-lg"></i> Nuevo sorteo</button>
    </div>

    ${sorteoAbiertos>=4?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">Límite de sorteos simultáneos alcanzado (${sorteoAbiertos}/4)</div><div class="fondo-alert-sub">Cierra o sortea una ronda antes de abrir una nueva para mantener la calidad.</div></div></div>`:""}

    ${!gamesData.length
      ?`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-ticket-perforated"></i><p>Sin sorteos. Crea el primero.</p></div></div></div>`
      :`<div class="sorteo-grid">${gamesData.map(g=>{
          const ar=g.activeRound;
          const pct=ar?Math.round((g.cuposActivos/g.capacidad)*100):0;
          const lleno=ar&&g.cuposActivos>=g.capacidad;
          const modo=getModoGanadores(g.capacidad);
          const theme=getSorteoTheme(g.nombre||"");
          const premioEstimado = ar&&g.precio_boleto>0 ? Math.round((g.cuposActivos*g.precio_boleto*0.70)/5)*5 : 0;

                    const nombreSafe = (g.nombre||'').replace(/'/g,"\'").replace(/`/g,"\`");
          const isOculto = g.visible === false;

          return `<div class="sorteo-card ${isOculto?"sorteo-oculto":""}">
            ${isOculto?'<div class="scard-vis-ribbon"><i class="bi bi-eye-slash-fill"></i> Oculto para usuarios</div>':""}
            ${_sorteoHeaderHtml(g, {height:"86px"})}
            <div class="sorteo-card-head">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.4rem">
                <div style="min-width:0;flex:1">
                  <h3 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.nombre}</h3>
                  <p style="font-size:.78rem;color:var(--muted)">${g.descripcion||"Sin descripción"}</p>
                </div>
                ${badge(g.estado)}
              </div>
              <div style="margin-top:.42rem;display:flex;align-items:center;gap:.4rem;font-size:.73rem;color:var(--muted);flex-wrap:wrap">
                <span style="color:${modo===1?"#fcd34d":"#c7d2fe"}">${modo===1?"🥇 1 Ganador":"🏅 3 Ganadores"}</span>
                <span>·</span><span>${g.totalRondas} ronda${g.totalRondas!==1?"s":""}</span>
                ${g.precio_boleto>0?`<span>·</span><span><i class="bi bi-tag"></i> ${fmtMoney(g.precio_boleto)}</span>`:`<span>·</span><span style="color:#22c55e">Gratis</span>`}
                <span>·</span><span>${g.capacidad} cupos</span>
                ${g.auto_siguiente_ronda?`<span>·</span><span style="color:#a78bfa"><i class="bi bi-arrow-repeat"></i> Auto-ronda</span>`:""}
              </div>
            </div>
            <div class="sorteo-card-mid">
              ${ar
                ?`<div class="prog-label">
                    <span style="color:var(--muted);font-size:.8rem">Ronda #${ar.numero}</span>
                    <div style="display:flex;align-items:center;gap:.35rem">
                      <span class="prog-val" style="color:${theme.accent};font-size:.85rem">${g.cuposActivos}/${g.capacidad}</span>
                      ${lleno?'<span>✅</span>':""}
                    </div>
                  </div>
                  <div class="prog-bg"><div class="prog-fill${lleno?" full":""}" style="width:${Math.min(pct,100)}%;background:linear-gradient(90deg,${theme.accent}88,${theme.accent})"></div></div>
                  ${premioEstimado>0?`<div style="margin-top:.35rem;font-size:.71rem;color:#22c55e"><i class="bi bi-cash-stack"></i> Premio estimado: <strong>${fmtMoneyR(premioEstimado)}</strong></div>`:""}
                  ${g.compPend>0?`<div style="margin-top:.3rem;font-size:.72rem;color:#f59e0b;display:flex;align-items:center;gap:.28rem"><i class="bi bi-exclamation-triangle-fill"></i> ${g.compPend} comprobante${g.compPend>1?"s":""} pendiente${g.compPend>1?"s":""}</div>`:""}`
                :`<div style="text-align:center;padding:.45rem 0;color:var(--muted);font-size:.84rem">
                    <i class="bi bi-moon-stars"></i> Sin ronda activa
                    ${g.estado==="activo"&&!isOculto&&sorteoAbiertos<4?`<br><button class="btn btn-gold btn-sm" style="margin-top:.4rem" onclick="iniciarRonda('${g.id}','${nombreSafe}',${g.totalRondas})"><i class="bi bi-play-fill"></i> Iniciar Ronda ${g.totalRondas+1}</button>`:""}
                    ${isOculto?`<div style="font-size:.7rem;color:#f59e0b;margin-top:.28rem"><i class="bi bi-eye-slash"></i> Haz visible para iniciar ronda</div>`:""}
                  </div>`}
            </div>

            <!-- FOOTER: botones con etiquetas claras -->
            <div class="sorteo-card-foot" style="flex-wrap:wrap;gap:.35rem">
              ${ar?`
                <button class="scf-btn scf-blue" onclick="verParticipantes('${ar.id}','${nombreSafe}','${ar.numero}')">
                  <i class="bi bi-people-fill"></i> Participantes
                </button>
                <button class="scf-btn scf-ghost" onclick="verComprobantes('${ar.id}','${nombreSafe}','${ar.numero}')" style="position:relative">
                  <i class="bi bi-receipt"></i> Pagos
                  ${g.compPend>0?`<span style="position:absolute;top:-5px;right:-5px;background:#dc2626;color:#fff;border-radius:8px;padding:0 .3rem;font-size:.6rem;font-family:'Oswald',sans-serif;line-height:1.4">${g.compPend}</span>`:""}
                </button>
                ${lleno?`<button class="scf-btn scf-gold" onclick="realizarSorteo('${ar.id}','${nombreSafe}','${ar.numero}',${g.capacidad})"><i class="bi bi-shuffle"></i> ¡Sortear!</button>`:""}
                <button class="scf-btn scf-muted" onclick="verRondas('${g.id}','${nombreSafe}')"><i class="bi bi-layers"></i> Rondas</button>
                <button class="scf-btn scf-red" onclick="cerrarRonda('${ar.id}','${nombreSafe}','${ar.numero}')"><i class="bi bi-lock-fill"></i> Cerrar ronda</button>
              `:`
                <button class="scf-btn scf-muted" onclick="verRondas('${g.id}','${nombreSafe}')"><i class="bi bi-layers"></i> Ver rondas</button>
              `}
            </div>

            <!-- ROW DE GESTIÓN: editar, visibilidad, historial, eliminar -->
            <div class="sorteo-card-mgmt">
              <button class="scm-btn scm-primary" onclick="drawerEditarSorteo('${g.id}')">
                <i class="bi bi-pencil-fill"></i> Editar sorteo
              </button>
              <button class="scm-btn ${isOculto?"scm-green":"scm-ghost"}" onclick="toggleVisibilidad('${g.id}','${nombreSafe}',${isOculto})" title="${isOculto?"Hacer visible para usuarios":"Ocultar de usuarios"}">
                <i class="bi bi-eye${isOculto?"-fill":"-slash-fill"}"></i> ${isOculto?"Mostrar":"Ocultar"}
              </button>
              <button class="scm-btn scm-ghost" onclick="verHistorialSorteo('${g.id}','${nombreSafe}')" title="Historial de cambios">
                <i class="bi bi-clock-history"></i> Historial
              </button>
              <button class="scm-btn scm-danger" onclick="eliminarSorteo('${g.id}','${nombreSafe}')" title="Eliminar sorteo">
                <i class="bi bi-trash3-fill"></i> Eliminar
              </button>
            </div>
          </div>`;
        }).join("")}</div>`}`;
}

/* ════════════════════════════════════════
   MODAL NUEVO SORTEO — Con imagen y preview
════════════════════════════════════════ */
window.modalNuevoSorteo = async () => {
  const { value:v } = await Swal.fire({
    title: 'Nuevo sorteo',
    html: `<div style="text-align:left">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.85rem">
        <div class="field" style="margin-bottom:0">
          <label>Nombre *</label>
          <input id="sNom" class="swal2-input" placeholder="ej. El Padrino, Fuego & Gloria…" style="margin:0;width:100%">
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Descripción</label>
          <input id="sDesc" class="swal2-input" placeholder="Breve descripción (opcional)" style="margin:0;width:100%">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.85rem">
        <div class="field" style="margin-bottom:0">
          <label>Precio boleto (Bs) *</label>
          <select id="sPrecio" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
            <option value="0">Gratis (0 Bs)</option>
            <option value="5">Bs 5</option>
            <option value="10" selected>Bs 10</option>
            <option value="15">Bs 15</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Capacidad máx. * <span style="color:var(--dim);font-size:.62rem;font-weight:400;text-transform:none;letter-spacing:0">≤25 → 1G · &gt;25 → 3G</span></label>
          <input id="sCapacidad" class="swal2-input" type="number" min="10" max="200" step="1" placeholder="20" value="20" style="margin:0;width:100%">
        </div>
      </div>
      <div id="modoPreview" style="background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.18);border-radius:8px;padding:.5rem .85rem;margin-bottom:.85rem;font-size:.8rem;color:var(--muted);display:flex;align-items:center;gap:.5rem">
        <i class="bi bi-info-circle" style="color:var(--gold2)"></i>
        <span id="modoPreviewTxt">Con capacidad 20 → <strong style="color:#fcd34d">1 ganador</strong> · Premio estimado: <strong style="color:#22c55e">Bs 140</strong></span>
      </div>
      ${_campoImagenSwal(null)}
    </div>`,
    showCancelButton: true,
    confirmButtonText: '<i class="bi bi-plus-circle-fill"></i> Crear sorteo',
    cancelButtonText: 'Cancelar',
    width: 560,
    showLoaderOnConfirm: true,
    ...swal$,
    didOpen: () => {
      // Preview dinámico de modo ganadores
      const updatePreview = () => {
        const cap = parseInt(document.getElementById('sCapacidad')?.value||20);
        const precio = parseFloat(document.getElementById('sPrecio')?.value||10);
        const modo = cap <= 25 ? 1 : 3;
        const premioEst = precio > 0 ? Math.round(cap * precio * 0.70 / 5) * 5 : 0;
        const txt = document.getElementById('modoPreviewTxt');
        if (txt) txt.innerHTML = `Capacidad ${cap} → <strong style="color:${modo===1?"#fcd34d":"#c7d2fe"}">${modo===1?"🥇 1 ganador":"🏅 3 ganadores"}</strong>${premioEst>0?` · Premio estimado: <strong style="color:#22c55e">Bs ${premioEst}</strong>`:""}`;
      };
      document.getElementById('sCapacidad')?.addEventListener('input', updatePreview);
      document.getElementById('sPrecio')?.addEventListener('change', updatePreview);
      updatePreview();
    },
    preConfirm: async () => {
      const nombre    = document.getElementById('sNom')?.value?.trim();
      const desc      = document.getElementById('sDesc')?.value?.trim() || null;
      const precio    = Number(document.getElementById('sPrecio')?.value || 0);
      const capacidad = parseInt(document.getElementById('sCapacidad')?.value, 10);
      if (!nombre) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
      if (isNaN(capacidad)||capacidad < 10) { Swal.showValidationMessage('Mínimo 10 participantes'); return false; }
      if (capacidad > 200) { Swal.showValidationMessage('Máximo 200 participantes'); return false; }
      const imagen_url = await _obtenerUrlImagenModal(null);
      if (imagen_url === false) return false;
      return { nombre, desc, precio, capacidad, imagen_url };
    }
  });

  if (!v) return;
  loading$('Creando sorteo...');
  const { error } = await supabase.from('games').insert({
    nombre: v.nombre, descripcion: v.desc,
    precio_boleto: v.precio, capacidad_max: v.capacidad,
    imagen_url: v.imagen_url, estado: 'activo',
  });
  Swal.close();
  if (error) { ok$('Error al crear sorteo', error.message, 'error'); return; }
  toast(`✅ Sorteo "${v.nombre}" creado`, 'ok');
  sorteos();
};

/* ════════════════════════════════════════
   MODAL EDITAR SORTEO — Carga datos reales + imagen
════════════════════════════════════════ */
window.modalEditarSorteo = async (gameId) => {
  loading$('Cargando datos...');
  const { data:game, error:gErr } = await supabase.from('games').select('*').eq('id', gameId).single();
  Swal.close();
  if (gErr || !game) { ok$('Error', 'No se encontró el sorteo', 'error'); return; }

  const { value:v } = await Swal.fire({
    title: `Editar — ${game.nombre}`,
    html: `<div style="text-align:left">
      <div style="margin-bottom:.75rem;border-radius:9px;overflow:hidden">
        ${_sorteoHeaderHtml(game, {height:"60px", showInfo:true})}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.85rem">
        <div class="field" style="margin-bottom:0">
          <label>Nombre *</label>
          <input id="eNom" class="swal2-input" value="${(game.nombre||'').replace(/"/g,'&quot;')}" style="margin:0;width:100%">
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Descripción</label>
          <input id="eDesc" class="swal2-input" value="${(game.descripcion||'').replace(/"/g,'&quot;')}" style="margin:0;width:100%">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.85rem">
        <div class="field" style="margin-bottom:0">
          <label>Precio boleto (Bs) *</label>
          <select id="ePrecio" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
            <option value="0" ${!game.precio_boleto?'selected':''}>Gratis</option>
            <option value="5" ${game.precio_boleto==5?'selected':''}>Bs 5</option>
            <option value="10" ${game.precio_boleto==10?'selected':''}>Bs 10</option>
            <option value="15" ${game.precio_boleto==15?'selected':''}>Bs 15</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Capacidad máx. * <span style="color:var(--dim);font-size:.62rem;font-weight:400;text-transform:none;letter-spacing:0">≤25→1G · &gt;25→3G</span></label>
          <input id="eCapacidad" class="swal2-input" type="number" min="10" max="200" value="${game.capacidad_max||25}" style="margin:0;width:100%">
        </div>
      </div>
      <div class="field" style="margin-bottom:.85rem">
        <label>Estado</label>
        <select id="eEstado" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
          <option value="activo" ${game.estado==="activo"?"selected":""}>Activo</option>
          <option value="inactivo" ${game.estado==="inactivo"?"selected":""}>Inactivo</option>
        </select>
      </div>
      ${_campoImagenSwal(game.imagen_url)}
      <div style="background:rgba(139,26,26,.05);border:1px solid rgba(139,26,26,.14);border-radius:8px;padding:.5rem .85rem;font-size:.77rem;color:var(--muted);display:flex;align-items:center;gap:.45rem;margin-top:.5rem">
        <i class="bi bi-info-circle" style="color:#f87171;flex-shrink:0"></i>
        Cambiar capacidad afecta cuándo se puede sortear una ronda abierta.
      </div>
    </div>`,
    showCancelButton: true,
    confirmButtonText: '<i class="bi bi-check-lg"></i> Guardar cambios',
    cancelButtonText: 'Cancelar',
    width: 560,
    showLoaderOnConfirm: true,
    ...swal$,
    preConfirm: async () => {
      const nombre    = document.getElementById('eNom')?.value?.trim();
      const desc      = document.getElementById('eDesc')?.value?.trim() || null;
      const precio    = Number(document.getElementById('ePrecio')?.value || 0);
      const capacidad = parseInt(document.getElementById('eCapacidad')?.value, 10);
      const estado    = document.getElementById('eEstado')?.value || 'activo';
      if (!nombre) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
      if (isNaN(capacidad)||capacidad < 10) { Swal.showValidationMessage('Mínimo 10 participantes'); return false; }
      if (capacidad > 200) { Swal.showValidationMessage('Máximo 200 participantes'); return false; }
      const imagen_url = await _obtenerUrlImagenModal(game.imagen_url);
      if (imagen_url === false) return false;
      return { nombre, desc, precio, capacidad, estado, imagen_url };
    }
  });

  if (!v) return;
  loading$('Guardando...');
  const { error } = await supabase.from('games').update({
    nombre: v.nombre, descripcion: v.desc,
    precio_boleto: v.precio, capacidad_max: v.capacidad,
    estado: v.estado, imagen_url: v.imagen_url,
  }).eq('id', gameId);
  Swal.close();
  if (error) { ok$('Error al guardar', error.message, 'error'); return; }
  toast(`✅ "${v.nombre}" actualizado`, 'ok');
  sorteos();
};




/* ════════════════════════════════════════
   VISIBILIDAD DE SORTEO
════════════════════════════════════════ */
window.toggleVisibilidad = async (gameId, gameNombre, esOculto) => {
  const nuevoEstado = !esOculto; // true = visible, false = oculto
  const accion = nuevoEstado ? 'hacer visible' : 'ocultar';
  const r = await confirm$(
    `${nuevoEstado?"Mostrar":"Ocultar"} sorteo`,
    `<strong>${gameNombre}</strong><br>${nuevoEstado
      ? "Los usuarios podrán ver y participar en este sorteo."
      : "Los usuarios NO verán este sorteo. Las rondas activas siguen funcionando internamente."
    }`,
    nuevoEstado ? "👁️ Hacer visible" : "🙈 Ocultar"
  );
  if(!r.isConfirmed) return;
  loading$();
  const{error}=await supabase.from("games").update({visible:nuevoEstado}).eq("id",gameId);
  // Registrar en historial
  await supabase.from("games_historial").insert({
    game_id:gameId, admin_id:user.id,
    accion:"visibilidad",
    detalle:{anterior:esOculto?false:true, nuevo:nuevoEstado, nombre:gameNombre}
  }).catch(()=>{});
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast(nuevoEstado?`"${gameNombre}" ahora es visible`:`"${gameNombre}" ocultado para usuarios`,"ok");
  sorteos();
};

/* ════════════════════════════════════════
   ELIMINAR SORTEO
════════════════════════════════════════ */
window.eliminarSorteo = async (gameId, gameNombre) => {
  // Verificar si tiene rondas activas o pagos pendientes
  const[{count:rondasActivas},{count:pagosPend}]=await Promise.all([
    supabase.from("rounds").select("*",{count:"exact",head:true}).eq("game_id",gameId).eq("estado","abierta"),
    supabase.from("payments").select("*",{count:"exact",head:true})
      .eq("estado","pendiente")
      .in("round_id", await supabase.from("rounds").select("id").eq("game_id",gameId).then(({data})=>(data||[]).map(r=>r.id)))
  ]);

  let warningHtml = `<p>¿Eliminar el sorteo <strong>${gameNombre}</strong>?</p>`;
  if(rondasActivas>0) warningHtml += `<div style="margin-top:.6rem;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:.5rem .8rem;font-size:.82rem;color:#f87171"><i class="bi bi-exclamation-triangle-fill"></i> Tiene ${rondasActivas} ronda${rondasActivas>1?"s":""} activa${rondasActivas>1?"s":""}. Se cerrarán.</div>`;
  warningHtml += `<div style="margin-top:.5rem;font-size:.78rem;color:#f87171;text-align:center;font-weight:600">⚠️ Esta acción no se puede deshacer</div>`;

  const r = await Swal.fire({
    title:"Eliminar sorteo",
    html:warningHtml,
    icon:"warning",
    input:"text",
    inputPlaceholder:`Escribe "${gameNombre}" para confirmar`,
    showCancelButton:true,
    confirmButtonText:"🗑️ Eliminar",
    cancelButtonText:"Cancelar",
    confirmButtonColor:"#991b1b",
    ...swal$,
    preConfirm:(val)=>{
      if(val!==gameNombre){Swal.showValidationMessage(`Escribe exactamente: ${gameNombre}`);return false;}
      return true;
    }
  });
  if(!r.isConfirmed) return;
  loading$("Eliminando...");
  // Primero cerrar rondas activas
  await supabase.from("rounds").update({estado:"cerrada"}).eq("game_id",gameId).eq("estado","abierta");
  // Soft delete: marcar como inactivo (no destruir datos históricos)
  const{error}=await supabase.from("games").update({estado:"inactivo",visible:false}).eq("id",gameId);
  await supabase.from("games_historial").insert({game_id:gameId,admin_id:user.id,accion:"eliminado",detalle:{nombre:gameNombre}}).catch(()=>{});
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast(`Sorteo "${gameNombre}" eliminado`,"warn");
  sorteos();
};

/* ════════════════════════════════════════
   HISTORIAL DE CAMBIOS DEL SORTEO
════════════════════════════════════════ */
window.verHistorialSorteo = async (gameId, gameNombre) => {
  loading$("Cargando historial...");
  const[{data:hist},{data:rondas}]=await Promise.all([
    supabase.from("games_historial").select("id,accion,detalle,created_at,admin_id").eq("game_id",gameId).order("created_at",{ascending:false}).limit(50),
    supabase.from("rounds").select("id,numero,estado,created_at,sorteado_at").eq("game_id",gameId).order("numero",{ascending:false}).limit(20),
  ]);
  const adminIds=[...new Set((hist||[]).map(h=>h.admin_id).filter(Boolean))];
  const adminsMap=await getProfilesMap(adminIds);
  Swal.close();

  const accionIcon={
    creado:"bi-plus-circle-fill text-green",editado:"bi-pencil-fill text-gold",
    eliminado:"bi-trash-fill text-red",visibilidad:"bi-eye-fill",
    ronda_iniciada:"bi-play-fill text-green",ronda_cerrada:"bi-lock-fill",
    ronda_sorteada:"bi-trophy-fill text-gold",
  };
  const accionLabel={
    creado:"Sorteo creado",editado:"Editado",eliminado:"Eliminado",
    visibilidad:"Visibilidad cambiada",ronda_iniciada:"Ronda iniciada",
    ronda_cerrada:"Ronda cerrada",ronda_sorteada:"Ronda sorteada",
  };

  await Swal.fire({
    title:`Historial — ${gameNombre}`,
    html:`<div style="text-align:left;max-height:60vh;overflow-y:auto">
      ${!hist?.length&&!rondas?.length
        ?`<div style="text-align:center;padding:1.5rem;color:var(--muted)"><i class="bi bi-clock-history" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>Sin historial registrado</div>`
        :`
        ${hist?.length?`
        <div style="font-family:'Oswald',sans-serif;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem">Cambios de configuración</div>
        <div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem">
          ${hist.map(h=>{
            const ico=accionIcon[h.accion]||"bi-info-circle";
            const lbl=accionLabel[h.accion]||h.accion;
            const admin=adminsMap[h.admin_id]||{};
            let detHtml="";
            if(h.accion==="visibilidad") detHtml=`→ ${h.detalle?.nuevo?"Visible":"Oculto"}`;
            else if(h.accion==="editado"&&h.detalle?.cambios) detHtml=Object.entries(h.detalle.cambios).map(([k,v])=>`${k}: ${v.de}→${v.a}`).join(", ");
            return `<div style="display:flex;align-items:flex-start;gap:.6rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:.5rem .7rem">
              <i class="bi ${ico}" style="flex-shrink:0;margin-top:.1rem;font-size:.9rem"></i>
              <div style="min-width:0;flex:1">
                <div style="font-size:.85rem;color:#fff;font-weight:600">${lbl}</div>
                ${detHtml?`<div style="font-size:.73rem;color:var(--muted);margin-top:.08rem">${detHtml}</div>`:""}
                <div style="font-size:.7rem;color:var(--dim);margin-top:.08rem">${admin.username||"Admin"} · ${fmtDate(h.created_at)}</div>
              </div>
            </div>`;
          }).join("")}
        </div>`:""
        }
        ${rondas?.length?`
        <div style="font-family:'Oswald',sans-serif;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem">Rondas</div>
        <div style="display:flex;flex-direction:column;gap:.3rem">
          ${rondas.map(r=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:.35rem .7rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:7px">
            <div style="display:flex;align-items:center;gap:.5rem">
              <span style="font-family:'Oswald',sans-serif;color:var(--gold2)">R${r.numero}</span>
              <span>${badge(r.estado)}</span>
            </div>
            <span style="font-size:.72rem;color:var(--muted)">${r.sorteado_at?fmtDateShort(r.sorteado_at):fmtDateShort(r.created_at)}</span>
          </div>`).join("")}
        </div>`:""
        }
      `}
    </div>`,
    showConfirmButton:false,showCloseButton:true,width:520,...swal$
  });
};

/* ════════════════════════════════════════
   DRAWER EDITAR SORTEO — Panel deslizable derecha
════════════════════════════════════════ */
window.drawerEditarSorteo = async (gameId) => {
  // Cerrar drawer anterior si existe
  const prevDrawer = document.getElementById("sorteoDrawer");
  if(prevDrawer) { prevDrawer.classList.remove("open"); await new Promise(r=>setTimeout(r,300)); prevDrawer.remove(); }

  loading$("Cargando...");
  const{data:game,error:gErr}=await supabase.from("games").select("*").eq("id",gameId).single();
  Swal.close();
  if(gErr||!game){ok$("Error","No se encontró el sorteo","error");return;}

  const drawer = document.createElement("div");
  drawer.id = "sorteoDrawer";
  drawer.className = "sorteo-drawer";

  const theme = getSorteoTheme(game.nombre||"");
  const modo = getModoGanadores(getCapacidad(game));
  const premioEst = game.precio_boleto>0 ? Math.round(getCapacidad(game)*game.precio_boleto*0.70/5)*5 : 0;

  drawer.innerHTML = `
  <div class="sorteo-drawer-overlay" onclick="cerrarSorteoDrawer()"></div>
  <div class="sorteo-drawer-panel">

    <!-- Header con gradiente del tema -->
    <div class="sorteo-drawer-header" style="background:${game.imagen_url?`url('${game.imagen_url}') center/cover no-repeat`:theme.gradient}">
      <div class="sdh-overlay"></div>
      <div class="sdh-content">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-family:'Oswald',sans-serif;font-size:1.1rem;font-weight:700;color:#fff;letter-spacing:.04em">${game.nombre}</div>
            <div style="font-size:.75rem;color:rgba(255,255,255,.7);margin-top:.15rem">
              ${modo===1?"🥇 1 Ganador":"🏅 3 Ganadores"} · ${getCapacidad(game)} cupos
              ${premioEst>0?` · Premio est. <strong style="color:#4ade80">Bs ${premioEst}</strong>`:""}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <span style="font-size:1.8rem;line-height:1">${game.imagen_url?"🖼️":theme.icon}</span>
            <button class="sorteo-drawer-close" onclick="cerrarSorteoDrawer()"><i class="bi bi-x-lg"></i></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Body del drawer -->
    <div class="sorteo-drawer-body">

      <!-- Sección: Visibilidad rápida -->
      <div class="sdb-section">
        <div class="sdb-section-title"><i class="bi bi-eye-fill"></i> Visibilidad</div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--ink3);border:1px solid var(--border);border-radius:9px;padding:.75rem 1rem">
          <div>
            <div style="font-size:.88rem;font-weight:600;color:#fff">${game.visible!==false?"Visible para usuarios":"Oculto para usuarios"}</div>
            <div style="font-size:.73rem;color:var(--muted);margin-top:.08rem">${game.visible!==false?"Los usuarios pueden ver y participar":"Solo el admin puede verlo"}</div>
          </div>
          <label class="toggle" style="flex-shrink:0">
            <input type="checkbox" id="sdDrawerVisible" ${game.visible!==false?"checked":""} onchange="toggleVisibilidadInline('${gameId}','${game.nombre.replace(/'/g,"\'")}',this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Sección: Auto-ronda -->
      <div class="sdb-section">
        <div class="sdb-section-title"><i class="bi bi-arrow-repeat"></i> Automatización</div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--ink3);border:1px solid var(--border);border-radius:9px;padding:.75rem 1rem">
          <div>
            <div style="font-size:.88rem;font-weight:600;color:#fff">Iniciar siguiente ronda automáticamente</div>
            <div style="font-size:.73rem;color:var(--muted);margin-top:.08rem">Al sortear, la siguiente ronda se abre al instante</div>
          </div>
          <label class="toggle" style="flex-shrink:0">
            <input type="checkbox" id="sdAutoRonda" ${game.auto_siguiente_ronda?"checked":""} onchange="toggleAutoRondaInline('${gameId}',this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Sección: Datos del sorteo -->
      <div class="sdb-section">
        <div class="sdb-section-title"><i class="bi bi-pencil-fill"></i> Datos del sorteo</div>
        <div style="display:flex;flex-direction:column;gap:.65rem">
          <div>
            <label class="sdb-label">Nombre *</label>
            <input id="sdNombre" class="sdb-input" value="${(game.nombre||'').replace(/"/g,'&quot;')}" placeholder="Nombre del sorteo">
          </div>
          <div>
            <label class="sdb-label">Descripción</label>
            <input id="sdDesc" class="sdb-input" value="${(game.descripcion||'').replace(/"/g,'&quot;')}" placeholder="Descripción breve">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
            <div>
              <label class="sdb-label">Precio boleto (Bs)</label>
              <select id="sdPrecio" class="sdb-select">
                <option value="0" ${!game.precio_boleto?"selected":""}>Gratis</option>
                <option value="5" ${game.precio_boleto==5?"selected":""}>Bs 5</option>
                <option value="10" ${game.precio_boleto==10?"selected":""}>Bs 10</option>
                <option value="15" ${game.precio_boleto==15?"selected":""}>Bs 15</option>
              </select>
            </div>
            <div>
              <label class="sdb-label">Capacidad máx. <span style="font-size:.62rem;font-weight:400;color:var(--dim)">≤25→1G · &gt;25→3G</span></label>
              <input id="sdCapacidad" class="sdb-input" type="number" min="10" max="200" value="${game.capacidad_max||25}">
            </div>
          </div>
          <div>
            <label class="sdb-label">Estado</label>
            <select id="sdEstado" class="sdb-select">
              <option value="activo" ${game.estado==="activo"?"selected":""}>Activo</option>
              <option value="inactivo" ${game.estado==="inactivo"?"selected":""}>Inactivo</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Sección: Imagen -->
      <div class="sdb-section">
        <div class="sdb-section-title"><i class="bi bi-image-fill"></i> Imagen del sorteo</div>
        ${_campoImagenSwal(game.imagen_url)}
      </div>

      <!-- Preview dinámico -->
      <div id="sdPreviewBox" style="background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.18);border-radius:8px;padding:.55rem .85rem;font-size:.8rem;color:var(--muted);display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
        <i class="bi bi-info-circle" style="color:var(--gold2);flex-shrink:0"></i>
        <span id="sdPreviewTxt">— Ajusta capacidad y precio para ver el cálculo —</span>
      </div>

    </div>

    <!-- Footer del drawer -->
    <div class="sorteo-drawer-footer">
      <button class="btn btn-dark btn-md" onclick="verHistorialSorteo('${gameId}','${game.nombre.replace(/'/g,"\'")}')"><i class="bi bi-clock-history"></i> Historial</button>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-dark btn-md" onclick="cerrarSorteoDrawer()">Cancelar</button>
        <button class="btn btn-red btn-md" onclick="guardarDrawerSorteo('${gameId}')"><i class="bi bi-check-lg"></i> Guardar cambios</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(drawer);
  requestAnimationFrame(()=>{ drawer.classList.add("open"); document.body.style.overflow="hidden"; });

  // Preview dinámico en drawer
  const updateDrawerPreview = () => {
    const cap = parseInt(document.getElementById("sdCapacidad")?.value||25);
    const precio = parseFloat(document.getElementById("sdPrecio")?.value||0);
    const modo2 = cap<=25?1:3;
    const premioEst2 = precio>0 ? Math.round(cap*precio*0.70/5)*5 : 0;
    const el = document.getElementById("sdPreviewTxt");
    if(el) el.innerHTML = `${cap} cupos → <strong style="color:${modo2===1?"#fcd34d":"#c7d2fe"}">${modo2===1?"🥇 1 ganador":"🏅 3 ganadores"}</strong>${premioEst2>0?` · Premio máx.: <strong style="color:#22c55e">Bs ${premioEst2}</strong>`:""}`;
  };
  document.getElementById("sdCapacidad")?.addEventListener("input", updateDrawerPreview);
  document.getElementById("sdPrecio")?.addEventListener("change", updateDrawerPreview);
  updateDrawerPreview();
};

window.cerrarSorteoDrawer = () => {
  const d = document.getElementById("sorteoDrawer");
  if(!d) return;
  d.classList.remove("open");
  document.body.style.overflow = "";
  setTimeout(()=>d.remove(), 320);
};

window.toggleVisibilidadInline = async (gameId, gameNombre, visible) => {
  await supabase.from("games").update({visible}).eq("id",gameId);
  await supabase.from("games_historial").insert({game_id:gameId,admin_id:user.id,accion:"visibilidad",detalle:{nuevo:visible,nombre:gameNombre}}).catch(()=>{});
  toast(visible?`"${gameNombre}" ahora visible`:`"${gameNombre}" ocultado`,"ok");
  sorteos(); // Refrescar lista en background
};

window.toggleAutoRondaInline = async (gameId, valor) => {
  await supabase.from("games").update({auto_siguiente_ronda:valor}).eq("id",gameId);
  toast(valor?"Auto-ronda activado ♻️":"Auto-ronda desactivado","ok");
};

window.guardarDrawerSorteo = async (gameId) => {
  const nombre    = document.getElementById("sdNombre")?.value?.trim();
  const desc      = document.getElementById("sdDesc")?.value?.trim()||null;
  const precio    = Number(document.getElementById("sdPrecio")?.value||0);
  const capacidad = parseInt(document.getElementById("sdCapacidad")?.value||25,10);
  const estado    = document.getElementById("sdEstado")?.value||"activo";

  if(!nombre){ toast("El nombre es obligatorio","err"); return; }
  if(isNaN(capacidad)||capacidad<10){ toast("Mínimo 10 participantes","err"); return; }
  if(capacidad>200){ toast("Máximo 200","err"); return; }

  // Obtener datos actuales para comparar cambios
  const{data:gameAnt}=await supabase.from("games").select("nombre,descripcion,precio_boleto,capacidad_max,estado").eq("id",gameId).single();

  const btnGuardar = document.querySelector(".sorteo-drawer-footer .btn-red");
  if(btnGuardar){ btnGuardar.disabled=true; btnGuardar.innerHTML='<i class="bi bi-hourglass-split"></i> Guardando...'; }

  const imagen_url = await _obtenerUrlImagenModal(gameAnt?.imagen_url||null);
  if(imagen_url===false){ if(btnGuardar){btnGuardar.disabled=false;btnGuardar.innerHTML='<i class="bi bi-check-lg"></i> Guardar cambios';} return; }

  const{error}=await supabase.from("games").update({
    nombre,descripcion:desc,precio_boleto:precio,capacidad_max:capacidad,estado,imagen_url
  }).eq("id",gameId);

  if(error){ toast("Error al guardar: "+error.message,"err"); if(btnGuardar){btnGuardar.disabled=false;btnGuardar.innerHTML='<i class="bi bi-check-lg"></i> Guardar cambios';} return; }

  // Registrar cambios en historial
  const cambios={};
  if(gameAnt?.nombre!==nombre) cambios.nombre={de:gameAnt.nombre,a:nombre};
  if(gameAnt?.precio_boleto!==precio) cambios.precio={de:gameAnt.precio_boleto,a:precio};
  if(gameAnt?.capacidad_max!==capacidad) cambios.capacidad={de:gameAnt.capacidad_max,a:capacidad};
  if(gameAnt?.estado!==estado) cambios.estado={de:gameAnt.estado,a:estado};
  if(Object.keys(cambios).length>0||imagen_url!==gameAnt?.imagen_url){
    await supabase.from("games_historial").insert({game_id:gameId,admin_id:user.id,accion:"editado",detalle:{cambios,nombre}}).catch(()=>{});
  }

  toast(`✅ "${nombre}" actualizado`,"ok");
  cerrarSorteoDrawer();
  sorteos();
};

window.iniciarRonda=async(gameId,gameNombre,totalRondas)=>{
  const{data:gameData}=await supabase.from("games").select("capacidad_max,precio_boleto").eq("id",gameId).single();
  const cap = getCapacidad(gameData);
  const modo = getModoGanadores(cap);
  const r=await confirm$(`Iniciar Ronda ${totalRondas+1}`,`<strong>${gameNombre}</strong> — <strong>${cap}</strong> cupos · ${modo===1?"🥇 1 ganador":"🏅 3 ganadores"}`,"🎟️ Iniciar");
  if(!r.isConfirmed) return;
  loading$();
  const{error}=await supabase.from("rounds").insert({game_id:gameId,numero:totalRondas+1,estado:"abierta"});
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast(`Ronda ${totalRondas+1} iniciada (${cap} cupos)`,"ok");
  sorteos();
};

window.cerrarRonda=async(roundId,gameNombre,num)=>{
  const r=await confirm$(`Cerrar Ronda ${num}`,`<strong>${gameNombre}</strong> — No se aceptarán más participantes.`,"Cerrar");
  if(!r.isConfirmed) return;
  await supabase.from("rounds").update({estado:"cerrada"}).eq("id",roundId);
  toast("Ronda cerrada","warn"); sorteos();
};

window.verRondas=async(gameId,gameNombre)=>{
  setCurrentView("__subview__"); loadingView();
  const{data:gameData}=await supabase.from("games").select("capacidad_max,imagen_url,nombre,precio_boleto").eq("id",gameId).single();
  const capacidad = getCapacidad(gameData);

  const{data:rounds}=await supabase.from("rounds").select("id,numero,estado,sorteado_at,created_at,ganador_id,ganador2_id,ganador3_id,caso_sorteo,premio_especial").eq("game_id",gameId).order("numero",{ascending:false});
  const allIds=(rounds||[]).flatMap(r=>[r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean));
  const ganadoresMap=await getProfilesMap(allIds);
  const roundsData=await Promise.all((rounds||[]).map(async r=>{
    const{data:parts}=await supabase.from("participations").select("boletos").eq("round_id",r.id);
    const totalRecaudado=(parts||[]).reduce((s,p)=>s+(p.boletos||1),0)*(gameData?.precio_boleto||0);
    return{...r,cupos:(parts||[]).reduce((s,p)=>s+(p.boletos||1),0),capacidad,ganador:ganadoresMap[r.ganador_id],ganador2:ganadoresMap[r.ganador2_id],ganador3:ganadoresMap[r.ganador3_id],totalRecaudado};
  }));

  MC().innerHTML=`
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-layers"></i>Rondas — ${gameNombre}</div>
        <div class="ph-sub">${roundsData.length} ronda${roundsData.length!==1?"s":""} · ${capacidad} cupos máx.</div>
      </div>
      ${renderBackBtn("Volver a Sorteos",sorteos)}
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ol"></i>Historial</div></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      <table id="tblRondas" style="width:100%">
        <thead><tr><th>#</th><th>Estado</th><th>Boletos</th><th>Recaudado</th><th>Ganadores</th><th>Caso</th><th>Sorteado</th><th>Acciones</th></tr></thead>
        <tbody>${roundsData.map(r=>`<tr>
          <td><span style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:var(--gold2)">R${r.numero}</span></td>
          <td>${badge(r.estado)}</td>
          <td><div style="display:flex;align-items:center;gap:.5rem">
            <div class="prog-bg" style="width:60px"><div class="prog-fill${r.cupos>=r.capacidad?" full":""}" style="width:${Math.min(Math.round(r.cupos/r.capacidad*100),100)}%"></div></div>
            <span style="font-size:.8rem;color:var(--muted)">${r.cupos}/${r.capacidad}</span>
          </div></td>
          <td style="font-family:'Oswald',sans-serif;color:var(--gold2)">${gameData?.precio_boleto>0?fmtMoney(r.totalRecaudado):"—"}</td>
          <td><div style="font-size:.82rem">
            ${r.ganador?`<div>🥇 <strong>${r.ganador.username}</strong></div>`:'<span class="text-muted">—</span>'}
            ${r.ganador2?`<div style="color:#93c5fd">🥈 ${r.ganador2.username}</div>`:""}
            ${r.ganador3?`<div style="color:#d97706">🥉 ${r.ganador3.username}</div>`:""}
          </div></td>
          <td style="font-size:.78rem;color:var(--muted)">${r.caso_sorteo?nombreCaso(r.caso_sorteo):"—"}${r.premio_especial?" 🎁":""}</td>
          <td class="text-muted" style="font-size:.82rem">${r.sorteado_at?fmtDate(r.sorteado_at):"—"}</td>
          <td><div class="gap2">
            <button class="btn btn-info btn-sm" onclick="verParticipantes('${r.id}','${gameNombre}','${r.numero}')" data-tip="Participantes"><i class="bi bi-people"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="verComprobantes('${r.id}','${gameNombre}','${r.numero}')" data-tip="Comprobantes"><i class="bi bi-receipt"></i></button>
            ${r.estado==="abierta"&&r.cupos>=r.capacidad?`<button class="btn btn-gold btn-sm" onclick="realizarSorteo('${r.id}','${gameNombre}','${r.numero}',${r.capacidad})" data-tip="Sortear"><i class="bi bi-shuffle"></i></button>`:""}
            ${r.estado==="abierta"?`<button class="btn btn-danger btn-sm" onclick="cerrarRonda('${r.id}','${gameNombre}','${r.numero}')" data-tip="Cerrar ronda"><i class="bi bi-lock"></i></button>`:""}
          </div></td>
        </tr>`).join("")}</tbody>
      </table>
    </div></div>`;
  initDT("tblRondas",{order:[[0,"desc"]],columnDefs:[{orderable:false,targets:7}]});
};

/* ════════════════════════════════════════
   REALIZAR SORTEO
════════════════════════════════════════ */
window.realizarSorteo=async(roundId,gameNombre,num,capacidadParam)=>{
  let capacidad = Number(capacidadParam) || CAPACIDAD_DEFAULT;
  if (!capacidadParam) {
    const{data:roundData}=await supabase.from("rounds").select("game_id").eq("id",roundId).single();
    if(roundData?.game_id){
      const{data:gameD}=await supabase.from("games").select("capacidad_max").eq("id",roundData.game_id).single();
      capacidad = getCapacidad(gameD);
    }
  }

  const{count:pendCount}=await supabase.from("payments").select("*",{count:"exact",head:true}).eq("round_id",roundId).eq("estado","pendiente");
  if((pendCount||0)>0){
    const r2=await confirm$("Atención",`Hay <strong>${pendCount} pago${pendCount!==1?"s":""} pendiente${pendCount!==1?"s":""}</strong> sin aprobar.<br>¿Deseas sortear de todas formas?`,"Sortear de todas formas");
    if(!r2.isConfirmed) return;
  }

  const modo = getModoGanadores(capacidad);
  const r=await confirm$(`Sortear Ronda ${num}`,
    `<strong>${gameNombre}</strong><br>Modo: <strong style="color:${modo===1?"#fcd34d":"#c7d2fe"}">${modo===1?"🥇 1 ganador":"🏅 3 ganadores"}</strong><br><small style="color:#f87171">⚠️ No se puede deshacer</small>`,
    "🎲 Realizar sorteo");
  if(!r.isConfirmed) return;
  loading$("Realizando sorteo...");

  const{data:parts}=await supabase.from("participations").select("id,user_id,boletos,resultado").eq("round_id",roundId).eq("resultado","pendiente");
  if(!parts?.length){Swal.close();ok$("Sin participantes","","warning");return;}

  const profilesMap=await getProfilesMap(parts.map(p=>p.user_id));
  const participantes=parts.map(p=>({id:p.id,user_id:p.user_id,username:profilesMap[p.user_id]?.username||"—",boletos:p.boletos||1}));
  const resultado=calcSorteo(participantes, capacidad);
  const{caso,ganadores,premioEspecial}=resultado;

  const g1s=ganadores.filter(g=>g.lugar===1); const g1=g1s[0]||null; const g1b=g1s[1]||null;
  const g2=ganadores.find(g=>g.lugar===2)||null; const g3=ganadores.find(g=>g.lugar===3)||null;

  for(const g of ganadores) await supabase.from("participations").update({resultado:"ganada",lugar:g.lugar}).eq("id",g.id);
  const ganadorIds=ganadores.map(g=>g.id);
  const losers=parts.filter(p=>!ganadorIds.includes(p.id)).map(p=>p.id);
  if(losers.length) await supabase.from("participations").update({resultado:"perdida"}).in("id",losers);
  await supabase.from("rounds").update({
    estado:"sorteada",
    ganador_id:g1?.user_id||null,
    ganador2_id:g1b?.user_id||g2?.user_id||null,
    ganador3_id:g3?.user_id||null,
    caso_sorteo:caso, premio_especial:premioEspecial,
    sorteado_at:new Date().toISOString()
  }).eq("id",roundId);

  Swal.close();
  await Swal.fire({
    title:premioEspecial?"🎩 ¡CASO ESPECIAL!":"🏆 ¡Sorteo realizado!",
    html:`<div style="font-size:.78rem;color:var(--muted);margin-bottom:.5rem">${nombreCaso(caso)}</div>
      ${g1?`<div style="font-family:'Oswald',sans-serif;font-size:1.5rem;color:var(--gold2);margin:.2rem 0">${g1.username} 🥇</div>`:""}
      ${g1b?`<div style="font-size:.9rem;color:var(--gold2);margin:.12rem 0">${g1b.username} 🥇</div>`:""}
      ${g2?`<div style="margin:.18rem 0;font-size:.9rem;color:#93c5fd">🥈 ${g2.username}</div>`:""}
      ${g3?`<div style="font-size:.88rem;color:#d97706">🥉 ${g3.username}</div>`:""}
      ${premioEspecial?`<div style="margin-top:.6rem;font-size:.82rem;color:var(--gold2)">🎁 Premio especial activado</div>`:""}
      <div style="color:var(--muted);font-size:.78rem;margin-top:.5rem">${gameNombre} · Ronda ${num}</div>
      <button onclick="Swal.close();document.querySelector('[data-view=enviar_premios]').click()" style="margin-top:.8rem;background:var(--gold2);color:#1a1209;border:none;padding:.5rem 1.2rem;border-radius:6px;font-family:'Oswald',sans-serif;font-weight:700;cursor:pointer;font-size:.88rem;letter-spacing:.07em"><i class="bi bi-cash-coin"></i> Enviar premios ahora</button>`,
    icon:"success", confirmButtonText:"OK", ...swal$
  });
  // ── Auto-inicio siguiente ronda ──
  const{data:gameInfo}=await supabase.from("rounds").select("game_id").eq("id",roundId).single();
  if(gameInfo?.game_id){
    const{data:gameD}=await supabase.from("games").select("auto_siguiente_ronda,nombre,capacidad_max").eq("id",gameInfo.game_id).single();
    if(gameD?.auto_siguiente_ronda){
      const{data:todasRondas}=await supabase.from("rounds").select("numero").eq("game_id",gameInfo.game_id).order("numero",{ascending:false}).limit(1);
      const nextNum=(todasRondas?.[0]?.numero||0)+1;
      const{error:newRErr}=await supabase.from("rounds").insert({game_id:gameInfo.game_id,numero:nextNum,estado:"abierta"});
      if(!newRErr){
        toast(`🔄 Ronda ${nextNum} de "${gameD.nombre}" iniciada automáticamente`,"ok");
        // Registrar en historial
        await supabase.from("games_historial").insert({game_id:gameInfo.game_id,admin_id:user.id,accion:"ronda_iniciada",detalle:{numero:nextNum,auto:true}}).catch(()=>{});
      }
    }
    // Registrar sorteo en historial
    await supabase.from("games_historial").insert({game_id:gameInfo.game_id,admin_id:user.id,accion:"ronda_sorteada",detalle:{ronda:num,caso,ganadores:ganadores.length}}).catch(()=>{});
  }
  sorteos();
};

/* ════════════════════════════════════════
   PAGOS PENDIENTES
════════════════════════════════════════ */
async function pagos_pendientes() {
  setActive("pagos_pendientes"); setCurrentView("pagos_pendientes"); loadingView();

  const {data:pays} = await supabase.from("payments").select("id,user_id,round_id,monto,metodo,estado,comprobante_url,referencia,boletos_solicitados,created_at").eq("estado","pendiente").order("created_at",{ascending:true});
  const userIds=(pays||[]).map(p=>p.user_id).filter(Boolean);
  const roundIds=[...new Set((pays||[]).map(p=>p.round_id).filter(Boolean))];
  const profMap=await getProfilesMap(userIds);

  let roundsMap={};
  if(roundIds.length){
    const{data:rds}=await supabase.from("rounds").select("id,numero,game_id").in("id",roundIds);
    const gIds=[...new Set((rds||[]).map(r=>r.game_id).filter(Boolean))];
    let gMap={};
    if(gIds.length){const{data:gms}=await supabase.from("games").select("id,nombre").in("id",gIds);(gms||[]).forEach(g=>{gMap[g.id]=g});}
    (rds||[]).forEach(r=>{roundsMap[r.id]={...r,game:gMap[r.game_id]};});
  }

  window.__payMap={};
  (pays||[]).forEach(p=>{const prof=profMap[p.user_id]||{};const round=roundsMap[p.round_id]||{};window.__payMap[p.id]={...p,username:prof.username,email:prof.email,round};});

  const total=(pays||[]).reduce((s,p)=>s+Number(p.monto||0),0);

  MC().innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-hourglass-split"></i>Pagos pendientes</div>
        <div class="ph-sub">${pays?.length??0} comprobante${pays?.length!==1?"s":""} · ${fmtMoney(total)} en espera</div>
      </div>
      <div class="ph-actions">
        ${pays?.length>0?`<button class="btn btn-gold btn-md" onclick="aprobarTodos()"><i class="bi bi-check-all"></i> Aprobar todos (${pays.length})</button>`:""}
      </div>
    </div>
    ${pays?.length>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">${pays.length} comprobante${pays.length!==1?"s":""} en espera</div><div class="fondo-alert-sub">Revisa cada imagen antes de aprobar. Los boletos se asignan automáticamente.</div></div></div>`:""}
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-cash-stack"></i>Comprobantes</div></div>
      <div class="panel-body no-pad" style="overflow-x:auto">
        ${!pays?.length
          ?`<div class="empty"><i class="bi bi-check-circle" style="color:#22c55e"></i><p>¡Todo al día! Sin comprobantes pendientes.</p></div>`
          :`<table id="tblPend" style="width:100%">
              <thead><tr><th>Usuario</th><th>Sorteo/Ronda</th><th>Monto</th><th>Boletos</th><th>Método</th><th>Fecha</th><th>Imagen</th><th>Acciones</th></tr></thead>
              <tbody>${(pays||[]).map(p=>{
                const prof=profMap[p.user_id]||{}; const round=roundsMap[p.round_id]||{};
                return `<tr>
                  <td><div style="font-weight:600">${prof.username||"—"}</div><div style="font-size:.75rem;color:var(--muted)">${prof.email||""}</div></td>
                  <td><span style="font-weight:600">${round.game?.nombre||"—"}</span> <span class="text-muted">R${round.numero||"?"}</span></td>
                  <td style="font-family:'Oswald',sans-serif;color:var(--gold2);font-weight:700">${fmtMoney(p.monto)}</td>
                  <td style="font-family:'Oswald',sans-serif;font-weight:700;font-size:1rem">${p.boletos_solicitados||1}</td>
                  <td>${p.metodo==="gratis"?badge("gratis"):(p.metodo||"—")}</td>
                  <td class="text-muted" style="font-size:.82rem">${fmtDateShort(p.created_at)}</td>
                  <td>${p.comprobante_url
                    ?`<button class="btn btn-ghost btn-sm" onclick="modalVerComprobante(window.__payMap['${p.id}'])"><i class="bi bi-image"></i> Ver</button>`
                    :`<span class="text-muted" style="font-size:.78rem">Sin imagen</span>`}</td>
                  <td><div class="gap2">
                    <button class="btn btn-success btn-sm" onclick="aprobarPagoId('${p.id}','${p.round_id}','${p.metodo||''}')"><i class="bi bi-check-lg"></i> Aprobar</button>
                    <button class="btn btn-danger btn-sm" onclick="rechazarPagoId('${p.id}')"><i class="bi bi-x-lg"></i></button>
                  </div></td>
                </tr>`;
              }).join("")}</tbody>
            </table>`}
      </div>
    </div>`;
  if(pays?.length) initDT("tblPend",{columnDefs:[{orderable:false,targets:[6,7]}],order:[[5,"asc"]]});
}

window.aprobarPagoId=async(id,roundId,metodo)=>{
  const r=await confirm$("Aprobar pago","¿El comprobante es válido y el monto coincide?","✅ Sí, aprobar");
  if(!r.isConfirmed) return;
  loading$("Aprobando...");
  const{data:pago,error:pErr}=await supabase.from("payments").select("user_id,boletos_solicitados,round_id,metodo").eq("id",id).single();
  if(pErr||!pago){Swal.close();ok$("Error","No se pudo obtener el pago","error");return;}
  const esGratis=(metodo||pago.metodo)==="gratis";
  const boletos=pago.boletos_solicitados||1;
  const rId=roundId||pago.round_id;
  if(!rId){Swal.close();ok$("Error","El pago no tiene ronda asociada","error");return;}
  const{error:upErr}=await supabase.from("payments").update({estado:"aprobado",revisado_por:user.id}).eq("id",id);
  if(upErr){Swal.close();ok$("Error",upErr.message,"error");return;}
  const{data:partExist}=await supabase.from("participations").select("id,boletos").eq("round_id",rId).eq("user_id",pago.user_id).maybeSingle();
  if(partExist){await supabase.from("participations").update({boletos:(partExist.boletos||1)+boletos}).eq("id",partExist.id);}
  else{await supabase.from("participations").insert({round_id:rId,user_id:pago.user_id,boletos,resultado:"pendiente",...(esGratis?{es_gratis:true}:{})});}
  Swal.close();
  toast(`✅ Aprobado · ${boletos} boleto${boletos!==1?"s":""} asignados`,"ok");
  pagos_pendientes(); updateSidebarBadges();
};

window.rechazarPagoId=async(id)=>{
  const{value:motivo}=await Swal.fire({title:"Rechazar pago",input:"text",inputLabel:"Motivo (opcional)",inputPlaceholder:"ej. Imagen borrosa, monto incorrecto...",showCancelButton:true,confirmButtonText:"❌ Rechazar",cancelButtonText:"Cancelar",...swal$});
  if(motivo===undefined) return;
  loading$("Rechazando...");
  await supabase.from("payments").update({estado:"rechazado",revisado_por:user.id,...(motivo?{referencia:motivo}:{})}).eq("id",id);
  Swal.close(); toast("Pago rechazado","err"); pagos_pendientes(); updateSidebarBadges();
};

window.aprobarTodos=async()=>{
  const r=await confirm$("Aprobar todos","Se aprobarán <strong>todos</strong> los comprobantes pendientes.","✅ Aprobar todos");
  if(!r.isConfirmed) return;
  loading$("Aprobando todos...");
  const{data:pays}=await supabase.from("payments").select("id,user_id,boletos_solicitados,round_id,metodo").eq("estado","pendiente");
  let ok=0;
  for(const p of (pays||[])){
    const esGratis=p.metodo==="gratis"; const boletos=p.boletos_solicitados||1;
    if(!p.round_id) continue;
    await supabase.from("payments").update({estado:"aprobado",revisado_por:user.id}).eq("id",p.id);
    const{data:partExist}=await supabase.from("participations").select("id,boletos").eq("round_id",p.round_id).eq("user_id",p.user_id).maybeSingle();
    if(partExist){await supabase.from("participations").update({boletos:(partExist.boletos||1)+boletos}).eq("id",partExist.id);}
    else{await supabase.from("participations").insert({round_id:p.round_id,user_id:p.user_id,boletos,resultado:"pendiente",...(esGratis?{es_gratis:true}:{})});}
    ok++;
  }
  Swal.close(); toast(`${ok} pagos aprobados ✅`,"ok"); pagos_pendientes(); updateSidebarBadges();
};

window.modalVerComprobante=(p)=>{
  if(!p) return;
  Swal.fire({
    title:"Comprobante de pago",
    html:`<img src="${p.comprobante_url}" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;border:1px solid rgba(139,26,26,.22);margin-bottom:1rem" onerror="this.src='https://placehold.co/400x200/131009/d4a017?text=No+disponible'">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
        <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Usuario</div><div style="color:#fff;font-weight:600">${p.username||"—"}</div></div>
        <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Monto</div><div style="color:var(--gold2);font-family:'Oswald',sans-serif;font-size:1.1rem;font-weight:700">${fmtMoney(p.monto)}</div></div>
        <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Boletos</div><div style="font-family:'Oswald',sans-serif;font-size:1.1rem;font-weight:700">${p.boletos_solicitados||1}</div></div>
        <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Método</div><div>${p.metodo==="gratis"?"🎁 Gratis":(p.metodo||"—")}</div></div>
        ${p.referencia?`<div style="grid-column:1/-1"><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Referencia</div><div>${p.referencia}</div></div>`:""}
      </div>`,
    showConfirmButton:false,showCloseButton:true,width:520,...swal$
  });
};

/* ════════════════════════════════════════
   PARTICIPANTES
════════════════════════════════════════ */
window.verParticipantes=async(roundId,gameNombre,num)=>{
  setCurrentView("__subview__"); loadingView();
  const{data:parts}=await supabase.from("participations").select("id,user_id,boletos,resultado,lugar,es_gratis,created_at").eq("round_id",roundId).order("created_at",{ascending:true});
  const profilesMap=await getProfilesMap((parts||[]).map(p=>p.user_id));
  const totalBoletos=(parts||[]).reduce((s,p)=>s+(p.boletos||1),0);
  const gratisCnt=(parts||[]).filter(p=>p.es_gratis).length;

  MC().innerHTML=`
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-people"></i>Participantes</div>
        <div class="ph-sub">${gameNombre} · R${num} · ${totalBoletos} boletos · ${parts?.length||0} participantes${gratisCnt>0?` · <span style="color:#4ade80">${gratisCnt} gratis</span>`:""}</div>
      </div>
      ${renderBackBtn("Volver",sorteos)}
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ol"></i>Lista</div><span class="text-muted" style="font-size:.82rem">${totalBoletos} boletos · ${parts?.length||0} personas</span></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!parts?.length?`<div class="empty"><i class="bi bi-people"></i><p>Sin participantes.</p></div>`:`
      <table id="tblPart" style="width:100%">
        <thead><tr><th>#</th><th>Usuario</th><th>Email</th><th>Boletos</th><th>Tipo</th><th>Resultado</th><th>Lugar</th><th>Inscripción</th></tr></thead>
        <tbody>${parts.map((p,i)=>{
          const prof=profilesMap[p.user_id]||{};
          const lugarEmoji=p.lugar===1?"🥇":p.lugar===2?"🥈":p.lugar===3?"🥉":"—";
          return `<tr>
            <td class="text-muted font-oswald">${i+1}</td>
            <td><strong>${prof.username||"—"}</strong></td>
            <td class="text-muted">${prof.email||"—"}</td>
            <td><span style="font-family:'Oswald',sans-serif;font-size:.95rem;color:var(--gold2);font-weight:700">${p.boletos||1}</span></td>
            <td>${p.es_gratis?badge("gratis"):`<span class="text-muted" style="font-size:.78rem">pago</span>`}</td>
            <td>${badge(p.resultado)}</td>
            <td style="font-size:1.1rem">${p.lugar?lugarEmoji:`<span class="text-muted">—</span>`}</td>
            <td class="text-muted" style="font-size:.82rem">${fmtDate(p.created_at)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`}
    </div></div>`;
  if(parts?.length) initDT("tblPart",{pageLength:25,columnDefs:[{orderable:false,targets:[0,6]}]});
};

/* ════════════════════════════════════════
   COMPROBANTES
════════════════════════════════════════ */
window.verComprobantes=async(roundId,gameNombre,num)=>{
  setCurrentView("__subview__"); loadingView();
  const{data:pays}=await supabase.from("payments").select("id,user_id,monto,metodo,estado,comprobante_url,referencia,boletos_solicitados,created_at").eq("round_id",roundId).order("created_at",{ascending:false});
  const profilesMap=await getProfilesMap((pays||[]).map(p=>p.user_id));
  const pendCount=(pays||[]).filter(p=>p.estado==="pendiente").length;
  window.__compMap={};
  (pays||[]).forEach(p=>{const prof=profilesMap[p.user_id]||{};window.__compMap[p.id]={...p,username:prof.username,email:prof.email};});

  MC().innerHTML=`
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-receipt"></i>Comprobantes — ${gameNombre} R${num}</div>
        <div class="ph-sub">${pendCount} pendiente${pendCount!==1?"s":""}</div>
      </div>
      ${renderBackBtn("Volver",sorteos)}
    </div>
    ${pendCount>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">${pendCount} comprobante${pendCount!==1?"s":""} pendientes</div><div class="fondo-alert-sub">Revisa la imagen antes de aprobar.</div></div></div>`:""}
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-cash-stack"></i>Comprobantes de la ronda</div></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!pays?.length?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin comprobantes</p></div>`:`
      <table id="tblComp" style="width:100%">
        <thead><tr><th>Usuario</th><th>Monto</th><th>Boletos</th><th>Método</th><th>Estado</th><th>Fecha</th><th>Imagen</th><th>Acción</th></tr></thead>
        <tbody>${pays.map(p=>{
          const prof=profilesMap[p.user_id]||{};
          return `<tr>
            <td><div style="font-weight:600">${prof.username||"—"}</div><div style="font-size:.75rem;color:var(--muted)">${prof.email||""}</div></td>
            <td style="font-family:'Oswald',sans-serif;color:var(--gold2);font-weight:700">${fmtMoney(p.monto)}</td>
            <td style="font-family:'Oswald',sans-serif;font-weight:700">${p.boletos_solicitados||1}</td>
            <td>${p.metodo==="gratis"?badge("gratis"):(p.metodo||"—")}</td>
            <td>${badge(p.estado)}</td>
            <td class="text-muted" style="font-size:.82rem">${fmtDateShort(p.created_at)}</td>
            <td>${p.comprobante_url?`<button class="btn btn-ghost btn-sm" onclick="modalVerComprobante(window.__compMap['${p.id}'])"><i class="bi bi-image"></i> Ver</button>`:`<span class="text-muted" style="font-size:.78rem">—</span>`}</td>
            <td>${p.estado==="pendiente"?`<div class="gap2"><button class="btn btn-success btn-sm" onclick="aprobarPago('${p.id}','${roundId}','${gameNombre}','${num}')" data-tip="Aprobar"><i class="bi bi-check-lg"></i></button><button class="btn btn-danger btn-sm" onclick="rechazarPago('${p.id}','${roundId}','${gameNombre}','${num}')" data-tip="Rechazar"><i class="bi bi-x-lg"></i></button></div>`:`<span class="text-muted" style="font-size:.78rem">—</span>`}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`}
    </div></div>`;
  if(pays?.length) initDT("tblComp",{columnDefs:[{orderable:false,targets:[6,7]}],order:[[4,"asc"]]});
};

window.aprobarPago=async(id,roundId,gameNombre,num)=>{
  const r=await confirm$("Aprobar pago","¿El comprobante es válido?","✅ Aprobar");
  if(!r.isConfirmed) return;
  loading$();
  const{data:pago,error:pErr}=await supabase.from("payments").select("user_id,boletos_solicitados,metodo").eq("id",id).single();
  if(pErr||!pago){Swal.close();ok$("Error","","error");return;}
  const esGratis=pago.metodo==="gratis"; const boletos=pago.boletos_solicitados||1;
  await supabase.from("payments").update({estado:"aprobado",revisado_por:user.id}).eq("id",id);
  const{data:partExist}=await supabase.from("participations").select("id,boletos").eq("round_id",roundId).eq("user_id",pago.user_id).maybeSingle();
  if(partExist){await supabase.from("participations").update({boletos:(partExist.boletos||1)+boletos}).eq("id",partExist.id);}
  else{await supabase.from("participations").insert({round_id:roundId,user_id:pago.user_id,boletos,resultado:"pendiente",...(esGratis?{es_gratis:true}:{})});}
  Swal.close(); toast(`✅ Aprobado · ${boletos} boleto${boletos!==1?"s":""}`,"ok");
  updateSidebarBadges(); verComprobantes(roundId,gameNombre,num);
};

window.rechazarPago=async(id,roundId,gameNombre,num)=>{
  const r=await confirm$("Rechazar pago","","❌ Rechazar"); if(!r.isConfirmed) return;
  loading$(); await supabase.from("payments").update({estado:"rechazado",revisado_por:user.id}).eq("id",id);
  Swal.close(); toast("Pago rechazado","err"); updateSidebarBadges(); verComprobantes(roundId,gameNombre,num);
};

/* ════════════════════════════════════════
   GANADORES
════════════════════════════════════════ */
async function ganadores() {
  setActive("ganadores"); setCurrentView("ganadores"); loadingView();

  const{data:rounds}=await supabase.from("rounds").select("id,numero,sorteado_at,game_id,ganador_id,ganador2_id,ganador3_id,caso_sorteo,premio_especial").eq("estado","sorteada").not("ganador_id","is",null).order("sorteado_at",{ascending:false});
  const allIds=(rounds||[]).flatMap(r=>[r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean));
  const gameIds=[...new Set((rounds||[]).map(r=>r.game_id).filter(Boolean))];
  const roundIds=(rounds||[]).map(r=>r.id);
  const[ganadoresMap,gamesMap,{data:pagosReg}]=await Promise.all([
    getProfilesMap(allIds),
    (async()=>{if(!gameIds.length)return{};const{data}=await supabase.from("games").select("id,nombre,imagen_url").in("id",gameIds);const m={};(data||[]).forEach(g=>{m[g.id]=g});return m;})(),
    roundIds.length?supabase.from("prize_payments").select("round_id,user_id,lugar,monto,metodo,estado").in("round_id",roundIds):{data:[]},
  ]);

  const pagosMap={};
  (pagosReg||[]).forEach(p=>{pagosMap[`${p.round_id}_${p.lugar}`]=p;});

  const btnPago=(pago,roundId,userId,lugar,gameNombre,numRonda,username)=>{
    if(!userId) return `<span class="text-muted">—</span>`;
    if(pago) return `<span class="bdg bdg-ok" title="${pago.metodo} · ${fmtMoney(pago.monto)}">✅ ${fmtMoney(pago.monto)}</span>`;
    const gn=(gameNombre||"").replace(/'/g,"\\'"); const un=(username||"").replace(/'/g,"\\'");
    return `<button class="btn btn-gold btn-sm" onclick="registrarPremioConQR('${roundId}','${userId}',${lugar},'${gn}','${numRonda}','${un}')"><i class="bi bi-cash-coin"></i> Pagar</button>`;
  };

  MC().innerHTML=`
    <div class="ph">
      <div><div class="ph-title"><i class="bi bi-trophy-fill"></i>Ganadores</div><div class="ph-sub">${rounds?.length||0} sorteo${rounds?.length!==1?"s":""} realizados</div></div>
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-table"></i>Historial completo</div><span class="text-muted" style="font-size:.82rem">${rounds?.length||0} registros</span></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!rounds?.length?`<div class="empty"><i class="bi bi-trophy"></i><p>Sin ganadores aún.</p></div>`:`
      <table id="tblGan" style="width:100%">
        <thead><tr><th>#</th><th>Sorteo</th><th>🥇 Ganador</th><th>🥈 2do</th><th>🥉 3ro</th><th>Caso</th><th>Pago 🥇</th><th>Pago 🥈</th><th>Pago 🥉</th><th>Fecha</th></tr></thead>
        <tbody>${rounds.map((r,i)=>{
          const g1=ganadoresMap[r.ganador_id]||{}; const g2=ganadoresMap[r.ganador2_id]||{}; const g3=ganadoresMap[r.ganador3_id]||{}; const game=gamesMap[r.game_id]||{};
          return `<tr>
            <td><span style="font-family:'Oswald',sans-serif;font-weight:700;color:var(--gold2)">${i+1}</span></td>
            <td>
              <div style="display:flex;align-items:center;gap:.4rem">
                ${game.imagen_url?`<img src="${game.imagen_url}" style="width:28px;height:28px;object-fit:cover;border-radius:5px;border:1px solid rgba(212,160,23,.2)" onerror="this.style.display='none'">`:`<span style="font-size:1rem">${getSorteoTheme(game.nombre||"").icon}</span>`}
                <div><strong>${game.nombre||"—"}</strong> <span class="text-muted">R${r.numero}</span></div>
              </div>
            </td>
            <td><div style="display:flex;align-items:center;gap:.45rem"><div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--gold2));display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:.78rem;font-weight:700;color:#fff;flex-shrink:0">${(g1.username||"?")[0].toUpperCase()}</div><strong>${g1.username||"—"}</strong></div></td>
            <td style="color:#93c5fd">${g2.username||`<span class="text-muted">—</span>`}</td>
            <td style="color:#d97706">${g3.username||`<span class="text-muted">—</span>`}</td>
            <td style="font-size:.78rem;color:var(--muted)">${r.caso_sorteo?nombreCaso(r.caso_sorteo):"—"}${r.premio_especial?" 🎁":""}</td>
            <td>${btnPago(pagosMap[`${r.id}_1`],r.id,r.ganador_id, 1,game.nombre,r.numero,g1.username)}</td>
            <td>${btnPago(pagosMap[`${r.id}_2`],r.id,r.ganador2_id,2,game.nombre,r.numero,g2.username)}</td>
            <td>${btnPago(pagosMap[`${r.id}_3`],r.id,r.ganador3_id,3,game.nombre,r.numero,g3.username)}</td>
            <td class="text-muted" style="font-size:.82rem">${r.sorteado_at?fmtDate(r.sorteado_at):"—"}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`}
    </div></div>`;
  if(rounds?.length) initDT("tblGan",{order:[[9,"desc"]],columnDefs:[{orderable:false,targets:0}],scrollX:true});
}

window.registrarPremioConQR=async(roundId,userId,lugar,gameNombre,numRonda,username)=>{
  loading$("Cargando datos del ganador...");
  const{data:prof}=await supabase.from("profiles").select("qr_cobro_url,qr_metodo,qr_verificado,total_ganado").eq("id",userId).single();
  Swal.close();

  const lugarLabel=lugar===1?"🥇 1er lugar":lugar===2?"🥈 2do lugar":"🥉 3er lugar";
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};
  const metodoLabel=mlM[prof?.qr_metodo]||prof?.qr_metodo||"—";

  const qrHtml=prof?.qr_cobro_url?`
    <div style="background:rgba(212,160,23,.05);border:1.5px solid rgba(212,160,23,.25);border-radius:12px;overflow:hidden;margin-bottom:1rem">
      <div style="padding:.5rem .9rem;border-bottom:1px solid rgba(212,160,23,.15);font-family:'Oswald',sans-serif;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold2);display:flex;align-items:center;justify-content:space-between">
        <span><i class="bi bi-qr-code-scan"></i> QR del ganador</span>
        <span style="color:var(--muted);text-transform:none;letter-spacing:.03em;font-size:.68rem">${metodoLabel}</span>
      </div>
      <div style="display:flex;justify-content:center;padding:.8rem">
        <img src="${prof.qr_cobro_url}" style="max-width:200px;width:100%;border-radius:8px;border:2px solid rgba(255,255,255,.08);background:#fff;cursor:pointer" onclick="window.open('${prof.qr_cobro_url}','_blank')" title="Clic para ampliar">
      </div>
      <div style="padding:.4rem .9rem .7rem;text-align:center;font-size:.75rem;color:var(--muted)">Escanea para enviar el pago</div>
    </div>`:`
    <div style="background:rgba(139,26,26,.06);border:1px solid rgba(139,26,26,.25);border-radius:9px;padding:.7rem .9rem;margin-bottom:1rem">
      <div style="font-size:.85rem;color:#f87171"><i class="bi bi-exclamation-triangle"></i> Sin QR registrado — coordina el pago por otro medio.</div>
    </div>`;

  const{value:v}=await Swal.fire({
    title:`Pagar premio — ${username}`,
    html:`<div style="text-align:left">
      <div style="background:var(--ink3);border:1px solid var(--bord-g);border-radius:10px;padding:.65rem .9rem;margin-bottom:.85rem">
        <div style="font-family:'Oswald',sans-serif;color:#fff">${gameNombre} · Ronda #${numRonda}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.12rem">${lugarLabel} — <strong style="color:var(--gold2)">${username}</strong></div>
      </div>
      ${qrHtml}
      <div class="field" style="margin-bottom:.8rem"><label>Monto enviado (Bs) *</label><input id="pMonto" class="swal2-input" type="number" min="0" step="0.50" placeholder="0.00" style="margin:0;width:100%"></div>
      <div class="field" style="margin-bottom:.8rem"><label>Método *</label>
        <select id="pMetodo" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
          <option value="">— Seleccionar —</option>
          <option value="qr" ${prof?.qr_metodo&&prof.qr_metodo!=="efectivo_cuenta"?" selected":""}>QR / Tigo Money / Billetera</option>
          <option value="efectivo">Efectivo / Depósito directo</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:.8rem"><label>Referencia / Nro. transacción</label><input id="pRef" class="swal2-input" placeholder="Opcional" style="margin:0;width:100%"></div>
      <div class="field"><label>Notas</label><input id="pNotas" class="swal2-input" placeholder="ej. Pagado el martes" style="margin:0;width:100%"></div>
    </div>`,
    showCancelButton:true,confirmButtonText:"💸 Registrar pago",cancelButtonText:"Cancelar",width:520,...swal$,
    preConfirm:()=>{
      const monto=parseFloat(document.getElementById("pMonto").value);
      const metodo=document.getElementById("pMetodo").value;
      if(!monto||monto<=0){Swal.showValidationMessage("Ingresa un monto válido");return false;}
      if(!metodo){Swal.showValidationMessage("Selecciona el método");return false;}
      return{monto,metodo,referencia:document.getElementById("pRef").value.trim(),notas:document.getElementById("pNotas").value.trim()};
    }
  });
  if(!v) return;
  loading$("Registrando pago...");
  const{error}=await supabase.from("prize_payments").insert({round_id:roundId,user_id:userId,lugar,monto:v.monto,metodo:v.metodo,referencia:v.referencia||null,notas:v.notas||null,estado:"enviado",registrado_por:user.id});
  if(!error){
    const{data:p}=await supabase.from("profiles").select("total_ganado").eq("id",userId).single();
    await supabase.from("profiles").update({total_ganado:(p?.total_ganado||0)+v.monto}).eq("id",userId);
  }
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast(`💸 Premio registrado · ${fmtMoney(v.monto)} a ${username}`,"ok");
  ganadores(); updateSidebarBadges();
};

window.registrarPremio=window.registrarPremioConQR;

/* ════════════════════════════════════════
   ENVIAR PREMIOS
════════════════════════════════════════ */
async function enviar_premios() {
  setActive("enviar_premios"); setCurrentView("enviar_premios"); loadingView();

  const{data:rounds}=await supabase.from("rounds")
    .select("id,numero,sorteado_at,game_id,ganador_id,ganador2_id,ganador3_id,caso_sorteo,premio_especial")
    .eq("estado","sorteada").not("ganador_id","is",null)
    .order("sorteado_at",{ascending:false});

  if(!rounds?.length){
    MC().innerHTML=`<div class="ph"><div><div class="ph-title"><i class="bi bi-cash-coin"></i>Enviar premios</div><div class="ph-sub">Sin sorteos realizados aún</div></div></div><div class="empty"><i class="bi bi-trophy"></i><p>Aún no hay sorteos finalizados.</p></div>`;
    return;
  }

  const roundIds=rounds.map(r=>r.id);
  const allGIds=rounds.flatMap(r=>[r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean));
  const gameIds=[...new Set(rounds.map(r=>r.game_id).filter(Boolean))];

  const[ganadoresMap,{data:pagosReg},{data:allParts}]=await Promise.all([
    getProfilesMap(allGIds),
    supabase.from("prize_payments").select("round_id,user_id,lugar,monto,metodo").in("round_id",roundIds),
    supabase.from("participations").select("round_id,boletos,es_gratis").in("round_id",roundIds),
  ]);
  let gamesMap={};
  if(gameIds.length){const{data}=await supabase.from("games").select("id,nombre,imagen_url,precio_boleto,capacidad_max").in("id",gameIds);(data||[]).forEach(g=>{gamesMap[g.id]=g});}

  // Stats por ronda
  const statsPorRonda={};
  (allParts||[]).forEach(p=>{
    if(!statsPorRonda[p.round_id]) statsPorRonda[p.round_id]={total:0,gratis:0};
    statsPorRonda[p.round_id].total+=(p.boletos||1);
    if(p.es_gratis) statsPorRonda[p.round_id].gratis+=(p.boletos||1);
  });
  const pagadosSet=new Map(); // roundId_lugar -> pagoObj
  (pagosReg||[]).forEach(p=>{ pagadosSet.set(`${p.round_id}_${p.lugar}`,p); });

  const pendientes=[], completados=[];
  for(const r of rounds){
    const lugares=[r.ganador_id?1:null,r.ganador2_id?2:null,r.ganador3_id?3:null].filter(Boolean);
    const todosOk=lugares.every(l=>pagadosSet.has(`${r.id}_${l}`));
    if(todosOk) completados.push(r);
    else pendientes.push(r);
  }

  // Calcular total pendiente a pagar
  let totalAPagar=0;
  for(const r of pendientes){
    const game=gamesMap[r.game_id]||{}; const stats=statsPorRonda[r.id]||{total:0,gratis:0};
    const recaudado=Math.max(0,stats.total-stats.gratis)*(game.precio_boleto||0);
    const modo=getModoGanadores(getCapacidad(game));
    const pool=recaudado*0.70;
    const lugares=[r.ganador_id?1:null,r.ganador2_id?2:null,r.ganador3_id?3:null].filter(Boolean);
    for(const lugar of lugares){
      if(!pagadosSet.has(`${r.id}_${lugar}`)&&pool>0){
        const pct=modo===1?1.0:lugar===1?0.5:lugar===2?0.3:0.2;
        totalAPagar+=Math.round(pool*pct/5)*5;
      }
    }
  }

  const renderRondaCard=(r)=>{
    const game=gamesMap[r.game_id]||{};
    const theme=getSorteoTheme(game.nombre||"");
    const stats=statsPorRonda[r.id]||{total:0,gratis:0};
    const recaudado=Math.max(0,stats.total-stats.gratis)*(game.precio_boleto||0);
    const modo=getModoGanadores(getCapacidad(game));
    const pool=recaudado*0.70;
    const gn=(game.nombre||"").replace(/'/g,"\'");

    const calcPremio=(lugar)=>{
      if(pool<=0) return 0;
      const pct=modo===1?1.0:lugar===1?0.5:lugar===2?0.3:0.2;
      return Math.round(pool*pct/5)*5;
    };

    const renderGanador=(uid,lugar)=>{
      if(!uid) return"";
      const prof=ganadoresMap[uid]||{};
      const emoji=lugar===1?"🥇":lugar===2?"🥈":"🥉";
      const lugarLabel=lugar===1?"1er Lugar":lugar===2?"2do Lugar":"3er Lugar";
      const pago=pagadosSet.get(`${r.id}_${lugar}`);
      const premio=calcPremio(lugar);
      const ini=(prof.username||"?")[0].toUpperCase();
      const u=(prof.username||"").replace(/'/g,"\'");

      return `<div class="ep-ganador ${pago?"ep-g-pagado":"ep-g-pendiente"}">
        <div class="ep-g-meta">
          <span class="ep-g-emoji">${emoji}</span>
          <div class="ep-g-av">${ini}</div>
          <div class="ep-g-info">
            <div class="ep-g-nombre">${prof.username||"—"}</div>
            <div class="ep-g-lugar">${lugarLabel}</div>
          </div>
          ${pago
            ?`<div class="ep-g-monto pagado">
                <div style="font-size:.65rem;color:#22c55e;text-transform:uppercase;letter-spacing:.08em">Enviado</div>
                <div style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:#22c55e">${fmtMoney(pago.monto)}</div>
              </div>`
            :premio>0?`<div class="ep-g-monto pendiente">
                <div style="font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">A pagar</div>
                <div style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:#fbbf24">${fmtMoneyR(premio)}</div>
              </div>`:""}
        </div>
        ${!pago?`<button class="ep-btn-pagar" onclick="registrarPremioConQR('${r.id}','${uid}',${lugar},'${gn}','${r.numero}','${u}')">
          <i class="bi bi-qr-code-scan"></i> Ver QR y registrar pago
        </button>`:""}
      </div>`;
    };

    const isPendiente = !([r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean).every(uid=>{
      const l=uid===r.ganador_id?1:uid===r.ganador2_id?2:3;
      return pagadosSet.has(`${r.id}_${l}`);
    }));

    return `<div class="ep-ronda-card">
      <!-- Header visual del sorteo -->
      <div class="ep-ronda-header" style="background:${game.imagen_url?`url('${game.imagen_url}') center/cover no-repeat`:theme.gradient}">
        <div class="ep-ronda-header-overlay"></div>
        <div class="ep-ronda-header-body">
          <div>
            <div class="ep-ronda-nombre">${game.nombre||"—"}</div>
            <div class="ep-ronda-sub">
              Ronda #${r.numero}
              ${r.sorteado_at?` · ${fmtDateShort(r.sorteado_at)}`:""}
              ${r.caso_sorteo?` · ${nombreCaso(r.caso_sorteo)}`:""}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.3rem">
            ${isPendiente
              ?`<span class="bdg" style="background:rgba(245,158,11,.28);border:1px solid rgba(245,158,11,.5);color:#fbbf24;font-size:.63rem">⏳ Pendiente</span>`
              :`<span class="bdg bdg-ok" style="font-size:.63rem">✅ Completado</span>`}
            ${recaudado>0?`<div style="font-size:.7rem;color:rgba(255,255,255,.7)"><i class="bi bi-cash-stack"></i> Recaudado: <strong style="color:#4ade80">${fmtMoney(recaudado)}</strong></div>`:""}
          </div>
        </div>
      </div>
      <!-- Ganadores -->
      <div class="ep-ganadores-list">
        ${renderGanador(r.ganador_id,1)}
        ${r.ganador2_id?renderGanador(r.ganador2_id,2):""}
        ${r.ganador3_id?renderGanador(r.ganador3_id,3):""}
      </div>
    </div>`;
  };

  MC().innerHTML=`
    <div class="ph">
      <div>
        <div class="ph-title"><i class="bi bi-cash-coin"></i>Enviar premios</div>
        <div class="ph-sub">
          ${pendientes.length} ronda${pendientes.length!==1?"s":""} pendiente${pendientes.length!==1?"s":""}
          ${totalAPagar>0?` · <strong style="color:#f59e0b">Total a pagar: ${fmtMoneyR(totalAPagar)}</strong>`:""}
          · ${completados.length} completada${completados.length!==1?"s":""}
        </div>
      </div>
    </div>

    ${pendientes.length>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">${pendientes.length} ronda${pendientes.length!==1?"s":""} con premios por pagar</div><div class="fondo-alert-sub">Toca <strong>"Ver QR y registrar pago"</strong> — se abrirá el QR del ganador para que puedas enviarlo y registrarlo.</div></div></div>`:""}

    ${pendientes.length>0?`
    <div class="ep-section-title">⏳ Por pagar</div>
    <div class="ep-grid">${pendientes.map(r=>renderRondaCard(r)).join("")}</div>
    `:""}

    ${completados.length>0?`
    <div class="ep-section-title" style="margin-top:${pendientes.length?"1.5rem":"0"}">✅ Completados (${completados.length})</div>
    <div class="ep-grid">${completados.map(r=>renderRondaCard(r)).join("")}</div>
    `:""}

    ${pendientes.length===0&&completados.length>0?`<div class="fondo-alert good"><i class="bi bi-check-circle-fill"></i><div><div class="fondo-alert-title">¡Todo al día! Todos los premios han sido enviados.</div></div></div>`:""}
  `;
}


async function finanzas() {
  setActive("finanzas"); setCurrentView("finanzas"); loadingView();

  const periodoOpts = [
    { label:"Todo", desde: new Date("2000-01-01").toISOString() },
    { label:"Este mes", desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() },
    { label:"Últimos 7 días", desde: new Date(Date.now()-7*86400000).toISOString() },
    { label:"Últimas 24 h", desde: new Date(Date.now()-86400000).toISOString() },
  ];

  async function renderFinanzas(desdeISO) {
    const [
      {data:pagosAprobados},{data:premiosPagados},{count:totalRondas},{data:paysMethods},{data:pagosGratis},
    ] = await Promise.all([
      supabase.from("payments").select("monto,metodo,created_at").eq("estado","aprobado").gte("created_at",desdeISO),
      supabase.from("prize_payments").select("monto,metodo,created_at").gte("created_at",desdeISO),
      supabase.from("rounds").select("*",{count:"exact",head:true}).eq("estado","sorteada"),
      supabase.from("payments").select("metodo,monto").eq("estado","aprobado").gte("created_at",desdeISO),
      supabase.from("payments").select("monto").eq("metodo","gratis").gte("created_at",desdeISO),
    ]);

    const totalIngresado=(pagosAprobados||[]).reduce((s,p)=>s+Number(p.monto||0),0);
    const totalPremios=(premiosPagados||[]).reduce((s,p)=>s+Number(p.monto||0),0);
    const totalGratis=(pagosGratis||[]).length;
    const balance=totalIngresado-totalPremios;
    const margen=totalIngresado>0?(balance/totalIngresado)*100:0;
    const promedioPago=pagosAprobados?.length>0?totalIngresado/pagosAprobados.length:0;

    const byMetodo={};
    (paysMethods||[]).forEach(p=>{const k=p.metodo||"manual";byMetodo[k]=(byMetodo[k]||0)+Number(p.monto||0);});
    const byMes={};
    (pagosAprobados||[]).forEach(p=>{const k=new Date(p.created_at).toLocaleDateString("es-BO",{month:"short",year:"numeric"});byMes[k]=(byMes[k]||0)+Number(p.monto||0);});
    const mesLabels=Object.keys(byMes).slice(-6);
    const mesMax=Math.max(...mesLabels.map(k=>byMes[k]),1);
    const metodoNames={yape:"Yape",qr:"QR/Tigo Money",transferencia:"Transferencia bancaria",manual:"Efectivo/Manual",gratis:"Boletos gratis"};
    const ratioGratis=(pagosAprobados?.length||0)>0?totalGratis/(pagosAprobados.length+totalGratis)*100:0;

    document.getElementById("finContent").innerHTML=`
      <div class="fin-grid">
        <div class="fin-card fin-ganancia"><div class="fin-icon"><i class="bi bi-arrow-down-circle"></i></div><div class="fin-lbl">Total ingresado</div><div class="fin-val green">${fmtMoney(totalIngresado)}</div><div class="fin-sub">${pagosAprobados?.length||0} pagos · prom. ${fmtMoney(promedioPago)}</div></div>
        <div class="fin-card fin-riesgo"><div class="fin-icon"><i class="bi bi-arrow-up-circle"></i></div><div class="fin-lbl">Total en premios</div><div class="fin-val orange">${fmtMoney(totalPremios)}</div><div class="fin-sub">${premiosPagados?.length||0} premios · ${totalRondas||0} rondas sorteadas</div></div>
        <div class="fin-card ${balance>=0?"fin-ganancia":"fin-alerta"}"><div class="fin-icon"><i class="bi bi-cash-stack"></i></div><div class="fin-lbl">Balance neto</div><div class="fin-val ${balance>=0?"green":"red"}">${fmtMoney(balance)}</div>
          <div class="margen-bar"><div class="margen-row"><span class="margen-label">Margen de ganancia</span><span class="margen-pct">${fmtPct(margen)}</span></div><div class="margen-track"><div class="margen-fill ${margen<0?"bad":margen<20?"warn":""}" style="width:${Math.min(Math.abs(margen),100)}%"></div></div></div>
        </div>
        <div class="fin-card fin-neutral"><div class="fin-icon"><i class="bi bi-gift"></i></div><div class="fin-lbl">Boletos gratis emitidos</div><div class="fin-val blue">${totalGratis}</div><div class="fin-sub">Ratio: ${fmtPct(ratioGratis)} del total${ratioGratis>25?` <span style="color:#f59e0b">⚠️ Alto</span>`:""}</div></div>
      </div>
      <div class="grid2">
        <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-pie-chart-fill"></i>Por método de pago</div></div>
        <div class="panel-body">${Object.keys(byMetodo).length===0?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin datos</p></div>`:Object.entries(byMetodo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{const pct=totalIngresado>0?(v/totalIngresado)*100:0;return`<div style="margin-bottom:.85rem"><div style="display:flex;justify-content:space-between;margin-bottom:.2rem;font-size:.85rem"><span>${metodoNames[k]||k}</span><span style="font-family:'Oswald',sans-serif;color:var(--gold2)">${fmtMoney(v)} <span style="color:var(--muted);font-size:.75rem">${fmtPct(pct)}</span></span></div><div class="prog-bg"><div class="prog-fill" style="width:${pct}%"></div></div></div>`;}).join("")}</div></div>
        <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-bar-chart-fill"></i>Ingresos por mes</div></div>
        <div class="panel-body">${mesLabels.length===0?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin datos</p></div>`:mesLabels.map(k=>{const pct=(byMes[k]/mesMax)*100;return`<div style="margin-bottom:.85rem"><div style="display:flex;justify-content:space-between;margin-bottom:.2rem;font-size:.85rem"><span>${k}</span><span style="font-family:'Oswald',sans-serif;color:var(--gold2)">${fmtMoney(byMes[k])}</span></div><div class="prog-bg"><div class="prog-fill" style="width:${pct}%"></div></div></div>`;}).join("")}</div></div>
      </div>
      ${margen<15&&totalIngresado>0?`<div class="fondo-alert warn"><i class="bi bi-graph-down-arrow"></i><div><div class="fondo-alert-title">Margen bajo (${fmtPct(margen)})</div><div class="fondo-alert-sub">Considera ajustar el precio de boletos.</div></div></div>`:""}
    `;
  }

  MC().innerHTML=`
    <div class="ph">
      <div><div class="ph-title"><i class="bi bi-graph-up-arrow"></i>Finanzas</div><div class="ph-sub">Análisis financiero del sistema</div></div>
      <div class="ph-actions">${periodoOpts.map((p,i)=>`<button class="btn btn-${i===0?"gold":"dark"} btn-sm fin-periodo-btn" data-desde="${p.desde}">${p.label}</button>`).join("")}</div>
    </div>
    <div id="finContent"><div class="spin-wrap"><div class="spinner"></div></div></div>`;

  await renderFinanzas(periodoOpts[0].desde);
  document.querySelectorAll(".fin-periodo-btn").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      document.querySelectorAll(".fin-periodo-btn").forEach(b=>{b.className="btn btn-dark btn-sm fin-periodo-btn";});
      btn.className="btn btn-gold btn-sm fin-periodo-btn";
      document.getElementById("finContent").innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;
      await renderFinanzas(btn.dataset.desde);
    });
  });
}

/* ════════════════════════════════════════
   USUARIOS
════════════════════════════════════════ */
async function usuarios() {
  setActive("usuarios"); setCurrentView("usuarios"); loadingView();
  const{data}=await supabase.from("profiles").select("id,username,email,saldo,total_ganado,estado,created_at,qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at").eq("rol","usuario").order("created_at",{ascending:false});
  const sinQr=(data||[]).filter(u=>!u.qr_cobro_url).length;
  const pendQr=(data||[]).filter(u=>u.qr_cobro_url&&!u.qr_verificado).length;
  window.__usrMap={}; (data||[]).forEach(u=>{window.__usrMap[u.id]=u});

  MC().innerHTML=`
    <div class="ph">
      <div><div class="ph-title"><i class="bi bi-people-fill"></i>Usuarios</div><div class="ph-sub">${data?.length||0} usuarios registrados</div></div>
      <div class="ph-actions"><span style="font-size:.82rem;color:var(--muted)">${sinQr>0?`<span style="color:#f87171">${sinQr} sin QR</span> · `:""}${pendQr>0?`<span style="color:#f59e0b">${pendQr} por verificar</span> · `:""}<span style="color:#22c55e">${(data?.length||0)-sinQr-pendQr} verificados</span></span></div>
    </div>
    ${pendQr>0?`<div class="fondo-alert warn" style="cursor:pointer" onclick="document.querySelector('[data-view=qr_usuarios]').click()"><i class="bi bi-qr-code-scan"></i><div><div class="fondo-alert-title">${pendQr} QR${pendQr!==1?"s":""} pendientes</div><div class="fondo-alert-sub">Clic para verificarlos.</div></div><button class="btn btn-gold btn-sm" onclick="event.stopPropagation();document.querySelector('[data-view=qr_usuarios]').click()">→ Verificar</button></div>`:""}
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ul"></i>Lista</div></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      <table id="tblUsr" style="width:100%">
        <thead><tr><th>Usuario</th><th>Email</th><th>Total ganado</th><th>Estado</th><th>QR Cobros</th><th>Registro</th><th>Acciones</th></tr></thead>
        <tbody>${renderUsrRows(data||[])}</tbody>
      </table>
    </div></div>`;
  initDT("tblUsr",{columnDefs:[{orderable:false,targets:[4,6]}]});
}

function renderUsrRows(data) {
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"BCB",qr_simple:"QR",efectivo_cuenta:"Efectivo"};
  return data.map(u=>{
    let qrCell="";
    if(!u.qr_cobro_url){
      qrCell=`<span class="text-muted" style="font-size:.78rem"><i class="bi bi-x-circle"></i> Sin QR</span>`;
    } else if(!u.qr_verificado){
      qrCell=`<div class="gap2"><span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Pendiente</span><button class="btn btn-ghost btn-sm" onclick="verQrUsuario(window.__usrMap['${u.id}'])" data-tip="Ver QR"><i class="bi bi-eye"></i></button><button class="btn btn-success btn-sm" onclick="accionVerificarQr('${u.id}','${u.username}')" data-tip="Verificar QR"><i class="bi bi-check-lg"></i></button><button class="btn btn-danger btn-sm" onclick="accionRechazarQr('${u.id}','${u.username}')" data-tip="Rechazar QR"><i class="bi bi-x-lg"></i></button></div>`;
    } else {
      qrCell=`<div class="gap2"><span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> OK</span>${u.qr_metodo?`<span style="font-size:.72rem;color:var(--muted)">${mlM[u.qr_metodo]||u.qr_metodo}</span>`:""}<button class="btn btn-ghost btn-sm" onclick="verQrUsuario(window.__usrMap['${u.id}'])" data-tip="Ver QR"><i class="bi bi-eye"></i></button></div>`;
    }
    return `<tr>
      <td><strong>${u.username}</strong></td>
      <td class="text-muted" style="font-size:.85rem">${u.email||"—"}</td>
      <td style="font-family:'Oswald',sans-serif;color:#22c55e">${fmtMoney(u.total_ganado)}</td>
      <td>${badge(u.estado)}</td>
      <td>${qrCell}</td>
      <td class="text-muted" style="font-size:.82rem">${fmtDateShort(u.created_at)}</td>
      <td><div class="gap2">
        ${u.estado==="activo"?`<button class="btn btn-danger btn-sm" onclick="toggleUser('${u.id}','suspendido','${u.username}')"><i class="bi bi-slash-circle"></i> Suspender</button>`:`<button class="btn btn-success btn-sm" onclick="toggleUser('${u.id}','activo','${u.username}')"><i class="bi bi-check-circle"></i> Activar</button>`}
        <button class="btn btn-dark btn-sm" onclick="verHistorialUsuario('${u.id}','${u.username}')" data-tip="Ver historial"><i class="bi bi-clock-history"></i></button>
      </div></td>
    </tr>`;
  }).join("");
}

window.verHistorialUsuario=async(userId,username)=>{
  loading$("Cargando historial...");
  const[{data:parts},{data:pays},{data:premios}]=await Promise.all([
    supabase.from("participations").select("boletos,resultado,es_gratis,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(20),
    supabase.from("payments").select("monto,metodo,estado,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(10),
    supabase.from("prize_payments").select("monto,lugar,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(10),
  ]);
  Swal.close();
  const totalBoletos=(parts||[]).reduce((s,p)=>s+(p.boletos||1),0);
  const totalGanado=(premios||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const totalInv=(pays||[]).filter(p=>p.estado==="aprobado"&&p.monto>0).reduce((s,p)=>s+Number(p.monto||0),0);
  const ganadas=(parts||[]).filter(p=>p.resultado==="ganada").length;
  Swal.fire({
    title:`Historial — ${username}`,width:580,...swal$,showCloseButton:true,showConfirmButton:false,
    html:`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin-bottom:1rem">
      <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.55rem;text-align:center"><div style="font-family:'Oswald',sans-serif;font-size:1.1rem;color:#fff">${totalBoletos}</div><div style="font-size:.65rem;color:var(--muted)">BOLETOS</div></div>
      <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.55rem;text-align:center"><div style="font-family:'Oswald',sans-serif;font-size:1.1rem;color:#22c55e">${ganadas}</div><div style="font-size:.65rem;color:var(--muted)">GANADOS</div></div>
      <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.55rem;text-align:center"><div style="font-family:'Oswald',sans-serif;font-size:1.1rem;color:var(--gold2)">${fmtMoney(totalInv)}</div><div style="font-size:.65rem;color:var(--muted)">INVERTIDO</div></div>
      <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.55rem;text-align:center"><div style="font-family:'Oswald',sans-serif;font-size:1.1rem;color:#22c55e">${fmtMoney(totalGanado)}</div><div style="font-size:.65rem;color:var(--muted)">GANADO</div></div>
    </div>
    <div style="text-align:left;font-size:.82rem;color:var(--muted)">
      <div style="font-family:'Oswald',sans-serif;font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:.4rem">Últimos pagos</div>
      ${(pays||[]).slice(0,5).map(p=>`<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid rgba(255,255,255,.04)"><span>${fmtDateShort(p.created_at)} · ${p.metodo||"—"}</span><span style="${p.estado==="aprobado"?"color:var(--gold2)":"color:#f87171"}">${fmtMoney(p.monto)} ${badge(p.estado)}</span></div>`).join("")}
    </div>`,
  });
};

window.verQrUsuario=(u)=>{
  if(!u?.qr_cobro_url) return;
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};
  Swal.fire({
    title:`QR — ${u.username}`,
    html:`<img src="${u.qr_cobro_url}" style="width:100%;max-height:340px;object-fit:contain;border-radius:10px;border:1px solid rgba(212,160,23,.2);margin-bottom:1rem" onerror="this.src='https://placehold.co/300x300/131009/d4a017?text=QR+no+disponible'">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Método</div><div>${mlM[u.qr_metodo]||u.qr_metodo||"—"}</div></div>
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Estado</div><div>${u.qr_verificado?'<span style="color:#22c55e">✅ Verificado</span>':'<span style="color:#f59e0b">⏳ Pendiente</span>'}</div></div>
    </div>`,
    showConfirmButton:false,showCloseButton:true,width:460,...swal$
  });
};

async function _doVerificarQr(userId,username) {
  const r=await confirm$(`Verificar QR — ${username}`,"","✅ Verificar"); if(!r.isConfirmed) return false;
  loading$();
  const{data:updated,error}=await supabase.from("profiles").update({qr_verificado:true}).eq("id",userId).select("id,qr_verificado");
  Swal.close();
  if(error||!updated?.length){ok$("Error al verificar",error?.message||"Sin respuesta","error");return false;}
  if(window.__usrMap?.[userId]) window.__usrMap[userId].qr_verificado=true;
  toast(`QR de ${username} verificado ✅`,"ok"); updateSidebarBadges(); return true;
}
async function _doRechazarQr(userId,username) {
  const r=await confirm$(`Rechazar QR — ${username}`,"Se eliminará. El usuario deberá subir uno nuevo.","❌ Rechazar"); if(!r.isConfirmed) return false;
  loading$();
  const{data:updated,error}=await supabase.from("profiles").update({qr_cobro_url:null,qr_metodo:null,qr_verificado:false,qr_subido_at:null}).eq("id",userId).select("id,qr_cobro_url");
  Swal.close();
  if(error||!updated?.length){ok$("Error",error?.message||"Sin respuesta","error");return false;}
  if(window.__usrMap?.[userId]){window.__usrMap[userId].qr_cobro_url=null;window.__usrMap[userId].qr_verificado=false;window.__usrMap[userId].qr_metodo=null;window.__usrMap[userId].qr_subido_at=null;}
  toast(`QR de ${username} rechazado`,"err"); updateSidebarBadges(); return true;
}

window.accionVerificarQr=async(userId,username)=>{const ok=await _doVerificarQr(userId,username);if(ok){await new Promise(r=>setTimeout(r,300));usuarios();}};
window.accionRechazarQr=async(userId,username)=>{const ok=await _doRechazarQr(userId,username);if(ok){await new Promise(r=>setTimeout(r,300));usuarios();}};
window.verificarQrDesdeQRView=async(userId,username)=>{const ok=await _doVerificarQr(userId,username);if(ok){await new Promise(r=>setTimeout(r,300));qr_usuarios();}};
window.rechazarQrDesdeQRView=async(userId,username)=>{const ok=await _doRechazarQr(userId,username);if(ok){await new Promise(r=>setTimeout(r,300));qr_usuarios();}};
window.toggleUser=async(id,estado,nombre)=>{
  const r=await confirm$(`${estado==="suspendido"?"Suspender":"Activar"} a ${nombre}`,"","Confirmar");if(!r.isConfirmed) return;
  loading$();await supabase.from("profiles").update({estado}).eq("id",id);Swal.close();
  toast(estado==="suspendido"?`${nombre} suspendido`:`${nombre} activado`,estado==="suspendido"?"err":"ok");usuarios();
};

/* ════════════════════════════════════════
   QR PENDIENTES
════════════════════════════════════════ */
async function qr_usuarios() {
  setActive("qr_usuarios"); setCurrentView("qr_usuarios"); loadingView();
  const{data}=await supabase.from("profiles").select("id,username,email,qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at").eq("rol","usuario").not("qr_cobro_url","is",null).order("qr_subido_at",{ascending:true});
  const pendientes=(data||[]).filter(u=>!u.qr_verificado);
  const verificados=(data||[]).filter(u=>u.qr_verificado);
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};
  window.__usrMap=window.__usrMap||{}; (data||[]).forEach(u=>{window.__usrMap[u.id]=u});

  const renderQrBox=(u,esPendiente)=>`
    <div class="qr-user-box">
      <img class="qrb-img" src="${u.qr_cobro_url}" alt="QR ${u.username}" onclick="verQrUsuario(window.__usrMap['${u.id}'])" onerror="this.src='https://placehold.co/68x68/131009/d4a017?text=QR'">
      <div class="qrb-body">
        <div class="qrb-name">${u.username}</div>
        <div class="qrb-meta"><span>${u.email||"—"}</span>${u.qr_metodo?`<span>·</span><span>${mlM[u.qr_metodo]||u.qr_metodo}</span>`:""}${u.qr_subido_at?`<span>·</span><span>${fmtDateShort(u.qr_subido_at)}</span>`:""}</div>
        <div class="qrb-actions">
          <button class="btn btn-ghost btn-sm" onclick="verQrUsuario(window.__usrMap['${u.id}'])"><i class="bi bi-zoom-in"></i> Ampliar</button>
          ${esPendiente?`<button class="btn btn-success btn-sm" onclick="verificarQrDesdeQRView('${u.id}','${u.username}')"><i class="bi bi-check-lg"></i> Verificar</button><button class="btn btn-danger btn-sm" onclick="rechazarQrDesdeQRView('${u.id}','${u.username}')"><i class="bi bi-x-lg"></i> Rechazar</button>`:`${badge("aprobado")}`}
        </div>
      </div>
    </div>`;

  MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-qr-code-scan"></i>QR de cobros</div><div class="ph-sub">${pendientes.length} pendiente${pendientes.length!==1?"s":""} · ${verificados.length} verificado${verificados.length!==1?"s":""}</div></div></div>
    ${pendientes.length>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">${pendientes.length} QR esperando verificación</div><div class="fondo-alert-sub">Haz clic en la imagen para ampliarla antes de verificar.</div></div></div>`:""}
    <div class="grid2">
      <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-hourglass-split"></i>Pendientes</div><span class="text-muted" style="font-size:.82rem">${pendientes.length}</span></div>
      <div class="panel-body">${!pendientes.length?`<div class="empty"><i class="bi bi-check-circle" style="color:#22c55e"></i><p>¡Todo verificado!</p></div>`:pendientes.map(u=>renderQrBox(u,true)).join("")}</div></div>
      <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-check-circle-fill" style="color:#22c55e"></i>Verificados</div><span class="text-muted" style="font-size:.82rem">${verificados.length}</span></div>
      <div class="panel-body">${!verificados.length?`<div class="empty"><i class="bi bi-qr-code"></i><p>Ninguno verificado aún</p></div>`:verificados.map(u=>renderQrBox(u,false)).join("")}</div></div>
    </div>`;
}

/* ════════════════════════════════════════
   REFERIDOS
════════════════════════════════════════ */
async function referidos() {
  setActive("referidos"); setCurrentView("referidos"); loadingView();
  const{data}=await supabase.from("referidos").select("id,estado,boleto_otorgado,boletos_pagados,creado_at,referidor_id,referido_id").order("creado_at",{ascending:false});
  const allIds=(data||[]).flatMap(r=>[r.referidor_id,r.referido_id].filter(Boolean));
  const profMap=await getProfilesMap(allIds);
  const total=(data||[]).length;const completados=(data||[]).filter(r=>r.estado==="completado").length;const boletosOtorgados=(data||[]).filter(r=>r.boleto_otorgado).length;

  MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-share-fill"></i>Referidos</div><div class="ph-sub">${total} referido${total!==1?"s":""} · ${completados} completados</div></div></div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:1.3rem">
      <div class="sc"><div class="sc-bar g"></div><span class="sc-icon">🔗</span><div class="sc-val">${total}</div><div class="sc-lbl">Total</div></div>
      <div class="sc"><div class="sc-bar gr"></div><span class="sc-icon">✅</span><div class="sc-val green">${completados}</div><div class="sc-lbl">Completados</div></div>
      <div class="sc"><div class="sc-bar b"></div><span class="sc-icon">🎟️</span><div class="sc-val blue">${boletosOtorgados}</div><div class="sc-lbl">Boletos otorgados</div></div>
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ul"></i>Historial</div></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!data?.length?`<div class="empty"><i class="bi bi-share"></i><p>Sin referidos aún.</p></div>`:`
      <table id="tblRef" style="width:100%">
        <thead><tr><th>Referidor</th><th>Referido</th><th>Estado</th><th>Boleto</th><th>Progreso (3 pagos)</th><th>Fecha</th></tr></thead>
        <tbody>${data.map(r=>{const ref1=profMap[r.referidor_id]||{};const ref2=profMap[r.referido_id]||{};return`<tr>
          <td><strong>${ref1.username||"—"}</strong></td>
          <td>${ref2.username||"—"}</td>
          <td>${badge(r.estado)}</td>
          <td>${r.boleto_otorgado?`<span class="bdg bdg-ok">✅ Sí</span>`:`<span class="bdg bdg-closed">No</span>`}</td>
          <td><div style="display:flex;align-items:center;gap:.5rem"><div class="prog-bg" style="width:70px"><div class="prog-fill" style="width:${Math.min((r.boletos_pagados||0)/3*100,100)}%"></div></div><span style="font-size:.8rem;color:var(--muted)">${r.boletos_pagados||0}/3</span></div></td>
          <td class="text-muted" style="font-size:.82rem">${fmtDateShort(r.creado_at)}</td>
        </tr>`}).join("")}</tbody>
      </table>`}
    </div></div>`;
  if(data?.length) initDT("tblRef",{order:[[5,"desc"]]});
}

/* ════════════════════════════════════════
   BOLETOS GRATIS
════════════════════════════════════════ */
async function boletos_gratis() {
  setActive("boletos_gratis"); setCurrentView("boletos_gratis"); loadingView();
  const{data}=await supabase.from("boletos_gratis").select("id,user_id,origen,usado,usado_at,created_at,usado_en_round").order("created_at",{ascending:false});
  const allIds=(data||[]).map(b=>b.user_id).filter(Boolean);const profMap=await getProfilesMap(allIds);
  const total=(data||[]).length;const usados=(data||[]).filter(b=>b.usado).length;const libres=total-usados;

  MC().innerHTML=`
    <div class="ph">
      <div><div class="ph-title"><i class="bi bi-gift-fill"></i>Boletos gratis</div><div class="ph-sub">${total} total · ${libres} disponibles</div></div>
      <button class="btn btn-gold btn-md" onclick="asignarBoletoGratis()"><i class="bi bi-plus-lg"></i> Asignar boleto</button>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:1.3rem">
      <div class="sc"><div class="sc-bar g"></div><span class="sc-icon">🎟️</span><div class="sc-val">${total}</div><div class="sc-lbl">Total generados</div></div>
      <div class="sc"><div class="sc-bar gr"></div><span class="sc-icon">✅</span><div class="sc-val green">${libres}</div><div class="sc-lbl">Disponibles</div></div>
      <div class="sc"><div class="sc-bar r"></div><span class="sc-icon">🔒</span><div class="sc-val red">${usados}</div><div class="sc-lbl">Usados</div></div>
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ul"></i>Historial</div></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!data?.length?`<div class="empty"><i class="bi bi-gift"></i><p>Sin boletos gratis.</p></div>`:`
      <table id="tblBG" style="width:100%">
        <thead><tr><th>Usuario</th><th>Email</th><th>Origen</th><th>Estado</th><th>Usado el</th><th>Emitido</th></tr></thead>
        <tbody>${data.map(b=>{const prof=profMap[b.user_id]||{};return`<tr>
          <td><strong>${prof.username||"—"}</strong></td>
          <td class="text-muted" style="font-size:.82rem">${prof.email||"—"}</td>
          <td class="text-muted" style="font-size:.82rem">${b.origen||"—"}</td>
          <td>${b.usado?badge("rechazado"):`<span class="bdg bdg-free">🎁 Disponible</span>`}</td>
          <td class="text-muted" style="font-size:.82rem">${b.usado_at?fmtDateShort(b.usado_at):"—"}</td>
          <td class="text-muted" style="font-size:.82rem">${fmtDateShort(b.created_at)}</td>
        </tr>`}).join("")}</tbody>
      </table>`}
    </div></div>`;
  if(data?.length) initDT("tblBG",{order:[[5,"desc"]]});
}

window.asignarBoletoGratis=async()=>{
  const{data:usrs}=await supabase.from("profiles").select("id,username,email").eq("rol","usuario").eq("estado","activo").order("username");
  if(!usrs?.length){ok$("Sin usuarios","No hay usuarios activos.","warning");return;}
  const opts=usrs.map(u=>`<option value="${u.id}">${u.username} — ${u.email||""}</option>`).join("");
  const{value:v}=await Swal.fire({
    title:"Asignar boleto gratis",
    html:`<div style="text-align:left"><div class="field" style="margin-bottom:.85rem"><label>Usuario *</label><select id="bgUser" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem"><option value="">— Seleccionar —</option>${opts}</select></div><div class="field"><label>Origen / Motivo</label><input id="bgOrigen" class="swal2-input" placeholder="ej. Promoción especial" style="margin:0;width:100%"></div></div>`,
    showCancelButton:true,confirmButtonText:"🎁 Asignar",...swal$,
    preConfirm:()=>{const uid=document.getElementById("bgUser").value;if(!uid){Swal.showValidationMessage("Selecciona un usuario");return false;}return{user_id:uid,origen:document.getElementById("bgOrigen").value.trim()||"manual admin"};}
  });
  if(!v) return;
  loading$();
  const{error}=await supabase.from("boletos_gratis").insert({user_id:v.user_id,origen:v.origen,usado:false});
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast("Boleto gratis asignado 🎁","ok"); boletos_gratis();
};

/* ════════════════════════════════════════
   TRABAJADORES — Con gestión de QR
════════════════════════════════════════ */
async function trabajadores() {
  setActive("trabajadores"); setCurrentView("trabajadores"); loadingView();
  const{data}=await supabase.from("profiles").select("id,username,email,estado,created_at,qr_cobro_url,qr_metodo,qr_verificado").eq("rol","trabajador").order("created_at",{ascending:false});
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta"};

  MC().innerHTML=`
    <div class="ph">
      <div><div class="ph-title"><i class="bi bi-person-badge-fill"></i>Trabajadores</div><div class="ph-sub">${data?.length||0} trabajador${data?.length!==1?"es":""}</div></div>
      <button class="btn btn-red btn-md" onclick="modalNuevoTrabajador()"><i class="bi bi-person-plus-fill"></i> Nuevo trabajador</button>
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ul"></i>Lista</div></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!data?.length?`<div class="empty"><i class="bi bi-person-badge"></i><p>Sin trabajadores. Crea el primero.</p></div>`:`
      <table id="tblTrab" style="width:100%">
        <thead><tr><th>Usuario</th><th>Email</th><th>Estado</th><th>Alta</th><th>QR Cobros</th><th>Acciones</th></tr></thead>
        <tbody>${data.map(t=>{
          let qrCell="";
          if(!t.qr_cobro_url){
            qrCell=`<div style="display:flex;align-items:center;gap:.4rem"><span class="text-muted" style="font-size:.78rem"><i class="bi bi-x-circle"></i> Sin QR</span><button class="btn btn-ghost btn-sm" onclick="modalSubirQRTrabajador('${t.id}','${t.username}')"><i class="bi bi-upload"></i> Subir QR</button></div>`;
          } else if(!t.qr_verificado){
            qrCell=`<div class="gap2"><span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Pendiente</span><button class="btn btn-ghost btn-sm" onclick="verQrTrabajador(window.__trabMap['${t.id}'])"><i class="bi bi-eye"></i> Ver</button><button class="btn btn-success btn-sm" onclick="verificarQrTrab('${t.id}','${t.username}')"><i class="bi bi-check-lg"></i> Verificar</button><button class="btn btn-ghost btn-sm" onclick="modalSubirQRTrabajador('${t.id}','${t.username}')"><i class="bi bi-arrow-repeat"></i> Cambiar</button></div>`;
          } else {
            qrCell=`<div class="gap2"><span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> Verificado</span>${t.qr_metodo?`<span style="font-size:.72rem;color:var(--muted)">${mlM[t.qr_metodo]||t.qr_metodo}</span>`:""}<button class="btn btn-ghost btn-sm" onclick="verQrTrabajador(window.__trabMap['${t.id}'])"><i class="bi bi-eye"></i> Ver</button><button class="btn btn-ghost btn-sm" onclick="modalSubirQRTrabajador('${t.id}','${t.username}')"><i class="bi bi-arrow-repeat"></i> Cambiar</button></div>`;
          }
          return `<tr>
            <td><strong>${t.username}</strong></td>
            <td class="text-muted" style="font-size:.85rem">${t.email||"—"}</td>
            <td>${badge(t.estado)}</td>
            <td class="text-muted" style="font-size:.82rem">${fmtDateShort(t.created_at)}</td>
            <td>${qrCell}</td>
            <td><div class="gap2">
              ${t.estado==="activo"?`<button class="btn btn-danger btn-sm" onclick="toggleTrab('${t.id}','suspendido','${t.username}')"><i class="bi bi-slash-circle"></i> Suspender</button>`:`<button class="btn btn-success btn-sm" onclick="toggleTrab('${t.id}','activo','${t.username}')"><i class="bi bi-check-circle"></i> Activar</button>`}
              <button class="btn btn-danger btn-sm" onclick="deleteTrab('${t.id}','${t.username}')"><i class="bi bi-trash"></i> Eliminar</button>
            </div></td>
          </tr>`;
        }).join("")}</tbody>
      </table>`}
    </div></div>`;
  window.__trabMap={}; (data||[]).forEach(t=>{window.__trabMap[t.id]=t});
  if(data?.length) initDT("tblTrab",{columnDefs:[{orderable:false,targets:[4,5]}]});
}

window.modalNuevoTrabajador=async()=>{
  const{value:v}=await Swal.fire({title:"Nuevo Trabajador",html:`<div style="text-align:left"><div class="field" style="margin-bottom:.85rem"><label>Usuario *</label><input id="tU" class="swal2-input" placeholder="nombre_usuario" style="margin:0;width:100%"></div><div class="field" style="margin-bottom:.85rem"><label>Email *</label><input id="tE" class="swal2-input" type="email" placeholder="correo@ejemplo.com" style="margin:0;width:100%"></div><div class="field"><label>Contraseña * (mín. 6)</label><input id="tP" class="swal2-input" type="password" placeholder="••••••••" style="margin:0;width:100%"></div></div>`,showCancelButton:true,confirmButtonText:"Crear",...swal$,preConfirm:()=>{const u=document.getElementById("tU").value.trim(),e=document.getElementById("tE").value.trim(),p=document.getElementById("tP").value;if(!u||!e||!p){Swal.showValidationMessage("Todos los campos son obligatorios");return false;}if(p.length<6){Swal.showValidationMessage("Mínimo 6 caracteres");return false;}return{username:u,email:e,password:p};}});
  if(!v) return;
  loading$();
  const{data:authData,error:authErr}=await supabase.auth.signUp({email:v.email,password:v.password});
  if(authErr||!authData?.user){Swal.close();ok$("Error auth",authErr?.message||"No se pudo crear","error");return;}
  const{error:pe}=await supabase.from("profiles").insert({id:authData.user.id,username:v.username,email:v.email,rol:"trabajador",estado:"activo"});
  Swal.close();
  if(pe){ok$("Error de perfil",pe.message,"error");return;}
  toast(`Trabajador ${v.username} creado ✅`,"ok"); trabajadores();
};

window.modalSubirQRTrabajador=async(trabId,trabUsername)=>{
  const METODOS=[{value:"tigo_money",label:"Tigo Money"},{value:"billetera_bcb",label:"Billetera BCB"},{value:"qr_simple",label:"QR Interbank"},{value:"efectivo_cuenta",label:"Cuenta bancaria"}];
  const{data:curr}=await supabase.from("profiles").select("qr_metodo,qr_cobro_url").eq("id",trabId).single();

  const{value:v}=await Swal.fire({
    title:`QR de cobros — ${trabUsername}`,
    html:`<div style="text-align:left">
      <div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.2);border-radius:9px;padding:.7rem .9rem;margin-bottom:1rem;font-size:.82rem;color:var(--muted)">
        <i class="bi bi-info-circle" style="color:var(--gold2)"></i> Este QR se usará para recibir pagos de ganadores cuando este trabajador gestione sorteos.
      </div>
      ${curr?.qr_cobro_url?`<div style="margin-bottom:.85rem;text-align:center"><img src="${curr.qr_cobro_url}" style="max-height:100px;border-radius:8px;border:1px solid rgba(212,160,23,.2)"><div style="font-size:.72rem;color:var(--muted);margin-top:.3rem">QR actual</div></div>`:""}
      <div class="field" style="margin-bottom:.85rem"><label>Tipo de pago *</label>
        <select id="qrMT" style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
          ${METODOS.map(m=>`<option value="${m.value}"${m.value===(curr?.qr_metodo||"")?" selected":""}>${m.label}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Imagen del QR * <span style="font-weight:400;text-transform:none;font-size:.68rem;color:var(--muted)">(JPG/PNG, máx. 5MB)</span></label>
        <input type="file" id="qrFileTrab" accept="image/jpeg,image/png,image/webp" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem">
        <img id="qrPrevTrab" style="display:none;width:100%;max-height:140px;object-fit:contain;margin-top:.55rem;border-radius:8px;border:1px solid rgba(212,160,23,.2)">
      </div>
    </div>`,
    showCancelButton:true,confirmButtonText:"<i class='bi bi-upload'></i> Guardar QR",cancelButtonText:"Cancelar",width:480,...swal$,
    didOpen:()=>{document.getElementById("qrFileTrab").addEventListener("change",e=>{const f=e.target.files[0];if(f){const r2=new FileReader();r2.onload=ev=>{const i=document.getElementById("qrPrevTrab");i.src=ev.target.result;i.style.display="block"};r2.readAsDataURL(f)}});},
    preConfirm:()=>{
      const metodo=document.getElementById("qrMT").value;
      const file=document.getElementById("qrFileTrab").files[0];
      if(!file&&!curr?.qr_cobro_url){Swal.showValidationMessage("Sube la imagen del QR");return false;}
      if(file&&file.size>5*1024*1024){Swal.showValidationMessage("Máx. 5 MB");return false;}
      return{metodo,file};
    }
  });
  if(!v) return;
  loading$("Subiendo QR...");
  let qr_url=curr?.qr_cobro_url||null;
  if(v.file){try{qr_url=await uploadFile(v.file,"el-padrino/qr-cobros");}catch{Swal.close();ok$("Error al subir imagen","","error");return;}}
  const{error}=await supabase.from("profiles").update({qr_cobro_url:qr_url,qr_metodo:v.metodo,qr_verificado:true,qr_subido_at:new Date().toISOString()}).eq("id",trabId);
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast(`QR de ${trabUsername} actualizado ✅`,"ok");
  trabajadores();
};

window.verQrTrabajador=(t)=>{
  if(!t?.qr_cobro_url) return;
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};
  Swal.fire({
    title:`QR — ${t.username}`,
    html:`<img src="${t.qr_cobro_url}" style="width:100%;max-height:300px;object-fit:contain;border-radius:10px;border:1px solid rgba(212,160,23,.2);margin-bottom:.85rem">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Método</div><div>${mlM[t.qr_metodo]||t.qr_metodo||"—"}</div></div>
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.15rem">Estado</div><div>${t.qr_verificado?'<span style="color:#22c55e">✅ Verificado</span>':'<span style="color:#f59e0b">⏳ Pendiente</span>'}</div></div>
    </div>`,
    showConfirmButton:false,showCloseButton:true,width:440,...swal$
  });
};

window.verificarQrTrab=async(trabId,trabUsername)=>{
  const r=await confirm$(`Verificar QR — ${trabUsername}`,"","✅ Verificar"); if(!r.isConfirmed) return;
  loading$();
  const{error}=await supabase.from("profiles").update({qr_verificado:true}).eq("id",trabId);
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast(`QR de ${trabUsername} verificado ✅`,"ok"); trabajadores();
};

window.toggleTrab=async(id,estado,nombre)=>{
  const r=await confirm$(`${estado==="suspendido"?"Suspender":"Activar"} a ${nombre}`,"","Confirmar");if(!r.isConfirmed) return;
  loading$();await supabase.from("profiles").update({estado}).eq("id",id);Swal.close();
  toast(estado==="suspendido"?`${nombre} suspendido`:`${nombre} activado`,estado==="suspendido"?"err":"ok");trabajadores();
};

window.deleteTrab=async(id,nombre)=>{
  const r=await confirm$(`Eliminar a ${nombre}`,"<strong style='color:#f87171'>Esta acción no se puede deshacer.</strong>","Eliminar");if(!r.isConfirmed) return;
  loading$();await supabase.from("profiles").delete().eq("id",id);Swal.close();
  toast("Trabajador eliminado","warn");trabajadores();
};

/* ════════════════════════════════════════
   CATÁLOGO DE PREMIOS
════════════════════════════════════════ */
async function premios_catalogo() {
  setActive("premios_catalogo"); setCurrentView("premios_catalogo"); loadingView();
  const{data}=await supabase.from("prizes").select("*").order("created_at",{ascending:false});
  MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-award-fill"></i>Catálogo de premios</div><div class="ph-sub">${data?.length||0} premio${data?.length!==1?"s":""}</div></div><button class="btn btn-red btn-md" onclick="modalNuevoPremio()"><i class="bi bi-plus-lg"></i> Nuevo premio</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem">
      ${!data?.length?`<div class="panel" style="grid-column:1/-1"><div class="panel-body"><div class="empty"><i class="bi bi-award"></i><p>Sin premios aún</p></div></div></div>`:
      data.map(p=>`<div class="panel" style="overflow:hidden">
        ${p.imagen_url?`<img src="${p.imagen_url}" alt="${p.nombre}" style="width:100%;height:155px;object-fit:cover;border-bottom:1px solid var(--border)">`:`<div style="height:90px;background:rgba(139,26,26,.08);display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--border)"><i class="bi bi-image" style="font-size:2rem;color:var(--dim)"></i></div>`}
        <div class="panel-body">
          <div style="font-family:'Oswald',sans-serif;font-size:.95rem;font-weight:600;color:#fff;margin-bottom:.2rem">${p.nombre}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-bottom:.75rem">${p.descripcion||"Sin descripción"}</div>
          <div style="display:flex;align-items:center;justify-content:space-between">${badge(p.estado)}<button class="btn btn-danger btn-sm" onclick="deletePremio('${p.id}','${p.nombre}')"><i class="bi bi-trash"></i></button></div>
        </div>
      </div>`).join("")}
    </div>`;
}

window.modalNuevoPremio=async()=>{
  const{value:v}=await Swal.fire({title:"Nuevo Premio",html:`<div style="text-align:left"><div class="field" style="margin-bottom:.85rem"><label>Nombre *</label><input id="pN" class="swal2-input" placeholder="ej. iPhone 15 Pro" style="margin:0;width:100%"></div><div class="field" style="margin-bottom:.85rem"><label>Descripción</label><input id="pD" class="swal2-input" placeholder="Opcional" style="margin:0;width:100%"></div><div class="field"><label>Imagen</label><input type="file" id="pF" accept="image/*" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem"><img id="pPrev" style="display:none;width:100%;max-height:130px;object-fit:contain;margin-top:.5rem;border-radius:8px"></div></div>`,showCancelButton:true,confirmButtonText:"Guardar",width:500,...swal$,
    didOpen:()=>{document.getElementById("pF").addEventListener("change",e=>{const f=e.target.files[0];if(f){const r2=new FileReader();r2.onload=ev=>{const i=document.getElementById("pPrev");i.src=ev.target.result;i.style.display="block"};r2.readAsDataURL(f)}});},
    preConfirm:()=>{const n=document.getElementById("pN").value.trim();if(!n){Swal.showValidationMessage("Nombre obligatorio");return false;}return{nombre:n,descripcion:document.getElementById("pD").value.trim(),file:document.getElementById("pF").files[0]};}
  });
  if(!v) return;
  loading$();
  let imagen_url=null;
  if(v.file){try{imagen_url=await uploadFile(v.file,"el-padrino/premios");}catch{Swal.close();ok$("Error al subir imagen","","error");return;}}
  const{error}=await supabase.from("prizes").insert({nombre:v.nombre,descripcion:v.descripcion,imagen_url,estado:"activo"});
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast("Premio guardado ✅","ok"); premios_catalogo();
};
window.deletePremio=async(id,nombre)=>{
  const r=await confirm$(`Eliminar "${nombre}"`,"No se puede deshacer.","Eliminar");if(!r.isConfirmed) return;
  loading$();await supabase.from("prizes").delete().eq("id",id);Swal.close();
  toast("Premio eliminado","warn"); premios_catalogo();
};

/* ════════════════════════════════════════
   CONFIGURACIÓN
════════════════════════════════════════ */
async function configuracion() {
  setActive("configuracion"); setCurrentView("configuracion"); loadingView();

  const[{data:adminProf},{data:games}]=await Promise.all([
    supabase.from("profiles").select("qr_cobro_url,qr_metodo,qr_verificado,username,email").eq("id",user.id).single(),
    supabase.from("games").select("id,nombre,precio_boleto,capacidad_max,estado,imagen_url,visible,auto_siguiente_ronda").order("nombre"),
  ]);

  const mlM={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};

  MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-gear-fill"></i>Configuración</div><div class="ph-sub">Ajustes del sistema y del administrador</div></div></div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-qr-code"></i>Mi QR de cobros (Admin)</div></div>
      <div class="panel-body">
        ${adminProf?.qr_cobro_url?`
        <div style="display:flex;align-items:flex-start;gap:1.2rem;flex-wrap:wrap">
          <img src="${adminProf.qr_cobro_url}" style="max-width:160px;border-radius:10px;border:2px solid rgba(212,160,23,.3);cursor:pointer" onclick="window.open('${adminProf.qr_cobro_url}','_blank')">
          <div>
            <div style="font-family:'Oswald',sans-serif;font-size:1rem;color:#fff;margin-bottom:.4rem">QR activo</div>
            <div style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">Método: <strong>${mlM[adminProf.qr_metodo]||adminProf.qr_metodo||"—"}</strong> · Estado: <strong style="${adminProf.qr_verificado?"color:#22c55e":"color:#f59e0b"}">${adminProf.qr_verificado?"✅ Verificado":"⏳ Pendiente"}</strong></div>
            <div style="font-size:.78rem;color:var(--muted);margin-bottom:.85rem">Los usuarios ven este QR al pagar sus boletos.</div>
            <button class="btn btn-gold btn-md" onclick="modalActualizarQRAdmin()"><i class="bi bi-arrow-repeat"></i> Actualizar QR</button>
          </div>
        </div>`:`
        <div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">Sin QR de admin configurado</div><div class="fondo-alert-sub">Los usuarios no podrán pagar. Configura uno ahora.</div></div></div>
        <button class="btn btn-gold btn-md" onclick="modalActualizarQRAdmin()"><i class="bi bi-upload"></i> Configurar QR</button>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-ticket-perforated-fill"></i>Sorteos — Edición rápida</div>
        <button class="btn btn-red btn-sm" onclick="modalNuevoSorteo()"><i class="bi bi-plus-lg"></i> Nuevo sorteo</button>
      </div>
      <div class="panel-body">
        ${!games?.length?`<div class="empty"><i class="bi bi-ticket-perforated"></i><p>Sin sorteos</p></div>`:`
        <div style="display:flex;flex-direction:column;gap:.5rem">
          ${games.map(g=>{
            const modo=getModoGanadores(getCapacidad(g));
            const theme=getSorteoTheme(g.nombre||"");
            return `<div class="cfg-row">
              <div style="display:flex;align-items:center;gap:.75rem;min-width:0">
                <div style="width:40px;height:32px;border-radius:6px;overflow:hidden;flex-shrink:0;position:relative;background:${theme.gradient}">
                  ${g.imagen_url?`<img src="${g.imagen_url}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none'">`:`<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.1rem">${theme.icon}</div>`}
                </div>
                <div style="min-width:0">
                  <div class="cfg-lbl" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.nombre}</div>
                  <div class="cfg-sub">${badge(g.estado)} <span style="margin-left:.3rem;color:var(--dim);font-size:.72rem">${fmtMoney(g.precio_boleto||0)}/boleto · ${getCapacidad(g)} cupos · ${modo===1?"1 ganador":"3 ganadores"}</span></div>
                </div>
              </div>
              <div class="cfg-right">
                <button class="btn btn-ghost btn-sm" onclick="modalEditarSorteo('${g.id}')"><i class="bi bi-pencil"></i> Editar</button>
              </div>
            </div>`;
          }).join("")}
        </div>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-key-fill"></i>Seguridad</div></div>
      <div class="panel-body">
        <div class="cfg-row"><div><div class="cfg-lbl">Contraseña de administrador</div><div class="cfg-sub">Cambia tu contraseña de acceso</div></div><button class="btn btn-dark btn-md" onclick="modalCambiarPasswordAdmin()"><i class="bi bi-key"></i> Cambiar</button></div>
        <div class="cfg-row"><div><div class="cfg-lbl">Sesión activa</div><div class="cfg-sub">${adminProf?.email||"—"}</div></div><button class="btn btn-danger btn-md" onclick="doLogout()"><i class="bi bi-box-arrow-right"></i> Cerrar sesión</button></div>
      </div>
    </div>`;
}

window.modalActualizarQRAdmin=async()=>{
  const METODOS=[{value:"tigo_money",label:"Tigo Money"},{value:"billetera_bcb",label:"Billetera BCB"},{value:"qr_simple",label:"QR Interbank"},{value:"efectivo_cuenta",label:"Cuenta bancaria"}];
  const{data:curr}=await supabase.from("profiles").select("qr_metodo").eq("id",user.id).single();
  const{value:v}=await Swal.fire({
    title:"Actualizar QR de admin",
    html:`<div style="text-align:left">
      <div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.2);border-radius:9px;padding:.7rem .9rem;margin-bottom:1rem;font-size:.82rem;color:var(--muted)"><i class="bi bi-info-circle" style="color:var(--gold2)"></i> Este QR es el que ven los usuarios al pagar boletos.</div>
      <div class="field" style="margin-bottom:.9rem"><label>Tipo *</label><select id="qrM" style="width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">${METODOS.map(m=>`<option value="${m.value}"${m.value===(curr?.qr_metodo||"")?" selected":""}>${m.label}</option>`).join("")}</select></div>
      <div class="field"><label>Imagen del QR *</label><input type="file" id="qrFileAdmin" accept="image/jpeg,image/png" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem"><img id="qrPrevAdmin" style="display:none;width:100%;max-height:150px;object-fit:contain;margin-top:.55rem;border-radius:8px"></div>
    </div>`,
    showCancelButton:true,confirmButtonText:"Guardar QR",width:480,...swal$,
    didOpen:()=>{document.getElementById("qrFileAdmin").addEventListener("change",e=>{const f=e.target.files[0];if(f){const r2=new FileReader();r2.onload=ev=>{const i=document.getElementById("qrPrevAdmin");i.src=ev.target.result;i.style.display="block"};r2.readAsDataURL(f)}});},
    preConfirm:()=>{const metodo=document.getElementById("qrM").value;const file=document.getElementById("qrFileAdmin").files[0];if(!file){Swal.showValidationMessage("Selecciona la imagen del QR");return false;}if(file.size>5*1024*1024){Swal.showValidationMessage("Máx. 5 MB");return false;}return{metodo,file};}
  });
  if(!v) return;
  loading$("Subiendo QR...");
  let qr_url;
  try{qr_url=await uploadFile(v.file,"el-padrino/qr-cobros");}catch{Swal.close();ok$("Error al subir imagen","","error");return;}
  const{error}=await supabase.from("profiles").update({qr_cobro_url:qr_url,qr_metodo:v.metodo,qr_verificado:true,qr_subido_at:new Date().toISOString()}).eq("id",user.id);
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast("QR de admin actualizado ✅","ok"); configuracion();
};

window.modalCambiarPasswordAdmin=async()=>{
  const{value:v}=await Swal.fire({title:"Cambiar contraseña",html:`<div style="text-align:left"><div class="field" style="margin-bottom:.85rem"><label>Nueva contraseña *</label><input id="pwN" type="password" class="swal2-input" placeholder="Mín. 6 caracteres" style="margin:0;width:100%"></div><div class="field"><label>Confirmar *</label><input id="pwC" type="password" class="swal2-input" placeholder="Repite la contraseña" style="margin:0;width:100%"></div></div>`,showCancelButton:true,confirmButtonText:"Cambiar",...swal$,preConfirm:()=>{const n=document.getElementById("pwN").value,c=document.getElementById("pwC").value;if(n.length<6){Swal.showValidationMessage("Mínimo 6 caracteres");return false;}if(n!==c){Swal.showValidationMessage("Las contraseñas no coinciden");return false;}return{password:n};}});
  if(!v) return;
  loading$(); const{error}=await supabase.auth.updateUser({password:v.password}); Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast("Contraseña actualizada ✅","ok");
};

/* ════════════════════════════════════════
   ARRANQUE
════════════════════════════════════════ */
/* ════════════════════════════════════════
   CSS INYECTADO — Drawer, Menú3, Premios Cards
════════════════════════════════════════ */
(function injectAdminCSS() {
  if(document.getElementById('admin-extra-css')) return;
  const s = document.createElement('style');
  s.id = 'admin-extra-css';
  s.textContent = `
    /* ══ Sorteo oculto ══ */
    .sorteo-oculto { opacity:.7; filter:saturate(.6); }
    .scard-vis-ribbon {
      display:flex;align-items:center;gap:.35rem;
      font-family:'Oswald',sans-serif;font-size:.64rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
      background:rgba(139,26,26,.22);border-bottom:1px solid rgba(139,26,26,.3);color:#f87171;
      padding:.26rem .85rem;
    }

    /* ══ Footer de acciones de la tarjeta ══ */
    .scf-btn {
      display:inline-flex;align-items:center;gap:.3rem;
      font-family:'Oswald',sans-serif;font-size:.75rem;font-weight:600;letter-spacing:.06em;
      border:none;border-radius:6px;cursor:pointer;padding:.35rem .72rem;transition:all .15s;
      white-space:nowrap;position:relative;
    }
    .scf-blue { background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.28); }
    .scf-blue:hover { background:rgba(99,102,241,.28); }
    .scf-ghost { background:rgba(212,160,23,.09);color:var(--gold2);border:1px solid rgba(212,160,23,.22); }
    .scf-ghost:hover { background:rgba(212,160,23,.2); }
    .scf-gold { background:var(--gold2);color:#1a1209;font-weight:700; }
    .scf-gold:hover { background:var(--gold3); }
    .scf-muted { background:rgba(255,255,255,.06);color:var(--cream);border:1px solid rgba(255,255,255,.08); }
    .scf-muted:hover { background:rgba(255,255,255,.12); }
    .scf-red { background:rgba(139,26,26,.18);color:#f87171;border:1px solid rgba(139,26,26,.3); }
    .scf-red:hover { background:rgba(139,26,26,.32); }

    /* ══ Fila de gestión (editar, visibilidad, historial, eliminar) ══ */
    .sorteo-card-mgmt {
      display:flex;align-items:center;gap:0;
      border-top:1px solid var(--border);
      background:rgba(0,0,0,.2);
      overflow:hidden;border-radius:0 0 12px 12px;
    }
    .scm-btn {
      flex:1;display:flex;align-items:center;justify-content:center;gap:.3rem;
      font-family:'Oswald',sans-serif;font-size:.71rem;font-weight:600;letter-spacing:.05em;
      border:none;border-right:1px solid rgba(255,255,255,.05);
      cursor:pointer;padding:.5rem .3rem;transition:background .14s;
      white-space:nowrap;
    }
    .scm-btn:last-child { border-right:none; }
    .scm-primary { color:var(--gold2);background:transparent; }
    .scm-primary:hover { background:rgba(212,160,23,.12); }
    .scm-green { color:#22c55e;background:transparent; }
    .scm-green:hover { background:rgba(34,197,94,.12); }
    .scm-ghost { color:var(--muted);background:transparent; }
    .scm-ghost:hover { background:rgba(255,255,255,.05);color:var(--cream); }
    .scm-danger { color:#f87171;background:transparent; }
    .scm-danger:hover { background:rgba(139,26,26,.2); }
    .scm-btn i { font-size:.75rem; }

    /* ══ DRAWER EDITAR SORTEO ══ */
    .sorteo-drawer { position:fixed;inset:0;z-index:900;pointer-events:none; }
    .sorteo-drawer.open { pointer-events:auto; }
    .sorteo-drawer-overlay { position:absolute;inset:0;background:rgba(0,0,0,.6);opacity:0;transition:opacity .3s;backdrop-filter:blur(4px); }
    .sorteo-drawer.open .sorteo-drawer-overlay { opacity:1; }
    .sorteo-drawer-panel {
      position:absolute;top:0;right:0;bottom:0;
      width:100%;max-width:460px;
      background:var(--ink2);border-left:1px solid var(--border);
      display:flex;flex-direction:column;
      transform:translateX(100%);transition:transform .32s cubic-bezier(.4,0,.2,1);
    }
    .sorteo-drawer.open .sorteo-drawer-panel { transform:translateX(0); }
    .sorteo-drawer-header { height:112px;position:relative;flex-shrink:0;overflow:hidden; }
    .sdh-overlay { position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.1),rgba(0,0,0,.72)); }
    .sdh-content { position:absolute;inset:0;padding:.85rem 1rem .75rem;display:flex;flex-direction:column;justify-content:flex-end; }
    .sorteo-drawer-close {
      width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.2);
      color:#fff;display:flex;align-items:center;justify-content:center;font-size:.85rem;cursor:pointer;transition:background .18s;flex-shrink:0;
    }
    .sorteo-drawer-close:hover { background:rgba(139,26,26,.6); }
    .sorteo-drawer-body { flex:1;overflow-y:auto;padding:1rem 1.1rem;-webkit-overflow-scrolling:touch; }
    .sorteo-drawer-footer {
      padding:.85rem 1.1rem;border-top:1px solid var(--border);background:rgba(0,0,0,.15);
      display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-shrink:0;
    }
    .sdb-section { margin-bottom:1.1rem; }
    .sdb-section-title {
      font-family:'Oswald',sans-serif;font-size:.7rem;font-weight:600;letter-spacing:.18em;
      text-transform:uppercase;color:var(--gold2);margin-bottom:.5rem;display:flex;align-items:center;gap:.35rem;
    }
    .sdb-label {
      display:block;font-family:'Oswald',sans-serif;font-size:.68rem;letter-spacing:.14em;
      text-transform:uppercase;color:var(--muted);margin-bottom:.3rem;
    }
    .sdb-input {
      width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);
      border-radius:7px;padding:.5rem .82rem;font-size:.92rem;outline:none;transition:border-color .18s;font-family:inherit;
    }
    .sdb-input:focus { border-color:var(--gold2); }
    .sdb-select {
      width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);
      border-radius:7px;padding:.5rem .82rem;font-size:.92rem;outline:none;cursor:pointer;
    }

    /* ══ ENVIAR PREMIOS — diseño limpio ══ */
    .ep-section-title {
      font-family:'Oswald',sans-serif;font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;
      color:var(--muted);margin-bottom:.75rem;
    }
    .ep-grid {
      display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));
      gap:1.1rem;margin-bottom:.5rem;
    }
    .ep-ronda-card {
      background:var(--ink2);border:1px solid var(--border);border-radius:13px;overflow:hidden;
      transition:box-shadow .2s,border-color .2s;
    }
    .ep-ronda-card:hover { box-shadow:0 6px 24px rgba(0,0,0,.38); }
    .ep-ronda-header {
      height:88px;position:relative;overflow:hidden;
    }
    .ep-ronda-header-overlay {
      position:absolute;inset:0;
      background:linear-gradient(to bottom,rgba(0,0,0,.05) 0%,rgba(0,0,0,.72) 100%);
    }
    .ep-ronda-header-body {
      position:absolute;inset:0;padding:.65rem .9rem;
      display:flex;align-items:flex-end;justify-content:space-between;gap:.5rem;
    }
    .ep-ronda-nombre { font-family:'Oswald',sans-serif;font-size:.98rem;font-weight:700;color:#fff; }
    .ep-ronda-sub { font-size:.7rem;color:rgba(255,255,255,.65);margin-top:.1rem; }
    .ep-ganadores-list { padding:.7rem .85rem;display:flex;flex-direction:column;gap:.5rem; }
    .ep-ganador {
      border-radius:9px;overflow:hidden;border:1px solid var(--border);
    }
    .ep-g-pendiente { background:var(--ink3);border-color:rgba(245,158,11,.2); }
    .ep-g-pagado { background:rgba(34,197,94,.04);border-color:rgba(34,197,94,.2); }
    .ep-g-meta {
      display:flex;align-items:center;gap:.55rem;padding:.6rem .75rem;
    }
    .ep-g-emoji { font-size:1.2rem;flex-shrink:0;line-height:1; }
    .ep-g-av {
      width:24px;height:24px;border-radius:50%;flex-shrink:0;
      background:linear-gradient(135deg,var(--red),var(--gold2));
      display:flex;align-items:center;justify-content:center;
      font-family:'Oswald',sans-serif;font-size:.7rem;font-weight:700;color:#fff;
    }
    .ep-g-info { flex:1;min-width:0; }
    .ep-g-nombre { font-family:'Oswald',sans-serif;font-size:.9rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .ep-g-lugar { font-size:.68rem;color:var(--muted);margin-top:.05rem; }
    .ep-g-monto { text-align:right;flex-shrink:0; }
    .ep-btn-pagar {
      display:flex;align-items:center;justify-content:center;gap:.45rem;width:100%;
      padding:.5rem .75rem;background:linear-gradient(135deg,#1a0d02,var(--red));
      border:none;color:#fff;font-family:'Oswald',sans-serif;font-size:.82rem;
      font-weight:700;letter-spacing:.08em;cursor:pointer;transition:opacity .18s;
      border-top:1px solid rgba(139,26,26,.25);
    }
    .ep-btn-pagar:hover { opacity:.88; }
    .ep-btn-pagar i { font-size:.9rem;color:var(--gold2); }

    @media(max-width:768px) {
      .sorteo-drawer-panel { max-width:100%; }
      .ep-grid { grid-template-columns:1fr; }
      .scm-btn { font-size:.65rem;padding:.45rem .2rem; }
      .scf-btn { font-size:.71rem;padding:.3rem .55rem; }
    }
    @media(max-width:480px) {
      .sorteo-card-mgmt { flex-wrap:wrap; }
      .scm-btn { flex:1 1 45%;border-right:none;border-top:1px solid rgba(255,255,255,.05); }
      .scm-btn:nth-child(odd) { border-right:1px solid rgba(255,255,255,.05); }
    }
  `;
  document.head.appendChild(s);
})();

initRealtime();
updateSidebarBadges();
dashboard();
