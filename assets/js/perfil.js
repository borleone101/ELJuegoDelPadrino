import { uploadFile } from "./cloudinary.js";

document.getElementById("avatar").addEventListener("change", async (e) => {
  const file = e.target.files[0];

  const avatarUrl = await uploadFile(file, "el-padrino/avatars");

  console.log("Avatar:", avatarUrl);
});
