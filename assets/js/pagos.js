import { uploadFile } from "./cloudinary.js";

document.getElementById("filePago").addEventListener("change", async (e) => {
  const file = e.target.files[0];

  const url = await uploadFile(file, "el-padrino/comprobantes");

  console.log("Comprobante subido:", url);
});
