// models/Conversation.js
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    // quem está "dentro" da conversa
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],

    // última mensagem (opcional)
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "DirectMessage" },

    // quem saiu por último (para permitir reinvite)
    leavingUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // quem convidou (mostra “aguardando…” para ele até o outro aceitar)
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // quem precisa aceitar para a conversa “ativar”
    waitingUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
