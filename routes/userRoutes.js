const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
// Function to send emails
const {
  sendVerificationLink,
  sendEmailUpdateVerification,
  sendResetLink,
} = require("../utils/emailService");
const mongoose = require("mongoose");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Report = require("../models/Reports");
const DirectMessageRequest = require("../models/DirectMessage");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Listing = require("../models/Listing");
const Church = require("../models/church");
const ChurchMembership = require("../models/churchMembers");
const Comment = require("../models/Comment");
const { 
  protect, 
  setAuthCookies, 
  createJwtForUser, 
  clearAuthCookie
} = require("../utils/auth");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const createNotificationUtil = require("../utils/notificationUtils");
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const {
  verifyGoogleToken,
  findOrCreateUserFromGooglePayload,
} = require("../utils/googleAuth");

const { sendVerificationSMS } = require("../utils/sms");
const { ConversationRelay } = require("twilio/lib/twiml/VoiceResponse");

router.get("/getAllUsers", async (req, res) => {
  // console.log("🟢 🟢 🟢  rota de buscar todos os usuarios...");

  try {
    const users = await User.find({ isBanned: false }, "_id username profileImage");
    // console.log("response:", users);
    // populate currentUser's friends
    const currentUserFriends = await User.findById(req.userId).populate(
      "friends",
      "_id username profileImage"
    );
    console.log("currentUserFriends:", currentUserFriends);

    res.status(200).json({ users, currentUserFriends });
  } catch (err) {
    console.log("error:", err);
    res.status(500).json({ message: "Erro ao buscar usuarios" });
  }
});

// google login
// POST /api/users/google-login
router.post("/google-login", async (req, res) => {
  console.log("🥭 logging in via google");
  try {
    const { credential, token, rememberMe, acceptTerms } = req.body;
    const idToken = credential || token;
    if (!idToken) return res.status(400).json({ message: "Token ausente" });

    // 1) Verifica token do Google e acha/cria o user
    const payload = await verifyGoogleToken(idToken);
    const { user: foundUser, created } =
      await findOrCreateUserFromGooglePayload(payload);

    // Se veio POJO, recarrega como doc do Mongoose
    const user = (foundUser && typeof foundUser.save === "function")
      ? foundUser
      : await User.findById(foundUser?._id);

    if (!user) return res.status(401).json({ message: "Usuário não encontrado" });

    // 2) Banidos fora
    if (user.isBanned) {
      return res.status(403).json({ code: "BANNED", message: "Conta banida" });
    }

    // 3) Checa termos (com versão)
    const requiredVersion = String(process.env.TERMS_VERSION || "1");
    const hasAccepted = !!user.hasAcceptedTerms;
    const currentVersion = user.termsVersion ? String(user.termsVersion) : null;
    const mustAccept = !hasAccepted || currentVersion !== requiredVersion;

    const acceptFlag =
      acceptTerms === true ||
      acceptTerms === "true" ||
      acceptTerms === 1 ||
      acceptTerms === "1";

    if (mustAccept) {
      if (acceptFlag) {
        user.hasAcceptedTerms = true;
        user.termsVersion = requiredVersion;
        user.hasAcceptedTermsAt = new Date();
        await user.save();
      } else {
        return res.status(428).json({
          code: "TERMS_REQUIRED",
          message: "Você precisa aceitar os Termos e a Privacidade para continuar.",
          accepted: hasAccepted,
          currentVersion,
          requiredVersion,
          createdNow: !!created,
        });
      }
    }

    // 4) Emite token/cookie centralizado
    const expiresIn = rememberMe ? "30d" : "7d";
    const jwtToken = createJwtForUser(user, expiresIn); // << passe o doc
    setAuthCookies(res, jwtToken, { rememberMe });

    const { password, ...safe } = user.toObject();
    return res.json({ user: safe, token: jwtToken });
  } catch (err) {
    console.error("google-login error:", err);
    return res.status(401).json({ message: "Token inválido ou falha na autenticação" });
  }
});




// helper: atualizar cache de contagem
async function refreshMembersCount(churchId) {
  const count = await ChurchMembership.countDocuments({
    church: churchId,
    status: "active",
  });
  await Church.findByIdAndUpdate(churchId, { membersCount: count });
}

// User Signup
// User Signup
router.post("/signup", async (req, res) => {
  console.log(" rota signup encontrada");
  const {
    username,
    firstName,
    lastName,
    city,
    state,
    email,
    password,
    phone,
    profileImage,
    church: churchId,
  } = req.body;

  console.log("signup route...");

  console.log("Received fields:", {
    username,
    firstName,
    lastName,
    city,
    state,
    email,
    phone,
    password,
    profileImage,
    isVerified: true,
    church: churchId,
  });

  try {
    // Check for missing fields
    if (!email || !password || !username) {
      console.log("Missing fields detected");
      return res
        .status(400)
        .json({ message: "Todos os campos são necessários!" });
    }

    // check if user was banned
    const userHasBeenBanned = await User.findOne({ email })
    if (userHasBeenBanned && userHasBeenBanned.isBanned) {
      console.log("usuario banido")
      res.send("Usuario banido")
      return
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log("User already exists with email:", email);
      return res.status(400).json({ message: "Usuário já existente" });
    }

    // se veio churchId, valida formato e existência
    let validChurchId = null;
    if (churchId) {
      if (!mongoose.isValidObjectId(churchId)) {
        return res.status(400).json({ message: "church inválida" });
      }
      const exists = await Church.exists({ _id: churchId });
      if (!exists) {
        return res.status(404).json({ message: "Igreja não encontrada" });
      }
      validChurchId = churchId;
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
      firstName,
      lastName,
      city,
      state,
      email,
      phone,
      password: hashedPassword,
      profileImage: profileImage || "", // Optional profile image
      verificationToken, // Store the generated verification token
      isVerified: false, // User is not verified until they confirm the email
      church: validChurchId || null,
    });

    // se tem igreja -> cria/atualiza vínculo e atualiza contagem
    if (validChurchId) {
      await ChurchMembership.findOneAndUpdate(
        { user: user._id, church: validChurchId },
        {
          user: user._id,
          church: validChurchId,
          role: "member",
          status: "active",
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await refreshMembersCount(validChurchId);
    }

    await user.save();
    console.log("User saved successfully");

    // console.log("Sending verification link to email:", email);
    // const verificationUrl = `${process.env.VERIFICATION_URL}${verificationToken}`;

    // // Send the email with the verification link
    // await sendVerificationLink(email, verificationUrl);

    return res.status(201).json({
      message: `Usuário criado com sucesso! Verifique seu email para confirmar sua conta. ${user._id}`,
      userId: user._id,
    });
  } catch (error) {
    console.log("Error during signup:", error.message);
    res.status(500).json({
      message: "Um erro ocorreu ao criar novo usuário",
      error: error.message,
    });
  }
});

// rota para mandar codigo de verificação por email
router.post("/sendVerificationByEmail", async (req, res) => {
  console.log("route: send email verification");
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "ID do usuário não fornecido." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    const email = user.email;
    if (!email) {
      return res
        .status(400)
        .json({ message: "Usuário não possui e-mail cadastrado." });
    }

    // Gerar novo token de verificação
    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = verificationToken;
    await user.save();

    const verificationUrl = `${process.env.VERIFICATION_URL}${verificationToken}`;

    console.log("Sending verification link to email:", email);

    // Função que envia o email
    await sendVerificationLink(email, verificationUrl);

    res.status(200).json({
      message: `Link de verificação enviado para ${email}.`,
    });
  } catch (error) {
    console.error("Erro ao enviar link de verificação por email:", error);
    res
      .status(500)
      .json({ message: "Erro ao enviar link de verificação por email." });
  }
});

// rota para mandar codigo de verificação por telefone
router.post("/sendVerificationByPhone", async (req, res) => {
  console.log("route for sending a verification by SMS...");

  const { userId } = req.body;
  console.log(userId);

  // gerar o token
  // Generate verification token
  const token = crypto.randomBytes(32).toString("hex");
  console.log("Generated verification token:", token);

  try {
    if (!token) return res.status(400).json({ message: "Token ausente." });

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ message: "Usuário não encontrado." });
    if (!user.phone)
      return res
        .status(400)
        .json({ message: "Usuário não forneceu telefone." });

    // Gerar novo token
    const newToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = newToken;
    await user.save();

    const smsMessage = `Seu link de verificação: ${process.env.EMAIL_VERIFICATION_URL}?token=${newToken}`;

    await sendVerificationSMS(user.phone.toString(), smsMessage);

    return res.status(200).json({ message: "Novo link enviado por SMS." });
  } catch (error) {
    console.error("Erro ao reenviar verificação por SMS:", error);
    return res.status(500).json({ message: "Erro interno ao reenviar." });
  }
});

// rota para reenviar código de verificação por email usando o email do usuário
router.post("/resendVerificationEmail", async (req, res) => {
  console.log("Rota: resendVerificationEmail");

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email não fornecido." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Conta já está verificada." });
    }

    // Gerar novo token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = verificationToken;
    await user.save();

    const verificationUrl = `${process.env.VERIFICATION_URL}${verificationToken}`;
    console.log("Reenviando link de verificação para:", email);

    await sendVerificationLink(email, verificationUrl);

    res.status(200).json({
      message: `Novo link de verificação enviado para ${email}.`,
    });
  } catch (error) {
    console.error("Erro ao reenviar verificação:", error);
    res.status(500).json({ message: "Erro ao reenviar verificação." });
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
    user.verificationToken = undefined; // Clear the token once verified
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

// resendVerificationByEmail NAO EM USO
router.post("/resendVerificationByEmail", async (req, res) => {
  const { token } = req.body;

  try {
    if (!token) return res.status(400).json({ message: "Token ausente." });

    const user = await User.findOne({ verificationToken: token });
    if (!user)
      return res.status(404).json({ message: "Usuário não encontrado." });

    // Gerar novo token
    const newToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = newToken;
    await user.save();

    const verificationLink = `${process.env.EMAIL_VERIFICATION_URL}?token=${newToken}`;

    // await sendVerificationEmail(user.email, verificationLink);
    await sendVerificationLink(email, verificationLink);

    return res.status(200).json({ message: "Novo link enviado por e-mail." });
  } catch (error) {
    console.error("Erro ao reenviar verificação por email:", error);
    return res.status(500).json({ message: "Erro interno ao reenviar." });
  }
});

// Rota para verificar existência de usuário
router.get("/users/:id", protect, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
  res.status(200).json({ user });
});

// /routes/userRoutes.js
router.get("/current", protect, async (req, res) => {
  console.log("Rota para obter usuário atual");
  if (!req.user) {
    console.log("usuario nao autenticado");
    return res.status(401).json({ message: "Não autenticado" });
  }
  res.status(200).json(req.user); // já vem sem senha do middleware
});

// User Login
// User Login
// routes/auth.js
// POST /login
router.post("/login", async (req, res) => {
  console.log("1) Rota de login acessada");
  const { identifier, password, acceptTerms, rememberMe } = req.body;

  try {
    if (!identifier || !password) {
      return res.status(400).json({ message: "Todos os campos são necessários" });
    }

    const isEmail = identifier.includes("@");
    const query = isEmail
      ? { email: identifier.toLowerCase() }
      : { phone: Number(identifier) };

    const user = await User.findOne(query);
    if (!user) return res.status(400).json({ message: "Credenciais inválidas" });

    if (user.isBanned) {
      return res.status(403).json({ code: "BANNED", message: "Conta banida" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: "Verifique sua conta antes de fazer login." });
    }

    if (!user.password) {
      return res.status(403).json({
        message:
          "Essa conta foi criada com o login do Google. Use 'Entrar com Google' ou 'redefinir aqui'.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Credenciais inválidas" });

    // --- Checagem de termos (inclui versão) ---
    const requiredVersion = String(process.env.TERMS_VERSION || "1");
    const hasAccepted = !!user.hasAcceptedTerms;
    const currentVersion = user.termsVersion ? String(user.termsVersion) : null;
    const mustAccept = !hasAccepted || currentVersion !== requiredVersion;

    const acceptFlag =
      acceptTerms === true ||
      acceptTerms === "true" ||
      acceptTerms === 1 ||
      acceptTerms === "1";

    if (mustAccept) {
      if (acceptFlag) {
        user.hasAcceptedTerms = true;
        user.termsVersion = requiredVersion;
        user.hasAcceptedTermsAt = new Date();
        await user.save();
      } else {
        return res.status(428).json({
          code: "TERMS_REQUIRED",
          message: "Você precisa aceitar os Termos e a Privacidade para continuar.",
          accepted: hasAccepted,
          currentVersion,
          requiredVersion,
        });
      }
    }

    // --- JWT + Cookie (usa tv/sv) ---
    const expiresIn = rememberMe ? "30d" : "7d";
    const token = createJwtForUser(user, expiresIn); // << passe o doc do usuário
    setAuthCookies(res, token, { rememberMe });      // << centralizado

    const { password: _pw, ...safe } = user.toObject();
    return res.status(200).json({ user: safe, token });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ message: error.message });
  }
});


// debug route for cookies set up
router.get("/debug/cookies", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).end();
  }
  console.log("🥳🥳🥳 Cookies recebidos:", req.cookies);
  res.json(req.cookies);
});

const ONLINE_WINDOW_MS = Number(process.env.ONLINE_WINDOW_MS || 3 * 60 * 1000);

async function getActiveUsersFromDB() {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);

  return User.find({
    lastHeartbeat: { $gte: cutoff },   // só quem enviou heartbeat dentro da janela
    isBanned: { $ne: true },           // não banidos
    presenceStatus: "active",          // só ativos
  })
    .select("_id username profileImage lastHeartbeat presenceStatus")
    .lean();
}

async function emitOnlineUsersFromDB(io, socket = null) {
  try {
    const list = await getActiveUsersFromDB();

    // Loga a lista de usuários ativos
    console.log("🔵 Usuários online (ativos):", list);

    // Envia a lista filtrada para o frontend
    (socket || io).emit("onlineUsers", list);
  } catch (err) {
    console.error("❌ Erro ao emitir usuários online:", err);
  }
}

// User Signout
// Rota de logout
router.post("/signout/:userId", async (req, res) => {
  console.log("signing out");

  // 1) Extrai userId corretamente
  const { userId } = req.params;

  try {
    // (Opcional mas recomendado) se tiver auth middleware:
    // if (!req.user || String(req.user._id) !== String(userId)) {
    //   return res.status(403).json({ ok: false, message: "Não autorizado" });
    // }

    // 2) Atualiza presença no banco
    await User.findByIdAndUpdate(userId, {
      presenceStatus: "inactive",
      lastHeartbeat: null, // cuidado: se seu schema exige Date, troque por new Date(0)
    });

    // 3) Limpa cookie/token
    clearAuthCookie(res);

    // 4) Emite a lista atualizada para todos (ou apenas para alguns)
    const io = req.app.get("io");         // garanta que você fez app.set("io", io) no setup
    if (io) {
      // se você já tem essa função util
      try {
        await emitOnlineUsersFromDB(io);
      } catch (e) {
        console.error("Falha ao emitir onlineUsers:", e);
      }
    }

    return res.json({ ok: true, message: "Sessão encerrada!" });
  } catch (err) {
    console.error("❌ Erro no signout:", err);
    return res.status(500).json({ ok: false, message: "Erro interno ao encerrar sessão" });
  }
});


router.delete("/delete-account/:id", protect, async (req, res) => {
  console.log("rota para deletar conta alcançada");

  if (String(req.user._id) !== String(id)) {
    return res
      .status(403)
      .json({ message: "Sem permissão para deletar esta conta." });
  }

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
    await Listing.updateMany({}, { $pull: { comments: { user: id } } });

    // 4. Remover replies feitas pelo usuário
    console.log("Removendo replies...");
    await Listing.updateMany(
      {},
      { $pull: { "comments.$[].replies": { user: id } } }
    );

    // 5. Remover likes do usuário em listings
    console.log("Removendo likes de listings...");
    await Listing.updateMany({}, { $pull: { likes: id } });

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
    const resetLink = `${process.env.RESET_PASSWORD_LINK}${resetToken}`;
    // const resetLink = `https://cristaosbackend.onrender.com/passwordReset?token=${resetToken}`;

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
  console.log("resetando password...");
  const { newPassword, confirmNewPassword, token } = req.body;

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
router.put("/update/:id", protect, async (req, res) => {
  console.log("rota para atualizar alcançada...");

  const { id } = req.params; // <-- pegue o id primeiro
  const authId = String(req.user?._id || req.user?.id || "");

    if (!authId) {
    return res.status(401).json({ error: "Não autenticado." });
  }


  if (String(req.user._id) !== String(id)) {
    return res
      .status(403)
      .json({ error: "Sem permissão para atualizar este usuário." });
  }

  const { currentPassword, newPassword, confirmPassword, email, ...updates } =
    req.body;

  try {
    const user = await User.findById(id);
    if (!user)
      return res.status(404).json({ error: "Usuário não encontrado." });

    // Verifica se o e-mail está tentando ser alterado
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ error: "Este e-mail já está em uso por outro usuário." });
      }

      // Gerar token de verificação
      const emailUpdateToken = crypto.randomBytes(32).toString("hex");
      const verificationUrl = `${process.env.EMAIL_VERIFICATION_URL}/${emailUpdateToken}`;

      // Salvar token e novo e-mail temporariamente
      user.emailUpdateToken = emailUpdateToken;
      user.newEmail = email;
      await user.save();

      // Enviar email de confirmação
      await sendEmailUpdateVerification(email, verificationUrl);

      return res.status(200).json({
        message:
          "Verificação enviada para o novo e-mail. Confirme para concluir a atualização.",
      });
    }

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
        return res
          .status(400)
          .json({ error: "A nova senha e a confirmação não coincidem." });
      }

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(newPassword, salt);
      updates.password = hashed;
    }

    //  Validar número de telefone, se estiver sendo atualizado
    if (
      updates.phone !== undefined &&
      updates.phone !== null &&
      updates.phone !== ""
    ) {
      const phoneStr = updates.phone.toString();
      if (!/^\d{8,15}$/.test(phoneStr)) {
        return res
          .status(400)
          .json({ error: "Número de telefone inválido. Use apenas números." });
      }
    } else {
      // remove o campo para evitar validação indevida
      delete updates.phone;
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    console.log("Usuário atualizado com sucesso.");

    res
      .status(200)
      .json({ message: "Usuário atualizado com sucesso", user: updatedUser });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({ error: "Erro interno ao atualizar o usuário." });
  }
});

// Confirmar atualização de e-mail
router.get("/confirm-email-update/:token", async (req, res) => {
  console.log("Rota de confirmar novo email");
  const { token } = req.params;

  try {
    const user = await User.findOne({ emailUpdateToken: token });

    if (!user || !user.newEmail) {
      return res.status(400).send("Token inválido ou expirado.");
    }

    // Atualizar o e-mail
    user.email = user.newEmail;
    user.newEmail = undefined;
    user.emailUpdateToken = undefined;

    await user.save();

    res.send("E-mail atualizado com sucesso!");
  } catch (error) {
    console.error("Erro ao confirmar e-mail:", error);
    res.status(500).send("Erro interno ao confirmar o e-mail.");
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

  //  Notificação com socket
  const io = req.app.get("io");

  //  Aqui: criar notificação
  await createNotificationUtil({
    io,
    recipient: friendId,
    fromUser: userId,
    type: "friend_request",
    content: "enviou um pedido de amizade",
  });

  return res
    .status(200)
    .json({ message: "Pedido de amizade enviado com sucesso." });
});

router.get("/ping", (req, res) => {
  res.send("pong");
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
  console.log("userId:", req.params.userId);

  const userId = req.params.userId;

  if (!userId) {
    console.log("❌ userId não fornecido");
    return res.status(400).json({ error: "ID de usuário não fornecido." });
  }

  try {
    const user = await User.findById(userId).populate(
      "friends",
      "username profileImage"
    );

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    console.log("Amigos encontrados:", user.friends);

    return res.status(200).json({ friends: user.friends });
  } catch (error) {
    console.error("Erro ao buscar amigos:", error);
    return res.status(500).json({ error: error.message });
  }
});

// route for main chat
router.get("/checkUnreadMainChat", protect, async (req, res) => {
  // console.log(" checking for unread messages route...");

  try {
    const user = await User.findById(req.user._id);
    const lastSeen = user.lastMainChatRead || new Date(0);

    // Conta mensagens enviadas por OUTRAS pessoas após o último visto
    const count = await Message.countDocuments({
      roomId: "mainChatRoom",
      timestamp: { $gt: lastSeen },
      userId: { $ne: req.user._id },
    });

    // Pega a última mensagem do main chat
    const lastMessage = await Message.findOne({
      roomId: "mainChatRoom",
    })
      .sort({ timestamp: -1 })
      .select("userId")
      .lean();

    res.json({
      count,
      lastMessageUserId: lastMessage?.userId?.toString() || null,
    });
  } catch (error) {
    console.error("Erro ao buscar mensagens não lidas:", error);
    res.status(500).json({ message: "Erro ao verificar mensagens." });
  }
});

router.post("/markMainChatAsRead", protect, async (req, res) => {
  console.log("markMainChatAsRead route reached");

  try {
    const user = await User.findById(req.user._id);
    user.lastMainChatRead = new Date();
    await user.save();

    res.status(200).json({ message: "Último acesso ao chat registrado." });
  } catch (error) {
    console.error("Erro ao atualizar leitura:", error);
    res.status(500).json({ message: "Erro ao marcar como lido." });
  }
});

router.post("/saveBio", protect, async (req, res) => {
  console.log("saveBio route reached");

  try {
    const user = await User.findById(req.user._id);
    user.bio = req.body.bio || "";
    await user.save();

    res.status(200).json({ message: "Bio salva com sucesso." });
  } catch (error) {
    console.error("Erro ao salvar bio:", error);
    res.status(500).json({ message: "Erro ao salvar bio." });
  }
});

// POST /api/users/report
// POST /api/reports
router.post("/reports", protect, async (req, res) => {
  console.log("reporting a user...")
   try {
    const reporterId = req.user._id; // ✅ confie no middleware
    const { targetId, reason, source = "profile", category = "other", context = {} } = req.body;

    if (!targetId || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ ok: false, message: "targetId inválido/ausente" });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ ok: false, message: "Motivo obrigatório" });
    }
    if (String(reporterId) === String(targetId)) {
      return res.status(400).json({ ok: false, message: "Você não pode reportar a si mesmo." });
    }

    // dedupe simples: últimos 20 min
    const windowMs = 20 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);
    const sameRecent = await Report.findOne({
      reportingUser: reporterId,
      reportedUser: targetId,
      source,
      "context.listing": context?.listing || null,
      "context.message": context?.message || null,
      reason: reason.trim(),
      createdAt: { $gte: since },
    }).lean();

    if (sameRecent) {
      return res.status(200).json({ ok: true, deduped: true, reportId: sameRecent._id });
    }

    const doc = await Report.create({
      reportingUser: reporterId,
      reportedUser: targetId,
      reason: reason.trim(),
      source,
      category,
      context: {
        listing: context?.listing || undefined,
        comment: context?.comment || undefined,
        message: context?.message || undefined,
        url: context?.url || undefined,
      },
      evidence: Array.isArray(req.body.evidence) ? req.body.evidence : [],
    });

    return res.status(201).json({ ok: true, reportId: doc._id });
  } catch (err) {
    console.error("POST /reportUser error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao criar reporte" });
  }
});



module.exports = router;
