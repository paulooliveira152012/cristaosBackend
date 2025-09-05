const express = require("express");
const router = express.Router();
const Listing = require("../models/Listing"); // modelo do MongoDB
const User = require("../models/User");
const mongoose = require("mongoose");
const Add = require("../models/Add"); // modelo do MongoDB para Add
const { verifyToken, verifyLeader } = require("../utils/auth"); // middlewares de autenticação/autorização
const { protect } = require("../utils/auth");

// ================ Visualize ================

router.get("/getAllUsers", protect, async (req, res) => {
  console.log("getting all memb ers")

  try {
    const allUsers = await User.find({})
    console.log("allUsers:", allUsers)
    res.send(allUsers)
  } catch {
    console.log("Erro ao buscar usuarios para pagina de gerenciamento")
  }
})


// ================ Modify users ==============
router.post("/makeLeader", protect, async (req, res) => {
  console.log("making a leader... ")
  // const { mainLeader, userId } = req.body
  // console.log(`mainLeader ${mainLeader} making ${userId} a leader`)
  // res.json({ "response:", response })
})

// POST /api/adm/ban
// routes/adm.js
router.post("/ban", protect, async (req, res) => {
  try {
    if (!req.user?.leader) return res.status(403).json({ message: "Apenas líderes" });

    const { userId, reason } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: "userId inválido/ausente." });
    if (String(req.user._id) === String(userId))
      return res.status(400).json({ message: "Você não pode banir a si mesmo." });

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isBanned: true,
          bannedAt: new Date(),
          bannedBy: req.user._id,
          banReason: reason || "",
        },
        $inc: { tokenVersion: 1 }, // invalida todas as sessões desse usuário
      },
      { new: true, projection: "-password" }
    );
    if (!updated) return res.status(404).json({ message: "Usuário não encontrado." });

    // OPCIONAL: derrubar em tempo real
    req.app.get("io")?.to(`user:${userId}`).emit("force-logout", { reason: "BANNED" });

    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error("POST /ban error:", err);
    return res.status(500).json({ message: "Erro ao banir usuário." });
  }
});



// POST /api/adm/unban
// POST /api/adm/unban
router.post("/unban", protect, verifyLeader, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "userId inválido/ausente." });
    }

    // idempotente: só “desbanir” quem está banido
    const updated = await User.findOneAndUpdate(
      { _id: userId, isBanned: true },
      {
        $set: {
          isBanned: false,
          unbannedAt: new Date(),
          unbannedBy: req.user._id,
        },
        // limpa os marcadores do ban atual (mantém histórico/strikes separados)
        $unset: { bannedAt: "", bannedBy: "", banReason: "" },
        // NÃO mexa em tokenVersion aqui — ban já invalidou tokens.
      },
      { new: true, projection: "-password" }
    );

    if (!updated) {
      const exists = await User.exists({ _id: userId });
      if (!exists) return res.status(404).json({ message: "Usuário não encontrado." });
      // já não estava banido
      return res.json({ ok: true, alreadyUnbanned: true });
    }

    // (Opcional) Avisar cliente(s) conectados que o status mudou:
    // io.to(`user:${userId}`).emit("accountStatusChanged", { isBanned: false });

    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error("POST /unban error:", err);
    return res.status(500).json({ message: "Erro ao desbanir usuário." });
  }
});

// GET /api/adm/bannedUsers
router.get("/bannedUsers", protect, async (req, res) => {
  try {
    // ajuste para o nome da flag no seu user (isLeader, leader, roles etc.)
    const isLeader = req.user?.isLeader ?? req.user?.leader ?? false;
    if (!isLeader) {
      return res.status(403).json({ message: "Apenas líderes" });
    }

    const bannedUsers = await User.find(
      { isBanned: true },
      // selecione só o que precisa expor ao front
      "_id username email profileImage isBanned bannedAt banReason"
    )
      .sort({ bannedAt: -1, updatedAt: -1 })
      .lean();

    return res.json({ bannedUsers });
  } catch (err) {
    console.error("bannedUsers error:", err);
    return res.status(500).json({ message: "Erro ao listar usuários banidos" });
  }
});

// PUT /api/adm/strike
router.put("/strike", protect, async (req, res) => {
  console.log("strike route")
  try {
    const { listingId, userId, strikeReason } = req.body;
    console.log("listingId, userId, strikeReason:", listingId, userId, strikeReason)

    if (!userId) return res.status(400).json({ message: "userId é obrigatório" });
    // (Opcional) exija permissão:
    if (!req.user?.leader) return res.status(403).json({ message: "Apenas líderes podem aplicar strike" });

    const user = await User.findById(userId).select("strikes isBanned");
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
    if (user.isBanned) return res.status(409).json({ message: "Usuário já está banido" });

    // prepara o objeto strike
    const strike = {
      listingId: listingId && mongoose.isValidObjectId(listingId) ? listingId : null,
      reason: strikeReason || "Violação das regras",
      issuedBy: req.user._id,               // vindo do middleware `protect`
      issuedAt: new Date(),
    };

    // garante array
    if (!Array.isArray(user.strikes)) user.strikes = [];
    user.strikes.push(strike);

    // se chegou a 3 strikes → ban
    if (user.strikes.length >= 3) {
      user.isBanned = true;
      user.bannedAt = new Date();
      user.bannedBy = req.user._id;
      user.banReason = `Ban automático após 3 strikes. Último motivo: ${strike.reason}`;
      await user.save();
      return res.json({
        ok: true,
        action: "banned",
        strikes: user.strikes.length,
        userId: user._id,
      });
    }

    // apenas registrou o strike
    await user.save();
    return res.json({
      ok: true,
      action: "strike_added",
      strikes: user.strikes.length,
      userId: user._id,
    });
  } catch (err) {
    console.error("PUT /adm/strike error:", err);
    return res.status(500).json({ message: "Erro ao aplicar strike" });
  }
});

router.get("/strikeHistory/:userId", async (req, res) => {
  console.log("route for fetching strike history...")
  const { userId } = req.params;
  console.log("userId:", userId)

  try {
    const user = await User.findById(userId)

    // console.log("user:", user)

    const strikes = user.strikes

    console.log("strikes:", strikes)

    res.send(strikes)
    
  } catch (err) {
    console.log("error:", err)
  }
  
})



// =============== Listings ===================

// Rota para listar todas as postagens (acesso de líder)
router.get("/admFetchAds", async (req, res) => {
  // console.log(" 🟢 🟢 🟢 GET ADM ROUTE REACHED")
  try {
    const adds = await Add.find().populate("createdBy", "username");
    // console.log("Fetched adds:", adds);
    if (!adds || adds.length === 0) {
      return res.status(404).json({ message: "Nenhuma postagem encontrada." });
    }
    // console.log("Fetched adds:", adds);
    res.status(200).json(adds);
  } catch (error) {
    console.error("Erro ao buscar postagens:", error);
    res.status(500).json({ message: "Erro interno ao buscar postagens." });
  }
});

// Rota para deletar uma postagem (acesso de líder)
router.delete("/admDeleteListing/:listingId", async (req, res) => {
    console.log("DELETE ADM ROUTE REACHED")
  const { listingId } = req.params;

  try {
    const deleted = await Listing.findByIdAndDelete(listingId);

    if (!deleted) {
      return res.status(404).json({ message: "Postagem não encontrada." });
    }

    res.status(200).json({ message: "Postagem deletada com sucesso." });

  } catch (error) {
    console.error("Erro ao deletar postagem:", error);
    res.status(500).json({ message: "Erro interno ao deletar postagem." });
  }
});


// Rota para adicionar um novo Add (acesso de líder)
router.post("/admListAdd", verifyToken, verifyLeader, async (req, res) => {
  console.log("List Add Route REACHED")
  const { title, description, price, imageUrl, link, userId } = req.body;

  try {
    const newListing = new Add({
      userId,
      title,
      description,
      price,
      imageUrl,
      link,
      createdBy: req.user._id // assume que o usuário autenticado é o criador
    });

    await newListing.save();
    res.status(201).json({ message: "Postagem criada com sucesso.", listing: newListing });

  } catch (error) {
    console.error("Erro ao criar postagem:", error);
    res.status(500).json({ message: "Erro interno ao criar postagem." });
  }
});

// Rota para editar um anuncio (acesso de líder)
router.put("/admEditAd/:addId", verifyToken, verifyLeader, async (req, res) => {
  console.log("PUT ADM ROUTE REACHED")
  const { addId } = req.params;
  const { title, description, price, imageUrl } = req.body;

  try {
    const updatedAdd = await Add.findByIdAndUpdate(
      addId,
      { title, description, price, imageUrl },
      { new: true }
    );

    if (!updatedAdd) {
      return res.status(404).json({ message: "Anuncio não encontrado." });
    }

    res.status(200).json({ message: "Anuncio atualizado com sucesso.", add: updatedAdd });

  } catch (error) {
    console.error("Erro ao atualizar anuncio:", error);
    res.status(500).json({ message: "Erro interno ao atualizar anuncio." });
  }
});


// Rota para buscar uma postagem específica (acesso de líder)
router.get("/admFetchAd/:addId", verifyToken, verifyLeader, async (req, res) => {
  console.log("GET ADM SINGLE ROUTE REACHED")
  const { addId } = req.params;

  try {
    const add = await Add.findById(addId).populate("createdBy", "username");

    if (!add) {
      return res.status(404).json({ message: "Postagem não encontrada." });
    }

    res.status(200).json(add);

  } catch (error) {
    console.error("Erro ao buscar postagem:", error);
    res.status(500).json({ message: "Erro interno ao buscar postagem." });
  }
});

module.exports = router;