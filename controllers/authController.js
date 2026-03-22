const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
// const sgMail = require("@sendgrid/mail");
const { Resend } = require("resend");

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
    let { fullName, username, email, phone, address, password, referrer } =
      req.body;

    username = username.toLowerCase().trim(); // ✅ before User.create()
    email = email.toLowerCase().trim();

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

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      marketerId: req.marketer?._id || null,
    }).select("+passwordResetToken +passwordResetExpires");

    // Always return success — don't reveal if email exists
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

    // Build reset URL — prefer www domain for frontend
    const frontendDomain =
      process.env.NODE_ENV === "development"
        ? req.marketer?.domains?.[0] // e.g. "prince.localhost"
        : req.marketer?.domains?.find((d) => d.startsWith("www."));

    const baseUrl =
      process.env.NODE_ENV === "development"
        ? `http://${frontendDomain}:3000` // ✅ http + port for dev
        : `https://${frontendDomain}`; // ✅ https for production

    const resetURL = `${baseUrl}/password/reset/${resetToken}`;
    console.log("🔗 Reset URL:", resetURL);

    // ✅ Send email via Resend — await it directly
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        // from:
        //   process.env.NODE_ENV === "development"
        //     ? "onboarding@resend.dev" // ✅ no domain verification needed
        //     : `Subadex <no-reply@subadex.com>`, // ✅ uses verified domain in production
        from: `Subadex <no-reply@subadex.com>`,
        to: user.email,
        subject: "Reset Your Password",
        html: passwordResetEmailTemplate(
          user.fullName,
          resetURL,
          req.marketer?.brandName,
        ),
      });

      console.log("✅ Reset email sent to:", user.email);
    } catch (emailError) {
      console.error("❌ Resend error:", emailError.message);

      // Clear token so user can retry
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        status: "error",
        message: "Failed to send reset email. Please try again later.",
      });
    }

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

    if (!token) {
      return res.status(400).json({
        status: "fail",
        message: "Reset token is missing.",
      });
    }

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
        message: "Invalid or expired reset token. Please request a new one.",
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

    // Send confirmation email via Resend (non-blocking)
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Subadex <no-reply@subadex.com>",
        to: user.email,
        subject: "Password Changed Successfully",
        html: passwordChangedEmailTemplate(user.fullName),
      });
      console.log("✅ Confirmation email sent");
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
 * EMAIL TEMPLATES — Subadex branded
 * ───────────────────────────────────────────────────────────── */
const passwordResetEmailTemplate = (
  fullName,
  resetURL,
  brandName = "Subadex",
) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { margin: 0; padding: 0; background: #f7f9f7; font-family: Arial, sans-serif; }
      .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
      .card { background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2ebe5; }
      .header { background: #1A3A2A; padding: 32px 24px; text-align: center; border-bottom: 3px solid #C9A84C; }
      .header h1 { color: #C9A84C; font-size: 22px; margin: 0 0 6px; }
      .header p { color: rgba(255,255,255,0.75); font-size: 14px; margin: 0; }
      .body { padding: 32px 28px; }
      .body p { color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
      .btn-wrap { text-align: center; margin: 28px 0; }
      .btn {
        display: inline-block;
        padding: 14px 36px;
        background: #1A3A2A;
        color: #C9A84C !important;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: 0.3px;
      }
      .url-box {
        background: #f7f9f7;
        border: 1px solid #e2ebe5;
        border-radius: 6px;
        padding: 12px;
        word-break: break-all;
        font-size: 12px;
        color: #6b8f78;
        margin: 0 0 16px;
      }
      .warning { color: #dc2626; font-weight: 700; font-size: 14px; }
      .footer { background: #f7f9f7; padding: 20px 28px; text-align: center; border-top: 1px solid #e2ebe5; }
      .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <h1>🔐 Password Reset</h1>
          <p>${brandName} — Secure Account Recovery</p>
        </div>
        <div class="body">
          <p>Hi <strong>${fullName || "there"}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <div class="btn-wrap">
            <a href="${resetURL}" class="btn">Reset My Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <div class="url-box">${resetURL}</div>
          <p class="warning">⚠️ This link expires in 10 minutes.</p>
          <p>If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
          <p>Thanks,<br><strong>The ${brandName} Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </div>
  </body>
</html>
`;

const passwordChangedEmailTemplate = (fullName, brandName = "Subadex") => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { margin: 0; padding: 0; background: #f7f9f7; font-family: Arial, sans-serif; }
      .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
      .card { background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2ebe5; }
      .header { background: #1A3A2A; padding: 28px 24px; text-align: center; border-bottom: 3px solid #C9A84C; }
      .header h1 { color: #C9A84C; font-size: 22px; margin: 0; }
      .body { padding: 32px 28px; }
      .body p { color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
      .alert { background: #eaf7ef; border: 1px solid #6ee7b7; border-radius: 8px; padding: 14px 16px; color: #1A3A2A; font-weight: 600; font-size: 14px; margin-bottom: 16px; }
      .footer { background: #f7f9f7; padding: 20px 28px; text-align: center; border-top: 1px solid #e2ebe5; }
      .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <h1>✅ Password Changed</h1>
        </div>
        <div class="body">
          <p>Hi <strong>${fullName || "there"}</strong>,</p>
          <div class="alert">Your password has been changed successfully.</div>
          <p>If you made this change, no further action is needed.</p>
          <p>If you did <strong>not</strong> make this change, please contact our support team immediately as your account may be compromised.</p>
          <p>Thanks,<br><strong>The ${brandName} Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
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
