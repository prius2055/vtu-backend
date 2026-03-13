// const User = require("../models/userModel");
// const Wallet = require("../models/walletModel");
// const Transaction = require("../models/transactionModel");

// /**
//  * Apply referral bonus for eligible actions
//  */
// const applyReferralBonus = async ({
//   buyerId,
//   action,
//   dataSizeGb = 0,
//   referenceSource,
// }) => {
//   console.log("🎁 Referral Service Triggered");
//   console.log("📌 Action:", action);
//   console.log("👤 Buyer ID:", buyerId);
//   console.log("📦 Data Size (GB):", dataSizeGb);

//   try {
//     if (action !== "data_purchase") {
//       console.log("ℹ️ Action not eligible for referral bonus");
//       return;
//     }

//     if (dataSizeGb < 1) {
//       console.log("❌ Data < 1GB — no referral bonus");
//       return;
//     }

//     const buyer = await User.findById(buyerId).populate("referredBy");

//     if (!buyer?.referredBy) {
//       console.log("ℹ️ Buyer not referred");
//       return;
//     }

//     const referrer = buyer.referredBy;

//     if (referrer.role !== "reseller" ||referrer.role !== "admin") {
//       console.log("❌ Referrer is not a reseller or an admin");
//       return;
//     }

//     const bonusAmount = Math.floor(dataSizeGb); // ₦1 per GB

//     console.log(
//       `💰 Crediting ₦${bonusAmount} referral bonus to ${referrer._id}`,
//     );

//     // 💳 Credit wallet
//     await Wallet.findOneAndUpdate(
//       { user: referrer._id },
//       {
//         $inc: {
//           balance: bonusAmount,
//           referralBonusBalance: bonusAmount,
//         },
//       },
//       { new: true, upsert: true },
//     );

//     // 👤 Track earnings
//     await User.findByIdAndUpdate(referrer._id, {
//       $inc: { referralEarnings: bonusAmount },
//     });

//     // 🧾 Record transaction
//     await Transaction.create({
//       user: referrer._id,
//       type: "referral_bonus",
//       amount: bonusAmount,
//       reference: `REF-${action.toUpperCase()}-${referenceSource}`,
//       status: "success",
//       description: `Referral bonus from ${action}`,
//       metadata: {
//         referredUser: buyerId,
//         dataSizeGb,
//       },
//     });

//     console.log("✅ Referral bonus applied successfully");
//   } catch (error) {
//     // 🚨 NEVER BLOCK MAIN FLOW
//     console.error("🔥 Referral bonus failed:", error.message);
//   }
// };

// module.exports = {
//   applyReferralBonus,
// };


const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");
const Marketer = require("../models/marketerModel");

/**
 * Apply referral bonus for eligible actions.
 *
 * Changes from original:
 *  - 🐛 CRITICAL BUG FIXED: role check used `!==` with `||`
 *       which ALWAYS evaluates to true — meaning NO referrer
 *       ever passed the check and bonus was never paid.
 * Only resellers are eligible. superadmin excluded.
 *  - ✅ marketerId added — wallet + transaction scoped to platform
 *  - ✅ Referrer must be on the same marketer platform as buyer
 *  - ✅ Bonus rate read from marketer.commission config
 *       instead of hardcoded ₦1/GB
 *  - ✅ "admin" → "superadmin" to match User model role enum
 *  - ✅ upsert: false — never silently create a phantom wallet
 *  - ✅ requestId added to transaction (required by model)
 *  - ✅ Returns result object for caller logging
 *  - ✅ action check kept but made extensible via array
 */
const applyReferralBonus = async ({
  buyerId,
  marketerId,
  action,
  dataSizeGb = 0,
  referenceSource,
}) => {
  console.log("\n=== REFERRAL BONUS START ===");
  console.log("📌 Action:", action, "| Buyer:", buyerId, "| GB:", dataSizeGb);

  try {
    /* ── 1. Only eligible actions trigger a bonus ── */
    const eligibleActions = ["data_purchase"];

    if (!eligibleActions.includes(action)) {
      console.log("ℹ️ Action not eligible for referral bonus");
      return { applied: false, reason: "Action not eligible" };
    }

    /* ── 2. Kept from your original — skip sub-1GB ── */
    if (dataSizeGb < 1) {
      console.log("❌ Data < 1GB — no referral bonus");
      return { applied: false, reason: "Data less than 1GB" };
    }

    /* ── 3. Fetch buyer with referrer ── */
    const buyer = await User.findById(buyerId).populate("referredBy");

    if (!buyer?.referredBy) {
      console.log("ℹ️ Buyer has no referrer");
      return { applied: false, reason: "No referrer" };
    }

    const referrer = buyer.referredBy;

    /* ── 4. Referrer must be on the same marketer platform ── */
    if (referrer.marketerId?.toString() !== marketerId.toString()) {
      console.log("⚠️ Referrer on a different platform — skipping");
      return { applied: false, reason: "Referrer on different platform" };
    }

    /* ── 5. Role eligibility check ──
     *
     * 🐛 YOUR ORIGINAL BUG:
     *   if (referrer.role !== "reseller" || referrer.role !== "admin")
     *
     * This condition is ALWAYS true because:
     *   - If role = "reseller" → "reseller" !== "admin" is true  → blocks
     *   - If role = "admin"    → "admin" !== "reseller" is true  → blocks
     *   - Any other role       → both sides true                 → blocks
     *
     * So no referrer ever passed this check. Bonus was never paid.
     * Fixed to a direct equality check — only resellers earn referral bonus.
     * Only resellers are eligible — superadmin excluded.
     * ── */
    if (referrer.role !== "reseller") {
      console.log("❌ Referrer role not eligible:", referrer.role);
      return { applied: false, reason: "Referrer not eligible" };
    }

    /* ── 6. Bonus rate from marketer config ──
     * Your original hardcoded ₦1/GB (Math.floor(dataSizeGb)).
     * Now reads from marketer.commission.referralPercent.
     * Falls back to 1 if not configured — backward compatible.
     * ── */
    const marketer = await Marketer.findById(marketerId).select("commission");
    const ratePerGb = marketer?.commission?.referralPercent || 1;
    const bonusAmount = Math.floor(ratePerGb * dataSizeGb);

    if (bonusAmount <= 0) {
      return { applied: false, reason: "Bonus amount is 0" };
    }

    console.log(`💰 Crediting ₦${bonusAmount} referral bonus to ${referrer._id}`);

    /* ── 7. Credit wallet (scoped to marketer) ──
     * ✅ marketerId added to query
     * ✅ upsert: false — don't create phantom wallets
     * ── */
    await Wallet.findOneAndUpdate(
      { user: referrer._id, marketerId },          // ✅ scoped
      {
        $inc: {
          balance: bonusAmount,
          referralBonusBalance: bonusAmount,
        },
      },
      { new: true, upsert: false }                 // ✅ no ghost wallets
    );

    /* ── 8. Track earnings on User doc ── */
    const updatedReferrer = await User.findByIdAndUpdate(
      referrer._id,
      { $inc: { referralEarnings: bonusAmount } },
      { new: true }
    );

    /* ── 9. Record transaction ── */
    const ts = Date.now();
    const suffix = referrer._id.toString().slice(-6).toUpperCase();

    await Transaction.create({
      user: referrer._id,
      marketerId,                                   // ✅ scoped
      type: "referral_bonus",
      amount: bonusAmount,
      providerPrice: 0,
      sellingPrice: bonusAmount,
      marketerProfit: 0,
      platformProfit: 0,
      profit: 0,
      reference: `REF_${action.toUpperCase()}_${referenceSource}`,
      requestId: `REQID_REF_${ts}_${suffix}`,       // ✅ required by Transaction model
      status: "success",
      description: `Referral bonus: ${dataSizeGb}GB ${action} by ${buyer.username}`,
    });

    console.log("✅ Referral bonus applied:", bonusAmount);
    console.log("=== REFERRAL BONUS END ===\n");

    // ✅ Return result for caller logging
    return {
      applied: true,
      bonusAmount,
      referralEarnings: updatedReferrer.referralEarnings,
    };
  } catch (error) {
    // Never block the main VTU flow
    console.error("🔥 applyReferralBonus error:", error.message);
    return { applied: false, reason: error.message };
  }
};

module.exports = { applyReferralBonus };
