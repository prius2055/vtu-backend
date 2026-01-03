// const express = require("express");
// const { checkBalance, buyAirtime, buyData } = require("../services/vtuService");

// const router = express.Router();

// router.get("/balance", async (req, res) => {
//   try {
//     const balance = await checkBalance();
//     res.json(balance);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// router.post("/airtime", async (req, res) => {
//   const { phone, network, amount } = req.body;
//   try {
//     const result = await buyAirtime(phone, network, amount);
//     res.json(result);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// router.post("/data", async (req, res) => {
//   const { phone, network, variationId } = req.body;
//   try {
//     const result = await buyData(phone, network, variationId);
//     res.json(result);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// module.exports = router;



const express = require('express');
const router = express.Router();
const { getBalance, buyAirtime, buyData, getDataPlans, rechargeMeter } = require('../controllers/vtuController');
const protect = require('../middleware/auth');

router.get('/balance', protect, getBalance);
router.get('/data-plans', getDataPlans);
router.post('/buy-data', protect, buyData);
router.post('/buy-airtime', protect, buyAirtime);
router.post('/recharge-meter', protect, rechargeMeter);

module.exports = router;
