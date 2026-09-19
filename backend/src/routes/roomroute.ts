import Router from "express"
import { createroom ,activeroomcode,validatingroomcode} from "../controllers/roomcontorller.js";
const router =  Router();
 
router.post("/createroom",createroom);
router.get("/getallroomcode",activeroomcode);
router.post("/validatingroomcode",validatingroomcode);


export default router;