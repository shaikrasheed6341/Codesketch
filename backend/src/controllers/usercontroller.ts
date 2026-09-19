import type { Request, Response } from "express";
import { db } from "../db/postgres.js";
import { user } from "../db/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { redisconnect } from "../db/redis.js";
export async function signup(req:Request , res:Response){
   const {name , email , password} = req.body;
     
   try{
     if(!name || !email || !password){
       return res.status(411).json({success:false,message:"Please provide all the required fields"})
     }
     const usercheck = await db.select().from(user).where(eq(user.email, email));
     if(usercheck.length > 0){
       return res.status(411).json({success:false,message:"User already exists"})
     }
     const salt = await bcrypt.genSalt(10);
     const hashedpassword = await bcrypt.hash(password, salt);
     const newuser = await db.insert(user).values({
       name,
       email,
       password:hashedpassword,
     })
     return res.status(200).json({success:true,message:"User created successfully"})
   }catch(e){
     return res.json({success:false,message:`${e}`})
   }
   
}

export async function signin(req:Request , res:Response){
   const {email , password} = req.body;
     
   try{
     if(!email || !password){
       return res.status(411).json({success:false,message:"Please provide all the required fields"})
     }
     const usercheck = await db.select().from(user).where(eq(user.email, email));
     if(usercheck.length === 0){
       return res.status(411).json({success:false,message:"User not found"})
     }
 
     const isPasswordValid = await bcrypt.compare(password, usercheck[0]?.password!);
     if(!isPasswordValid){
       return res.status(411).json({success:false,message:"Invalid password"})
     }
     
      

     return res.status(200).json({success:true,message:"User logged in successfully"})
   }catch(e){
     return res.json({success:false,message:`${e}`})
   }
   
}