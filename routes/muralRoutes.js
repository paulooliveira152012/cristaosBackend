// routes/muralRoutes.js
const express = require("express");
const router = express.Router();
const MuralMessage = require("../models/MuralMessage");
const { protect } = require("../utils/auth"); // use se quiser autenticar por cookie JWT

// POST: criar mensagem no mural de :userId
router.post("/newMuralMessage/:userId", /*protect,*/ async (req, res) => {
  console.log("submiting new mural message...")
  try {
    const { userId } = req.params;
    let { text, senderId } = req.body;

    console.log(`user: ${senderId} writing on ${userId}'s mural: ${text}`)

    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "Texto é obrigatório." });
    }
    text = String(text).trim().slice(0, 500);

    // Se usar protect, troque para: const senderId = req.user._id;
    if (!senderId /* && !req.user */) {
      return res.status(401).json({ message: "Não autenticado." });
    }

    const msg = await MuralMessage.create({
      owner: userId,
      sender: senderId,
      text,
    });

    // Popula para devolver pronto pra UI
    await msg.populate("sender", "username profileImage");
    return res.status(201).json({ message: msg });
  } catch (err) {
    console.error("POST /users/:userId/mural error:", err);
    return res.status(500).json({ message: "Erro ao escrever no mural." });
  }
});

// GET: listar mural (paginação por cursor de data/id)
router.get("/getMuralContent/:userId", async (req, res) => {
  // console.log("🟢🟢🟢 getting mural content...")
  try {
    const { userId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor; // ISO date ou ObjectId

    const query = { owner: userId };
    if (cursor) {
      // cursor como createdAt ISO
      query.createdAt = { $lt: new Date(cursor) };
    }

    const items = await MuralMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("sender", "username profileImage")
      .lean();

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? page[page.length - 1].createdAt : null;

    return res.json({ items: page, nextCursor });
  } catch (err) {
    console.error("GET /users/:userId/mural error:", err);
    return res.status(500).json({ message: "Erro ao buscar mural." });
  }
});

// DELETE: remover mensagem (dono do perfil OU autor da mensagem)
router.delete("/users/:userId/mural/:messageId", /*protect,*/ async (req, res) => {
  try {
    const { userId, messageId } = req.params;
    const requesterId = req.body.requesterId /* || req.user._id */;

    const msg = await MuralMessage.findById(messageId);
    if (!msg || String(msg.owner) !== String(userId)) {
      return res.status(404).json({ message: "Mensagem não encontrada." });
    }

    const isOwner = String(msg.owner) === String(requesterId);
    const isSender = String(msg.sender) === String(requesterId);

    if (!isOwner && !isSender) {
      return res.status(403).json({ message: "Sem permissão para remover." });
    }

    await MuralMessage.deleteOne({ _id: messageId });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /users/:userId/mural/:messageId error:", err);
    return res.status(500).json({ message: "Erro ao remover mensagem." });
  }
});

module.exports = router;
