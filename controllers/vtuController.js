const Transaction = require("../models/transactionModel");
const Wallet = require("../models/walletModel");
const DataPlan = require("../models/dataPlanModel");
const applyDataCommission = require("../services/commissionService");

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

const getAllDataPlans = async (req, res) => {
  try {
    console.log("📦 Fetching data plans from DB");

    const plans = await DataPlan.find({
      serviceType: "data",
      isActive: true,
    })
      .sort({ network: 1, sellingPrice: 1 })
      .lean();

    console.log("✅ Plans fetched:", plans.length);

    res.status(200).json({
      status: "success",
      data: plans,
    });
  } catch (error) {
    console.error("🔥 Fetch data plans error:", error);

    res.status(500).json({
      status: "fail",
      message: error.message,
    });
  }
};

const buyData = async (req, res) => {
  try {
    console.log("📥 Buy Data Request Body:", req.body);
    console.log("👤 Authenticated User:", req.user?._id);

    const { plan, mobile_number, ported_number } = req.body;
    const userId = req.user._id;
    const isAdmin = req.user.role === "admin";
    const isReseller = req.user.role === "reseller";

    /* --------------------------------------------------
     * 1️⃣ Validate request
     * -------------------------------------------------- */
    if (!plan || !mobile_number) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields: plan, mobile_number",
      });
    }

    console.log("🔎 Fetching DataPlan with providerPlanId:", plan);

    /* --------------------------------------------------
     * 2️⃣ Fetch Data Plan (SOURCE OF TRUTH)
     * -------------------------------------------------- */
    const selectedPlan = await DataPlan.findOne({
      providerPlanId: Number(plan),
      isActive: true,
    });

    console.log("📦 Selected Plan:", selectedPlan);

    if (!selectedPlan) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid or inactive data plan",
      });
    }

    let amountToCharge;
    let profit = 0;

    if (isAdmin) {
      amountToCharge = selectedPlan.providerPrice;
      profit = 0;
    } else if (isReseller) {
      if (selectedPlan.resellerPrice > selectedPlan.sellingPrice) {
        throw new Error("Invalid reseller pricing configuration");
      }

      amountToCharge = selectedPlan.resellerPrice;
      profit = selectedPlan.sellingPrice - selectedPlan.resellerPrice;
    } else {
      amountToCharge = selectedPlan.sellingPrice;
      profit = 0;
    }

    console.log("🧮 Pricing Decision:", {
      role: req.user.role,
      amountToCharge,
      profit,
    });

    /* --------------------------------------------------
     * 3️⃣ Check Wallet Balance
     * -------------------------------------------------- */
    const wallet = await Wallet.findOne({ user: userId });

    console.log("👛 Wallet:", wallet);

    if (!wallet) {
      return res.status(404).json({
        status: "fail",
        message: "Wallet not found",
      });
    }

    if (wallet.balance < amountToCharge) {
      console.log("❌ Insufficient wallet balance");
      return res.status(400).json({
        status: "fail",
        message: `Insufficient balance. Available ₦${wallet.balance}, Required ₦${amountToCharge}`,
      });
    }

    /* --------------------------------------------------
     * 4️⃣ Create Pending Transaction
     * -------------------------------------------------- */
    const reference = `DATA_${Date.now()}_${userId.toString().slice(-6)}`;
    // const reference = `AIRTIME_${Date.now()}_${userId.toString().slice(-6)}`;

    const transaction = await Transaction.create({
      user: userId,
      type: "data",
      phone: mobile_number,
      network: selectedPlan.network,
      reference,
      status: "pending",
      description: `${selectedPlan.planName} for ${mobile_number}`,
      servicePlan: selectedPlan._id,
      amount: amountToCharge,
      sellingPrice: selectedPlan.sellingPrice,
      profit,
    });

    console.log("🧾 Pending Transaction Created:", transaction._id);

    /* --------------------------------------------------
     * 5️⃣ Call VTU Provider
     * -------------------------------------------------- */
    const providerPayload = {
      network: selectedPlan.providerNetworkId,
      mobile_number,
      plan: selectedPlan.providerPlanId,
      Ported_number: ported_number ?? true,
    };

    console.log("🌐 Calling VTU API with payload:", providerPayload);

    const response = await fetch("https://geodnatechsub.com/api/data/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${process.env.API_TOKEN}`,
      },
      body: JSON.stringify(providerPayload),
    });

    const rawText = await response.text();
    console.log("📄 VTU RAW RESPONSE:", rawText);

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (err) {
      throw new Error("VTU returned non-JSON response");
    }

    /* --------------------------------------------------
     * 6️⃣ Handle VTU Response
     * -------------------------------------------------- */
    if (result.status === "success" || result.Status === "successful") {
      console.log("✅ VTU Purchase Successful");

      transaction.status = "success";
      transaction.vtuReference = result.orderid || result.api_response;
      transaction.vtuResponse = result;
      await transaction.save();

      const updatedWallet = await Wallet.findOneAndUpdate(
        { user: userId },
        {
          $inc: {
            balance: -amountToCharge,
            totalSpent: amountToCharge,
          },
        },
        { new: true },
      );

      const dataSizeGb = extractGB(selectedPlan.planName);

      await applyDataCommission({
        buyerId: userId,
        dataSizeGb,
        transactionId: transaction._id,
      });

      console.log("💳 Wallet Updated:", updatedWallet.balance);

      return res.status(200).json({
        status: "success",
        message: "Data purchase successful",
        data: {
          transaction,
          wallet: {
            balance: updatedWallet.balance,
            totalSpent: updatedWallet.totalSpent,
          },
        },
      });
    }

    /* --------------------------------------------------
     * 7️⃣ VTU Failed
     * -------------------------------------------------- */
    console.error("❌ VTU Failure:", result);

    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || "Data purchase failed",
      error: result,
    });
  } catch (error) {
    console.error("🔥 Buy Data Error:", error);

    return res.status(500).json({
      status: "fail",
      message: error.message || "Internal server error",
    });
  }
};

const buyAirtime = async (req, res) => {
  try {
    /* --------------------------------------------------
     * 1️⃣ Extract & log request payload
     * -------------------------------------------------- */
    const { network, mobile_number, airtime_type, amount } = req.body;
    const userId = req.user._id;

    const rawNetwork = network?.toUpperCase();

    const providerNetworkId = NETWORK_MAP[rawNetwork];

    console.log("🔁 Network Mapping:", {
      rawNetwork,
      providerNetworkId,
    });

    console.log("📥 Incoming Payload:", {
      providerNetworkId,
      mobile_number,
      airtime_type,
      amount,
    });

    /* --------------------------------------------------
     * 2️⃣ Validate request payload
     * -------------------------------------------------- */
    if (!providerNetworkId || !mobile_number || !airtime_type || !amount) {
      console.error("❌ Validation Error: Missing fields");

      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: network, mobile_number, airtime_type, amount",
      });
    }

    if (isNaN(amount) || amount <= 0) {
      console.error("❌ Validation Error: Invalid amount", amount);

      return res.status(400).json({
        status: "fail",
        message: "Invalid amount",
      });
    }

    /* --------------------------------------------------
     * 3️⃣ Fetch & validate wallet
     * -------------------------------------------------- */
    console.log("🔍 Fetching user wallet...");
    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      console.error("❌ Wallet not found for user:", userId);

      return res.status(404).json({
        status: "fail",
        message: "Wallet not found",
      });
    }

    console.log("💰 Wallet balance:", wallet.balance);

    if (wallet.balance < amount) {
      console.error("❌ Insufficient balance");

      return res.status(400).json({
        status: "fail",
        message: `Insufficient balance. Available ₦${wallet.balance}, Required ₦${amount}`,
      });
    }

    /* --------------------------------------------------
     * 4️⃣ Create pending transaction
     * -------------------------------------------------- */
    const reference = `AIRTIME_${Date.now()}_${userId.toString().slice(-6)}`;

    console.log("🧾 Creating pending transaction:", reference);

    const transaction = await Transaction.create({
      user: userId,
      type: "airtime",
      phone: mobile_number,
      network,
      amount,
      reference,
      status: "pending",
      description: `${airtime_type} airtime purchase for ${mobile_number}`,
    });

    /* --------------------------------------------------
     * 5️⃣ Call VTU API
     * -------------------------------------------------- */
    try {
      // const payload = {};

      console.log("🚀 Calling VTU Airtime API...");
      const vtuPayload = {
        network: providerNetworkId,
        amount: Number(amount),
        mobile_number,
        airtime_type,
        Ported_number: true,
      };

      console.log("📡 VTU FINAL PAYLOAD:", vtuPayload);

      const response = await fetch("https://geodnatechsub.com/api/topup/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.API_TOKEN}`,
        },
        body: JSON.stringify(vtuPayload),
      });

      const rawText = await response.text();
      console.log("📩 Raw VTU Response:", rawText);

      let result;
      try {
        result = JSON.parse(rawText);
      } catch (err) {
        throw new Error("VTU returned non-JSON response");
      }

      console.log("📊 Parsed VTU Response:", result);

      /* --------------------------------------------------
       * 6️⃣ Detect VTU failure
       * -------------------------------------------------- */
      const isSuccess =
        result.status === "success" ||
        result.Status === "successful" ||
        result.success === true;

      if (!isSuccess) {
        console.error("❌ VTU rejected request:", result);

        transaction.status = "failed";
        transaction.vtu_response = result;
        await transaction.save();

        return res.status(400).json({
          status: "fail",
          message:
            result.message || result.error || "VTU rejected airtime purchase",
          vtu_error: result,
        });
      }

      /* --------------------------------------------------
       * 7️⃣ VTU success → finalize transaction
       * -------------------------------------------------- */
      console.log("✅ VTU airtime purchase successful");

      transaction.status = "success";
      transaction.vtu_reference = result.orderid || result.api_response;
      transaction.vtu_response = result;
      await transaction.save();

      console.log("💸 Deducting wallet balance...");

      const updatedWallet = await Wallet.findOneAndUpdate(
        { user: userId },
        {
          $inc: {
            balance: -amount,
            totalSpent: amount,
          },
        },
        { new: true },
      );

      console.log("💰 New wallet balance:", updatedWallet.balance);

      return res.status(200).json({
        status: "success",
        message: "Airtime purchase successful",
        data: {
          transaction: {
            id: transaction._id,
            reference: transaction.reference,
            amount: transaction.amount,
            network: transaction.network,
            phone: transaction.phone,
            type: transaction.type,
            status: transaction.status,
          },
          wallet: {
            balance: updatedWallet.balance,
            totalSpent: updatedWallet.totalSpent,
          },
          vtu_response: result,
        },
      });
    } catch (vtuError) {
      console.error("🔥 VTU API ERROR:", vtuError.message);

      transaction.status = "failed";
      transaction.vtu_response = {
        error: vtuError.message,
        time: new Date(),
      };
      await transaction.save();

      return res.status(500).json({
        status: "fail",
        message: "Failed to connect to VTU service",
        error: vtuError.message,
      });
    }
  } catch (error) {
    console.error("🔥 BUY AIRTIME SYSTEM ERROR:", error);

    return res.status(500).json({
      status: "fail",
      message: error.message || "An unexpected error occurred",
    });
  } finally {
    console.log("================ BUY AIRTIME END =================");
  }
};

const validateMeter = async (req, res) => {
  try {
    /* --------------------------------------------------
     * 1️⃣ Extract & log request payload
     * -------------------------------------------------- */
    const { disco_name, meter_number, MeterType, amount, customer_number } =
      req.body;

    // console.log('📥 New Payload:', payload);
    const userId = req.user._id;

    /* --------------------------------------------------
     * 2️⃣ Validate request payload
     * -------------------------------------------------- */
    if (!disco_name || !meter_number || !MeterType || !amount) {
      console.error("❌ Validation Error: Missing fields");

      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: disco_name, meter_number, MeterType, amount",
      });
    }

    if (isNaN(amount) || amount <= 0) {
      console.error("❌ Validation Error: Invalid amount", amount);

      return res.status(400).json({
        status: "fail",
        message: "Invalid amount. Minimum = ₦500",
      });
    }

    /* --------------------------------------------------
     * 3️⃣ Validate meter details
     * -------------------------------------------------- */
    try {
      // console.log("🚀 Calling meter validate API...");

      const response = await fetch(
        `https://geodnatechsub.com/api/validatemeter?meternumber=${meter_number}&disconame=${disco_name}&mtype=${MeterType}`,
        {
          // method: 'POST',
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${process.env.API_TOKEN}`,
          },
        },
      );

      const rawText = await response.text();

      let result;
      try {
        result = JSON.parse(rawText);
      } catch (err) {
        throw new Error("VTU returned non-JSON response");
      }

      /* --------------------------------------------------
       * 6️⃣ Detect VTU failure
       * -------------------------------------------------- */

      if (result.invalid) {
        console.error("❌ VTU rejected request:", result);

        return res.status(400).json({
          status: "fail",
          message: result.message || result.error || "Meter validation failed",
          vtu_error: result,
        });
      }

      return res.status(200).json({
        status: true,
        message: "Meter validated successfully",
        result,
      });
    } catch (vtuError) {
      console.error("🔥 VTU API ERROR:", vtuError.message);
      return res.status(500).json({
        status: "fail",
        message: "Failed to connect to VTU service",
        error: vtuError.message,
      });
    }
  } catch (error) {
    console.error("🔥 Validation error:", error);

    return res.status(500).json({
      status: "fail",
      message: error.message || "An unexpected error occurred",
    });
  }
};

const rechargeMeter = async (req, res) => {
  console.log("================= 🔌 METER RECHARGE START =================");

  try {
    /** 🔹 RAW REQUEST */
    console.log("📥 RAW req.body:", req.body);
    console.log("👤 req.user:", req.user);

    const {
      disco_name,
      amount,
      meter_number,
      MeterType,
      customer_number,
      meter_name,
      meter_address,
    } = req.body;

    const userId = req.user?._id;

    /** 🔹 PARSED PAYLOAD */
    console.log("📦 Parsed Payload:", {
      disco_name,
      amount,
      meter_number,
      MeterType,
      customer_number,
      meter_name,
      meter_address,
      userId,
    });

    /** 🔹 VALIDATION */
    if (
      !disco_name ||
      !meter_number ||
      !amount ||
      !MeterType ||
      !customer_number ||
      !meter_name ||
      !meter_address
    ) {
      console.error("❌ Validation failed: Missing fields");

      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: disco_name, meter_number, amount, customer_number, MeterType, meter_name, meter_address",
        received: req.body,
      });
    }

    if (isNaN(amount) || amount <= 0) {
      console.error("❌ Invalid amount:", amount);

      return res.status(400).json({
        status: "fail",
        message: "Invalid amount",
        receivedAmount: amount,
      });
    }

    /** 🔹 WALLET CHECK */
    console.log("🔍 Fetching wallet for user:", userId);

    const wallet = await Wallet.findOne({ user: userId });

    console.log("💰 Wallet:", wallet);

    if (!wallet) {
      console.error("❌ Wallet not found");

      return res.status(404).json({
        status: "fail",
        message: "Wallet not found",
      });
    }

    if (wallet.balance < amount) {
      console.error("❌ Insufficient balance");

      return res.status(400).json({
        status: "fail",
        message: `Insufficient wallet balance`,
        available: wallet.balance,
        required: amount,
      });
    }

    /** 🔹 TRANSACTION INIT */
    const reference = `METER_${Date.now()}_${userId.toString().slice(-6)}`;

    console.log("🧾 Creating pending transaction:", reference);

    const transaction = await Transaction.create({
      user: userId,
      type: "meter recharge",
      disco: disco_name,
      meterNumber: meter_number,
      name: meter_name,
      meterAddress: meter_address,
      phone: customer_number,
      amount,
      meterType: METERTYPE_MAP[MeterType],
      reference,
      status: "pending",
      description: `${disco_name} Meter recharge for ${meter_number}`,
    });

    console.log("🧾 Transaction created:", transaction._id);

    /** 🔹 VTU API CALL */
    const vtuPayload = {
      disco_name,
      amount,
      meter_number,
      MeterType,
    };

    console.log("🌍 VTU REQUEST PAYLOAD:", vtuPayload);
    console.log("🔑 Using API TOKEN:", process.env.API_TOKEN ? "YES" : "NO");

    let response;
    let rawText;
    let result;

    try {
      response = await fetch("https://geodnatechsub.com/api/billpayment/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.API_TOKEN}`,
        },
        body: JSON.stringify(vtuPayload),
      });

      console.log("🌐 VTU HTTP STATUS:", response.status);

      rawText = await response.text();
      console.log("📄 VTU RESPONSE:", rawText);

      if (!rawText || rawText.trim() === "") {
        throw new Error("Empty response from VTU provider");
      }

      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("❌ VTU RESPONSE NOT JSON");
        throw new Error("Invalid VTU JSON response");
      }
    } catch (networkErr) {
      console.error("❌ VTU NETWORK ERROR:", networkErr);

      transaction.status = "failed";
      transaction.vtuResponse = {
        error: networkErr.message,
        raw: rawText,
      };
      await transaction.save();

      return res.status(502).json({
        status: "fail",
        message: "VTU service unreachable",
        error: networkErr.message,
      });
    }

    console.log("📊 PARSED VTU RESPONSE:", result);

    /** 🔹 VTU RESULT HANDLING */
    if (result.status === "success" || result.Status === "successful") {
      console.log("✅ VTU SUCCESS");

      transaction.status = "success";
      transaction.reference = result.orderid || transaction.reference;
      transaction.vtuResponse = result;
      await transaction.save();

      console.log("💸 Deducting wallet balance:", amount);

      const updatedWallet = await Wallet.findOneAndUpdate(
        { user: userId },
        { $inc: { balance: -amount, totalSpent: amount } },
        { new: true },
      );

      console.log("💰 Wallet after deduction:", updatedWallet);

      return res.status(200).json({
        status: true,
        message: "Meter recharge successful",
        data: {
          transaction,
          wallet: {
            balance: updatedWallet.balance,
            totalSpent: updatedWallet.totalSpent,
          },
          vtu_response: result,
        },
      });
    }

    /** 🔹 VTU FAILURE */
    console.error("❌ VTU FAILED RESPONSE");

    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || result.Message || "Meter recharge failed",
      vtu_response: result,
    });
  } catch (error) {
    console.error("🔥 UNHANDLED SERVER ERROR:", error);

    return res.status(500).json({
      status: "fail",
      message: error.message || "Internal server error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    console.log("================= 🔌 METER RECHARGE END =================");
  }
};
// const validateCable = async (req, res) => {
//   try {
//     /* --------------------------------------------------
//      * 1️⃣ Extract & log request payload
//      * -------------------------------------------------- */
//     const { cableName, iucNumber } = req.body;

//     console.log("📥 New Payload:", cableName, iucNumber);
//     const userId = req.user._id;

//     /* --------------------------------------------------
//      * 2️⃣ Validate request payload
//      * -------------------------------------------------- */
//     if (!cableName || !iucNumber) {
//       console.error("❌ Validation Error: Missing fields");

//       return res.status(400).json({
//         status: "fail",
//         message: "Missing required fields: cable name, smart card / IUC number",
//       });
//     }

//     // if (isNaN(amount) || amount <= 0) {
//     //   console.error("❌ Validation Error: Invalid amount", amount);

//     //   return res.status(400).json({
//     //     status: "fail",
//     //     message: "Invalid amount. Minimum = ₦500",
//     //   });
//     // }

//     /* --------------------------------------------------
//      * 3️⃣ Validate meter details
//      * -------------------------------------------------- */
//     try {
//       console.log("🚀 Calling meter validate API...");

//       const response = await fetch(
//         `https://geodnatechsub.com/api/validateiuc?smart_card_number=${iucNumber}&cablename=${cableName}`,
//         {
//           // method: 'POST',
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Token ${process.env.API_TOKEN}`,
//           },
//         }
//       );

//       const rawText = await response.text();

//       console.log("Raw text", rawText);

//       let result;
//       try {
//         result = JSON.parse(rawText);
//       } catch (err) {
//         throw new Error("VTU returned non-JSON response");
//       }

//       /* --------------------------------------------------
//        * 6️⃣ Detect VTU failure
//        * -------------------------------------------------- */

//       if (result.invalid) {
//         console.error("❌ VTU rejected request:", result);

//         return res.status(400).json({
//           status: "fail",
//           message: result.message || result.error || "IUC validation failed",
//           vtu_error: result,
//         });
//       }

//       return res.status(200).json({
//         status: true,
//         message: "IUC validated successfully",
//         result,
//       });
//     } catch (vtuError) {
//       console.error("🔥 VTU API ERROR:", vtuError.message);
//       return res.status(500).json({
//         status: "fail",
//         message: "Failed to connect to VTU service",
//         error: vtuError.message,
//       });
//     }
//   } catch (error) {
//     console.error("🔥 Validation error:", error);

//     return res.status(500).json({
//       status: "fail",
//       message: error.message || "An unexpected error occurred",
//     });
//   }
// };

const validateCable = async (req, res) => {
  console.log("🟢 ===== VALIDATE CABLE START =====");

  try {
    /* --------------------------------------------------
     * 1️⃣ Extract & log request payload
     * -------------------------------------------------- */
    console.log("📥 RAW req.body:", req.body);
    console.log("📥 RAW req.headers:", req.headers);

    const { cableName, iucNumber } = req.body;
    const userId = req.user?._id;

    console.log("📦 Extracted Payload:", {
      cableName,
      iucNumber,
    });

    console.log("👤 Authenticated User ID:", userId || "NOT FOUND");

    /* --------------------------------------------------
     * 2️⃣ Validate request payload
     * -------------------------------------------------- */
    if (!cableName || !iucNumber) {
      console.error("❌ Validation Error: Missing fields", {
        cableName,
        iucNumber,
      });

      return res.status(400).json({
        status: "fail",
        message: "Missing required fields: cable name, smart card / IUC number",
      });
    }

    /* --------------------------------------------------
     * 3️⃣ Call VTU IUC validation API
     * -------------------------------------------------- */
    try {
      const vtuUrl = `https://geodnatechsub.com/api/validateiuc?smart_card_number=${iucNumber}&cablename=${cableName}`;

      console.log("🚀 Calling VTU Validate IUC API...");
      console.log("🌐 VTU URL:", vtuUrl);
      console.log("🔑 Using API TOKEN:", process.env.API_TOKEN ? "YES" : "NO");

      const response = await fetch(vtuUrl, {
        headers: {
          Authorization: `Token ${process.env.API_TOKEN}`,
        },
      });

      console.log("🌐 VTU HTTP STATUS:", response.status);

      const rawText = await response.text();
      console.log("📄 RAW VTU RESPONSE:", rawText);

      let result;
      try {
        result = JSON.parse(rawText);
        console.log("📊 PARSED VTU RESPONSE:", result);
      } catch (err) {
        console.error("❌ VTU RESPONSE NOT JSON");
        throw new Error("VTU returned non-JSON response");
      }

      /* --------------------------------------------------
       * 4️⃣ Detect VTU failure
       * -------------------------------------------------- */
      if (result.invalid === true) {
        console.error("❌ VTU rejected request:", result);

        return res.status(400).json({
          status: "fail",
          message: result.message || result.error || "IUC validation failed",
          vtu_error: result,
        });
      }

      /* --------------------------------------------------
       * 5️⃣ Success response
       * -------------------------------------------------- */
      console.log("✅ IUC VALIDATION SUCCESS");

      return res.status(200).json({
        status: true,
        message: "IUC validated successfully",
        result,
      });
    } catch (vtuError) {
      console.error("🔥 VTU API ERROR:", vtuError.message);
      console.error("🔥 VTU STACK TRACE:", vtuError.stack);

      return res.status(500).json({
        status: "fail",
        message: "Failed to connect to VTU service",
        error: vtuError.message,
      });
    }
  } catch (error) {
    console.error("🔥 CONTROLLER ERROR:", error.message);
    console.error("🔥 STACK TRACE:", error.stack);

    return res.status(500).json({
      status: "fail",
      message: error.message || "An unexpected error occurred",
    });
  } finally {
    console.log("🟡 ===== VALIDATE CABLE END =====");
  }
};

const rechargeCable = async (req, res) => {
  console.log("================= 🔌 CABLE RECHARGE START =================");

  try {
    /** 🔹 RAW REQUEST */
    console.log("📥 RAW req.body:", req.body);
    console.log("👤 req.user:", req.user);

    const {
      cablename,
      cableplan,
      smart_card_number,
      amount,
      customerName,
      customerNumber,
    } = req.body;

    const userId = req.user?._id;

    /** 🔹 PARSED PAYLOAD */
    console.log("📦 Parsed Payload:", {
      cablename,
      cableplan,
      smart_card_number,
      amount,
      customerName,
      customerNumber,
    });

    /** 🔹 VALIDATION */
    if (
      !cablename ||
      !cableplan ||
      !smart_card_number ||
      !amount ||
      !customerName ||
      !customerNumber
    ) {
      console.error("❌ Validation failed: Missing fields");

      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: cablename, cableplan,smart_card_number,amount,customerName,customerNumber,",
        received: req.body,
      });
    }

    if (isNaN(amount) || amount <= 0) {
      console.error("❌ Invalid amount:", amount);

      return res.status(400).json({
        status: "fail",
        message: "Invalid amount",
        receivedAmount: amount,
      });
    }

    /** 🔹 WALLET CHECK */
    console.log("🔍 Fetching wallet for user:", userId);

    const wallet = await Wallet.findOne({ user: userId });

    console.log("💰 Wallet:", wallet);

    if (!wallet) {
      console.error("❌ Wallet not found");

      return res.status(404).json({
        status: "fail",
        message: "Wallet not found",
      });
    }

    if (wallet.balance < amount) {
      console.error("❌ Insufficient balance");

      return res.status(400).json({
        status: "fail",
        message: `Insufficient wallet balance`,
        available: wallet.balance,
        required: amount,
      });
    }

    /** 🔹 TRANSACTION INIT */
    const reference = `CABLE_${Date.now()}_${userId.toString().slice(-6)}`;

    console.log("🧾 Creating pending transaction:", reference);
    const transaction = await Transaction.create({
      user: userId,
      type: "cable recharge",
      cable: cablename,
      IUC: smart_card_number,
      plan: cableplan,
      amount,
      name: customerName,
      phone: customerNumber,
      reference,
      status: "pending",
      description: `${cable} Cable recharge OF ${iucNumber} for ${customerName}`,
    });

    console.log("🧾 Transaction created:", transaction._id);

    /** 🔹 VTU API CALL */
    const vtuPayload = {
      cablename,
      cableplan,
      smart_card_number,
    };

    console.log("🌍 VTU REQUEST PAYLOAD:", vtuPayload);
    console.log("🔑 Using API TOKEN:", process.env.API_TOKEN ? "YES" : "NO");

    let response;
    let rawText;
    let result;

    try {
      response = await fetch("https://geodnatechsub.com/api/billpayment/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.API_TOKEN}`,
        },
        body: JSON.stringify(vtuPayload),
      });

      console.log("🌐 VTU HTTP STATUS:", response.status);

      rawText = await response.text();
      console.log("📄 VTU RESPONSE:", rawText);

      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("❌ VTU RESPONSE NOT JSON");
        throw new Error("Invalid VTU JSON response");
      }
    } catch (networkErr) {
      console.error("❌ VTU NETWORK ERROR:", networkErr);

      transaction.status = "failed";
      transaction.vtuResponse = {
        error: networkErr.message,
        raw: rawText,
      };
      await transaction.save();

      return res.status(502).json({
        status: "fail",
        message: "VTU service unreachable",
        error: networkErr.message,
      });
    }

    console.log("📊 PARSED VTU RESPONSE:", result);

    /** 🔹 VTU RESULT HANDLING */
    if (result.status === "success" || result.Status === "successful") {
      console.log("✅ VTU SUCCESS");

      transaction.status = "success";
      transaction.reference = result.orderid || transaction.reference;
      transaction.vtuResponse = result;
      await transaction.save();

      console.log("💸 Deducting wallet balance:", amount);

      const updatedWallet = await Wallet.findOneAndUpdate(
        { user: userId },
        { $inc: { balance: -amount, totalSpent: amount } },
        { new: true },
      );

      console.log("💰 Wallet after deduction:", updatedWallet);

      return res.status(200).json({
        status: true,
        message: "Cable recharge successful",
        data: {
          transaction,
          wallet: {
            balance: updatedWallet.balance,
            totalSpent: updatedWallet.totalSpent,
          },
          vtu_response: result,
        },
      });
    }

    /** 🔹 VTU FAILURE */
    console.error("❌ VTU FAILED RESPONSE");

    transaction.status = "failed";
    transaction.vtuResponse = result;
    await transaction.save();

    return res.status(400).json({
      status: "fail",
      message: result.message || result.Message || "Cable recharge failed",
      vtu_response: result,
    });
  } catch (error) {
    console.error("🔥 UNHANDLED SERVER ERROR:", error);

    return res.status(500).json({
      status: "fail",
      message: error.message || "Internal server error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    console.log("================= 🔌 CABLE RECHARGE END =================");
  }
};

module.exports = {
  getAllDataPlans,
  buyData,
  buyAirtime,
  validateMeter,
  rechargeMeter,
  validateCable,
  rechargeCable,
};
