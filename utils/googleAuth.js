// utils/googleAuth.js
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/Usuario");
const jwt = require("jsonwebtoken");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const verifyGoogleToken = async (token) => {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const { email, name, sub: googleId } = payload;

  return { email, name, googleId };
};

const findOrCreateUserFromGoogle = async ({ email, name, googleId }) => {
  let user = await User.findOne({ email });

  if (!user) {
    // Criar novo usuário se não existir
    user = new User({
      username: name,
      email,
      googleId,
      isVerified: true,
      profileImage: "", // Pode extrair da imagem do Google se quiser
    });
    await user.save();
  }

  return user;
};

const createJwtForUser = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

module.exports = {
  verifyGoogleToken,
  findOrCreateUserFromGoogle,
  createJwtForUser,
};
