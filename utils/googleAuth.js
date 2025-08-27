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

// services/authGoogle.js (exemplo)
async function findOrCreateUserFromGooglePayload(
  payload,
  { acceptTerms = false, requiredVersion = String(process.env.TERMS_VERSION || "1") } = {}
) {
  const email = (payload.email || "").toLowerCase();
  if (!email) throw new Error("Google payload sem e-mail verificado");

  // tenta achar por email OU googleId
  let user = await User.findOne({
    $or: [{ email }, { googleId: payload.sub }],
  });

  const { firstName, lastName } = splitNames(payload);
  let created = false;
  let changed = false;

  if (!user) {
    // criar username único
    const username = await uniqueUsername(firstName);

    user = new User({
      firstName,
      lastName,
      username,
      email,
      googleId: payload.sub,
      isVerified: true,              // email do Google é verificado
      profileImage: payload.picture || "",
      // hasAcceptedTerms: false por default
    });
    created = true;

    // se o front já confirmou termos antes de enviar a primeira requisição
    if (acceptTerms) {
      user.hasAcceptedTerms = true;
      user.termsVersion = requiredVersion;
      user.hasAcceptedTermsAt = new Date();
    }
  } else {
    // “patch” em campos que possam estar vazios (migrações, etc.)
    if (!user.firstName) { user.firstName = firstName; changed = true; }
    if (user.lastName == null) { user.lastName = lastName; changed = true; }
    if (!user.username) { user.username = await uniqueUsername(firstName); changed = true; }
    if (!user.googleId) { user.googleId = payload.sub; changed = true; }
    if (!user.profileImage && payload.picture) { user.profileImage = payload.picture; changed = true; }

    // se o cliente sinalizou aceite agora (primeiro login ou forçado por nova versão)
    const needsTerms = !user.hasAcceptedTerms || String(user.termsVersion) !== requiredVersion;
    if (acceptTerms && needsTerms) {
      user.hasAcceptedTerms = true;
      user.termsVersion = requiredVersion;
      user.hasAcceptedTermsAt = new Date();
      changed = true;
    }
  }

  if (created || changed) {
    await user.save();
  }

  return { user, created };
}


function createJwtForUser(userId, expiresIn = "7d") {
  const sv = Number(process.env.SESSIONS_VERSION || 1);
  return jwt.sign({ id: userId, sv }, process.env.JWT_SECRET, { expiresIn });
}


module.exports = {
  verifyGoogleToken,
  findOrCreateUserFromGooglePayload,
  createJwtForUser,
};
