// ================================================
// server/models/roadmap.model.js  (Mongoose Model)
// ================================================
const mongoose = require('mongoose');

const RoadmapSchema = new mongoose.Schema(
  {
    // Texto livre com notas gerais do andamento (release notes curtas, tarefas ativas, etc.)
    notes: { type: String, default: '' },

    // Quem editou por último (opcional, útil para auditoria rápida)
    updatedBy: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
    },
  },
  { timestamps: true } // cria createdAt / updatedAt
);

// Index para ordenar por atualizações mais recentes em consultas
RoadmapSchema.index({ updatedAt: -1 });

const Roadmap =
  mongoose.models.Roadmap || mongoose.model('Roadmap', RoadmapSchema);

module.exports = Roadmap;
