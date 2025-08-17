const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fromUser:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: {
      type: String,
      enum: [
        "like",
        "comment",
        "friend_request",
        "friend_request_accepted",
        "share",
        "reply",
        "comment_like",
        "reply_like",

        // DM / chat
        "chat_request",    // convite pendente
        "chat_reinvite",   // (se usar reconvite explícito)
        "chat_declined",   // convidado recusou
        "chat_started",    // convidado aceitou
      ],
      required: true,
    },

    content:   { type: String },

    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing" },
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" },

    // vínculo com DM
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", default: null },

    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/* ======================
 * Índices recomendados
 * ====================== */

// carregar caixa do usuário rapidamente, ordenando por recentes
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// busca direta por um tipo/conversa (já tinha)
notificationSchema.index({ recipient: 1, type: 1, conversationId: 1 });

// **idempotência**: impede múltiplas chat_request NÃO LIDAS do mesmo conversationId
notificationSchema.index(
  { recipient: 1, type: 1, conversationId: 1, isRead: 1 },
  { unique: true, partialFilterExpression: { type: "chat_request", isRead: false } }
);

/* ======================
 * Helpers (opcionais)
 * ====================== */

// marcar todas como lidas do usuário
notificationSchema.statics.markAllReadFor = function (userId) {
  return this.updateMany({ recipient: userId, isRead: false }, { $set: { isRead: true } });
};

// remover convites ligados a uma conversa (use em accept/reject)
notificationSchema.statics.removeChatRequestsFor = function (userId, conversationId) {
  return this.deleteMany({
    recipient: userId,
    type: "chat_request",
    conversationId
  });
};

module.exports = mongoose.model("Notification", notificationSchema);
