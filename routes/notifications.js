const express = require("express");
const router = express.Router();
const {
  getNotifications,
  createNotificationController, // 🆕 Criar notificação
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notificationController.js");

// const { protect } = require("../middleware/auth");
const { protect } = require("../utils/auth.js");

// 📥 GET todas as notificações do usuário logado
router.get("/", protect, getNotifications);

// ➕ POST criar uma nova notificação
router.post("/", protect, createNotificationController);

// marcar todas como lidas
router.put("/read-all", protect, markAllAsRead);

//  PUT marcar uma notificação como lida
router.put("/read/:id", protect, markAsRead);

// ❌ DELETE excluir uma notificação
router.delete("/:id", protect, deleteNotification);

module.exports = router;
