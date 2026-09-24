import { Router } from "express";
import { me, signup ,signin} from "../controllers/usercontroller.js";
import {verify } from "../middleware/verify.js";

const router = Router();

router.post('/signup',signup);
router.post('/signin', signin);
router.get('/me', verify, me);

export default router;