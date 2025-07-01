// routes/rooms.js
const express = require("express");
const router = express.Router();
const Room = require("../models/Room"); // Import the Room model

// POST /api/rooms - Create a new room
router.post("/create", async (req, res) => {
  console.log("create room hit");

  const { roomTitle, roomImage, createdBy } = req.body; // Destructure the request body

  // Validate the required fields
  if (!roomTitle || !roomImage || !createdBy || !createdBy._id) {
    console.log("Validation failed");
    console.log("roomTitle:", roomTitle);
    console.log("roomImage:", roomImage);
    console.log("createdBy:", createdBy);
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Create a new room instance using the Room model
    const newRoom = new Room({
      roomTitle,
      roomImage,
      createdBy: {
        _id: createdBy._id,
        username: createdBy.username,
        profileImage: createdBy.profileImage,
      },
    });

    // Save the room to the database
    const savedRoom = await newRoom.save();

    // Return the saved room in the response
    res.status(201).json(savedRoom);
  } catch (error) {
    console.error("Error creating room:", error.message); // Log the error message
    console.error("Full error details:", error); // Log the full error for debugging
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET /api/rooms - Fetch all rooms
router.get("/", async (req, res) => {
  try {
    // Find all rooms in the database
    const rooms = await Room.find();

    // Send the rooms back as the response
    res.status(200).json(rooms);
  } catch (error) {
    console.error("Error fetching rooms:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Route to update room title
router.put("/update/:roomId", async (req, res) => {
  console.log("backend route reached");
  const { roomId } = req.params;
  const { newTitle } = req.body;

  if (!roomId || !newTitle) {
    return res.send("no room Id or New title received");
  }

  console.log("The roomId is", roomId);
  console.log("The new room title is", newTitle);

  console.log("Updating room title...");
  try {
    const room = await Room.findByIdAndUpdate(
      roomId,
      { roomTitle: newTitle },
      { new: true }
    );
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.json({ message: "Room title updated", room });
  } catch (error) {
    res.status(500).json({ error: "Failed to update room title" });
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
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: "Failed to find room info" });
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

    return res.status(200).json({ currentUsersInRoom: room.currentUsersInRoom });
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
router.post("/addCurrentUser", async (req, res) => {
  const { roomId, user } = req.body;

  if (!roomId || !user || !user._id) {
    return res.status(400).json({ error: "Room ID and user data are required" });
  }

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
      return res.status(404).json({ error: "Room not found" });
    }

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
  console.log("rota para adicionar speaker")
  const { roomId, user } = req.body;

  if (!roomId || !user || !user._id) {
    return res.status(400).json({ error: "Room ID e dados do usuário são obrigatórios." });
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
  console.log("✅✅✅ rota para remover speaker")
  const { roomId, userId } = req.body;

  if (!roomId || !userId) {
    return res.status(400).json({ error: "Room ID e User ID são obrigatórios." });
  }

  try {
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      { $pull: { currentUsersSpeaking: { _id: userId } } },
      { new: true }
    );
    

    console.log(`✅ Usuario ${userId} removido dos falantes da sala ${roomId} `)

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
