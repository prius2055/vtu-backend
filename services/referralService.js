const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");

/**
 * Apply referral bonus for eligible actions
 */
const applyReferralBonus = async ({
  buyerId,
  action,
  dataSizeGb = 0,
  referenceSource,
}) => {
  console.log("🎁 Referral Service Triggered");
  console.log("📌 Action:", action);
  console.log("👤 Buyer ID:", buyerId);
  console.log("📦 Data Size (GB):", dataSizeGb);

  try {
    if (action !== "data_purchase") {
      console.log("ℹ️ Action not eligible for referral bonus");
      return;
    }

    if (dataSizeGb < 1) {
      console.log("❌ Data < 1GB — no referral bonus");
      return;
    }

    const buyer = await User.findById(buyerId).populate("referredBy");

    if (!buyer?.referredBy) {
      console.log("ℹ️ Buyer not referred");
      return;
    }

    const referrer = buyer.referredBy;

    if (referrer.role !== "reseller" ||referrer.role !== "admin") {
      console.log("❌ Referrer is not a reseller or an admin");
      return;
    }

    const bonusAmount = Math.floor(dataSizeGb); // ₦1 per GB

    console.log(
      `💰 Crediting ₦${bonusAmount} referral bonus to ${referrer._id}`,
    );

    // 💳 Credit wallet
    await Wallet.findOneAndUpdate(
      { user: referrer._id },
      {
        $inc: {
          balance: bonusAmount,
          referralBonusBalance: bonusAmount,
        },
      },
      { new: true, upsert: true },
    );

    // 👤 Track earnings
    await User.findByIdAndUpdate(referrer._id, {
      $inc: { referralEarnings: bonusAmount },
    });

    // 🧾 Record transaction
    await Transaction.create({
      user: referrer._id,
      type: "referral_bonus",
      amount: bonusAmount,
      reference: `REF-${action.toUpperCase()}-${referenceSource}`,
      status: "success",
      description: `Referral bonus from ${action}`,
      metadata: {
        referredUser: buyerId,
        dataSizeGb,
      },
    });

    console.log("✅ Referral bonus applied successfully");
  } catch (error) {
    // 🚨 NEVER BLOCK MAIN FLOW
    console.error("🔥 Referral bonus failed:", error.message);
  }
};

module.exports = {
  applyReferralBonus,
};
