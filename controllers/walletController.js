const Wallet = require("../models/walletModel");
const Transaction = require("../models/transactionModel");
const User = require("../models/userModel");

const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: req.user._id,
        balance: 0,
      });
    }

    res.status(200).json({
      status: "success",
      data: { wallet },
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

const initializeWalletFunding = async (req, res) => {
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid amount",
      });
    }

    const paymentData = {
      email: req.user.email,
      amount: amount * 100,
      currency: "NGN",
      // callback_url: "https://geotechtest.vercel.app/funding/verify",
      callback_url: "http://localhost:3000/funding/verify",
      metadata: {
        userId: req.user._id.toString(),
      },
    };

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentData),
      }
    );

    const data = await response.json();

    return res.status(200).json({
      status: "success",
      authorization_url: data.data.authorization_url,
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

// const verifyWalletFunding = async (req, res) => {
//   try {
//     const { reference } = req.query;

//     if (!reference) {
//       return res.status(400).json({
//         status: "fail",
//         message: "Payment reference missing",
//       });
//     }

//     const response = await fetch(
//       `https://api.paystack.co/transaction/verify/${reference}`,
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//         },
//       }
//     );

//     const result = await response.json();
//     const payment = result.data;

//     if (payment.status !== "success") {
//       return res.status(400).json({
//         status: "fail",
//         message: "Payment not successful",
//       });
//     }

//     const amount = payment.amount / 100;
//     const userId = payment.metadata.userId;
//     const user = await User.findById(userId).populate("referredBy");

//     if (!user) {
//       console.log("❌ User not found for referral check");
//     } else if (user.hasFunded) {
//       console.log("ℹ️ User has already funded before — no referral bonus");
//     } else if (!user.referrer) {
//       console.log("ℹ️ User has no referrer — skipping referral bonus");
//     } else {
//       console.log("🎉 First funding detected — crediting referrer");

//       let referrerWallet;
//       let referrerTransction;

//       // 💰 Credit referrer wallet
//       referrerWallet = await Wallet.findOneAndUpdate(
//         { user: user.referrer._id },
//         {
//           $inc: {
//             balance: BONUS_AMOUNT,
//             bonusBalance: BONUS_AMOUNT,
//           },
//         },
//         { upsert: true }
//       );

//       const BONUS_AMOUNT = 100;

//       // 🧾 Log referral bonus transaction
//       referrerTransction = await Transaction.create({
//         user: user.referrer._id,
//         type: "referral bonus",
//         amount: BONUS_AMOUNT,
//         reference: `REF-BONUS-${user._id}`,
//         status: "success",
//         metadata: {
//           referredUser: user._id,
//         },
//       });
//       console.log("✅ Referral bonus credited");
//     }

//     const referrerUser = await User.findByIdAndUpdate(userId, {
//       hasFunded: true,
//     });

//     // 🔐 CREATE TRANSACTION FIRST
//     let transaction;
//     try {
//       transaction = await Transaction.create({
//         user: userId,
//         type: "wallet_funding",
//         amount,
//         reference,
//         status: "success",
//       });
//     } catch (err) {
//       if (err.code === 11000) {
//         return res.json({
//           status: "success",
//           message: "Wallet already funded",
//         });
//       }
//       throw err;
//     }

//     // 💰 ATOMIC WALLET UPDATE
//     const wallet = await Wallet.findOneAndUpdate(
//       { user: userId },
//       {
//         $inc: {
//           balance: amount,
//           totalFunded: amount,
//         },
//       },
//       { new: true, upsert: true }
//     );

//     return res.json({
//       status: "success",
//       data: { wallet, transaction, referrerWallet, referrerTransction },
//     });
//   } catch (error) {
//     res.status(500).json({
//       status: "fail",
//       message: error.message,
//     });
//   }
// };

const verifyWalletFunding = async (req, res) => {
  console.log("🔍 VERIFY WALLET FUNDING STARTED");

  const BONUS_AMOUNT = 100;

  try {
    const { reference } = req.query;

    if (!reference) {
      console.log("❌ Missing payment reference");
      return res.status(400).json({
        status: "fail",
        message: "Payment reference missing",
      });
    }

    console.log("🔑 Verifying payment with Paystack:", reference);

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const result = await response.json();
    const payment = result.data;

    if (payment.status !== "success") {
      console.log("❌ Payment verification failed");
      return res.status(400).json({
        status: "fail",
        message: "Payment not successful",
      });
    }

    const amount = payment.amount / 100;
    const userId = payment.metadata.userId;

    console.log("✅ Payment verified:", { userId, amount });

    // 🔐 CREATE FUNDING TRANSACTION (ANTI-DUPLICATE)
    let transaction;
    try {
      transaction = await Transaction.create({
        user: userId,
        type: "wallet_funding",
        amount,
        reference,
        status: "success",
      });
      console.log("🧾 Wallet funding transaction created");
    } catch (err) {
      if (err.code === 11000) {
        console.log("⚠️ Duplicate transaction detected");
        return res.json({
          status: "success",
          message: "Wallet already funded",
        });
      }
      throw err;
    }

    // 💰 UPDATE USER WALLET
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: {
          balance: amount,
          totalFunded: amount,
        },
      },
      { new: true, upsert: true }
    );

    console.log("💰 Wallet credited:", wallet.balance);

    // 🔍 FETCH USER FOR REFERRAL CHECK
    const user = await User.findById(userId).populate("referredBy");

    let referrerWallet = null;
    let referrerTransaction = null;

    if (!user) {
      console.log("❌ User not found");
    } else if (user.hasFunded) {
      console.log("ℹ️ User already funded before — no referral bonus");
    } else if (!user.referredBy) {
      console.log("ℹ️ User has no referrer");
    } else {
      console.log("🎉 First funding — applying referral bonus");

      // 💰 CREDIT REFERRER WALLET
      referrerWallet = await Wallet.findOneAndUpdate(
        { user: user.referredBy._id },
        {
          $inc: {
            balance: BONUS_AMOUNT,
            bonusBalance: BONUS_AMOUNT,
          },
        },
        { new: true, upsert: true }
      );

      // 🧾 REFERRAL BONUS TRANSACTION
      referrerTransaction = await Transaction.create({
        user: user.referredBy._id,
        type: "referral_bonus",
        amount: BONUS_AMOUNT,
        reference: `REF-BONUS-${user._id}`,
        status: "success",
        metadata: {
          referredUser: user._id,
        },
      });

      console.log("✅ Referral bonus credited:", BONUS_AMOUNT);
    }

    // ✅ MARK USER AS FUNDED (VERY IMPORTANT)
    await User.findByIdAndUpdate(userId, { hasFunded: true });

    console.log("🏁 Wallet funding flow completed successfully");

    return res.json({
      status: "success",
      data: {
        wallet,
        transaction,
        referrerWallet,
        referrerTransaction,
      },
    });
  } catch (error) {
    console.error("🔥 VERIFY FUNDING ERROR:", error.message);
    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

module.exports = {
  getWallet,
  initializeWalletFunding,
  verifyWalletFunding,
};
