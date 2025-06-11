const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.Mixed,  // Allows ObjectId or String
    required: true
  }, // Room ID can now be an ObjectId for regular rooms or a string for special rooms like 'mainChatRoom'
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }, // Reference to the user who sent the message
  username: {
    type: String,
    required: true
  },
  profileImage: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now, // Automatically set the timestamp to the current date and time
  }
});

module.exports = mongoose.model('Message', messageSchema);
