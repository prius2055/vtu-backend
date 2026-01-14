const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const generateReferralCode = require("../utils/utils.js");

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role, // ✅ embed role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
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

      // 🔁 Referral (read-only)
      referralCode: user.referralCode,
      referralsCount: user.referralsCount,
      referralEarnings: user.referralEarnings,
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
        `⚠️ Referral code collision detected, retrying (${attempts})`
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

    let { email, password } = req.body;

    console.log("📩 Request body:", {
      email,
      passwordProvided: !!password,
    });

    // 1️⃣ Validate input
    if (!email || !password) {
      console.log("❌ Missing email or password");
      return res.status(400).json({
        status: "fail",
        message: "Please provide email and password",
      });
    }

    // Normalize email
    email = email.toLowerCase().trim();

    // Find user
    console.log("🔍 Searching for user with email:", email);
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      console.log("❌ No user found with this email");
      return res.status(401).json({
        status: "fail",
        message: "Incorrect email or password",
      });
    }

    console.log("📦 Raw user object:", user);

    console.log("✅ User found:", {
      id: user._id,
      email: user.email,
      role: user.role,
    });

    // 3️⃣ Compare password
    console.log("🔐 Comparing passwords...");
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      console.log("❌ Password mismatch");
      return res.status(401).json({
        status: "fail",
        message: "Incorrect email or password",
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
      "fullName email phone role username createdAt"
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
      user: {
        id: req.user.id,
        role: req.user.role,
        userDetail: req.user,
      },
    });
  } catch (error) {
    res.status(401).json({
      status: "fail",
      message: "Invalid token",
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  verify,
};
