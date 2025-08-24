const express = require("express");
const router = express.Router();
const Listing = require("../models/Listing"); // modelo do MongoDB
const Add = require("../models/Add"); // modelo do MongoDB para Add
const { verifyToken, verifyLeader } = require("../utils/auth"); // middlewares de autenticação/autorização

// Rota para listar todas as postagens (acesso de líder)
router.get("/admFetchAds", async (req, res) => {
  console.log(" 🟢 🟢 🟢 GET ADM ROUTE REACHED")
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