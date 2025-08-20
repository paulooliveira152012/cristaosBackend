// chatRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
// const createNotification = require("../utils/notificationUtils");
const createNotificationUtil = require("../utils/notificationUtils");
const { protect } = require("../utils/auth");
const {
  emitParticipantChanged,
  emitInvited,
  emitAccepted,
  emitRejected,
} = require("../utils/emitters");

// get dm chats from user
// GET /api/dm/userConversations/:userId
router.get("/userConversations/:userId", async (req, res) => {
  const { userId } = req.params;
  console.log("✅ buscando conversas com userId:", userId);

  try {
    // const user = await User.findById(userId); // precisamos do usuário para pegar os timestamps

    // if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const conversations = await Conversation.find({
      $or: [{ participants: userId }, { waitingUser: userId }],
    }).populate("participants", "username profileImage");

    res.status(200).json(conversations);

    // const enhancedConversations = await Promise.all(
    //   conversations.map(async (chat) => {
    //     const lastRead = user.lastReadTimestamps?.[chat._id] || new Date(0);

    //     const unreadCount = await Message.countDocuments({
    //       conversationId: chat._id,
    //       timestamp: { $gt: lastRead },
    //       sender: { $ne: userId }, // ✅ Corrigido aqui
    //       receiver: userId, // ✅ Só mensagens destinadas a ele
    //       read: false, // ✅ Só não lidas
    //     });

    //     return {
    //       ...chat.toObject(),
    //       unreadCount,
    //     };
    //   })
    // );

    // res.status(200).json(enhancedConversations);
  } catch (err) {
    console.error("Erro ao buscar conversas:", err);
    res.status(500).json({ error: "Erro ao buscar conversas" });
  }
});

// 1. Send chat request
// 1. Send chat request
// routes/dm.js (trecho)
router.post("/sendChatRequest", protect, async (req, res) => {
  try {
    const requester = req.user._id; // id do usuário que está enviando o convite
    const { requested } = req.body || {};

    if (!requester || !requested)
      return res
        .status(400)
        .json({ error: "Missing requester or requested ID" });

    if (String(req.user._id) !== String(requester))
      return res.status(403).json({ error: "Requester inválido" });

    if (String(requester) === String(requested))
      return res.status(400).json({ error: "Requester == requested" });

    const pairKey = Conversation.makePairKey(requester, requested);

    // 1) Se já existe conversa ATIVA → retorna, não cria nada
    const active = await Conversation.findOne({ pairKey, status: "active" });
    if (active) {
      return res.status(200).json({
        message: "Já existe conversa ativa",
        conversationId: active._id,
        status: "active",
      });
    }

    // 2) Se já existe convite PENDENTE para o mesmo "requested" → não duplica
    const pending = await Conversation.findOne({ pairKey, status: "pending" });
    if (pending) {
      // Se o pending atual já está aguardando o mesmo 'requested', não reenviar
      if (String(pending.waitingUser) === String(requested)) {
        return res.status(200).json({
          message: "Convite já pendente",
          conversationId: pending._id,
          status: "pending",
        });
      }
      // Se está pendente mas aguardando o outro lado (caso invertido), trocamos a direção
      pending.requester = requester;
      pending.waitingUser = requested;
      pending.requestedAt = new Date();
      pending.leavingUser = null;
      await pending.save();

      // Notifica só nessa troca de direção
      const io = req.app.get("io");
      await createNotificationUtil({
        io,
        recipient: requested,
        fromUser: requester,
        type: "chat_request",
        content: `${
          req.user.username || "Alguém"
        } te convidou para uma conversa privada 1.`,
        conversationId: pending._id,
      });

      emitInvited(io, requested, pending);
      emitParticipantChanged(req, pending);
      return res.status(200).json({
        message: "Convite atualizado",
        conversationId: pending._id,
        status: "pending",
      });
    }

    // 3) Se existe DECLINED ou LEFT → podemos reativar como pendente (reconvite)
    const old = await Conversation.findOne({
      pairKey,
      status: { $in: ["declined", "left"] },
    });
    if (old) {
      old.status = "pending";
      old.requester = requester;
      old.waitingUser = requested;
      old.requestedAt = new Date();
      old.respondedAt = null;
      old.leavingUser = null;
      // garante que o requester esteja presente no array
      const set = new Set((old.participants || []).map(String));
      set.add(String(requester));
      old.participants = Array.from(set);
      await old.save();

      const io = req.app.get("io");
      await createNotificationUtil({
        io,
        recipient: requested,
        fromUser: requester,
        type: "chat_request",
        content: `${
          req.user.username || "Alguém"
        } te convidou para uma conversa privada 2.`,
        conversationId: old._id,
      });
      emitInvited(io, requested, old);
      emitParticipantChanged(req, old);
      return res.status(200).json({
        message: "Reconvite enviado",
        conversationId: old._id,
        status: "pending",
      });
    }

    // 4) Não existe nada → cria PENDENTE
    const conv = await Conversation.create({
      pairKey,
      participants: [requester], // só quem convidou aparece já
      requester,
      waitingUser: requested,
      status: "pending",
      requestedAt: new Date(),
      leavingUser: null,
    });

    const io = req.app.get("io");
    await createNotificationUtil({
      io,
      recipient: requested,
      fromUser: requester,
      type: "chat_request",
      content: `${
        req.user.username || "Alguém"
      } te convidou para uma conversa privada 3.`,
      conversationId: conv._id,
    });

    emitInvited(io, requested, conv);
    emitParticipantChanged(req, conv);

    return res.status(200).json({
      message: "Convite enviado",
      conversationId: conv._id,
      status: "pending",
    });
  } catch (error) {
    console.error("sendChatRequest error:", error?.message || error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Aceitar convite
router.post("/accept", protect, async (req, res) => {
  console.log("aceitando conversa...");
  try {
    const { conversationId } = req.body;
    const me = String(req.user._id);

    const conv = await Conversation.findById(conversationId);
    if (!conv)
      return res.status(404).json({ error: "Conversa não encontrada" });

    if (String(conv.waitingUser) !== me) {
      return res
        .status(403)
        .json({ error: "Você não tem convite pendente nesta conversa" });
    }

    // move waitingUser -> participants
    const set = new Set(conv.participants.map(String));
    set.add(me);
    conv.participants = Array.from(set);

    // ✅ marque como ativa
    conv.status = "active";
    conv.waitingUser = null;
    conv.leavingUser = null;
    conv.respondedAt = new Date();

    await conv.save();

    const io = req.app.get("io");

    // pseudo-código no backend para mensagem de sistema:
    const sys = await Message.create({
      conversationId: conv._id,
      type: "system",
      eventType: "join",
      message: `${req.user.username} entrou na conversa`,
      timestamp: new Date(),
    });
    io.to(String(conv._id)).emit("newPrivateMessage", sys);

    emitAccepted(req, conv._id, me);
    emitParticipantChanged(req, conv);

    // remover notificação do banco
    await Notification.deleteMany({
      recipient: me,
      type: "chat_request",
      conversationId: conv._id,
    });

    res.status(200).json({ message: "Convite aceito", conversation: conv });
  } catch (err) {
    console.error("accept error:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// Rejeitar convite
// Rejeitar convite
router.post("/rejectChatRequest", protect, async (req, res) => {
  console.log("rejeitando convite de conversa...");
  try {
    const me = String(req.user._id);
    const {
      conversationId: convoIdFromBody,
      notificationId,
      requester, // id de quem convidou
      requested, // id de quem recebeu (deveria ser == me)
    } = req.body;

    let conv = null;

    // 1) usa conversationId se veio
    if (convoIdFromBody) {
      conv = await Conversation.findById(convoIdFromBody);
    }

    // 2) fallback: resolve pela dupla de usuários (pendente/aguardando)
    if (!conv && requester && requested) {
      conv = await Conversation.findOne({
        $and: [
          { status: { $in: ["pending", "awaiting", "requested"] } },
          {
            $or: [
              { requester: requester, waitingUser: requested },
              { participants: { $all: [requester, requested] } },
            ],
          },
        ],
      }).sort({ createdAt: -1 });
    }

    if (!conv)
      return res.status(404).json({ error: "Conversa não encontrada" });

    // só quem está aguardando pode rejeitar
    if (String(conv.waitingUser) !== me) {
      return res.status(403).json({ error: "Nada a rejeitar" });
    }

    // identifica quem convidou
    const requesterId = conv.requester
      ? String(conv.requester)
      : (conv.participants || []).map(String).find((id) => id !== me) || null;

    // 3) atualiza estado
    conv.status = "declined";
    conv.respondedAt = new Date();
    conv.waitingUser = null;
    conv.leavingUser = req.user._id;
    conv.participants = requesterId ? [requesterId] : [];
    await conv.save();

    // 4) remove a notificação certa
    if (notificationId) {
      await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: me,
      });
    } else {
      await Notification.deleteMany({
        recipient: me,
        type: "chat_request",
        // conversationId: conv._id, // use isto se suas notificações armazenarem a conversa
      });
    }

    // 5) notifica o solicitante (opcional)
    const io = req.app.get("io");
    // if (requesterId) {
    //   await createNotificationUtil({
    //     io,
    //     recipient: requesterId,
    //     fromUser: req.user._id,
    //     type: "chat_declined",
    //     content: `${req.user.username || "O usuário"} recusou seu convite de conversa privada.`,
    //     conversationId: conv._id,
    //   });
    // }

    // eventos socket (se existirem helpers)
    if (typeof emitRejected === "function") {
      emitRejected(io, {
        conversationId: conv._id,
        rejectedBy: me,
        to: requesterId,
      });
    }
    if (typeof emitParticipantChanged === "function") {
      emitParticipantChanged(req, conv);
    }

    return res
      .status(200)
      .json({ message: "Convite rejeitado", status: conv.status });
  } catch (err) {
    console.error("reject error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// Reinvitar quem saiu
router.post("/reinvite", protect, async (req, res) => {
  try {
    const { conversationId } = req.body;
    const me = String(req.user._id);

    const conv = await Conversation.findById(conversationId);
    if (!conv)
      return res.status(404).json({ error: "Conversa não encontrada" });

    const iParticipate = conv.participants.map(String).includes(me);
    if (!iParticipate)
      return res
        .status(403)
        .json({ error: "Você não participa desta conversa" });

    if (!conv.leavingUser)
      return res.status(400).json({ error: "Não há ninguém para reinvitar" });

    // seta pendência para quem saiu
    conv.waitingUser = conv.leavingUser;
    conv.requester = req.user._id;
    conv.leavingUser = null;
    await conv.save();

    const io = req.app.get("io");
    await createNotificationUtil({
      io,
      recipient: conv.waitingUser,
      fromUser: me,
      type: "chat_reinvite",
      content: `${
        req.user.username || "Alguém"
      } te chamou de volta para a conversa.`,
      conversationId: conv._id,
    });

    emitInvited(io, conv.waitingUser, conv);
    emitParticipantChanged(req, conv);

    res.status(200).json({ message: "Reconvite enviado" });
  } catch (err) {
    console.error("reinvite error:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// 2. Reject chat request
// router.post("/rejectChatRequest", async (req, res) => {
//   const { requester, requested } = req.body;
//   if (!requester || !requested)
//     return res.status(400).json({ error: "Missing requester or requested ID" });

//   try {
//     // remover pedido da lista de chatRequestsSent do usuario que enviou o convite
//     await User.findByIdAndUpdate(requester, {
//       $pull: { chatRequestsSent: requested },
//     });
//     // remover pedido da lista de chatRequestsSent do usuario que recebeu o convite
//     await User.findByIdAndUpdate(requested, {
//       $pull: { chatRequestsReceived: requester },
//     });

//     // tenta localizar a conversa envolvida
//     let conversation =
//       (await Conversation.findOne({
//         participants: { $all: [requester, requested], $size: 2 },
//       })) ||
//       (await Conversation.findOne({
//         participants: requester,
//         pendingFor: requested,
//       }));

//     if (conversation) {
//       // remove a pendência do requested
//       conversation.pendingFor = (conversation.pendingFor || [])
//         .map(String)
//         .filter((id) => id !== String(requested));

//       // regra de negócio:
//       // se você quer que a conversa suma pro requested, garanta que ele não permaneça em 'participants'
//       conversation.participants = conversation.participants
//         .map(String)
//         .filter((id) => id !== String(requested));

//       // opcional: marca quem “saiu”
//       conversation.leavingUser = requested;

//       // se ninguém ficou, pode deletar a conversa
//       if (conversation.participants.length === 0) {
//         await Conversation.findByIdAndDelete(conversation._id);
//       } else {
//         await conversation.save();
//       }

//       // eventos em tempo real
//       const io = req.app.get("io");
//       emitRejected(io, conversation._id, requested); // <- dm:rejected
//       emitParticipantChanged(req, conversation._id, {
//         participants: (conversation.participants || []).map(String),
//         pendingFor: (conversation.pendingFor || []).map(String),
//         leavingUser: String(requested),
//       });
//     }

//     res.status(200).json({ message: "Chat request rejected" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// 3. Accept chat request and start conversation
// 3. Accept chat request and start conversation
// 3. Accept chat request and start conversation
router.post("/startNewConversation", protect, async (req, res) => {
  const { requester, requested, notificationId, conversationId } = req.body;
  if (!requester || !requested)
    return res.status(400).json({ error: "Missing requester or requested ID" });

  try {
    const userRequested = await User.findById(requested);
    if (!userRequested.chatRequestsReceived.includes(requester)) {
      return res.status(403).json({ error: "Chat request not accepted yet" });
    }

    // (A) Reentrada em conversa existente via conversationId
    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });

      const rStr = String(requested);
      // garante participação
      if (!conversation.participants.map(String).includes(rStr)) {
        conversation.participants.push(requested);
      }

      // 🔑 LIMPA pendência deste usuário e zera leavingUser
      conversation.pendingFor = (conversation.pendingFor || [])
        .map(String)
        .filter((id) => id !== rStr);
      conversation.leavingUser = null;

      await conversation.save();

      // limpa pedidos/notification
      await User.findByIdAndUpdate(requester, {
        $pull: { chatRequestsSent: requested },
      });
      await User.findByIdAndUpdate(requested, {
        $pull: { chatRequestsReceived: requester },
      });
      if (notificationId) await Notification.findByIdAndDelete(notificationId);

      emitAccepted(req, conversation._id, req.user._id);
      emitParticipantChanged(req, conversation); // DOC → payload completo
      return res
        .status(200)
        .json({ message: "Usuário reinserido", conversation });
    }

    // (B) Já existe conversa “cheia” entre os dois
    let existingConversation = await Conversation.findOne({
      participants: { $all: [requester, requested], $size: 2 },
    });

    if (existingConversation) {
      const rStr = String(requested);
      // 🔑 LIMPA pendência e zera leavingUser
      existingConversation.pendingFor = (existingConversation.pendingFor || [])
        .map(String)
        .filter((id) => id !== rStr);
      existingConversation.leavingUser = null;
      await existingConversation.save();

      // limpa pedidos/notification
      await User.findByIdAndUpdate(requester, {
        $pull: { chatRequestsSent: requested },
      });
      await User.findByIdAndUpdate(requested, {
        $pull: { chatRequestsReceived: requester },
      });
      if (notificationId) await Notification.findByIdAndDelete(notificationId);

      // remover notificação do banco
      await Notification.deleteMany({
        recipient: me,
        type: "chat_request",
        conversationId: conv._id,
      });

      emitParticipantChanged(req, existingConversation); // DOC
      return res.status(200).json({
        message: "Conversation already exists (accepted)",
        conversation: existingConversation,
      });
    }

    // (C) Não existe: cria nova (sem pendências, já que está aceitando agora)
    const newConversation = await Conversation.create({
      participants: [requester, requested],
      pendingFor: [], // 🔑 vazio
      leavingUser: null,
    });

    await User.findByIdAndUpdate(requester, {
      $pull: { chatRequestsSent: requested },
    });
    await User.findByIdAndUpdate(requested, {
      $pull: { chatRequestsReceived: requester },
    });
    if (notificationId) await Notification.findByIdAndDelete(notificationId);

    emitParticipantChanged(req, newConversation); // DOC
    return res
      .status(201)
      .json({ message: "Conversation started", conversation: newConversation });
  } catch (error) {
    console.error("Error starting conversation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/usersInChat/:id", protect, async (req, res) => {
  console.log("chacando usuarios na sala");

  try {
    const conversationId = req.params.id;

    const users = await Conversation.findById(conversationId);

    res.status(200).json({ users });
  } catch (error) {
    console.error("Erro ao pegar usuários em chat privado:", error);
    res.status(500).json({ error: "Erro interno." });
  }
});

// routes/directMessages.js
router.post("/reinvite", protect, async (req, res) => {
  console.log("reiviting user...");
  const { conversationId } = req.body;

  console.log("conversationId:", conversationId);

  try {
    // const io = req.app.get("io");
    const conversation = await Conversation.findById(conversationId);

    if (!conversation || !conversation.leavingUser) {
      return res.status(400).json({ error: "Nenhum usuário para reinvitar." });
    }

    const requester = req.user._id;
    const requested = conversation.leavingUser;

    //  // Garante que o usuário ainda não está na conversa
    // if (!conversation.participants.includes(requested)) {
    // conversation.participants.push(requested);
    // }

    // Limpa o leavingUser
    // conversation.leavingUser = null;
    // await conversation.save();
    // ⚠️ Não recoloca nos participants aqui.
    // Apenas registra pedido de chat para o fluxo de aceite.
    // (Aceite via /startNewConversation com conversationId fará o reingresso.)

    // Atualiza campos auxiliares de convite (opcional, se quiser rastrear)
    await User.findByIdAndUpdate(requester, {
      $addToSet: { chatRequestsSent: requested },
    });

    await User.findByIdAndUpdate(requested, {
      $addToSet: { chatRequestsReceived: requester },
    });

    const requesterObject = await User.findById(requester);

    console.log("🟢🟣⚪️ requesterObject:", requesterObject);

    const requestedObject = await User.findById(requested);

    console.log("🟢🟣⚪️ requestedObject:", requestedObject);

    // 🔔 Reutiliza o mesmo tipo de notificação
    await createNotificationUtil({
      recipient: requested,
      fromUser: requester,
      type: "chat_reinvite",
      content: `${requesterObject.username} te convidou para uma conversa privada 4.`,
      conversationId,
    });

    // ✅ Criar mensagem de sistema ANTES de emitir
    // const systemMsg = await Message.create({
    //   conversationId: conversationId,
    //   userId: requested, // ← ESSENCIAL!
    //   username: requestedObject.username,
    //   profileImage: requestedObject.profileImage || "",
    //   message: `${requestedObject.username} voltou para a conversa.`,
    //   timestamp: new Date(),
    //   system: true,
    // });

    // console.log("📦 Mensagem de retorno criada:", systemMsg);

    // console.log("emitindo mensagem via io...");
    // const fullSystemMsg = await Message.findById(systemMsg._id);

    // console.log("🔎 Mensagem completa para emitir:", fullSystemMsg);

    // conversation.participants.forEach((participantId) => {
    //   console.log("📢 Emitindo para:", participantId.toString());
    //   io.to(participantId.toString()).emit("newPrivateMessage", fullSystemMsg);
    // });

    // envia para todos os sockets que entraram na sala dessa conversa
    // io.to(conversationId.toString()).emit("newPrivateMessage", fullSystemMsg);

    res.status(200).json({
      message: "Convite reenviado com sucesso",
      toUserId: requested,
    });
  } catch (err) {
    console.error("Erro ao reinvitar:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// 4. Get received chat requests
router.get("/chatRequests/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate(
      "chatRequestsReceived",
      "username profileImage"
    );
    res.status(200).json({ chatRequests: user.chatRequestsReceived });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// // Marcar como lida uma conversa privada
// router.post("/markAsRead/:conversationId", protect, async (req, res) => {
//   const userId = req.user._id;
//   const { conversationId } = req.params;
//   console.log("🔐 Headers recebidos:", req.headers);

//   try {
//     const user = await User.findById(userId);

//     if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

//     // Atualiza o timestamp de leitura para a conversa específica
//     user.lastReadTimestamps.set(conversationId, new Date());

//     await user.save();

//     res.status(200).json({ message: "Conversa marcada como lida." });
//   } catch (err) {
//     console.error("Erro ao marcar como lida:", err);
//     res.status(500).json({ error: "Erro ao marcar como lida." });
//   }
// });

// Buscar mensagens de uma conversa
router.get("/messages/:conversationId", protect, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const messages = await Message.find({ conversationId }).sort({
      timestamp: 1,
    });
    res.status(200).json(messages);
  } catch (err) {
    console.error("Erro ao buscar mensagens:", err);
    res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

// Marcar mensagens como lidas e retornar total de não lidas
router.post("/markAsRead/:conversationId", protect, async (req, res) => {
  console.log("marking messages as read");

  const userId = req.user._id;
  const { conversationId } = req.params;

  try {
    // 1. Marcar mensagens da conversa atual como lidas
    await Message.updateMany(
      { conversationId, receiver: userId, read: false },
      { $set: { read: true } }
    );

    // Atualiza o timestamp da última leitura para essa conversa
    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          [`lastReadTimestamps.${conversationId}`]: new Date(),
        },
      },
      { new: true }
    );

    // 2. Buscar todas conversas do usuário
    const conversations = await Conversation.find({ participants: userId });

    // 3. Pegar os IDs das conversas
    const conversationIds = conversations.map((c) => c._id);

    // 4. Contar total de mensagens não lidas em todas as conversas
    const totalUnread = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      receiver: userId,
      read: false,
    });

    console.log("totalUnread:", totalUnread);
    return res.status(200).json({ totalUnread });
  } catch (err) {
    console.error("Erro ao marcar mensagens como lidas:", err);
    return res.status(500).json({ error: "Erro interno ao marcar como lida" });
  }
});

// buscar totalUnread messages
router.get("/totalUnread/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const conversations = await Conversation.find({ participants: userId });
    const conversationIds = conversations.map((c) => c._id);

    const totalUnread = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      userId: { $ne: userId }, // só conta mensagens de outros usuários
      read: false,
    });

    return res.status(200).json({ totalUnread });
  } catch (err) {
    console.error("Erro ao contar mensagens não lidas:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// Sair da conversa
// routes/chatRoutes.js
router.delete("/leaveChat/:conversationId", protect, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const me = String(req.user._id);

    const conv = await Conversation.findById(conversationId);
    if (!conv)
      return res.status(404).json({ error: "Conversa não encontrada" });

    const isParticipant = conv.participants.map(String).includes(me);
    if (!isParticipant) {
      return res
        .status(403)
        .json({ error: "Você não participa desta conversa." });
    }

    // remove quem saiu
    conv.participants = conv.participants.filter((id) => String(id) !== me);
    conv.leavingUser = req.user._id;

    // ⚠️ Se não sobra ninguém em participants → apaga
    if (conv.participants.length === 0) {
      // (opcional) apaga notificações pendentes relacionadas a esse conv
      await Notification.deleteMany({ conversationId });

      await Conversation.findByIdAndDelete(conversationId);

      // emite payload final (tudo vazio)
      emitParticipantChanged(req, conversationId, {
        participants: [],
        waitingUser: null,
        leavingUser: me,
      });
      return res.json({
        message: "Conversa excluída (sem participantes restantes).",
      });
    }

    await conv.save();

    // (opcional) mensagem de sistema
    const username = req.user.username || req.user.name || "Alguém";
    const systemMsg = await Message.create({
      conversationId,
      userId: req.user._id,
      username,
      profileImage: req.user.profileImage || "",
      message: `${username} saiu da conversa.`,
      timestamp: new Date(),
      system: true,
    });

    const io = req.app.get("io");
    if (io) io.to(String(conversationId)).emit("newPrivateMessage", systemMsg);

    // atualiza UIs com estado completo
    emitParticipantChanged(req, conv);
    res.json({ message: "Você saiu da conversa." });
  } catch (err) {
    console.error("leaveChat error:", err);
    res.status(500).json({ error: "Erro interno ao sair da conversa." });
  }
});

// ROTA: sair de um chat privado (e deletar se ninguém mais estiver)
// ROTA: sair de um chat privado (e deletar se ninguém mais estiver)
// router.delete("/leaveChat/:conversationId", protect, async (req, res) => {
//   console.log("🧵 [DM] leaveChat…");
//   const { conversationId } = req.params;

//   try {
//     // use SEMPRE o id autenticado (evita spoof no body)
//     const me = String(req.user._id);

//     const conversation = await Conversation.findById(conversationId);
//     if (!conversation) {
//       return res.status(404).json({ error: "Conversa não encontrada" });
//     }

//     // bloqueia saída de quem nem participa
//     const isParticipant = conversation.participants
//       .map((id) => String(id))
//       .includes(me);
//     if (!isParticipant) {
//       return res
//         .status(403)
//         .json({ error: "Você não participa desta conversa." });
//     }

//     // marca quem saiu e remove dos participantes
//     conversation.leavingUser = req.user._id;
//     conversation.participants = conversation.participants.filter(
//       (id) => String(id) !== me
//     );

//     // se ninguém ficou, apaga a conversa
//     if (conversation.participants.length === 0) {
//       await Conversation.findByIdAndDelete(conversationId);

//       // emite evento com payload completo (sem participantes)
//       emitParticipantChanged(req, conversationId, {
//         removedUserId: me,
//         participants: [],
//         leavingUser: me,
//       });

//       return res.json({
//         message: "Conversa excluída (sem participantes restantes).",
//       });
//     }

//     // ainda restou alguém → persiste mudança
//     await conversation.save();

//     // cria mensagem de sistema “fulano saiu…”
//     const username = req.user.username || req.user.name || "Alguém";
//     const systemMsg = await Message.create({
//       conversationId,
//       userId: req.user._id,
//       username,
//       profileImage: req.user.profileImage || "",
//       message: `${username} saiu da conversa.`,
//       timestamp: new Date(),
//       system: true,
//     });
//     const fullSystemMsg = await Message.findById(systemMsg._id);

//     // envia a system message para quem está na SALA da conversa
//     const io = req.app.get("io");
//     if (io)
//       io.to(String(conversationId)).emit("newPrivateMessage", fullSystemMsg);

//     // emite mudança de participantes (lista já atualizada)
//     emitParticipantChanged(req, conversationId, {
//       removedUserId: me,
//       participants: conversation.participants.map((id) => String(id)),
//       leavingUser: me,
//     });

//     return res.json({ message: "Você saiu da conversa." });
//   } catch (err) {
//     console.error("❌ Erro ao sair da conversa:", err);
//     res.status(500).json({ error: "Erro interno ao sair da conversa." });
//   }
// });

// GET: detalhe da conversa
router.get("/conversation/:conversationId", protect, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv)
      return res.status(404).json({ error: "Conversa não encontrada" });
    res.json(conv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = router;
