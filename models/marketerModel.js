const mongoose = require("mongoose");

const marketerSchema = new mongoose.Schema(
  {
    /* =========================
       BASIC INFO
    ========================== */
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Link to the User document that owns/manages this marketer account
    marketerDetail: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* =========================
       BRANDING
    ========================== */
    brandName: {
      type: String,
      trim: true,
    },

    logo: {
      type: String,
      default: null,
    },

    /* =========================
       DOMAIN SYSTEM
    ========================== */
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    domains: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],

    /* =========================
       PRICING (MARKUPS)
       Kept for backward compat
       but marketer now sets prices
       directly via MarketerPricing.
       These markups are a fallback.
    ========================== */
    pricing: {
      markupType: {
        type: String,
        enum: ["flat", "percentage"],
        default: "flat",
      },
      airtimeMarkup: { type: Number, default: 0 },
      dataMarkup: { type: Number, default: 0 },
      cableMarkup: { type: Number, default: 0 },
      electricityMarkup: { type: Number, default: 0 },
      epinMarkup: { type: Number, default: 0 },
    },

    /* =========================
       WALLET

       fundingBalance  — money the marketer topped up themselves.
                         Used for their own purchases at providerPrice.
                         NOT withdrawable.

       profitBalance   — money earned from platform transactions.
                         Credited automatically on every successful sale.
                         This is the ONLY withdrawable amount.

       totalBalance    — fundingBalance + profitBalance.
                         Always kept in sync — updated whenever either
                         fundingBalance or profitBalance changes.
                         Used for quick total balance display.

       totalProfit     — all-time profit earned. Never decreases.
                         Used for analytics/reporting.

       totalWithdrawn  — all-time amount successfully withdrawn.
                         Used to verify withdrawal history.
    ========================== */
    wallet: {
      fundingBalance: { type: Number, default: 0 },
      profitBalance: { type: Number, default: 0 },
      totalBalance: { type: Number, default: 0 }, // fundingBalance + profitBalance
      totalProfit: { type: Number, default: 0 }, // all-time profit (never decreases)
      totalWithdrawn: { type: Number, default: 0 }, // all-time withdrawals
    },

    /* =========================
       COMMISSIONS
    ========================== */
    commission: {
      referralPercent: { type: Number, default: 0 },
      resellerPercent: { type: Number, default: 0 },
    },

    /* =========================
       LIMITS
    ========================== */
    limits: {
      dailyTransactionLimit: { type: Number, default: 0 }, // 0 = no limit
      maxUsers: { type: Number, default: 0 }, // 0 = no limit
    },

    /* =========================
       SETTINGS
    ========================== */
    settings: {
      allowRegistration: { type: Boolean, default: true },
      allowWalletFunding: { type: Boolean, default: true },
      allowWithdrawals: { type: Boolean, default: true },
      maintenanceMode: { type: Boolean, default: false },
    },

    /* =========================
       ANALYTICS
       Denormalized counters for
       fast dashboard reads.
       Increment alongside each
       transaction — avoids slow
       count queries on dashboard.
    ========================== */
    stats: {
      totalUsers: { type: Number, default: 0 },
      totalTransactions: { type: Number, default: 0 },
      totalVolume: { type: Number, default: 0 }, // total amount processed
    },

    /* =========================
       STATUS
    ========================== */
    status: {
      type: String,
      enum: ["active", "suspended", "pending"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

/* ─────────────────────────────────────────────────────────────
 * INDEXES
 * ───────────────────────────────────────────────────────────── */
marketerSchema.index({ domains: 1 });

/* ─────────────────────────────────────────────────────────────
 * HELPER — recalculate totalBalance
 * Called internally after any wallet field changes.
 * Always keeps totalBalance = fundingBalance + profitBalance.
 * ───────────────────────────────────────────────────────────── */
marketerSchema.methods._syncTotalBalance = function () {
  this.wallet.totalBalance =
    this.wallet.fundingBalance + this.wallet.profitBalance;
};

/* ─────────────────────────────────────────────────────────────
 * METHODS
 * ───────────────────────────────────────────────────────────── */

/**
 * Calculate the final price a user pays for a service,
 * based on this marketer's markup settings.
 *
 * @param {number} basePrice   - Platform's cost/base price
 * @param {string} serviceType - 'airtime'|'data'|'cable'|'electricity'|'epin'
 * @returns {{ finalPrice: number, markupAmount: number }}
 */
marketerSchema.methods.calculatePrice = function (basePrice, serviceType) {
  const serviceMarkupMap = {
    airtime: this.pricing.airtimeMarkup,
    data: this.pricing.dataMarkup,
    cable: this.pricing.cableMarkup,
    electricity: this.pricing.electricityMarkup,
    epin: this.pricing.epinMarkup,
  };

  const markup = serviceMarkupMap[serviceType] ?? 0;
  const markupType = this.pricing.markupType;

  let markupAmount = 0;
  if (markupType === "flat") {
    markupAmount = markup;
  } else if (markupType === "percentage") {
    markupAmount = (markup / 100) * basePrice;
  }

  const finalPrice = basePrice + markupAmount;

  return {
    finalPrice: Math.round(finalPrice * 100) / 100,
    markupAmount: Math.round(markupAmount * 100) / 100,
  };
};

/**
 * Credit the marketer's profit after a successful user transaction.
 * Called by finalizeTransaction in vtuController.
 *
 * - profitBalance  ↑ by profit  (withdrawable earnings)
 * - totalBalance   ↑ by profit  (kept in sync)
 * - totalProfit    ↑ by profit  (all-time tracker, never decremented)
 * - totalVolume    ↑ by volume  (platform throughput)
 *
 * @param {number} profit  - marketerProfit from the transaction
 * @param {number} volume  - amountToCharge (what the user paid)
 */
marketerSchema.methods.creditWallet = async function (profit, volume) {
  this.wallet.profitBalance += profit;
  this.wallet.totalProfit += profit;
  this.stats.totalTransactions += 1;
  this.stats.totalVolume += volume;
  this._syncTotalBalance(); // ✅ keep totalBalance in sync
  await this.save();
};

/**
 * Credit the marketer's fundingBalance when they top up their wallet.
 * Called by the wallet funding verification controller.
 *
 * - fundingBalance ↑ by amount
 * - totalBalance   ↑ by amount (kept in sync)
 *
 * @param {number} amount - amount funded via Paystack
 */
marketerSchema.methods.creditFunding = async function (amount) {
  this.wallet.fundingBalance += amount;
  this._syncTotalBalance(); // ✅ keep totalBalance in sync
  await this.save();
};

/**
 * Debit the marketer's fundingBalance for their own purchases.
 * Called when a marketer buys data/airtime at providerPrice.
 *
 * - fundingBalance ↓ by amount
 * - totalBalance   ↓ by amount (kept in sync)
 *
 * @param {number} amount - providerPrice of the plan
 */
marketerSchema.methods.debitFunding = async function (amount) {
  if (this.wallet.fundingBalance < amount) {
    throw new Error("Insufficient funding balance.");
  }
  this.wallet.fundingBalance -= amount;
  this._syncTotalBalance(); // ✅ keep totalBalance in sync
  await this.save();
};

/**
 * Process a withdrawal from profitBalance.
 * Called by the withdrawal controller after superadmin approval.
 *
 * - profitBalance  ↓ by amount
 * - totalWithdrawn ↑ by amount (all-time tracker)
 * - totalBalance   ↓ by amount (kept in sync)
 *
 * @param {number} amount - withdrawal amount
 */
marketerSchema.methods.processWithdrawal = async function (amount) {
  if (this.wallet.profitBalance < amount) {
    throw new Error("Insufficient profit balance.");
  }
  this.wallet.profitBalance -= amount;
  this.wallet.totalWithdrawn += amount;
  this._syncTotalBalance(); // ✅ keep totalBalance in sync
  await this.save();
};

module.exports = mongoose.model("Marketer", marketerSchema);
