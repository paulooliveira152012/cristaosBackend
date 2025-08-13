// utils/googleAuth.js
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "");

const splitNames = (payload) => {
  const emailLocal = (payload.email || "").split("@")[0] || "user";
  const full = payload.name || "";
  const given = payload.given_name || full.split(/\s+/)[0] || emailLocal;
  const family =
    payload.family_name || full.split(/\s+/).slice(1).join(" ") || "";
  return { firstName: given, lastName: family };
};

const uniqueUsername = async (base) => {
  let root = slug(base) || "user";
  let candidate = root;
  let i = 0;
  while (await User.exists({ username: candidate })) {
    i += 1;
    candidate = `${root}${i}`;
  }
  return candidate;
};

async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload(); // retorna o payload inteiro
}

async function findOrCreateUserFromGooglePayload(payload) {
  // tenta por email ou googleId
  let user = await User.findOne({
    $or: [{ email: payload.email }, { googleId: payload.sub }],
  });

  const { firstName, lastName } = splitNames(payload);

  if (!user) {
    const username = await uniqueUsername(firstName);
    user = new User({
      firstName,
      lastName,
      username,
      email: payload.email.toLowerCase(),
      googleId: payload.sub,
      isVerified: true,
      profileImage: payload.picture || "",
    });
  } else {
    // se já existe mas faltam campos obrigatórios (pós-migração)
    const patch = {};
    if (!user.firstName) patch.firstName = firstName;
    if (user.lastName == null) patch.lastName = lastName; // permite vazio
    if (!user.username) patch.username = await uniqueUsername(firstName);
    if (!user.googleId) patch.googleId = payload.sub;
    if (!user.profileImage && payload.picture)
      patch.profileImage = payload.picture;
    if (Object.keys(patch).length) user.set(patch);
  }

  await user.save();
  return user;
}

function createJwtForUser(userId, expiresIn) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn });
}

module.exports = {
  verifyGoogleToken,
  findOrCreateUserFromGooglePayload,
  createJwtForUser,
};
