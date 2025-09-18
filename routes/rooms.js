// routes/rooms.js
const express = require("express");
const router = express.Router();
const Room = require("../models/Room"); // Import the Room model
const Message = require("../models/Message")
const { protect } = require("../utils/auth")


// helpers
function isOwnerOrAdmin(room, userId) {
  const id = String(userId);
  if (String(room.owner?._id) === id) return true;
  return (room.admins || []).some(a => String(a._id) === id);
}

function speakersCount(room) {
  return (room.currentUsersSpeaking || []).length;
}

function hasPrivilegedSpeaker(room) {
  const ids = new Set((room.currentUsersSpeaking || []).map(s => String(s._id)));
  if (room.owner?._id && ids.has(String(room.owner._id))) return true;
  return (room.admins || []).some(a => ids.has(String(a._id)));
}

// GET /api/rooms - Fetch all rooms
// GET /api/rooms - Fetch all rooms (essencial para a landing)
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({}, {
      roomTitle: 1,
      roomImage: 1,
      isLive: 1,
      currentUsersSpeaking: 1, // para calcular no front se quiser
      createdAt: 1,
    }).sort({ isLive: -1, createdAt: -1 });

    // opcional: mande speakersCount direto
    const withCount = rooms.map(r => ({
      ...r.toObject(),
      speakersCount: (r.currentUsersSpeaking || []).length,
    }));

    res.status(200).json(withCount);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


// POST /api/rooms - Create a new room
// POST /api/rooms/create - Create a new room
router.post("/create", protect, async (req, res) => {
  console.log("create room hit");

  const { roomTitle, roomImage, createdBy } = req.body;

  if (!roomTitle || !roomImage || !createdBy || !createdBy._id) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const creator = {
      _id: createdBy._id,
      username: createdBy.username,
      profileImage: createdBy.profileImage,
    };

    const newRoom = new Room({
      roomTitle,
      roomImage,
      createdBy: creator,
      owner: creator,            // <- define o dono
      admins: [],                // pode preencher depois
      isLive: false,
      currentUsersSpeaking: [],  // speakers vazios
    });

    const savedRoom = await newRoom.save();
    res.status(201).json(savedRoom);
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /api/rooms/:roomId/live/start - start room
router.post("/:roomId/live/start", protect, async (req, res) => {
  console.log("✅ starting new room...")
  const { roomId } = req.params;
  const user = req.user || req.body.user || req.body; // dependendo do seu 'protect'
  const userId = user._id || user.id;

  if (!userId) return res.status(401).json({ error: "not authenticated" });

  try {
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (!isOwnerOrAdmin(room, userId)) {
      return res.status(403).json({ error: "not allowed" });
    }

    // liga live e garante quem iniciou como speaker (mutado no front)
    room.isLive = true;
    const alreadySpeaker = (room.speakers || []).some(s => String(s._id) === String(userId));
    if (!alreadySpeaker) {
      room.speakers.push({
        _id: userId,
        username: user.username,
        profileImage: user.profileImage,
      });
    }
    await room.save();

    // socket: acende neon
    const io = req.app.get("io");
    io?.emit("room:live", {
      roomId: room._id,
      isLive: true,
      speakersCount: speakersCount(room),
    });

    console.log("✅", room.speakers)
    const speakers = room.speakers

    res.json({ ok: true, isLive: true, speakersCount: speakersCount(room), speakers });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/rooms/:roomId/live/stop
router.put("/:roomId/live/stop", protect, async (req, res) => {
  const { roomId } = req.params;
  const reqUserId = String(req.user?._id || "");

  if (!reqUserId) return res.status(401).json({ error: "not authenticated" });

  try {
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // checa se é owner/admin (inline, sem helper)
    const ownerId = String(room.owner?._id || room.createdBy?._id || "");
    const adminIds = (room.admins || []).map(a => String(
      (a && (a._id || (a.user && (a.user._id || a.user)) || a)) || ""
    ));

    if (![ownerId, ...adminIds].filter(Boolean).includes(reqUserId)) {
      return res.status(403).json({ error: "not allowed" });
    }

    // fecha e limpa tudo
    room.isLive = false;
    room.speakers = [];
    room.currentUsersSpeaking = [];
    room.currentUsersInRoom = [];
    room.speakersCount = 0;
    await room.save();

    const io = req.app.get("io");
    io?.to(roomId).emit("liveRoomUsers", { roomId, users: [], speakers: [] });
    io?.emit("room:live", { roomId: room._id, isLive: false, speakersCount: 0 });

    return res.json({ ok: true, isLive: false, speakersCount: 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// POST /api/rooms/:roomId/speakers/leave
// POST /api/rooms/:roomId/speakers/leave
router.post("/:roomId/speakers/leave", protect, async (req, res) => {
  console.log("moving user to audience route");

  try {
    const { roomId } = req.params;
    const requesterId = String(req.user?._id || "");
    const targetId = String(req.body?.userId || requesterId); // deixa o speaker sair a si mesmo

    if (!roomId) return res.status(400).json({ error: "missing roomId" });
    if (!requesterId) return res.status(401).json({ error: "not authenticated" });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // normalizador compacto de id
    const norm = (x) =>
      String((x && (x._id || (x.user && (x.user._id || x.user)) || x)) || "");

    // permissões: owner/admin pode derrubar outros; qualquer um pode derrubar a si mesmo
    const ownerId  = String(room.owner?._id || room.createdBy?._id || "");
    const adminIds = (room.admins || []).map((a) => norm(a));
    const privileged = new Set([ownerId, ...adminIds].filter(Boolean));

    const isSelf = targetId === requesterId;
    const canModerate = privileged.has(requesterId);
    if (!isSelf && !canModerate) {
      return res.status(403).json({ error: "forbidden" });
    }

    // era speaker?
    const wasSpeaker =
      (room.speakers || []).some((s) => norm(s) === targetId) ||
      (room.currentUsersSpeaking || []).some((s) => norm(s) === targetId);

    // remove usuário dos arrays de speaker
    room.speakers = (room.speakers || []).filter((s) => norm(s) !== targetId);
    room.currentUsersSpeaking = (room.currentUsersSpeaking || []).filter(
      (s) => norm(s) !== targetId
    );

    // mantém em currentUsersInRoom (audiência); se você guarda objetos com flag, zere-a aqui
    // Ex.: room.currentUsersInRoom = (room.currentUsersInRoom || []).map(u => {
    //   if (norm(u) === targetId) return { ...u, isSpeaker: false };
    //   return u;
    // });

    room.speakersCount = Array.isArray(room.speakers) ? room.speakers.length : 0;

    // se não sobrar owner/admin no palco, encerra a live
    const hasPrivilegedSpeaker = (room.speakers || []).some((s) =>
      privileged.has(norm(s))
    );
    if (!hasPrivilegedSpeaker) {
      room.isLive = false;
      room.currentUsersSpeaking = [];
      room.speakers = [];
      room.speakersCount = 0;
    }

    await room.save();

    const io = req.app.get("io");
    // atualiza usuários da sala
    io?.to(roomId).emit("liveRoomUsers", {
      roomId,
      users: room.currentUsersInRoom || [],
      speakers: room.speakers || [],
    });
    // atualiza status da live
    io?.emit("room:live", {
      roomId: room._id,
      isLive: room.isLive,
      speakersCount: room.speakersCount,
    });
    console.log("done!")

    return res.json({
      ok: true,
      wasSpeaker,
      isLive: room.isLive,
      speakersCount: room.speakersCount,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// POST /api/rooms/:roomId/leave
router.post("/:roomId/leave", protect, async (req, res) => {
  const { roomId } = req.params;
  const userIdStr = String(req.user?._id || "");

  if(!roomId) {
    console.log("missing roomId")
    return
  }

  if (!userIdStr) return res.status(401).json({ error: "not authenticated" });

  try {
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // normalizador inline de id (sem helper externo)
    const norm = (x) => String(
      (x && (x._id || (x.user && (x.user._id || x.user)) || x)) || ""
    );

    // remove o usuário dos arrays relevantes
    room.currentUsersInRoom   = (room.currentUsersInRoom   || []).filter(u => norm(u) !== userIdStr);
    room.currentUsersSpeaking = (room.currentUsersSpeaking || []).filter(s => norm(s) !== userIdStr);
    room.speakers             = (room.speakers             || []).filter(s => norm(s) !== userIdStr);

    // verifica se ainda há speaker privilegiado (owner/admin) no palco
    const ownerId  = String(room.owner?._id || room.createdBy?._id || "");
    const adminIds = (room.admins || []).map(a => norm(a));
    const privileged = new Set([ownerId, ...adminIds].filter(Boolean));
    const hasPrivileged = (room.speakers || []).some(s => privileged.has(norm(s)));

    if (!hasPrivileged) {
      room.isLive = false;
      room.currentUsersSpeaking = [];
      room.speakers = [];
    }

    room.speakersCount = Array.isArray(room.speakers) ? room.speakers.length : 0;
    await room.save();

    const io = req.app.get("io");
    io?.to(roomId).emit("liveRoomUsers", {
      roomId,
      users: room.currentUsersInRoom || [],
      speakers: room.speakers || [],
    });
    io?.emit("room:live", {
      roomId: room._id,
      isLive: room.isLive,
      speakersCount: room.speakersCount,
    });

    return res.json({ ok: true, isLive: room.isLive, speakersCount: room.speakersCount });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// POST /api/rooms/:roomId/speakers/join
router.post("/:roomId/speakers/join", protect, async (req, res) => {
  console.log("🚨🚨🚨🚨🚨")
  const { roomId } = req.params;
  const user = req.user || req.body.user || req.body;
  const userId = user._id || user.id;

  if (!userId) return res.status(401).json({ error: "not authenticated" });

  try {
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!room.isLive) return res.status(409).json({ error: "not live" });

    const exists = (room.speakers || []).some(s => String(s._id) === String(userId));
    if (!exists) {
      room.speakers.push({
        _id: userId,
        username: user.username,
        profileImage: user.profileImage,
      });
      await room.save();
    }

    const io = req.app.get("io");
    io?.emit("room:live", {
      roomId: room._id,
      isLive: true,
      speakersCount: speakersCount(room),
    });

    res.json({ ok: true, speakersCount: speakersCount(room) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});




// Route to update room title
// Route to update room (title and/or image URL)
router.put("/update/:roomId", async (req, res) => {
  console.log("backend route update room reached");
  const { roomId } = req.params;
  const { newTitle, coverUrl } = req.body;

  console.log("newTitle:", newTitle, "coverUrl:", coverUrl);

  if (!roomId) {
    return res.status(400).json({ error: "roomId ausente" });
  }

  // Monte somente o que veio
  const updates = {};
  if (newTitle) updates.roomTitle = newTitle;
  if (coverUrl) updates.roomImage = coverUrl; // <- garanta que o campo no schema é 'coverUrl'

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar" });
  }

  try {
    const room = await Room.findByIdAndUpdate(roomId, updates, { new: true });
    if (!room) return res.status(404).json({ error: "Room not found" });

    console.log("updated...");
    return res.json({ message: "Room atualizado", room });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update room" });
  }
});


// fetch room data
router.get("/fetchRoomData/:roomId", async (req, res) => {
  console.log("route requesting room data");
  const { roomId } = req.params;
  console.log("room id is:", roomId);

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    // return the room data directly
    console.log("✅✅✅ info da sala enviada ao front:")
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: "Failed to find room info" });
  }
});

// api/rooms/
router.get("/fetchRoomMessages/:roomId", async (req, res) => {
  console.log("fetching messages...")
  try {
    const { roomId } = req.params;
    let { limit = 50, before } = req.query;

    limit = Math.min(parseInt(limit, 10) || 50, 100);

    // (opcional) valida se a sala existe / se user pode ver
    // const room = await Room.findById(roomId).lean();
    // if (!room) return res.status(404).json({ message: "Sala não encontrada" });
    // if (room.isPrivate && String(room.owner) !== String(req.user._id)) { ... }

    const filter = { roomId };
    if (before) {
      const beforeDate = isNaN(before) ? new Date(before) : new Date(parseInt(before, 10));
      if (!isNaN(beforeDate.getTime())) filter.timestamp = { $lt: beforeDate };
    }

    // pega em ordem decrescente e depois reverte pra subir cronologicamente
    const docs = await Message.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const ordered = docs.reverse();
    return res.json(ordered);
  } catch (err) {
    console.error("GET /rooms/:roomId/messages error:", err);
    return res.status(500).json({ message: "Erro ao buscar mensagens" });
  }
});

// buscar os usuarios atuais na sala
router.get("/:roomId/currentUsers", async (req, res) => {
  const { roomId } = req.params;

  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required" });
  }

  try {
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    return res
      .status(200)
      .json({ currentUsersInRoom: room.currentUsersInRoom });
  } catch (err) {
    console.error("Error fetching current users:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// fetch room members:
// GET membros da sala
// GET /api/rooms/getRoomMembers/:roomId
router.get("/getRoomMembers/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    res.status(200).json(room.roomMembers);
  } catch (err) {
    console.error("Erro ao buscar membros da sala:", err);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Route to delete a room
router.delete("/delete/:roomId", async (req, res) => {
  console.log("delete room call reached");

  const { roomId } = req.params;
  console.log("roomId is:", roomId);

  try {
    const room = await Room.findByIdAndDelete(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.json({ message: "Room deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete room" });
  }
});

// temporariamente adicionar membros atuais
// POST /api/rooms/addCurrentUser
router.put("/addCurrentUser", async (req, res) => {
  console.log("🇧🇷 Rota para constar usuario como presente na sala")
  const { roomId, user } = req.body;

  if (!roomId || !user || !user._id) {
    console.log("missing info")
    console.log("roomId:", roomId)
    console.log("user:", user)
    
    return res
      .status(400)
      .json({ error: "Room ID and user data are required" });
  }

  console.log("🇧🇷 no missing info.. moving on..")

  try {
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      {
        $addToSet: {
          currentUsersInRoom: {
            _id: user._id,
            username: user.username,
            profileImage: user.profileImage,
          },
        },
      },
      { new: true } // Return the updated document
    );

    if (!updatedRoom) {
      console.log("room not found")
      return res.status(404).json({ error: "Room not found" });
    }

    console.log("usuario inserido no currentUsersInRoom")

    return res.status(200).json({
      message: "User added (if not already present)",
      currentUsersInRoom: updatedRoom.currentUsersInRoom,
    });
  } catch (err) {
    console.error("Error adding current user:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// rota para remover usuarios do ativos momentaneamente
// POST /api/rooms/removeCurrentUser
router.post("/removeCurrentUser", async (req, res) => {
  const { roomId, userId } = req.body;

  if (!roomId || !userId) {
    return res.status(400).json({ error: "Room ID and user ID are required" });
  }

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    room.currentUsersInRoom = room.currentUsersInRoom.filter(
      (u) => u._id.toString() !== userId
    );

    await room.save();
    return res.status(200).json({
      message: "User removed",
      currentUsersInRoom: room.currentUsersInRoom,
    });
  } catch (err) {
    console.error("Error removing current user:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 🔊 Adicionar um usuário aos oradores da sala
router.post("/addSpeakerToRoom", async (req, res) => {
  console.log("🇧🇷🇧🇷🇧🇷 rota para adicionar speaker");
  const { roomId, user } = req.body;

  if (!roomId || !user || !user._id) {
    return res
      .status(400)
      .json({ error: "Room ID e dados do usuário são obrigatórios." });
  }

  try {
    // Evita duplicatas com $addToSet
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      { $addToSet: { currentUsersSpeaking: user } },
      { new: true }
    );

    if (!updatedRoom) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    return res.status(200).json({
      message: "Usuário adicionado à lista de oradores com sucesso.",
      currentUsersSpeaking: updatedRoom.currentUsersSpeaking,
    });
  } catch (error) {
    console.error("Erro ao adicionar orador:", error);
    return res.status(500).json({ error: "Erro ao adicionar orador à sala." });
  }
});

// remover speaker
router.post("/removeSpeakerFromRoom", async (req, res) => {
  console.log(" rota para remover speaker");
  const { roomId, userId } = req.body;

  if (!roomId || !userId) {
    return res
      .status(400)
      .json({ error: "Room ID e User ID são obrigatórios." });
  }

  try {
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      { $pull: { currentUsersSpeaking: { _id: userId } } },
      { new: true }
    );

    console.log(` Usuario ${userId} removido dos falantes da sala ${roomId} `);

    if (!updatedRoom) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    return res.status(200).json({
      message: "Usuário removido da lista de oradores com sucesso.",
      currentUsersSpeaking: updatedRoom.currentUsersSpeaking,
    });
  } catch (error) {
    console.error("Erro ao remover orador:", error);
    return res.status(500).json({ error: "Erro ao remover orador da sala." });
  }
});

// add users to room
router.post("/addMember", async (req, res) => {
  const { roomId, user } = req.body;

  if (!roomId || !user || !user._id) {
    return res
      .status(400)
      .json({ error: "Room ID and user data are required" });
  }

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const memberIds = room.roomMembers.map((m) => m._id.toString());
    const alreadyInRoom = memberIds.includes(user._id.toString());

    if (alreadyInRoom) {
      console.log("ℹ️ Usuário já está na sala.");
      return res.status(200).json({
        message: "User already in room",
        roomMembers: room.roomMembers,
      });
    }

    // Atualização segura
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      { $addToSet: { roomMembers: user } },
      { new: true }
    );

    return res.status(200).json({
      message: "User added to room",
      roomMembers: updatedRoom.roomMembers,
    });
  } catch (error) {
    console.error("Error adding member to room:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// remove users from room
router.post("/removeMember", async (req, res) => {
  const { roomId, userId } = req.body;

  if (!roomId || !userId) {
    return res.status(400).json({ error: "roomId e userId são obrigatórios." });
  }

  try {
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      {
        $pull: { roomMembers: { _id: userId } },
      },
      { new: true }
    );

    if (!updatedRoom) {
      return res.status(404).json({ error: "Sala não encontrada." });
    }

    res.status(200).json({ success: true, room: updatedRoom });
  } catch (error) {
    console.error("Erro ao remover membro da sala:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

module.exports = router;


// routes/liveRooms.js
router.put("/:roomId/image", protect, async (req, res) => {
  const { roomId } = req.params;
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ message: "imageUrl é obrigatório" });

  const room = await Room.findByIdAndUpdate(
    roomId,
    { imageUrl },
    { new: true }
  ).lean();

  if (!room) return res.status(404).json({ message: "Sala não encontrada" });

  // opcional: emitir pelo socket para quem está na sala
  req.app.get("io")?.to(String(roomId)).emit("room:updated", { room });

  res.json({ room });
});
