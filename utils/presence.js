// utils/presenceCleanup.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Room = require("../models/Room");

async function setIdleAndPurgeRooms(userId, io) {
  if (!userId) return;
  const uid = new mongoose.Types.ObjectId(String(userId));

  // 1) Salas onde o usuário aparece (no palco ou presente)
  const rooms = await Room.find({
    $or: [
      { currentUsersInRoom: uid },
      { "speakers.user": uid }, // quando speakers é [{ user: ObjectId, ... }]
      { speakers: uid },        // quando speakers é [ObjectId]
    ],
  }).select("_id");

  const rids = rooms.map(r => r._id);

  if (rids.length) {
    // 2) Remove o usuário das listas
    await Room.updateMany(
      { _id: { $in: rids } },
      {
        $pull: {
          currentUsersInRoom: uid,
          speakers: { user: uid }, // cobre array de objetos
        },
        $pullAll: { speakers: [uid] }, // cobre array de ObjectId
      }
    );

    // 3) Reemite presença por sala (apenas para quem está na sala)
    for (const rid of rids) {
      const room = await Room.findById(rid)
        .select("_id currentUsersInRoom speakers");
      io.to(String(rid)).emit("updateRoomPresence", {
        roomId: String(rid),
        currentUsersInRoom: room?.currentUsersInRoom ?? [],
        speakers: room?.speakers ?? [],
      });
    }
  }

  // 4) Marca o usuário como idle (idempotente)
  await User.updateOne({ _id: uid }, { $set: { presenceStatus: "idle" } });
}

module.exports = { setIdleAndPurgeRooms };
