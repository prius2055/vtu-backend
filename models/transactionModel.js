const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    /* --------------------------------------------------
     * MULTI-TENANT FIELDS
     * Both are indexed — most dashboard/earnings queries
     * filter by one or both of these.
     * -------------------------------------------------- */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    marketerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Marketer",
      required: true,
      index: true,
    },

    /* --------------------------------------------------
     * TRANSACTION TYPE
     * -------------------------------------------------- */
    type: {
      type: String,
      enum: [
        "wallet_funding",
        "airtime",
        "data",
        "meter_recharge",
        "cable_recharge",
        "referral_bonus",
        "upgrade_to_reseller",
        "commission",
        "recharge_card_printing",
      ],
      required: true,
      index: true,
    },

    /* --------------------------------------------------
     * SERVICE / PLAN
     * -------------------------------------------------- */
    servicePlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServicePlan",
    },

    /* --------------------------------------------------
     * PROVIDER DETAILS
     * -------------------------------------------------- */
    network: {
      type: String,
      enum: ["MTN", "AIRTEL", "GLO", "9MOBILE"],
      required: function () {
        return ["airtime", "data"].includes(this.type);
      },
    },

    disco: {
      type: String,
      required: function () {
        return this.type === "meter_recharge";
      },
    },

    cableName: {
      type: String,
      required: function () {
        return this.type === "cable_recharge";
      },
    },

    /* --------------------------------------------------
     * IDENTIFIERS
     * -------------------------------------------------- */
    phone: {
      type: String,
      required: function () {
        return ["airtime", "data", "meter_recharge", "cable_recharge"].includes(
          this.type,
        );
      },
    },

    meterNumber: {
      type: String,
      required: function () {
        return this.type === "meter_recharge";
      },
    },

    smartCardNumber: {
      type: String,
      required: function () {
        return this.type === "cable_recharge";
      },
    },

    /* --------------------------------------------------
     * CUSTOMER DETAILS
     * -------------------------------------------------- */
    customerName: String,
    meterAddress: String,

    meterType: {
      type: String,
      enum: ["Prepaid", "Postpaid"],
      required: function () {
        return this.type === "meter_recharge";
      },
    },

    /* --------------------------------------------------
     * PRICING BREAKDOWN
     *
     * providerPrice  — what the platform pays the VTU provider
     * platformMarkup — platform's own profit margin
     * marketerMarkup — marketer's added margin on top
     * sellingPrice   — what the user actually pays
     *                  (providerPrice + platformMarkup + marketerMarkup)
     * marketerProfit — marketer's earnings from this transaction
     *                  (same as marketerMarkup unless you split differently)
     * platformProfit — platform's earnings (platformMarkup)
     *
     * This breakdown allows:
     *  - Platform admin to see total platform revenue
     *  - Marketer dashboard to see their own earnings only
     *  - Full audit trail per transaction
     * -------------------------------------------------- */
    providerPrice: {
      type: Number,
      default: 0,
    },

    resellerPrice: {
      type: Number,
      default: 0,
    },

    sellingPrice: {
      type: Number,
      default: 0,
    },

    marketerProfit: {
      type: Number,
      default: 0,
    },

    resellerProfit: {
      type: Number,
      default: 0,
    },

    /* --------------------------------------------------
     * AMOUNT
     * The amount deducted from the user's wallet.
     * Should always equal sellingPrice for VTU transactions.
     * -------------------------------------------------- */
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    /* --------------------------------------------------
     * REFERENCES
     * -------------------------------------------------- */
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    vtuReference: String,
    vtuResponse: mongoose.Schema.Types.Mixed,

    /* --------------------------------------------------
     * STATUS
     * -------------------------------------------------- */
    status: {
      type: String,
      enum: ["pending", "success", "failed", "reversed"],
      default: "pending",
      index: true,
    },

    // Populated when status = "reversed"
    reversalReason: {
      type: String,
      default: null,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    description: String,
  },
  { timestamps: true },
);

/* ─────────────────────────────────────────────────────────────
 * COMPOUND INDEXES
 *
 * These cover the most common query patterns:
 *
 * 1. Marketer earnings dashboard:
 *    filter by marketerId + status + createdAt (date range)
 *
 * 2. User transaction history:
 *    filter by user + createdAt (most recent first)
 *
 * 3. Admin overview:
 *    filter by marketerId + type (breakdown by service)
 * ───────────────────────────────────────────────────────────── */
TransactionSchema.index({ marketerId: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ marketerId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
