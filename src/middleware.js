const rateLimit = require("express-rate-limit");
const config = require("./config");

const authMiddleware = (req, res, next) => {
    const header = req.get("authorization") || req.get("x-api-token") || "";
    let token = "";
    if (header.toLowerCase().startsWith("bearer "))
        token = header.slice(7).trim();
    else token = header.trim();
    // In dev test mode, allow bypassing auth so frontend dev can call endpoints
    if (config.devTestMode) return next();

    if (!config.authToken || !token || token !== config.authToken) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: config.rateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { authMiddleware, limiter };
