const express = require('express');
const cors = require('cors');
const routes = require('./routes/auth');
const vtuRoutes = require('./routes/vtuRoutes');


const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/v1', routes);
app.use("/api/vtu", vtuRoutes);


module.exports = app;