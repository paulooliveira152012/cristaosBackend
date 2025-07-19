const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
// Function to send emails
const {
  sendVerificationLink,
  sendResetLink,
} = require("../utils/emailService");
const mongoose = require("mongoose");
const User = require("../models/Usuario");
const Notification = require("../models/Notification");
const Listing = require("../models/Listing");
const Comment = require("../models/Comment");
const { protect } = require("../utils/auth");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const createNotification = require("../utils/notificationUtils");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// User Signup
// User Signup
router.post("/signup", async (req, res) => {
  console.log("rota signup encontrada");
  const { username, email, password, profileImage } = req.body;

  console.log("Received fields:", { username, email, password, profileImage });

  try {
    // Check for missing fields
    if (!email || !password || !username) {
      console.log("Missing fields detected");
      return res
        .status(400)
        .json({ message: "Todos os campos são necessários!" });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log("User already exists with email:", email);
      return res.status(400).json({ message: "Usuário já existente" });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    console.log("Generated verification token:", verificationToken);

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Password hashed successfully");

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      profileImage: profileImage || "", // Optional profile image
      verificationToken, // Store the generated verification token
      isVerified: false, // User is not verified until they confirm the email
    });

    await user.save();
    console.log("User saved successfully");

    console.log("Sending verification link to email:", email);
    const verificationUrl = `${process.env.VERIFICATION_URL}${verificationToken}`;

    // Send the email with the verification link
    await sendVerificationLink(email, verificationUrl);

    res.status(201).json({
      message:
        "Usuário criado com sucesso! Verifique seu email para confirmar sua conta.",
    });
  } catch (error) {
    console.log("Error during signup:", error.message);
    res.status(500).json({
      message: "Um erro ocorreu ao criar novo usuário",
      error: error.message,
    });
  }
});

// Verify Account
// Verify Account Route
router.get("/verifyAccount/:token", async (req, res) => {
  console.log("Route for verifying account reached");

  const { token } = req.params;
  console.log("Received verification request with token:", token);

  try {
    // Find user by verification token (use verificationCode)
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      console.log("User not found");
      return res
        .status(400)
        .json({ message: "Token de verificação inválido ou expirado." });
    }

    // Verify the user and clear the token
    user.isVerified = true;
    user.verificationCode = undefined; // Clear the token once verified
    await user.save();

    console.log("User verified successfully:", user.email);

    // Send a success response
    res.status(200).json({ message: "Conta verificada com sucesso!" });
  } catch (error) {
    console.error("Erro ao verificar a conta:", error);
    res
      .status(500)
      .json({ message: "Erro ao verificar a conta.", error: error.message });
  }
});

// Rota para verificar existência de usuário
router.get("/users/:id", protect, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
  res.status(200).json({ user });
});


// User Login
router.post("/login", async (req, res) => {
  console.log("na rota de login");
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Todos os campos são necessários" });
    }

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Credenciais inválidas" });

    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: "Verifique sua conta antes de fazer login." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Credenciais inválidas" });

    // Criar o token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    console.log("token JWT:", token);

    // Enviar o token como cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true em produção
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    });

    // Retornar o usuário (sem a senha)
    const userObject = user.toObject();
    delete userObject.password;
    res.status(200).json(userObject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// User Signout
router.post("/signout", (req, res) => {
  res.json({ msg: "Sessão encerrada!" });
});

router.delete("/delete-account/:id", async (req, res) => {
  console.log("rota para deletar conta alcançada");

  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user ID" });

    // 1. Deletar todos os listings criados pelo usuário
    console.log("Deletando listings...");
    await Listing.deleteMany({ userId: id });

    // 2. Remover o usuário de todas as listas de amigos e solicitações
    console.log("Removendo usuário das listas de amigos...");
    await User.updateMany(
      {
        $or: [
          { friends: id },
          { sentFriendRequests: id },
          { friendRequests: id },
        ],
      },
      {
        $pull: {
          friends: id,
          sentFriendRequests: id,
          friendRequests: id,
        },
      }
    );

    // 3. Remover comentários feitos pelo usuário
    console.log("Removendo comentários...");
    await Listing.updateMany(
      {},
      { $pull: { comments: { user: id } } }
    );

    // 4. Remover replies feitas pelo usuário
    console.log("Removendo replies...");
    await Listing.updateMany(
      {},
      { $pull: { "comments.$[].replies": { user: id } } }
    );

    // 5. Remover likes do usuário em listings
    console.log("Removendo likes de listings...");
    await Listing.updateMany(
      {},
      { $pull: { likes: id } }
    );

    // 6. Remover likes do usuário em comentários e replies
    console.log("Removendo likes de comentários e replies...");
    const listings = await Listing.find({});

    for (const listing of listings) {
      let modified = false;

      for (const comment of listing.comments) {
        // Remover like do comentário
        const originalLikes = comment.likes.length;
        comment.likes = comment.likes.filter(
          (userId) => userId.toString() !== id
        );
        if (comment.likes.length !== originalLikes) modified = true;

        // Remover like das replies
        for (const reply of comment.replies) {
          const originalReplyLikes = reply.likes.length;
          reply.likes = reply.likes.filter(
            (userId) => userId.toString() !== id
          );
          if (reply.likes.length !== originalReplyLikes) modified = true;
        }
      }

      if (modified) await listing.save();
    }

    // 7. Finalmente, deletar o próprio usuário
    console.log("Deletando usuário...");
    const result = await User.findByIdAndDelete(id);
    if (!result)
      return res.status(404).json({ message: "Usuário não encontrado" });

    res.status(200).json({ message: "Conta deletada com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar conta:", error);
    res.status(500).json({ message: error.message });
  }
});

// Forgot Password Route
router.post("/forgotPassword", async (req, res) => {
  const { email } = req.body;

  try {
    // Check if the user exists
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a new reset token (similar to verification code but for password reset)
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Set the reset token and expiration time on the user model
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration

    // Save the updated user with the reset token
    await user.save();

    console.log(`Sending password reset link to email: ${email}`);

    // create the reset link with the token as a query parameter
    // const resetLink = `http://localhost:3000/passwordReset?token=${resetToken}`
    const resetLink = `https://cristaosbackend.onrender.com/passwordReset?token=${resetToken}`;

    // Send reset token to the user's email
    await sendResetLink(email, resetLink);

    res.status(200).json({
      message: "Password reset link has been sent to your email.",
    });
  } catch (error) {
    console.error("Error in /forgotPassword:", error);
    res
      .status(500)
      .json({ message: "An error occurred while sending the reset link." });
  }
});

// Route to update password
router.put("/resetPassword", async (req, res) => {
  const { newPassword, confirmNewPassword, token } = req.body;

  console.log("received token:", token);
  console.log("newPassword is:", newPassword);
  console.log("confirmNewPassword is:", confirmNewPassword);

  // Validate passwords
  if (!newPassword || !confirmNewPassword) {
    console.log("Both fields required");
    return res
      .status(400)
      .json({ message: "Por favor preencher todos os campos" });
  }

  if (newPassword !== confirmNewPassword) {
    console.log("Passwords do not match");
    return res.status(400).json({
      message: "As senhas nao correspondem, por favor preencher novamente",
    });
  }

  try {
    // Find the user by reset token and ensure it's not expired
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Ensure the token has not expired
    });

    if (!user) {
      console.log("Token is invalid or has expired");
      return res.status(400).json({ message: "Token inválido ou expirado" });
    }

    console.log("User found with valid token");

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the user's password and remove the reset token and expiration
    user.password = hashedPassword;
    user.resetPasswordToken = undefined; // Clear the reset token
    user.resetPasswordExpires = undefined; // Clear the token expiration time

    await user.save();
    console.log("Password successfully updated");

    res.status(200).json({ message: "Senha atualizada com sucesso" });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server error, please try again later" });
  }
});

// Atualizar informações do usuário
// Atualizar informações do usuário
router.put("/update/:id", async (req, res) => {
  console.log("rota para atualizar alcançada...");

  const { id } = req.params;
  const { currentPassword, newPassword, confirmPassword, ...updates } =
    req.body;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    // Se o usuário está tentando alterar a senha
    if (currentPassword || newPassword || confirmPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res
          .status(400)
          .json({ error: "Preencha todos os campos da senha." });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        return res.status(401).json({ error: "Senha atual incorreta." });
      }

      if (newPassword !== confirmPassword) {
        console.log("senha auterada");
        return res
          .status(400)
          .json({ error: "A nova senha e a confirmação não coincidem." });
      }

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(newPassword, salt);
      updates.password = hashed;
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    console.log("atualizado!");

    res
      .status(200)
      .json({ message: "Usuário atualizado com sucesso", user: updatedUser });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({ error: "Erro interno ao atualizar o usuário" });
  }
});

// Send friend request
router.post("/friendRequest/:friendId", protect, async (req, res) => {
  console.log("🔹 Enviando pedido de amizade");

  const userId = req.user._id;
  const { friendId } = req.params;

  if (userId.toString() === friendId) {
    return res
      .status(400)
      .json({ error: "Você não pode se adicionar como amigo." });
  }

  const user = await User.findById(userId);
  const friend = await User.findById(friendId);

  if (!friend) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  const alreadyFriends = user.friends.includes(friendId);
  const alreadySent = user.sentFriendRequests.includes(friendId);
  const alreadyReceived = friend.friendRequests.includes(userId);

  if (alreadyFriends || alreadySent || alreadyReceived) {
    return res
      .status(400)
      .json({ error: "Pedido já enviado ou usuário já é seu amigo." });
  }

  // Inicializa arrays caso venham undefined
  user.sentFriendRequests = user.sentFriendRequests || [];
  friend.friendRequests = friend.friendRequests || [];

  user.sentFriendRequests.push(friendId);
  friend.friendRequests.push(userId);

  await user.save();
  await friend.save();

   // ✅ Aqui: criar notificação
  await createNotification({
    recipient: friendId,
    fromUser: userId,
    type: "friend_request",
    content: "enviou um pedido de amizade",
  });

  return res
    .status(200)
    .json({ message: "Pedido de amizade enviado com sucesso." });
});

// accept friend request:
router.post("/acceptFriend/:requesterId", protect, async (req, res) => {
  const userId = req.user._id;
  const { requesterId } = req.params;

  const user = await User.findById(userId);
  const requester = await User.findById(requesterId);

  if (!user.friendRequests.includes(requesterId)) {
    return res
      .status(400)
      .json({ error: "Não há pedido de amizade desse usuário." });
  }

  // Remover o pedido
  user.friendRequests = user.friendRequests.filter(
    (id) => id.toString() !== requesterId
  );
  requester.sentFriendRequests = requester.sentFriendRequests.filter(
    (id) => id.toString() !== userId.toString()
  );

  // Adicionar como amigos
  user.friends.push(requesterId);
  requester.friends.push(userId);

  await user.save();
  await requester.save();

  // 🧹 Remover notificações antigas de friend_request
  await Notification.deleteMany({
    type: "friend_request",
    fromUser: requesterId,
    recipient: userId,
  });

  // (Opcional) Criar uma notificação de aceitação
  await Notification.create({
    type: "friend_request_accepted",
    fromUser: userId,
    recipient: requesterId,
    content: `${user.username} aceitou seu pedido de amizade.`,
  });

  return res.status(200).json({ message: "Pedido de amizade aceito." });
});

// decline friend request:
router.post("/rejectFriend/:requesterId", protect, async (req, res) => {
  const userId = req.user._id;
  const { requesterId } = req.params;

  const user = await User.findById(userId);
  const requester = await User.findById(requesterId);

  if (!user.friendRequests.includes(requesterId)) {
    return res
      .status(400)
      .json({ error: "Não há pedido de amizade desse usuário." });
  }

  // Remover o pedido
  user.friendRequests = user.friendRequests.filter(
    (id) => id.toString() !== requesterId
  );
  requester.sentFriendRequests = requester.sentFriendRequests.filter(
    (id) => id.toString() !== userId.toString()
  );

  await user.save();
  await requester.save();

  // 🧹 Remover notificações antigas de friend_request
  await Notification.deleteMany({
    type: "friend_request",
    fromUser: requesterId,
    recipient: userId,
  });

  return res.status(200).json({ message: "Pedido de amizade recusado." });
});

// lista de pedidos pendentes
router.get("/friendRequests", protect, async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).populate(
    "friendRequests",
    "username profileImage"
  );
  return res.status(200).json({ friendRequests: user.friendRequests });
});

// 🔹 Remove friend
router.post("/removeFriend/:friendId", protect, async (req, res) => {
  const userId = req.user._id;
  const { friendId } = req.params;

  try {
    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    user.friends = user.friends.filter((id) => id.toString() !== friendId);
    friend.friends = friend.friends.filter(
      (id) => id.toString() !== userId.toString()
    );

    await user.save();
    await friend.save();

    return res.status(200).json({ message: "Amigo removido com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 🔹 Get friends list
// 🔹 Buscar amigos de qualquer usuário pelo ID
router.get("/:userId/friends", async (req, res) => {
  console.log("🔹 Rota GET /:userId/friends acessada");

  try {
    const user = await User.findById(req.params.userId).populate(
      "friends",
      "username profileImage"
    );

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    return res.status(200).json({ friends: user.friends });
  } catch (error) {
    console.error("Erro ao buscar amigos:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
