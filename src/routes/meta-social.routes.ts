import { Router } from "express";

import {
  verifyFacebookWebhook,
  handleFacebookWebhook,
} from "../controllers/facebook-webhook-controller";
import {
  verifyInstagramWebhook,
  handleInstagramWebhook,
} from "../controllers/instagram-webhook-controller";
import { verifyMetaSignature } from "../middlewares/verify-meta-signature.middleware";
import { config } from "../config/env";

const metaSocialRouter = Router();

metaSocialRouter.get("/facebook", verifyFacebookWebhook);
metaSocialRouter.post("/facebook", verifyMetaSignature(config.app.facebookAppSecret), handleFacebookWebhook);

metaSocialRouter.get("/instagram", verifyInstagramWebhook);
metaSocialRouter.post("/instagram", verifyMetaSignature(config.app.instagramAppSecret), handleInstagramWebhook);

export default metaSocialRouter;
