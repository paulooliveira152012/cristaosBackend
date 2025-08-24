// routes/privateRoomsRoutes.js
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();

const PrivateRoom = require("../models/PrivateRoom"); // deve existir
const { protect } = require("../utils/auth"); // deve setar req.user

// ---- helpers ----
const sanitizeRoom = (roomDoc) => {
  if (!roomDoc) return roomDoc;
  const r = roomDoc.toJSON ? roomDoc.toJSON() : { ...roomDoc };
  delete r.passwordHash;
  // redundância amigável ao front:
  if (r.roomImage && !r.imageUrl) r.imageUrl = r.roomImage;
  return r;
};


const isLeaderUser = (user) =>
  !!user?.isLeader ||
  user?.role === "leader" ||
  (Array.isArray(user?.roles) && user.roles.includes("leader"));

// ========== POST /api/rooms/private ==========
router.post("/private", protect, async (req, res) => {
    console.log("Creating private room with the following details:");
  try {
    const { roomTitle, password, description, imageUrl } = req.body || {};

    console.log("roomTitle:", roomTitle);
    console.log("password:", password);
    console.log("description:", description);
    console.log("imageUrl:", imageUrl);

    if (!roomTitle?.trim()) return res.status(400).json({ message: "roomTitle is required." });
    if (!password || password.length < 4) return res.status(400).json({ message: "Password must be at least 4 characters." });

    const passwordHash = await bcrypt.hash(password, 12);

    const createdBy = req.user?._id
      ? { _id: req.user._id, username: req.user.username, profileImage: req.user.profileImage }
      : undefined;

    const room = await PrivateRoom.create({
      roomTitle: roomTitle.trim(),
      description: description?.trim() || "",
      roomImage: imageUrl || "", // <- OK
      isPrivate: true,
      passwordHash,
      createdBy,
    });

    return res.status(201).json({ room: sanitizeRoom(room) });
  } catch (err) {
    console.error("createPrivateRoom error:", err);
    return res.status(500).json({ message: "Failed to create private room." });
  }
});




// ========== POST /api/rooms/create (fallback / também cria públicas) ==========
router.post("/create", protect, async (req, res) => {
    console.log("criando nova sala privada...")
  try {
    const { roomTitle, password, description, imageUrl, isPrivate } = req.body || {};
    if (!roomTitle?.trim()) return res.status(400).json({ message: "roomTitle is required." });

    let passwordHash;
    const makePrivate = !!isPrivate;
    if (makePrivate) {
      if (!password || password.length < 4)
        return res.status(400).json({ message: "Password must be at least 4 characters." });
      passwordHash = await bcrypt.hash(password, 12);
    }

    const room = await PrivateRoom.create({
      roomTitle: roomTitle.trim(),
      description: description?.trim() || "",
      roomImage: imageUrl || "",
      isPrivate: makePrivate,
      passwordHash,
      createdBy: req.user?._id,
    });

    return res.status(201).json({ room: sanitizeRoom(room) });
  } catch (err) {
    console.error("createRoom error:", err);
    return res.status(500).json({ message: "Failed to create room." });
  }
});

// ========== POST /api/privateRooms/join ==========
router.post("/join", protect, async (req, res) => {
  console.log("join alcançada...")
  try {
    const { roomId, password } = req.body || {};
    const room = await PrivateRoom.findById(roomId);
    if (!room || !room.isPrivate) return res.status(404).json({ message: "Room not found." });

    // líderes entram sem senha
    if (!isLeaderUser(req.user)) {
      if (!password) return res.status(400).json({ message: "Password is required." });
      const ok = await bcrypt.compare(password, room.passwordHash || "");
      if (!ok) return res.status(401).json({ message: "Invalid password." });
    }

    return res.json({ room: sanitizeRoom(room) });
  } catch (err) {
    console.error("joinPrivateRoom error:", err);
    return res.status(500).json({ message: "Failed to join room." });
  }
});

// ========== GET /api/rooms/private (lista privadas) ==========
router.get("/private", protect, async (_req, res) => {
  try {
    const rooms = await PrivateRoom.find({ isPrivate: true }).sort({ updatedAt: -1 });
    return res.json({ rooms: rooms.map(sanitizeRoom) });
  } catch (err) {
    console.error("listPrivateRooms error:", err);
    return res.status(500).json({ message: "Failed to list private rooms." });
  }
});

// ========== (opcional) GET /api/rooms?isPrivate=1 (fallback do front) ==========
router.get("/getAllRooms", protect, async (req, res) => {
    console.log("Fetching rooms with the following query parameters:");
    console.log("isPrivate:", req.query.isPrivate);

  try {
    const { isPrivate } = req.query;
    const filter =
      String(isPrivate) === "1" || String(isPrivate).toLowerCase() === "true"
        ? { isPrivate: true }
        : {};
    const rooms = await PrivateRoom.find(filter).sort({ updatedAt: -1 });
    return res.json({ rooms: rooms.map(sanitizeRoom) });
  } catch (err) {
    console.error("listRooms error:", err);
    return res.status(500).json({ message: "Failed to list rooms." });
  }
});

module.exports = router;
