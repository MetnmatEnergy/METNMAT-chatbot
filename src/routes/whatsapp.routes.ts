import { Router } from "express";

import { subscribeWebhookController } from "../controllers/subscribe-webhook.controller";
import { metaWebhookController } from "../controllers/meta-webhook.controller";

import { metaMessageParserMiddleware } from "../middlewares/meta-message-parser.middleware";
import { verifyMetaSignature } from "../middlewares/verify-meta-signature.middleware";
import { config } from "../config/env";

const whatsappRouter = Router();

whatsappRouter.get("/meta", subscribeWebhookController);

// Verify the Meta App-Secret signature on inbound POSTs before processing.
whatsappRouter.post(
  "/meta",
  verifyMetaSignature(config.app.metaAppSecret),
  metaMessageParserMiddleware,
  metaWebhookController,
);

export default whatsappRouter;