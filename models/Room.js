// models/Room.js

const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema({
  roomTitle: { type: String, required: true },
  roomImage: { type: String, required: true },
  createdBy: {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
    profileImage: { type: String },
  },
    roomMembers: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, required: true },
      username: { type: String, required: true },
      profileImage: { type: String },
    }
  ],

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Room", RoomSchema);
