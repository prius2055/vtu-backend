const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");

const User = require("../models/userModel");
const Marketer = require("../models/marketerModel");
const Wallet = require("../models/walletModel");
const { generateReferralCode } = require("../utils/utils.js");

/* ─────────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────────── */

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      marketerId: user.marketerId, // ✅ embed marketer context in token
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },
  );
};

const createSendToken = async (user, statusCode, res) => {
  const token = signToken(user);

  // Populate marketer details for the response
  const populatedUser = await User.findById(user._id).populate({
    path: "marketerId",
    select: "name brandName logo domains wallet.balance status",
  });

  res.status(statusCode).json({
    status: "success",
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      phone: user.phone,
      role: user.role,
      status: user.status,
      marketerId: user.marketerId,
      marketer: populatedUser.marketerId || null,
      walletBalance: user.walletBalance,
      referralCode: user.referralCode,
      referralsCount: user.referralsCount,
      referralEarnings: user.referralEarnings,
      commissionEarnings: user.commissionEarnings,
      createdAt: user.createdAt,
    },
  });
};

/* ─────────────────────────────────────────────────────────────
 * REGISTER
 * ───────────────────────────────────────────────────────────── */
const register = async (req, res) => {
  console.log("\n================ REGISTER START ================");

  try {
    /* =============================
       1. MARKETER CHECK
       (replaces store check)
    ============================= */
    if (!req.marketer) {
      console.log("❌ Marketer resolution failed");
      return res.status(500).json({
        status: "fail",
        message: "No platform found for this domain.",
      });
    }

    console.log("🏪 Marketer resolved:", {
      id: req.marketer._id,
      name: req.marketer.name,
    });

    // checkRegistrationOpen middleware handles this, but double-check here
    if (!req.marketer.settings.allowRegistration) {
      console.log("⛔ Registration disabled for this platform");
      return res.status(403).json({
        status: "fail",
        message: "Registration is currently closed on this platform.",
      });
    }

    /* =============================
       2. INPUT VALIDATION
    ============================= */
    const { fullName, username, email, phone, address, password, referrer } =
      req.body;

    console.log("🧾 Validating fields...");

    if (!fullName || !email || !password || !username || !phone || !address) {
      return res.status(400).json({
        status: "fail",
        message:
          "fullName, email, username, phone, address and password are required.",
      });
    }

    /* =============================
       3. DUPLICATE CHECK
       ✅ Scoped to marketerId —
       same email/username/phone
       can exist on other platforms
    ============================= */
    console.log("🔍 Checking for existing user (scoped to marketer)...");

    const existingUser = await User.findOne({
      marketerId: req.marketer._id,
      $or: [{ email }, { username }, { phone }],
    });

    if (existingUser) {
      let field = "details";
      if (existingUser.email === email) field = "email";
      else if (existingUser.username === username) field = "username";
      else if (existingUser.phone === phone) field = "phone number";

      console.log(`⚠️ Duplicate ${field} found`);
      return res.status(400).json({
        status: "fail",
        message: `A user with this ${field} already exists on this platform.`,
      });
    }

    console.log("✅ No duplicate found");

    /* =============================
       4. PASSWORD HASH
    ============================= */
    console.log("🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 12);

    /* =============================
       5. REFERRAL CODE GENERATION
    ============================= */
    console.log("🎟 Generating unique referral code...");
    let referralCode;
    let attempts = 0;

    while (true) {
      referralCode = generateReferralCode();
      attempts++;
      const exists = await User.findOne({ referralCode });
      if (!exists) break;
      console.log(`⚠️ Referral code collision, retrying (${attempts})`);
    }

    console.log("✅ Referral code generated:", referralCode);

    /* =============================
       6. REFERRER LOOKUP
       ✅ Scoped to same marketer —
       can't refer across platforms
    ============================= */
    let referredBy = null;

    if (referrer) {
      console.log("🔗 Looking up referrer:", referrer);

      const referrerUser = await User.findOne({
        referralCode: referrer,
        marketerId: req.marketer._id, // ✅ scoped
      });

      if (!referrerUser) {
        console.log("❌ Invalid referral code");
        return res.status(400).json({
          status: "fail",
          message: "Invalid referral code.",
        });
      }

      referredBy = referrerUser._id;
      console.log("✅ Referrer found:", referredBy);

      await User.findByIdAndUpdate(referredBy, {
        $inc: { referralsCount: 1 },
      });

      console.log("📈 Referrer count incremented");
    }

    /* =============================
       7. CREATE USER
    ============================= */
    console.log("👤 Creating user...");

    const user = await User.create({
      fullName,
      username,
      email,
      phone,
      address,
      password: hashedPassword,
      referralCode,
      referredBy,
      role: "user",
      marketerId: req.marketer._id, // ✅ replaces store
    });

    console.log("✅ User created:", user._id);

    /* =============================
       8. UPDATE MARKETER STATS
       (replaces Store stats update)
    ============================= */
    console.log("📊 Updating marketer stats...");

    await Marketer.findByIdAndUpdate(req.marketer._id, {
      $inc: { "stats.totalUsers": 1 },
    });

    console.log("✅ Marketer stats updated");

    /* =============================
       9. CREATE WALLET
    ============================= */
    console.log("💰 Creating wallet...");

    const wallet = await Wallet.create({
      user: user._id,
      marketerId: req.marketer._id, // ✅ wallet also scoped to marketer
      balance: 0,
    });

    console.log("✅ Wallet created:", wallet._id);

    /* =============================
       10. SUCCESS
    ============================= */
    console.log("🎉 Registration successful");
    console.log("=============== REGISTER END ===============\n");

    createSendToken(user, 201, res);
  } catch (err) {
    console.error("\n🔥 REGISTER ERROR:", err.message);
    console.error("Stack:", err.stack);

    res.status(500).json({
      status: "error",
      message: "Registration failed. Please try again.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * LOGIN
 * ───────────────────────────────────────────────────────────── */
const login = async (req, res) => {
  console.log("\n================ LOGIN START ================");

  try {
    /* =============================
       1. MARKETER CHECK
    ============================= */
    if (!req.marketer) {
      console.log("❌ Marketer resolution failed");
      return res.status(500).json({
        status: "fail",
        message: "No platform found for this domain.",
      });
    }

    console.log("🏪 Marketer:", {
      id: req.marketer._id,
      name: req.marketer.name,
    });

    /* =============================
       2. INPUT
    ============================= */
    let { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Username and password are required.",
      });
    }

    username = username.toLowerCase().trim();

    /* =============================
       3. FIND USER
       ✅ Scoped to marketerId —
       same username on two platforms
       are treated as different users
    ============================= */
    const user = await User.findOne({
      username,
      marketerId: req.marketer._id, // ✅ replaces store
    }).select("+password");

    if (!user) {
      console.log("❌ User not found on this platform");
      return res.status(401).json({
        status: "fail",
        message: "Incorrect username or password.",
      });
    }

    console.log("✅ User found:", { id: user._id, role: user.role });

    /* =============================
       4. PASSWORD CHECK
    ============================= */
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      console.log("❌ Password mismatch");
      return res.status(401).json({
        status: "fail",
        message: "Incorrect username or password.",
      });
    }

    /* =============================
       5. ACCOUNT STATUS
    ============================= */
    if (user.status === "suspended") {
      return res.status(403).json({
        status: "fail",
        message: "Your account has been suspended. Contact support.",
      });
    }

    /* =============================
       6. SUCCESS
    ============================= */
    console.log("🎉 Login successful");
    console.log("=============== LOGIN END ===============\n");

    createSendToken(user, 200, res);
  } catch (err) {
    console.error("🔥 LOGIN ERROR:", err.message);

    res.status(500).json({
      status: "error",
      message: "Login failed. Please try again.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET ME
 * ───────────────────────────────────────────────────────────── */
const getMe = async (req, res) => {
  try {
    console.log("👤 getMe called by:", req.user._id);

    const user = await User.findById(req.user._id)
      .select("-password -__v -passwordResetToken -passwordResetExpires")
      .populate({
        path: "marketerId",
        select: "name brandName logo status",
      });

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found.",
      });
    }

    res.status(200).json({
      status: "success",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        username: user.username,
        address: user.address,
        role: user.role,
        status: user.status,
        walletBalance: user.walletBalance,
        marketerId: user.marketerId?._id,
        marketer: user.marketerId || null,
        referralCode: user.referralCode,
        referralsCount: user.referralsCount,
        referralEarnings: user.referralEarnings,
        commissionEarnings: user.commissionEarnings,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ getMe error:", error);

    res.status(500).json({
      status: "fail",
      message: error.message || "Failed to fetch user profile.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * VERIFY TOKEN
 * ───────────────────────────────────────────────────────────── */
const verify = async (req, res) => {
  try {
    res.status(200).json({
      status: "success",
      message: "Token is valid",
      user: req.user,
    });
  } catch (error) {
    res.status(401).json({
      status: "fail",
      message: "Invalid token",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * REQUEST PASSWORD RESET
 * ───────────────────────────────────────────────────────────── */
const requestPasswordReset = async (req, res) => {
  try {
    console.log("🔵 Password reset request received");

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide your email address.",
      });
    }

    // ✅ Scope lookup to marketer so users on different platforms
    // don't accidentally reset each other's passwords
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      marketerId: req.marketer?._id || null,
    }).select("+passwordResetToken +passwordResetExpires");

    // Always return success (don't reveal if email exists)
    if (!user) {
      console.log("⚠️ User not found — sending generic success response");
      return res.status(200).json({
        status: "success",
        message: "If your email is registered, you will receive a reset link.",
      });
    }

    console.log("✅ User found:", user._id);

    // Generate and hash reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    console.log("💾 Reset token saved");

    // Build reset URL using marketer's domain if available
    const baseUrl = req.marketer?.domains?.[0]
      ? `https://${req.marketer.domains[0]}`
      : process.env.FRONTEND_URL;

    const resetURL = `${baseUrl}/reset-password/${resetToken}`;

    console.log("🔗 Reset URL:", resetURL);

    // Send via SendGrid
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      await sgMail.send({
        to: user.email,
        from: process.env.SENDGRID_FROM_EMAIL || "info@vtvend.com",
        subject: "Password Reset Request",
        html: passwordResetEmailTemplate(user.fullName, resetURL),
      });

      console.log("✅ Reset email sent to:", user.email);
    } catch (emailError) {
      console.error("❌ SendGrid error:", emailError.message);

      // Clear token if email fails so user can retry
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        status: "error",
        message: "Failed to send reset email. Please try again later.",
      });
    }

    // ✅ This was missing in your original — response was never sent after sgMail
    res.status(200).json({
      status: "success",
      message: "Password reset link sent to your email.",
    });
  } catch (error) {
    console.error("🔥 requestPasswordReset error:", error.message);

    res.status(500).json({
      status: "error",
      message: "Something went wrong. Please try again.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * RESET PASSWORD
 * ───────────────────────────────────────────────────────────── */
const resetPassword = async (req, res) => {
  try {
    console.log("🔵 Password reset attempt");

    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide password and confirm password.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: "fail",
        message: "Passwords do not match.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: "fail",
        message: "Password must be at least 8 characters.",
      });
    }

    // Hash incoming token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid or expired reset token.",
      });
    }

    console.log("✅ Valid token for user:", user._id);

    // Update password
    user.password = await bcrypt.hash(password, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = Date.now();
    await user.save();

    console.log("✅ Password updated");

    // Send confirmation email (non-blocking)
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: user.email,
        from: process.env.SENDGRID_FROM_EMAIL || "info@vtvend.com",
        subject: "Password Changed Successfully",
        html: passwordChangedEmailTemplate(user.fullName),
      });
    } catch (emailError) {
      console.warn("⚠️ Failed to send confirmation email:", emailError.message);
      // Don't fail the request if confirmation email fails
    }

    // Log user in with new token
    createSendToken(user, 200, res);
  } catch (error) {
    console.error("🔥 resetPassword error:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to reset password. Please try again.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * EMAIL TEMPLATES
 * Consolidated — all email goes through SendGrid
 * ───────────────────────────────────────────────────────────── */
const passwordResetEmailTemplate = (fullName, resetURL) => `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9fafb; padding: 30px; }
        .button {
          display: inline-block;
          padding: 12px 30px;
          background-color: #2563eb;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
        }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        .warning { color: #dc2626; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Password Reset Request</h1></div>
        <div class="content">
          <p>Hi ${fullName || "there"},</p>
          <p>You requested to reset your password. Click the button below:</p>
          <div style="text-align: center;">
            <a href="${resetURL}" class="button">Reset Password</a>
          </div>
          <p>Or copy this link into your browser:</p>
          <p style="background-color: #e5e7eb; padding: 10px; word-break: break-all;">${resetURL}</p>
          <p class="warning">⚠️ This link expires in 10 minutes.</p>
          <p>If you didn't request this, ignore this email.</p>
          <p>Thanks,<br>The ${process.env.APP_NAME || "VTU"} Team</p>
        </div>
        <div class="footer"><p>This is an automated email. Please do not reply.</p></div>
      </div>
    </body>
  </html>
`;

const passwordChangedEmailTemplate = (fullName) => `
  <!DOCTYPE html>
  <html>
    <body>
      <div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;">
        <div style="background-color:#10b981;color:white;padding:20px;text-align:center;">
          <h1>Password Changed ✓</h1>
        </div>
        <div style="background-color:#f9fafb;padding:30px;">
          <p>Hi ${fullName || "there"},</p>
          <p>Your password has been changed successfully.</p>
          <p>If you didn't make this change, contact our support team immediately.</p>
          <p>Thanks,<br>The ${process.env.APP_NAME || "VTU"} Team</p>
        </div>
      </div>
    </body>
  </html>
`;

module.exports = {
  register,
  login,
  getMe,
  verify,
  requestPasswordReset,
  resetPassword,
};
