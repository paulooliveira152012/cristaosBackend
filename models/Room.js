// models/Room.js

const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema({
  roomTitle: { type: String, required: true },
  description: { type: String, default: "" },
  roomImage: { type: String, required: false },
  isPrivate: { type: Boolean, default: false },
  passwordHash: { type: String }, // only for private rooms
  createdBy: {
    _id: { type: mongoose.Schema.Types.ObjectId, required: false },
    username: { type: String, required: false },
    profileImage: { type: String },
  },
  roomMembers: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, required: true },
      username: { type: String, required: true },
      profileImage: { type: String },
    },
  ],
  currentUsersInRoom: [
    {
      _id: mongoose.Schema.Types.ObjectId,
      username: String,
      profileImage: String,
    },
  ],

  currentUsersSpeaking: [
    {
      _id: mongoose.Schema.Types.ObjectId,
      username: String,
      profileImage: String,
    },
  ],

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Room", RoomSchema);
