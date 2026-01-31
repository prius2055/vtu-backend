const DataPlan = require("../models/dataPlanModel");

/* ----------------------------------
 * SYNC DATA PLANS
 * --------------------------------- */
const syncDataPlans = async (req, res) => {
  console.log("🔵 syncServiceDataPlans called");

  CUSTOMER_MARKUP_PERCENT = 10;
  RESELLER_MARKUP_PERCENT = 5;

  try {
    console.log("🟡 Fetching provider API...");

    const response = await fetch("https://geodnatechsub.com/api/user/", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`,
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

    // 🔁 Transform provider plans
    const transformedPlans = Object.values(result.Dataplans)
      .flatMap((network) => network.ALL || [])
      .map((p) => {
        const providerPrice = Number(p.plan_amount);

        return {
          providerPlanId: String(p.id),
          network: p.plan_network,
          providerNetworkId: p.network,
          planName: p.plan,
          planType: p.plan_type,
          validity: p.month_validate,
          providerPrice,
          syncedAt: new Date(),
        };
      });

    if (!transformedPlans.length) {
      return res.status(200).json({
        status: "success",
        message: "No plans returned from provider",
        data: [],
      });
    }

    // 🔐 Safe bulkWrite (DO NOT TOUCH ADMIN PRICING)
    const bulkOps = transformedPlans.map((plan) => ({
      updateOne: {
        filter: { providerPlanId: plan.providerPlanId },
        update: {
          $set: {
            network: plan.network,
            providerNetworkId: plan.providerNetworkId,
            planName: plan.planName,
            planType: plan.planType,
            validity: plan.validity,
            providerPrice: plan.providerPrice,
            syncedAt: plan.syncedAt,
          },
          $setOnInsert: {
            serviceType: "data",
            sellingPrice: Math.ceil(
              plan.providerPrice * (1 + CUSTOMER_MARKUP_PERCENT / 100),
            ), // default
            resellerPrice: Math.ceil(
              plan.providerPrice * (1 + RESELLER_MARKUP_PERCENT / 100),
            ),
            isActive: true,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    const bulkResult = await DataPlan.bulkWrite(bulkOps);

    const storedPlans = await DataPlan.find({ serviceType: "data" }).sort({
      network: 1,
      providerPrice: 1,
    });

    return res.status(200).json({
      status: "success",
      meta: {
        inserted: bulkResult.upsertedCount,
        modified: bulkResult.modifiedCount,
      },
      data: storedPlans,
      vtuResult: result,
    });
  } catch (error) {
    console.error("🔥 syncServiceDataPlans ERROR:", error);

    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

/* ----------------------------------
 * UPDATE SERVICE PLAN PRICE
 * --------------------------------- */
const updateDataPlanPrice = async (req, res) => {
  console.log("🔵 updateDataPlanPrice called");

  try {
    const { id } = req.params;
    const { newSellingPrice, newStatus } = req.body; // ✅ FIXED

    console.log("🟡 Plan ID:", id);
    console.log("🟡 Payload:", req.body);

    // Validate price
    if (newSellingPrice !== undefined && Number(newSellingPrice) < 0) {
      return res.status(400).json({
        status: "fail",
        message: "Selling price must be a positive number",
      });
    }

    const plan = await DataPlan.findById(id);

    if (!plan) {
      return res.status(404).json({
        status: "fail",
        message: "Data plan not found",
      });
    }

    console.log("🟢 Existing plan:", {
      providerPrice: plan.providerPrice,
      sellingPrice: plan.sellingPrice,
      resellerPrice: plan.resellerPrice,
      isActive: plan.isActive,
    });

    // 💰 Update price
    if (newSellingPrice !== undefined) {
      const price = Number(newSellingPrice);

      if (isNaN(price)) {
        return res.status(400).json({
          status: "fail",
          message: "Invalid selling price value",
        });
      }

      plan.sellingPrice = price;
      plan.resellerPrice = Math.ceil(price * (1 - 2.5 / 100));
      plan.updatedByAdmin = req.user._id;
      plan.updatedByAdminAt = new Date();
    }

    // 🔄 Update status (SAFE BOOLEAN PARSING)
    if (newStatus !== undefined) {
      plan.isActive = newStatus === true || newStatus === "true";
    }

    await plan.save();

    console.log("🟢 Updated plan saved:", {
      sellingPrice: plan.sellingPrice,
      profit: plan.profit,
      isActive: plan.isActive,
    });

    return res.status(200).json({
      status: "success",
      message: "Data plan updated successfully",
      data: plan,
    });
  } catch (error) {
    console.error("🔥 updateDataPlanPrice ERROR:", error);

    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  syncDataPlans,
  updateDataPlanPrice,
};
