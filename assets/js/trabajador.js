import { supabase } from "./supabase.js";
import { realizarSorteo as calcSorteo, nombreCaso } from "./logica_juego.js";
import { uploadFile } from "./cloudinary.js";

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
const MC  = () => document.getElementById("mainContent");
const $id = id => document.getElementById(id);

const swal$ = { background:'#131009', color:'#e6dcc8', confirmButtonColor:'#8b1a1a', cancelButtonColor:'#221c14' };

/* ── Notif stack (in-app) ── */
function notif(msg, tipo="ok", dur=3200) {
  const stack=$id("notifStack"); if(!stack) return;
  const ico={ok:"bi-check-circle-fill",err:"bi-x-circle-fill",warn:"bi-exclamation-triangle-fill",info:"bi-info-circle-fill"}[tipo]||"bi-info-circle-fill";
  const el=document.createElement("div");
  el.className=`notif-item notif-${tipo}`;
  el.innerHTML=`<i class="bi ${ico}"></i><span>${msg}</span>`;
  stack.appendChild(el);
  setTimeout(()=>{el.style.opacity="0";el.style.transition="opacity .3s";setTimeout(()=>el.remove(),350)},dur);
}

const toast  = (msg,t="ok") => notif(msg,t);
const swalToast=(title,icon="success")=>Swal.fire({title,icon,toast:true,position:"top-end",showConfirmButton:false,timer:2800,timerProgressBar:true,background:'#1b1610',color:'#e6dcc8',iconColor:icon==="success"?"#22c55e":icon==="error"?"#f87171":"#d4a017"});
const confirm$=(title,html,confirmText="Confirmar")=>Swal.fire({title,html,icon:"warning",showCancelButton:true,confirmButtonText:confirmText,cancelButtonText:"Cancelar",...swal$});
const loading$=(text="Procesando...")=>Swal.fire({title:text,allowOutsideClick:false,showConfirmButton:false,didOpen:()=>Swal.showLoading(),...swal$});
const ok$=(title,html="",icon="success")=>Swal.fire({title,html,icon,confirmButtonText:"OK",...swal$});

const fmtDate  = d => { try{return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return"—"} };
const fmtShort = d => { try{return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric"})}catch{return"—"} };
const fmtMoney = n => `Bs ${Number(n||0).toFixed(2)}`;

function badge(est) {
  const m={pendiente:["bdg bdg-p","⏳ Pendiente"],aprobado:["bdg bdg-ok","✓ Aprobado"],rechazado:["bdg bdg-bad","✗ Rechazado"],activo:["bdg bdg-ok","Activo"],suspendido:["bdg bdg-bad","Suspendido"],abierta:["bdg bdg-open","Abierta"],cerrada:["bdg bdg-closed","Cerrada"],sorteada:["bdg bdg-win","✓ Sorteada"],ganada:["bdg bdg-win","🏆 Ganador"],perdida:["bdg bdg-bad","Perdida"]};
  const[cls,lbl]=m[est]||["bdg bdg-p",est];
  return`<span class="${cls}">${lbl}</span>`;
}
const badgeMetodo=m=>m==="gratis"?`<span class="bdg bdg-free"><i class="bi bi-gift-fill"></i> Gratis</span>`:`<span style="font-size:.82rem;color:var(--muted)">${m||"—"}</span>`;

function initDT(id,opts={}) {
  setTimeout(()=>{
    try{
      if(window.jQuery&&window.jQuery.fn.DataTable){
        if(window.jQuery.fn.DataTable.isDataTable(`#${id}`))window.jQuery(`#${id}`).DataTable().destroy();
        window.jQuery(`#${id}`).DataTable({language:{search:"Buscar:",lengthMenu:"Mostrar _MENU_",info:"_START_–_END_ de _TOTAL_",paginate:{previous:"‹",next:"›"},zeroRecords:"Sin resultados",emptyTable:"Sin datos"},pageLength:10,...opts});
      }
    }catch(e){console.warn("DT err:",e);}
  },80);
}

function loadingView(){MC().innerHTML=`<div class="spin-wrap"><div class="spinner"></div></div>`;}
function setActive(v){document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===v));}

window.__back=null;
function renderBackBtn(lbl,fn){window.__back=fn;return`<button class="btn btn-dark btn-md" onclick="window.__back()"><i class="bi bi-arrow-left"></i> ${lbl}</button>`;}

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
const{data:{user},error:authErr}=await supabase.auth.getUser();
if(authErr||!user){window.location.href="../../auth/login.html";throw 0;}

const{data:me,error:meErr}=await supabase.from("profiles").select("username,rol,estado,qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at").eq("id",user.id).single();
if(meErr||!me||me.estado!=="activo"||me.rol!=="trabajador"){await supabase.auth.signOut();window.location.href="../../auth/login.html";throw 0;}

const ini=(me.username||"?")[0].toUpperCase();
if($id("tbName"))  $id("tbName").textContent=me.username;
if($id("sbName"))  $id("sbName").textContent=me.username;
if($id("sbAv"))    $id("sbAv").textContent=ini;

// Estado QR local
let myQR={subido:!!me.qr_cobro_url,verificado:!!me.qr_verificado,url:me.qr_cobro_url||null,metodo:me.qr_metodo||null,subidoAt:me.qr_subido_at||null};

/* ════════════════════════════════════════
   LOGOUT
════════════════════════════════════════ */
async function doLogout(){
  const r=await confirm$("¿Cerrar sesión?","","Sí, salir");
  if(r.isConfirmed){await supabase.auth.signOut();window.location.href="../../auth/login.html";}
}
$id("logoutBtn") &&$id("logoutBtn").addEventListener("click",doLogout);
$id("logoutBtn2")&&$id("logoutBtn2").addEventListener("click",doLogout);

/* ════════════════════════════════════════
   SIDEBAR STATS
════════════════════════════════════════ */
async function loadSidebarStats(){
  try{
    const[{count:pend},{count:rondas},{count:aprobados},{count:gratisDisp}]=await Promise.all([
      supabase.from("payments").select("*",{count:"exact",head:true}).eq("estado","pendiente"),
      supabase.from("rounds").select("*",{count:"exact",head:true}).eq("estado","abierta"),
      supabase.from("payments").select("*",{count:"exact",head:true}).eq("estado","aprobado").eq("revisado_por",user.id),
      supabase.from("boletos_gratis").select("*",{count:"exact",head:true}).eq("usado",false),
    ]);
    const set=(id,v)=>{const el=$id(id);if(el)el.textContent=v??0;};
    set("sbPend",pend);set("sbRondas",rondas);set("sbAprobados",aprobados);set("sbBoletosGratis",gratisDisp);
    const setB=(id,v)=>{const el=$id(id);if(el){el.textContent=v??0;el.style.display=(v??0)>0?"inline-flex":"none";}};
    setB("navBadgePend",pend);setB("navBadgeGratis",gratisDisp);
  }catch(e){console.warn("stats:",e);}
}

/* ════════════════════════════════════════
   ROUTER
════════════════════════════════════════ */
const views={dashboard,sorteos,comprobantes:comprobantesGlobal,ganadores,historial,fidelidad:fidelidadView,configuracion};
window.__setView=v=>{setActive(v);window.__back=null;views[v]?.();};
document.querySelectorAll(".nav-item[data-view]").forEach(btn=>btn.addEventListener("click",()=>window.__setView(btn.dataset.view)));

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
async function dashboard(){
  setActive("dashboard");loadingView();
  try{
    const[{count:totalPend},{count:rondasAbiertas},{count:aprobadosPorMi},{data:recientes},{data:rondasData},{count:gratisDisp}]=await Promise.all([
      supabase.from("payments").select("*",{count:"exact",head:true}).eq("estado","pendiente"),
      supabase.from("rounds").select("*",{count:"exact",head:true}).eq("estado","abierta"),
      supabase.from("payments").select("*",{count:"exact",head:true}).eq("estado","aprobado").eq("revisado_por",user.id),
      supabase.from("payments").select("id,monto,metodo,estado,boletos_solicitados,created_at,profiles!payments_user_id_fkey(username),rounds(id,numero,games(nombre))").eq("estado","pendiente").order("created_at",{ascending:true}).limit(8),
      supabase.from("rounds").select("id,numero,estado,games(nombre)").eq("estado","abierta").order("created_at",{ascending:false}).limit(5),
      supabase.from("boletos_gratis").select("*",{count:"exact",head:true}).eq("usado",false),
    ]);

    const rondasConCupos=await Promise.all((rondasData||[]).map(async r=>{
      const{data:b}=await supabase.from("participations").select("boletos").eq("round_id",r.id);
      return{...r,cupos:(b||[]).reduce((s,x)=>s+(x.boletos||1),0)};
    }));

    const pagosGratis=(recientes||[]).filter(p=>p.metodo==="gratis");
    window.__dashPayMap={};(recientes||[]).forEach(p=>{window.__dashPayMap[p.id]=p;});

    // Alerta QR propio del trabajador
    const qrAlerta=!myQR.subido?`<div class="fondo-alert warn"><i class="bi bi-qr-code-scan"></i>
      <div><div class="fondo-alert-title">Sin QR de cobros configurado</div>
      <div class="fondo-alert-sub">Necesitas subir tu QR para que el administrador pueda pagarte tu sueldo.</div></div>
      <button class="btn btn-gold btn-sm" style="margin-left:auto" onclick="window.__setView('configuracion')"><i class="bi bi-arrow-right"></i> Configurar</button>
    </div>`:!myQR.verificado?`<div class="fondo-alert info"><i class="bi bi-hourglass-split"></i>
      <div><div class="fondo-alert-title">QR en espera de verificación</div>
      <div class="fondo-alert-sub">El administrador revisará y verificará tu QR de cobros pronto.</div></div>
    </div>`:"";

    MC().innerHTML=`
    <div class="ph">
      <div><div class="ph-title"><i class="bi bi-speedometer2"></i>Dashboard</div><div class="ph-sub">${new Date().toLocaleDateString("es-BO",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div></div>
      <button class="btn btn-dark btn-sm" onclick="loadSidebarStats();dashboard()"><i class="bi bi-arrow-clockwise"></i> Refrescar</button>
    </div>

    ${qrAlerta}

    ${(totalPend??0)>0?`<div class="fondo-alert warn" style="cursor:pointer" onclick="window.__setView('comprobantes')">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <div><div class="fondo-alert-title">${totalPend} comprobante${totalPend!==1?"s":""} pendiente${totalPend!==1?"s":""}</div>
      <div class="fondo-alert-sub">Revisa y aprueba los comprobantes para que los usuarios participen.</div></div>
      <button class="btn btn-gold btn-sm" style="margin-left:auto" onclick="event.stopPropagation();window.__setView('comprobantes')">Revisar →</button>
    </div>`:`<div class="fondo-alert good"><i class="bi bi-check-circle-fill"></i><div><div class="fondo-alert-title">¡Todo al día! Sin comprobantes pendientes.</div></div></div>`}

    ${pagosGratis.length>0?`<div class="fondo-alert purple"><i class="bi bi-gift-fill"></i>
      <div><div class="fondo-alert-title">${pagosGratis.length} inscripción${pagosGratis.length!==1?"es":""} con boleto gratis</div>
      <div class="fondo-alert-sub">Confirma las participaciones con boleto de fidelidad pendientes.</div></div>
      <button class="btn btn-purple btn-sm" style="margin-left:auto" onclick="window.__setView('comprobantes')">Ver →</button>
    </div>`:""}

    <div class="stat-grid">
      <div class="sc sc-click" onclick="window.__setView('comprobantes')">
        <div class="sc-bar r"></div><span class="sc-icon">⏳</span>
        <div class="sc-val ${(totalPend??0)>0?"red":""}">${totalPend??0}</div><div class="sc-lbl">Pendientes</div>
        ${(totalPend??0)>0?`<div class="sc-sub" style="color:#f59e0b">Clic para revisar</div>`:""}
      </div>
      <div class="sc"><div class="sc-bar g"></div><span class="sc-icon">🎟️</span><div class="sc-val gold">${rondasAbiertas??0}</div><div class="sc-lbl">Rondas abiertas</div></div>
      <div class="sc"><div class="sc-bar gr"></div><span class="sc-icon">✅</span><div class="sc-val green">${aprobadosPorMi??0}</div><div class="sc-lbl">Aprobé hoy</div></div>
      <div class="sc"><div class="sc-bar p"></div><span class="sc-icon">🎁</span><div class="sc-val purple">${gratisDisp??0}</div><div class="sc-lbl">Gratis activos</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.1rem" id="dashGrid">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="bi bi-hourglass-split"></i>Comprobantes urgentes</div><button class="btn btn-ghost btn-sm" onclick="window.__setView('comprobantes')">Ver todos →</button></div>
        <div class="panel-body">
          ${!(recientes?.length)?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin pendientes. ¡Todo al día!</p></div>`
          :recientes.map(p=>`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid rgba(139,26,26,.07)">
            <div style="display:flex;align-items:center;gap:.55rem;min-width:0">
              <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--gold2));display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:.8rem;font-weight:700;color:#fff;flex-shrink:0">${(p.profiles?.username||"?")[0].toUpperCase()}</div>
              <div style="min-width:0">
                <div style="font-size:.88rem;font-weight:600;display:flex;align-items:center;gap:.3rem">${p.profiles?.username||"—"}${p.metodo==="gratis"?`<span class="bdg bdg-free" style="font-size:.58rem"><i class="bi bi-gift-fill"></i></span>`:""}</div>
                <div style="font-size:.73rem;color:var(--muted)">${p.rounds?.games?.nombre||"Sorteo"} R${p.rounds?.numero||"?"} · ${p.boletos_solicitados||1} boleto${(p.boletos_solicitados||1)!==1?"s":""}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:.4rem;flex-shrink:0">
              <span style="font-family:'Oswald',sans-serif;font-size:.88rem;color:${p.metodo==="gratis"?"var(--purple3)":"var(--gold2)"}">${p.metodo==="gratis"?"🎁":fmtMoney(p.monto)}</span>
              <button class="btn btn-success btn-sm" data-tip="Aprobar" onclick="window.__aprobarDesdeCard('${p.id}','${p.rounds?.id||""}')"><i class="bi bi-check-lg"></i></button>
              <button class="btn btn-ghost btn-sm" data-tip="Ver comprobante" onclick="verImagenDash('${p.id}')"><i class="bi bi-image"></i></button>
            </div>
          </div>`).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="bi bi-ticket-perforated-fill"></i>Rondas activas</div><button class="btn btn-ghost btn-sm" onclick="window.__setView('sorteos')">Ver sorteos →</button></div>
        <div class="panel-body">
          ${!rondasConCupos.length?`<div class="empty"><i class="bi bi-ticket-perforated"></i><p>Sin rondas abiertas</p></div>`
          :rondasConCupos.map(r=>{
            const pct=Math.round((r.cupos/25)*100);
            return`<div style="margin-bottom:.9rem">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.28rem">
                <span style="font-size:.88rem;font-weight:600;color:#fff">${r.games?.nombre||"—"} <span style="color:var(--muted)">R${r.numero}</span></span>
                <span style="font-family:'Oswald',sans-serif;font-size:.82rem;color:var(--gold2)">${r.cupos}/25${r.cupos>=25?" ✅":""}</span>
              </div>
              <div class="prog-bg"><div class="prog-fill${r.cupos>=25?" full":pct>=80?" almost":""}" style="width:${pct}%"></div></div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;

    if(window.innerWidth<700){const dg=$id("dashGrid");if(dg)dg.style.gridTemplateColumns="1fr";}
  }catch(e){
    console.error("dashboard:",e);
    MC().innerHTML=`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error al cargar.<br><button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="dashboard()"><i class="bi bi-arrow-clockwise"></i> Reintentar</button></p></div></div></div>`;
  }
}

/* ── Helper ver imagen desde dashboard ── */
window.verImagenDash=(id)=>{
  const p=window.__dashPayMap?.[id]; if(!p) return;
  Swal.fire({
    title:"Comprobante",
    html:`${p.comprobante_url?`<img src="${p.comprobante_url}" style="width:100%;max-height:280px;object-fit:contain;border-radius:8px;border:1px solid rgba(139,26,26,.22);margin-bottom:.8rem" onerror="this.style.display='none'">`:`<div style="text-align:center;padding:1.5rem;font-size:2rem">🎁<br><span style="font-size:.88rem;color:var(--muted)">Boleto de fidelidad — sin imagen</span></div>`}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left;font-size:.85rem">
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.15rem">Usuario</div><strong>${p.profiles?.username||"—"}</strong></div>
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.15rem">Monto</div><span style="color:${p.metodo==="gratis"?"var(--purple3)":"var(--gold2)"};">${p.metodo==="gratis"?"🎁 Gratis":fmtMoney(p.monto)}</span></div>
    </div>
    ${p.estado==="pendiente"?`<div style="margin-top:.8rem;display:flex;gap:.5rem;justify-content:center">
      <button class="btn btn-success btn-md" onclick="Swal.close();window.__aprobarDesdeCard('${p.id}','${p.rounds?.id||""}')"><i class="bi bi-check-lg"></i> Aprobar</button>
      <button class="btn btn-danger btn-md" onclick="Swal.close();window.__rechazarDesdeCard('${p.id}')"><i class="bi bi-x-lg"></i> Rechazar</button>
    </div>`:""}`,
    showConfirmButton:false,showCloseButton:true,width:480,...swal$
  });
};

/* ── Aprobar/Rechazar desde dashboard ── */
window.__aprobarDesdeCard=async(payId,roundId)=>{
  const pago0=window.__dashPayMap?.[payId];
  const esGratis=pago0?.metodo==="gratis";
  const r=await confirm$(esGratis?"Confirmar boleto gratis":"Aprobar pago",esGratis?"¿Confirmar inscripción con boleto de fidelidad?":"¿El comprobante es válido?",esGratis?"🎁 Confirmar":"✅ Aprobar");
  if(!r.isConfirmed) return;
  loading$();
  try{
    const{data:pago,error}=await supabase.from("payments").select("user_id,boletos_solicitados,round_id,metodo").eq("id",payId).single();
    if(error||!pago) throw error||new Error("No encontrado");
    const boletos=pago.boletos_solicitados||1;const rId=pago.round_id||roundId;
    if(pago.metodo==="gratis") await consumirBoletoGratis(pago.user_id,rId);
    await supabase.from("payments").update({estado:"aprobado",revisado_por:user.id}).eq("id",payId);
    const{data:pe}=await supabase.from("participations").select("id,boletos").eq("round_id",rId).eq("user_id",pago.user_id).maybeSingle();
    if(pe){await supabase.from("participations").update({boletos:(pe.boletos||1)+boletos}).eq("id",pe.id);}
    else{await supabase.from("participations").insert({round_id:rId,user_id:pago.user_id,boletos,resultado:"pendiente",es_gratis:pago.metodo==="gratis"});}
    Swal.close();
    toast(esGratis?`🎁 Boleto gratis confirmado`:`✅ Aprobado · ${boletos} boleto${boletos!==1?"s":""}`);
    await loadSidebarStats();dashboard();
  }catch(e){Swal.close();ok$("Error",e.message||"","error");}
};

window.__rechazarDesdeCard=async(payId)=>{
  const r=await confirm$("Rechazar","¿Rechazar este comprobante?","❌ Rechazar");if(!r.isConfirmed) return;
  loading$();
  await supabase.from("payments").update({estado:"rechazado",revisado_por:user.id}).eq("id",payId);
  Swal.close();toast("Pago rechazado","err");await loadSidebarStats();dashboard();
};

/* ════════════════════════════════════════
   HELPER consumir boleto gratis
════════════════════════════════════════ */
async function consumirBoletoGratis(userId,roundId){
  const{data:b}=await supabase.from("boletos_gratis").select("id").eq("user_id",userId).eq("usado",false).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(!b) return;
  await supabase.from("boletos_gratis").update({usado:true,usado_en_round:roundId,usado_at:new Date().toISOString()}).eq("id",b.id);
}

/* ════════════════════════════════════════
   SORTEOS
════════════════════════════════════════ */
async function sorteos(){
  setActive("sorteos");loadingView();
  try{
    const{data:games}=await supabase.from("games").select("*").eq("estado","activo").order("created_at",{ascending:false});
    const gamesData=await Promise.all((games||[]).map(async g=>{
      const{data:roundsData}=await supabase.from("rounds").select("id,numero,estado").eq("game_id",g.id).order("numero",{ascending:false});
      const ar=roundsData?.find(r=>r.estado==="abierta");const totalRondas=roundsData?.length??0;
      let cupos=0,compPend=0,gratisEnRonda=0;
      if(ar){
        const[{data:bRows},{count:cp},{count:gr}]=await Promise.all([
          supabase.from("participations").select("boletos").eq("round_id",ar.id),
          supabase.from("payments").select("*",{count:"exact",head:true}).eq("round_id",ar.id).eq("estado","pendiente"),
          supabase.from("participations").select("*",{count:"exact",head:true}).eq("round_id",ar.id).eq("es_gratis",true),
        ]);
        cupos=(bRows||[]).reduce((s,x)=>s+(x.boletos||1),0);compPend=cp??0;gratisEnRonda=gr??0;
      }
      return{...g,activeRound:ar,totalRondas,cupos,compPend,gratisEnRonda};
    }));

    MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-ticket-perforated-fill"></i>Sorteos</div><div class="ph-sub">Rondas activas · revisa comprobantes y sortea</div></div></div>
    ${!gamesData.length?`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-ticket-perforated"></i><p>Sin sorteos activos</p></div></div></div>`:`<div class="sorteo-grid">${gamesData.map(g=>{
      const ar=g.activeRound;const pct=ar?Math.round((g.cupos/25)*100):0;const lleno=ar&&g.cupos>=25;
      const gNom=(g.nombre||"").replace(/'/g,"\\'");
      return`<div class="sorteo-card">
        <div class="sorteo-card-head">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
            <div><h3>${g.nombre}</h3><p>${g.descripcion||"Sin descripción"}</p></div>
            ${badge(g.estado)}
          </div>
          <div style="margin-top:.5rem;font-size:.78rem;color:var(--muted);display:flex;align-items:center;gap:.6rem">
            <i class="bi bi-arrow-repeat"></i>${g.totalRondas} ronda${g.totalRondas!==1?"s":""}
            ${g.precio_boleto>0?`<span>·</span><i class="bi bi-tag"></i>${fmtMoney(g.precio_boleto)}/boleto`:""}
          </div>
        </div>
        <div class="sorteo-card-mid">
          ${ar?`<div class="prog-label"><span style="color:var(--muted)">Ronda #${ar.numero}</span><span class="prog-val">${g.cupos}/25 ${lleno?"✅":""}</span></div>
            <div class="prog-bg"><div class="prog-fill${lleno?" full":pct>=80?" almost":""}" style="width:${pct}%"></div></div>
            <div style="margin-top:.45rem;display:flex;gap:.5rem;flex-wrap:wrap;font-size:.77rem">
              ${g.compPend>0?`<span style="color:#f59e0b"><i class="bi bi-exclamation-triangle"></i> ${g.compPend} pendiente${g.compPend>1?"s":""}</span>`:""}
              ${g.gratisEnRonda>0?`<span style="color:var(--purple3)"><i class="bi bi-gift-fill"></i> ${g.gratisEnRonda} gratis</span>`:""}
            </div>`:`<div style="text-align:center;padding:.6rem 0;color:var(--muted);font-size:.87rem"><i class="bi bi-moon-stars"></i> Sin ronda activa</div>`}
        </div>
        <div class="sorteo-card-foot">
          <button class="btn btn-ghost btn-sm" data-tip="Ver historial de rondas" onclick="window.__verRondas('${g.id}','${gNom}')"><i class="bi bi-layers"></i> Rondas</button>
          ${ar?`
          <button class="btn btn-info btn-sm" data-tip="Ver participantes" onclick="window.__verParticipantes('${ar.id}','${gNom}','${ar.numero}')"><i class="bi bi-people"></i></button>
          <button class="btn btn-ghost btn-sm" data-tip="Ver comprobantes" onclick="window.__verComprobantes('${ar.id}','${gNom}','${ar.numero}')"><i class="bi bi-receipt"></i>${g.compPend>0?` <span style="background:var(--red2);color:#fff;border-radius:10px;padding:0 .35rem;font-size:.62rem">${g.compPend}</span>`:""}</button>
          ${lleno?`<button class="btn btn-gold btn-sm" data-tip="Realizar sorteo ahora" onclick="window.__realizarSorteo('${ar.id}','${gNom}','${ar.numero}')"><i class="bi bi-shuffle"></i> Sortear</button>`:""}
          `:""}
        </div>
      </div>`;
    }).join("")}</div>`}`;
  }catch(e){
    MC().innerHTML=`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error al cargar sorteos.<br><button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="sorteos()"><i class="bi bi-arrow-clockwise"></i> Reintentar</button></p></div></div></div>`;
  }
}

/* ── Rondas historial ── */
window.__verRondas=async(gameId,gameNombre)=>{
  loadingView();
  const{data:rounds}=await supabase.from("rounds").select("id,numero,estado,sorteado_at,created_at,ganador_id,profiles!rounds_ganador_id_fkey(username)").eq("game_id",gameId).order("numero",{ascending:false});
  const rd=await Promise.all((rounds||[]).map(async r=>{
    const[{data:b},{count:gr}]=await Promise.all([
      supabase.from("participations").select("boletos").eq("round_id",r.id),
      supabase.from("participations").select("*",{count:"exact",head:true}).eq("round_id",r.id).eq("es_gratis",true),
    ]);
    return{...r,cupos:(b||[]).reduce((s,x)=>s+(x.boletos||1),0),gratisCount:gr??0};
  }));

  MC().innerHTML=`
  <div class="ph"><div><div class="ph-title"><i class="bi bi-layers"></i>Rondas — ${gameNombre}</div><div class="ph-sub">${rd.length} ronda${rd.length!==1?"s":""}</div></div>${renderBackBtn("Volver",sorteos)}</div>
  <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ol"></i>Historial</div></div>
  <div class="panel-body no-pad" style="overflow-x:auto">
    <table id="tblRondas" style="width:100%">
      <thead><tr><th>Ronda</th><th>Estado</th><th>Cupos</th><th>Gratis</th><th>Ganador</th><th>Sorteado</th><th>Acciones</th></tr></thead>
      <tbody>${rd.map(r=>{
        const gNom=gameNombre.replace(/'/g,"\\'");
        return`<tr>
          <td><span style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:700;color:var(--gold2)">R${r.numero}</span></td>
          <td>${badge(r.estado)}</td>
          <td><div style="display:flex;align-items:center;gap:.5rem"><div class="prog-bg" style="width:70px"><div class="prog-fill${r.cupos>=25?" full":""}" style="width:${Math.min(Math.round(r.cupos/25*100),100)}%"></div></div><span style="font-size:.8rem;color:var(--muted)">${r.cupos}/25</span></div></td>
          <td>${r.gratisCount>0?`<span style="color:var(--purple3);font-size:.82rem"><i class="bi bi-gift-fill"></i> ${r.gratisCount}</span>`:`<span style="color:var(--dim);font-size:.78rem">—</span>`}</td>
          <td>${r.profiles?`<strong style="color:var(--gold2)">${r.profiles.username}</strong>`:`<span style="color:var(--muted)">—</span>`}</td>
          <td style="color:var(--muted);font-size:.82rem">${r.sorteado_at?fmtDate(r.sorteado_at):"—"}</td>
          <td><div style="display:flex;gap:.35rem;flex-wrap:wrap">
            <button class="btn btn-info btn-sm" data-tip="Participantes" onclick="window.__verParticipantes('${r.id}','${gNom}','${r.numero}')"><i class="bi bi-people"></i></button>
            <button class="btn btn-ghost btn-sm" data-tip="Comprobantes" onclick="window.__verComprobantes('${r.id}','${gNom}','${r.numero}')"><i class="bi bi-receipt"></i></button>
            ${r.estado==="abierta"&&r.cupos>=25?`<button class="btn btn-gold btn-sm" data-tip="Realizar sorteo" onclick="window.__realizarSorteo('${r.id}','${gNom}','${r.numero}')"><i class="bi bi-shuffle"></i></button>`:""}
          </div></td>
        </tr>`;
      }).join("")}</tbody>
    </table>
  </div></div>`;
  initDT("tblRondas",{order:[[0,"desc"]],columnDefs:[{orderable:false,targets:6}]});
};

/* ── Participantes ── */
window.__verParticipantes=async(roundId,gameNombre,num)=>{
  loadingView();
  const{data}=await supabase.from("participations").select("id,boletos,resultado,es_gratis,created_at,profiles(username,email)").eq("round_id",roundId).order("created_at",{ascending:true});
  const total=(data||[]).reduce((s,x)=>s+(x.boletos||1),0);
  const gratisCnt=(data||[]).filter(p=>p.es_gratis).length;

  MC().innerHTML=`
  <div class="ph"><div><div class="ph-title"><i class="bi bi-people"></i>Participantes</div><div class="ph-sub">${gameNombre} R${num} · ${data?.length||0} jugadores · ${total}/25${gratisCnt>0?` · <span style="color:var(--purple3)">${gratisCnt} gratis</span>`:""}</div></div>${renderBackBtn("Volver",sorteos)}</div>
  <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-ol"></i>Lista</div><span style="font-size:.82rem;color:var(--muted)">${data?.length||0} participantes</span></div>
  <div class="panel-body no-pad" style="overflow-x:auto">
    <table id="tblPart" style="width:100%">
      <thead><tr><th>#</th><th>Usuario</th><th>Email</th><th>Boletos</th><th>Tipo</th><th>Resultado</th><th>Inscripción</th></tr></thead>
      <tbody>${(data||[]).map((p,i)=>`<tr>
        <td style="color:var(--muted);font-family:'Oswald',sans-serif">${i+1}</td>
        <td><strong>${p.profiles?.username||"—"}</strong></td>
        <td style="color:var(--muted);font-size:.82rem">${p.profiles?.email||"—"}</td>
        <td><span style="font-family:'Oswald',sans-serif;font-size:.9rem;color:var(--gold2);font-weight:700">🎟️ ${p.boletos||1}</span></td>
        <td>${p.es_gratis?`<span class="bdg bdg-free"><i class="bi bi-gift-fill"></i> Gratis</span>`:`<span style="color:var(--dim);font-size:.78rem">pago</span>`}</td>
        <td>${badge(p.resultado)}</td>
        <td style="color:var(--muted);font-size:.82rem">${fmtDate(p.created_at)}</td>
      </tr>`).join("")}</tbody>
    </table>
  </div></div>`;
  initDT("tblPart",{pageLength:25,columnDefs:[{orderable:false,targets:[0,4,5]}]});
};

/* ── Realizar sorteo ── */
window.__realizarSorteo=async(roundId,gameNombre,num)=>{
  // Verificar pagos pendientes antes de sortear
  const{count:pendCheck}=await supabase.from("payments").select("*",{count:"exact",head:true}).eq("round_id",roundId).eq("estado","pendiente");
  if((pendCheck||0)>0){
    const rc=await confirm$("Atención",`Hay <strong>${pendCheck}</strong> pago${pendCheck!==1?"s":""} pendiente${pendCheck!==1?"s":""} sin aprobar.<br>¿Sortear de todas formas?`,"Sortear de todas formas");
    if(!rc.isConfirmed) return;
  }
  const r=await confirm$(`Sortear Ronda ${num}`,`<strong>${gameNombre}</strong><br>No se puede deshacer.`,"🎲 Sortear");
  if(!r.isConfirmed) return;
  loading$("Realizando sorteo...");
  try{
    const{data:parts}=await supabase.from("participations").select("id,user_id,boletos,profiles(username)").eq("round_id",roundId).eq("resultado","pendiente");
    if(!parts?.length){Swal.close();ok$("Sin participantes","","warning");return;}
    const participantes=parts.map(p=>({id:p.id,user_id:p.user_id,username:p.profiles?.username||"—",boletos:p.boletos||1}));
    const resultado=calcSorteo(participantes);
    const{caso,ganadores,premioEspecial}=resultado;
    const g1=ganadores.find(g=>g.lugar===1),g2=ganadores.find(g=>g.lugar===2),g3=ganadores.find(g=>g.lugar===3);
    for(const g of ganadores) await supabase.from("participations").update({resultado:"ganada",lugar:g.lugar}).eq("id",g.id);
    const gIds=ganadores.map(g=>g.id);const losers=parts.filter(p=>!gIds.includes(p.id)).map(p=>p.id);
    if(losers.length) await supabase.from("participations").update({resultado:"perdida"}).in("id",losers);
    await supabase.from("rounds").update({estado:"sorteada",ganador_id:g1?.user_id||null,ganador2_id:g2?.user_id||null,ganador3_id:g3?.user_id||null,caso_sorteo:caso,premio_especial:premioEspecial,sorteado_at:new Date().toISOString()}).eq("id",roundId);
    Swal.close();
    await Swal.fire({title:premioEspecial?"🎩 ¡CASO ESPECIAL!":"🏆 ¡Sorteo realizado!",html:`<div style="font-size:.78rem;color:var(--muted);margin-bottom:.4rem">${nombreCaso(caso)}</div>${g1?`<div style="font-family:'Oswald',sans-serif;font-size:1.5rem;color:var(--gold2);">${g1.username} 🥇</div>`:""}${g2?`<div style="font-size:.9rem;color:#93c5fd;margin:.1rem 0">🥈 ${g2.username}</div>`:""}${g3?`<div style="font-size:.88rem;color:#d97706">🥉 ${g3.username}</div>`:""}${premioEspecial?`<div style="margin-top:.5rem;font-size:.82rem;color:var(--gold2)">🎁 Premio especial</div>`:""}<div style="font-size:.75rem;color:var(--muted);margin-top:.4rem">${gameNombre} · R${num}</div>`,icon:"success",confirmButtonText:"OK",...swal$});
    await Promise.all([loadSidebarStats(),sorteos()]);
  }catch(e){Swal.close();ok$("Error",e.message||"","error");}
};

/* ════════════════════════════════════════
   COMPROBANTES GLOBALES
════════════════════════════════════════ */
async function comprobantesGlobal(){
  setActive("comprobantes");loadingView();
  try{
    const{data}=await supabase.from("payments").select("id,monto,metodo,estado,comprobante_url,boletos_solicitados,referencia,created_at,profiles!payments_user_id_fkey(username,email),rounds(id,numero,games(nombre))").order("created_at",{ascending:false}).limit(300);
    const sorted=[...(data||[])].sort((a,b)=>{if(a.estado==="pendiente"&&b.estado!=="pendiente")return-1;if(a.estado!=="pendiente"&&b.estado==="pendiente")return 1;return new Date(a.created_at)-new Date(b.created_at);});
    const pendCount=sorted.filter(p=>p.estado==="pendiente").length;
    const gratisCount=sorted.filter(p=>p.metodo==="gratis").length;
    window.__compMap={};sorted.forEach(p=>{window.__compMap[p.id]={...p,username:p.profiles?.username};});

    MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-receipt"></i>Comprobantes</div><div class="ph-sub">${pendCount} pendiente${pendCount!==1?"s":""} · ${sorted.length} total</div></div></div>
    ${pendCount>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">${pendCount} pago${pendCount!==1?"s":""} esperando revisión</div><div class="fondo-alert-sub">Revisa la imagen antes de aprobar.</div></div></div>`:`<div class="fondo-alert good"><i class="bi bi-check-circle-fill"></i><div><div class="fondo-alert-title">¡Todo revisado!</div></div></div>`}
    ${gratisCount>0?`<div class="fondo-alert purple"><i class="bi bi-gift-fill"></i><div><div class="fondo-alert-title">${gratisCount} boleto${gratisCount!==1?"s":""} de fidelidad</div><div class="fondo-alert-sub">Resaltados en la tabla.</div></div></div>`:""}
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-cash-stack"></i>Todos los comprobantes</div><span style="font-size:.82rem;color:var(--muted)">${sorted.length}</span></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!sorted.length?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin comprobantes</p></div>`:`
      <table id="tblComp" style="width:100%">
        <thead><tr><th>Usuario</th><th>Sorteo · Ronda</th><th>Boletos</th><th>Monto</th><th>Método</th><th>Estado</th><th>Fecha</th><th>Imagen</th><th>Acción</th></tr></thead>
        <tbody>${sorted.map(p=>`<tr${p.metodo==="gratis"?" style='background:rgba(139,92,246,.04)!important'":""}>
          <td><strong>${p.profiles?.username||"—"}</strong><br><span style="font-size:.74rem;color:var(--muted)">${p.profiles?.email||""}</span></td>
          <td style="font-size:.82rem">${p.rounds?.games?.nombre||"—"} R${p.rounds?.numero||"?"}</td>
          <td><span style="font-family:'Oswald',sans-serif;color:var(--gold2)">🎟️ ${p.boletos_solicitados||1}</span></td>
          <td style="font-family:'Oswald',sans-serif;color:${p.metodo==="gratis"?"var(--purple3)":"var(--gold2)"}">${p.metodo==="gratis"?"🎁 Gratis":fmtMoney(p.monto)}</td>
          <td>${badgeMetodo(p.metodo)}</td>
          <td>${badge(p.estado)}</td>
          <td style="color:var(--muted);font-size:.82rem">${fmtShort(p.created_at)}</td>
          <td>${p.comprobante_url?`<button class="btn btn-ghost btn-sm" data-tip="Ver imagen" onclick="window.__verImagen('${p.id}')"><i class="bi bi-image"></i></button>`:`<span style="color:var(--dim);font-size:.78rem">${p.metodo==="gratis"?"🎁":"—"}</span>`}</td>
          <td>${p.estado==="pendiente"?`<div style="display:flex;gap:.3rem">
            <button class="btn btn-success btn-sm" data-tip="Aprobar" onclick="window.__aprobarPago('${p.id}','${p.rounds?.id||""}','','')"><i class="bi bi-check-lg"></i></button>
            <button class="btn btn-danger btn-sm" data-tip="Rechazar" onclick="window.__rechazarPago('${p.id}','${p.rounds?.id||""}','','')"><i class="bi bi-x-lg"></i></button>
          </div>`:`<span style="color:var(--dim);font-size:.78rem">—</span>`}</td>
        </tr>`).join("")}</tbody>
      </table>`}
    </div></div>`;
    if(sorted.length) initDT("tblComp",{order:[[5,"asc"],[6,"asc"]],columnDefs:[{orderable:false,targets:[7,8]}]});
  }catch(e){
    MC().innerHTML=`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error.<br><button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="comprobantesGlobal()"><i class="bi bi-arrow-clockwise"></i> Reintentar</button></p></div></div></div>`;
  }
}

window.__verImagen=(id)=>{
  const p=window.__compMap?.[id];if(!p) return;
  Swal.fire({
    title:"Comprobante de pago",width:520,...swal$,showConfirmButton:false,showCloseButton:true,
    html:`${p.comprobante_url?`<img src="${p.comprobante_url}" style="width:100%;max-height:280px;object-fit:contain;border-radius:8px;border:1px solid rgba(139,26,26,.22);margin-bottom:.85rem" onerror="this.style.display='none'">`:`<div style="text-align:center;padding:1.5rem;font-size:2rem;margin-bottom:.85rem">🎁<br><span style="font-size:.85rem;color:var(--muted)">Boleto de fidelidad</span></div>`}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.15rem">Usuario</div><strong>${p.username||"—"}</strong></div>
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.15rem">Monto</div><span style="color:${p.metodo==="gratis"?"var(--purple3)":"var(--gold2)"};">${p.metodo==="gratis"?"🎁 Gratis":fmtMoney(p.monto)}</span></div>
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.15rem">Boletos</div>🎟️ ${p.boletos_solicitados||1}</div>
      <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.15rem">Método</div>${badgeMetodo(p.metodo)}</div>
    </div>
    ${p.estado==="pendiente"?`<div style="margin-top:.85rem;display:flex;gap:.5rem;justify-content:center">
      <button class="btn btn-success btn-md" onclick="Swal.close();window.__aprobarPago('${p.id}','${p.rounds?.id||""}','','')"><i class="bi bi-check-lg"></i> ${p.metodo==="gratis"?"Confirmar":"Aprobar"}</button>
      <button class="btn btn-danger btn-md" onclick="Swal.close();window.__rechazarPago('${p.id}','${p.rounds?.id||""}','','')"><i class="bi bi-x-lg"></i> Rechazar</button>
    </div>`:""}`
  });
};

window.__verComprobantes=async(roundId,gameNombre,num)=>{
  loadingView();
  const{data}=await supabase.from("payments").select("id,monto,metodo,estado,comprobante_url,boletos_solicitados,referencia,created_at,profiles!payments_user_id_fkey(username,email)").eq("round_id",roundId).order("created_at",{ascending:true});
  const sorted=[...(data||[])].sort((a,b)=>a.estado==="pendiente"&&b.estado!=="pendiente"?-1:a.estado!=="pendiente"&&b.estado==="pendiente"?1:0);
  const pendCount=sorted.filter(p=>p.estado==="pendiente").length;
  const gNom=(gameNombre||"").replace(/'/g,"\\'");
  window.__compMap={};sorted.forEach(p=>{window.__compMap[p.id]={...p,username:p.profiles?.username,_roundId:roundId};});

  MC().innerHTML=`
  <div class="ph"><div><div class="ph-title"><i class="bi bi-receipt"></i>Comprobantes R${num}</div><div class="ph-sub">${gameNombre} · ${pendCount} pendiente${pendCount!==1?"s":""}</div></div>${renderBackBtn("Volver",sorteos)}</div>
  ${pendCount>0?`<div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i><div><div class="fondo-alert-title">${pendCount} pago${pendCount!==1?"s":""} pendientes</div><div class="fondo-alert-sub">Revisa la imagen antes de aprobar.</div></div></div>`:`<div class="fondo-alert good"><i class="bi bi-check-circle-fill"></i><div><div class="fondo-alert-title">Todo revisado</div></div></div>`}
  <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-cash-stack"></i>${gameNombre} · R${num}</div><span style="font-size:.82rem;color:var(--muted)">${sorted.length}</span></div>
  <div class="panel-body no-pad" style="overflow-x:auto">
    ${!sorted.length?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin comprobantes</p></div>`:`
    <table id="tblCompR" style="width:100%">
      <thead><tr><th>Usuario</th><th>Boletos</th><th>Monto</th><th>Método</th><th>Estado</th><th>Fecha</th><th>Imagen</th><th>Acción</th></tr></thead>
      <tbody>${sorted.map(p=>`<tr${p.metodo==="gratis"?" style='background:rgba(139,92,246,.04)!important'":""}>
        <td><strong>${p.profiles?.username||"—"}</strong><br><span style="font-size:.74rem;color:var(--muted)">${p.profiles?.email||""}</span></td>
        <td><span style="font-family:'Oswald',sans-serif;color:var(--gold2)">🎟️ ${p.boletos_solicitados||1}</span></td>
        <td style="font-family:'Oswald',sans-serif;color:${p.metodo==="gratis"?"var(--purple3)":"var(--gold2)"}">${p.metodo==="gratis"?"🎁 Gratis":fmtMoney(p.monto)}</td>
        <td>${badgeMetodo(p.metodo)}</td>
        <td>${badge(p.estado)}</td>
        <td style="color:var(--muted);font-size:.82rem">${fmtShort(p.created_at)}</td>
        <td>${p.comprobante_url?`<button class="btn btn-ghost btn-sm" data-tip="Ver imagen" onclick="window.__verImagen('${p.id}')"><i class="bi bi-image"></i></button>`:`<span style="color:var(--dim);font-size:.78rem">${p.metodo==="gratis"?"🎁":"—"}</span>`}</td>
        <td>${p.estado==="pendiente"?`<div style="display:flex;gap:.3rem">
          <button class="btn btn-success btn-sm" data-tip="Aprobar" onclick="window.__aprobarPago('${p.id}','${roundId}','${gNom}','${num}')"><i class="bi bi-check-lg"></i></button>
          <button class="btn btn-danger btn-sm" data-tip="Rechazar" onclick="window.__rechazarPago('${p.id}','${roundId}','${gNom}','${num}')"><i class="bi bi-x-lg"></i></button>
        </div>`:`<span style="color:var(--dim);font-size:.78rem">—</span>`}</td>
      </tr>`).join("")}</tbody>
    </table>`}
  </div></div>`;
  if(sorted.length) initDT("tblCompR",{order:[[4,"asc"],[5,"asc"]],columnDefs:[{orderable:false,targets:[6,7]}]});
};

window.__aprobarPago=async(id,roundId,gameNombre,num)=>{
  const p0=window.__compMap?.[id];const esGratis=p0?.metodo==="gratis";
  const r=await confirm$(esGratis?"Confirmar boleto gratis":"Aprobar pago",esGratis?"¿Confirmar esta inscripción con boleto de fidelidad?":"¿El comprobante es válido?",esGratis?"🎁 Confirmar":"✅ Aprobar");
  if(!r.isConfirmed) return;
  loading$();
  try{
    const{data:pago,error}=await supabase.from("payments").select("user_id,boletos_solicitados,round_id,metodo").eq("id",id).single();
    if(error||!pago) throw error||new Error("No encontrado");
    const boletos=pago.boletos_solicitados||1;const rId=pago.round_id||roundId;
    if(pago.metodo==="gratis") await consumirBoletoGratis(pago.user_id,rId);
    await supabase.from("payments").update({estado:"aprobado",revisado_por:user.id}).eq("id",id);
    const{data:pe}=await supabase.from("participations").select("id,boletos").eq("round_id",rId).eq("user_id",pago.user_id).maybeSingle();
    if(pe){await supabase.from("participations").update({boletos:(pe.boletos||1)+boletos}).eq("id",pe.id);}
    else{await supabase.from("participations").insert({round_id:rId,user_id:pago.user_id,boletos,resultado:"pendiente",es_gratis:pago.metodo==="gratis"});}
    Swal.close();
    toast(esGratis?`🎁 Boleto gratis confirmado`:`✅ Aprobado · ${boletos} boleto${boletos!==1?"s":""}`);
    await loadSidebarStats();
    if(roundId&&gameNombre){window.__verComprobantes(rId,gameNombre,num);}else{comprobantesGlobal();}
  }catch(e){Swal.close();ok$("Error",e.message||"","error");}
};

window.__rechazarPago=async(id,roundId,gameNombre,num)=>{
  const p0=window.__compMap?.[id];const esGratis=p0?.metodo==="gratis";
  const r=await confirm$(esGratis?"Rechazar boleto gratis":"Rechazar pago",esGratis?"El boleto <strong>no se consumirá</strong> — quedará disponible para el usuario.":"¿Rechazar este comprobante?","❌ Rechazar");
  if(!r.isConfirmed) return;
  loading$();
  await supabase.from("payments").update({estado:"rechazado",revisado_por:user.id}).eq("id",id);
  Swal.close();toast(esGratis?"Inscripción rechazada · boleto conservado":"Pago rechazado","err");
  await loadSidebarStats();
  if(roundId&&gameNombre){window.__verComprobantes(roundId,gameNombre,num);}else{comprobantesGlobal();}
};

/* ════════════════════════════════════════
   GANADORES
════════════════════════════════════════ */
async function ganadores(){
  setActive("ganadores");loadingView();
  try{
    const{data}=await supabase.from("rounds").select("id,numero,sorteado_at,caso_sorteo,premio_especial,games(nombre),ganador_id,ganador2_id,ganador3_id").eq("estado","sorteada").not("ganador_id","is",null).order("sorteado_at",{ascending:false});
    if(!data?.length){MC().innerHTML=`<div class="ph"><div><div class="ph-title"><i class="bi bi-trophy-fill"></i>Ganadores</div></div></div><div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-trophy"></i><p>Sin ganadores aún</p></div></div></div>`;return;}

    const allIds=[...new Set(data.flatMap(r=>[r.ganador_id,r.ganador2_id,r.ganador3_id].filter(Boolean)))];
    const{data:profs}=await supabase.from("profiles").select("id,username").in("id",allIds);
    const pMap={};(profs||[]).forEach(p=>{pMap[p.id]=p.username;});

    const av=(uid,sz=30)=>{const u=uid?(pMap[uid]||"?"):"?";return`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--gold2));display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:${Math.round(sz*.38)}px;font-weight:700;color:#fff;flex-shrink:0">${u[0].toUpperCase()}</div>`;};

    function podSlot(uid,lugar){
      const cols={1:"var(--gold2)",2:"#93c5fd",3:"#d97706"},lbls={1:"1er",2:"2do",3:"3er"},icos={1:"bi-award-fill",2:"bi-award",3:"bi-star-fill"};
      if(!uid) return`<div style="opacity:.3;display:flex;align-items:center;gap:.4rem"><div style="width:30px;height:30px;border-radius:50%;border:1px dashed var(--dim)"></div><span style="font-size:.75rem;color:var(--dim)">${lbls[lugar]} — sin ganador</span></div>`;
      return`<div style="display:flex;align-items:center;gap:.5rem">${av(uid,30)}<div><div style="font-family:'Oswald',sans-serif;font-size:.9rem;font-weight:700;color:${cols[lugar]}">${pMap[uid]||"—"}</div><div style="font-size:.65rem;color:${cols[lugar]};display:flex;align-items:center;gap:.2rem;margin-top:.06rem"><i class="bi ${icos[lugar]}"></i>${lbls[lugar]} lugar</div></div></div>`;
    }

    MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-trophy-fill"></i>Ganadores</div><div class="ph-sub">${data.length} sorteo${data.length!==1?"s":""}</div></div></div>
    ${data.map((r,i)=>`
    <div style="background:var(--ink2);border:1px solid var(--border);border-radius:12px;padding:.9rem 1.1rem;margin-bottom:.7rem;transition:border-color .18s" onmouseenter="this.style.borderColor='rgba(212,160,23,.3)'" onmouseleave="this.style.borderColor='rgba(139,26,26,.22)'">
      <div style="display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.75rem;padding-bottom:.6rem;border-bottom:1px solid rgba(139,26,26,.12)">
        <div style="width:26px;height:26px;border-radius:50%;background:rgba(212,160,23,.1);border:1px solid rgba(212,160,23,.2);display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:.78rem;font-weight:700;color:var(--gold2)">${i+1}</div>
        <div style="flex:1"><div style="font-family:'Oswald',sans-serif;font-weight:700;color:#fff">${r.games?.nombre||"—"}</div><div style="font-size:.73rem;color:var(--muted);margin-top:.05rem;display:flex;align-items:center;gap:.4rem"><span style="color:var(--gold2);font-family:'Oswald',sans-serif">Ronda ${r.numero}</span><span>·</span><span>${r.sorteado_at?fmtDate(r.sorteado_at):"—"}</span></div></div>
        <div style="font-family:'Oswald',sans-serif;font-size:.7rem;font-weight:600;color:var(--muted);background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.14);border-radius:5px;padding:.2rem .6rem;letter-spacing:.1em;text-transform:uppercase">${r.caso_sorteo||"ESTÁNDAR"}${r.premio_especial?" 🎁":""}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem">
        <div style="background:rgba(212,160,23,.04);border:1px solid rgba(212,160,23,.1);border-radius:8px;padding:.6rem .75rem">${podSlot(r.ganador_id,1)}</div>
        <div style="background:rgba(26,90,154,.04);border:1px solid rgba(26,90,154,.1);border-radius:8px;padding:.6rem .75rem">${podSlot(r.ganador2_id,2)}</div>
        <div style="background:rgba(180,80,10,.04);border:1px solid rgba(180,80,10,.1);border-radius:8px;padding:.6rem .75rem">${podSlot(r.ganador3_id,3)}</div>
      </div>
    </div>`).join("")}`;
  }catch(e){MC().innerHTML=`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error al cargar.</p></div></div></div>`;}
}

/* ════════════════════════════════════════
   FIDELIDAD (boletos gratis)
════════════════════════════════════════ */
async function fidelidadView(){
  setActive("fidelidad");loadingView();
  try{
    const[{data:disponibles},{data:usados}]=await Promise.all([
      supabase.from("boletos_gratis").select("id,origen,created_at,profiles(username,email)").eq("usado",false).order("created_at",{ascending:true}),
      supabase.from("boletos_gratis").select("id,origen,usado_at,created_at,profiles(username,email),rounds(numero,games(nombre))").eq("usado",true).order("usado_at",{ascending:false}).limit(150),
    ]);

    const porUsr={};
    (disponibles||[]).forEach(b=>{const uid=b.profiles?.username||"?";if(!porUsr[uid])porUsr[uid]={username:uid,email:b.profiles?.email||"—",count:0,origenes:[]};porUsr[uid].count++;if(!porUsr[uid].origenes.includes(b.origen))porUsr[uid].origenes.push(b.origen);});
    const lista=Object.values(porUsr).sort((a,b)=>b.count-a.count);
    const orLbl=o=>({referido:"👥 Referido",promo:"🎉 Promo",fidelidad:"⭐ Fidelidad",manual:"🔧 Manual",bienvenida:"🎁 Bienvenida"}[o]||`📌 ${o}`);

    MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-gift-fill"></i>Boletos de Fidelidad</div><div class="ph-sub"><span style="color:var(--purple3)">${disponibles?.length||0}</span> disponibles · <span style="color:var(--purple3)">${lista.length}</span> usuario${lista.length!==1?"s":""}</div></div></div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="sc"><div class="sc-bar p"></div><span class="sc-icon">🎁</span><div class="sc-val purple">${disponibles?.length||0}</div><div class="sc-lbl">Disponibles</div></div>
      <div class="sc"><div class="sc-bar gr"></div><span class="sc-icon">✅</span><div class="sc-val green">${usados?.length||0}</div><div class="sc-lbl">Usados</div></div>
      <div class="sc"><div class="sc-bar g"></div><span class="sc-icon">👤</span><div class="sc-val gold">${lista.length}</div><div class="sc-lbl">Con saldo</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title" style="color:var(--purple3)"><i class="bi bi-person-check-fill"></i>Usuarios con boletos disponibles</div><span style="font-size:.82rem;color:var(--muted)">${lista.length}</span></div>
      <div class="panel-body no-pad" style="overflow-x:auto">
        ${!lista.length?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin boletos disponibles</p></div>`:`
        <table id="tblGratisDisp" style="width:100%">
          <thead><tr><th>Usuario</th><th>Email</th><th>Disponibles</th><th>Origen(es)</th></tr></thead>
          <tbody>${lista.map(u=>`<tr>
            <td><div style="display:flex;align-items:center;gap:.5rem"><div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--purple),var(--purple2));display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:.72rem;font-weight:700;color:#fff">${u.username[0].toUpperCase()}</div><strong>${u.username}</strong></div></td>
            <td style="color:var(--muted);font-size:.82rem">${u.email}</td>
            <td><span style="background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);border-radius:6px;padding:.2rem .7rem;font-family:'Oswald',sans-serif;font-size:.9rem;color:var(--purple3);font-weight:700">🎁 ${u.count}</span></td>
            <td style="font-size:.82rem;color:var(--muted)">${u.origenes.map(o=>`<span style="margin-right:.3rem">${orLbl(o)}</span>`).join("")}</td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-clock-history"></i>Historial de usos</div><span style="font-size:.82rem;color:var(--muted)">${usados?.length||0}</span></div>
      <div class="panel-body no-pad" style="overflow-x:auto">
        ${!usados?.length?`<div class="empty"><i class="bi bi-inbox"></i><p>Sin historial aún</p></div>`:`
        <table id="tblGratisUsados" style="width:100%">
          <thead><tr><th>Usuario</th><th>Origen</th><th>Ronda usada</th><th>Emitido</th><th>Usado</th></tr></thead>
          <tbody>${usados.map(b=>`<tr>
            <td><strong>${b.profiles?.username||"—"}</strong><br><span style="font-size:.74rem;color:var(--muted)">${b.profiles?.email||""}</span></td>
            <td style="font-size:.82rem">${orLbl(b.origen)}</td>
            <td style="font-size:.82rem">${b.rounds?`<span style="color:var(--gold2);font-family:'Oswald',sans-serif">${b.rounds.games?.nombre||"—"} R${b.rounds.numero}</span>`:`<span style="color:var(--dim)">—</span>`}</td>
            <td style="color:var(--muted);font-size:.82rem">${fmtShort(b.created_at)}</td>
            <td style="color:var(--muted);font-size:.82rem">${b.usado_at?fmtDate(b.usado_at):"—"}</td>
          </tr>`).join("")}</tbody>
        </table>`}
      </div>
    </div>`;
    if(lista.length) initDT("tblGratisDisp",{order:[[2,"desc"]],columnDefs:[{orderable:false,targets:[3]}]});
    if(usados?.length) initDT("tblGratisUsados",{order:[[4,"desc"]]});
  }catch(e){MC().innerHTML=`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error.<br><button class="btn btn-ghost btn-sm" style="margin-top:.8rem" onclick="fidelidadView()"><i class="bi bi-arrow-clockwise"></i> Reintentar</button></p></div></div></div>`;}
}

/* ════════════════════════════════════════
   MI ACTIVIDAD
════════════════════════════════════════ */
async function historial(){
  setActive("historial");loadingView();
  try{
    const{data:revisados}=await supabase.from("payments").select("id,monto,metodo,estado,boletos_solicitados,created_at,profiles!payments_user_id_fkey(username),rounds(numero,games(nombre))").eq("revisado_por",user.id).order("created_at",{ascending:false}).limit(200);
    const aprobados=(revisados||[]).filter(p=>p.estado==="aprobado").length;
    const rechazados=(revisados||[]).filter(p=>p.estado==="rechazado").length;
    const gratisAprob=(revisados||[]).filter(p=>p.estado==="aprobado"&&p.metodo==="gratis").length;

    MC().innerHTML=`
    <div class="ph"><div><div class="ph-title"><i class="bi bi-clock-history"></i>Mi actividad</div><div class="ph-sub">Pagos revisados por mí</div></div></div>
    <div class="stat-grid">
      <div class="sc"><div class="sc-bar gr"></div><span class="sc-icon">✅</span><div class="sc-val green">${aprobados}</div><div class="sc-lbl">Aprobé</div></div>
      <div class="sc"><div class="sc-bar r"></div><span class="sc-icon">❌</span><div class="sc-val red">${rechazados}</div><div class="sc-lbl">Rechacé</div></div>
      <div class="sc"><div class="sc-bar p"></div><span class="sc-icon">🎁</span><div class="sc-val purple">${gratisAprob}</div><div class="sc-lbl">Gratis conf.</div></div>
      <div class="sc"><div class="sc-bar b"></div><span class="sc-icon">📋</span><div class="sc-val blue">${revisados?.length||0}</div><div class="sc-lbl">Total revisados</div></div>
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title"><i class="bi bi-list-check"></i>Historial de revisiones</div><span style="font-size:.82rem;color:var(--muted)">${revisados?.length||0}</span></div>
    <div class="panel-body no-pad" style="overflow-x:auto">
      ${!revisados?.length?`<div class="empty"><i class="bi bi-inbox"></i><p>Aún no has revisado ningún pago</p></div>`:`
      <table id="tblHist" style="width:100%">
        <thead><tr><th>Usuario</th><th>Sorteo · Ronda</th><th>Boletos</th><th>Monto</th><th>Método</th><th>Decisión</th><th>Fecha</th></tr></thead>
        <tbody>${revisados.map(p=>`<tr${p.metodo==="gratis"?" style='background:rgba(139,92,246,.04)!important'":""}>
          <td><strong>${p.profiles?.username||"—"}</strong></td>
          <td style="font-size:.82rem">${p.rounds?.games?.nombre||"—"} R${p.rounds?.numero||"?"}</td>
          <td style="font-family:'Oswald',sans-serif;color:var(--gold2)">🎟️ ${p.boletos_solicitados||1}</td>
          <td style="font-family:'Oswald',sans-serif;color:${p.metodo==="gratis"?"var(--purple3)":"var(--gold2)"}">${p.metodo==="gratis"?"🎁 Gratis":fmtMoney(p.monto)}</td>
          <td>${badgeMetodo(p.metodo)}</td>
          <td>${badge(p.estado)}</td>
          <td style="color:var(--muted);font-size:.82rem">${fmtShort(p.created_at)}</td>
        </tr>`).join("")}</tbody>
      </table>`}
    </div></div>`;
    if(revisados?.length) initDT("tblHist",{order:[[6,"desc"]]});
  }catch(e){MC().innerHTML=`<div class="panel"><div class="panel-body"><div class="empty"><i class="bi bi-exclamation-triangle"></i><p>Error al cargar.</p></div></div></div>`;}
}

/* ════════════════════════════════════════
   CONFIGURACIÓN — con QR propio del trabajador
════════════════════════════════════════ */
async function configuracion(){
  setActive("configuracion");loadingView();
  // Recargar QR actual
  const{data:prof}=await supabase.from("profiles").select("qr_cobro_url,qr_metodo,qr_verificado,qr_subido_at,username,email").eq("id",user.id).single();
  if(prof){myQR={subido:!!prof.qr_cobro_url,verificado:!!prof.qr_verificado,url:prof.qr_cobro_url||null,metodo:prof.qr_metodo||null,subidoAt:prof.qr_subido_at||null};}
  const mlM={tigo_money:"Tigo Money",billetera_bcb:"Billetera BCB",qr_simple:"QR Interbank",efectivo_cuenta:"Cuenta bancaria"};

  MC().innerHTML=`
  <div class="ph"><div><div class="ph-title"><i class="bi bi-gear-fill"></i>Configuración</div><div class="ph-sub">Ajustes de tu cuenta de trabajador</div></div></div>

  <!-- QR COBROS PROPIO -->
  <div class="panel">
    <div class="panel-head"><div class="panel-title"><i class="bi bi-qr-code" style="color:var(--blue3)"></i>Mi QR de cobros</div></div>
    <div class="panel-body">
      ${!myQR.subido?`
      <div class="fondo-alert warn"><i class="bi bi-exclamation-triangle-fill"></i>
        <div><div class="fondo-alert-title">Sin QR configurado</div>
        <div class="fondo-alert-sub">Sin QR, el administrador no podrá enviarte tu sueldo. Configúralo ahora.</div></div>
      </div>
      <button class="btn btn-gold btn-md" onclick="modalSubirQRTrabajador()"><i class="bi bi-upload"></i> Subir mi QR</button>
      `:`<div style="display:flex;align-items:flex-start;gap:1.2rem;flex-wrap:wrap">
          <img src="${myQR.url}" style="max-width:160px;border-radius:10px;border:2px solid rgba(26,90,154,.35);cursor:pointer;transition:transform .2s" onclick="window.open('${myQR.url}','_blank')" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'" title="Clic para ampliar">
          <div>
            <div style="font-family:'Oswald',sans-serif;font-size:.95rem;color:#fff;margin-bottom:.4rem">QR activo</div>
            <div style="font-size:.82rem;color:var(--muted);margin-bottom:.3rem">Método: <strong style="color:var(--cream)">${mlM[myQR.metodo]||myQR.metodo||"—"}</strong></div>
            <div style="font-size:.82rem;margin-bottom:.3rem">Estado: <strong style="${myQR.verificado?"color:#22c55e":"color:#f59e0b"}">${myQR.verificado?"✅ Verificado — el admin puede pagarte":"⏳ Pendiente de verificación"}</strong></div>
            ${myQR.subidoAt?`<div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem"><i class="bi bi-calendar3"></i> Subido el ${fmtShort(myQR.subidoAt)}</div>`:""}
            <div class="gap2">
              <button class="btn btn-gold btn-md" onclick="modalSubirQRTrabajador(true)"><i class="bi bi-arrow-repeat"></i> Actualizar QR</button>
              <button class="btn btn-dark btn-sm" onclick="window.open('${myQR.url}','_blank')"><i class="bi bi-zoom-in"></i> Ver ampliado</button>
            </div>
            ${!myQR.verificado?`<div style="margin-top:.75rem;font-size:.78rem;color:var(--muted);background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:7px;padding:.5rem .75rem"><i class="bi bi-info-circle" style="color:#f59e0b"></i> El administrador verificará tu QR pronto. Mientras tanto no puede enviarte pagos.</div>`:""}
          </div>
        </div>`}
    </div>
  </div>

  <!-- CAMBIAR CONTRASEÑA -->
  <div class="panel">
    <div class="panel-head"><div class="panel-title"><i class="bi bi-key-fill"></i>Seguridad</div></div>
    <div class="panel-body">
      <div class="cfg-row">
        <div><div class="cfg-lbl">Contraseña</div><div class="cfg-sub">Cambia tu contraseña de acceso</div></div>
        <button class="btn btn-dark btn-md" onclick="modalCambiarPw()"><i class="bi bi-key"></i> Cambiar</button>
      </div>
      <div class="cfg-row">
        <div><div class="cfg-lbl">Cuenta</div><div class="cfg-sub">${prof?.email||"—"} · Trabajador</div></div>
        <button class="btn btn-danger btn-md" onclick="doLogout()"><i class="bi bi-box-arrow-right"></i> Cerrar sesión</button>
      </div>
    </div>
  </div>`;
}

/* ── Modal subir QR trabajador ── */
const METODOS_QR=[{value:"tigo_money",label:"Tigo Money",desc:"QR Tigo Money Bolivia"},{value:"billetera_bcb",label:"Billetera BCB",desc:"QR del Banco Central"},{value:"qr_simple",label:"QR Interbank",desc:"QR estándar bancario"},{value:"efectivo_cuenta",label:"Cuenta bancaria",desc:"Depósito directo"}];

window.modalSubirQRTrabajador=async(esAct=false)=>{
  const{value:v}=await Swal.fire({
    title:esAct?"Actualizar mi QR de cobros":"Subir mi QR de cobros",
    html:`<div style="text-align:left">
      <div style="background:rgba(26,90,154,.08);border:1px solid rgba(26,90,154,.25);border-radius:9px;padding:.75rem 1rem;margin-bottom:.9rem;font-size:.82rem;color:var(--cream)">
        <i class="bi bi-info-circle" style="color:var(--blue3)"></i> El admin usará este QR para <strong>pagarte tu sueldo</strong>. Asegúrate de que sea correcto y legible.
      </div>
      <div class="field" style="margin-bottom:.9rem">
        <label>Tipo de pago *</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.2rem">
          ${METODOS_QR.map(m=>`<label style="display:flex;align-items:flex-start;gap:.5rem;padding:.6rem .7rem;background:var(--ink3);border:1px solid ${m.value===(myQR.metodo||"")?"var(--gold2)":"var(--border)"};border-radius:8px;cursor:pointer" class="metodo-card" data-val="${m.value}">
            <input type="radio" name="qrMetodo" value="${m.value}" ${m.value===(myQR.metodo||"")?"checked":""} style="margin-top:.15rem;accent-color:var(--blue2)">
            <div><div style="font-size:.85rem;font-weight:600;color:#fff">${m.label}</div><div style="font-size:.7rem;color:var(--muted)">${m.desc}</div></div>
          </label>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>Imagen del QR * <span style="color:var(--muted);font-size:.68rem;font-weight:400;text-transform:none">(JPG/PNG, máx. 5 MB)</span></label>
        <input type="file" id="qrFileInput" accept="image/jpeg,image/png,image/webp" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem;font-size:.85rem">
      </div>
      <img id="qrPreviewImg" style="display:none;max-height:160px;width:100%;object-fit:contain;margin-top:.6rem;border-radius:8px;border:1px solid rgba(26,90,154,.2)">
    </div>`,
    showCancelButton:true,confirmButtonText:`<i class='bi bi-upload'></i> ${esAct?"Actualizar":"Subir QR"}`,cancelButtonText:"Cancelar",width:500,...swal$,
    didOpen:()=>{
      document.querySelectorAll(".metodo-card").forEach(c=>{c.addEventListener("click",()=>{document.querySelectorAll(".metodo-card").forEach(x=>x.style.borderColor="var(--border)");c.style.borderColor="var(--gold2)";});});
      document.getElementById("qrFileInput").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>{const i=document.getElementById("qrPreviewImg");i.src=ev.target.result;i.style.display="block"};r2.readAsDataURL(f);});
    },
    preConfirm:()=>{
      const metodo=document.querySelector("input[name='qrMetodo']:checked")?.value;
      const file=document.getElementById("qrFileInput").files[0];
      if(!metodo){Swal.showValidationMessage("Selecciona el tipo");return false;}
      if(!file){Swal.showValidationMessage("Sube la imagen de tu QR");return false;}
      if(file.size>5*1024*1024){Swal.showValidationMessage("Máx. 5 MB");return false;}
      return{metodo,file};
    }
  });
  if(!v) return;
  loading$("Subiendo QR...");
  let qr_url;
  try{qr_url=await uploadFile(v.file,"el-padrino/qr-cobros");}catch{Swal.close();ok$("Error al subir imagen","","error");return;}
  const{error}=await supabase.from("profiles").update({qr_cobro_url:qr_url,qr_metodo:v.metodo,qr_verificado:false,qr_subido_at:new Date().toISOString()}).eq("id",user.id);
  Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  myQR={subido:true,verificado:false,url:qr_url,metodo:v.metodo,subidoAt:new Date().toISOString()};
  await ok$("✅ QR subido","El administrador lo verificará pronto. Una vez verificado, podrá enviarte tu pago.","success");
  configuracion();
};

window.modalCambiarPw=async()=>{
  const{value:v}=await Swal.fire({title:"Cambiar contraseña",html:`<div style="text-align:left"><div class="field" style="margin-bottom:.85rem"><label>Nueva contraseña *</label><input id="pwN" type="password" class="swal2-input" placeholder="Mínimo 6 caracteres" style="margin:0;width:100%"></div><div class="field"><label>Confirmar *</label><input id="pwC" type="password" class="swal2-input" placeholder="Repite la contraseña" style="margin:0;width:100%"></div></div>`,showCancelButton:true,confirmButtonText:"Cambiar",...swal$,preConfirm:()=>{const n=document.getElementById("pwN").value,c=document.getElementById("pwC").value;if(n.length<6){Swal.showValidationMessage("Mínimo 6 caracteres");return false;}if(n!==c){Swal.showValidationMessage("No coinciden");return false;}return{password:n};}});
  if(!v) return;
  loading$();const{error}=await supabase.auth.updateUser({password:v.password});Swal.close();
  if(error){ok$("Error",error.message,"error");return;}
  toast("✅ Contraseña actualizada");
};

/* ════════════════════════════════════════
   REALTIME
════════════════════════════════════════ */
["payments","participations","rounds","boletos_gratis"].forEach(table=>{
  supabase.channel(`tw-rt-${table}`).on("postgres_changes",{event:"*",schema:"public",table},async()=>{
    await loadSidebarStats();
    // Si hay comprobantes pendientes y el usuario no está en esa vista, mostrar notif discreta
    if(table==="payments"){
      const{count:p}=await supabase.from("payments").select("*",{count:"exact",head:true}).eq("estado","pendiente");
      if((p||0)>0){const view=document.querySelector(".nav-item.active")?.dataset?.view;if(view&&view!=="comprobantes")toast(`⏳ ${p} pago${p!==1?"s":""} pendiente${p!==1?"s":""}. Ir a Comprobantes.`,"warn");}
    }
  }).subscribe();
});

/* ════════════════════════════════════════
   ARRANQUE
════════════════════════════════════════ */
await loadSidebarStats();
setTimeout(()=>dashboard(),50);
