// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

/* ================== Helpers de cookie/token ================== */
function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.cookies?.token || null;
}

function clearAuthCookie(res) {
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.FORCE_SECURE_COOKIE === "1";
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    path: "/",
  });
}

/** Cria JWT contendo:
 *  - id do user
 *  - sv (SESSION_VERSION global)
 *  - tv (tokenVersion do usuário para revogação por usuário)
 */
function createJwtForUser(userOrParams, expiresIn = "7d") {
  let id, tv;
  if (userOrParams && userOrParams._id) {
    id = String(userOrParams._id);
    tv = Number(userOrParams.tokenVersion || 0);
  } else if (userOrParams && userOrParams.id != null) {
    id = String(userOrParams.id);
    tv = Number(userOrParams.tv || 0);
  } else {
    throw new Error("createJwtForUser: passe o doc do usuário ou { id, tv }");
  }

  return jwt.sign(
    {
      id,
      sv: Number(process.env.SESSIONS_VERSION || 1),
      tv: Number(tv || 0),
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function setAuthCookies (res, token, { rememberMe = false } = {}) {
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.FORCE_SECURE_COOKIE === "1";
  const maxAge = (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000;

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: isProd ? "None" : "Lax",
    secure: isProd,
    path: "/",
    maxAge,
  });
}

/* ================== Middlewares ================== */
// Protege rotas privadas
const protect = async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Não autorizado." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 1) Checa versão global de sessão (sv)
    const currentSv = Number(process.env.SESSIONS_VERSION || 1);
    const tokenSv = Number(decoded.sv || 1);
    if (tokenSv !== currentSv) {
      clearAuthCookie(res);
      return res.status(401).json({
        code: "SESSION_VERSION_MISMATCH",
        error: "Sessão finalizada. Faça login novamente.",
      });
    }

    // 2) Carrega usuário
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      clearAuthCookie(res);
      return res
        .status(401)
        .json({ error: "Conta não encontrada. Faça login novamente." });
    }

    // 3) Checa revogação por usuário (tv)
    const tokenTv = Number(decoded.tv || 0);
    const userTv = Number(user.tokenVersion || 0);
    if (tokenTv !== userTv) {
      clearAuthCookie(res);
      return res.status(401).json({
        code: "TOKEN_VERSION_MISMATCH",
        error: "Sessão finalizada. Faça login novamente.",
      });
    }

    // 4) Ban: encerra imediatamente
    if (user.isBanned) {
      clearAuthCookie(res);
      return res.status(403).json({ code: "BANNED", error: "Conta banida." });
    }

    // 5) (Opcional) Exigir aceite de termos (inclui versão)
    const requiredTermsVersion = String(process.env.TERMS_VERSION || "1");
    const hasAccepted = !!user.hasAcceptedTerms;
    const userTermsVersion = user.termsVersion ? String(user.termsVersion) : null;
    if (!hasAccepted || userTermsVersion !== requiredTermsVersion) {
      return res
        .status(451)
        .json({ code: "TERMS_REQUIRED", message: "Aceite necessário" });
    }

    req.user = user;
    next();
  } catch (err) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Sessão expirada ou inválida." });
  }
};

// Verifica token (sem forçar termos, se preferir)
const verifyToken = async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Não autenticado." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // sv
    const currentSv = Number(process.env.SESSIONS_VERSION || 1);
    const tokenSv = Number(decoded.sv || 1);
    if (tokenSv !== currentSv) {
      clearAuthCookie(res);
      return res.status(401).json({
        code: "SESSION_VERSION_MISMATCH",
        error: "Sessão finalizada. Faça login novamente.",
      });
    }

    // carrega user
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ error: "Conta não encontrada." });
    }

    // tv
    const tokenTv = Number(decoded.tv || 0);
    const userTv = Number(user.tokenVersion || 0);
    if (tokenTv !== userTv) {
      clearAuthCookie(res);
      return res.status(401).json({
        code: "TOKEN_VERSION_MISMATCH",
        error: "Sessão finalizada. Faça login novamente.",
      });
    }

    // ban opcional aqui também
    if (user.isBanned) {
      clearAuthCookie(res);
      return res.status(403).json({ code: "BANNED", error: "Conta banida." });
    }

    req.user = user;
    next();
  } catch (err) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Token inválido." });
  }
};

const verifyLeader = (req, res, next) => {
  if (!req.user || (req.user.leader !== true && req.user.leader !== "true")) {
    return res
      .status(403)
      .json({ error: "Acesso negado. Apenas líderes podem realizar essa ação." });
  }
  next();
};

module.exports = {
  // helpers
  getTokenFromReq,
  clearAuthCookie,
  createJwtForUser,
  setAuthCookies,
  // middlewares
  protect,
  verifyToken,
  verifyLeader,
};
