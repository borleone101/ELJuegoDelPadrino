import { supabase } from "./supabase.js";
import { uploadFile } from "./cloudinary.js";

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const swal$ = { background:'#131009', color:'#e6dcc8', confirmButtonColor:'#8b1a1a', cancelButtonColor:'#221c14' };

const toast = (title, icon = "success") => Swal.fire({
  title, icon, toast:true, position:"top-end",
  showConfirmButton:false, timer:2800, timerProgressBar:true,
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

function fmtDate(d) {
  return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function fmtDateShort(d) {
  return new Date(d).toLocaleDateString("es-BO",{day:"2-digit",month:"short",year:"numeric"});
}
function fmtMoney(n) { return `Bs ${Number(n||0).toFixed(2)}`; }

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
const { data: { user } } = await supabase.auth.getUser();
if (!user) { window.location.href = "../../auth/login.html"; throw 0; }

const { data: profile, error: profileErr } = await supabase
  .from("profiles").select("*").eq("id", user.id).single();

if (!profile || profile.estado === "suspendido") {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html"; throw 0;
}

/* ── Rellenar UI con datos del usuario ── */
function initUserUI(prof) {
  const initial = (prof.username?.[0] || "?").toUpperCase();
  // Topbar
  const tbName   = $("tbName");   if (tbName)   tbName.textContent   = prof.username;
  const tbAvatar = $("tbAvatar"); if (tbAvatar) tbAvatar.textContent  = initial;
  // Sidebar
  const sbName   = $("sbName");   if (sbName)   sbName.textContent   = prof.username;
  const sbAvatar = $("sbAvatar"); if (sbAvatar) sbAvatar.textContent  = initial;
  const sbSaldo  = $("sbSaldo");  if (sbSaldo)  sbSaldo.textContent   = Number(prof.saldo||0).toFixed(2);
  // Compat con campo userName antiguo
  const userName = $("userName"); if (userName) userName.textContent  = prof.username;
}
initUserUI(profile);

async function doLogout() {
  const r = await confirm$("¿Cerrar sesión?","","Sí, salir");
  if (r.isConfirmed) { await supabase.auth.signOut(); window.location.href="../../auth/login.html"; }
}
$("logoutBtn")  && $("logoutBtn").addEventListener("click",  doLogout);
$("logoutBtn2") && $("logoutBtn2").addEventListener("click", doLogout);

/* ════════════════════════════════════════
   QR DE COBROS — ESTADO GLOBAL
════════════════════════════════════════ */
let qrState = {
  subido:     !!profile.qr_cobro_url,
  verificado: !!profile.qr_verificado,
  url:        profile.qr_cobro_url  || null,
  metodo:     profile.qr_metodo     || null,
  subidoAt:   profile.qr_subido_at  || null,
};

function puedeParticipar() {
  return qrState.subido && qrState.verificado;
}

/* ── Banner de estado QR ── */
function qrBanner() {
  if (puedeParticipar()) return "";
  if (!qrState.subido) {
    return `
    <div class="qr-gate-banner" id="qrBanner">
      <div class="qgb-icon"><i class="bi bi-qr-code-scan"></i></div>
      <div class="qgb-body">
        <div class="qgb-title">Sube tu QR de cobros para participar</div>
        <div class="qgb-sub">Necesitas subir tu QR (Tigo Money, Billetera BCB, etc.) para poder comprar boletos y recibir premios. Es obligatorio una sola vez.</div>
      </div>
      <button class="btn btn-gold btn-md" onclick="modalSubirQR()"><i class="bi bi-upload"></i> Subir QR ahora</button>
    </div>`;
  }
  return `
  <div class="qr-gate-banner qgb-pending" id="qrBanner">
    <div class="qgb-icon"><i class="bi bi-hourglass-split"></i></div>
    <div class="qgb-body">
      <div class="qgb-title">QR subido — pendiente de verificación</div>
      <div class="qgb-sub">El administrador está revisando tu QR. Una vez verificado podrás comprar boletos y participar en sorteos.</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()"><i class="bi bi-eye"></i> Ver mi QR</button>
  </div>`;
}

/* ════════════════════════════════════════
   MODAL: SUBIR / ACTUALIZAR QR
════════════════════════════════════════ */
const METODOS_QR = [
  { value:"tigo_money",     label:"Tigo Money",           emoji:"📱", desc:"Código QR de Tigo Money Bolivia" },
  { value:"billetera_bcb",  label:"Billetera BCB",         emoji:"🏦", desc:"QR de la Billetera del Banco Central" },
  { value:"qr_simple",      label:"QR Simple / Interbank", emoji:"🔳", desc:"QR estándar de cualquier banco boliviano" },
  { value:"efectivo_cuenta",label:"Cuenta bancaria",       emoji:"💳", desc:"Depósito en cuenta — sube foto de tu tarjeta/QR" },
];

window.modalSubirQR = async (esActualizacion = false) => {
  const titulo = esActualizacion ? "🔄 Actualizar tu QR de cobros" : "📲 Tu QR de cobros";
  const infoHtml = esActualizacion
    ? `<div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.2);border-radius:10px;padding:.85rem 1rem;margin-bottom:1.2rem">
         <div style="font-size:.88rem;color:var(--cream);font-weight:600;margin-bottom:.3rem"><i class="bi bi-info-circle" style="color:var(--gold2)"></i> Actualización de QR</div>
         <div style="font-size:.8rem;color:var(--muted)">Al subir uno nuevo, el anterior será reemplazado y deberás esperar verificación nuevamente.</div>
       </div>`
    : `<div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.2);border-radius:10px;padding:.85rem 1rem;margin-bottom:1.2rem">
         <div style="font-size:.88rem;color:var(--cream);font-weight:600;margin-bottom:.3rem"><i class="bi bi-info-circle" style="color:var(--gold2)"></i> ¿Por qué necesitamos tu QR?</div>
         <div style="font-size:.8rem;color:var(--muted)">Si ganas un sorteo, el administrador usará tu QR para enviarte el premio directamente a tu billetera. Solo lo necesitas subir una vez.</div>
       </div>`;

  const metodoSeleccionado = qrState.metodo || "";

  const { value: v } = await Swal.fire({
    title: titulo,
    html: `
      <div style="text-align:left">
        ${infoHtml}
        <div class="field" style="margin-bottom:1rem">
          <label>Tipo de pago *</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.2rem">
            ${METODOS_QR.map(m=>`
              <label class="metodo-card" style="display:flex;align-items:flex-start;gap:.5rem;padding:.65rem .75rem;background:var(--ink3);border:1px solid ${m.value===metodoSeleccionado?'var(--gold2)':'var(--border)'};border-radius:8px;cursor:pointer;transition:border-color .18s" data-val="${m.value}">
                <input type="radio" name="qrMetodo" value="${m.value}" ${m.value===metodoSeleccionado?'checked':''} style="margin-top:.15rem;accent-color:var(--red2)">
                <div>
                  <div style="font-size:.88rem;font-weight:600;color:#fff">${m.emoji} ${m.label}</div>
                  <div style="font-size:.72rem;color:var(--muted)">${m.desc}</div>
                </div>
              </label>`).join("")}
          </div>
        </div>
        <div class="field" style="margin-bottom:.6rem">
          <label>Imagen de tu QR * <span style="color:var(--muted);font-size:.68rem;font-weight:400;text-transform:none">(JPG, PNG — máx. 5 MB)</span></label>
          <input type="file" id="qrFileInput" accept="image/jpeg,image/png,image/webp" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem;font-size:.85rem">
        </div>
        <div id="qrPreviewWrap" style="display:none;margin-bottom:.8rem;text-align:center">
          <img id="qrPreviewImg" style="max-height:180px;max-width:100%;border-radius:8px;border:1px solid rgba(212,160,23,.2);object-fit:contain">
        </div>
        <div style="background:rgba(139,26,26,.07);border:1px solid rgba(139,26,26,.18);border-radius:8px;padding:.65rem .8rem;font-size:.78rem;color:var(--muted)">
          <i class="bi bi-shield-lock" style="color:var(--gold2)"></i> Tu QR solo lo usa el administrador para enviarte premios. Nadie más lo verá.
        </div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: `<i class='bi bi-upload'></i> ${esActualizacion?'Actualizar QR':'Subir QR'}`,
    cancelButtonText: "Cancelar",
    width:520, ...swal$,
    didOpen: () => {
      document.querySelectorAll(".metodo-card").forEach(card => {
        card.addEventListener("click", () => {
          document.querySelectorAll(".metodo-card").forEach(c => c.style.borderColor="var(--border)");
          card.style.borderColor="var(--gold2)";
        });
      });
      document.getElementById("qrFileInput").addEventListener("change", e => {
        const f = e.target.files[0];
        if (f) {
          const r = new FileReader();
          r.onload = ev => {
            const img  = document.getElementById("qrPreviewImg");
            const wrap = document.getElementById("qrPreviewWrap");
            img.src = ev.target.result;
            wrap.style.display = "block";
          };
          r.readAsDataURL(f);
        }
      });
    },
    preConfirm: () => {
      const metodo = document.querySelector("input[name='qrMetodo']:checked")?.value;
      const file   = document.getElementById("qrFileInput").files[0];
      if (!metodo) { Swal.showValidationMessage("Selecciona el tipo de pago"); return false; }
      if (!file)   { Swal.showValidationMessage("Sube la imagen de tu QR"); return false; }
      if (file.size > 5 * 1024 * 1024) { Swal.showValidationMessage("La imagen es muy grande (máx. 5 MB)"); return false; }
      return { metodo, file };
    }
  });
  if (!v) return;

  loading$("Subiendo tu QR...");
  let qr_url;
  try {
    qr_url = await uploadFile(v.file, "el-padrino/qr-cobros");
  } catch (e) {
    Swal.close();
    ok$("Error al subir imagen", "Intenta de nuevo.", "error");
    return;
  }

  const { error } = await supabase.from("profiles").update({
    qr_cobro_url:  qr_url,
    qr_metodo:     v.metodo,
    qr_verificado: false,
    qr_subido_at:  new Date().toISOString()
  }).eq("id", user.id);

  Swal.close();
  if (error) { ok$("Error al guardar", error.message, "error"); return; }

  qrState = { subido:true, verificado:false, url:qr_url, metodo:v.metodo, subidoAt: new Date().toISOString() };

  await Swal.fire({
    title: "✅ QR subido correctamente",
    html: `<div style="color:var(--muted)">El administrador lo revisará pronto. Una vez verificado, podrás comprar boletos y participar en sorteos.</div>`,
    icon:"success", confirmButtonText:"Entendido", ...swal$
  });

  // Recargar sección activa
  const active = document.querySelector(".section.active")?.id?.replace("sec-","");
  if (active) loadSection(active);
};

/* ── Ver mi QR actual ── */
window.modalVerMiQR = () => {
  if (!qrState.url) return;
  const metodoLabel = { tigo_money:"Tigo Money", billetera_bcb:"Billetera BCB", qr_simple:"QR Simple", efectivo_cuenta:"Cuenta bancaria" };
  Swal.fire({
    title: "Mi QR de cobros",
    html: `
      <img src="${qrState.url}" style="width:100%;max-height:300px;object-fit:contain;border-radius:10px;border:1px solid rgba(212,160,23,.2);margin-bottom:1rem" onerror="this.src='https://placehold.co/300x300/131009/d4a017?text=QR'">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;text-align:left">
        <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem .85rem">
          <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.2rem">Método</div>
          <div>${metodoLabel[qrState.metodo]||qrState.metodo||"—"}</div>
        </div>
        <div style="background:var(--ink3);border:1px solid var(--border);border-radius:8px;padding:.6rem .85rem">
          <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:.2rem">Estado</div>
          <div>${qrState.verificado?'<span style="color:#4ade80">✅ Verificado</span>':'<span style="color:#f59e0b">⏳ En revisión</span>'}</div>
        </div>
      </div>
      ${qrState.subidoAt?`<div style="margin-top:.6rem;font-size:.75rem;color:var(--muted);text-align:center">Subido el ${fmtDate(qrState.subidoAt)}</div>`:""}
      ${!qrState.verificado?`<div style="margin-top:1rem;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.18);border-radius:8px;padding:.65rem .8rem;font-size:.8rem;color:var(--muted)"><i class="bi bi-info-circle" style="color:#f59e0b"></i> El administrador está revisando tu QR. Te habilitará cuando esté listo.</div>`:""}`,
    showCancelButton: true,
    confirmButtonText: `<i class="bi bi-arrow-repeat"></i> Actualizar QR`,
    cancelButtonText: "Cerrar",
    width:420, ...swal$
  }).then(r => { if (r.isConfirmed) modalSubirQR(true); });
};

/* ════════════════════════════════════════
   NAVEGACIÓN
════════════════════════════════════════ */
const sections = {
  sorteos:   loadSorteos,
  historial: loadHistorial,
  pagos:     loadPagos,
  premios:   loadPremios,
  perfil:    loadPerfil,
};

function loadSection(sec) {
  document.querySelectorAll(".section").forEach(s => {
    s.classList.remove("active");
    s.style.display = "none";
  });
  const el = document.getElementById(`sec-${sec}`);
  if (el) { el.style.display = "block"; el.classList.add("active"); }
  document.querySelectorAll("[data-sec]").forEach(b => b.classList.toggle("active", b.dataset.sec === sec));
  if (window.innerWidth < 769) {
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sbOverlay")?.classList.remove("open");
  }
  sections[sec]?.();
}

document.querySelectorAll("[data-sec]").forEach(btn => {
  btn.addEventListener("click", () => loadSection(btn.dataset.sec));
});

$("btnRefresh") && $("btnRefresh").addEventListener("click", () => {
  const active = document.querySelector(".section.active")?.id?.replace("sec-","") || "sorteos";
  loadSection(active);
});

/* ════════════════════════════════════════
   SORTEOS ACTIVOS
════════════════════════════════════════ */
async function loadSorteos() {
  const container = $("sorteosList");
  if (!container) return;
  container.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const bannerEl = $("qrGateBanner");
  if (bannerEl) bannerEl.innerHTML = qrBanner();

  const { data: rounds } = await supabase
    .from("rounds").select("id,numero,estado,created_at,game_id")
    .eq("estado","abierta").order("created_at",{ascending:false});

  const gameIds = [...new Set((rounds||[]).map(r=>r.game_id).filter(Boolean))];
  let gamesMap = {};
  if (gameIds.length) {
    const { data: gd } = await supabase.from("games").select("id,nombre,descripcion,precio_boleto").in("id",gameIds);
    (gd||[]).forEach(g=>{ gamesMap[g.id]=g; });
  }

  const roundsData = await Promise.all((rounds||[]).map(async r => {
    const { data: parts } = await supabase.from("participations").select("boletos,user_id").eq("round_id",r.id);
    const cupos   = (parts||[]).reduce((sum,p)=>sum+(p.boletos||1),0);
    const miPart  = (parts||[]).find(p=>p.user_id===user.id);
    const { data: myPay } = await supabase.from("payments").select("id,estado").eq("round_id",r.id).eq("user_id",user.id).maybeSingle();
    return { ...r, cupos, game:gamesMap[r.game_id], misBoletos:miPart?.boletos||0, miPago:myPay };
  }));

  if (!roundsData.length) {
    container.innerHTML = `<div class="empty"><i class="bi bi-ticket-perforated"></i><p>No hay sorteos activos ahora mismo.</p></div>`;
    return;
  }

  container.innerHTML = roundsData.map(r => {
    const pct    = Math.round((r.cupos/25)*100);
    const lleno  = r.cupos >= 25;
    const tieneCompPend     = r.miPago?.estado === "pendiente";
    const tieneCompAprobado = r.miPago?.estado === "aprobado";

    let btnHtml = "";
    if (!puedeParticipar()) {
      if (!qrState.subido) {
        btnHtml = `<button class="btn btn-gold btn-md" onclick="modalSubirQR()"><i class="bi bi-qr-code-scan"></i> Subir QR primero</button>`;
      } else {
        btnHtml = `<button class="btn btn-ghost btn-md" disabled><i class="bi bi-hourglass-split"></i> QR en revisión</button>`;
      }
    } else if (lleno) {
      btnHtml = `<button class="btn btn-ghost btn-md" disabled><i class="bi bi-lock"></i> Ronda llena</button>`;
    } else if (tieneCompPend) {
      btnHtml = `<span class="bdg bdg-p"><i class="bi bi-hourglass-split"></i> Comprobante en revisión</span>`;
    } else if (tieneCompAprobado && r.misBoletos > 0) {
      btnHtml = `
        <span class="bdg bdg-ok"><i class="bi bi-check-circle-fill"></i> ${r.misBoletos} boleto${r.misBoletos>1?"s":""}</span>
        <button class="btn btn-ghost btn-sm" onclick="modalComprarBoleto('${r.id}','${(r.game?.nombre||"").replace(/'/g,"\\'")}','${r.numero}',${r.game?.precio_boleto||0},${r.cupos})">+ Más boletos</button>`;
    } else {
      btnHtml = `<button class="btn btn-red btn-md" onclick="modalComprarBoleto('${r.id}','${(r.game?.nombre||"").replace(/'/g,"\\'")}','${r.numero}',${r.game?.precio_boleto||0},${r.cupos})"><i class="bi bi-ticket-perforated-fill"></i> Comprar boleto</button>`;
    }

    return `
    <div class="sorteo-item">
      <div class="si-head">
        <div>
          <div class="si-nombre">${r.game?.nombre??"—"}</div>
          <div class="si-sub">Ronda #${r.numero} · ${r.game?.descripcion||""}</div>
        </div>
        ${r.game?.precio_boleto>0?`<div class="si-precio">${fmtMoney(r.game.precio_boleto)}<span>/boleto</span></div>`:""}
      </div>
      <div class="si-prog">
        <div class="prog-label"><span>Participantes</span><span>${r.cupos}/25${lleno?" · ✅ LLENO":""}</span></div>
        <div class="prog-bg"><div class="prog-fill${lleno?" full":""}" style="width:${Math.min(pct,100)}%"></div></div>
      </div>
      <div class="si-foot">
        ${r.misBoletos>0?`<div class="mi-boletos"><i class="bi bi-ticket-perforated-fill"></i> Mis boletos: <strong>${r.misBoletos}</strong></div>`:"<div></div>"}
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">${btnHtml}</div>
      </div>
    </div>`;
  }).join("");
}

/* ════════════════════════════════════════
   MODAL: COMPRAR BOLETO
════════════════════════════════════════ */
window.modalComprarBoleto = async (roundId, gameNombre, numRonda, precioBoleto, cuposActuales) => {
  if (!puedeParticipar()) { modalSubirQR(); return; }

  const cuposLibres = 25 - cuposActuales;
  const maxBoletos  = Math.min(cuposLibres, 5);
  if (maxBoletos <= 0) { toast("Esta ronda ya está llena", "error"); return; }

  const { value: v } = await Swal.fire({
    title: `Comprar boleto`,
    html: `
      <div style="text-align:left">
        <div style="background:var(--ink3);border:1px solid var(--bord-g);border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem">
          <div style="font-family:'Oswald',sans-serif;font-size:.9rem;color:#fff">${gameNombre} · Ronda #${numRonda}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.12rem">${cuposLibres} cupo${cuposLibres!==1?"s":""} disponible${cuposLibres!==1?"s":""}</div>
        </div>
        <div class="field" style="margin-bottom:1rem">
          <label>¿Cuántos boletos? (máx. ${maxBoletos})</label>
          <div style="display:flex;align-items:center;gap:.6rem;margin-top:.3rem">
            <button type="button" onclick="let v=parseInt(document.getElementById('bNum').value||1);if(v>1)document.getElementById('bNum').value=v-1;actualizarMontoPreview(${precioBoleto})" style="width:34px;height:34px;border-radius:50%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center">−</button>
            <input id="bNum" type="number" min="1" max="${maxBoletos}" value="1" oninput="actualizarMontoPreview(${precioBoleto})"
              style="width:60px;text-align:center;font-family:'Oswald',sans-serif;font-size:1.2rem;font-weight:700;background:var(--ink3);border:1px solid var(--border);color:var(--gold2);border-radius:8px;padding:.4rem">
            <button type="button" onclick="let v=parseInt(document.getElementById('bNum').value||1);if(v<${maxBoletos})document.getElementById('bNum').value=v+1;actualizarMontoPreview(${precioBoleto})" style="width:34px;height:34px;border-radius:50%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>
          </div>
        </div>
        ${precioBoleto>0?`
        <div id="montoPreview" style="background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:8px;padding:.7rem;margin-bottom:1rem;text-align:center">
          <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em">Total a pagar</div>
          <div id="montoPreviewVal" style="font-family:'Oswald',sans-serif;font-size:1.4rem;font-weight:700;color:var(--gold2)">${fmtMoney(precioBoleto)}</div>
        </div>`:""}
        <div class="field" style="margin-bottom:.85rem">
          <label>Método de pago *</label>
          <select id="bMetodo" class="swal2-input" style="margin:0;width:100%;background:#1b1610;border:1px solid rgba(139,26,26,.28);color:#e6dcc8;border-radius:8px;padding:.5rem .8rem">
            <option value="">— Seleccionar —</option>
            <option value="qr">QR / Tigo Money / Billetera</option>
            <option value="transferencia">Transferencia bancaria</option>
            <option value="yape">Yape</option>
            <option value="manual">Efectivo (entrega manual)</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:.85rem">
          <label>Comprobante de pago *</label>
          <input type="file" id="bComp" accept="image/*" style="width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--cream);border-radius:7px;padding:.45rem .8rem;font-size:.85rem">
          <img id="bPrev" style="display:none;width:100%;max-height:130px;object-fit:contain;margin-top:.5rem;border-radius:8px;border:1px solid var(--border)">
        </div>
        <div class="field">
          <label>Referencia / Nro. operación</label>
          <input id="bRef" class="swal2-input" placeholder="Opcional" style="margin:0;width:100%">
        </div>
      </div>`,
    showCancelButton:true,
    confirmButtonText:"<i class='bi bi-send-fill'></i> Enviar comprobante",
    cancelButtonText:"Cancelar",
    width:520, ...swal$,
    didOpen: () => {
      document.getElementById("bComp").addEventListener("change", e => {
        const f = e.target.files[0];
        if (f) { const r=new FileReader(); r.onload=ev=>{const i=document.getElementById("bPrev");i.src=ev.target.result;i.style.display="block"}; r.readAsDataURL(f); }
      });
    },
    preConfirm: () => {
      const boletos = parseInt(document.getElementById("bNum").value)||1;
      const metodo  = document.getElementById("bMetodo").value;
      const file    = document.getElementById("bComp").files[0];
      const ref     = document.getElementById("bRef").value.trim();
      if (boletos < 1 || boletos > maxBoletos) { Swal.showValidationMessage(`Entre 1 y ${maxBoletos} boletos`); return false; }
      if (!metodo)  { Swal.showValidationMessage("Selecciona el método de pago"); return false; }
      if (!file)    { Swal.showValidationMessage("Sube el comprobante de pago"); return false; }
      return { boletos, metodo, file, ref };
    }
  });
  if (!v) return;

  loading$("Enviando comprobante...");
  let comprobante_url;
  try {
    comprobante_url = await uploadFile(v.file, "el-padrino/comprobantes");
  } catch {
    Swal.close(); ok$("Error al subir imagen","","error"); return;
  }

  const monto = precioBoleto * v.boletos;
  const { error } = await supabase.from("payments").insert({
    user_id:             user.id,
    round_id:            roundId,
    metodo:              v.metodo,
    monto:               monto || 0,
    estado:              "pendiente",
    comprobante_url,
    referencia:          v.ref || null,
    boletos_solicitados: v.boletos,
  });

  Swal.close();
  if (error) { ok$("Error al registrar pago", error.message, "error"); return; }

  await Swal.fire({
    title:"✅ Comprobante enviado",
    html:`<div style="color:var(--muted)">El administrador revisará tu pago y confirmará tus <strong style="color:var(--gold2)">${v.boletos} boleto${v.boletos>1?"s":""}</strong> en la ronda.</div>`,
    icon:"success", confirmButtonText:"OK", ...swal$
  });
  loadSorteos();
};

window.actualizarMontoPreview = (precio) => {
  const n  = parseInt(document.getElementById("bNum")?.value||1);
  const el = document.getElementById("montoPreviewVal");
  if (el && precio > 0) el.textContent = fmtMoney(precio * n);
};

/* ════════════════════════════════════════
   MI HISTORIAL
════════════════════════════════════════ */
async function loadHistorial() {
  const el = $("historialList");
  if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data: parts } = await supabase
    .from("participations")
    .select("id,boletos,resultado,lugar,created_at,round_id")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false});

  if (!parts?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-clock-history"></i><p>Aún no has participado en ningún sorteo.</p></div>`;
    return;
  }

  const roundIds = [...new Set(parts.map(p=>p.round_id).filter(Boolean))];
  let roundsMap = {};
  if (roundIds.length) {
    const { data: rd } = await supabase.from("rounds").select("id,numero,game_id").in("id",roundIds);
    const gameIds = [...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm = {};
    if (gameIds.length) {
      const { data: gd } = await supabase.from("games").select("id,nombre").in("id",gameIds);
      (gd||[]).forEach(g=>{ gm[g.id]=g; });
    }
    (rd||[]).forEach(r=>{ roundsMap[r.id]={ ...r, game:gm[r.game_id] }; });
  }

  const lugarEmoji     = l => l===1?"🥇":l===2?"🥈":l===3?"🥉":"";
  const resultadoBadge = r => {
    if (r==="ganada")  return `<span class="bdg bdg-win">🏆 Ganador</span>`;
    if (r==="perdida") return `<span class="bdg bdg-bad">Sin suerte</span>`;
    return `<span class="bdg bdg-p">En curso</span>`;
  };

  el.innerHTML = `<div class="item-list">
    ${parts.map(p => {
      const ronda = roundsMap[p.round_id];
      return `
      <div class="list-item">
        <div class="li-icon ${p.resultado==="ganada"?"ic-win":p.resultado==="perdida"?"ic-bad":"ic-pend"}">
          <i class="bi bi-ticket-perforated-fill"></i>
        </div>
        <div class="li-body">
          <div class="li-title">${ronda?.game?.nombre??"Sorteo"} · Ronda ${ronda?.numero??"—"}</div>
          <div class="li-sub">${p.boletos||1} boleto${(p.boletos||1)!==1?"s":""} · ${fmtDateShort(p.created_at)}</div>
        </div>
        <div class="li-right">
          ${resultadoBadge(p.resultado)}
          ${p.lugar?`<div style="font-size:1.2rem;margin-top:.2rem">${lugarEmoji(p.lugar)}</div>`:""}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

/* ════════════════════════════════════════
   MIS PAGOS
════════════════════════════════════════ */
async function loadPagos() {
  const el = $("pagosList");
  if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data: pays } = await supabase
    .from("payments")
    .select("id,monto,metodo,estado,boletos_solicitados,comprobante_url,created_at,round_id")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false});

  if (!pays?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-receipt"></i><p>No has realizado ningún pago aún.</p></div>`;
    return;
  }

  const roundIds = [...new Set(pays.map(p=>p.round_id).filter(Boolean))];
  let roundsMap = {};
  if (roundIds.length) {
    const { data: rd } = await supabase.from("rounds").select("id,numero,game_id").in("id",roundIds);
    const gameIds = [...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm = {};
    if (gameIds.length) {
      const { data: gd } = await supabase.from("games").select("id,nombre").in("id",gameIds);
      (gd||[]).forEach(g=>{ gm[g.id]=g; });
    }
    (rd||[]).forEach(r=>{ roundsMap[r.id]={ ...r, game:gm[r.game_id] }; });
  }

  const estadoBadge = e => {
    if (e==="aprobado")  return `<span class="bdg bdg-ok">✅ Aprobado</span>`;
    if (e==="rechazado") return `<span class="bdg bdg-bad">❌ Rechazado</span>`;
    return `<span class="bdg bdg-p">⏳ En revisión</span>`;
  };

  el.innerHTML = `<div class="item-list">
    ${pays.map(p => {
      const ronda = roundsMap[p.round_id];
      return `
      <div class="list-item">
        <div class="li-icon ${p.estado==="aprobado"?"ic-win":p.estado==="rechazado"?"ic-bad":"ic-pend"}">
          <i class="bi bi-receipt"></i>
        </div>
        <div class="li-body">
          <div class="li-title">${ronda?.game?.nombre??"Sorteo"} · Ronda ${ronda?.numero??"—"}</div>
          <div class="li-sub">${p.boletos_solicitados||1} boleto${(p.boletos_solicitados||1)!==1?"s":""} · ${p.metodo||"—"} · ${fmtDateShort(p.created_at)}</div>
        </div>
        <div class="li-right">
          <div class="li-amount">${fmtMoney(p.monto)}</div>
          ${estadoBadge(p.estado)}
          ${p.comprobante_url?`<button class="btn btn-ghost btn-sm" style="margin-top:.3rem" onclick="window.open('${p.comprobante_url}','_blank')"><i class="bi bi-image"></i> Ver</button>`:""}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

/* ════════════════════════════════════════
   MIS PREMIOS RECIBIDOS
════════════════════════════════════════ */
async function loadPremios() {
  const el = $("premiosList");
  if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data: premiosData } = await supabase
    .from("prize_payments")
    .select("id,monto,metodo,referencia,notas,estado,lugar,created_at,round_id")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false});

  if (!premiosData?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-cash-coin"></i><p>Aún no has recibido premios. ¡Participa y gana!</p></div>`;
    return;
  }

  const roundIds = [...new Set(premiosData.map(p=>p.round_id).filter(Boolean))];
  let roundsMap = {};
  if (roundIds.length) {
    const { data: rd } = await supabase.from("rounds").select("id,numero,game_id").in("id",roundIds);
    const gameIds = [...new Set((rd||[]).map(r=>r.game_id).filter(Boolean))];
    let gm = {};
    if (gameIds.length) {
      const { data: gd } = await supabase.from("games").select("id,nombre").in("id",gameIds);
      (gd||[]).forEach(g=>{ gm[g.id]=g; });
    }
    (rd||[]).forEach(r=>{ roundsMap[r.id]={ ...r, game:gm[r.game_id] }; });
  }

  const lugarLabel  = l => l===1?"🥇 1er lugar":l===2?"🥈 2do lugar":"🥉 3er lugar";
  const metodoLabel = m => m==="qr"?"QR / Billetera":"Depósito en efectivo";

  // Calcular total ganado
  const totalGanado = premiosData.reduce((sum, p) => sum + Number(p.monto||0), 0);

  el.innerHTML = `
    <div class="premios-resumen">
      <div class="pr-box">
        <div class="pr-ico"><i class="bi bi-trophy-fill"></i></div>
        <div>
          <div class="pr-val">${premiosData.length}</div>
          <div class="pr-lbl">Premios recibidos</div>
        </div>
      </div>
      <div class="pr-box">
        <div class="pr-ico" style="color:var(--gold2)"><i class="bi bi-cash-stack"></i></div>
        <div>
          <div class="pr-val" style="color:var(--gold2)">${fmtMoney(totalGanado)}</div>
          <div class="pr-lbl">Total ganado</div>
        </div>
      </div>
    </div>
    <div class="item-list">
      ${premiosData.map(p => {
        const ronda = roundsMap[p.round_id];
        return `
        <div class="list-item">
          <div class="li-icon ic-win"><i class="bi bi-cash-coin"></i></div>
          <div class="li-body">
            <div class="li-title">${ronda?.game?.nombre??"Sorteo"} · Ronda ${ronda?.numero??"—"}</div>
            <div class="li-sub">${lugarLabel(p.lugar)} · ${metodoLabel(p.metodo)}${p.referencia?" · Ref: "+p.referencia:""}${p.notas?" · "+p.notas:""}</div>
          </div>
          <div class="li-right">
            <div class="li-amount" style="color:#4ade80">+ ${fmtMoney(p.monto)}</div>
            <span class="bdg bdg-ok">✅ Recibido</span>
            <div class="li-date">${fmtDateShort(p.created_at)}</div>
          </div>
        </div>`;
      }).join("")}
    </div>`;
}

/* ════════════════════════════════════════
   MI PERFIL COMPLETO
════════════════════════════════════════ */
async function loadPerfil() {
  const el = $("perfilContent");
  if (!el) return;
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  // Refrescar perfil desde BD
  const { data: prof } = await supabase.from("profiles").select("*").eq("id",user.id).single();
  if (prof) {
    qrState = {
      subido:    !!prof.qr_cobro_url,
      verificado:!!prof.qr_verificado,
      url:        prof.qr_cobro_url  || null,
      metodo:     prof.qr_metodo     || null,
      subidoAt:   prof.qr_subido_at  || null,
    };
    initUserUI(prof);
  }

  // Estadísticas del usuario
  const { data: parts }   = await supabase.from("participations").select("id,resultado,boletos").eq("user_id",user.id);
  const { data: pays }    = await supabase.from("payments").select("id,estado,monto").eq("user_id",user.id);
  const { data: premios } = await supabase.from("prize_payments").select("id,monto").eq("user_id",user.id);

  const totalJugados   = (parts||[]).reduce((s,p)=>s+(p.boletos||1),0);
  const totalGanados   = (parts||[]).filter(p=>p.resultado==="ganada").length;
  const totalGastado   = (pays||[]).filter(p=>p.estado==="aprobado").reduce((s,p)=>s+Number(p.monto||0),0);
  const totalGanado    = (premios||[]).reduce((s,p)=>s+Number(p.monto||0),0);
  const totalPremios   = (premios||[]).length;

  const metodoLabel = {
    tigo_money:"Tigo Money",
    billetera_bcb:"Billetera BCB",
    qr_simple:"QR Simple / Interbank",
    efectivo_cuenta:"Cuenta bancaria"
  };

  const initial = (prof?.username?.[0]||"?").toUpperCase();
  const memberSince = prof?.created_at ? fmtDateShort(prof.created_at) : "—";

  el.innerHTML = `
    <!-- TARJETA PERFIL -->
    <div class="panel perfil-card">
      <div class="perfil-header">
        <div class="perfil-avatar-wrap">
          <div class="perfil-avatar">${initial}</div>
          <div class="perfil-avatar-ring"></div>
        </div>
        <div class="perfil-info">
          <div class="perfil-username">${prof?.username??"—"}</div>
          <div class="perfil-email"><i class="bi bi-envelope"></i> ${user.email??"—"}</div>
          <div class="perfil-since"><i class="bi bi-calendar3"></i> Miembro desde ${memberSince}</div>
        </div>
      </div>
    </div>

    <!-- ESTADÍSTICAS -->
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-bar-chart-fill"></i>Mis estadísticas</div></div>
      <div class="panel-body">
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-val">${totalJugados}</div>
            <div class="stat-lbl"><i class="bi bi-ticket-perforated"></i> Boletos jugados</div>
          </div>
          <div class="stat-box stat-win">
            <div class="stat-val">${totalGanados}</div>
            <div class="stat-lbl"><i class="bi bi-trophy"></i> Sorteos ganados</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${fmtMoney(totalGastado)}</div>
            <div class="stat-lbl"><i class="bi bi-arrow-up-circle"></i> Total pagado</div>
          </div>
          <div class="stat-box stat-gold">
            <div class="stat-val">${fmtMoney(totalGanado)}</div>
            <div class="stat-lbl"><i class="bi bi-cash-stack"></i> Total ganado</div>
          </div>
        </div>
        ${totalJugados > 0 ? `
        <div style="margin-top:.8rem;background:rgba(212,160,23,.05);border:1px solid rgba(212,160,23,.12);border-radius:8px;padding:.65rem 1rem;font-size:.82rem;color:var(--muted)">
          <i class="bi bi-info-circle" style="color:var(--gold2)"></i>
          Tasa de victoria: <strong style="color:var(--gold2)">${totalJugados>0?Math.round((totalGanados/totalJugados)*100):0}%</strong>
          · ${totalPremios} premio${totalPremios!==1?"s":""} recibido${totalPremios!==1?"s":""}
        </div>`:""}
      </div>
    </div>

    <!-- QR DE COBROS -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><i class="bi bi-qr-code"></i>Mi QR de cobros</div>
        ${qrState.subido?`
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-ghost btn-sm" onclick="modalVerMiQR()"><i class="bi bi-eye"></i> Ver</button>
          <button class="btn btn-ghost btn-sm" onclick="modalSubirQR(true)"><i class="bi bi-arrow-repeat"></i> Cambiar</button>
        </div>`:""}
      </div>
      <div class="panel-body">
        ${!qrState.subido
          ? `<div class="qr-empty-state">
               <div class="qes-icon"><i class="bi bi-qr-code-scan"></i></div>
               <div class="qes-title">Sin QR de cobros</div>
               <div class="qes-sub">Es obligatorio para participar y recibir premios en cualquier sorteo.</div>
               <button class="btn btn-red btn-md" style="margin-top:1rem" onclick="modalSubirQR()">
                 <i class="bi bi-upload"></i> Subir mi QR ahora
               </button>
             </div>`
          : `<div class="qr-perfil-wrap">
               <div class="qr-img-container" onclick="modalVerMiQR()" title="Click para ver en grande">
                 <img src="${qrState.url}"
                      style="max-height:200px;max-width:100%;border-radius:10px;border:1px solid rgba(212,160,23,.22);object-fit:contain;cursor:pointer;transition:transform .2s"
                      onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'"
                      onerror="this.src='https://placehold.co/300x300/131009/d4a017?text=QR'">
                 <div class="qr-img-overlay"><i class="bi bi-zoom-in"></i> Ver en grande</div>
               </div>
               <div class="qr-details-grid">
                 <div class="qr-detail-box">
                   <div class="qdb-label">Método</div>
                   <div class="qdb-val">${metodoLabel[qrState.metodo]||qrState.metodo||"—"}</div>
                 </div>
                 <div class="qr-detail-box">
                   <div class="qdb-label">Estado</div>
                   <div class="qdb-val">${qrState.verificado
                     ?'<span class="bdg bdg-ok">✅ Verificado</span>'
                     :'<span class="bdg bdg-p">⏳ En revisión</span>'
                   }</div>
                 </div>
                 ${qrState.subidoAt?`
                 <div class="qr-detail-box" style="grid-column:1/-1">
                   <div class="qdb-label">Subido el</div>
                   <div class="qdb-val" style="font-size:.85rem">${fmtDate(qrState.subidoAt)}</div>
                 </div>`:""}
               </div>
               ${!qrState.verificado
                 ?`<div class="qr-pending-notice">
                     <i class="bi bi-hourglass-split" style="color:#f59e0b;font-size:1.1rem"></i>
                     <div>
                       <div style="font-size:.85rem;font-weight:600;color:#fbbf24">Verificación pendiente</div>
                       <div style="font-size:.78rem;color:var(--muted);margin-top:.1rem">El administrador está revisando tu QR. Mientras tanto no podrás comprar boletos.</div>
                     </div>
                   </div>`
                 :`<div class="qr-ok-notice">
                     <i class="bi bi-shield-check" style="color:#4ade80;font-size:1.1rem"></i>
                     <div>
                       <div style="font-size:.85rem;font-weight:600;color:#4ade80">QR verificado y activo</div>
                       <div style="font-size:.78rem;color:var(--muted);margin-top:.1rem">Puedes participar en todos los sorteos disponibles.</div>
                     </div>
                   </div>`
               }
               <div style="display:flex;gap:.5rem;margin-top:.5rem">
                 <button class="btn btn-ghost btn-sm" style="flex:1" onclick="window.open('${qrState.url}','_blank')">
                   <i class="bi bi-box-arrow-up-right"></i> Abrir imagen
                 </button>
                 <button class="btn btn-red btn-sm" style="flex:1" onclick="modalSubirQR(true)">
                   <i class="bi bi-arrow-repeat"></i> Actualizar QR
                 </button>
               </div>
             </div>`
        }
      </div>
    </div>

    <!-- DATOS DE CUENTA -->
    <div class="panel">
      <div class="panel-head"><div class="panel-title"><i class="bi bi-person-gear"></i>Datos de cuenta</div></div>
      <div class="panel-body">
        <div class="account-rows">
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-person"></i> Usuario</div>
            <div class="ar-val">${prof?.username??"—"}</div>
          </div>
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-envelope"></i> Email</div>
            <div class="ar-val">${user.email??"—"}</div>
          </div>
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-shield"></i> Rol</div>
            <div class="ar-val"><span class="bdg bdg-p">${prof?.rol??"usuario"}</span></div>
          </div>
          <div class="account-row">
            <div class="ar-label"><i class="bi bi-activity"></i> Estado</div>
            <div class="ar-val"><span class="bdg bdg-ok">${prof?.estado??"activo"}</span></div>
          </div>
        </div>
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
          <button class="btn btn-ghost btn-sm" style="width:100%" onclick="modalCambiarPassword()">
            <i class="bi bi-key"></i> Cambiar contraseña
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ════════════════════════════════════════
   MODAL: CAMBIAR CONTRASEÑA
════════════════════════════════════════ */
window.modalCambiarPassword = async () => {
  const { value: v } = await Swal.fire({
    title: "🔑 Cambiar contraseña",
    html: `
      <div style="text-align:left">
        <div class="field" style="margin-bottom:.85rem">
          <label>Nueva contraseña *</label>
          <input id="pwNew" type="password" class="swal2-input" placeholder="Mínimo 6 caracteres" style="margin:0;width:100%">
        </div>
        <div class="field">
          <label>Confirmar contraseña *</label>
          <input id="pwConf" type="password" class="swal2-input" placeholder="Repite la contraseña" style="margin:0;width:100%">
        </div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: "<i class='bi bi-check-lg'></i> Cambiar",
    cancelButtonText: "Cancelar",
    width:420, ...swal$,
    preConfirm: () => {
      const np = document.getElementById("pwNew").value;
      const cp = document.getElementById("pwConf").value;
      if (np.length < 6)   { Swal.showValidationMessage("Mínimo 6 caracteres"); return false; }
      if (np !== cp)        { Swal.showValidationMessage("Las contraseñas no coinciden"); return false; }
      return { password: np };
    }
  });
  if (!v) return;

  loading$("Actualizando...");
  const { error } = await supabase.auth.updateUser({ password: v.password });
  Swal.close();
  if (error) { ok$("Error", error.message, "error"); return; }
  ok$("✅ Contraseña actualizada", "Tu contraseña ha sido cambiada exitosamente.", "success");
};

/* ════════════════════════════════════════
   ARRANQUE
════════════════════════════════════════ */
loadSection("sorteos");