const Notification = require("../models/Notification");

const createNotification = async ({
  recipient,
  fromUser,
  type,
  content,
  listingId,
  commentId = null,
}) => {
  try {
    if (recipient.toString() === fromUser.toString()) return; // não notifica a si mesmo

    const newNotification = new Notification({
      type, // "like" ou "comment"
      recipient,
      fromUser,
      content,
      listingId,
      commentId,
    });

    await newNotification.save();
    console.log("🔔 Notificação criada:", type);
  } catch (error) {
    console.error("❌ Erro ao criar notificação:", error.message);
  }
};

module.exports = createNotification;
