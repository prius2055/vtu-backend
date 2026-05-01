const User = require("../models/userModel");

const verifyTransactionPin = async (req, res, next) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({
        status: "fail",
        message: "Transaction PIN is required.",
      });
    }

    const userId = req.user._id;

    const user = await User.findById(userId).select(
      "+transactionPin pinAttempts pinLockedUntil pinIsSet",
    );

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found.",
      });
    }

    // ❌ PIN not set
    if (!user.pinIsSet) {
      return res.status(400).json({
        status: "fail",
        message: "Please set your transaction PIN.",
      });
    }

    // 🔒 Locked
    if (user.pinLockedUntil && user.pinLockedUntil > Date.now()) {
      return res.status(403).json({
        status: "fail",
        message: "Too many failed transaction PIN attempts. Try again later.",
      });
    }

    // 🔐 Validate PIN
    const isValidPin = await user.correctPin(pin);

    if (!isValidPin) {
      user.pinAttempts += 1;

      if (user.pinAttempts >= 3) {
        user.pinLockedUntil = Date.now() + 15 * 60 * 1000; // 15 mins
      }

      await user.save();

      return res.status(400).json({
        status: "fail",
        message: "Invalid transaction PIN.",
      });
    }

    // ✅ Reset attempts
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    // 🔥 attach user (optional optimization)
    req.userWithPin = user;

    next();
  } catch (error) {
    console.error("verifyTransactionPin error:", error.message);
    return res.status(500).json({
      status: "fail",
      message: "Transaction PIN verification failed.",
    });
  }
};

module.exports = verifyTransactionPin;
