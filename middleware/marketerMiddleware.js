const Marketer = require("../models/marketerModel");

/* ─────────────────────────────────────────────────────────────
 * 1. RESOLVE MARKETER — Identify marketer from incoming domain
 *
 * Runs on EVERY request (mounted globally in app.js).
 * Checks the request's host header against the domains[]
 * array in the Marketer collection.
 *
 * Priority order:
 *   1. X-Marketer-ID header  → mobile apps / direct API calls
 *   2. Host domain match     → web platforms on custom domains
 *
 * Result:
 *   req.marketer = Marketer document  (if matched)
 *   req.marketer = null               (if no match = platform direct)
 * ───────────────────────────────────────────────────────────── */
const resolveMarketer = async (req, res, next) => {
  try {
    const host = req.headers.host?.replace(/:\d+$/, "")?.toLowerCase()?.trim();

    console.log("🌐 resolveMarketer host:", host);

    const marketerIdHeader = req.headers["x-marketer-id"];
    let marketer = null;

    // Option A: X-Marketer-ID header (Postman / mobile apps)
    if (marketerIdHeader) {
      marketer = await Marketer.findById(marketerIdHeader);
    }

    // Option B: Match host against domains[] array
    if (!marketer && host) {
      marketer = await Marketer.findOne({
        domains: host,
        status: "active",
      });
    }

    // Block unregistered domains
    if (!marketer) {
      console.log("🚫 No marketer found for host:", host);
      return res.status(403).json({
        status: "fail",
        message: "No platform found for this domain.",
      });
    }

    // Block maintenance mode
    if (marketer.settings?.maintenanceMode) {
      return res.status(503).json({
        status: "fail",
        message:
          "This platform is currently under maintenance. Check back soon.",
      });
    }

    req.marketer = marketer;
    next();
  } catch (err) {
    console.error("🔥 resolveMarketer error:", err.message);
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
 * 2. REQUIRE MARKETER — Ensures a marketer was resolved
 *
 * Use on routes that MUST have a marketer context.
 * e.g. user registration must always be under a marketer.
 * ───────────────────────────────────────────────────────────── */
const requireMarketer = (req, res, next) => {
  if (!req.marketer) {
    return res.status(400).json({
      status: "fail",
      message: "No platform found for this domain.",
    });
  }
  next();
};

/* ─────────────────────────────────────────────────────────────
 * 3. SCOPE USER TO MARKETER — Prevent cross-marketer data access
 *
 * Use AFTER protect middleware.
 * Ensures the authenticated user belongs to the currently
 * resolved marketer. Blocks users from one platform
 * accessing another platform's API.
 * ───────────────────────────────────────────────────────────── */
const scopeUserToMarketer = (req, res, next) => {
  const userMarketerId = req.user?.marketerId?.toString();
  const resolvedMarketerId = req.marketer?._id?.toString();

  // Platform-direct users (both null) — allow
  if (!userMarketerId && !resolvedMarketerId) return next();

  if (userMarketerId !== resolvedMarketerId) {
    return res.status(403).json({
      status: "fail",
      message: "Access denied. You do not belong to this platform.",
    });
  }

  next();
};

/* ─────────────────────────────────────────────────────────────
 * 4. CHECK REGISTRATION OPEN — Respect marketer's settings
 *
 * Use on the registration route.
 * Blocks new signups if the marketer has disabled registration.
 * ───────────────────────────────────────────────────────────── */
const checkRegistrationOpen = (req, res, next) => {
  if (req.marketer && req.marketer.settings?.allowRegistration === false) {
    return res.status(403).json({
      status: "fail",
      message: "Registration is currently closed on this platform.",
    });
  }
  next();
};

module.exports = {
  resolveMarketer,
  requireMarketer,
  scopeUserToMarketer,
  checkRegistrationOpen,
};
