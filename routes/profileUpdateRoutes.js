// routes/profileUpdateRoutes.js
// index.js esta indexando como "/profile"
// no server.js todas as rotas sao importadas do index.js com um prefixo de "/api"

const express = require("express");
const os = require("os");
const fs = require("fs/promises");
const multer = require("multer");
const User = require("../models/User");
const { protect } = require("../utils/auth");
const s3Uploader = require("../utils/s3Uploader");

const router = express.Router();

// Salva em diretório temporário do SO (rápido e simples)
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 7 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    file.mimetype?.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Arquivo precisa ser imagem"));
  },
});

// PUT /api/profile/coverImage
router.put("/coverImage", protect, upload.single("file"), async (req, res) => {
  console.log("PUT /api/profile/coverImage");
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("req.file:", req.file);          // 👈 veja se o multer populou
  console.log("req.user:", req.user?.id || req.user?._id); // 👈 protect OK?

  try {
    if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado" });

    const userId = String(req.user?.id || req.user?._id || "");
    if (!userId) return res.status(401).json({ message: "Não autenticado" });

    // 👇 seu util: precisa de path (string) e contentType
    const url = await s3Uploader.uploadToS3(req.file.path, req.file.mimetype);

    console.log("✅ url:", url)
    

    // limpa o arquivo temporário
    await fs.unlink(req.file.path).catch(() => {});

    const updated = await User.findByIdAndUpdate(
      userId,
      { profileCoverImage: url },
      { new: true, select: "profileCoverImage" }
    );
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });

    res.json({ url: updated.profileCoverImage });
  } catch (err) {
    console.error("Error updating cover image:", err);
    res.status(500).json({ message: "Error updating cover image." });
  }
});

module.exports = router;
