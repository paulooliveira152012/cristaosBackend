const express = require("express");
const multer = require("multer");
const { uploadToS3 } = require("../utils/s3Uploader");
const fs = require("fs");
const Reel = require("../models/Reels");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post(
  "/upload-reel",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  async (req, res) => {
    console.log("POST /upload-reel route reached");
    console.log("Files received:", req.files);

    const { description, userId, tags } = req.body;
    console.log("Form data received:", { description, userId, tags });

    if (!req.files?.video) {
      console.error("Video file is required.");
      return res.status(400).json({ message: "Video is required." });
    }

    if (!description || !userId) {
      console.error("Form data is incomplete:", { description, userId });
      return res.status(400).json({ message: "Form data is incomplete." });
    }

    try {
      // Verifica se o vídeo foi enviado
      const videoFile = req.files.video[0];
      const thumbnailFile = req.files.thumbnail?.[0] || null;

      // Faz o upload do vídeo para o S3
      const videoUrl = await uploadToS3(videoFile.path, "video/mp4");
      const thumbnailUrl = thumbnailFile
        ? await uploadToS3(thumbnailFile.path, thumbnailFile.mimetype)
        : null;
      
      console.log("Video URL da s3:", videoUrl);

      // Limpeza dos arquivos temporários
      fs.unlinkSync(videoFile.path);
      if (thumbnailFile) fs.unlinkSync(thumbnailFile.path);

      // Salvar no MongoDB (coleção Reels)
      console.log("Saving reel to database...");
      const newReel = new Reel({
        userId,
        videoUrl,
        thumbnailUrl,
        description,
        tags: tags ? tags.split(",").map((t) => t.trim()) : [],
      });

      await newReel.save();

      console.log("Reel saved successfully:", newReel);

      res.status(201).json({
        message: "Reel uploaded and saved successfully!",
        reel: newReel,
      });
    } catch (error) {
      console.error("Error uploading reel:", error);
      res.status(500).json({ message: "Erro ao fazer upload do reel", error });
    }
  }
);

module.exports = router;
