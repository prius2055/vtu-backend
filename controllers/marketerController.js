// const Marketer = require("../models/marketerModel");
// const User = require("../models/userModel");
// const Transaction = require("../models/transactionModel");
// const Wallet = require("../models/walletModel");
// const DataPlan = require("../models/dataPlanModel");
// const MarketerPricing = require("../models/marketerPriceModel");

// /* ─────────────────────────────────────────────────────────────
//  * SHARED HELPER — pagination
//  * ───────────────────────────────────────────────────────────── */
// const getPagination = (query) => {
//   const page = Math.max(parseInt(query.page) || 1, 1);
//   const limit = Math.min(parseInt(query.limit) || 20, 100);
//   const skip = (page - 1) * limit;
//   return { page, limit, skip };
// };

// /* ─────────────────────────────────────────────────────────────
//  * 1. UPDATE DATA PRICING
//  * ───────────────────────────────────────────────────────────── */

// const updateDataPlanPrice = async (req, res) => {
//   console.log("🔵 updateDataPlanPrice called");

//   try {
//     const { id } = req.params;
//     const { newSellingPrice, newResellerPrice, newStatus } = req.body;
//     const marketerId = req.marketer._id;

//     // ── Fetch global plan for validation boundaries ──
//     const plan = await DataPlan.findById(id);
//     if (!plan) {
//       return res.status(404).json({
//         status: "fail",
//         message: "Data plan not found.",
//       });
//     }

//     // ── Build update object — only include fields that were sent ──
//     const updates = {};

//     if (newSellingPrice !== undefined) {
//       const price = Number(newSellingPrice);

//       if (isNaN(price) || price < 0) {
//         return res.status(400).json({
//           status: "fail",
//           message: "Invalid selling price.",
//         });
//       }

//       if (price < plan.providerPrice) {
//         return res.status(400).json({
//           status: "fail",
//           message: `Selling price cannot be below provider cost of ₦${plan.providerPrice}.`,
//         });
//       }

//       updates.sellingPrice = price;
//     }

//     if (newResellerPrice !== undefined) {
//       const rPrice = Number(newResellerPrice);

//       if (isNaN(rPrice) || rPrice < 0) {
//         return res.status(400).json({
//           status: "fail",
//           message: "Invalid reseller price.",
//         });
//       }

//       if (rPrice < plan.providerPrice) {
//         return res.status(400).json({
//           status: "fail",
//           message: `Reseller price cannot be below provider cost of ₦${plan.providerPrice}.`,
//         });
//       }

//       // ✅ Reseller price must stay below selling price
//       const effectiveSellingPrice = updates.sellingPrice ?? plan.sellingPrice;
//       if (rPrice >= effectiveSellingPrice) {
//         return res.status(400).json({
//           status: "fail",
//           message: "Reseller price must be less than selling price.",
//         });
//       }

//       updates.resellerPrice = rPrice;
//     }

//     if (newStatus !== undefined) {
//       updates.isActive = newStatus === true || newStatus === "true";
//     }

//     if (Object.keys(updates).length === 0) {
//       return res.status(400).json({
//         status: "fail",
//         message: "No valid fields provided to update.",
//       });
//     }

//     // ✅ Upsert marketer's own pricing record
//     const marketerPricing = await MarketerPricing.findOneAndUpdate(
//       { marketerId, planId: id },
//       { $set: updates },
//       { new: true, upsert: true },
//     );

//     return res.status(200).json({
//       status: "success",
//       message: "Pricing updated successfully.",
//       data: marketerPricing,
//     });
//   } catch (error) {
//     console.error("🔥 updateDataPlanPrice ERROR:", error);
//     return res.status(500).json({
//       status: "error",
//       message: error.message,
//     });
//   }
// };

// /* ─────────────────────────────────────────────────────────────
//  * 1. DASHBOARD
//  *
//  * Overview stats for the marketer's home screen.
//  * Pulls live counts + recent transactions in one response.
//  * ───────────────────────────────────────────────────────────── */
// const getDashboard = async (req, res) => {
//   try {
//     console.log("\n=== MARKETER DASHBOARD START ===");

//     const marketerId = req.marketer._id;

//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);

//     const [
//       totalUsers,
//       activeUsers,
//       totalTransactions,
//       recentTransactions,
//       earningsByType,
//       revenueToday,
//     ] = await Promise.all([
//       User.countDocuments({ marketerId }),
//       User.countDocuments({ marketerId, status: "active" }),
//       Transaction.countDocuments({ marketerId, status: "success" }),

//       Transaction.find({ marketerId })
//         .populate("user", "fullName username")
//         .sort({ createdAt: -1 })
//         .limit(10)
//         .lean(),

//       Transaction.aggregate([
//         { $match: { marketerId, status: "success" } },
//         {
//           $group: {
//             _id: "$type",
//             totalMarketerProfit: { $sum: "$marketerProfit" },
//             totalVolume: { $sum: "$amount" },
//             count: { $sum: 1 },
//           },
//         },
//         { $sort: { totalVolume: -1 } },
//       ]),

//       Transaction.aggregate([
//         {
//           $match: {
//             marketerId,
//             status: "success",
//             createdAt: { $gte: todayStart },
//           },
//         },
//         {
//           $group: {
//             _id: null,
//             totalProfit: { $sum: "$marketerProfit" },
//             totalVolume: { $sum: "$amount" },
//             count: { $sum: 1 },
//           },
//         },
//       ]),
//     ]);

//     console.log("✅ Dashboard data fetched");
//     console.log("=== MARKETER DASHBOARD END ===\n");

//     res.status(200).json({
//       status: "success",
//       data: {
//         marketer: {
//           name: req.marketer.name,
//           brandName: req.marketer.brandName,
//           logo: req.marketer.logo,
//           domains: req.marketer.domains,
//           status: req.marketer.status,
//           wallet: req.marketer.wallet,
//           pricing: req.marketer.pricing,
//           settings: req.marketer.settings,
//         },
//         stats: {
//           // ── Users ──
//           totalUsers,
//           activeUsers,
//           suspendedUsers: totalUsers - activeUsers,

//           // ── Transactions ──
//           totalTransactions,
//           transactionsToday: revenueToday[0]?.count ?? 0,

//           // ── Wallet — read directly from Marketer document ──
//           balance: req.marketer.wallet.balance,
//           totalProfit: req.marketer.wallet.totalProfit,
//           totalRevenue: req.marketer.wallet.totalRevenue,
//           totalWithdrawn: req.marketer.wallet.totalWithdrawn,

//           // ── Today ──
//           revenueToday: revenueToday[0]?.totalProfit ?? 0,
//           volumeToday: revenueToday[0]?.totalVolume ?? 0,
//         },
//         earningsByType,
//         recentTransactions,
//       },
//     });
//   } catch (err) {
//     console.error("🔥 getDashboard error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────
//  * 2. GET ALL USERS
//  *
//  * Paginated list of all users under this marketer.
//  * Supports search by name, email, or phone.
//  * ───────────────────────────────────────────────────────────── */
// const getUsers = async (req, res) => {
//   try {
//     const { page, limit, skip } = getPagination(req.query);
//     const { search, status, role } = req.query;
//     const marketerId = req.marketer._id;

//     const query = { marketerId };

//     if (status) query.status = status;
//     if (role) query.role = role;

//     if (search) {
//       query.$or = [
//         { fullName: { $regex: search, $options: "i" } },
//         { email: { $regex: search, $options: "i" } },
//         { username: { $regex: search, $options: "i" } },
//         { phone: { $regex: search, $options: "i" } },
//       ];
//     }

//     const [users, total] = await Promise.all([
//       User.find(query)
//         .select("-password -passwordResetToken -passwordResetExpires -__v")
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit)
//         .lean(),

//       User.countDocuments(query),
//     ]);

//     res.status(200).json({
//       status: "success",
//       meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
//       data: users,
//     });
//   } catch (err) {
//     console.error("🔥 getUsers error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────
//  * 3. GET SINGLE USER
//  *
//  * Full profile + wallet + recent transactions for one user.
//  * Marketer can only fetch users that belong to their platform.
//  * ───────────────────────────────────────────────────────────── */
// const getUser = async (req, res) => {
//   try {
//     const user = await User.findOne({
//       _id: req.params.userId,
//       marketerId: req.marketer._id, // ✅ ownership enforced
//     }).select("-password -passwordResetToken -passwordResetExpires -__v");

//     if (!user) {
//       return res.status(404).json({
//         status: "fail",
//         message: "User not found on this platform.",
//       });
//     }

//     // Fetch wallet and recent transactions in parallel
//     const [wallet, recentTransactions] = await Promise.all([
//       Wallet.findOne({
//         user: user._id,
//         marketerId: req.marketer._id,
//       }).lean(),

//       Transaction.find({
//         user: user._id,
//         marketerId: req.marketer._id,
//       })
//         .sort({ createdAt: -1 })
//         .limit(20)
//         .lean(),
//     ]);

//     res.status(200).json({
//       status: "success",
//       data: { user, wallet, recentTransactions },
//     });
//   } catch (err) {
//     console.error("🔥 getUser error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────
//  * 4. SUSPEND / REACTIVATE USER
//  *
//  * Toggles a user's status between "active" and "suspended".
//  * Only affects users on this marketer's platform.
//  * ───────────────────────────────────────────────────────────── */
// const updateUserStatus = async (req, res) => {
//   try {
//     const { status } = req.body;

//     if (!["active", "suspended"].includes(status)) {
//       return res.status(400).json({
//         status: "fail",
//         message: "Status must be 'active' or 'suspended'.",
//       });
//     }

//     const user = await User.findOneAndUpdate(
//       {
//         _id: req.params.userId,
//         marketerId: req.marketer._id, // ✅ ownership enforced
//         role: { $nin: ["superadmin"] }, // can't suspend a superadmin
//       },
//       { status },
//       { new: true, select: "-password -__v" },
//     );

//     if (!user) {
//       return res.status(404).json({
//         status: "fail",
//         message: "User not found on this platform.",
//       });
//     }

//     res.status(200).json({
//       status: "success",
//       message: `User ${status === "suspended" ? "suspended" : "reactivated"} successfully.`,
//       data: { user },
//     });
//   } catch (err) {
//     console.error("🔥 updateUserStatus error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────
//  * 6. UPDATE SETTINGS
//  *
//  * Controls platform behaviour:
//  * allowRegistration, allowWalletFunding,
//  * allowWithdrawals, maintenanceMode
//  * ───────────────────────────────────────────────────────────── */
// const updateSettings = async (req, res) => {
//   try {
//     const {
//       allowRegistration,
//       allowWalletFunding,
//       allowWithdrawals,
//       maintenanceMode,
//     } = req.body;

//     const settingsUpdate = {};
//     if (allowRegistration !== undefined)
//       settingsUpdate["settings.allowRegistration"] = Boolean(allowRegistration);
//     if (allowWalletFunding !== undefined)
//       settingsUpdate["settings.allowWalletFunding"] =
//         Boolean(allowWalletFunding);
//     if (allowWithdrawals !== undefined)
//       settingsUpdate["settings.allowWithdrawals"] = Boolean(allowWithdrawals);
//     if (maintenanceMode !== undefined)
//       settingsUpdate["settings.maintenanceMode"] = Boolean(maintenanceMode);

//     if (Object.keys(settingsUpdate).length === 0) {
//       return res.status(400).json({
//         status: "fail",
//         message: "No valid settings fields provided.",
//       });
//     }

//     const marketer = await Marketer.findByIdAndUpdate(
//       req.marketer._id,
//       { $set: settingsUpdate },
//       { new: true, select: "settings" },
//     );

//     res.status(200).json({
//       status: "success",
//       message: "Settings updated successfully.",
//       data: { settings: marketer.settings },
//     });
//   } catch (err) {
//     console.error("🔥 updateSettings error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────
//  * 7. UPDATE PROFILE / BRANDING
//  *
//  * Updates public-facing identity:
//  * brandName, logo, phone, domains[]
//  * ───────────────────────────────────────────────────────────── */
// const updateProfile = async (req, res) => {
//   try {
//     const { brandName, logo, phone, domains } = req.body;

//     const profileUpdate = {};
//     if (brandName !== undefined) profileUpdate.brandName = brandName.trim();
//     if (logo !== undefined) profileUpdate.logo = logo;
//     if (phone !== undefined) profileUpdate.phone = phone;

//     // domains is an array — validate and replace entirely if provided
//     if (domains !== undefined) {
//       if (!Array.isArray(domains)) {
//         return res.status(400).json({
//           status: "fail",
//           message: "domains must be an array of strings.",
//         });
//       }
//       profileUpdate.domains = domains.map((d) => d.toLowerCase().trim());
//     }

//     if (Object.keys(profileUpdate).length === 0) {
//       return res.status(400).json({
//         status: "fail",
//         message: "No valid profile fields provided.",
//       });
//     }

//     const marketer = await Marketer.findByIdAndUpdate(
//       req.marketer._id,
//       { $set: profileUpdate },
//       { new: true, select: "name brandName logo phone domains" },
//     );

//     res.status(200).json({
//       status: "success",
//       message: "Profile updated successfully.",
//       data: { marketer },
//     });
//   } catch (err) {
//     console.error("🔥 updateProfile error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────
//  * 8. GET WALLET
//  *
//  * Returns the marketer's own wallet — balance, totalRevenue,
//  * totalProfit, totalWithdrawn.
//  * ───────────────────────────────────────────────────────────── */
// const getWallet = async (req, res) => {
//   try {
//     const marketer = await Marketer.findById(req.marketer._id).select("wallet");

//     res.status(200).json({
//       status: "success",
//       data: { wallet: marketer.wallet },
//     });
//   } catch (err) {
//     console.error("🔥 getWallet error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

// module.exports = {
//   getDashboard,
//   getUsers,
//   getUser,
//   updateUserStatus,
//   updateDataPlanPrice,
//   updateSettings,
//   updateProfile,
//   getWallet,
// };

const Marketer = require("../models/marketerModel");
const User = require("../models/userModel");
const Transaction = require("../models/transactionModel");
const Wallet = require("../models/walletModel");
const DataPlan = require("../models/dataPlanModel");
const MarketerPricing = require("../models/marketerPriceModel");
const axios = require("axios");
const crypto = require("crypto");

/* ─────────────────────────────────────────────────────────────
 * SHARED HELPER — pagination
 * ───────────────────────────────────────────────────────────── */
const getPagination = (query) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/* ─────────────────────────────────────────────────────────────
 * 1. DASHBOARD
 * ───────────────────────────────────────────────────────────── */
// const getDashboard = async (req, res) => {
//   try {
//     console.log("\n=== MARKETER DASHBOARD START ===");

//     const marketerId = req.marketer._id;

//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);

//     const [
//       totalUsers,
//       activeUsers,
//       totalTransactions,
//       recentTransactions,
//       earningsByType,
//       revenueToday,
//     ] = await Promise.all([
//       User.countDocuments({ marketerId }),
//       User.countDocuments({ marketerId, status: "active" }),
//       Transaction.countDocuments({ marketerId, status: "success" }),

//       Transaction.find({ marketerId })
//         .populate("user", "fullName username")
//         .sort({ createdAt: -1 })
//         .limit(10)
//         .lean(),

//       Transaction.aggregate([
//         { $match: { marketerId, status: "success" } },
//         {
//           $group: {
//             _id: "$type",
//             totalMarketerProfit: { $sum: "$marketerProfit" },
//             totalVolume: { $sum: "$amount" },
//             count: { $sum: 1 },
//           },
//         },
//         { $sort: { totalVolume: -1 } },
//       ]),

//       Transaction.aggregate([
//         {
//           $match: {
//             marketerId,
//             status: "success",
//             createdAt: { $gte: todayStart },
//           },
//         },
//         {
//           $group: {
//             _id: null,
//             totalProfit: { $sum: "$marketerProfit" },
//             totalVolume: { $sum: "$amount" },
//             count: { $sum: 1 },
//           },
//         },
//       ]),
//     ]);

//     console.log("✅ Dashboard data fetched");
//     console.log("=== MARKETER DASHBOARD END ===\n");

//     res.status(200).json({
//       status: "success",
//       data: {
//         marketer: {
//           name: req.marketer.name,
//           brandName: req.marketer.brandName,
//           logo: req.marketer.logo,
//           domains: req.marketer.domains,
//           status: req.marketer.status,
//           wallet: req.marketer.wallet,
//           pricing: req.marketer.pricing,
//           settings: req.marketer.settings,
//         },
//         stats: {
//           // ── Users ──
//           totalUsers,
//           activeUsers,
//           suspendedUsers: totalUsers - activeUsers,

//           // ── Transactions ──
//           totalTransactions,
//           transactionsToday: revenueToday[0]?.count ?? 0,

//           // ── Wallet — read directly from Marketer document ──
//           balance: req.marketer.wallet.balance,
//           profitBalance: req.marketer.wallet.profitBalance,
//           totalProfit: req.marketer.wallet.totalProfit,
//           totalRevenue: req.marketer.wallet.totalRevenue,
//           totalWithdrawn: req.marketer.wallet.totalWithdrawn,

//           // ── Today ──
//           revenueToday: revenueToday[0]?.totalProfit ?? 0,
//           volumeToday: revenueToday[0]?.totalVolume ?? 0,
//         },
//         earningsByType,
//         recentTransactions,
//       },
//     });
//   } catch (err) {
//     console.error("🔥 getDashboard error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

const getDashboard = async (req, res) => {
  try {
    console.log("\n=== MARKETER DASHBOARD START ===");

    const marketerId = req.marketer._id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeUsers,
      totalTransactions,
      recentTransactions,
      earningsByType,
      revenueToday,
      freshMarketer, // ✅ include here
    ] = await Promise.all([
      User.countDocuments({ marketerId }),
      User.countDocuments({ marketerId, status: "active" }),
      Transaction.countDocuments({ marketerId, status: "success" }),

      Transaction.find({ marketerId })
        .populate("user", "fullName username")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Transaction.aggregate([
        { $match: { marketerId, status: "success" } },
        {
          $group: {
            _id: "$type",
            totalMarketerProfit: { $sum: "$marketerProfit" },
            totalVolume: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalVolume: -1 } },
      ]),

      Transaction.aggregate([
        {
          $match: {
            marketerId,
            status: "success",
            createdAt: { $gte: todayStart },
          },
        },
        {
          $group: {
            _id: null,
            totalProfit: { $sum: "$marketerProfit" },
            totalVolume: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),

      // ✅ fetch fresh marketer WITH wallet + stats
      Marketer.findById(marketerId).lean(),
    ]);

    console.log("✅ Dashboard data fetched");
    console.log("=== MARKETER DASHBOARD END ===\n");

    const {
      fundingBalance,
      profitBalance,
      totalBalance,
      totalProfit,
      totalWithdrawn,
    } = freshMarketer.wallet;

    res.status(200).json({
      status: "success",
      data: {
        marketer: {
          name: freshMarketer.name,
          brandName: freshMarketer.brandName,
          logo: freshMarketer.logo,
          domains: freshMarketer.domains,
          status: freshMarketer.status,
          pricing: freshMarketer.pricing,
          settings: freshMarketer.settings,
        },
        stats: {
          // ── Users ──
          totalUsers,
          activeUsers,
          suspendedUsers: totalUsers - activeUsers,

          // ── Transactions ──
          totalTransactions,
          transactionsToday: revenueToday[0]?.count ?? 0,

          // ── Wallet ──
          fundingBalance,
          profitBalance,
          totalBalance,
          totalProfit,
          totalWithdrawn,

          // ── Today ──
          profitToday: revenueToday[0]?.totalProfit ?? 0,
          volumeToday: revenueToday[0]?.totalVolume ?? 0,

          // ✅ ALWAYS from fresh doc
          totalVolume: freshMarketer.stats.totalVolume,
        },
        earningsByType,
        recentTransactions,
      },
    });
  } catch (err) {
    console.error("🔥 getDashboard error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};
/* ─────────────────────────────────────────────────────────────
 * 2. FUND WALLET
 *
 * Marketer funds their operating wallet via Paystack.
 * Funded amount goes into wallet.balance (operating capital).
 * It is NOT withdrawable — it is used to service user purchases.
 *
 * Flow:
 *  1. Marketer initiates payment → Paystack checkout
 *  2. Paystack redirects to callback URL
 *  3. verifyMarketerFunding verifies + credits wallet.balance
 * ───────────────────────────────────────────────────────────── */
const fundWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    const marketer = req.marketer;

    if (!amount || Number(amount) < 100) {
      return res.status(400).json({
        status: "fail",
        message: "Minimum funding amount is ₦100.",
      });
    }

    const amountInKobo = Number(amount) * 100;

    // Use marketer owner's email for Paystack
    const marketerUser = await User.findById(marketer.marketerDetail).select(
      "email fullName",
    );
    if (!marketerUser) {
      return res.status(404).json({
        status: "fail",
        message: "Marketer account not found.",
      });
    }

    const isDev = process.env.NODE_ENV === "development";
    const marketerDomain = marketer.domains?.[0];
    const callbackUrl = marketerDomain
      ? isDev
        ? `http://${marketerDomain}:3000/marketer`
        : `https://${marketerDomain}/marketer`
      : process.env.PAYSTACK_CALLBACK_URL;

    const paystackRes = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: marketerUser.email,
        amount: amountInKobo,
        callback_url: callbackUrl,
        metadata: {
          type: "marketer_wallet_funding",
          marketerId: marketer._id.toString(),
          marketerUserId: marketerUser._id.toString(),
          amount: Number(amount),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const { authorization_url, reference } = paystackRes.data.data;

    console.log(
      `💳 Marketer wallet funding initiated: ₦${amount} — ref: ${reference}`,
    );

    res.status(200).json({
      status: "success",
      message: "Payment initialized.",
      data: { authorization_url, reference },
    });
  } catch (err) {
    console.error("🔥 fundWallet error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 3. VERIFY WALLET FUNDING
 *
 * Called after Paystack redirects back.
 * Verifies payment and credits wallet.balance (operating capital).
 * Does NOT credit profitBalance — funded amount is not withdrawable.
 * ───────────────────────────────────────────────────────────── */
const verifyMarketerFunding = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({
        status: "fail",
        message: "Payment reference is required.",
      });
    }

    // ── Verify with Paystack ──
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const paymentData = paystackRes.data.data;

    if (paymentData.status !== "success") {
      return res.status(400).json({
        status: "fail",
        message: "Payment was not successful.",
      });
    }

    const { marketerId, amount } = paymentData.metadata;

    // ── Idempotency — prevent double credit ──
    const existing = await Transaction.findOne({ reference });
    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "Payment already processed.",
        data: { alreadyProcessed: true },
      });
    }

    // ── Fetch marketer document (needed for model methods) ──
    const marketer = await Marketer.findById(marketerId);
    if (!marketer) {
      return res.status(404).json({
        status: "fail",
        message: "Marketer not found.",
      });
    }

    const fundAmount = Number(amount);

    // ── Credit fundingBalance via model method ──
    // creditFunding increments fundingBalance and keeps
    // totalBalance = fundingBalance + profitBalance in sync.
    // profitBalance is NOT touched — funded money is NOT withdrawable.
    await marketer.creditFunding(fundAmount);

    // ── Record transaction for audit trail ──
    const ts = Date.now();
    await Transaction.create({
      user: marketer.marketerDetail,
      marketerId,
      type: "wallet_funding",
      amount: fundAmount,
      providerPrice: 0,
      sellingPrice: fundAmount,
      marketerProfit: 0,
      profit: 0,
      status: "success",
      reference,
      requestId: `MKFUND_${ts}_${marketerId.toString().slice(-6).toUpperCase()}`,
      description: `Marketer wallet funded ₦${fundAmount}`,
    });

    console.log(`✅ Marketer wallet funded: ₦${fundAmount} → ${marketerId}`);

    res.status(200).json({
      status: "success",
      message: `Wallet funded successfully with ₦${fundAmount.toLocaleString("en-NG")}.`,
      data: {
        fundingBalance: marketer.wallet.fundingBalance,
        profitBalance: marketer.wallet.profitBalance,
        totalBalance: marketer.wallet.totalBalance,
      },
    });
  } catch (err) {
    console.error("🔥 verifyMarketerFunding error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 4. REQUEST WITHDRAWAL
 *
 * Marketer requests withdrawal of their profit balance.
 * Only wallet.profitBalance is withdrawable — not wallet.balance.
 * Superadmin manually processes and marks as paid.
 *
 * Flow:
 *  1. Marketer submits withdrawal request with bank details
 *  2. profitBalance debited immediately (reserved)
 *  3. Superadmin sees pending withdrawal in admin panel
 *  4. Superadmin pays via bank transfer + marks as paid
 *  5. wallet.totalWithdrawn incremented on confirmation
 * ───────────────────────────────────────────────────────────── */
// const requestWithdrawal = async (req, res) => {
//   try {
//     const { amount, bankName, accountNumber, accountName } = req.body;
//     const marketer = req.marketer;

//     // ── Validate fields ──
//     if (!amount || !bankName || !accountNumber || !accountName) {
//       return res.status(400).json({
//         status: "fail",
//         message:
//           "amount, bankName, accountNumber and accountName are required.",
//       });
//     }

//     const withdrawAmount = Number(amount);

//     if (isNaN(withdrawAmount) || withdrawAmount < 100) {
//       return res.status(400).json({
//         status: "fail",
//         message: "Minimum withdrawal amount is ₦100.",
//       });
//     }

//     // ── Check profit balance — NOT operating balance ──
//     if (withdrawAmount > marketer.wallet.profitBalance) {
//       return res.status(400).json({
//         status: "fail",
//         message: `Insufficient profit balance. Available: ₦${marketer.wallet.profitBalance}.`,
//       });
//     }

//     // ── Debit profitBalance immediately (reserve funds) ──
//     const updatedMarketer = await Marketer.findByIdAndUpdate(
//       marketer._id,
//       {
//         $inc: {
//           "wallet.profitBalance": -withdrawAmount,
//           // ✅ totalWithdrawn updated only when superadmin marks as paid
//         },
//       },
//       { new: true },
//     );

//     // ── Create withdrawal transaction (pending) ──
//     const ts = Date.now();
//     const suffix = marketer._id.toString().slice(-6).toUpperCase();

//     const withdrawal = await Transaction.create({
//       user: marketer.marketerDetail,
//       marketerId: marketer._id,
//       type: "withdrawal",
//       amount: withdrawAmount,
//       providerPrice: 0,
//       sellingPrice: withdrawAmount,
//       marketerProfit: 0,
//       profit: 0,
//       status: "pending",
//       reference: `WD_${ts}_${suffix}`,
//       requestId: `REQWD_${ts}_${suffix}`,
//       description: `Withdrawal request — ${accountName} | ${bankName} | ${accountNumber}`,
//       meta: {
//         bankName,
//         accountNumber,
//         accountName,
//       },
//     });

//     console.log(
//       `💸 Withdrawal requested: ₦${withdrawAmount} by marketer ${marketer._id}`,
//     );

//     res.status(200).json({
//       status: "success",
//       message:
//         "Withdrawal request submitted. You will be paid within 24 hours.",
//       data: {
//         withdrawal,
//         profitBalance: updatedMarketer.wallet.profitBalance,
//       },
//     });
//   } catch (err) {
//     console.error("🔥 requestWithdrawal error:", err.message);
//     res.status(500).json({ status: "fail", message: err.message });
//   }
// };

/* ─────────────────────────────────────────────────────────────
 * 5. GET ALL USERS
 * ───────────────────────────────────────────────────────────── */
const getUsers = async (req, res) => {
  console.log("\n════════════════ GET USERS START ════════════════");

  try {
    /* ── Pagination ── */
    const { page, limit, skip } = getPagination(req.query);
    console.log("📄 Pagination:", { page, limit, skip });

    /* ── Filters ── */
    const { search, status, role } = req.query;
    console.log("🔍 Filters received:", {
      search: search || "none",
      status: status || "none",
      role: role || "none",
    });

    /* ── Marketer scope ── */
    const marketerId = req.marketer._id;
    console.log("🏪 Marketer ID:", marketerId);

    /* ── Build query ── */
    const query = { marketerId };

    if (status) query.status = status;
    if (role) query.role = role;

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
      console.log("🔎 Search applied:", search);
    }

    console.log("📋 Final query:", JSON.stringify(query, null, 2));

    /* ── DB query ── */
    console.log("⏳ Fetching users from DB...");

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -passwordResetToken -passwordResetExpires -__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    console.log(`✅ Found ${users.length} users (total matching: ${total})`);

    if (users.length > 0) {
      console.log(
        "👥 Sample user IDs:",
        users.slice(0, 3).map((u) => u._id),
      );
    }

    const totalPages = Math.ceil(total / limit);
    console.log("📊 Pagination meta:", { page, limit, total, totalPages });

    /* ── Response ── */
    res.status(200).json({
      status: "success",
      meta: { page, limit, total, totalPages },
      data: users,
    });

    console.log("════════════════ GET USERS END ════════════════\n");
  } catch (err) {
    console.error("🔥 getUsers error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 6. GET SINGLE USER
 * ───────────────────────────────────────────────────────────── */
const getUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      marketerId: req.marketer._id,
    }).select("-password -passwordResetToken -passwordResetExpires -__v");

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found on this platform.",
      });
    }

    const [wallet, recentTransactions] = await Promise.all([
      Wallet.findOne({ user: user._id, marketerId: req.marketer._id }).lean(),
      Transaction.find({ user: user._id, marketerId: req.marketer._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    res.status(200).json({
      status: "success",
      data: { user, wallet, recentTransactions },
    });
  } catch (err) {
    console.error("🔥 getUser error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 7. SUSPEND / REACTIVATE USER
 * ───────────────────────────────────────────────────────────── */
const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({
        status: "fail",
        message: "Status must be 'active' or 'suspended'.",
      });
    }

    const user = await User.findOneAndUpdate(
      {
        _id: req.params.userId,
        marketerId: req.marketer._id,
        role: { $nin: ["superadmin"] },
      },
      { status },
      { new: true, select: "-password -__v" },
    );

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found on this platform.",
      });
    }

    res.status(200).json({
      status: "success",
      message: `User ${status === "suspended" ? "suspended" : "reactivated"} successfully.`,
      data: { user },
    });
  } catch (err) {
    console.error("🔥 updateUserStatus error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 8. UPDATE DATA PLAN PRICING
 * ───────────────────────────────────────────────────────────── */
const updateDataPlanPrice = async (req, res) => {
  console.log("🔵 updateDataPlanPrice called");

  try {
    const { id } = req.params;
    const { newSellingPrice, newResellerPrice, newStatus } = req.body;
    const marketerId = req.marketer._id;

    const plan = await DataPlan.findById(id);
    if (!plan) {
      return res.status(404).json({
        status: "fail",
        message: "Data plan not found.",
      });
    }

    const updates = {};

    if (newSellingPrice !== undefined) {
      const price = Number(newSellingPrice);
      if (isNaN(price) || price < 0) {
        return res
          .status(400)
          .json({ status: "fail", message: "Invalid selling price." });
      }
      if (price < plan.providerPrice) {
        return res.status(400).json({
          status: "fail",
          message: `Selling price cannot be below provider cost of ₦${plan.providerPrice}.`,
        });
      }
      updates.sellingPrice = price;
    }

    if (newResellerPrice !== undefined) {
      const rPrice = Number(newResellerPrice);
      if (isNaN(rPrice) || rPrice < 0) {
        return res
          .status(400)
          .json({ status: "fail", message: "Invalid reseller price." });
      }
      if (rPrice < plan.providerPrice) {
        return res.status(400).json({
          status: "fail",
          message: `Reseller price cannot be below provider cost of ₦${plan.providerPrice}.`,
        });
      }
      const effectiveSellingPrice = updates.sellingPrice ?? plan.sellingPrice;
      if (rPrice >= effectiveSellingPrice) {
        return res.status(400).json({
          status: "fail",
          message: "Reseller price must be less than selling price.",
        });
      }
      updates.resellerPrice = rPrice;
    }

    if (newStatus !== undefined) {
      updates.isActive = newStatus === true || newStatus === "true";
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        status: "fail",
        message: "No valid fields provided to update.",
      });
    }

    const marketerPricing = await MarketerPricing.findOneAndUpdate(
      { marketerId, planId: id },
      { $set: updates },
      { new: true, upsert: true },
    );

    return res.status(200).json({
      status: "success",
      message: "Pricing updated successfully.",
      data: marketerPricing,
    });
  } catch (error) {
    console.error("🔥 updateDataPlanPrice ERROR:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 9. UPDATE SETTINGS
 * ───────────────────────────────────────────────────────────── */
const updateSettings = async (req, res) => {
  try {
    const {
      allowRegistration,
      allowWalletFunding,
      allowWithdrawals,
      maintenanceMode,
    } = req.body;

    const settingsUpdate = {};
    if (allowRegistration !== undefined)
      settingsUpdate["settings.allowRegistration"] = Boolean(allowRegistration);
    if (allowWalletFunding !== undefined)
      settingsUpdate["settings.allowWalletFunding"] =
        Boolean(allowWalletFunding);
    if (allowWithdrawals !== undefined)
      settingsUpdate["settings.allowWithdrawals"] = Boolean(allowWithdrawals);
    if (maintenanceMode !== undefined)
      settingsUpdate["settings.maintenanceMode"] = Boolean(maintenanceMode);

    if (Object.keys(settingsUpdate).length === 0) {
      return res.status(400).json({
        status: "fail",
        message: "No valid settings fields provided.",
      });
    }

    const marketer = await Marketer.findByIdAndUpdate(
      req.marketer._id,
      { $set: settingsUpdate },
      { new: true, select: "settings" },
    );

    res.status(200).json({
      status: "success",
      message: "Settings updated successfully.",
      data: { settings: marketer.settings },
    });
  } catch (err) {
    console.error("🔥 updateSettings error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 10. UPDATE PROFILE / BRANDING
 * ───────────────────────────────────────────────────────────── */
const updateProfile = async (req, res) => {
  try {
    const { brandName, logo, phone, domains } = req.body;

    const profileUpdate = {};
    if (brandName !== undefined) profileUpdate.brandName = brandName.trim();
    if (logo !== undefined) profileUpdate.logo = logo;
    if (phone !== undefined) profileUpdate.phone = phone;

    if (domains !== undefined) {
      if (!Array.isArray(domains)) {
        return res.status(400).json({
          status: "fail",
          message: "domains must be an array of strings.",
        });
      }
      profileUpdate.domains = domains.map((d) => d.toLowerCase().trim());
    }

    if (Object.keys(profileUpdate).length === 0) {
      return res.status(400).json({
        status: "fail",
        message: "No valid profile fields provided.",
      });
    }

    const marketer = await Marketer.findByIdAndUpdate(
      req.marketer._id,
      { $set: profileUpdate },
      { new: true, select: "name brandName logo phone domains" },
    );

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully.",
      data: { marketer },
    });
  } catch (err) {
    console.error("🔴 updateProfile error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 11. GET WALLET
 * ───────────────────────────────────────────────────────────── */
const getWallet = async (req, res) => {
  try {
    const marketer = await Marketer.findById(req.marketer._id).select("wallet");
    res.status(200).json({
      status: "success",
      data: { wallet: marketer.wallet },
    });
  } catch (err) {
    console.error("🔥 getWallet error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

module.exports = {
  getDashboard,
  fundWallet,
  verifyMarketerFunding,
  // requestWithdrawal,
  getUsers,
  getUser,
  updateUserStatus,
  updateDataPlanPrice,
  updateSettings,
  updateProfile,
  getWallet,
};
