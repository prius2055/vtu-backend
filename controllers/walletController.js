const Wallet = require('../models/walletModel');
const Transaction = require('../models/transactionModel');

const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user._id });
    
    if (!wallet) {
      wallet = await Wallet.create({
        user: req.user._id,
        balance: 0
      });
    }

    res.status(200).json({
      status: 'success',
      data: { wallet }
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

const initializeWalletFunding = async (req, res) => {

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;


  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid amount'
      });
    }

    const paymentData = {
      email: req.user.email,
      amount: amount * 100,
      currency: 'NGN',
      callback_url: 'http://localhost:3000/funding/verify',
      metadata: {
        userId: req.user._id.toString()
      }
    };

    const response = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      }
    );

    const data = await response.json();

    return res.status(200).json({
      status: 'success',
      authorization_url: data.data.authorization_url
    });

  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

const verifyWalletFunding = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment reference missing'
      });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const result = await response.json();
    const payment = result.data;

    if (payment.status !== 'success') {
      return res.status(400).json({
        status: 'fail',
        message: 'Payment not successful'
      });
    }

    const amount = payment.amount / 100;
    const userId = payment.metadata.userId;

    // 🔐 CREATE TRANSACTION FIRST
    let transaction;
    try {
      transaction = await Transaction.create({
        user: userId,
        type: 'wallet_funding',
        amount,
        reference,
        status: 'success'
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.json({
          status: 'success',
          message: 'Wallet already funded'
        });
      }
      throw err;
    }

    // 💰 ATOMIC WALLET UPDATE
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: {
          balance: amount,
          totalFunded: amount
        }
      },
      { new: true, upsert: true }
    );

    return res.json({
      status: 'success',
      data: { wallet, transaction }
    });

  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};






module.exports = {
  getWallet,
  initializeWalletFunding,
  verifyWalletFunding
};
