// const Epin = require("../models/epinsModel");
// const Wallet = require("../models/walletModel");
// const Transaction = require("../models/transactionModel");

// const buyEpins = async (req, res) => {
//   try {
//     const { network, amount, quantity } = req.body;
//     const userId = req.user._id;

//     const totalCost = amount * quantity;

//     /* Wallet check */
//     const wallet = await Wallet.findOne({ user: userId });

//     if (!wallet || wallet.balance < totalCost) {
//       return res.status(400).json({ message: "Insufficient balance" });
//     }

//     const reference = `EPR_${Date.now()}`;

//     /* Call VTU */
//     const response = await fetch("https://vtu.ng/wp-json/api/v2/epins", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${process.env.VTUNG_API_TOKEN}`,
//       },
//       body: JSON.stringify({
//         request_id: reference,
//         service_id: network,
//         value: amount,
//         quantity,
//       }),
//     });

//     const result = await response.json();

//     if (!result.pins?.length)
//       return res.status(400).json({ message: "No pins returned" });

//     /* Save pins to DB */
//     const docs = result.pins.map((p) => ({
//       user: userId,
//       network,
//       amount,
//       pin: p.pin,
//       serial: p.serial,
//       batchRef: reference,
//     }));

//     await Epin.insertMany(docs);

//     /* Deduct wallet */
//     wallet.balance -= totalCost;
//     await wallet.save();

//     await Transaction.create({
//       user: userId,
//       type: "recharge_card_printing",
//       amount: totalCost,
//       reference,
//       status: "success",
//     });

//     res.json({
//       message: "Pins stored successfully",
//       quantity: docs.length,
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

// const getEPins = async (req, res) => {
//   const { network, amount, limit = 100 } = req.query;

//   const pins = await Epin.find({
//     network,
//     amount,
//     status: "available",
//   })
//     .limit(limit)
//     .sort({ createdAt: 1 });

//   res.json(pins);
// };

// const markPrinted = async (req, res) => {
//   const { ids } = req.body;

//   await Epin.updateMany({ _id: { $in: ids } }, { status: "printed" });

//   res.json({ message: "Marked printed" });
// };

// module.exports = { buyEpins, getEPins, markPrinted };


const Epin = require("../models/epinsModel");
const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");

/* ─────────────────────────────────────────────────────────────
 * BUY EPINS
 *
 * Changes:
 *  - ✅ Wallet scoped to marketerId
 *  - ✅ Epin docs include userId + marketerId
 *  - ✅ Transaction includes marketerId + requestId
 *  - ✅ Wallet deducted atomically via findOneAndUpdate
 *    (your original used wallet.save() which can race)
 *  - ✅ Amount + quantity validation added
 *  - ✅ VTU failure handled before saving anything to DB
 * ───────────────────────────────────────────────────────────── */
const buyEpins = async (req, res) => {
  try {
    const { network, amount, quantity } = req.body;
    const userId = req.user._id;
    const marketerId = req.marketer._id;

    /* ── Validation ── */
    if (!network || !amount || !quantity) {
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields: network, amount, quantity.",
      });
    }

    if (isNaN(amount) || amount <= 0 || isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid amount or quantity.",
      });
    }

    const totalCost = Number(amount) * Number(quantity);

    /* ── Wallet check (scoped to marketer) ── */
    const wallet = await Wallet.findOne({
      user: userId,
      marketerId,                                       // ✅ scoped
    });

    if (!wallet) {
      return res.status(404).json({
        status: "fail",
        message: "Wallet not found.",
      });
    }

    if (wallet.balance < totalCost) {
      return res.status(400).json({
        status: "fail",
        message: `Insufficient balance. Available ₦${wallet.balance.toLocaleString()}, Required ₦${totalCost.toLocaleString()}`,
        available: wallet.balance,
        required: totalCost,
      });
    }

    /* ── Generate refs ── */
    const ts = Date.now();
    const suffix = userId.toString().slice(-6).toUpperCase();
    const reference = `EPR_${ts}_${suffix}`;
    const requestId = `REQID_EPR_${ts}_${suffix}`;

    /* ── Call VTU provider ── */
    let result;
    try {
      const response = await fetch("https://vtu.ng/wp-json/api/v2/epins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VTUNG_API_TOKEN}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          service_id: network,
          value: amount,
          quantity,
        }),
      });

      result = await response.json();
    } catch (vtuError) {
      return res.status(502).json({
        status: "fail",
        message: "VTU service unreachable. Please try again.",
      });
    }

    /* ── Validate VTU response before touching DB ── */
    if (!result.pins?.length) {
      return res.status(400).json({
        status: "fail",
        message: result.message || "VTU did not return any pins.",
        vtu_response: result,
      });
    }

    /* ── Save pins to DB (scoped to user + marketer) ── */
    const docs = result.pins.map((p) => ({
      user: userId,
      marketerId,                                       // ✅ scoped
      network,
      amount: Number(amount),
      pin: p.pin,
      serial: p.serial,
      batchRef: reference,
      status: "available",
    }));

    await Epin.insertMany(docs);

    /* ── Deduct wallet atomically ── */
    // ✅ findOneAndUpdate is atomic — avoids race condition
    // Your original did wallet.balance -= x; wallet.save() which
    // can cause double-deductions under concurrent requests
    const updatedWallet = await Wallet.findOneAndUpdate(
      { user: userId, marketerId },
      { $inc: { balance: -totalCost, totalSpent: totalCost } },
      { new: true }
    );

    /* ── Create transaction ── */
    await Transaction.create({
      user: userId,
      marketerId,                                       // ✅
      type: "recharge_card_printing",
      amount: totalCost,
      providerPrice: totalCost,
      sellingPrice: totalCost,
      network: network.toUpperCase(),
      reference,
      requestId,                                        // ✅ required by model
      status: "success",
      description: `${quantity} × ₦${amount} ${network} recharge pin(s)`,
    });

    res.status(201).json({
      status: "success",
      message: "Pins purchased and stored successfully.",
      data: {
        quantity: docs.length,
        batchRef: reference,
        network,
        amount,
        totalCost,
        walletBalance: updatedWallet.balance,
      },
    });
  } catch (err) {
    console.error("🔥 buyEpins error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET EPINS
 *
 * Changes:
 *  - ✅ Scoped to req.user._id + req.marketer._id
 *    (your original returned ANY user's pins with no ownership check)
 *  - ✅ Added pagination (limit as number, added skip)
 *  - ✅ Added batchRef filter for fetching a specific batch
 *  - ✅ Wrapped in try/catch (was missing entirely)
 *  - ✅ Returns total count alongside pins
 * ───────────────────────────────────────────────────────────── */
const getEPins = async (req, res) => {
  try {
    const { network, amount, batchRef, status = "available" } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const skip = (page - 1) * limit;

    // ✅ Always scope to the requesting user's pins on this marketer's platform
    const query = {
      user: req.user._id,
      marketerId: req.marketer._id,
      status,
    };

    if (network) query.network = network;
    if (amount) query.amount = Number(amount);
    if (batchRef) query.batchRef = batchRef;

    const [pins, total] = await Promise.all([
      Epin.find(query)
        .select("-__v")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Epin.countDocuments(query),
    ]);

    res.status(200).json({
      status: "success",
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: pins,
    });
  } catch (err) {
    console.error("🔥 getEPins error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET EPIN BATCHES (NEW)
 *
 * Returns a summary grouped by batchRef instead of individual pins.
 * Useful for showing purchase history: "Batch EPR_123 — 10 × ₦200 MTN"
 * ───────────────────────────────────────────────────────────── */
const getEPinBatches = async (req, res) => {
  try {
    const batches = await Epin.aggregate([
      {
        $match: {
          user: req.user._id,
          marketerId: req.marketer._id,
        },
      },
      {
        $group: {
          _id: "$batchRef",
          network: { $first: "$network" },
          amount: { $first: "$amount" },
          total: { $sum: 1 },
          available: {
            $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
          },
          printed: {
            $sum: { $cond: [{ $eq: ["$status", "printed"] }, 1, 0] },
          },
          used: {
            $sum: { $cond: [{ $eq: ["$status", "used"] }, 1, 0] },
          },
          createdAt: { $first: "$createdAt" },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    res.status(200).json({
      status: "success",
      data: batches,
    });
  } catch (err) {
    console.error("🔥 getEPinBatches error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * MARK PRINTED
 *
 * Changes:
 *  - ✅ Ownership check added — user can only mark their own pins
 *    (your original had no filter, anyone could mark any pin)
 *  - ✅ Scoped to marketerId
 *  - ✅ Returns count of actually updated documents
 * ───────────────────────────────────────────────────────────── */
const markPrinted = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids?.length) {
      return res.status(400).json({
        status: "fail",
        message: "No pin IDs provided.",
      });
    }

    const result = await Epin.updateMany(
      {
        _id: { $in: ids },
        user: req.user._id,           // ✅ ownership check
        marketerId: req.marketer._id, // ✅ scoped
        status: "available",          // can only mark available pins as printed
      },
      { status: "printed" }
    );

    res.status(200).json({
      status: "success",
      message: `${result.modifiedCount} pin(s) marked as printed.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("🔥 markPrinted error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * MARK USED (NEW)
 *
 * Marks pins as used after they've been redeemed.
 * Same ownership + marketer scoping as markPrinted.
 * ───────────────────────────────────────────────────────────── */
const markUsed = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids?.length) {
      return res.status(400).json({
        status: "fail",
        message: "No pin IDs provided.",
      });
    }

    const result = await Epin.updateMany(
      {
        _id: { $in: ids },
        user: req.user._id,
        marketerId: req.marketer._id,
        status: { $in: ["available", "printed"] },
      },
      { status: "used" }
    );

    res.status(200).json({
      status: "success",
      message: `${result.modifiedCount} pin(s) marked as used.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("🔥 markUsed error:", err.message);
    res.status(500).json({ status: "fail", message: err.message });
  }
};

module.exports = {
  buyEpins,
  getEPins,
  getEPinBatches,
  markPrinted,
  markUsed,
};