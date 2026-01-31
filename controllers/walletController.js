const mongoose = require("mongoose");
const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");
const User = require("../models/userModel");

// const url = "https://geotechtest.vercel.app/funding/verify"

const url = "http://localhost:3000/funding/verify";

const getWallet = async (req, res) => {
  try {
    console.log("🟢 [GET WALLET] Request received");

    console.log("👤 Authenticated user:", {
      id: req.user?._id,
      email: req.user?.email,
    });

    let wallet = await Wallet.findOne({ user: req.user._id });

    console.log("💼 Wallet lookup result:", wallet ? "FOUND" : "NOT FOUND");

    if (!wallet) {
      console.log("➕ No wallet found, creating new wallet...");

      wallet = await Wallet.create({
        user: req.user._id,
        balance: 0,
      });

      console.log("✅ New wallet created:", {
        walletId: wallet._id,
        balance: wallet.balance,
      });
    } else {
      console.log("💰 Existing wallet balance:", wallet.balance);
    }

    console.log("📤 Sending wallet response to client");

    res.status(200).json({
      status: "success",
      data: { wallet },
    });
  } catch (error) {
    console.error("🔴 [GET WALLET ERROR]", {
      message: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });

    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

const initializeWalletFunding = async (req, res) => {
  console.log("=== Initialize Wallet Funding START ===");

  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
  console.log("PAYSTACK_SECRET exists:", !!PAYSTACK_SECRET);

  try {
    console.log("Request body:", req.body);
    console.log("Authenticated user:", req.user);

    const { amount } = req.body;

    if (!amount || amount <= 0) {
      console.log("Invalid amount received:", amount);
      return res.status(400).json({
        status: "fail",
        message: "Invalid amount",
      });
    }

    const paymentData = {
      email: req.user.email,
      amount: amount * 100,
      currency: "NGN",
      callback_url: url,
      metadata: {
        userId: req.user._id.toString(),
      },
    };

    console.log("Payment data to Paystack:", paymentData);

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentData),
      },
    );

    console.log("Paystack response status:", response.status);
    console.log("Paystack response ok:", response.ok);

    const data = await response.json();
    console.log("Paystack response data:", data);

    if (!response.ok) {
      console.error("Paystack returned error:", data);
      return res.status(response.status).json({
        status: "fail",
        message: data.message || "Paystack initialization failed",
      });
    }

    console.log("Authorization URL:", data?.data?.authorization_url);

    return res.status(200).json({
      status: "success",
      authorization_url: data.data.authorization_url,
    });
  } catch (error) {
    console.error("=== Initialize Wallet Funding ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    return res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

const verifyWalletFunding = async (req, res) => {
  console.log("\n==============================");
  console.log("🔍 VERIFY WALLET FUNDING STARTED");
  console.log("==============================");

  try {
    const { reference } = req.query;
    console.log("📌 Reference received:", reference);

    if (!reference) {
      console.log("❌ Missing payment reference");
      return res.status(400).json({
        status: "fail",
        message: "Payment reference missing",
      });
    }

    console.log("🔑 Verifying payment with Paystack...");

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const result = await response.json();
    console.log("📦 Paystack raw response:", result);

    const payment = result.data;

    if (!payment || payment.status !== "success") {
      console.log("❌ Payment verification failed:", payment?.status);
      return res.status(400).json({
        status: "fail",
        message: "Payment not successful",
      });
    }

    // ✅ NORMALIZE USER ID (CRITICAL)
    const userId = new mongoose.Types.ObjectId(payment.metadata.userId);
    const amount = payment.amount / 100;

    console.log("✅ Payment verified");
    console.log("👤 User ID:", userId.toString());
    console.log("💵 Amount:", amount);

    // 🔐 CREATE TRANSACTION (ANTI-DUPLICATE HARD STOP)
    let transaction;
    try {
      transaction = await Transaction.create({
        user: userId,
        type: "wallet_funding",
        amount,
        reference: `REF-FUNDING-${reference}`,
        description: `Wallet funding of ${amount}`,
        status: "success",
      });
      console.log("🧾 Transaction created:", transaction._id);
    } catch (err) {
      if (err.code === 11000) {
        console.log("⚠️ Duplicate transaction detected — exiting safely");
        return res.json({
          status: "success",
          message: "Transaction already processed",
        });
      }
      throw err;
    }

    // 🔍 FETCH USER (BEFORE WALLET UPDATE)
    const user = await User.findById(userId);
    console.log("👤 User before update:", {
      id: user?._id,
      hasFunded: user?.hasFunded,
    });

    // ✅ MARK USER AS FUNDED IMMEDIATELY
    if (!user.hasFunded) {
      await User.findByIdAndUpdate(userId, { hasFunded: true });
      console.log("✅ User marked as funded");
    }

    // 💰 UPDATE WALLET (ATOMIC)
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: {
          balance: amount,
          totalFunded: amount,
        },
      },
      { new: true, upsert: true },
    );

    console.log("💰 Wallet after credit:", wallet);

    console.log("🏁 VERIFY WALLET FUNDING COMPLETED SUCCESSFULLY");
    console.log("==============================\n");

    return res.status(200).json({
      status: "success",
      data: {
        wallet,
        transaction,
      },
    });
  } catch (error) {
    console.error("🔥 VERIFY FUNDING ERROR:", error);
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

/* ----------------------------------
 * UPGRADE TO RESELLER
 * --------------------------------- */
const upgradeToReseller = async (req, res) => {
  console.log(
    "\n================ 🔼 UPGRADE TO RESELLER START =================",
  );

  try {
    const userId = req.user?._id || req.user?.id;
    const UPGRADE_FEE = 1000;
    const REFERRAL_BONUS = UPGRADE_FEE * 0.5; // ₦500

    console.log("👤 User ID:", userId);
    console.log("💰 Upgrade Fee:", UPGRADE_FEE);
    console.log("🎁 Referral Bonus:", REFERRAL_BONUS);

    /* --------------------------------------------------
     * 1️⃣ Validate authentication
     * -------------------------------------------------- */
    if (!userId) {
      console.log("❌ AUTH ERROR: No userId found in request");
      return res.status(401).json({
        status: "fail",
        message: "Authentication required",
      });
    }

    /* --------------------------------------------------
     * 2️⃣ Fetch user BEFORE update
     * -------------------------------------------------- */
    console.log("🔍 Fetching user from DB...");
    const user = await User.findById(userId).populate("referredBy");

    if (!user) {
      console.log("❌ USER NOT FOUND:", userId);
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    const wasResellerBefore = user.role === "reseller";
    const hasReferrer = !!user.referredBy;

    console.log("👤 User snapshot:", {
      id: user._id,
      roleBefore: user.role,
      wasResellerBefore,
      hasReferrer,
      referrerId: user.referredBy?._id || null,
    });

    /* --------------------------------------------------
     * 3️⃣ Prevent duplicate upgrade
     * -------------------------------------------------- */
    if (wasResellerBefore || user.role === "admin") {
      console.log("⚠️ UPGRADE BLOCKED: User already reseller/admin");
      return res.status(400).json({
        status: "fail",
        message: "You are already a reseller",
      });
    }

    /* --------------------------------------------------
     * 4️⃣ Fetch wallet
     * -------------------------------------------------- */
    console.log("💼 Fetching user wallet...");
    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      console.log("❌ WALLET NOT FOUND for user:", userId);
      return res.status(404).json({
        status: "fail",
        message: "Wallet not found",
      });
    }

    console.log("💳 Wallet before upgrade:", {
      balance: wallet.balance,
      totalSpent: wallet.totalSpent,
    });

    /* --------------------------------------------------
     * 5️⃣ Check balance
     * -------------------------------------------------- */
    if (wallet.balance < UPGRADE_FEE) {
      console.log("❌ INSUFFICIENT BALANCE", {
        required: UPGRADE_FEE,
        available: wallet.balance,
      });

      return res.status(400).json({
        status: "fail",
        message: "Insufficient wallet balance",
        required: UPGRADE_FEE,
        available: wallet.balance,
      });
    }

    /* --------------------------------------------------
     * 6️⃣ Create transaction (upgrade)
     * -------------------------------------------------- */
    const reference = `UPGRADE_${Date.now()}_${userId.toString().slice(-6)}`;
    console.log("🧾 Creating upgrade transaction:", reference);

    const transaction = await Transaction.create({
      user: userId,
      type: "upgrade to reseller",
      amount: UPGRADE_FEE,
      reference,
      status: "success",
      description: "Account upgraded to reseller",
    });

    console.log("✅ Upgrade transaction created:", transaction._id);

    /* --------------------------------------------------
     * 7️⃣ Deduct wallet balance
     * -------------------------------------------------- */
    console.log("💸 Deducting upgrade fee from wallet...");

    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: {
          balance: -UPGRADE_FEE,
          totalSpent: UPGRADE_FEE,
        },
      },
      { new: true },
    );

    console.log("💰 Wallet after deduction:", {
      balance: updatedWallet.balance,
      totalSpent: updatedWallet.totalSpent,
    });

    /* --------------------------------------------------
     * 8️⃣ Upgrade user role
     * -------------------------------------------------- */
    console.log("🔄 Updating user role to RESELLER...");
    user.role = "reseller";
    user.upgradedToResellerAt = new Date();
    await user.save();

    console.log("✅ User role updated:", {
      newRole: user.role,
      upgradedAt: user.upgradedToResellerAt,
    });

    /* --------------------------------------------------
     * 9️⃣ Referral bonus logic
     * -------------------------------------------------- */
    if (!wasResellerBefore && hasReferrer) {
      console.log("🎉 Referral bonus conditions MET");
      console.log("👥 Referrer ID:", user.referredBy._id);

      console.log("💰 Crediting referrer wallet...");
      const referrerWallet = await Wallet.findOneAndUpdate(
        { user: user.referredBy._id },
        {
          $inc: {
            balance: REFERRAL_BONUS,
            referralBonusBalance: REFERRAL_BONUS,
          },
        },
        { new: true },
      );

      console.log("💳 Referrer wallet updated:", {
        balance: referrerWallet.balance,
        referralBonusBalance: referrerWallet.referralBonusBalance,
      });

      console.log("📈 Updating referrer earnings...");
      await User.findByIdAndUpdate(user.referredBy._id, {
        $inc: { referralEarnings: REFERRAL_BONUS },
      });

      console.log("🧾 Creating referral bonus transaction...");
      await Transaction.create({
        user: user.referredBy._id,
        type: "referral_bonus",
        amount: REFERRAL_BONUS,
        reference: `REFBONUS_${Date.now()}_${userId.toString().slice(-6)}`,
        status: "success",
        description: "Referral bonus from reseller upgrade",
        metadata: {
          referredUser: userId,
          upgradeAmount: UPGRADE_FEE,
        },
      });

      console.log("🎁 Referral bonus credited successfully:", REFERRAL_BONUS);
    } else {
      console.log("ℹ️ Referral bonus NOT applied", {
        wasResellerBefore,
        hasReferrer,
      });
    }

    console.log(
      "================ ✅ UPGRADE TO RESELLER END =================\n",
    );

    return res.status(200).json({
      status: "success",
      message: "Successfully upgraded to Reseller!",
      data: {
        user,
        walletBalance: updatedWallet.balance,
      },
    });
  } catch (error) {
    console.error("🔥 UPGRADE TO RESELLER ERROR:", error);
    console.log("================ ❌ UPGRADE FAILED =================\n");

    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to upgrade account",
    });
  }
};

module.exports = {
  getWallet,
  initializeWalletFunding,
  verifyWalletFunding,
  upgradeToReseller,
};
