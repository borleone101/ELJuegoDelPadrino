// assets/js/cloudinary.js

const CLOUD_NAME = "daxmlrngo";
const UPLOAD_PRESET = "el_padrino_public";

export async function uploadFile(file, folder = "el-padrino") {
  if (!file) throw new Error("No se envió ningún archivo");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(error);
    throw new Error("Error al subir a Cloudinary");
  }

  const data = await response.json();
  return data.secure_url;
}
