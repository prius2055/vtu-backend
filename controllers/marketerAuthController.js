/* ─────────────────────────────────────────────────────────────
 * Add these to your existing authController.js
 * ───────────────────────────────────────────────────────────── */

const Marketer = require("../models/marketerModel");
const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/* ─────────────────────────────────────────────────────────────
 * REGISTER MARKETER
 *
 * Called when someone applies to become an affiliate marketer.
 * Creates their account with status "pending" — they can't
 * use the platform until a superadmin approves them.
 *
 * POST /api/v1/auth/marketer/register
 * (No auth required — this is a public signup endpoint)
 * ───────────────────────────────────────────────────────────── */
const registerMarketer = async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      phone,
      address,
      password,
      brandName,
      domain,          // e.g. "fastreload.com"
    } = req.body;

    if (!fullName || !username || !email || !phone || !password || !brandName) {
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields: fullName, username, email, phone, password, brandName.",
      });
    }

    /* ── Check if domain already taken ── */
    if (domain) {
      const domainTaken = await Marketer.findOne({
        domains: domain.toLowerCase().trim(),
      });

      if (domainTaken) {
        return res.status(400).json({
          status: "fail",
          message: "That domain is already registered on this platform.",
        });
      }
    }

    /* ── Check if email already registered ── */
    // Marketer owners register on the MAIN platform (no marketerId)
    const existingUser = await User.findOne({ email, marketerId: null });
    if (existingUser) {
      return res.status(400).json({
        status: "fail",
        message: "An account with this email already exists.",
      });
    }

    /* ── Create owner user ── */
    const hashedPassword = await bcrypt.hash(password, 12);

    const owner = await User.create({
      fullName,
      username,
      email,
      phone,
      address,
      password: hashedPassword,
      role: "marketer",
      status: "active",
      marketerId: null,   // marketer owners live on the main platform
    });

    /* ── Create marketer platform (pending approval) ── */
    const marketer = await Marketer.create({
      name: brandName,
      brandName,
      marketerDetail: owner._id,
      domains: domain ? [domain.toLowerCase().trim()] : [],
      status: "pending",    // ← requires superadmin approval before going live
      pricing: {
        markupType: "flat",
        airtimeMarkup: 0,
        dataMarkup: 0,
        cableMarkup: 0,
        electricityMarkup: 0,
        epinMarkup: 0,
      },
      commission: {
        referralPercent: 1,
        resellerPercent: 2,
      },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
    });

    /* ── Update owner with real marketerId ── */
    await User.findByIdAndUpdate(owner._id, { marketerId: marketer._id });

    /* ── Create owner wallet ── */
    await Wallet.create({
      user: owner._id,
      marketerId: marketer._id,
      balance: 0,
      status: "active",
    });

    console.log(`✅ New marketer registered: ${brandName} (${marketer._id}) — PENDING APPROVAL`);

    res.status(201).json({
      status: "success",
      message:
        "Application submitted successfully. You will be notified once your account is approved.",
      data: {
        marketer: {
          id: marketer._id,
          brandName: marketer.brandName,
          status: marketer.status,
        },
      },
    });
  } catch (err) {
    console.error("🔥 registerMarketer error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};


/* ─────────────────────────────────────────────────────────────
 * MARKETER LOGIN
 *
 * Replace your existing marketer login in authController.js
 * with this function.
 *
 * A marketer owner's User record always has marketerId: null
 * (they registered on the main platform). But they should be
 * able to login from both:
 *   - app.yourplatform.com  (main platform)
 *   - www.fastreload.com    (their own branded domain)
 *
 * The trick: look them up by email with marketerId: null,
 * then verify the current domain belongs to their marketer.
 * ───────────────────────────────────────────────────────────── */

const marketerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Email and password are required.",
      });
    }

    /* ── Step 1: Find user on main platform (marketerId: null) ──
     *
     * Marketer owners always live on the main platform regardless
     * of which domain they're logging in from.
     * ── */
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      marketerId: null,
      role: "marketer",
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid email or password.",
      });
    }

    /* ── Step 2: Verify password ── */
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid email or password.",
      });
    }

    /* ── Step 3: Verify they own the current domain's marketer ──
     *
     * If logging in from fastreload.com, req.marketer is FastReload.
     * Confirm this user is actually FastReload's owner.
     *
     * If logging in from the main platform, req.marketer is null
     * (or the default marketer) — skip the ownership check.
     * ── */
    if (req.marketer && !req.marketer.isDefault) {
      const isOwner =
        req.marketer.marketerDetail.toString() === user._id.toString();

      if (!isOwner) {
        return res.status(403).json({
          status: "fail",
          message: "You are not the owner of this platform.",
        });
      }
    }

    /* ── Step 4: Fetch the marketer record they own ── */
    const marketer = await Marketer.findOne({ marketerDetail: user._id });

    if (!marketer) {
      return res.status(403).json({
        status: "fail",
        message: "No marketer platform found for this account.",
      });
    }

    if (marketer.status === "pending") {
      return res.status(403).json({
        status: "fail",
        message:
          "Your platform is pending approval. You will be notified once approved.",
      });
    }

    if (marketer.status === "suspended") {
      return res.status(403).json({
        status: "fail",
        message: "Your platform has been suspended. Contact support.",
      });
    }

    /* ── Step 5: Issue JWT ── */
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        marketerId: marketer._id,   // embed their marketer ID in token
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    // Remove password from response
    user.password = undefined;

    console.log(`✅ Marketer login: ${user.email} → ${marketer.brandName}`);

    res.status(200).json({
      status: "success",
      token,
      data: {
        user,
        marketer: {
          id: marketer._id,
          brandName: marketer.brandName,
          domains: marketer.domains,
          status: marketer.status,
          wallet: marketer.wallet,
          pricing: marketer.pricing,
          settings: marketer.settings,
        },
      },
    });
  } catch (err) {
    console.error("🔥 marketerLogin error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * APPROVE MARKETER (Superadmin only)
 *
 * Flips marketer status from "pending" → "active".
 * Optionally adds/confirms their custom domain at approval time.
 *
 * PATCH /api/v1/admin/marketers/:marketerId/approve
 * Protected: superadmin only
 * ───────────────────────────────────────────────────────────── */
const approveMarketer = async (req, res) => {
  try {
    const { marketerId } = req.params;
    const { domain } = req.body;

    const marketer = await Marketer.findById(marketerId);

    if (!marketer) {
      return res.status(404).json({
        status: "fail",
        message: "Marketer not found.",
      });
    }

    if (marketer.status === "active") {
      return res.status(400).json({
        status: "fail",
        message: "Marketer is already active.",
      });
    }

    /* ── Add/confirm domain at approval time ──
     * Domain is required before a marketer can go live.
     * Either provided during registration or confirmed here.
     * ── */
    if (domain) {
      const cleanDomain = domain.toLowerCase().trim();

      // Ensure no other marketer owns this domain
      const domainTaken = await Marketer.findOne({
        domains: cleanDomain,
        _id: { $ne: marketerId },
      });

      if (domainTaken) {
        return res.status(400).json({
          status: "fail",
          message: `Domain "${cleanDomain}" is already registered to another marketer.`,
        });
      }

      if (!marketer.domains.includes(cleanDomain)) {
        marketer.domains.push(cleanDomain);
      }
    }

    // Block approval if no domain is set at all
    if (!marketer.domains.length) {
      return res.status(400).json({
        status: "fail",
        message:
          "Cannot approve marketer without a domain. Provide a domain in the request body.",
      });
    }

    marketer.status = "active";
    await marketer.save();

    console.log(
      `✅ Marketer approved: ${marketer.brandName} — domains: ${marketer.domains.join(", ")}`
    );

    res.status(200).json({
      status: "success",
      message: `${marketer.brandName} approved and live on: ${marketer.domains.join(", ")}`,
      data: {
        marketer: {
          id: marketer._id,
          brandName: marketer.brandName,
          domains: marketer.domains,
          status: marketer.status,
        },
      },
    });
  } catch (err) {
    console.error("🔥 approveMarketer error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};



/* ─────────────────────────────────────────────────────────────
 * GET ALL MARKETERS (Superadmin only)
 *
 * List all marketers — filter by status for pending approvals.
 *
 * GET /api/v1/admin/marketers?status=pending
 * Protected: superadmin only
 * ───────────────────────────────────────────────────────────── */
const getAllMarketers = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const marketers = await Marketer.find(query)
      .populate("marketerDetail", "fullName email phone")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: "success",
      total: marketers.length,
      data: marketers,
    });
  } catch (err) {
    console.error("🔥 getAllMarketers error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * SUSPEND MARKETER (Superadmin only)
 *
 * PATCH /api/v1/admin/marketers/:marketerId/suspend
 * Protected: superadmin only
 * ───────────────────────────────────────────────────────────── */
const suspendMarketer = async (req, res) => {
  try {
    const { status } = req.body;  // "active" or "suspended"

    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({
        status: "fail",
        message: "Status must be 'active' or 'suspended'.",
      });
    }

    const marketer = await Marketer.findByIdAndUpdate(
      req.params.marketerId,
      { status },
      { new: true, select: "brandName status" }
    );

    if (!marketer) {
      return res.status(404).json({
        status: "fail",
        message: "Marketer not found.",
      });
    }

    res.status(200).json({
      status: "success",
      message: `${marketer.brandName} has been ${status}.`,
      data: { marketer },
    });
  } catch (err) {
    console.error("🔥 suspendMarketer error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

module.exports = {
  registerMarketer,
  marketerLogin,
  approveMarketer,
  getAllMarketers,
  suspendMarketer,
};