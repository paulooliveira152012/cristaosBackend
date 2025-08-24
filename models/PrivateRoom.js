const mongoose = require('mongoose');

// models/PrivateRoom.js
const PrivateRoomSchema = new mongoose.Schema(
  {
    roomTitle: { type: String, required: true },
    description: { type: String, default: "" },
    roomImage: { type: String, alias: "imageUrl" }, // persiste como roomImage
    isPrivate: { type: Boolean, default: true },
    passwordHash: { type: String },
    createdBy: {
      _id: { type: mongoose.Schema.Types.ObjectId, required: false },
      username: { type: String, required: false },
      profileImage: { type: String },
    },
    roomMembers: [{ _id: mongoose.Schema.Types.ObjectId, username: String, profileImage: String }],
    currentUsersInRoom: [{ _id: mongoose.Schema.Types.ObjectId, username: String, profileImage: String }],
    currentUsersSpeaking: [{ _id: mongoose.Schema.Types.ObjectId, username: String, profileImage: String }],
    createdAt: { type: Date, default: Date.now },
  },
  { toJSON: { virtuals: true }, toObject: { virtuals: true } } // <-- importante
);

module.exports = mongoose.model("PrivateRoom", PrivateRoomSchema);