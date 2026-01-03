const express = require('express');
const router = express.Router();
const { getTransactions, getTransaction } = require('../controllers/transactionController');
const protect = require('../middleware/auth');

router.use(protect); // Protect all transaction routes

router.route('/')
  .get(getTransactions);

router.route('/:id')
  .get(getTransaction);

module.exports = router;