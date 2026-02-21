# 🎲 Juego de Sorteos

Plataforma simple de sorteos con cupos limitados (25 jugadores).

## Tecnologías
- Supabase
- Cloudinary
- HTML + CSS + JavaScript

## Reglas del juego
- Cada sorteo acepta 25 jugadores
- Puede haber varios sorteos activos
- Se genera un ganador automático

## Estructura
- index.html → landing
- login.html → acceso
- sorteos.html → lista
- jugar.html → sala del sorteo


// comprobante de pago
uploadFile(file, "el-padrino/comprobantes");

// avatar usuario
uploadFile(file, "el-padrino/avatars");

// premio sorteo
uploadFile(file, "el-padrino/premios");


el-padrino/
 ├── comprobantes/
 ├── avatars/
 └── premios/


Paleta de colores 

    :root {
    --bg: #020617;
    --card: #020617;
    --primary: #16a34a;   /* verde casino */
    --secondary: #eab308; /* oro suave */
    --text: #e5e7eb;
    --muted: #94a3b8;
    }


admin.js

import { uploadFile } from "./cloudinary.js";

document.getElementById("premio").addEventListener("change", async (e) => {
  const file = e.target.files[0];

  const premioUrl = await uploadFile(file, "el-padrino/premios");

  console.log("Premio:", premioUrl);
});

pagos.js
import { uploadFile } from "./cloudinary.js";

document.getElementById("filePago").addEventListener("change", async (e) => {
  const file = e.target.files[0];

  const url = await uploadFile(file, "el-padrino/comprobantes");

  console.log("Comprobante subido:", url);
});

perfil.js
import { uploadFile } from "./cloudinary.js";

document.getElementById("avatar").addEventListener("change", async (e) => {
  const file = e.target.files[0];

  const avatarUrl = await uploadFile(file, "el-padrino/avatars");

  console.log("Avatar:", avatarUrl);
});



    :root{
      --ink:#0c0a07;
      --paper:#f5ede0;
      --paper2:#ede3d4;
      --red:#8b1a1a;
      --red2:#b52020;
      --gold:#b8860b;
      --gold2:#d4a017;
      --white:#fff;
      --text:#1a1209;
      --muted:#5a4a36;
      --border:rgba(139,26,26,.22);
    }
