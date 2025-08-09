// routes/publicChurchRoutes.js (ou no seu arquivo atual)
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Church = require("../models/church");

// GET público
router.get("/getChurchInfo/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "id inválido" });
  }

  try {
    const church = await Church.findById(id).lean();
    if (!church) return res.status(404).json({ message: "church not found" });

    // opcional: cache leve de 60s
    res.set("Cache-Control", "public, max-age=60");
    return res.json(church);
  } catch (err) {
    console.error("Error finding church", err);
    return res.status(500).json({ message: "internal error" });
  }
});

module.exports = router;
