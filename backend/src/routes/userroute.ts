import { Router } from "express";
import { me, signup, signin, signout, updateProfile } from "../controllers/usercontroller.js";
import {verify } from "../middleware/verify.js";

const router = Router();

router.post('/signup',signup);
router.post('/signin', signin);
router.get('/me', verify, me);
router.patch('/profile', verify, updateProfile);
router.post('/signout', signout);

export default router;