const express = require("express");
const { checkBalance, buyAirtime, buyData } = require("../services/vtuService");

const router = express.Router();

router.get("/balance", async (req, res) => {
  try {
    const balance = await checkBalance();
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/airtime", async (req, res) => {
  const { phone, network, amount } = req.body;
  try {
    const result = await buyAirtime(phone, network, amount);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/data", async (req, res) => {
  const { phone, network, variationId } = req.body;
  try {
    const result = await buyData(phone, network, variationId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
