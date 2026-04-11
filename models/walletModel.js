// const mongoose = require("mongoose");

// const WalletSchema = new mongoose.Schema(
//   {
//     user: {
//       type: mongoose.Schema.ObjectId,
//       ref: "User",
//       required: true,
//       unique: true,
//     },
//     balance: {
//       type: Number,
//       default: 0,
//       min: 0,
//     },
//     totalFunded: {
//       type: Number,
//       default: 0,
//     },
//     totalSpent: {
//       type: Number,
//       default: 0,
//     },
//     referralBonusBalance: {
//       type: Number,
//       default: 0,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// const Wallet = mongoose.model("Wallet", WalletSchema);
// module.exports = Wallet;

const mongoose = require("mongoose");

const WalletSchema = new mongoose.Schema(
  {
    /* ─────────────────────────────
     * OWNERSHIP
     *
     * ✅ marketerId added —
     * same user can have a separate
     * wallet on each marketer platform.
     *
     * The unique constraint moves to
     * the compound index below, NOT
     * on user alone.
     * ───────────────────────────── */
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
      index: true,
      // ❌ removed unique: true here — was preventing
      // the same user from existing on two platforms
    },

    marketerId: {
      type: mongoose.Schema.ObjectId,
      ref: "Marketer",
      required: true,
      index: true,
    },

    /* ─────────────────────────────
     * BALANCES
     * ───────────────────────────── */
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Lifetime total funded via Paystack
    totalFunded: {
      type: Number,
      default: 0,
    },

    // Lifetime total spent on VTU services
    totalSpent: {
      type: Number,
      default: 0,
    },

    // Referral bonus sub-balance (tracked separately for reporting)
    referralBonusBalance: {
      type: Number,
      default: 0,
    },

    virtualAccounts: [
      {
        bankName: { type: String },
        accountNumber: { type: String },
        accountName: { type: String },
        reservedAccountId: { type: String },
      },
    ],

    /* ─────────────────────────────
     * STATUS
     *
     * Frozen wallets cannot be
     * debited — useful for flagging
     * suspicious accounts without
     * deleting transaction history.
     * ───────────────────────────── */
    status: {
      type: String,
      enum: ["active", "frozen"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

/* ─────────────────────────────────────────────────────────────
 * COMPOUND UNIQUE INDEX
 *
 * One wallet per user per marketer platform.
 * Replaces the single-field unique: true on user.
 * ───────────────────────────────────────────────────────────── */
WalletSchema.index({ user: 1, marketerId: 1 }, { unique: true });

/* ─────────────────────────────────────────────────────────────
 * METHODS
 * ───────────────────────────────────────────────────────────── */

/**
 * Returns true only if wallet is active AND has enough balance.
 * Use before any deduction instead of checking both separately.
 */
WalletSchema.methods.hasSufficientBalance = function (amount) {
  return this.status === "active" && this.balance >= amount;
};

const Wallet = mongoose.model("Wallet", WalletSchema);
module.exports = Wallet;
