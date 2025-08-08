// modelo de Reels
const mongoose = require("mongoose");

const ReelsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: false,
  },
  description: {
    type: String,
    required: true,
  },
  videoUrl: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // campos esperados
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  comments: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  shares: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      url: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

module.exports = mongoose.model("Reels", ReelsSchema);
// O modelo ReelsSchema define a estrutura dos dados de um Reel, incluindo o usuário que o criou, título, descrição, URL do vídeo e data de criação.
// Ele é exportado como um modelo Mongoose para ser usado em outras partes da aplicação.
// O modelo é usado para criar, ler, atualizar e excluir Reels no banco de dados MongoDB.
// O campo userId é uma referência ao modelo User, permitindo associar cada Reel a um usuário específico.
// O campo createdAt é automaticamente preenchido com a data e hora atuais quando um novo Reel é criado.
// O modelo é utilizado em rotas e controladores para gerenciar a lógica de negócios relacionada aos Reels, como criação, listagem e exclusão.
// O modelo ReelsSchema é utilizado em rotas e controladores para gerenciar a lógica de negócios relacionada aos Reels, como criação, listagem e exclusão.
