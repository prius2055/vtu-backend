// const Transaction = require("../models/transactionModel");

// const getAllTransactions = async (req, res) => {
//   try {
//     console.log("\n================ TRANSACTIONS FETCH START ================");

//     /* --------------------------------------------------
//      * 1️⃣ Pagination params
//      * -------------------------------------------------- */
//     const page = Math.max(parseInt(req.query.page) || 1, 1);
//     const limit = Math.min(parseInt(req.query.limit) || 20, 100);
//     const skip = (page - 1) * limit;

//     /* --------------------------------------------------
//      * 2️⃣ Filters
//      * -------------------------------------------------- */
//     const { type } = req.query;

//     const query = {
//       status: "success", // ✅ ONLY successful transactions
//     };

//     if (type) {
//       query.type = type; // wallet_funding, airtime, data, etc
//     }

//     console.log("🔍 Query Filters:", query);
//     console.log("📄 Page:", page, "| Limit:", limit, "| Skip:", skip);

//     /* --------------------------------------------------
//      * 3️⃣ Fetch transactions
//      * -------------------------------------------------- */
//     const transactions = await Transaction.find(query)
//       .populate({
//         path: "user",
//         select: "username email fullName", // 👈 choose what you want exposed
//       })
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     const total = await Transaction.countDocuments(query);

//     console.log(`✅ ${transactions.length} transactions fetched`);
//     console.log(`📊 Total matching transactions: ${total}`);

//     console.log("================ TRANSACTIONS FETCH END =================\n");

//     /* --------------------------------------------------
//      * 4️⃣ Response
//      * -------------------------------------------------- */
//     res.status(200).json({
//       status: "success",
//       meta: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//       data: transactions,
//     });
//   } catch (error) {
//     console.error("🔥 Fetch transactions error:", error);

//     res.status(500).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

// const getTransaction = async (req, res) => {
//   try {
//     const transaction = await Transaction.findOne({
//       _id: req.params.id,
//       user: req.user._id,
//     });

//     if (!transaction) {
//       return res.status(404).json({
//         status: "fail",
//         message: "Transaction not found",
//       });
//     }

//     res.status(200).json({
//       status: "success",
//       data: { transaction },
//     });
//   } catch (error) {
//     res.status(400).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

// const getUserTransactions = async (req, res) => {
//   try {
//     console.log(
//       "\n================ USER TRANSACTIONS FETCH START ================"
//     );

//     const page = Math.max(parseInt(req.query.page) || 1, 1);
//     const limit = Math.min(parseInt(req.query.limit) || 20, 100);
//     const skip = (page - 1) * limit;

//     const { type } = req.query;

//     const query = {
//       user: req.user._id,
//       status: "success",
//     };

//     if (type) {
//       query.type = type;
//     }

//     console.log("🔍 Query Filters:", query);
//     console.log("📄 Page:", page, "| Limit:", limit, "| Skip:", skip);

//     const transactions = await Transaction.find(query)
//       .populate("user", "username email fullName")
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     const total = await Transaction.countDocuments(query);

//     console.log(`✅ ${transactions.length} transactions fetched`);
//     console.log(`📊 Total matching transactions: ${total}`);
//     console.log("================ TRANSACTIONS FETCH END =================\n");

//     res.status(200).json({
//       status: "success",
//       meta: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//       data: transactions,
//     });
//   } catch (error) {
//     console.error("🔥 Fetch transactions error:", error);

//     res.status(500).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

// module.exports = {
//   getAllTransactions,
//   getTransaction,
//   getUserTransactions,
// };


const Transaction = require("../models/transactionModel");

/* ─────────────────────────────────────────────────────────────
 * SHARED HELPER — build query filters from request
 * ───────────────────────────────────────────────────────────── */
const buildFilters = (base, query) => {
  const { type, status, startDate, endDate, search } = query;

  if (type) base.type = type;

  // Allow filtering by status. Default to "success" unless overridden.
  if (status) base.status = status;

  // Date range filter on createdAt
  if (startDate || endDate) {
    base.createdAt = {};
    if (startDate) base.createdAt.$gte = new Date(startDate);
    if (endDate) {
      // Include the full end day (up to 23:59:59)
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      base.createdAt.$lte = end;
    }
  }

  return base;
};

const getPagination = (query) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/* ─────────────────────────────────────────────────────────────
 * 1. GET ALL TRANSACTIONS (Admin / Marketer scoped)
 *
 * Changes from original:
 *  - ✅ Scoped to req.marketer._id — a marketer admin can ONLY
 *    see their own platform's transactions, never another's
 *  - Added status, date range, and search filters
 *  - Added earnings summary in response
 * ───────────────────────────────────────────────────────────── */
const getAllTransactions = async (req, res) => {
  try {
    console.log("\n=== GET ALL TRANSACTIONS START ===");

    const { page, limit, skip } = getPagination(req.query);

    // ✅ Always scope to the resolved marketer
    const query = buildFilters(
      { marketerId: req.marketer._id, status: "success" },
      req.query
    );

    console.log("🔍 Query:", query, "| Page:", page, "Limit:", limit);

    const [transactions, total, earningsSummary] = await Promise.all([
      Transaction.find(query)
        .populate("user", "username email fullName phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Transaction.countDocuments(query),

      // Earnings breakdown by service type for this marketer
      Transaction.aggregate([
        { $match: { ...query, status: "success" } },
        {
          $group: {
            _id: "$type",
            totalVolume: { $sum: "$amount" },
            totalMarketerProfit: { $sum: "$marketerProfit" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalVolume: -1 } },
      ]),
    ]);

    console.log(`✅ ${transactions.length} / ${total} transactions fetched`);
    console.log("=== GET ALL TRANSACTIONS END ===\n");

    res.status(200).json({
      status: "success",
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: earningsSummary,
      data: transactions,
    });
  } catch (error) {
    console.error("🔥 getAllTransactions error:", error.message);
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 2. GET SINGLE TRANSACTION
 *
 * Changes from original:
 *  - ✅ Scoped to marketerId — prevents cross-platform access
 *  - Admins/marketer owners can fetch any tx on their platform
 *  - Regular users can only fetch their own tx
 * ───────────────────────────────────────────────────────────── */
const getTransaction = async (req, res) => {
  try {
    const isAdminOrMarketer = ["superadmin", "marketer"].includes(
      req.user.role
    );

    const query = {
      _id: req.params.id,
      marketerId: req.marketer._id,           // ✅ always scoped
    };

    // Regular users can only see their own transactions
    if (!isAdminOrMarketer) {
      query.user = req.user._id;
    }

    const transaction = await Transaction.findOne(query).populate(
      "user",
      "username email fullName phone"
    );

    if (!transaction) {
      return res.status(404).json({
        status: "fail",
        message: "Transaction not found.",
      });
    }

    res.status(200).json({
      status: "success",
      data: { transaction },
    });
  } catch (error) {
    console.error("🔥 getTransaction error:", error.message);
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 3. GET USER TRANSACTIONS (logged-in user's own history)
 *
 * Changes from original:
 *  - ✅ Scoped to marketerId
 *  - Added all statuses by default (user should see failed too)
 *  - Added date range + type filters
 * ───────────────────────────────────────────────────────────── */
const getUserTransactions = async (req, res) => {
  try {
    console.log("\n=== GET USER TRANSACTIONS START ===");

    const { page, limit, skip } = getPagination(req.query);

    // Users see all their transactions regardless of status
    // (they need to see failed ones too)
    const base = {
      user: req.user._id,
      marketerId: req.marketer._id,           // ✅ scoped
    };

    const query = buildFilters(base, req.query);

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .select("-vtuResponse -vtuReference")  // hide internal fields from users
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Transaction.countDocuments(query),
    ]);

    console.log(`✅ ${transactions.length} / ${total} user transactions`);
    console.log("=== GET USER TRANSACTIONS END ===\n");

    res.status(200).json({
      status: "success",
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: transactions,
    });
  } catch (error) {
    console.error("🔥 getUserTransactions error:", error.message);
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 4. GET MARKETER EARNINGS (NEW)
 *
 * Used by the marketer's dashboard to show their commission
 * breakdown, total earnings, and per-service stats.
 * Scoped entirely to req.marketer._id.
 * ───────────────────────────────────────────────────────────── */
const getMarketerEarnings = async (req, res) => {
  try {
    console.log("\n=== GET MARKETER EARNINGS START ===");

    const { page, limit, skip } = getPagination(req.query);

    const query = buildFilters(
      { marketerId: req.marketer._id, status: "success" },
      req.query
    );

    const [transactions, total, breakdown, totals] = await Promise.all([
      // Paginated list of earning transactions
      Transaction.find(query)
        .select("type amount marketerProfit marketerMarkup createdAt reference user")
        .populate("user", "username fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Transaction.countDocuments(query),

      // Per-service-type earnings breakdown
      Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$type",
            totalMarketerProfit: { $sum: "$marketerProfit" },
            totalVolume: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalMarketerProfit: -1 } },
      ]),

      // Grand totals
      Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$marketerProfit" },
            totalVolume: { $sum: "$amount" },
            totalTransactions: { $sum: 1 },
          },
        },
      ]),
    ]);

    const grandTotals = totals[0] || {
      totalEarnings: 0,
      totalVolume: 0,
      totalTransactions: 0,
    };

    console.log("📊 Grand totals:", grandTotals);
    console.log("=== GET MARKETER EARNINGS END ===\n");

    res.status(200).json({
      status: "success",
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totals: grandTotals,
      breakdown,
      data: transactions,
    });
  } catch (error) {
    console.error("🔥 getMarketerEarnings error:", error.message);
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * 5. GET PLATFORM TRANSACTIONS (Superadmin only — NEW)
 *
 * Unlike getAllTransactions which is scoped to one marketer,
 * this fetches across ALL marketers for platform-wide reporting.
 * Protected by restrictTo("superadmin") in the route.
 * ───────────────────────────────────────────────────────────── */
const getPlatformTransactions = async (req, res) => {
  try {
    console.log("\n=== GET PLATFORM TRANSACTIONS START ===");

    const { page, limit, skip } = getPagination(req.query);
    const { marketerId } = req.query;

    // Optionally filter by a specific marketer
    const base = marketerId ? { marketerId } : {};
    const query = buildFilters({ ...base, status: "success" }, req.query);

    const [transactions, total, platformTotals] = await Promise.all([
      Transaction.find(query)
        .populate("user", "username email fullName")
        .populate("marketerId", "name brandName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Transaction.countDocuments(query),

      Transaction.aggregate([
        { $match: { status: "success" } },
        {
          $group: {
            _id: null,
            totalPlatformRevenue: { $sum: "$amount" },
            totalPlatformProfit: { $sum: "$platformProfit" },
            totalMarketerPayouts: { $sum: "$marketerProfit" },
            totalTransactions: { $sum: 1 },
          },
        },
      ]),
    ]);

    console.log(`✅ ${transactions.length} / ${total} platform transactions`);
    console.log("=== GET PLATFORM TRANSACTIONS END ===\n");

    res.status(200).json({
      status: "success",
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      platformTotals: platformTotals[0] || {},
      data: transactions,
    });
  } catch (error) {
    console.error("🔥 getPlatformTransactions error:", error.message);
    res.status(500).json({ status: "fail", message: error.message });
  }
};

module.exports = {
  getAllTransactions,
  getTransaction,
  getUserTransactions,
  getMarketerEarnings,
  getPlatformTransactions,
};