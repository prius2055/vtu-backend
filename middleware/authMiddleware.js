const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Marketer = require("../models/marketerModel");

/* ─────────────────────────────────────────────────────────────
 * 1. PROTECT — Authenticate regular users
 *
 * Changes from your original:
 *  - Added suspended account check (status === "suspended")
 *  - Added passwordChangedAfter check (invalidates tokens issued
 *    before a password reset — security best practice)
 * ───────────────────────────────────────────────────────────── */
const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in!",
      });
    }

    // 1️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2️⃣ Fetch full user (exclude sensitive fields)
    const currentUser = await User.findById(decoded.id).select(
      "-password -__v -passwordResetToken -passwordResetExpires",
    );

    if (!currentUser) {
      return res.status(401).json({
        status: "fail",
        message: "The user belonging to this token no longer exists.",
      });
    }

    // 3️⃣ Check if account is suspended
    if (currentUser.status === "suspended") {
      return res.status(403).json({
        status: "fail",
        message: "Your account has been suspended. Contact support.",
      });
    }

    // 4️⃣ Check if password was changed after this token was issued
    if (currentUser.passwordChangedAfter(decoded.iat)) {
      return res.status(401).json({
        status: "fail",
        message: "Your password was recently changed. Please log in again.",
      });
    }

    // 5️⃣ Attach full user document
    req.user = currentUser;

    console.log("✅ Authenticated user:", req.user.fullName);
    next();
  } catch (error) {
    console.error("🔥 Auth error:", error.message);
    return res.status(401).json({
      status: "fail",
      message: "Invalid or expired token",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 2. PROTECT MARKETER — Authenticate marketer accounts
 *
 * Marketers log in separately and get their own JWT.
 * Their token payload has role: "marketer".
 * ───────────────────────────────────────────────────────────── */
const protectMarketer = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in.",
      });
    }

    // 1️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2️⃣ Must be a marketer role
    if (decoded.role !== "marketer") {
      return res.status(403).json({
        status: "fail",
        message: "Access denied. Marketer account required.",
      });
    }

    // 3️⃣ Find the User (Prince's user account)
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        status: "fail",
        message: "User account no longer exists.",
      });
    }

    // 4️⃣ Find the Marketer document owned by this user
    const marketer = await Marketer.findOne({ marketerDetail: user._id });

    if (!marketer) {
      return res.status(401).json({
        status: "fail",
        message: "No marketer account found for this user.",
      });
    }

    // 5️⃣ Check marketer status
    if (marketer.status === "suspended") {
      return res.status(403).json({
        status: "fail",
        message: "Your marketer account has been suspended. Contact support.",
      });
    }

    if (marketer.status === "pending") {
      return res.status(403).json({
        status: "fail",
        message: "Your marketer account is pending approval.",
      });
    }

    // 6️⃣ Attach both to request
    req.user = user; // ✅ who is making the request
    req.marketer = marketer; // ✅ which marketer account they own

    console.log("✅ Authenticated marketer:", marketer.brandName);
    next();
  } catch (error) {
    console.error("🔥 protectMarketer error:", error.message);
    return res.status(401).json({
      status: "fail",
      message: "Invalid or expired token.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 3. RESTRICT TO — Role-based access control
 *
 * Usage: restrictTo("superadmin", "marketer")
 * Must be used AFTER protect or protectMarketer.
 * ───────────────────────────────────────────────────────────── */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.marketer?.role;

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        status: "fail",
        message: "You do not have permission to perform this action.",
      });
    }
    next();
  };
};

module.exports = { protect, protectMarketer, restrictTo };
