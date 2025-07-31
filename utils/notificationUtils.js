const Notification = require("../models/Notification");

const createNotificationUtil = async ({
  io, // 🔥 receber o io aqui
  recipient,
  fromUser,
  type,
  content,
  listingId,
  commentId = null,
  conversationId = null, // 🔄 corrigido typo
}) => {

  console.log("🟢 [3] notificationUtils, mandar a notificação via socket")
  console.log("io:", io)
  console.log("recipient:", recipient)
  
  try {
    if (recipient.toString() === fromUser.toString()) return; // não notifica a si mesmo

    const newNotification = new Notification({
      type, // "like", "comment", etc.
      recipient,
      fromUser,
      content,
      listingId,
      commentId,
      conversationId,
    });

    await newNotification.save();

    console.log("🔔 Notificação criada:", type);
    console.log("emitindo notificação via socket...")
    

    // 🔥 Emitir o socket para o destinatário, se io estiver presente
    if (io) {
      console.log("io:", io)
      io.to(recipient.toString()).emit("newNotification", {
        _id: newNotification._id,
        type,
        fromUser,
        content,
        listingId,
        commentId,
        conversationId,
        createdAt: newNotification.createdAt,
      });
      console.log("📤 Notificação emitida via socket");
    } else {
      console.log("notificacnao de socket nao enviada...")
    }
  } catch (error) {
    console.error("❌ Erro ao criar notificação:", error.message);
  }
};

module.exports = createNotificationUtil;


/*
  curtida de comentario
  reply de comentario
*/