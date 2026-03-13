const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");
const Marketer = require("../models/marketerModel");

/* ─────────────────────────────────────────────────────────────
 * APPLY DATA COMMISSION
 *
 * Called after every successful data purchase.
 * Pays the buyer's referrer a commission based on GB size.
 *
 * Rule: Commission ONLY applies when:
 *  - Buyer is a reseller
 *  - Buyer's referrer is also a reseller
 *  - Both are on the same marketer platform
 *  - Data size is >= 1GB
 * ───────────────────────────────────────────────────────────── */
const applyDataCommission = async ({
  buyerId,
  marketerId,
  dataSizeGb,
  transactionId,
}) => {
  try {
    // ── Skip sub-1GB purchases ──
    if (!dataSizeGb || dataSizeGb < 1) {
      console.log("ℹ️ Commission skipped: data less than 1GB");
      return { applied: false, reason: "Data less than 1GB" };
    }

    // ── Fetch buyer and check role ──
    const buyer = await User.findById(buyerId).populate("referredBy");

    if (buyer?.role !== "reseller") {
      return { applied: false, reason: "Buyer is not a reseller" };
    }

    if (!buyer?.referredBy) {
      return { applied: false, reason: "No referrer" };
    }

    const referrer = buyer.referredBy;

    // ── Referrer must also be a reseller ──
    if (referrer.role !== "reseller") {
      return { applied: false, reason: "Referrer is not a reseller" };
    }

    // ── Both must be on the same marketer platform ──
    if (referrer.marketerId?.toString() !== marketerId.toString()) {
      return { applied: false, reason: "Referrer is on a different platform" };
    }

    // ── Commission rate from marketer config ──
    const marketer = await Marketer.findById(marketerId).select("commission");
    const ratePerGb = marketer?.commission?.referralPercent || 1;
    const resellerBonus = marketer?.commission?.resellerPercent || 0;
    const totalRatePerGb = ratePerGb + resellerBonus;

    const commissionAmount = Math.floor(totalRatePerGb * dataSizeGb);

    if (commissionAmount <= 0) {
      return { applied: false, reason: "Commission amount is 0" };
    }

    console.log("💰 Data Commission:", {
      dataSizeGb,
      ratePerGb: totalRatePerGb,
      commissionAmount,
      referrer: referrer._id,
    });

    // ── Credit referrer wallet ──
    await Wallet.findOneAndUpdate(
      { user: referrer._id, marketerId },
      {
        $inc: {
          balance: commissionAmount,
          referralBonusBalance: commissionAmount,
        },
      },
      { upsert: false },
    );

    // ── Update referrer earnings on User doc ──
    const updatedReferrer = await User.findByIdAndUpdate(
      referrer._id,
      { $inc: { commissionEarnings: commissionAmount } },
      { new: true },
    );

    // ── Create commission transaction ──
    const ts = Date.now();
    const suffix = referrer._id.toString().slice(-6).toUpperCase();

    await Transaction.create({
      user: referrer._id,
      marketerId,
      type: "commission",
      amount: commissionAmount,
      providerPrice: 0,
      sellingPrice: commissionAmount,
      marketerProfit: 0,
      platformProfit: 0,
      profit: 0,
      status: "success",
      reference: `COMM_${ts}_${suffix}`,
      requestId: `REQID_COMM_${ts}_${suffix}`,
      description: `Data commission: ${dataSizeGb}GB purchase by ${buyer.username}`,
    });

    console.log(
      `✅ Data commission paid: ₦${commissionAmount} to reseller (${updatedReferrer._id})`,
    );

    return {
      applied: true,
      commissionAmount,
      commissionEarnings: updatedReferrer.commissionEarnings,
    };
  } catch (err) {
    console.error("🔥 applyDataCommission error:", err.message);
    return { applied: false, reason: err.message };
  }
};

/* ─────────────────────────────────────────────────────────────
 * APPLY GENERAL COMMISSION
 *
 * For non-data services (airtime, electricity, cable).
 * Uses percentage of transaction amount instead of per-GB.
 *
 * Rule: Same as applyDataCommission —
 *  - Buyer must be a reseller
 *  - Referrer must also be a reseller
 *  - Both on the same marketer platform
 * ───────────────────────────────────────────────────────────── */
const applyGeneralCommission = async ({
  buyerId,
  marketerId,
  transactionAmount,
  serviceType,
}) => {
  try {
    // ── Fetch buyer and check role ──
    const buyer = await User.findById(buyerId).populate("referredBy");

    if (buyer?.role !== "reseller") {
      return { applied: false, reason: "Buyer is not a reseller" };
    }

    if (!buyer?.referredBy) {
      return { applied: false, reason: "No referrer" };
    }

    const referrer = buyer.referredBy;

    // ── Referrer must also be a reseller ──
    if (referrer.role !== "reseller") {
      return { applied: false, reason: "Referrer is not a reseller" };
    }

    // ── Both must be on the same marketer platform ──
    if (referrer.marketerId?.toString() !== marketerId.toString()) {
      return { applied: false, reason: "Referrer on different platform" };
    }

    // ── Commission rate from marketer config ──
    const marketer = await Marketer.findById(marketerId).select("commission");
    const referralPercent = marketer?.commission?.referralPercent || 0;
    const resellerPercent = marketer?.commission?.resellerPercent || 0;
    const totalPercent = referralPercent + resellerPercent;

    if (totalPercent <= 0) {
      return { applied: false, reason: "Commission rate is 0" };
    }

    const commissionAmount =
      Math.round((totalPercent / 100) * transactionAmount * 100) / 100;

    if (commissionAmount <= 0) {
      return { applied: false, reason: "Commission amount is 0" };
    }

    console.log("💰 General Commission:", {
      serviceType,
      transactionAmount,
      totalPercent,
      commissionAmount,
      referrer: referrer._id,
    });

    // ── Credit referrer wallet ──
    await Wallet.findOneAndUpdate(
      { user: referrer._id, marketerId },
      {
        $inc: {
          balance: commissionAmount,
          referralBonusBalance: commissionAmount,
        },
      },
      { upsert: false },
    );

    // ── Update referrer earnings on User doc ──
    const updatedReferrer = await User.findByIdAndUpdate(
      referrer._id,
      { $inc: { commissionEarnings: commissionAmount } },
      { new: true },
    );

    // ── Create commission transaction ──
    const ts = Date.now();
    const suffix = referrer._id.toString().slice(-6).toUpperCase();

    await Transaction.create({
      user: referrer._id,
      marketerId,
      type: "commission",
      amount: commissionAmount,
      providerPrice: 0,
      sellingPrice: commissionAmount,
      marketerProfit: 0,
      platformProfit: 0,
      profit: 0,
      status: "success",
      reference: `COMM_${ts}_${suffix}`,
      requestId: `REQID_COMM_${ts}_${suffix}`,
      description: `${serviceType} commission from reseller ${buyer.username}`,
    });

    console.log(
      `✅ ${serviceType} commission: ₦${commissionAmount} → reseller (${updatedReferrer._id})`,
    );

    return {
      applied: true,
      commissionAmount,
      commissionEarnings: updatedReferrer.commissionEarnings,
    };
  } catch (err) {
    console.error("🔥 applyGeneralCommission error:", err.message);
    return { applied: false, reason: err.message };
  }
};

module.exports = { applyDataCommission, applyGeneralCommission };
