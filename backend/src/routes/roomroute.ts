import Router from "express"
import { createroom ,activeroomcode,validatingroomcode} from "../controllers/roomcontorller.js";
import { verify } from "../middleware/verify.js";
const router =  Router();
 
router.post("/createroom", verify, createroom);
router.get("/getallroomcode", verify, activeroomcode);
router.post("/validatingroomcode", verify, validatingroomcode);


export default router;