// models/Study.js
const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const StudySchema = new Schema(
  {
    bookId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,               // "genesis", "exodo", etc (slug)
      match: [/^[a-z0-9-]+$/, "bookId inválido."],
      index: true,
    },

    chapter: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "chapter deve ser inteiro ≥ 1",
      },
      index: true,
    },

    title: { type: String, required: true, trim: true, maxlength: 180 },
    summary: { type: String, trim: true, maxlength: 500 },

    // conteúdo principal do estudo (markdown ou texto)
    content: { type: String, required: true, trim: true },

    // metadados
    tags: [{ type: String, trim: true, lowercase: true }],
    sources: [{ type: String, trim: true }],

    // autor (quem publicou)
    author: { type: Types.ObjectId, ref: "User", required: true, index: true },

    // visibilidade e status editorial
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["public", "members", "leaders"],
      default: "public",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

// Um mesmo autor só pode publicar 1 estudo por capítulo de um livro.
// (Se quiser permitir múltiplos por autor, remova este índice.)
StudySchema.index({ bookId: 1, chapter: 1, author: 1 }, { unique: true });

// Para buscas/listagens
StudySchema.index({ bookId: 1, chapter: 1, status: 1, visibility: 1 });

module.exports = mongoose.model("Study", StudySchema);
