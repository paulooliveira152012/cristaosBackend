// models/MuralMessage.js
const mongoose = require("mongoose");

const MuralMessageSchema = new mongoose.Schema(
  {
    owner:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // dono do perfil
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // quem escreveu
    text:   { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// Índices para buscas por mural (do dono) e ordenação recency
MuralMessageSchema.index({ owner: 1, createdAt: -1 });
MuralMessageSchema.index({ owner: 1, sender: 1, createdAt: -1 });

module.exports = mongoose.model("MuralMessage", MuralMessageSchema);
