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
router.put('/update/:roomId', async (req, res) => {
  console.log("backend route reached")
  const { roomId } = req.params;
  const { newTitle } = req.body;

  if(!roomId || !newTitle) {
    return res.send("no room Id or New title received")
  }

  console.log("The roomId is", roomId)
  console.log("The new room title is", newTitle)

  console.log("Updating room title...")
  try {
      const room = await Room.findByIdAndUpdate(roomId, { roomTitle: newTitle }, { new: true });
      if (!room) {
          return res.status(404).json({ error: 'Room not found' });
      }
      res.json({ message: 'Room title updated', room });
  } catch (error) {
      res.status(500).json({ error: 'Failed to update room title' });
  }
});

// fetch room data
router.get('/fetchRoomData/:roomId', async (req, res) => {
  console.log("route requesting room data")
  const { roomId } = req.params;
  console.log("room id is:", roomId)

  try {
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    // return the room data directly
    res.json(room)
  } catch (error) {
    res.status(500).json({ error: 'Failed to find room info' });
  }
})

// Route to delete a room
router.delete('/delete/:roomId', async (req, res) => {
  console.log("delete room call reached")
  
  const { roomId } = req.params;
  console.log("roomId is:", roomId)

  try {
      const room = await Room.findByIdAndDelete(roomId);
      if (!room) {
          return res.status(404).json({ error: 'Room not found' });
      }
      res.json({ message: 'Room deleted' });
  } catch (error) {
      res.status(500).json({ error: 'Failed to delete room' });
  }
});


module.exports = router;
