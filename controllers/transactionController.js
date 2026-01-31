const Transaction = require("../models/transactionModel");

const getAllTransactions = async (req, res) => {
  try {
    console.log("\n================ TRANSACTIONS FETCH START ================");

    /* --------------------------------------------------
     * 1️⃣ Pagination params
     * -------------------------------------------------- */
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    /* --------------------------------------------------
     * 2️⃣ Filters
     * -------------------------------------------------- */
    const { type } = req.query;

    const query = {
      status: "success", // ✅ ONLY successful transactions
    };

    if (type) {
      query.type = type; // wallet_funding, airtime, data, etc
    }

    console.log("🔍 Query Filters:", query);
    console.log("📄 Page:", page, "| Limit:", limit, "| Skip:", skip);

    /* --------------------------------------------------
     * 3️⃣ Fetch transactions
     * -------------------------------------------------- */
    const transactions = await Transaction.find(query)
      .populate({
        path: "user",
        select: "username email fullName", // 👈 choose what you want exposed
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Transaction.countDocuments(query);

    console.log(`✅ ${transactions.length} transactions fetched`);
    console.log(`📊 Total matching transactions: ${total}`);

    console.log("================ TRANSACTIONS FETCH END =================\n");

    /* --------------------------------------------------
     * 4️⃣ Response
     * -------------------------------------------------- */
    res.status(200).json({
      status: "success",
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: transactions,
    });
  } catch (error) {
    console.error("🔥 Fetch transactions error:", error);

    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

const getTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({
        status: "fail",
        message: "Transaction not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: { transaction },
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

const getUserTransactions = async (req, res) => {
  try {
    console.log(
      "\n================ USER TRANSACTIONS FETCH START ================"
    );

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const { type } = req.query;

    const query = {
      user: req.user._id,
      status: "success",
    };

    if (type) {
      query.type = type;
    }

    console.log("🔍 Query Filters:", query);
    console.log("📄 Page:", page, "| Limit:", limit, "| Skip:", skip);

    const transactions = await Transaction.find(query)
      .populate("user", "username email fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Transaction.countDocuments(query);

    console.log(`✅ ${transactions.length} transactions fetched`);
    console.log(`📊 Total matching transactions: ${total}`);
    console.log("================ TRANSACTIONS FETCH END =================\n");

    res.status(200).json({
      status: "success",
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: transactions,
    });
  } catch (error) {
    console.error("🔥 Fetch transactions error:", error);

    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

module.exports = {
  getAllTransactions,
  getTransaction,
  getUserTransactions,
};
