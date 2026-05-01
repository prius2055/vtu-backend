const Transaction = require("../models/transactionModel");
const Wallet = require("../models/walletModel");
const DataPlan = require("../models/dataPlanModel");
const Marketer = require("../models/marketerModel");
const MarketerPricing = require("../models/marketerPriceModel");
const { applyDataCommission } = require("../services/commissionService");
const User = require("../models/userModel");

const NETWORK_MAP = {
  MTN: 1,
  AIRTEL: 2,
  GLO: 3,
  "9MOBILE": 4,
};

const METERTYPE_MAP = {
  Prepaid: 1,
  Postpaid: 2,
};

const extractGB = (planName = "") => {
  const match = planName.match(/(\d+(\.\d+)?)\s*GB/i);
  if (!match) return 0;
  return Math.floor(Number(match[1]));
};

/* ─────────────────────────────────────────────────────────────
 * SHARED HELPERS
 * Eliminates repeated boilerplate across every handler
 * ───────────────────────────────────────────────────────────── */

/**
 * Generate a unique transaction reference + requestId pair
 */
const generateRefs = (prefix, userId) => {
  const ts = Date.now();
  const suffix = userId.toString().slice(-6).toUpperCase();
  return {
    reference: `${prefix}_${ts}_${suffix}`,
    requestId: `REQID_${prefix}_${ts}_${suffix}`,
  };
};

/**
 * Fetch and validate the user's wallet (scoped to marketer).
 * Returns the wallet or throws with a formatted API response.
 */
const getValidWallet = async (userId, marketerId, amountNeeded, res) => {
  const wallet = await Wallet.findOne({ user: userId, marketerId });

  if (!wallet) {
    res.status(404).json({ status: "fail", message: "Wallet not found." });
    return null;
  }

  if (wallet.balance < amountNeeded) {
    res.status(400).json({
      status: "fail",
      message: `Insufficient balance. Available ₦${wallet.balance.toLocaleString()}, Required ₦${amountNeeded.toLocaleString()}`,
      available: wallet.balance,
      required: amountNeeded,
    });
    return null;
  }

  return wallet;
};

/**
 * Call the VTU provider and return parsed result.
 * Throws on network/parse errors.
 */
const callVtuProvider = async (url, payload, vtuToken, method = "POST") => {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${vtuToken}`,
    },
    body: method !== "GET" ? JSON.stringify(payload) : undefined,
  });

  const rawText = await response.text();
  console.log("📄 VTU RAW RESPONSE:", rawText);

  if (!rawText || rawText.trim() === "") {
    throw new Error("Empty response from VTU provider.");
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("VTU returned a non-JSON response.");
  }
};

/**
 * Check if a VTU result object indicates success.
 */
const isVtuSuccess = (result) =>
  result?.status === "success" ||
  result?.Status === "successful" ||
  result?.success === true;

/**
 * Atomically deduct wallet and update marketer stats after VTU success.
 */
const finalizeTransaction = async ({
  transaction,
  userId,
  marketerId,
  amountToCharge,
  marketerProfit,
  vtuResult,
}) => {
  // ── Mark transaction success ──
  transaction.status = "success";
  transaction.vtuReference = vtuResult.orderid || vtuResult.api_response;
  transaction.vtuResponse = vtuResult;
  await transaction.save();

  // ── Deduct user wallet ──
  const updatedWallet = await Wallet.findOneAndUpdate(
    { user: userId, marketerId },
    { $inc: { balance: -amountToCharge, totalSpent: amountToCharge } },
    { new: true },
  );

  // ── Credit marketer wallet via model method ──
  // creditWallet handles:
  //   profitBalance  ↑ by marketerProfit
  //   totalProfit    ↑ by marketerProfit  (all-time tracker)
  //   totalBalance   ↑ synced automatically (_syncTotalBalance)
  //   stats.totalTransactions ↑ by 1
  //   stats.totalVolume       ↑ by amountToCharge
  if (marketerProfit > 0) {
    const marketer = await Marketer.findById(marketerId);
    if (marketer) {
      await marketer.creditWallet(marketerProfit, amountToCharge);
    }
  }

  return updatedWallet;
};

/*SYNC PLANS WITH VTU PROVIDER  - AUTHOMATIC, ONCE A DAY */
const syncDataPlansJob = async () => {
  // same logic as syncDataPlans but no res/req
  // just the fetch + bulkWrite part
  const response = await fetch("https://geodnatechsub.com/api/user/", {
    method: "GET",
    headers: { Authorization: `Token ${process.env.API_TOKEN}` },
  });
  const result = await response.json();
  // ... rest of the sync logic
  console.log("✅ Cron sync complete");
};

/*SYNC PLANS WITH VTU PROVIDER */
const syncDataPlans = async (req, res) => {
  console.log("🔵 syncDataPlans called");

  const CUSTOMER_MARKUP_PERCENT = 10; // ✅ const
  const RESELLER_MARKUP_PERCENT = 5; // ✅ const

  try {
    const response = await fetch("https://geodnatechsub.com/api/user/", {
      method: "GET",
      headers: {
        Authorization: `Token ${process.env.API_TOKEN}`, // ✅ Token not Bearer
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const rawText = await response.text();
      return res.status(502).json({
        status: "fail",
        message: "Provider API error",
        providerStatus: response.status,
        providerResponse: rawText,
      });
    }

    const result = await response.json();

    if (!result?.Dataplans) {
      return res.status(500).json({
        status: "fail",
        message: "Invalid provider response structure",
        result,
      });
    }

    const transformedPlans = Object.values(result.Dataplans)
      .flatMap((network) => network.ALL || [])
      .map((p) => ({
        providerPlanId: String(p.id),
        network: p.plan_network,
        providerNetworkId: p.network,
        planName: p.plan,
        planType: p.plan_type,
        validity: p.month_validate,
        providerPrice: Number(p.plan_amount),
        syncedAt: new Date(),
      }));

    if (!transformedPlans.length) {
      return res.status(200).json({
        status: "success",
        message: "No plans returned from provider",
        data: [],
      });
    }

    // ✅ Aggregation pipeline update — recalculates prices on existing plans
    const bulkOps = transformedPlans.map((plan) => ({
      updateOne: {
        filter: { providerPlanId: plan.providerPlanId },
        update: [
          {
            $set: {
              network: plan.network,
              providerNetworkId: plan.providerNetworkId,
              planName: plan.planName,
              planType: plan.planType,
              validity: plan.validity,
              providerPrice: plan.providerPrice,
              serviceType: "data",
              syncedAt: plan.syncedAt,
              isActive: { $ifNull: ["$isActive", true] },
              createdAt: { $ifNull: ["$createdAt", new Date()] },

              // Recalculate sellingPrice maintaining same margin
              sellingPrice: {
                $cond: {
                  if: { $gt: ["$sellingPrice", 0] },
                  then: {
                    $ceil: {
                      $multiply: [
                        plan.providerPrice,
                        {
                          $divide: [
                            "$sellingPrice",
                            { $ifNull: ["$providerPrice", plan.providerPrice] },
                          ],
                        },
                      ],
                    },
                  },
                  else: {
                    $ceil: {
                      $multiply: [
                        plan.providerPrice,
                        1 + CUSTOMER_MARKUP_PERCENT / 100,
                      ],
                    },
                  },
                },
              },

              // Recalculate resellerPrice maintaining same margin
              resellerPrice: {
                $cond: {
                  if: { $gt: ["$resellerPrice", 0] },
                  then: {
                    $ceil: {
                      $multiply: [
                        plan.providerPrice,
                        {
                          $divide: [
                            "$resellerPrice",
                            { $ifNull: ["$providerPrice", plan.providerPrice] },
                          ],
                        },
                      ],
                    },
                  },
                  else: {
                    $ceil: {
                      $multiply: [
                        plan.providerPrice,
                        1 + RESELLER_MARKUP_PERCENT / 100,
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
        upsert: true,
      },
    }));

    const bulkResult = await DataPlan.bulkWrite(bulkOps);

    console.log(
      `✅ Sync complete — inserted: ${bulkResult.upsertedCount}, updated: ${bulkResult.modifiedCount}`,
    );

    return res.status(200).json({
      status: "success",
      meta: {
        inserted: bulkResult.upsertedCount,
        modified: bulkResult.modifiedCount,
      },
    });
  } catch (error) {
    console.error("🔥 syncDataPlans ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET ALL DATA PLANS
 * ───────────────────────────────────────────────────────────── */
const getAllDataPlans = async (req, res) => {
  try {
    console.log("📦 Fetching data plans");

    console.log("📦 Fetching data plans");
    console.log("🏪 req.marketer:", req.marketer?._id || "NULL");

    const plans = await DataPlan.find({ serviceType: "data", isActive: true })
      .sort({ network: 1, sellingPrice: 1 })
      .lean();

    console.log("📊 Plans found:", plans.length); // ← add this

    // ✅ Fetch marketer overrides and merge
    let overrideMap = {};
    if (req.marketer) {
      const overrides = await MarketerPricing.find({
        marketerId: req.marketer._id,
      }).lean();

      overrides.forEach((o) => {
        overrideMap[o.planId.toString()] = o;
      });
    }

    const adjustedPlans = plans
      .map((plan) => {
        const override = overrideMap[plan._id.toString()];
        return {
          ...plan,
          sellingPrice: override?.sellingPrice ?? plan.sellingPrice,
          resellerPrice: override?.resellerPrice ?? plan.resellerPrice,
          isActive: override?.isActive ?? plan.isActive,
        };
      })
      .filter((p) => p.isActive); // hide plans marketer deactivated

    res.status(200).json({ status: "success", data: adjustedPlans });
  } catch (error) {
    console.error("🔥 getAllDataPlans error:", error.message);
    res.status(500).json({ status: "fail", message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────
 * BUY DATA
 *
 * Pricing logic:
 *  - superadmin/marketer  → providerPrice (no profit)
 *  - reseller             → resellerPrice, marketerProfit = resellerPrice - providerPrice
 *  - regular user         → sellingPrice,  marketerProfit = sellingPrice  - providerPrice
 *
 * Commission only paid when buyer AND referrer are both resellers.
 * No marketerMarkup field — marketer sets prices directly on the plan.
 * ───────────────────────────────────────────────────────────── */

const buyData = async (req, res) => {
  console.log("\n=== BUY DATA START ===");

  try {
    const { plan, mobile_number, pin, ported_number } = req.body;
    const userId = req.user._id;
    const marketerId = req.marketer._id;
    const userRole = req.user.role;

    if (!plan || !mobile_number) {
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields: plan, mobile_number.",
      });
    }

    /* ── Fetch global plan ── */
    const selectedPlan = await DataPlan.findOne({
      providerPlanId: String(plan),
      isActive: true,
    });

    if (!selectedPlan) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid or inactive data plan.",
      });
    }

    /* ── Apply marketer pricing override ──
     *
     * Marketer may have set custom sellingPrice/resellerPrice
     * via MarketerPricing. Use those if they exist, otherwise
     * fall back to the global DataPlan prices.
     */
    const marketerPricing = await MarketerPricing.findOne({
      marketerId,
      planId: selectedPlan._id,
    });

    const sellingPrice =
      marketerPricing?.sellingPrice ?? selectedPlan.sellingPrice;
    const resellerPrice =
      marketerPricing?.resellerPrice ?? selectedPlan.resellerPrice;
    const planIsActive = marketerPricing?.isActive ?? selectedPlan.isActive;

    // ✅ Respect marketer's per-plan activation toggle
    if (!planIsActive) {
      return res.status(400).json({
        status: "fail",
        message: "This plan is not available on your platform.",
      });
    }

    console.log("🔵 Plan pricing resolved:", {
      globalSellingPrice: selectedPlan.sellingPrice,
      globalResellerPrice: selectedPlan.resellerPrice,
      resolvedSellingPrice: sellingPrice,
      resolvedResellerPrice: resellerPrice,
      hasOverride: !!marketerPricing,
    });

    /* ── Pricing decision ──
     *
     * providerPrice  = what we pay the VTU API (always from global plan)
     * marketerProfit = what the marketer earns on this transaction
     * resellerProfit = discount benefit the reseller gets vs regular price
     * amountToCharge = what the buyer's wallet is debited
     *
     * superadmin/marketer → providerPrice  (no profit)
     * reseller            → resellerPrice  (marketerProfit = resellerPrice - providerPrice)
     * regular user        → sellingPrice   (marketerProfit = sellingPrice  - providerPrice)
     */
    let amountToCharge;
    let marketerProfit = 0;
    let resellerProfit = 0;

    if (["superadmin", "marketer"].includes(userRole)) {
      amountToCharge = selectedPlan.providerPrice;
      marketerProfit = 0;
      resellerProfit = 0;
    } else if (userRole === "reseller") {
      amountToCharge = resellerPrice;
      marketerProfit = resellerPrice - selectedPlan.providerPrice;
      resellerProfit = sellingPrice - resellerPrice;
    } else {
      // Regular user
      amountToCharge = sellingPrice;
      marketerProfit = sellingPrice - selectedPlan.providerPrice;
      resellerProfit = 0;
    }

    // ✅ Guard against negative profit from bad pricing config
    if (marketerProfit < 0) {
      console.warn("⚠️ Negative marketerProfit — check plan pricing:", {
        providerPrice: selectedPlan.providerPrice,
        resellerPrice,
        sellingPrice,
        userRole,
      });
      marketerProfit = 0;
    }

    console.log("🧮 Pricing:", {
      role: userRole,
      providerPrice: selectedPlan.providerPrice,
      resellerPrice,
      sellingPrice,
      amountToCharge,
      marketerProfit,
      resellerProfit,
    });

    /* ── Wallet check ── */
    const wallet = await getValidWallet(
      userId,
      marketerId,
      amountToCharge,
      res,
    );
    if (!wallet) return;

    /* ── Create pending transaction ── */
    const { reference, requestId } = generateRefs("DATA", userId);

    const transaction = await Transaction.create({
      user: userId,
      marketerId,
      type: "data",
      phone: mobile_number,
      network: selectedPlan.network,
      servicePlan: selectedPlan._id,
      amount: amountToCharge,
      providerPrice: selectedPlan.providerPrice,
      resellerPrice,
      sellingPrice,
      marketerProfit,
      resellerProfit,
      profit: marketerProfit,
      reference,
      requestId,
      status: "pending",
      description: `${selectedPlan.planName} for ${mobile_number}`,
    });

    console.log("🧾 Pending transaction:", transaction._id);

    /* ── Call VTU provider ── */
    const marketerWithTokens = await Marketer.findById(marketerId).select(
      "+apiTokens.vtuToken",
    );

    const { vtuToken } = marketerWithTokens.getDecryptedTokens();
    console.log(
      "🔑 VTU token source:",
      marketerWithTokens.apiTokens?.vtuToken
        ? "marketer's own token"
        : "platform fallback",
    );

    let result;
    try {
      result = await callVtuProvider(
        "https://geodnatechsub.com/api/data/",
        {
          network: selectedPlan.providerNetworkId,
          mobile_number,
          plan: selectedPlan.providerPlanId,
          Ported_number: ported_number ?? true,
        },
        vtuToken,
      );
    } catch (vtuError) {
      transaction.status = "failed";
      transaction.vtuResponse = { error: vtuError.message };
      await transaction.save();

      return res.status(502).json({
        status: "fail",
        message: "VTU service unreachable.",
        error: vtuError.message,
      });
    }

    /* ── Handle result ── */
    if (isVtuSuccess(result)) {
      const updatedWallet = await finalizeTransaction({
        transaction,
        userId,
        marketerId,
        amountToCharge,
        marketerProfit,
        vtuResult: result,
      });

      /* ── Commission — only when buyer is a reseller ──
       * applyDataCommission also checks internally that the
       * referrer is a reseller on the same platform before paying out.
       */
      if (userRole === "reseller") {
        const dataSizeGb = extractGB(selectedPlan.planName);
        const commissionResult = await applyDataCommission({
          buyerId: userId,
          marketerId,
          dataSizeGb,
          transactionId: transaction._id,
        });
        console.log("💰 Commission result:", commissionResult);
      }

      console.log("✅ Data purchase successful");

      return res.status(200).json({
        status: "success",
        message: "Data purchase successful.",
        data: {
          transaction,
          wallet: { balance: updatedWallet.balance },
        },
      });
    }

    /* ── VTU failed ── */
    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || "Data purchase failed.",
    });
  } catch (error) {
    console.error("🔥 buyData error:", error.message);
    return res.status(500).json({ status: "fail", message: error.message });
  } finally {
    console.log("=== BUY DATA END ===\n");
  }
};

/* ─────────────────────────────────────────────────────────────
 * BUY AIRTIME
 *
 * Changes:
 *  - marketerId scoped wallet + transaction
 *  - marketer markup applied
 *  - requestId added
 *  - Consistent field names (vtuReference not vtu_reference)
 * ───────────────────────────────────────────────────────────── */
const buyAirtime = async (req, res) => {
  console.log("\n=== BUY AIRTIME START ===");

  try {
    const { network, mobile_number, airtime_type, amount } = req.body;
    const userId = req.user._id;
    const marketerId = req.marketer._id;
    const userRole = req.user.role;

    const rawNetwork = network?.toUpperCase();
    const providerNetworkId = NETWORK_MAP[rawNetwork];

    if (!providerNetworkId || !mobile_number || !airtime_type || !amount) {
      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: network, mobile_number, airtime_type, amount.",
      });
    }

    if (isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid amount.",
      });
    }

    const baseAmount = Number(amount);

    /* ── Pricing decision ──
     *
     * Regular user        → pays baseAmount (no extra markup)
     * superadmin/marketer/reseller → also pays baseAmount upfront
     *   but their actual profit = baseAmount - paid_amount (from VTU response)
     *   since provider always charges slightly less than baseAmount.
     *
     * marketerProfit is calculated after VTU response for privileged roles
     * and stays 0 for regular users (no markup on airtime for users).
     */
    const amountToCharge = baseAmount; // ✅ everyone pays baseAmount upfront

    console.log("🧮 Airtime Pricing:", {
      role: userRole,
      baseAmount,
      amountToCharge,
    });

    /* ── Wallet check ── */
    const wallet = await getValidWallet(
      userId,
      marketerId,
      amountToCharge,
      res,
    );
    if (!wallet) return;

    /* ── Create pending transaction ── */
    const { reference, requestId } = generateRefs("AIRTIME", userId);

    const transaction = await Transaction.create({
      user: userId,
      marketerId,
      type: "airtime",
      phone: mobile_number,
      network: rawNetwork,
      amount: amountToCharge,
      providerPrice: baseAmount, // will be updated to paid_amount after VTU
      sellingPrice: baseAmount,
      marketerProfit: 0, // calculated after VTU response
      resellerProfit: 0,
      reference,
      requestId,
      status: "pending",
      description: `${airtime_type} airtime ₦${baseAmount} for ${mobile_number}`,
    });

    console.log("🧾 Pending transaction:", transaction._id);

    /* ── Call VTU provider ── */
    const marketerWithTokens = await Marketer.findById(marketerId).select(
      "+apiTokens.vtuToken",
    );

    const { vtuToken } = marketerWithTokens.getDecryptedTokens();
    console.log(
      "🔑 VTU token source:",
      marketerWithTokens.apiTokens?.vtuToken
        ? "marketer's own token"
        : "platform fallback",
    );

    let result;
    try {
      result = await callVtuProvider(
        "https://geodnatechsub.com/api/topup/",
        {
          network: providerNetworkId,
          amount: baseAmount,
          mobile_number,
          airtime_type,
          Ported_number: true,
        },
        vtuToken,
      );
    } catch (vtuError) {
      transaction.status = "failed";
      transaction.vtuResponse = { error: vtuError.message };
      await transaction.save();

      return res.status(502).json({
        status: "fail",
        message: "VTU service unreachable.",
        error: vtuError.message,
      });
    }

    /* ── Handle result ── */
    if (isVtuSuccess(result)) {
      /* ── Calculate actual provider cost from VTU response ──
       *
       * paid_amount = what provider actually charged (e.g. 97)
       * baseAmount  = what user requested            (e.g. 100)
       *
       * For privileged roles (superadmin/marketer/reseller):
       *   marketerProfit = baseAmount - paid_amount  (e.g. 100 - 97 = 3)
       *
       * For regular users:
       *   marketerProfit = 0 (no markup on airtime for users)
       */
      const paidAmount = parseFloat(result.paid_amount) || baseAmount;
      let actualAmountToCharge;
      let marketerProfit = 0;
      let resellerProfit = 0;

      if (["superadmin", "marketer"].includes(userRole)) {
        // Buying at provider cost — no profit for anyone
        actualAmountToCharge = paidAmount;
        marketerProfit = 0;
        resellerProfit = 0;
      } else if (userRole === "reseller") {
        // Reseller pays provider cost — pockets the difference themselves
        actualAmountToCharge = paidAmount;
        marketerProfit = 0;
        resellerProfit = baseAmount - paidAmount; // reseller's benefit
      } else {
        // Regular user pays full baseAmount — marketer earns the provider discount
        actualAmountToCharge = baseAmount;
        marketerProfit = baseAmount - paidAmount;
        resellerProfit = 0;
      }
      console.log("💰 Airtime profit:", {
        role: userRole,
        baseAmount,
        paidAmount,
        actualAmountToCharge,
        marketerProfit,
        resellerProfit,
      });

      // ✅ Update transaction with actual values
      transaction.providerPrice = paidAmount;
      transaction.amount = actualAmountToCharge; // ✅ correct what was charged
      transaction.marketerProfit = marketerProfit;
      transaction.resellerProfit = resellerProfit;

      const updatedWallet = await finalizeTransaction({
        transaction,
        userId,
        marketerId,
        amountToCharge: actualAmountToCharge, // ✅ actual debit amount
        marketerProfit,
        vtuResult: result,
      });

      console.log("✅ Airtime purchase successful");

      return res.status(200).json({
        status: "success",
        message: "Airtime purchase successful.",
        data: {
          transaction,
          wallet: { balance: updatedWallet.balance },
        },
      });
    }

    /* ── VTU failed ── */
    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || "Airtime purchase failed.",
    });
  } catch (error) {
    console.error("🔥 buyAirtime error:", error.message);
    return res.status(500).json({ status: "fail", message: error.message });
  } finally {
    console.log("=== BUY AIRTIME END ===\n");
  }
};

const validateMeter = async (req, res) => {
  console.log("\n=== VALIDATE METER START ===");

  try {
    const marketerId = req.marketer._id;
    const { disco_name, meter_number, MeterType, amount } = req.body;

    console.log("📥 Incoming Request:", {
      marketerId,
      disco_name,
      meter_number,
      MeterType,
      amount,
    });

    if (!disco_name || !meter_number || !MeterType || !amount) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields.",
      });
    }

    if (isNaN(amount) || amount < 500) {
      console.log("❌ Invalid amount:", amount);
      return res.status(400).json({
        status: "fail",
        message: "Invalid amount.",
      });
    }

    const marketerWithTokens = await Marketer.findById(marketerId).select(
      "+apiTokens.vtuToken",
    );
    console.log("🔑 Marketer fetched");

    const { vtuToken } = marketerWithTokens.getDecryptedTokens();

    console.log("🌐 Calling VTU API...");
    const url = `https://geodnatechsub.com/api/validatemeter?meternumber=${meter_number}&disconame=${disco_name}&mtype=${MeterType}`;
    console.log("➡️ URL:", url);

    const result = await callVtuProvider(url, null, vtuToken, "GET");

    console.log("📡 VTU Response:", result);

    if (result.invalid) {
      console.log("❌ Meter validation failed");
      return res.status(400).json({
        status: "fail",
        message: result.message || "Meter validation failed.",
      });
    }

    console.log("✅ Meter validated successfully");

    return res.status(200).json({
      status: "success",
      message: "Meter validated successfully.",
      result,
    });
  } catch (error) {
    console.error("🔥 validateMeter error:", error);
    return res.status(500).json({ status: "fail", message: error.message });
  } finally {
    console.log("=== VALIDATE METER END ===\n");
  }
};

const rechargeMeter = async (req, res) => {
  console.log("\n=== METER RECHARGE START ===");

  try {
    console.log("📥 Request Body:", req.body);

    const {
      disco_name,
      amount,
      meter_number,
      MeterType,
      customer_number,
      meter_name,
      meter_address,
    } = req.body;

    const userId = req.user._id;
    const marketerId = req.marketer._id;

    console.log("👤 User:", userId);
    console.log("🏪 Marketer:", marketerId);

    if (!disco_name || !meter_number || !amount || !MeterType) {
      console.log("❌ Missing required fields");
      return res
        .status(400)
        .json({ status: "fail", message: "Missing required fields." });
    }

    const { finalPrice: amountToCharge, markupAmount: marketerMarkup } =
      req.marketer.calculatePrice(Number(amount), "electricity");

    console.log("💰 Pricing:", {
      original: amount,
      amountToCharge,
      marketerMarkup,
    });

    const wallet = await getValidWallet(
      userId,
      marketerId,
      amountToCharge,
      res,
    );
    console.log("💳 Wallet:", wallet);

    if (!wallet) {
      console.log("❌ Wallet validation failed");
      return;
    }

    const { reference, requestId } = generateRefs("METER", userId);
    console.log("🧾 Generated Refs:", { reference, requestId });

    const transaction = await Transaction.create({
      user: userId,
      marketerId,
      type: "meter_recharge",
      disco: disco_name,
      meterNumber: meter_number,
      amount: amountToCharge,
      reference,
      requestId,
      status: "pending",
      meterType: MeterType,
      phone: customer_number,
      customerName: meter_name,
    });

    console.log("📝 Transaction Created:", transaction._id);

    const marketerWithTokens = await Marketer.findById(marketerId).select(
      "+apiTokens.vtuToken",
    );
    const { vtuToken } = marketerWithTokens.getDecryptedTokens();

    let result;
    try {
      console.log("🌐 Calling VTU API...");

      result = await callVtuProvider(
        "https://geodnatechsub.com/api/billpayment/",
        {
          disco_name,
          amount: Number(amount),
          meter_number,
          MeterType,
        },
        vtuToken,
      );

      console.log("📡 VTU Response:", result);
    } catch (vtuError) {
      console.error("🔥 VTU Error:", vtuError);

      transaction.status = "failed";
      await transaction.save();

      return res
        .status(502)
        .json({ status: "fail", message: "VTU service unreachable." });
    }

    if (isVtuSuccess(result)) {
      console.log("✅ VTU SUCCESS");

      const updatedWallet = await finalizeTransaction({
        transaction,
        userId,
        marketerId,
        amountToCharge,
        marketerProfit: marketerMarkup,
        platformProfit: 0,
        vtuResult: result,
      });

      console.log("💳 Wallet Updated:", updatedWallet.balance);

      return res.status(200).json({
        status: "success",
        message: "Meter recharge successful.",
        data: { transaction, wallet: updatedWallet },
      });
    }

    console.log("❌ VTU FAILED");

    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || "Meter recharge failed.",
    });
  } catch (error) {
    console.error("🔥 rechargeMeter error:", error);
    return res.status(500).json({ status: "fail", message: error.message });
  } finally {
    console.log("=== METER RECHARGE END ===\n");
  }
};

const validateCable = async (req, res) => {
  try {
    const { cableName, iucNumber } = req.body;
    const marketerId = req.marketer._id; // ✅ FIXED: was missing entirely

    if (!cableName || !iucNumber) {
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields: cableName, iucNumber.",
      });
    }

    const marketerWithTokens = await Marketer.findById(marketerId).select(
      "+apiTokens.vtuToken",
    );
    const { vtuToken } = marketerWithTokens.getDecryptedTokens();

    const result = await callVtuProvider(
      `https://geodnatechsub.com/api/validateiuc?smart_card_number=${iucNumber}&cablename=${cableName}`,
      null,
      vtuToken,
      "GET",
    );

    if (result.invalid === true) {
      return res.status(400).json({
        status: "fail",
        message: result.message || "IUC validation failed.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "IUC validated successfully.",
      result,
    });
  } catch (error) {
    console.error("🔥 validateCable error:", error.message);
    return res.status(500).json({ status: "fail", message: error.message });
  }
};

const rechargeCable = async (req, res) => {
  console.log("\n=== CABLE RECHARGE START ===");

  try {
    const {
      cablename,
      cableplan,
      smart_card_number,
      amount,
      customerName,
      customerNumber,
    } = req.body;

    const userId = req.user._id;
    const marketerId = req.marketer._id;

    if (
      !cablename ||
      !cableplan ||
      !smart_card_number ||
      !amount ||
      !customerName ||
      !customerNumber
    ) {
      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: cablename, cableplan, smart_card_number, amount, customerName, customerNumber.",
      });
    }

    if (isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid amount." });
    }

    const { finalPrice: amountToCharge, markupAmount: marketerMarkup } =
      req.marketer.calculatePrice(Number(amount), "cable");

    const marketerProfit = marketerMarkup;

    const wallet = await getValidWallet(
      userId,
      marketerId,
      amountToCharge,
      res,
    );
    if (!wallet) return;

    const { reference, requestId } = generateRefs("CABLE", userId);

    const transaction = await Transaction.create({
      user: userId,
      marketerId,
      type: "cable_recharge",
      cableName: cablename,
      smartCardNumber: smart_card_number,
      phone: customerNumber,
      customerName,
      amount: amountToCharge,
      providerPrice: Number(amount),
      marketerMarkup,
      marketerProfit,
      sellingPrice: amountToCharge,
      reference,
      requestId,
      status: "pending",
      description: `${cablename} cable recharge for ${smart_card_number} (${customerName})`,
    });

    const marketerWithTokens = await Marketer.findById(marketerId).select(
      "+apiTokens.vtuToken",
    );
    const { vtuToken } = marketerWithTokens.getDecryptedTokens();

    let result;
    try {
      result = await callVtuProvider(
        "https://geodnatechsub.com/api/billpayment/",
        { cablename, cableplan, smart_card_number },
        vtuToken,
      );
    } catch (vtuError) {
      transaction.status = "failed";
      transaction.vtuResponse = { error: vtuError.message };
      await transaction.save();
      return res
        .status(502)
        .json({ status: "fail", message: "VTU service unreachable." });
    }

    if (isVtuSuccess(result)) {
      const updatedWallet = await finalizeTransaction({
        transaction,
        userId,
        marketerId,
        amountToCharge,
        marketerProfit,
        platformProfit: 0,
        vtuResult: result,
      });

      return res.status(200).json({
        status: "success",
        message: "Cable recharge successful.",
        data: {
          transaction,
          wallet: { balance: updatedWallet.balance },
          vtu_response: result,
        },
      });
    }

    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || "Cable recharge failed.",
    });
  } catch (error) {
    console.error("🔥 rechargeCable error:", error.message);
    return res.status(500).json({ status: "fail", message: error.message });
  } finally {
    console.log("=== CABLE RECHARGE END ===\n");
  }
};

/* ─────────────────────────────────────────────────────────────
 * RECHARGE CARD PRINTING
 *
 * Changes:
 *  - marketerId scoped wallet + transaction
 *  - Uses VTUNG_API_TOKEN (separate provider, kept as-is)
 * ───────────────────────────────────────────────────────────── */
const rechargeCardPrinting = async (req, res) => {
  console.log("\n=== RECHARGE CARD PRINTING START ===");

  try {
    const { network, amount, quantity } = req.body;
    const userId = req.user._id;
    const marketerId = req.marketer._id;

    if (!network || !amount || !quantity) {
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields: network, amount, quantity.",
      });
    }

    if (isNaN(amount) || amount <= 0 || isNaN(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid amount or quantity." });
    }

    const totalAmount = Number(amount) * Number(quantity);

    /* ── Wallet check ── */
    const wallet = await getValidWallet(userId, marketerId, totalAmount, res);
    if (!wallet) return;

    /* ── Create pending transaction ── */
    const { reference, requestId } = generateRefs("RCARD", userId);

    const transaction = await Transaction.create({
      user: userId,
      marketerId, // ✅
      type: "recharge_card_printing",
      network: network.toUpperCase(),
      amount: totalAmount,
      reference,
      requestId,
      status: "pending",
      description: `${quantity} × ₦${amount} ${network} recharge card`,
    });

    /* ── Call VTU (vtu.ng — different provider) ── */
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

      const rawText = await response.text();
      result = JSON.parse(rawText);
    } catch (vtuError) {
      transaction.status = "failed";
      transaction.vtuResponse = { error: vtuError.message };
      await transaction.save();

      return res.status(502).json({
        status: "fail",
        message: "VTU service unreachable.",
      });
    }

    /* ── Handle result ── */
    if (isVtuSuccess(result)) {
      const updatedWallet = await finalizeTransaction({
        transaction,
        userId,
        marketerId,
        amountToCharge: totalAmount,
        marketerProfit: 0,
        platformProfit: 0,
        vtuResult: result,
      });

      return res.status(200).json({
        status: "success",
        message: "Recharge card printing successful.",
        data: {
          transaction,
          wallet: { balance: updatedWallet.balance },
          vtu_response: result,
        },
      });
    }

    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || "Recharge card printing failed.",
    });
  } catch (error) {
    console.error("🔥 rechargeCardPrinting error:", error.message);
    return res.status(500).json({ status: "fail", message: error.message });
  } finally {
    console.log("=== RECHARGE CARD PRINTING END ===\n");
  }
};

const setPin = async (req, res) => {
  const { pin, confirmPin } = req.body;

  if (pin !== confirmPin) {
    return res.status(400).json({ message: "PINs do not match" });
  }

  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ message: "PIN must be 4 digits" });
  }

  const user = await User.findById(req.user.id).select("+transactionPin");

  await user.setTransactionPin(pin); // 👈 MODEL METHOD
  await user.save();

  res.json({ success: true, message: "PIN set successfully" });
};

module.exports = {
  syncDataPlansJob,
  syncDataPlans,
  getAllDataPlans,
  buyData,
  buyAirtime,
  validateMeter,
  rechargeMeter,
  validateCable,
  rechargeCable,
  rechargeCardPrinting,
  setPin,
};
