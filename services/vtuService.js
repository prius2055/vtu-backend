const fetch = require("node-fetch");

const BASE_URL = "https://vtu.ng/wp-json";
let token = null; // store token in memory

// 🔑 Login and get JWT token
const getToken = async () => {
  if (token) return token;

  const res = await fetch(`${BASE_URL}/jwt-auth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.VTU_USERNAME,
      password: process.env.VTU_PASSWORD
    })
  });

  const data = await res.json();
  if (data.token) {
    token = data.token;
    return token;
  } else {
    throw new Error("Failed to fetch VTU token: " + JSON.stringify(data));
  }
};


// 📡 Generic request with auth
const vtuRequest = async (endpoint, params = "") => {
  const jwt = await getToken();
  console.log(jwt)
  const res = await fetch(`${BASE_URL}/api/v1/${endpoint}${params}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  return res.json();
};

// ✅ Example functions
const checkBalance = async () => vtuRequest("balance");

const buyAirtime = async (phone, network, amount) =>
  vtuRequest("airtime", `?phone=${phone}&network_id=${network}&amount=${amount}`);

const buyData = async (phone, network, variationId) =>
  vtuRequest("data", `?phone=${phone}&network_id=${network}&variation_id=${variationId}`);

module.exports = {
  checkBalance,
  buyAirtime,
  buyData
};
