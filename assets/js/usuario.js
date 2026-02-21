import { supabase } from "./supabase.js";
import { uploadFile } from "./cloudinary.js";

/* ══════════════════════════════════════
   CONSTANTES
══════════════════════════════════════ */
const QR_URL = "https://res.cloudinary.com/daxmlrngo/image/upload/v1771711030/WhatsApp_Image_2026-02-21_at_17.56.08_oepisx.jpg";
const CUPOS_MAX = 25;

const swal$ = {
  background: '#131009', color: '#e6dcc8',
  confirmButtonColor: '#8b1a1a', cancelButtonColor: '#221c14',
};

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
const $  = (id) => document.getElementById(id);
const toast = (title, icon = "success") => Swal.fire({
  title, icon, toast: true, position: "top-end",
  showConfirmButton: false, timer: 3000, timerProgressBar: true,
  background: '#1b1610', color: '#e6dcc8',
  iconColor: icon === "success" ? "#4ade80" : icon === "error" ? "#f87171" : "#d4a017"
});

function fmtDate(d) {
  return new Date(d).toLocaleDateString("es-BO", {
    day: "2-digit", month: "short", year: "numeric"
  });
}
function fmtMoney(n) { return `Bs ${Number(n || 0).toFixed(2)}`; }

function badge(est) {
  const m = {
    pendiente: "bdg bdg-p", aprobado: "bdg bdg-ok", rechazado: "bdg bdg-bad",
    ganada: "bdg bdg-win", perdida: "bdg bdg-bad",
  };
  const labels = {
    pendiente: "⏳ Pendiente", aprobado: "✅ Aprobado", rechazado: "❌ Rechazado",
    ganada: "🏆 Ganador", perdida: "Perdida",
  };
  return `<span class="${m[est] || 'bdg bdg-p'}">${labels[est] || est}</span>`;
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
const { data: { user } } = await supabase.auth.getUser();
if (!user) { window.location.href = "../../auth/login.html"; throw 0; }

const { data: profile, error: pErr } = await supabase
  .from("profiles")
  .select("username, email, saldo, rol, estado")
  .eq("id", user.id)
  .single();

if (pErr || !profile || profile.estado !== "activo") {
  await supabase.auth.signOut();
  window.location.href = "../../auth/login.html"; throw 0;
}

// Redirigir admins/trabajadores a su panel
if (["admin", "trabajador"].includes(profile.rol)) {
  window.location.href = "../../public/admin/index.html"; throw 0;
}

/* ══════════════════════════════════════
   UI INICIAL
══════════════════════════════════════ */
const inicial = profile.username[0].toUpperCase();
$("tbAvatar").textContent = inicial;
$("tbName").textContent   = profile.username;
$("heroSaldo").textContent = Number(profile.saldo || 0).toFixed(2);
$("heroSub").textContent   = `Bienvenido, ${profile.username}`;

/* ══════════════════════════════════════
   LOGOUT
══════════════════════════════════════ */
$("logoutBtn").addEventListener("click", async () => {
  const r = await Swal.fire({
    title: "¿Cerrar sesión?", icon: "question",
    showCancelButton: true, confirmButtonText: "Sí, salir",
    cancelButtonText: "Cancelar", ...swal$
  });
  if (r.isConfirmed) {
    await supabase.auth.signOut();
    window.location.href = "../../auth/login.html";
  }
});

/* ══════════════════════════════════════
   STATS HERO
══════════════════════════════════════ */
async function loadStats() {
  const [
    { count: jugados },
    { count: ganados },
    { count: pendientes }
  ] = await Promise.all([
    supabase.from("participations").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("participations").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("resultado", "ganada"),
    supabase.from("payments").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("estado", "pendiente"),
  ]);
  $("stJugados").textContent = jugados ?? 0;
  $("stGanados").textContent = ganados ?? 0;
  $("stPend").textContent    = pendientes ?? 0;
}

/* ══════════════════════════════════════
   SORTEOS
══════════════════════════════════════ */
async function loadSorteos() {
  const el = $("sorteosList");
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  // Traer rondas abiertas con info del sorteo
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, numero, estado, created_at, games(id, nombre, descripcion, precio_boleto)")
    .eq("estado", "abierta")
    .order("created_at", { ascending: true });

  if (!rounds?.length) {
    el.innerHTML = `
      <div class="empty">
        <i class="bi bi-ticket-perforated"></i>
        <p>No hay sorteos activos en este momento.<br>Vuelve pronto, El Padrino siempre tiene algo.</p>
      </div>`;
    return;
  }

  // Para cada ronda: cupos usados + si el usuario ya está inscrito
  const enriched = await Promise.all(rounds.map(async r => {
    const [{ count: cupos }, { data: myPart }] = await Promise.all([
      supabase.from("participations").select("*", { count: "exact", head: true }).eq("round_id", r.id),
      supabase.from("participations").select("id, resultado").eq("round_id", r.id).eq("user_id", user.id).maybeSingle()
    ]);
    return { ...r, cupos: cupos ?? 0, myPart };
  }));

  el.innerHTML = enriched.map(r => {
    const pct   = Math.round((r.cupos / CUPOS_MAX) * 100);
    const libre = CUPOS_MAX - r.cupos;
    const full  = r.cupos >= CUPOS_MAX;
    const casi  = pct >= 80 && !full;
    const precio = r.games?.precio_boleto || 0;
    const yaInscrito = !!r.myPart;
    const tienePagoAprobado = r.myPart != null; // si está en participations ya fue aprobado o inscrito

    let btnHtml = "";
    if (full) {
      btnHtml = `<button class="btn-comprar" disabled><i class="bi bi-lock-fill"></i> Mesa llena</button>`;
    } else if (yaInscrito) {
      btnHtml = `<span class="btn-inscrito"><i class="bi bi-check-circle-fill"></i> Ya inscrito</span>`;
    } else {
      btnHtml = `<button class="btn-comprar" onclick="window.__comprar('${r.id}','${r.games?.id}','${r.games?.nombre?.replace(/'/g,"\\'")}',${precio},'${r.numero}')">
        <i class="bi bi-ticket-perforated-fill"></i> Comprar boleto
      </button>`;
    }

    return `
    <div class="sorteo-card">
      <div class="sc-body">
        <div class="sc-row1">
          <div>
            <div class="sc-title">${r.games?.nombre ?? "—"}</div>
            <div class="sc-round"><i class="bi bi-arrow-repeat"></i>Ronda #${r.numero}</div>
          </div>
          <div class="sc-price">
            ${precio > 0 ? fmtMoney(precio) : "Gratis"}
            <span>por boleto</span>
          </div>
        </div>
        <div class="prog-wrap">
          <div class="prog-meta">
            <span>${libre > 0 ? `${libre} cupo${libre !== 1 ? "s" : ""} libre${libre !== 1 ? "s" : ""}` : "Mesa completa"}</span>
            <strong>${r.cupos} / ${CUPOS_MAX}</strong>
          </div>
          <div class="prog-bg">
            <div class="prog-fill ${full ? "full" : casi ? "almost" : ""}" style="width:${pct}%"></div>
          </div>
        </div>
        ${yaInscrito ? `<div class="my-ticket-notice"><i class="bi bi-check-circle-fill"></i>Tienes un boleto en esta ronda. ¡Suerte!</div>` : ""}
      </div>
      <div class="sc-foot">
        <div class="sc-foot-info">
          <i class="bi bi-people-fill"></i>${r.cupos} participante${r.cupos !== 1 ? "s" : ""}
          ${casi ? `<span style="color:var(--gold2);margin-left:.4rem"><i class="bi bi-lightning-fill"></i>¡Casi lleno!</span>` : ""}
          ${full ? `<span style="color:#4ade80;margin-left:.4rem"><i class="bi bi-lock-fill"></i>Cerrado</span>` : ""}
        </div>
        ${btnHtml}
      </div>
    </div>`;
  }).join("");
}

/* ══════════════════════════════════════
   FLUJO COMPRA DE BOLETO
   Paso 1: Confirmar compra → Paso 2: Mostrar QR → Paso 3: Subir comprobante
══════════════════════════════════════ */
window.__comprar = async (roundId, gameId, gameName, precio, numRonda) => {
  /* ── PASO 1: Confirmación ── */
  const paso1 = await Swal.fire({
    title: `Comprar boleto`,
    html: `
      <div style="text-align:left">
        <div style="background:var(--ink3);border:1px solid var(--bord-g);border-radius:10px;padding:.85rem 1rem;margin-bottom:.85rem">
          <div style="font-family:'Oswald',sans-serif;font-size:1rem;font-weight:600;color:#fff;margin-bottom:.3rem">${gameName}</div>
          <div style="font-size:.82rem;color:var(--muted)">Ronda #${numRonda}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.85rem">
          <div style="background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:8px;padding:.6rem .8rem;text-align:center">
            <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.2rem">A pagar</div>
            <div style="font-family:'Oswald',sans-serif;font-size:1.2rem;font-weight:700;color:var(--gold2)">${precio > 0 ? fmtMoney(precio) : "Gratis"}</div>
          </div>
          <div style="background:rgba(139,26,26,.07);border:1px solid rgba(139,26,26,.18);border-radius:8px;padding:.6rem .8rem;text-align:center">
            <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:.2rem">Tu saldo</div>
            <div style="font-family:'Oswald',sans-serif;font-size:1.2rem;font-weight:700;color:var(--cream)">${fmtMoney(profile.saldo)}</div>
          </div>
        </div>
        <div class="info-row"><i class="bi bi-info-circle-fill"></i><span>Deberás pagar por QR/transferencia y subir el comprobante. Tu boleto se confirma cuando el admin aprueba el pago.</span></div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: `<i class="bi bi-ticket-perforated-fill"></i> Sí, comprar`,
    cancelButtonText: "Cancelar",
    ...swal$
  });
  if (!paso1.isConfirmed) return;

  /* ── PASO 2: QR + Subir comprobante ── */
  let archivoSeleccionado = null;

  const paso2 = await Swal.fire({
    title: "Pago y comprobante",
    width: 480,
    html: `
      <div style="text-align:left">
        <div class="info-row" style="margin-bottom:.7rem">
          <i class="bi bi-exclamation-triangle-fill" style="color:var(--gold2)"></i>
          <span>Escanea el QR, realiza el pago de <strong style="color:var(--gold2)">${precio > 0 ? fmtMoney(precio) : "Bs 0.00"}</strong> y luego sube la foto del comprobante.</span>
        </div>
        <div class="qr-wrap">
          <img src="${QR_URL}" alt="QR de pago" onerror="this.src='https://placehold.co/200x200/131009/d4a017?text=QR'">
          <div class="qr-label">QR para realizar el pago</div>
        </div>
        <div style="margin-bottom:.5rem;font-family:'Oswald',sans-serif;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">
          📎 Subir comprobante *
        </div>
        <div class="upload-area" id="uploadArea" onclick="document.getElementById('fileInput').click()">
          <input type="file" id="fileInput" accept="image/jpeg,image/png,image/jpg" style="display:none">
          <i class="bi bi-cloud-upload-fill" id="uploadIcon"></i>
          <p id="uploadText">Toca para seleccionar imagen</p>
          <p class="ua-accept" id="uploadAccept">JPG, PNG · Máx 5MB</p>
          <img id="previewImg" style="width:100%;max-height:130px;object-fit:contain;border-radius:8px;border:1px solid rgba(212,160,23,.2);margin-top:.6rem;display:none">
        </div>
        <div id="fileNameShow" style="font-size:.78rem;color:var(--gold2);margin-top:.4rem;display:none">
          <i class="bi bi-check-circle-fill"></i> <span id="fileNameText"></span>
        </div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: `<i class="bi bi-send-fill"></i> Enviar comprobante`,
    cancelButtonText: "Cancelar",
    ...swal$,
    didOpen: () => {
      const fileInput  = document.getElementById("fileInput");
      const area       = document.getElementById("uploadArea");
      const preview    = document.getElementById("previewImg");
      const nameShow   = document.getElementById("fileNameShow");
      const nameText   = document.getElementById("fileNameText");
      const uploadIcon = document.getElementById("uploadIcon");
      const uploadText = document.getElementById("uploadText");

      // Drag & drop
      area.addEventListener("dragover", e => { e.preventDefault(); area.classList.add("dragover"); });
      area.addEventListener("dragleave", () => area.classList.remove("dragover"));
      area.addEventListener("drop", e => {
        e.preventDefault(); area.classList.remove("dragover");
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      });

      fileInput.addEventListener("change", () => {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
      });

      function handleFile(f) {
        // Validaciones
        if (!["image/jpeg","image/png","image/jpg"].includes(f.type)) {
          Swal.showValidationMessage("Solo se aceptan imágenes JPG o PNG"); return;
        }
        if (f.size > 5 * 1024 * 1024) {
          Swal.showValidationMessage("La imagen no puede superar 5MB"); return;
        }
        archivoSeleccionado = f;
        // Preview
        const reader = new FileReader();
        reader.onload = ev => {
          preview.src = ev.target.result;
          preview.style.display = "block";
          uploadIcon.style.display = "none";
          uploadText.textContent = "Imagen cargada ✓";
          uploadText.style.color = "#4ade80";
        };
        reader.readAsDataURL(f);
        nameText.textContent = f.name;
        nameShow.style.display = "flex";
        nameShow.style.alignItems = "center";
        nameShow.style.gap = ".3rem";
      }
    },
    preConfirm: () => {
      if (!archivoSeleccionado) {
        Swal.showValidationMessage("Debes subir el comprobante de pago para continuar");
        return false;
      }
      return true;
    }
  });

  if (!paso2.isConfirmed || !archivoSeleccionado) return;

  /* ── PASO 3: Procesar ── */
  Swal.fire({
    title: "Enviando comprobante...",
    html: `<div style="color:var(--muted)">Subiendo imagen y registrando tu boleto</div>`,
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
    ...swal$
  });

  try {
    // 1. Subir imagen a Cloudinary
    const comprobanteUrl = await uploadFile(archivoSeleccionado, "el-padrino/comprobantes");

    // 2. Registrar pago en BD
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        round_id: roundId,
        metodo: "qr",
        monto: precio,
        estado: "pendiente",
        comprobante_url: comprobanteUrl,
      })
      .select("id")
      .single();

    if (payErr) throw new Error(payErr.message);

    // 3. Registrar participación como "pendiente" de aprobación
    //    (el admin aprueba el pago → el sistema confirma participación)
    //    Solo creamos la participación DESPUÉS de que el admin apruebe
    //    Por ahora, quedará en payments pendiente.

    Swal.close();

    await Swal.fire({
      title: "¡Comprobante enviado!",
      html: `
        <div style="text-align:center">
          <div style="font-size:2.5rem;margin-bottom:.6rem">🎟️</div>
          <p style="margin-bottom:.7rem">Tu comprobante fue enviado correctamente.</p>
          <div style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.18);border-radius:8px;padding:.7rem;font-size:.83rem;color:var(--muted)">
            <i class="bi bi-clock" style="color:var(--gold2)"></i>
            El admin revisará tu pago. Una vez aprobado, tu boleto quedará confirmado.
          </div>
        </div>`,
      icon: "success",
      confirmButtonText: "Entendido",
      ...swal$
    });

    // Recargar sorteos y stats
    await Promise.all([loadSorteos(), loadStats()]);
    window.showSection("pagos");
    loadPagos();

  } catch (err) {
    Swal.close();
    Swal.fire({
      title: "Error",
      html: `<div style="color:#f87171">${err.message || "No se pudo procesar. Intenta de nuevo."}</div>`,
      icon: "error",
      confirmButtonText: "Cerrar",
      ...swal$
    });
  }
};

/* ══════════════════════════════════════
   HISTORIAL DE PARTICIPACIONES
══════════════════════════════════════ */
async function loadHistorial() {
  const el = $("historialList");
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data } = await supabase
    .from("participations")
    .select("id, resultado, created_at, rounds(numero, estado, sorteado_at, games(nombre))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!data?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-clock-history"></i><p>Aún no has participado en ningún sorteo.</p></div>`;
    return;
  }

  const iconMap = {
    ganada: { cls: "icon-win", icon: "bi-trophy-fill" },
    perdida: { cls: "icon-lose", icon: "bi-x-circle-fill" },
    pendiente: { cls: "icon-pend", icon: "bi-hourglass-split" },
  };

  el.innerHTML = `<div class="hist-list">${data.map(p => {
    const res = p.resultado || "pendiente";
    const { cls, icon } = iconMap[res] || iconMap.pendiente;
    const gameName = p.rounds?.games?.nombre ?? "Sorteo";
    const roundNum = p.rounds?.numero ?? "—";
    return `
    <div class="hist-item">
      <div class="item-icon ${cls}"><i class="bi ${icon}"></i></div>
      <div class="item-body">
        <div class="item-title">${gameName}</div>
        <div class="item-sub">Ronda #${roundNum} · ${fmtDate(p.created_at)}</div>
      </div>
      <div class="item-right">
        ${badge(res)}
        ${p.resultado === "ganada" ? `<div style="font-size:.72rem;color:var(--gold2);margin-top:.2rem">🏆 Ganaste</div>` : ""}
      </div>
    </div>`;
  }).join("")}</div>`;
}

/* ══════════════════════════════════════
   MIS PAGOS / COMPROBANTES
══════════════════════════════════════ */
async function loadPagos() {
  const el = $("pagosList");
  el.innerHTML = `<div class="spin-wrap"><div class="spinner"></div></div>`;

  const { data } = await supabase
    .from("payments")
    .select("id, monto, metodo, estado, comprobante_url, created_at, rounds(numero, games(nombre))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!data?.length) {
    el.innerHTML = `<div class="empty"><i class="bi bi-receipt"></i><p>No has enviado ningún comprobante aún.</p></div>`;
    return;
  }

  el.innerHTML = `<div class="pago-list">${data.map(p => {
    const gameName = p.rounds?.games?.nombre ?? "Sorteo";
    const roundNum = p.rounds?.numero ?? "—";
    return `
    <div class="pago-item">
      <div class="item-icon icon-pay"><i class="bi bi-receipt"></i></div>
      <div class="item-body">
        <div class="item-title">${gameName} · R${roundNum}</div>
        <div class="item-sub">${fmtDate(p.created_at)} · ${p.metodo}</div>
      </div>
      <div class="item-right">
        <div class="item-amount">${fmtMoney(p.monto)}</div>
        ${badge(p.estado)}
        ${p.comprobante_url ? `<div style="margin-top:.3rem">
          <a href="${p.comprobante_url}" target="_blank" style="font-size:.72rem;color:var(--gold2);display:flex;align-items:center;gap:.2rem;justify-content:flex-end">
            <i class="bi bi-image"></i>Ver imagen
          </a>
        </div>` : ""}
      </div>
    </div>`;
  }).join("")}</div>`;

  // Actualizar badge de pagos pendientes
  const pend = data.filter(p => p.estado === "pendiente").length;
  $("stPend").textContent = pend;
}

/* ══════════════════════════════════════
   SECTION LOADERS + REFRESH
══════════════════════════════════════ */
window.__sectionLoaders = {
  sorteos:   loadSorteos,
  historial: loadHistorial,
  pagos:     loadPagos,
};

$("btnRefresh").addEventListener("click", loadSorteos);

/* ══════════════════════════════════════
   INICIO
══════════════════════════════════════ */
await Promise.all([loadStats(), loadSorteos()]);