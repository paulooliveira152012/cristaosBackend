// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.cookies?.token || null;
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    path: "/", // importante para realmente limpar
  });
}

// Protege rotas privadas
const protect = async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Não autorizado." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 1) Checa versão da sessão
    const currentSv = Number(process.env.SESSIONS_VERSION || 1);
    const tokenSv = Number(decoded.sv || 1); // tokens antigos sem sv contam como 1
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

    // 3) (Opcional) Exigir aceite de termos aqui também
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

// Verifica token simples (use mesma checagem de sv para consistência)
const verifyToken = async (req, res, next) => {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Não autenticado." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // checa sv aqui também
    const currentSv = Number(process.env.SESSIONS_VERSION || 1);
    const tokenSv = Number(decoded.sv || 1);
    if (tokenSv !== currentSv) {
      clearAuthCookie(res);
      return res.status(401).json({
        code: "SESSION_VERSION_MISMATCH",
        error: "Sessão finalizada. Faça login novamente.",
      });
    }

    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(401).json({ error: "Conta não encontrada." });
    next();
  } catch (err) {
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

module.exports = { protect, verifyToken, verifyLeader };
