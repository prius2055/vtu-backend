const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../utils/tokenEncryption");

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
    ========================== */
    wallet: {
      fundingBalance: { type: Number, default: 0 },
      profitBalance: { type: Number, default: 0 },
      totalBalance: { type: Number, default: 0 },
      totalProfit: { type: Number, default: 0 },
      totalWithdrawn: { type: Number, default: 0 },
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
      dailyTransactionLimit: { type: Number, default: 0 },
      maxUsers: { type: Number, default: 0 },
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
       STATS
    ========================== */
    stats: {
      totalUsers: { type: Number, default: 0 },
      totalTransactions: { type: Number, default: 0 },
      totalVolume: { type: Number, default: 0 },
    },

    /* =========================
       API TOKENS
       All sensitive tokens stored AES-256 encrypted.
       select: false — never returned in normal queries.
       Use .getDecryptedTokens() to read in controllers.

       vtuToken        — VTU provider API token (geodnatechsub etc.)
       gatewaySecret   — Payment gateway secret key (server-side)
       gatewayPublic   — Payment gateway public key (client-side, safe to expose)
       gatewayWebhook  — Payment gateway webhook secret for signature verification
    ========================== */
    apiTokens: {
      vtuToken: { type: String, default: null, select: false },
      gatewaySecret: { type: String, default: null, select: false },
      gatewayPublic: { type: String, default: null }, // public — safe to expose
      gatewayWebhook: { type: String, default: null, select: false },
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
 * WALLET HELPERS
 * ───────────────────────────────────────────────────────────── */
marketerSchema.methods._syncTotalBalance = function () {
  this.wallet.totalBalance =
    this.wallet.fundingBalance + this.wallet.profitBalance;
};

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

marketerSchema.methods.creditWallet = async function (profit, volume) {
  this.wallet.profitBalance += profit;
  this.wallet.totalProfit += profit;
  this.stats.totalTransactions += 1;
  this.stats.totalVolume += volume;
  this._syncTotalBalance();
  await this.save();
};

marketerSchema.methods.creditFunding = async function (amount) {
  this.wallet.fundingBalance += amount;
  this._syncTotalBalance();
  await this.save();
};

marketerSchema.methods.debitFunding = async function (amount) {
  if (this.wallet.fundingBalance < amount) {
    throw new Error("Insufficient funding balance.");
  }
  this.wallet.fundingBalance -= amount;
  this._syncTotalBalance();
  await this.save();
};

marketerSchema.methods.processWithdrawal = async function (amount) {
  if (this.wallet.profitBalance < amount) {
    throw new Error("Insufficient profit balance.");
  }
  this.wallet.profitBalance -= amount;
  this.wallet.totalWithdrawn += amount;
  this._syncTotalBalance();
  await this.save();
};

/* ─────────────────────────────────────────────────────────────
 * API TOKEN METHODS
 * ───────────────────────────────────────────────────────────── */

/**
 * saveApiTokens({ vtuToken, gatewaySecret, gatewayPublic, gatewayWebhook })
 *
 * Encrypts sensitive tokens before saving to DB.
 * Only updates fields that are passed — omitted fields unchanged.
 *
 * Usage:
 *   await marketer.saveApiTokens({ gatewaySecret: "sk_live_xxx" });
 */
marketerSchema.methods.saveApiTokens = async function ({
  vtuToken,
  gatewaySecret,
  gatewayPublic,
  gatewayWebhook,
} = {}) {
  if (vtuToken !== undefined) this.apiTokens.vtuToken = encrypt(vtuToken);
  if (gatewaySecret !== undefined)
    this.apiTokens.gatewaySecret = encrypt(gatewaySecret);
  if (gatewayWebhook !== undefined)
    this.apiTokens.gatewayWebhook = encrypt(gatewayWebhook);
  if (gatewayPublic !== undefined) this.apiTokens.gatewayPublic = gatewayPublic; // no encryption needed

  await this.save();
};

/**
 * getDecryptedTokens()
 *
 * Decrypts and returns all API tokens as plain text.
 * Falls back to process.env values when marketer has no token set.
 *
 * ⚠️  Only call in controllers making external API calls.
 *     Never send the return value to the client.
 *
 * Usage:
 *   const marketer = await Marketer
 *     .findById(req.marketer._id)
 *     .select("+apiTokens.vtuToken +apiTokens.gatewaySecret +apiTokens.gatewayWebhook");
 *
 *   const { vtuToken, gatewaySecret, gatewayPublic, gatewayWebhook } =
 *     marketer.getDecryptedTokens();
 *
 * Returns:
 *   {
 *     vtuToken:       string,  // VTU provider token
 *     gatewaySecret:  string,  // Payment gateway server-side secret
 *     gatewayPublic:  string,  // Payment gateway client-side key
 *     gatewayWebhook: string,  // Payment gateway webhook signing secret
 *   }
 */
marketerSchema.methods.getDecryptedTokens = function () {
  return {
    vtuToken: decrypt(this.apiTokens?.vtuToken) || process.env.API_TOKEN,
    gatewaySecret:
      decrypt(this.apiTokens?.gatewaySecret) || process.env.PAYSTACK_SECRET_KEY,
    gatewayPublic:
      this.apiTokens?.gatewayPublic || process.env.GATEWAY_PUBLIC_KEY,
    gatewayWebhook:
      decrypt(this.apiTokens?.gatewayWebhook) ||
      process.env.GATEWAY_WEBHOOK_SECRET,
  };
};

/**
 * hasOwnTokens()
 *
 * Returns booleans indicating which tokens are configured.
 * Safe to send to the client — no actual token values exposed.
 *
 * Usage:
 *   const tokenStatus = marketer.hasOwnTokens();
 *   // { hasVtuToken: true, hasGatewaySecret: false, ... }
 */
marketerSchema.methods.hasOwnTokens = function () {
  return {
    hasVtuToken: !!this.apiTokens?.vtuToken,
    hasGatewaySecret: !!this.apiTokens?.gatewaySecret,
    hasGatewayPublic: !!this.apiTokens?.gatewayPublic,
    hasGatewayWebhook: !!this.apiTokens?.gatewayWebhook,
  };
};

module.exports = mongoose.model("Marketer", marketerSchema);
