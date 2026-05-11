import express from "express";
import cors from "cors";
import hotelRoutes from "./routes/hotelData.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", hotelRoutes);

app.listen(5000, () => {
  console.log("Server running on port 5000 🚀");
});