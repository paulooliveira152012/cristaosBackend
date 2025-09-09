// models/ThemeStudy.js
const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

// Helper: normaliza o tema para slug consistente
const toSlug = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

// Categorias sugeridas (pode expandir)
const THEME_ENUM = [
  "theology",
  "apologetics",
  "historic",
  "ecclesiastical", // “eckesiasticly” normalizado
  "doctrinary",
  "pastoral",
  "devotional",
  "missions",
  "ethics",
  "hermeneutics",
  "other",
];

const ImageSchema = new Schema(
  {
    url: {
      type: String,
      trim: true,
      // opcional: exija URL http/https
      match: [/^https?:\/\/.+/i, "URL da imagem inválida."],
    },
    alt: { type: String, trim: true, maxlength: 140 },
  },
  { _id: false }
);

const ThemeStudySchema = new Schema(
  {
    // autor (quem submeteu) — obrigatório
    author: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // título do “blog” — obrigatório
    title: { type: String, required: true, trim: true, maxlength: 180 },

    // tema — obrigatório (normalizado para slug e validado)
    theme: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      set: toSlug,
      enum: THEME_ENUM,
      index: true,
    },

    // conteúdo principal — obrigatório (markdown ou texto)
    content: { type: String, required: true, trim: true },

    // 1 imagem opcional
    image: { type: ImageSchema, default: undefined },

    // fluxo de aprovação
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    approvedBy: { type: Types.ObjectId, ref: "User", index: true },
    approvedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    // opcional: quando for exibido/publicado
    publishedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

// Regras de consistência simples
ThemeStudySchema.pre("save", function (next) {
  // se aprovado, deve ter approvedBy/approvedAt
  if (this.status === "approved") {
    if (!this.approvedBy) {
      return next(new Error("approvedBy é obrigatório quando status=approved."));
    }
    if (!this.approvedAt) this.approvedAt = new Date();
    if (!this.publishedAt) this.publishedAt = new Date();
  }
  // se rejeitado, é útil ter um motivo
  if (this.status === "rejected" && !this.rejectionReason) {
    this.rejectionReason = "Rejeitado sem justificativa detalhada.";
  }
  next();
});

// Índices úteis
ThemeStudySchema.index({ status: 1, theme: 1, createdAt: -1 });
ThemeStudySchema.index({ author: 1, createdAt: -1 });
// Busca por texto (título/conteúdo/tema)
ThemeStudySchema.index({ title: "text", content: "text", theme: "text" });

module.exports = mongoose.model("ThemeStudy", ThemeStudySchema);
module.exports.THEME_ENUM = THEME_ENUM;
