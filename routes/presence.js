const express = require("express")
const { protect } = require("../utils/auth");
const User = require("../models/User"); // ajuste o caminho

// routes/presence.js
const router = express.Router();



router.post("/heartbeat", protect, async (req, res) => {
  console.log("🟢 🟢 🟢 heartbeat route....")
  if (!req.user._id) {
    console.log("Missing Id")
    return
  }
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { lastHeartbeat: new Date() } }
    );
    console.log("Atualizado!")
    return res.sendStatus(204); // sem body
  } catch (e) {
    return res.status(500).json({ message: "Heartbeat failed" });
  }
});

module.exports = router;
