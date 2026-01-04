const Transaction = require("../models/transactionModel");
const Wallet = require("../models/walletModel");

// VTU.ng API Configuration
const VTU_BASE_URL = "https://vtu.ng/wp-json";
const VTU_USERNAME = process.env.VTU_USERNAME;
const VTU_PASSWORD = process.env.VTU_PASSWORD;

// Network mapping
// const NETWORK_MAPPING = {
//   'MTN': '1',
//   'AIRTEL': '2',
//   'GLO': '3',
//   '9MOBILE': '4'
// };

const getDataPlans = async (req, res) => {
  try {
    const response = await fetch(`https://geodnatechsub.com/api/user/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const result = await response.json();

    res.status(200).json({
      status: "success",
      data: result.Dataplans,
      result,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

const getBalance = async (req, res) => {
  try {
    const response = await fetch(`${VTU_BASE_URL}/api/v2/balance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: VTU_USERNAME,
        password: VTU_PASSWORD,
      }),
    });

    const data = await response.json();

    res.status(200).json({
      status: "success",
      data,
    });
  } catch (error) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

const buyData = async (req, res) => {
  try {
    const { network, mobile_number, plan, amount, Ported_number } = req.body;
    const userId = req.user._id;

    // Validation
    if (!network || !mobile_number || !plan || !amount) {
      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: network, mobile_number, plan, amount",
      });
    }

    // Validate amount is a positive number
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid amount",
      });
    }

    // Check wallet balance
    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res.status(404).json({
        status: "fail",
        message: "Wallet not found",
      });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({
        status: "fail",
        message: `Insufficient wallet balance. Available: ₦${wallet.balance}, Required: ₦${amount}`,
      });
    }

    // Generate unique reference
    const reference = `DATA_${Date.now()}_${userId.toString().slice(-6)}`;

    // Create transaction record with pending status
    const transaction = await Transaction.create({
      user: userId,
      type: "data",
      phone: mobile_number,
      network,
      amount,
      reference,
      status: "pending",
      description: `${plan} data purchase for ${mobile_number}`,
    });

    try {
      // Call geodnatechsub.com API 1
      console.log("🔵 Calling VTU API...");

      const response = await fetch("https://geodnatechsub.com/api/data/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.API_TOKEN}`,
        },
        body: JSON.stringify({
          network,
          mobile_number,
          plan,
          Ported_number: "true",
        }),
      });

      // Check if response is ok
      if (!response.ok) {
        throw new Error(`VTU API returned status ${response.status}`);
      }

      const result = await response.json();

      // FIXED: Changed from 'vtuData' to 'result'
      if (result.status === "success" || result.Status === "successful") {
        // Update transaction to success
        transaction.status = "success";
        transaction.reference = result.orderid || result.api_response;
        transaction.vtuResponse = result;
        await transaction.save();

        // Deduct from wallet atomically
        const updatedWallet = await Wallet.findOneAndUpdate(
          { user: userId },
          {
            $inc: {
              balance: -amount,
              totalSpent: amount,
            },
          },
          { new: true }
        );

        return res.status(200).json({
          status: "success",
          message: "Data purchase successful",
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
      } else {
        // Update transaction to failed
        transaction.status = "failed";
        transaction.vtuResponse = result;
        await transaction.save();

        return res.status(400).json({
          status: "fail",
          message: result.message || result.Message || "Data purchase failed",
          error: result,
        });
      }
    } catch (vtuError) {
      // Update transaction to failed
      transaction.status = "failed";
      transaction.vtuResponse = {
        error: vtuError.message,
        timestamp: new Date(),
      };
      await transaction.save();

      return res.status(500).json({
        status: "fail",
        message: "Failed to connect to VTU service",
        error: vtuError.message,
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "fail",
      message:
        error.message || "An error occurred while processing your request",
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

    console.log("📥 Incoming Payload:", {
      network,
      mobile_number,
      airtime_type,
      amount,
    });

    /* --------------------------------------------------
     * 2️⃣ Validate request payload
     * -------------------------------------------------- */
    if (!network || !mobile_number || !airtime_type || !amount) {
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
      console.log("🚀 Calling VTU Airtime API...");
      console.log("📡 VTU Payload:", {
        network,
        amount,
        mobile_number,
        airtime_type,
        Ported_number: true,
      });

      const response = await fetch("https://geodnatechsub.com/api/topup/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.API_TOKEN}`,
        },
        body: JSON.stringify({
          network,
          amount,
          mobile_number,
          airtime_type,
          Ported_number: true,
        }),
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
        { new: true }
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

    console.log("📥 Incoming Payload:", {
      disco_name,
      meter_number,
      MeterType,
      amount,
    });

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
        message: "Invalid amount",
      });
    }

    /* --------------------------------------------------
     * 3️⃣ Validate meter details
     * -------------------------------------------------- */
    try {
      console.log("🚀 Calling meter validate API...");

      const response = await fetch(
        `https://geodnatechsub.com/api/validatemeter?meternumber=${meter_number}&disconame=${disco_name}&mtype=${MeterType}`,
        {
          // method: 'POST',
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${process.env.API_TOKEN}`,
          },
        }
      );

      const rawText = await response.text();
      console.log("📩 Raw Meter validate :", rawText);

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
  try {
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

    // Validation
    if (
      !disco_name ||
      !meter_number ||
      !amount ||
      !MeterType ||
      !customer_number ||
      !meter_name ||
      !meter_address
    ) {
      return res.status(400).json({
        status: "fail",
        message:
          "Missing required fields: disco_name, meter_number, amount, customer_number, MeterType, meter_name, meter_address",
      });
    }

    // Validate amount is a positive number
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid amount",
      });
    }

    // Check wallet balance
    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res.status(404).json({
        status: "fail",
        message: "Wallet not found",
      });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({
        status: "fail",
        message: `Insufficient wallet balance. Available: ₦${wallet.balance}, Required: ₦${amount}`,
      });
    }

    // Generate unique reference
    const reference = `METER_${Date.now()}_${userId.toString().slice(-6)}`;

    // Create transaction record with pending status
    const transaction = await Transaction.create({
      user: userId,
      type: "Meter Recharge",
      disco: disco_name,
      meter: meter_number,
      name: meter_name,
      address: meter_address,
      phone: customer_number,
      amount,
      meterType: MeterType,
      reference,
      status: "pending",
      description: `${disco_name} Meter recharge for ${meter_number} of ${meter_address} belonging to ${meter_name}`,
    });

    try {
      // Call geodnatechsub.com API 1
      console.log("🔵 Calling VTU API...");

      const response = await fetch("https://geodnatechsub.com/api/data/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.API_TOKEN}`,
        },
        body: JSON.stringify({
          disco_name,
          amount,
          meter_number,
          MeterType,
        }),
      });

      // Check if response is ok
      if (!response.ok) {
        throw new Error(`VTU API returned status ${response.status}`);
      }

      const result = await response.json();

      // FIXED: Changed from 'vtuData' to 'result'
      if (result.status === "success" || result.Status === "successful") {
        // Update transaction to success
        transaction.status = "success";
        transaction.reference = result.orderid || result.api_response;
        transaction.vtuResponse = result;
        await transaction.save();

        // Deduct from wallet atomically
        const updatedWallet = await Wallet.findOneAndUpdate(
          { user: userId },
          {
            $inc: {
              balance: -amount,
              totalSpent: amount,
            },
          },
          { new: true }
        );

        return res.status(200).json({
          status: "success",
          message: "Data purchase successful",
          data: {
            transaction: {
              id: transaction._id,
              reference: transaction.reference,
              type: transaction.type,
              disco: transaction.disco,
              meter: transaction.meter,
              phone: transaction.phone,
              name: transaction.name,
              address: transaction.address,
              amount: transaction.amount,
              status: transaction.status,
            },
            wallet: {
              balance: updatedWallet.balance,
              totalSpent: updatedWallet.totalSpent,
            },
            vtu_response: result,
          },
        });
      } else {
        // Update transaction to failed
        transaction.status = "failed";
        transaction.vtuResponse = result;
        await transaction.save();

        return res.status(400).json({
          status: "fail",
          message: result.message || result.Message || "Meter recharge failed",
          error: result,
        });
      }
    } catch (vtuError) {
      // Update transaction to failed
      transaction.status = "failed";
      transaction.vtuResponse = {
        error: vtuError.message,
        timestamp: new Date(),
      };
      await transaction.save();

      return res.status(500).json({
        status: "fail",
        message: "Failed to connect to VTU service",
        error: vtuError.message,
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "fail",
      message:
        error.message || "An error occurred while processing your request",
    });
  }
};

module.exports = {
  getDataPlans,
  buyData,
  buyAirtime,
  getBalance,
  validateMeter,
  rechargeMeter,
};
