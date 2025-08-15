const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "like",
        "comment",
        "friend_request",
        "reply",
        "share",
        "friend_request_accepted", // ✅ adicione isso aqui
        "chat_request", // <-- novo tipo mais semântico
        "chat_reinvite",
        "comment_like",
        "reply_like",
      ],

      required: true,
    },
    content: {
      type: String,
    },
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
    },
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
    },

    // 👇 NOVO
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// útil para apagar/achar convites ligados a uma conversa
notificationSchema.index({ recipient: 1, type: 1, conversationId: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
