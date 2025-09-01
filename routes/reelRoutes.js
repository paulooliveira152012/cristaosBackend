const express = require("express");
const multer = require("multer");
const { uploadToS3 } = require("../utils/s3Uploader");
const fs = require("fs");
const Reel = require("../models/Reels");
const mongoose = require("mongoose");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// Utils
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
function requireBody(res, fields = []) {
  console.log("verifying requireBody...");
  return (body) => {
    for (const f of fields) {
      console.log("fields:", fields);
      if (!body?.[f]) {
        console.log("missing fields", f);
        res.status(400).json({ message: `Missing field: ${f}` });
        return false;
      }
    }
    return true;
  };
}

router.get("/allreels", async (req, res) => {
  console.log("🟢 Fetch all reels");
  try {
    const reels = await Reel.find({})
      .populate({
        path: "userId",
        select: "username profileImage", 
        match: { isBanned: false },
      })                   // autor do reel
      .populate({
        path: "comments.userId", 
        select: "username profileImage",
        match: { isBanned: false },
      })          // AUTOR DO COMENTÁRIO
      .sort({ createdAt: -1 })
      .lean(); // manda objetos plain (melhor p/ frontend)

    res.status(200).json({ reels });
  } catch (error) {
    console.error("error:", error);
    res.status(500).json({ message: "Error fetching reels", error });
  }
});


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

/** LIKE / UNLIKE (toggle) */
router.post("/like", async (req, res) => {
  console.log("Route for liking a reel reached");
  try {
    const ok = requireBody(res, ["reelId", "userId"])(req.body);
    if (!ok) return console.log("req body not ok");

    const { reelId, userId } = req.body;
    if (!isValidId(reelId) || !isValidId(userId)) {
      return res.status(400).json({ message: "Invalid reelId or userId" });
    }

    const reel = await Reel.findById(reelId).select("likes");
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    const already = reel.likes.map(String).includes(String(userId));
    const update = already
      ? { $pull: { likes: userId } }
      : { $addToSet: { likes: userId } };

    const updated = await Reel.findByIdAndUpdate(reelId, update, {
      new: true,
    }).select("likes");
    console.log("like updated!");
    return res.json({ liked: !already, likesCount: updated.likes.length });
  } catch (err) {
    console.error("LIKE error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

/** SAVE / UNSAVE (toggle) */
router.post("/save", async (req, res) => {
  console.log("Route for saving a reel reached");
  try {
    const ok = requireBody(res, ["reelId", "userId"])(req.body);
    if (!ok) return;

    const { reelId, userId } = req.body;
    if (!isValidId(reelId) || !isValidId(userId)) {
      return res.status(400).json({ message: "Invalid reelId or userId" });
    }

    const reel = await Reel.findById(reelId).select("savedBy");
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    const already = reel.savedBy.map(String).includes(String(userId));
    const update = already
      ? { $pull: { savedBy: userId } }
      : { $addToSet: { savedBy: userId } };

    const updated = await Reel.findByIdAndUpdate(reelId, update, {
      new: true,
    }).select("savedBy");
    return res.json({ saved: !already, savedCount: updated.savedBy.length });
  } catch (err) {
    console.error("SAVE error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

/** CREATE COMMENT */
/** CREATE COMMENT */
router.post("/comments", async (req, res) => {
  console.log("Route for commenting a reel reached");
  try {
    const ok = requireBody(res, ["reelId", "userId", "text"])(req.body);
    if (!ok) return;

    const { reelId, userId, text } = req.body;
    if (!isValidId(reelId) || !isValidId(userId)) {
      return res.status(400).json({ message: "Invalid reelId or userId" });
    }

    const comment = {
      userId,
      text: String(text).trim(),
      createdAt: new Date(),
    };
    if (!comment.text) {
      return res.status(400).json({ message: "Text is required" });
    }

    // 1) insere o comentário
    const updated = await Reel.findByIdAndUpdate(
      reelId,
      { $push: { comments: comment } },
      { new: true, select: "comments" }
    );
    if (!updated) return res.status(404).json({ message: "Reel not found" });

    // 2) busca apenas o último comentário, populado
    const populated = await Reel.findById(reelId)
      .select({ comments: { $slice: -1 } })
      .populate("comments.userId", "username profileImage")
      .lean();

    const last = populated?.comments?.[0] || null;

    return res.status(201).json({
      comment: last,                         // <-- agora vem com userId.username
      commentsCount: updated.comments.length
    });
  } catch (err) {
    console.error("COMMENT create error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});


/** LIST COMMENTS */
router.post("/comments/list", async (req, res) => {
  console.log("Route lisitng a reel's comments reached");
  try {
    const ok = requireBody(res, ["reelId", "userId"])(req.body);
    if (!ok) return;

    const { reelId } = req.body;
    if (!isValidId(reelId))
      return res.status(400).json({ message: "Invalid reelId" });

    const reel = await Reel.findById(reelId).select("comments").lean();
    if (!reel) return res.status(404).json({ message: "Reel not found" });

    // ordena do mais recente pro mais antigo (opcional)
    const comments = (reel.comments || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.json({ comments, commentsCount: comments.length });
  } catch (err) {
    console.error("COMMENT list error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

/** SHARE (register) */
router.post("/share", async (req, res) => {
  console.log("Route for sharing a reel reached");
  try {
    const ok = requireBody(res, ["reelId", "userId", "url"])(req.body);
    if (!ok) return;

    const { reelId, userId, url } = req.body;
    if (!isValidId(reelId) || !isValidId(userId)) {
      return res.status(400).json({ message: "Invalid reelId or userId" });
    }

    const shareDoc = { userId, url, createdAt: new Date() };
    const updated = await Reel.findByIdAndUpdate(
      reelId,
      { $push: { shares: shareDoc } },
      { new: true, select: "shares" }
    );
    if (!updated) return res.status(404).json({ message: "Reel not found" });

    return res
      .status(201)
      .json({ ok: true, sharesCount: updated.shares.length });
  } catch (err) {
    console.error("SHARE error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

module.exports = router;
