import express from "express";
import hotelDataRoutes from "./routes/hotelData.routes.js";

const app = express();

app.use(express.json());

app.use("/api", hotelDataRoutes);

app.listen(5000, () => {
  console.log("Server running on port 5000 🚀");
});