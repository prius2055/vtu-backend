const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");

const applyDataCommission = async ({ buyerId, dataSizeGb, transactionId }) => {
  // ❌ No commission below 1GB
  if (!dataSizeGb || dataSizeGb < 1) {
    return { applied: false, reason: "Data less than 1GB" };
  }

  const buyer = await User.findById(buyerId).populate("referredBy");
  if (!buyer?.referredBy) {
    return { applied: false, reason: "No referrer" };
  }

  const referrer = buyer.referredBy;

  // ❌ Only reseller or admin earns commission
  if (!["reseller", "admin"].includes(referrer.role)) {
    return { applied: false, reason: "Referrer not eligible" };
  }

  const commissionAmount = Math.floor(dataSizeGb); // 1GB = ₦1

  // 💰 Update wallet
  await Wallet.findOneAndUpdate(
    { user: referrer._id },
    { $inc: { balance: commissionAmount } },
    { upsert: true },
  );

  // 📈 Update commission earnings on user
  const updatedReferrer = await User.findByIdAndUpdate(
    referrer._id,
    { $inc: { commissionEarnings: commissionAmount } },
    { new: true },
  );

  // 🧾 Record commission transaction
  await Transaction.create({
    user: referrer._id,
    type: "commission",
    amount: commissionAmount,
    status: "success",
    reference: `COMM_${Date.now()}`,
    description: `Data commission from ${buyer._id}`,
    sourceTransaction: transactionId,
  });

  console.log(
    `💸 Commission paid: ₦${commissionAmount} to ${updatedReferrer.role} (${updatedReferrer._id})`,
  );

  // ✅ Return useful info for controllers / logs
  //   return {
  //     applied: true,
  //     commissionAmount,
  //     commissionEarnings: updatedReferrer.commissionEarnings,
  //     transaction: commissionTransaction,
  //   };
};

module.exports = applyDataCommission;
