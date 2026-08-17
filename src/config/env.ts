import dotenv from 'dotenv';
dotenv.config();

export const config = {
    database: {
        MONGODB_URI: process.env.MONGODB_URI!,
    },
    pinecone: {
        apiKey: process.env.PINECONE_API_KEY!,
        indexName: process.env.PINECONE_INDEX_NAME!,
        namespace: process.env.PINECONE_NAMESPACE!,
    },
    // OpenAI serves both the chat models and the embeddings. Before this it was
    // split: the LLM ran on Groq while embeddings already used
    // openai/text-embedding-3-small, so the deployment needed two provider keys
    // and embedding-model.ts checked the wrong one.
    openai: {
        apiKey: process.env.OPENAI_API_KEY!,
    },
    app: {
        port: process.env.PORT || 3001,
        // No public literal fallback — a clearly-dev value for local only; prod is
        // enforced by assertConfig() (fail-fast).
        jwtSecret: process.env.JWT_SECRET || "dev-insecure-jwt-secret-do-not-use",
        publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`,
        // No wildcard default in production — origins must be explicit (assertConfig).
        allowedOrigins: (process.env.ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "*"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        // Sites allowed to embed the chat iframe (CSP frame-ancestors). Defaults to
        // the METNMAT domains; override with WIDGET_FRAME_ANCESTORS (space-separated).
        frameAncestors:
            process.env.WIDGET_FRAME_ANCESTORS || "'self' https://www.metnmat.com https://metnmat.com",
        // Secret an agent console must present (x-agent-key) to mint an agent token
        // or list conversations. Unset → those endpoints are disabled (fail closed).
        agentApiKey: process.env.AGENT_API_KEY || "",
        // Meta App Secret(s) for webhook signature verification (x-hub-signature-256).
        metaAppSecret: process.env.META_APP_SECRET || "",
        facebookAppSecret: process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || "",
        instagramAppSecret: process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "",
    },
    whatsapp: {
        accessToken: process.env.Meta_WA_accessToken!,
        phoneNumberId: process.env.Meta_WA_SenderPhoneNumberId!,
        wabaId: process.env.Meta_WA_wabaId!,
        verifyToken: process.env.Meta_WA_VerfyToken!,
        webHookUrl: process.env.WHATSAPP_WEBHOOK_URL!,
    },
    facebook: {
        pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN!,
        verifyToken: process.env.FACEBOOK_VERIFY_TOKEN!,
        graphApiVersion: process.env.FACEBOOK_GRAPH_API_VERSION || "v18.0",
    },
    instagram: {
        verifyToken: process.env.Meta_IG_VerifyToken!,
        accessToken: process.env.Meta_IG_AccessToken!,
    },
};

/**
 * Fail-fast on missing/insecure required env in production (called at server
 * start). Keeps a misconfigured deploy from silently booting with a forgeable
 * JWT secret or wildcard CORS.
 */
export function assertConfig(): void {
    if (process.env.NODE_ENV !== "production") return;
    const problems: string[] = [];
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16)
        problems.push("JWT_SECRET (set a long random value)");
    if (!process.env.ALLOWED_ORIGINS || !process.env.ALLOWED_ORIGINS.trim())
        problems.push("ALLOWED_ORIGINS (explicit origins, not '*')");
    if (!process.env.MONGODB_URI) problems.push("MONGODB_URI");
    if (!process.env.OPENAI_API_KEY) problems.push("OPENAI_API_KEY");
    if (problems.length)
        throw new Error(`[config] Missing/insecure required env in production: ${problems.join(", ")}`);
}
