const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.Mixed, // Allows ObjectId or String
    required: false,
  }, // Room ID can now be an ObjectId for regular rooms or a string for special rooms like 'mainChatRoom'
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: false,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  }, // Reference to the user who sent the message
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
  timestamp: {
    type: Date,
    default: Date.now, // Automatically set the timestamp to the current date and time
  },
});

// validação custom: precisa ter roomId OU conversationId
messageSchema.pre("validate", function (next) {
  if (!this.roomId && !this.conversationId) {
    return next(new Error("A mensagem precisa de roomId ou conversationId."));
  }
  next();
});

module.exports = mongoose.model("Message", messageSchema);
