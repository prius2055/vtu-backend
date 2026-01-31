const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const generateReferralCode = require("../utils/utils.js");
const sgMail = require("@sendgrid/mail");

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role, // ✅ embed role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },
  );
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user);

  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      role: user.role,

      // 🔁 Referral and commission(read-only)
      referralCode: user.referralCode,
      referralsCount: user.referralsCount,
      referralEarnings: user.referralEarnings,
      commissionEarnings: user.commissionEarnings,
      createdAt: user.createdAt,
    },
  });
};

const register = async (req, res) => {
  try {
    console.log("🔵 REGISTER REQUEST RECEIVED");
    console.log("📥 Raw Request Body:", req.body);

    const {
      fullName,
      username,
      email,
      phone,
      address,
      password,
      referrer, // referralCode
    } = req.body;

    console.log("🧾 Parsed Fields:", {
      fullName,
      username,
      email,
      phone,
      address,
      referrer,
      passwordProvided: !!password,
    });

    // 1️⃣ Validate required fields
    if (!email || !password || !username) {
      console.log("❌ Validation failed: missing required fields");
      return res.status(400).json({
        status: "fail",
        message: "Email, username and password are required",
      });
    }

    // 2️⃣ Check if user exists
    console.log("🔍 Checking existing user for email:", email);
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("⚠️ User already exists:", existingUser._id);
      return res.status(400).json({
        status: "fail",
        message: "User already exists",
      });
    }

    console.log("✅ No existing user found");

    // 3️⃣ Hash password
    console.log("🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 12);
    console.log("✅ Password hashed");

    // 4️⃣ Generate unique referral code
    console.log("🔁 Generating referral code...");
    let referralCode;
    let attempts = 0;

    while (true) {
      referralCode = generateReferralCode();
      attempts++;

      const exists = await User.findOne({ referralCode });
      if (!exists) break;

      console.log(
        `⚠️ Referral code collision detected, retrying (${attempts})`,
      );
    }

    console.log("🎟️ Referral code generated:", referralCode);

    // 5️⃣ Handle referrer
    let referredBy = null;

    if (referrer) {
      console.log("🔗 Referral code supplied:", referrer);
      const referrerUser = await User.findOne({ referralCode: referrer });

      if (!referrerUser) {
        console.log("❌ Invalid referral code:", referrer);
        return res.status(400).json({
          status: "fail",
          message: "Invalid referral code",
        });
      }

      referredBy = referrerUser._id;
      console.log("✅ Referrer found:", {
        id: referrerUser._id,
        username: referrerUser.username,
      });
    } else {
      console.log("ℹ️ No referral code provided");
    }

    // 6️⃣ Create user
    console.log("🧑 Creating new user...");
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
    });

    console.log("✅ User created:", {
      id: user._id,
      email: user.email,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
    });

    // 7️⃣ Increment referrer count
    if (referredBy) {
      console.log("📈 Incrementing referrer count for:", referredBy);
      await User.findByIdAndUpdate(referredBy, {
        $inc: { referralsCount: 1 },
      });
      console.log("✅ Referrer count updated");
    }

    // 8️⃣ Create wallet
    console.log("💰 Creating wallet for user:", user._id);
    const wallet = await Wallet.create({
      user: user._id,
      balance: 0,
    });
    console.log("✅ Wallet created:", wallet._id);

    // 9️⃣ Send auth token
    console.log("🔑 Sending auth token");
    createSendToken(user, 201, res);
  } catch (error) {
    console.error("🔥 REGISTER ERROR OCCURRED");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);

    res.status(500).json({
      status: "error",
      message: "Registration failed",
    });
  }
};

const login = async (req, res) => {
  try {
    console.log("🔐 Login attempt received");

    let { username, password } = req.body;

    console.log("📩 Request body:", {
      username,
      passwordProvided: !!password,
    });

    // 1️⃣ Validate input
    if (!username || !password) {
      console.log("❌ Missing username or password");
      return res.status(400).json({
        status: "fail",
        message: "Please provide username and password",
      });
    }

    // Normalize username
    username = username.toLowerCase().trim();

    // Find user
    console.log("🔍 Searching for user with username:", username);
    const user = await User.findOne({ username }).select("+password");

    if (!user) {
      console.log("❌ No user found with this username");
      return res.status(401).json({
        status: "fail",
        message: "Incorrect username or password",
      });
    }

    console.log("📦 Raw user object:", user);

    console.log("✅ User found:", {
      id: user._id,
      username: user.username,
      role: user.role,
    });

    // 3️⃣ Compare password
    console.log("🔐 Comparing passwords...");
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      console.log("❌ Password mismatch");
      return res.status(401).json({
        status: "fail",
        message: "Incorrect username or password",
      });
    }

    console.log("✅ Password match successful");

    // 4️⃣ Send token
    console.log("🎟️ Generating JWT and sending response");
    createSendToken(user, 200, res);
  } catch (error) {
    console.error("🔥 Login error:", error);

    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error.message, // helpful for frontend debugging
    });
  }
};

const getMe = async (req, res) => {
  try {
    console.log("👤 getMe called by:", req.user);

    const user = await User.findById(req.user.id).select(
      "fullName email phone role username createdAt",
    );

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    res.status(200).json({
      status: "success",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role, // ✅ explicit
        userMame: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ getMe error:", error);

    res.status(500).json({
      status: "fail",
      message: error.message || "Failed to fetch user profile",
    });
  }
};

// Verify token endpoint
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

/* ----------------------------------
 * REQUEST PASSWORD RESET
 * --------------------------------- */
const requestPasswordReset = async (req, res) => {
  try {
    console.log("🔵 Password reset request received");

    const { email } = req.body;

    console.log("📧 Email provided:", email);

    // 1️⃣ Validate email
    if (!email) {
      console.log("❌ No email provided");
      return res.status(400).json({
        status: "fail",
        message: "Please provide your email address",
      });
    }

    // 2️⃣ Find user
    console.log("🔍 Looking for user with email:", email);
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always send success response (security best practice - don't reveal if email exists)
    if (!user) {
      console.log("⚠️ User not found, but sending success response");
      return res.status(200).json({
        status: "success",
        message:
          "If your email is registered, you will receive a password reset link",
      });
    }

    console.log("✅ User found:", user._id);

    // 3️⃣ Generate reset token
    console.log("🔑 Generating reset token...");
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token before storing (security best practice)
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    console.log("✅ Reset token generated");

    // 4️⃣ Save hashed token and expiry to user
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    console.log("💾 Reset token saved to user");

    // 5️⃣ Create reset URL
    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    console.log("🔗 Reset URL created");

    // 6️⃣ Send email
    // try {
    //   console.log("📨 Sending reset email...");
    //   await sendPasswordResetEmail(user.email, user.fullName, resetURL);
    //   console.log("✅ Email sent successfully");

    //   res.status(200).json({
    //     status: "success",
    //     message: "Password reset link sent to your email",
    //   });
    // } catch (emailError) {
    //   console.error("❌ Email sending failed:", emailError);

    //   // Clear reset token if email fails
    //   user.passwordResetToken = undefined;
    //   user.passwordResetExpires = undefined;
    //   await user.save({ validateBeforeSave: false });

    //   return res.status(500).json({
    //     status: "error",
    //     message: "Failed to send reset email. Please try again later.",
    //   });
    // }

    // ////////////////////////////////////////

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // sgMail.setDataResidency('eu');
    // uncomment the above line if you are sending mail using a regional EU subuser

    const msg = {
      to: `${user.email}`, // Change to your recipient
      from: "info@vtvend.com", // Change to your verified sender
      subject: "Email reset url",
      text: "and easy to do anywhere, even with Node.js",
      html: `<strong>${resetURL}</strong>`,
    };
    sgMail
      .send(msg)
      .then(() => {
        console.log("Email sent");
      })
      .catch((error) => {
        console.error(error);
      });

    ////////////////////////////////////////////////
  } catch (error) {
    console.error("🔥 requestPasswordReset error:", error);

    res.status(500).json({
      status: "error",
      message: "Something went wrong. Please try again.",
    });
  }
};

/* ----------------------------------
 * RESET PASSWORD
 * --------------------------------- */
const resetPassword = async (req, res) => {
  try {
    console.log("🔵 Password reset attempt");

    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    console.log("🔑 Token received:", token ? "Yes" : "No");
    console.log("🔐 Password provided:", !!password);

    // 1️⃣ Validate input
    if (!password || !confirmPassword) {
      console.log("❌ Missing password fields");
      return res.status(400).json({
        status: "fail",
        message: "Please provide password and confirm password",
      });
    }

    if (password !== confirmPassword) {
      console.log("❌ Passwords don't match");
      return res.status(400).json({
        status: "fail",
        message: "Passwords do not match",
      });
    }

    if (password.length < 8) {
      console.log("❌ Password too short");
      return res.status(400).json({
        status: "fail",
        message: "Password must be at least 8 characters long",
      });
    }

    // 2️⃣ Hash the token from URL
    console.log("🔍 Hashing token for lookup...");
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // 3️⃣ Find user with valid token
    console.log("🔍 Finding user with token...");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }, // Token not expired
    });

    if (!user) {
      console.log("❌ Invalid or expired token");
      return res.status(400).json({
        status: "fail",
        message: "Invalid or expired reset token",
      });
    }

    console.log("✅ Valid token found for user:", user._id);

    // 4️⃣ Hash new password
    console.log("🔐 Hashing new password...");
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5️⃣ Update password and clear reset token
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = Date.now();
    await user.save();

    console.log("✅ Password updated successfully");

    // 6️⃣ Send confirmation email (optional)
    try {
      await sendPasswordChangedEmail(user.email, user.fullName);
    } catch (emailError) {
      console.warn("⚠️ Failed to send confirmation email:", emailError);
      // Don't fail the request if email fails
    }

    // 7️⃣ Log user in with new password
    console.log("🎟️ Generating JWT and logging user in");
    createSendToken(user, 200, res);
  } catch (error) {
    console.error("🔥 resetPassword error:", error);

    res.status(500).json({
      status: "error",
      message: "Failed to reset password. Please try again.",
    });
  }
};

/* ----------------------------------
 * EMAIL SENDING FUNCTIONS
 * --------------------------------- */
const sendPasswordResetEmail = async (email, fullName, resetURL) => {
  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, // e.g., smtp.gmail.com
    port: process.env.EMAIL_PORT, // 587 for TLS
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Email content
  const mailOptions = {
    from: `"${process.env.APP_NAME || "VTU App"}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset Request",
    html: `
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
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi ${fullName || "there"},</p>
              
              <p>You recently requested to reset your password. Click the button below to reset it:</p>
              
              <div style="text-align: center;">
                <a href="${resetURL}" class="button">Reset Password</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="background-color: #e5e7eb; padding: 10px; word-break: break-all;">
                ${resetURL}
              </p>
              
              <p class="warning">⚠️ This link will expire in 10 minutes.</p>
              
              <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
              
              <p>Thanks,<br>The ${process.env.APP_NAME || "VTU"} Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  // Send email
  await transporter.sendMail(mailOptions);
};

const sendPasswordChangedEmail = async (email, fullName) => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"${process.env.APP_NAME || "VTU App"}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Changed Successfully",
    html: `
      <!DOCTYPE html>
      <html>
        <body>
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="background-color: #10b981; color: white; padding: 20px; text-align: center;">
              <h1>Password Changed ✓</h1>
            </div>
            <div style="background-color: #f9fafb; padding: 30px;">
              <p>Hi ${fullName || "there"},</p>
              
              <p>Your password has been changed successfully.</p>
              
              <p>If you didn't make this change, please contact our support team immediately.</p>
              
              <p>Thanks,<br>The ${process.env.APP_NAME || "VTU"} Team</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

// Export the new functions
module.exports = {
  register,
  login,
  getMe,
  verify,
  requestPasswordReset,
  resetPassword,
};
