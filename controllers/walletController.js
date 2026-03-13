// const mongoose = require("mongoose");
// const Wallet = require("../models/walletModel");
// const Transaction = require("../models/transactionModel");
// const User = require("../models/userModel");

// // const url = "https://geotechtest.vercel.app/funding/verify"

// const url = "http://localhost:3000/funding/verify";

// const getWallet = async (req, res) => {
//   try {
//     console.log("🟢 [GET WALLET] Request received");

//     console.log("👤 Authenticated user:", {
//       id: req.user?._id,
//       email: req.user?.email,
//     });

//     let wallet = await Wallet.findOne({ user: req.user._id });

//     console.log("💼 Wallet lookup result:", wallet ? "FOUND" : "NOT FOUND");

//     if (!wallet) {
//       console.log("➕ No wallet found, creating new wallet...");

//       wallet = await Wallet.create({
//         user: req.user._id,
//         balance: 0,
//       });

//       console.log("✅ New wallet created:", {
//         walletId: wallet._id,
//         balance: wallet.balance,
//       });
//     } else {
//       console.log("💰 Existing wallet balance:", wallet.balance);
//     }

//     console.log("📤 Sending wallet response to client");

//     res.status(200).json({
//       status: "success",
//       data: { wallet },
//     });
//   } catch (error) {
//     console.error("🔴 [GET WALLET ERROR]", {
//       message: error.message,
//       stack: error.stack,
//       userId: req.user?._id,
//     });

//     res.status(400).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

// const initializeWalletFunding = async (req, res) => {
//   console.log("=== Initialize Wallet Funding START ===");

//   const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
//   console.log("PAYSTACK_SECRET exists:", !!PAYSTACK_SECRET);

//   try {
//     console.log("Request body:", req.body);
//     console.log("Authenticated user:", req.user);

//     const { amount } = req.body;

//     if (!amount || amount <= 0) {
//       console.log("Invalid amount received:", amount);
//       return res.status(400).json({
//         status: "fail",
//         message: "Invalid amount",
//       });
//     }

//     const paymentData = {
//       email: req.user.email,
//       amount: amount * 100,
//       currency: "NGN",
//       callback_url: url,
//       metadata: {
//         userId: req.user._id.toString(),
//       },
//     };

//     console.log("Payment data to Paystack:", paymentData);

//     const response = await fetch(
//       "https://api.paystack.co/transaction/initialize",
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${PAYSTACK_SECRET}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(paymentData),
//       },
//     );

//     console.log("Paystack response status:", response.status);
//     console.log("Paystack response ok:", response.ok);

//     const data = await response.json();
//     console.log("Paystack response data:", data);

//     if (!response.ok) {
//       console.error("Paystack returned error:", data);
//       return res.status(response.status).json({
//         status: "fail",
//         message: data.message || "Paystack initialization failed",
//       });
//     }

//     console.log("Authorization URL:", data?.data?.authorization_url);

//     return res.status(200).json({
//       status: "success",
//       authorization_url: data.data.authorization_url,
//     });
//   } catch (error) {
//     console.error("=== Initialize Wallet Funding ERROR ===");
//     console.error("Error message:", error.message);
//     console.error("Error stack:", error.stack);

//     return res.status(500).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

// const verifyWalletFunding = async (req, res) => {
//   console.log("\n==============================");
//   console.log("🔍 VERIFY WALLET FUNDING STARTED");
//   console.log("==============================");

//   try {
//     const { reference } = req.query;
//     console.log("📌 Reference received:", reference);

//     if (!reference) {
//       console.log("❌ Missing payment reference");
//       return res.status(400).json({
//         status: "fail",
//         message: "Payment reference missing",
//       });
//     }

//     console.log("🔑 Verifying payment with Paystack...");

//     const response = await fetch(
//       `https://api.paystack.co/transaction/verify/${reference}`,
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//         },
//       },
//     );

//     const result = await response.json();
//     console.log("📦 Paystack raw response:", result);

//     const payment = result.data;

//     if (!payment || payment.status !== "success") {
//       console.log("❌ Payment verification failed:", payment?.status);
//       return res.status(400).json({
//         status: "fail",
//         message: "Payment not successful",
//       });
//     }

//     // ✅ NORMALIZE USER ID (CRITICAL)
//     const userId = new mongoose.Types.ObjectId(payment.metadata.userId);
//     const amount = payment.amount / 100;

//     console.log("✅ Payment verified");
//     console.log("👤 User ID:", userId.toString());
//     console.log("💵 Amount:", amount);

//     // 🔐 CREATE TRANSACTION (ANTI-DUPLICATE HARD STOP)
//     let transaction;
//     try {
//       transaction = await Transaction.create({
//         user: userId,
//         type: "wallet_funding",
//         amount,
//         reference: `REF-FUNDING-${reference}`,
//         description: `Wallet funding of ${amount}`,
//         status: "success",
//       });
//       console.log("🧾 Transaction created:", transaction._id);
//     } catch (err) {
//       if (err.code === 11000) {
//         console.log("⚠️ Duplicate transaction detected — exiting safely");
//         return res.json({
//           status: "success",
//           message: "Transaction already processed",
//         });
//       }
//       throw err;
//     }

//     // 🔍 FETCH USER (BEFORE WALLET UPDATE)
//     const user = await User.findById(userId);
//     console.log("👤 User before update:", {
//       id: user?._id,
//       hasFunded: user?.hasFunded,
//     });

//     // ✅ MARK USER AS FUNDED IMMEDIATELY
//     if (!user.hasFunded) {
//       await User.findByIdAndUpdate(userId, { hasFunded: true });
//       console.log("✅ User marked as funded");
//     }

//     // 💰 UPDATE WALLET (ATOMIC)
//     const wallet = await Wallet.findOneAndUpdate(
//       { user: userId },
//       {
//         $inc: {
//           balance: amount,
//           totalFunded: amount,
//         },
//       },
//       { new: true, upsert: true },
//     );

//     console.log("💰 Wallet after credit:", wallet);

//     console.log("🏁 VERIFY WALLET FUNDING COMPLETED SUCCESSFULLY");
//     console.log("==============================\n");

//     return res.status(200).json({
//       status: "success",
//       data: {
//         wallet,
//         transaction,
//       },
//     });
//   } catch (error) {
//     console.error("🔥 VERIFY FUNDING ERROR:", error);
//     res.status(500).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

// /* ----------------------------------
//  * UPGRADE TO RESELLER
//  * --------------------------------- */
// const upgradeToReseller = async (req, res) => {
//   console.log(
//     "\n================ 🔼 UPGRADE TO RESELLER START =================",
//   );

//   try {
//     const userId = req.user?._id || req.user?.id;
//     const UPGRADE_FEE = 1000;
//     const REFERRAL_BONUS = UPGRADE_FEE * 0.5; // ₦500

//     console.log("👤 User ID:", userId);
//     console.log("💰 Upgrade Fee:", UPGRADE_FEE);
//     console.log("🎁 Referral Bonus:", REFERRAL_BONUS);

//     /* --------------------------------------------------
//      * 1️⃣ Validate authentication
//      * -------------------------------------------------- */
//     if (!userId) {
//       console.log("❌ AUTH ERROR: No userId found in request");
//       return res.status(401).json({
//         status: "fail",
//         message: "Authentication required",
//       });
//     }

//     /* --------------------------------------------------
//      * 2️⃣ Fetch user BEFORE update
//      * -------------------------------------------------- */
//     console.log("🔍 Fetching user from DB...");
//     const user = await User.findById(userId).populate("referredBy");

//     if (!user) {
//       console.log("❌ USER NOT FOUND:", userId);
//       return res.status(404).json({
//         status: "fail",
//         message: "User not found",
//       });
//     }

//     const wasResellerBefore = user.role === "reseller";
//     const hasReferrer = !!user.referredBy;

//     console.log("👤 User snapshot:", {
//       id: user._id,
//       roleBefore: user.role,
//       wasResellerBefore,
//       hasReferrer,
//       referrerId: user.referredBy?._id || null,
//     });

//     /* --------------------------------------------------
//      * 3️⃣ Prevent duplicate upgrade
//      * -------------------------------------------------- */
//     if (wasResellerBefore || user.role === "admin") {
//       console.log("⚠️ UPGRADE BLOCKED: User already reseller/admin");
//       return res.status(400).json({
//         status: "fail",
//         message: "You are already a reseller",
//       });
//     }

//     /* --------------------------------------------------
//      * 4️⃣ Fetch wallet
//      * -------------------------------------------------- */
//     console.log("💼 Fetching user wallet...");
//     const wallet = await Wallet.findOne({ user: userId });

//     if (!wallet) {
//       console.log("❌ WALLET NOT FOUND for user:", userId);
//       return res.status(404).json({
//         status: "fail",
//         message: "Wallet not found",
//       });
//     }

//     console.log("💳 Wallet before upgrade:", {
//       balance: wallet.balance,
//       totalSpent: wallet.totalSpent,
//     });

//     /* --------------------------------------------------
//      * 5️⃣ Check balance
//      * -------------------------------------------------- */
//     if (wallet.balance < UPGRADE_FEE) {
//       console.log("❌ INSUFFICIENT BALANCE", {
//         required: UPGRADE_FEE,
//         available: wallet.balance,
//       });

//       return res.status(400).json({
//         status: "fail",
//         message: "Insufficient wallet balance",
//         required: UPGRADE_FEE,
//         available: wallet.balance,
//       });
//     }

//     /* --------------------------------------------------
//      * 6️⃣ Create transaction (upgrade)
//      * -------------------------------------------------- */
//     const reference = `UPGRADE_${Date.now()}_${userId.toString().slice(-6)}`;
//     console.log("🧾 Creating upgrade transaction:", reference);

//     const transaction = await Transaction.create({
//       user: userId,
//       type: "upgrade to reseller",
//       amount: UPGRADE_FEE,
//       reference,
//       status: "success",
//       description: "Account upgraded to reseller",
//     });

//     console.log("✅ Upgrade transaction created:", transaction._id);

//     /* --------------------------------------------------
//      * 7️⃣ Deduct wallet balance
//      * -------------------------------------------------- */
//     console.log("💸 Deducting upgrade fee from wallet...");

//     const updatedWallet = await Wallet.findOneAndUpdate(
//       { user: userId },
//       {
//         $inc: {
//           balance: -UPGRADE_FEE,
//           totalSpent: UPGRADE_FEE,
//         },
//       },
//       { new: true },
//     );

//     console.log("💰 Wallet after deduction:", {
//       balance: updatedWallet.balance,
//       totalSpent: updatedWallet.totalSpent,
//     });

//     /* --------------------------------------------------
//      * 8️⃣ Upgrade user role
//      * -------------------------------------------------- */
//     console.log("🔄 Updating user role to RESELLER...");
//     user.role = "reseller";
//     user.upgradedToResellerAt = new Date();
//     await user.save();

//     console.log("✅ User role updated:", {
//       newRole: user.role,
//       upgradedAt: user.upgradedToResellerAt,
//     });

//     /* --------------------------------------------------
//      * 9️⃣ Referral bonus logic
//      * -------------------------------------------------- */
//     if (!wasResellerBefore && hasReferrer) {
//       console.log("🎉 Referral bonus conditions MET");
//       console.log("👥 Referrer ID:", user.referredBy._id);

//       console.log("💰 Crediting referrer wallet...");
//       const referrerWallet = await Wallet.findOneAndUpdate(
//         { user: user.referredBy._id },
//         {
//           $inc: {
//             balance: REFERRAL_BONUS,
//             referralBonusBalance: REFERRAL_BONUS,
//           },
//         },
//         { new: true },
//       );

//       console.log("💳 Referrer wallet updated:", {
//         balance: referrerWallet.balance,
//         referralBonusBalance: referrerWallet.referralBonusBalance,
//       });

//       console.log("📈 Updating referrer earnings...");
//       await User.findByIdAndUpdate(user.referredBy._id, {
//         $inc: { referralEarnings: REFERRAL_BONUS },
//       });

//       console.log("🧾 Creating referral bonus transaction...");
//       await Transaction.create({
//         user: user.referredBy._id,
//         type: "referral_bonus",
//         amount: REFERRAL_BONUS,
//         reference: `REFBONUS_${Date.now()}_${userId.toString().slice(-6)}`,
//         status: "success",
//         description: "Referral bonus from reseller upgrade",
//         metadata: {
//           referredUser: userId,
//           upgradeAmount: UPGRADE_FEE,
//         },
//       });

//       console.log("🎁 Referral bonus credited successfully:", REFERRAL_BONUS);
//     } else {
//       console.log("ℹ️ Referral bonus NOT applied", {
//         wasResellerBefore,
//         hasReferrer,
//       });
//     }

//     console.log(
//       "================ ✅ UPGRADE TO RESELLER END =================\n",
//     );

//     return res.status(200).json({
//       status: "success",
//       message: "Successfully upgraded to Reseller!",
//       data: {
//         user,
//         walletBalance: updatedWallet.balance,
//       },
//     });
//   } catch (error) {
//     console.error("🔥 UPGRADE TO RESELLER ERROR:", error);
//     console.log("================ ❌ UPGRADE FAILED =================\n");

//     return res.status(500).json({
//       status: "error",
//       message: error.message || "Failed to upgrade account",
//     });
//   }
// };

// module.exports = {
//   getWallet,
//   initializeWalletFunding,
//   verifyWalletFunding,
//   upgradeToReseller,
// };

const crypto = require("crypto");
const mongoose = require("mongoose");

const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");
const User = require("../models/userModel");
const Marketer = require("../models/marketerModel");

/* ─────────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────────── */

/**
 * Generate a unique transaction reference
 * @param {string} prefix - e.g. "FUND", "UPGRADE", "REFBONUS"
 * @param {string} userId
 */
const generateReference = (prefix, userId) => {
  const suffix = userId.toString().slice(-6).toUpperCase();
  return `${prefix}_${Date.now()}_${suffix}`;
};

/* ─────────────────────────────────────────────────────────────
 * GET WALLET
 * ───────────────────────────────────────────────────────────── */
const getWallet = async (req, res) => {
  try {
    console.log("🟢 [GET WALLET] User:", req.user._id);

    // ✅ Scope wallet lookup to user + marketer
    let wallet = await Wallet.findOne({
      user: req.user._id,
      marketerId: req.marketer._id,
    });

    if (!wallet) {
      console.log("➕ No wallet found — creating...");
      wallet = await Wallet.create({
        user: req.user._id,
        marketerId: req.marketer._id,
        balance: 0,
      });
      console.log("✅ Wallet created:", wallet._id);
    }

    res.status(200).json({
      status: "success",
      data: { wallet },
    });
  } catch (error) {
    console.error("🔴 [GET WALLET ERROR]:", error.message);
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * INITIALIZE WALLET FUNDING
 *
 * Changes from original:
 *  - Embed marketerId in Paystack metadata so verifyWalletFunding
 *    knows which marketer to credit/scope to
 *  - Use dynamic callback_url from marketer's domain
 *  - Added min/max amount validation
 * ───────────────────────────────────────────────────────────── */
const initializeWalletFunding = async (req, res) => {
  console.log("\n=== Initialize Wallet Funding START ===");
  console.log("\n=== Initialize Wallet Funding START ===");
  console.log("🏪 req.marketer:", req.marketer?._id || "NULL");
  console.log("👤 req.user:", req.user?._id || "NULL");
  console.log("🌐 host header:", req.headers.host);

  try {
    const { amount } = req.body;

    // Validate amount
    if (!amount || isNaN(amount) || amount < 100) {
      return res.status(400).json({
        status: "fail",
        message: "Minimum funding amount is ₦100.",
      });
    }

    if (amount > 1_000_000) {
      return res.status(400).json({
        status: "fail",
        message: "Maximum funding amount is ₦1,000,000 per transaction.",
      });
    }

    // ✅ Build callback URL from marketer's domain
    // Falls back to env variable if marketer has no domain set
    // ✅ Fixed — http + port in dev, https in prod
    const marketerDomain = req.marketer?.domains?.[0];
    const isDev = process.env.NODE_ENV === "development";

    console.log(isDev);

    const callbackUrl = marketerDomain
      ? isDev
        ? `http://${marketerDomain}:3000/funding/verify`
        : `https://${marketerDomain}/funding/verify`
      : process.env.PAYSTACK_CALLBACK_URL;

    const paymentData = {
      email: req.user.email,
      amount: Math.round(amount * 100), // Paystack expects kobo (integer)
      currency: "NGN",
      callback_url: callbackUrl,
      metadata: {
        userId: req.user._id.toString(),
        marketerId: req.marketer._id.toString(), // ✅ embed marketer context
        userEmail: req.user.email,
        userName: req.user.fullName,
      },
    };

    console.log("💳 Initializing Paystack payment:", {
      email: paymentData.email,
      amount: paymentData.amount,
      marketerId: req.marketer._id,
    });

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentData),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      console.error("❌ Paystack error:", data);
      return res.status(400).json({
        status: "fail",
        message: data.message || "Payment initialization failed.",
      });
    }

    console.log("✅ Paystack initialized:", data.data.reference);

    return res.status(200).json({
      status: "success",
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (error) {
    console.error("🔥 initializeWalletFunding ERROR:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to initialize payment. Please try again.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * VERIFY WALLET FUNDING (Paystack callback)
 *
 * Changes from original:
 *  - Added Paystack webhook signature verification (CRITICAL security fix)
 *  - marketerId now read from payment metadata and used for scoping
 *  - Transaction and wallet both scoped to marketerId
 *  - Marketer wallet stats updated after successful funding
 *  - requestId added to transaction (required by updated Transaction model)
 * ───────────────────────────────────────────────────────────── */
const verifyWalletFunding = async (req, res) => {
  console.log("\n=== VERIFY WALLET FUNDING START ===");

  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({
        status: "fail",
        message: "Payment reference is missing.",
      });
    }

    console.log("🔍 Verifying reference:", reference);

    // 1️⃣ Verify with Paystack
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const result = await response.json();

    if (!result.status || result.data?.status !== "success") {
      console.log("❌ Paystack verification failed:", result.data?.status);
      return res.status(400).json({
        status: "fail",
        message: "Payment verification failed. Transaction not successful.",
      });
    }

    const payment = result.data;
    const amount = payment.amount / 100; // convert kobo → naira

    // 2️⃣ Extract metadata (both userId and marketerId embedded at init)
    const userId = new mongoose.Types.ObjectId(payment.metadata.userId);
    const marketerId = new mongoose.Types.ObjectId(payment.metadata.marketerId);

    console.log("✅ Payment verified:", { userId, marketerId, amount });

    // 3️⃣ Create transaction (duplicate-safe via unique reference index)
    let transaction;
    try {
      transaction = await Transaction.create({
        user: userId,
        marketerId, // ✅ scoped
        type: "wallet_funding",
        amount,
        providerPrice: amount,
        sellingPrice: amount,
        reference: `FUND-${reference}`,
        requestId: `REQID-${reference}`, // ✅ required by model
        status: "success",
        description: `Wallet funded with ₦${amount.toLocaleString()}`,
      });

      console.log("🧾 Transaction created:", transaction._id);
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate transaction — already processed (Paystack can call twice)
        console.log("⚠️ Duplicate transaction — already processed safely");
        return res.status(200).json({
          status: "success",
          message: "Transaction already processed.",
        });
      }
      throw err;
    }

    // 4️⃣ Credit user wallet (atomic, upsert-safe)
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, marketerId }, // ✅ scoped
      {
        $inc: {
          balance: amount,
          totalFunded: amount,
        },
      },
      { new: true, upsert: true },
    );

    console.log("💰 Wallet credited:", { balance: wallet.balance });

    // 5️⃣ Mark user as funded (first-time flag)
    const user = await User.findById(userId);
    if (user && !user.hasFunded) {
      await User.findByIdAndUpdate(userId, { hasFunded: true });
      console.log("✅ User marked as hasFunded");
    }

    // 6️⃣ Update marketer revenue stats
    await Marketer.findByIdAndUpdate(marketerId, {
      $inc: {
        "wallet.totalRevenue": amount,
        "stats.totalVolume": amount,
        "stats.totalTransactions": 1,
      },
    });

    console.log("📊 Marketer stats updated");
    console.log("=== VERIFY WALLET FUNDING END ===\n");

    return res.status(200).json({
      status: "success",
      data: { wallet, transaction },
    });
  } catch (error) {
    console.error("🔥 verifyWalletFunding ERROR:", error.message);
    res.status(500).json({
      status: "error",
      message: "Wallet funding verification failed.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * PAYSTACK WEBHOOK (NEW)
 *
 * Your original only had a query-param verify endpoint.
 * Webhooks are more reliable — Paystack calls this server-to-server
 * even if the user closes the browser after payment.
 *
 * Add this route: POST /api/wallet/webhook
 * It must be excluded from the protect middleware (no JWT here).
 * ───────────────────────────────────────────────────────────── */
const paystackWebhook = async (req, res) => {
  try {
    // 1️⃣ Verify the request is genuinely from Paystack
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.warn("⚠️ Invalid Paystack webhook signature — rejected");
      return res.status(401).send("Unauthorized");
    }

    const event = req.body;
    console.log("📨 Paystack webhook event:", event.event);

    // 2️⃣ Only handle successful charges
    if (event.event !== "charge.success") {
      return res.sendStatus(200); // acknowledge other events
    }

    const payment = event.data;
    const amount = payment.amount / 100;
    const reference = payment.reference;

    const userId = new mongoose.Types.ObjectId(payment.metadata?.userId);
    const marketerId = new mongoose.Types.ObjectId(
      payment.metadata?.marketerId,
    );

    if (!userId || !marketerId) {
      console.error("❌ Webhook missing userId or marketerId in metadata");
      return res.sendStatus(200); // still acknowledge to stop retries
    }

    // 3️⃣ Idempotent transaction creation
    try {
      await Transaction.create({
        user: userId,
        marketerId,
        type: "wallet_funding",
        amount,
        providerPrice: amount,
        sellingPrice: amount,
        reference: `FUND-${reference}`,
        requestId: `WEBHOOK-${reference}`,
        status: "success",
        description: `Wallet funded via webhook ₦${amount.toLocaleString()}`,
      });
    } catch (err) {
      if (err.code === 11000) {
        console.log("⚠️ Webhook: duplicate transaction, skipping");
        return res.sendStatus(200);
      }
      throw err;
    }

    // 4️⃣ Credit wallet
    await Wallet.findOneAndUpdate(
      { user: userId, marketerId },
      { $inc: { balance: amount, totalFunded: amount } },
      { upsert: true },
    );

    // 5️⃣ Mark user funded
    await User.findByIdAndUpdate(userId, { hasFunded: true });

    // 6️⃣ Update marketer stats
    await Marketer.findByIdAndUpdate(marketerId, {
      $inc: {
        "wallet.totalRevenue": amount,
        "stats.totalVolume": amount,
        "stats.totalTransactions": 1,
      },
    });

    console.log("✅ Webhook processed:", { userId, marketerId, amount });
    return res.sendStatus(200);
  } catch (error) {
    console.error("🔥 paystackWebhook ERROR:", error.message);
    return res.sendStatus(500);
  }
};

/* ─────────────────────────────────────────────────────────────
 * UPGRADE TO RESELLER
 *
 * Changes from original:
 *  - marketerId added to transaction
 *  - UPGRADE_FEE read from marketer settings (flexible per platform)
 *  - Referral bonus also scoped to marketer
 *  - requestId added to transactions
 *  - Prevents superadmin from being downgraded
 * ───────────────────────────────────────────────────────────── */
const upgradeToReseller = async (req, res) => {
  console.log("\n=== UPGRADE TO RESELLER START ===");

  try {
    const userId = req.user._id;
    const marketerId = req.marketer._id;

    // ✅ Fee can be set per marketer, fallback to platform default
    const UPGRADE_FEE = req.marketer.pricing?.resellerUpgradeFee ?? 1000;
    const REFERRAL_BONUS = UPGRADE_FEE * 0.5;

    console.log("👤 User:", userId, "| Marketer:", marketerId);
    console.log(
      "💰 Upgrade fee:",
      UPGRADE_FEE,
      "| Referral bonus:",
      REFERRAL_BONUS,
    );

    // 1️⃣ Fetch user with referrer populated
    const user = await User.findById(userId).populate("referredBy");

    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "User not found." });
    }

    // 2️⃣ Prevent duplicate upgrade
    if (["reseller", "marketer", "superadmin"].includes(user.role)) {
      return res.status(400).json({
        status: "fail",
        message: `You already have a ${user.role} account.`,
      });
    }

    // 3️⃣ Fetch wallet (scoped to marketer)
    const wallet = await Wallet.findOne({ user: userId, marketerId });

    if (!wallet) {
      return res
        .status(404)
        .json({ status: "fail", message: "Wallet not found." });
    }

    // 4️⃣ Check balance
    if (wallet.balance < UPGRADE_FEE) {
      return res.status(400).json({
        status: "fail",
        message: "Insufficient wallet balance.",
        required: UPGRADE_FEE,
        available: wallet.balance,
      });
    }

    // 5️⃣ Create upgrade transaction
    const reference = generateReference("UPGRADE", userId);

    const transaction = await Transaction.create({
      user: userId,
      marketerId, // ✅ scoped
      type: "upgrade_to_reseller",
      amount: UPGRADE_FEE,
      reference,
      requestId: `REQID-${reference}`,
      status: "success",
      description: "Account upgraded to reseller",
    });

    console.log("🧾 Upgrade transaction:", transaction._id);

    // 6️⃣ Deduct from wallet
    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId, marketerId },
      { $inc: { balance: -UPGRADE_FEE, totalSpent: UPGRADE_FEE } },
      { new: true },
    );

    console.log("💸 Wallet after deduction:", updatedWallet.balance);

    // 7️⃣ Upgrade user role
    user.role = "reseller";
    user.upgradedToResellerAt = new Date();
    await user.save();

    console.log("✅ User upgraded to reseller");

    // 8️⃣ Referral bonus (only if user was referred + first-time upgrade)
    if (user.referredBy) {
      console.log("🎁 Crediting referral bonus to:", user.referredBy._id);

      await Wallet.findOneAndUpdate(
        { user: user.referredBy._id, marketerId }, // ✅ scoped to same marketer
        {
          $inc: {
            balance: REFERRAL_BONUS,
            referralBonusBalance: REFERRAL_BONUS,
          },
        },
        { new: true },
      );

      await User.findByIdAndUpdate(user.referredBy._id, {
        $inc: { referralEarnings: REFERRAL_BONUS },
      });

      const bonusReference = generateReference("REFBONUS", userId);

      await Transaction.create({
        user: user.referredBy._id,
        marketerId, // ✅ scoped
        type: "referral_bonus",
        amount: REFERRAL_BONUS,
        reference: bonusReference,
        requestId: `REQID-${bonusReference}`,
        status: "success",
        description: `Referral bonus from reseller upgrade by ${user.username}`,
      });

      console.log("✅ Referral bonus credited:", REFERRAL_BONUS);
    }

    // 9️⃣ Update marketer stats
    await Marketer.findByIdAndUpdate(marketerId, {
      $inc: { "stats.totalTransactions": 1 },
    });

    console.log("=== UPGRADE TO RESELLER END ===\n");

    return res.status(200).json({
      status: "success",
      message: "Account successfully upgraded to Reseller!",
      data: {
        role: user.role,
        upgradedAt: user.upgradedToResellerAt,
        walletBalance: updatedWallet.balance,
      },
    });
  } catch (error) {
    console.error("🔥 upgradeToReseller ERROR:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to upgrade account. Please try again.",
    });
  }
};

module.exports = {
  getWallet,
  initializeWalletFunding,
  verifyWalletFunding,
  paystackWebhook,
  upgradeToReseller,
};
