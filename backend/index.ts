import express from "express"
import dotenv from "dotenv";
import userRoutes from "./src/routes/userroute.js";
import roomRoutes from "./src/routes/roomroute.js";
import { f1 } from "./f1.js";
import {f2} from "./f2.js";
import cors from "cors";
dotenv.config();
import "./src/websockets/websocketserver.js";

const app = express();




const FRONTEND_ORIGIN = (process.env.FRONTEND_URL ?? "").replace(/\/$/, "");

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, etc.) or matching frontend
    if (!origin || origin.replace(/\/$/, "") === FRONTEND_ORIGIN) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/user", userRoutes);
app.use("/room", roomRoutes);


app.get('/health', (req, res) => {
    res.send(' it godd!')
})



app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`)
})

