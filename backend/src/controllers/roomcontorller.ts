import type { Request,Response } from "express";
import { room ,user}  from "../db/schema.js"
import { db } from "../db/postgres.js"
import {eq} from "drizzle-orm"
import { f1 } from "../../f1.js";
import { f2 } from "../../f2.js";
 import {roomcodeHashmap}  from "../websockets/room.js";
export async function createroom(req:Request , res:Response ) {
    const {name , description , roomcode , active = true} = req.body;

    try{
        if(!name || !description || !roomcode){
            return res.status(411).json({success:false,message:"Please provide all the required fields"})
        }
        const createroom = await db.insert(room).values({
            name,
            description,
            roomcode,
            active
        })
            if(roomcodeHashmap.get(roomcode)){
                return res.status(411).json({success:false,message:"Room code already exists"})
            }
             roomcodeHashmap.set(roomcode,name);
            console.log(roomcodeHashmap);
            f2(roomcodeHashmap)
              
        return res.status(200).json({success:true,message:"Room created successfully",data:JSON.stringify(roomcodeHashmap)})
    }catch(e){
        return res.json({success:false,message:`${e}`})
    }
}

export async function  activeroomcode(req:Request , res:Response){
      try{
          const getallrooms = await db.select().from(room);
        return res.status(200).json({success:true,message:"Room code activated successfully",data:getallrooms})
      }catch(e){
        return res.json({success:false,message:`${e}`})
      }
}

export async function validatingroomcode(req:Request ,res:Response ){
   
    const{roomcode,name} = req.body;
    try{
       const checkroom = await db.select().from(room).where(eq(room.roomcode,roomcode));
       const validateuser = await db.select().from(user).where(eq(user.name,name)); 
       if(!checkroom[0]){
        return res.status(411).json({success:false,message:"Please provide valid room code"})
       }
       if(!validateuser[0]){
        return res.status(411).json({success:false,message:"Please provide valid username"})
       }
       const extractname = validateuser[0].name;
     if(!roomcodeHashmap.has(roomcode)){
        return res.status(411).json({success:false,message:"Room code is not active"})
     }
       f1(roomcode,extractname);
       return res.status(200).json({success:true,message:"Room code validated successfully",roomcode , extractname});

    }catch(e){
        return res.json({success:false,message:`${e}`})
    }
    
}