import {Redis} from "ioredis";
import dotenv from "dotenv"
dotenv.config();
 
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379")
export async function redisconnect() {
    try{
        await redis.connect();
        console.log("Redis connected");
        
    }catch(error){
        console.log("Error connecting to Redis", error);
        throw error;
    }
}
