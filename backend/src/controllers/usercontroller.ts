import type { Request, Response } from "express";
import { db } from "../db/postgres.js";
import { user } from "../db/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { redisconnect } from "../db/redis.js";
import Cookies from "cookies";
import jwt from "jsonwebtoken";
import type { AuthenticatedRequest } from "../middleware/verify.js";

function createToken(userId: number) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "100d" });
}

function setAuthCookie(req: Request, res: Response, token: string) {
  new Cookies(req, res).set("access_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 100 * 24 * 60 * 60 * 1000,
  });
}

export async function signup(req:Request , res:Response){
   const {name , email , password} = req.body;
     
   try{
     if(!name || !email || !password){
       return res.status(411).json({success:false,message:"Please provide all the required fields"})
     }
     const usercheck = await db
       .select({
         id: user.id,
         name: user.name,
         email: user.email,
         password: user.password,
       })
       .from(user)
       .where(eq(user.email, email));
     if(usercheck.length > 0){
       return res.status(411).json({success:false,message:"User already exists"})
     }
     const salt = await bcrypt.genSalt(10);
     const hashedpassword = await bcrypt.hash(password, salt);
     const [newuser] = await db.insert(user).values({
       name,
       email,
       password:hashedpassword,
     }).returning({ id: user.id });
     if (!newuser) {
       return res.status(500).json({success:false,message:"Unable to create user"});
     }
     const token = createToken(newuser.id);
    setAuthCookie(req, res, token);

    return res.status(201).json({success:true,message:"User created successfully", user: { name, email }})
   }catch(e){
     console.error("Signin failed:", e);
     return res.status(500).json({success:false,message:"Unable to sign in"})
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
     const currentUser = usercheck[0];
     if (!currentUser) {
       return res.status(411).json({success:false,message:"User not found"})
     }
       
     const isPasswordValid = await bcrypt.compare(password, currentUser.password);

     if(!isPasswordValid){
       return res.status(411).json({success:false,message:"Invalid password"})
     }
     
     console.log("User logged in successfully:", isPasswordValid);

    const token = createToken(currentUser.id);
     setAuthCookie(req, res, token);
     return res.status(200).json({
       success:true,
       message:"User logged in successfully",
      user: { name: currentUser.name, email: currentUser.email },
     })
   }catch(e){
     return res.json({success:false,message:`${e}`})
   }
   
}

export async function me(req: AuthenticatedRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ success: false, message: "Invalid user" });
  }

  const [currentUser] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, req.userId));

  if (!currentUser) {
    return res.status(401).json({ success: false, message: "User not found" });
  }

  return res.status(200).json({ success: true, user: currentUser });
}

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ success: false, message: "Invalid user" });
  }

  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ success: false, message: "Please provide a username" });
  }

  try {
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, name));

    if (existingUser && existingUser.id !== req.userId) {
      return res.status(409).json({ success: false, message: "Username already exists" });
    }

    const [updatedUser] = await db
      .update(user)
      .set({ name, updatedAt: new Date() })
      .where(eq(user.id, req.userId))
      .returning({ name: user.name, email: user.email });

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Profile update failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update profile" });
  }
}

export async function signout(req: Request, res: Response) {
  try {
    new Cookies(req, res).set("access_token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });


    return res.status(200).json({ success: true, message: "User signed out successfully" });
  } catch (e) {
    console.error("Signout failed:", e);
    return res.status(500).json({ success: false, message: "Unable to sign out" });
  }
}