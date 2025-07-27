const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: false,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  }, // quem enviou
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false, // só obrigatório em DMs
  },
  username: {
    type: String,
    required: true,
  },
  profileImage: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  system: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// precisa de roomId ou conversationId
messageSchema.pre("validate", function (next) {
  if (!this.roomId && !this.conversationId) {
    return next(new Error("A mensagem precisa de roomId ou conversationId."));
  }
  next();
});

module.exports = mongoose.model("Message", messageSchema);
