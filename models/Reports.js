// models/Report.js
const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const EvidenceSchema = new Schema(
  {
    kind: { type: String, enum: ["image", "url", "text", "file"], required: true },
    // um desses campos abaixo será usado conforme o kind
    url: { type: String, trim: true },          // ex.: link público ou CDN
    text: { type: String, trim: true, maxlength: 2000 }, // relato textual/quote
    storageKey: { type: String, trim: true },   // caminho/ID no seu storage
    mime: { type: String, trim: true },
    size: { type: Number },                      // bytes (opcional)
    addedBy: { type: Types.ObjectId, ref: "User" },
    addedAt: { type: Date, default: Date.now },
    meta: { type: Schema.Types.Mixed },          // qualquer outra info útil
  },
  { _id: false }
);

const ReportSchema = new Schema(
  {
    // quem foi reportado
    reportedUser: { type: Types.ObjectId, ref: "User", required: true, index: true },

    // quem reportou
    reportingUser: { type: Types.ObjectId, ref: "User", required: true, index: true },

    // texto livre do motivo
    reason: { type: String, required: true, trim: true, maxlength: 500 },

    // categoria rápida pra filtros (opcional, mas ajuda a operar a fila)
    category: {
      type: String,
      enum: ["abuse", "harassment", "spam", "nudity", "hate", "self-harm", "other"],
      default: "other",
      index: true,
    },

    // de onde veio o report
    source: {
      type: String,
      enum: ["profile", "listing", "comment", "message", "mural", "other"],
      default: "other",
      index: true,
    },

    // IDs adicionais pra dar contexto ao moderador
    context: {
      listing: { type: Types.ObjectId, ref: "Listing" },
      comment: { type: Types.ObjectId },                 // se tiver coleção/Model, referencie
      message: { type: Types.ObjectId, ref: "Message" }, // idem
      url: { type: String, trim: true },                 // permalink do front
    },

    evidence: [EvidenceSchema],

    // workflow de moderação
    status: {
      type: String,
      enum: ["open", "reviewing", "dismissed", "actioned", "pending", ],
      default: "open",
      index: true,
    },
    assignedTo: { type: Types.ObjectId, ref: "User" }, // moderador responsável

    // resultado/ação tomada (se houver)
    action: {
      type: String,
      enum: ["none", "warn", "strike", "ban", "other"],
      default: "none",
    },
    actionNotes: { type: String, trim: true, maxlength: 1000 },
    actionBy: { type: Types.ObjectId, ref: "User" },
    actionAt: { type: Date },
  },
  {
    timestamps: true,     // createdAt, updatedAt
    versionKey: false,
  }
);

/* ========= Indexes úteis ========= */
ReportSchema.index({ reportedUser: 1, status: 1, createdAt: -1 }); // fila por usuário
ReportSchema.index({ reportingUser: 1, createdAt: -1 });           // histórico do autor
ReportSchema.index({ "context.listing": 1 });
ReportSchema.index({ category: 1, status: 1 });

// (opcional) ajuda a evitar flood de duplicatas exatas do mesmo autor na mesma “peça”
// Você não consegue “unique por janela de tempo” via índice, mas pode checar na rota.
ReportSchema.index({
  reportingUser: 1,
  reportedUser: 1,
  source: 1,
  "context.listing": 1,
  "context.message": 1,
  reason: 1,
});

module.exports = mongoose.model("Report", ReportSchema);
