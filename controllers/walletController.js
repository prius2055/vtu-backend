const crypto = require("crypto");
const mongoose = require("mongoose");

const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");
const User = require("../models/userModel");
const Marketer = require("../models/marketerModel");

/* ─────────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────────── */
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

    res.status(200).json({ status: "success", data: { wallet } });
  } catch (error) {
    console.error("🔴 [GET WALLET ERROR]:", error.message);
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * CREATE VIRTUAL ACCOUNT
 *
 * Called once per user. If user already has virtual accounts,
 * just return them. Otherwise create on PaymentPoint and save.
 * ───────────────────────────────────────────────────────────── */
const createVirtualAccount = async (req, res) => {
  console.log("\n=== CREATE VIRTUAL ACCOUNT START ===");
  console.log("👤 User:", req.user._id, "| 🏪 Marketer:", req.marketer._id);

  try {
    /* ── Check if user already has virtual accounts ── */
    let wallet = await Wallet.findOne({
      user: req.user._id,
      marketerId: req.marketer._id,
    });

    if (wallet?.virtualAccounts?.length > 0) {
      console.log("ℹ️ User already has virtual accounts — returning existing");
      return res.status(200).json({
        status: "success",
        data: { virtualAccounts: wallet.virtualAccounts },
      });
    }

    /* ── Fetch marketer's PaymentPoint credentials ── */
    const marketerWithTokens = await Marketer.findById(req.marketer._id).select(
      "+apiTokens.gatewaySecret +apiTokens.gatewayWebhook",
    );

    const { gatewaySecret, gatewayPublic, paymentPointBusinessId } =
      marketerWithTokens.getDecryptedTokens();

    console.log("🔑 gatewaySecret:", gatewaySecret ? "EXISTS" : "UNDEFINED");
    console.log("🔑 gatewayPublic:", gatewayPublic ? "EXISTS" : "UNDEFINED");
    console.log(
      "🔑 raw encrypted:",
      marketerWithTokens.apiTokens?.gatewaySecret
        ? "HAS ENCRYPTED VALUE"
        : "NULL IN DB",
    );

    console.log("🔑 Using tokens:", {
      hasSecret: !!gatewaySecret,
      hasPublic: !!gatewayPublic,
      paymentPointBusinessId,
      hasBusinessId: !!paymentPointBusinessId,
    });

    /* ── Call PaymentPoint ── */
    const response = await fetch(
      "https://api.paymentpoint.co/api/v1/createVirtualAccount",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewaySecret}`,
          "api-key": gatewayPublic,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: req.user.email,
          name: req.user.fullName,
          phoneNumber: req.user.phone,
          bankCode: ["20946", "20897"], // PalmPay + OPay
          businessId: paymentPointBusinessId,
        }),
      },
    );

    const data = await response.json();
    console.log("📦 PaymentPoint response:", data.status, data.message);

    if (data.status !== "success") {
      return res.status(400).json({
        status: "fail",
        message: data.message || "Failed to create virtual account.",
      });
    }

    /* ── Map and save accounts to wallet ── */
    const virtualAccounts = data.bankAccounts.map((acct) => ({
      bankName: acct.bankName,
      accountNumber: acct.accountNumber,
      accountName: acct.accountName,
      reservedAccountId: acct.Reserved_Account_Id,
    }));

    wallet = await Wallet.findOneAndUpdate(
      { user: req.user._id, marketerId: req.marketer._id },
      { $set: { virtualAccounts } },
      { upsert: true, new: true },
    );

    console.log("✅ Virtual accounts saved:", virtualAccounts.length);
    console.log("=== CREATE VIRTUAL ACCOUNT END ===\n");

    return res.status(200).json({
      status: "success",
      data: { virtualAccounts },
    });
  } catch (error) {
    console.error("🔥 createVirtualAccount ERROR:", error.message);
    console.error("🔥 FULL STACK:", error.stack); // ✅ ADD THIS
    return res.status(500).json({
      status: "error",
      message: "Failed to create virtual account. Please try again.",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * PAYMENTPOINT WEBHOOK
 *
 * PaymentPoint POSTs here when a customer transfers money
 * to their virtual account. No redirect needed.
 *
 * Route: POST /api/v1/wallet/webhook/:marketerId
 * Public — no JWT. Signature-verified instead.
 * ───────────────────────────────────────────────────────────── */
const paymentPointWebhook = async (req, res) => {
  console.log("\n=== PAYMENTPOINT WEBHOOK START ===");

  try {
    const marketerId = req.params.marketerId;

    /* ── 1. Fetch marketer + webhook secret ── */
    const marketer = await Marketer.findById(marketerId).select(
      "+apiTokens.gatewayWebhook +apiTokens.gatewaySecret",
    );

    if (!marketer) {
      console.warn("⚠️ Webhook: marketer not found:", marketerId);
      return res.sendStatus(404);
    }

    const { gatewayWebhook, gatewaySecret } = marketer.getDecryptedTokens();

    /* ── 2. Verify PaymentPoint signature ── */
    const rawBody = req.body;

    const calculatedSignature = crypto
      .createHmac("sha256", gatewaySecret)
      .update(rawBody)
      .digest("hex");

    if (calculatedSignature !== req.headers["paymentpoint-signature"]) {
      console.warn("⚠️ Invalid PaymentPoint signature — rejected");
      return res.status(401).send("Unauthorized");
    }

    const event = JSON.parse(rawBody.toString());
    console.log("📨 Webhook event:", event.notification_status);

    /* ── 3. Only process successful payments ── */
    if (
      event.notification_status !== "payment_successful" ||
      event.transaction_status !== "success"
    ) {
      console.log("ℹ️ Non-payment event — acknowledged");
      return res.sendStatus(200);
    }

    const amountPaid = event.amount_paid;
    const settlementAmount = event.settlement_amount;
    const reference = event.transaction_id;
    const receiverAccount = event.receiver?.account_number;
    const transactionId = event.transaction_id;

    /* ── 4. Look up wallet by virtual account number ── */
    const wallet = await Wallet.findOne({
      "virtualAccounts.accountNumber": receiverAccount,
      marketerId,
    });

    if (!wallet) {
      console.error("❌ No wallet found for account:", receiverAccount);
      return res.sendStatus(200);
    }

    const userId = wallet.user;

    /* ── 5. Idempotent transaction creation ── */
    try {
      await Transaction.create({
        transactionId,
        user: userId,
        marketerId,
        type: "wallet_funding",
        amount: amountPaid,
        reference: `FUND-${reference}`,
        requestId: `WEBHOOK-${reference}`,
        status: "success",
        description: `Wallet funded via bank transfer ₦${settlementAmount.toLocaleString()}`,
      });

      console.log("🧾 Transaction created for:", userId);
    } catch (err) {
      if (err.code === 11000) {
        console.log("⚠️ Duplicate webhook — already processed safely");
        return res.sendStatus(200);
      }
      throw err;
    }

    /* ── 6. Credit user wallet ── */
    // ✅ { new: true } returns the updated document with the new balance
    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId, marketerId },
      { $inc: { balance: settlementAmount, totalFunded: settlementAmount } },
      { new: true }, // ✅ FIXED: returns updated document
    );

    console.log("💰 Wallet credited. New balance:", updatedWallet.balance);

    /* ── 7. Mark user as funded ── */
    await User.findByIdAndUpdate(userId, { hasFunded: true });

    /* ── 8. Update marketer wallet ── */

    marketer.wallet.fundingBalance += settlementAmount;
    marketer.stats.totalVolume += settlementAmount;
    marketer.stats.totalTransactions += 1;

    // keep balances consistent
    marketer._syncTotalBalance();

    await marketer.save();

    console.log("📊 Marketer stats updated");
    console.log("=== PAYMENTPOINT WEBHOOK END ===\n");

    return res.sendStatus(200);
  } catch (error) {
    console.error("🔥 paymentPointWebhook ERROR:", error.message);
    return res.sendStatus(500);
  }
};

/* ─────────────────────────────────────────────────────────────
 * UPGRADE TO RESELLER
 * ───────────────────────────────────────────────────────────── */
const upgradeToReseller = async (req, res) => {
  console.log("\n=== UPGRADE TO RESELLER START ===");

  try {
    const userId = req.user._id;
    const marketerId = req.marketer._id;
    const UPGRADE_FEE = req.marketer.pricing?.resellerUpgradeFee ?? 1000;
    const REFERRAL_BONUS = UPGRADE_FEE * 0.5;

    console.log("👤 User:", userId, "| 💰 Fee:", UPGRADE_FEE);

    const user = await User.findById(userId).populate("referredBy");
    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "User not found." });
    }

    if (["reseller", "marketer", "superadmin"].includes(user.role)) {
      return res.status(400).json({
        status: "fail",
        message: `You already have a ${user.role} account.`,
      });
    }

    const wallet = await Wallet.findOne({ user: userId, marketerId });
    if (!wallet) {
      return res
        .status(404)
        .json({ status: "fail", message: "Wallet not found." });
    }

    if (wallet.balance < UPGRADE_FEE) {
      return res.status(400).json({
        status: "fail",
        message: "Insufficient wallet balance.",
        required: UPGRADE_FEE,
        available: wallet.balance,
      });
    }

    const reference = generateReference("UPGRADE", userId);

    const transaction = await Transaction.create({
      user: userId,
      marketerId,
      type: "upgrade_to_reseller",
      amount: UPGRADE_FEE,
      reference,
      requestId: `REQID-${reference}`,
      status: "success",
      description: "Account upgraded to reseller",
    });

    console.log("🧾 Upgrade transaction:", transaction._id);

    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId, marketerId },
      { $inc: { balance: -UPGRADE_FEE, totalSpent: UPGRADE_FEE } },
      { new: true },
    );

    user.role = "reseller";
    user.upgradedToResellerAt = new Date();
    await user.save();

    console.log("✅ User upgraded to reseller");

    if (user.referredBy) {
      console.log("🎁 Crediting referral bonus to:", user.referredBy._id);

      await Wallet.findOneAndUpdate(
        { user: user.referredBy._id, marketerId },
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

      const bonusRef = generateReference("REFBONUS", userId);

      await Transaction.create({
        user: user.referredBy._id,
        marketerId,
        type: "referral_bonus",
        amount: REFERRAL_BONUS,
        reference: bonusRef,
        requestId: `REQID-${bonusRef}`,
        status: "success",
        description: `Referral bonus from reseller upgrade by ${user.username}`,
      });

      console.log("✅ Referral bonus credited:", REFERRAL_BONUS);
    }

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
  createVirtualAccount,
  paymentPointWebhook,
  upgradeToReseller,
};
