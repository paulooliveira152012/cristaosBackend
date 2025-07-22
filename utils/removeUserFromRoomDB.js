// utils/removeUserFromRoomDB.js

const Room = require("../models/Room");

const removeUserFromRoomDB = async (roomId, userId) => {
  try {
    const updated = await Room.updateOne(
      { _id: roomId },
      { $pull: { currentUsersInRoom: { _id: userId } } }
    );
    console.log(`🧹 MongoDB: usuário ${userId} removido da sala ${roomId}`);
    return updated;
  } catch (err) {
    console.error("❌ Erro ao remover usuário do banco:", err);
  }
};

module.exports = removeUserFromRoomDB;
