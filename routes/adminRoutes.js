const express = require("express");
const router = express.Router();
const Listing = require("../models/Listing"); // modelo do MongoDB
const { verifyToken, verifyLeader } = require("../utils/auth"); // middlewares de autenticação/autorização

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

module.exports = router;