// models/Room.js
const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const MiniUserSchema = new Schema({
  _id: { type: Types.ObjectId, required: false, ref: "User" },
  username: { type: String },
  profileImage: { type: String },
}, { _id: false });

const RoomSchema = new Schema({
  // OBS: você está usando _id: String. Se é por slug/uuid, ok. Senão, prefira ObjectId.
  // _id: { type: String, required: false },

  roomTitle: { type: String, required: true },
  description: { type: String, default: "" },
  roomImage: { type: String },

  createdBy: MiniUserSchema,        // snapshot do criador (opcional)
  owner: MiniUserSchema,            // dono da sala

  admins: [MiniUserSchema],         // admins da sala

  isLive: { type: Boolean, default: false },
  speakers: [MiniUserSchema],       // <-- renomeado (mais claro)
  speakersCount: { type: Number, default: 0 }, // <-- facilita listar rápido

  isPrivate: { type: Boolean, default: false },
  passwordHash: { type: String },

  roomMembers: [MiniUserSchema],    // membros (se usar)

  currentUsersInRoom: [MiniUserSchema], // presença (tempo real) se precisar

  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Índices úteis
RoomSchema.index({ isLive: 1, createdAt: -1 });
RoomSchema.index({ "owner._id": 1 });
RoomSchema.index({ "admins._id": 1 });

// Helper simples (service geralmente é melhor)
RoomSchema.methods.isOwnerOrAdmin = function(userId) {
  const id = String(userId);
  if (String(this.owner?._id) === id) return true;
  return this.admins?.some(a => String(a._id) === id);
};

module.exports = model("Room", RoomSchema);
