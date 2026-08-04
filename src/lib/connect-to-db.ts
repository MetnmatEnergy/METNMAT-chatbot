import dns from "node:dns";
import tls from "node:tls";
import mongoose from "mongoose";

import { config } from "../config/env";

const MONGODB_URI = config.database.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error(
        "Please define the MONGODB_URI environment variable inside .env",
    );
}

/**
 * Bun on Windows often fails `querySrv` against corporate/local DNS (ECONNREFUSED).
 * Public resolvers reliably resolve MongoDB Atlas SRV records.
 */
if (MONGODB_URI.startsWith("mongodb+srv://")) {
    const dnsServers = (process.env.MONGODB_DNS_SERVERS || "8.8.8.8,1.1.1.1")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (dnsServers.length) {
        dns.setServers(dnsServers);
    }
}

// Disable command buffering globally to avoid timeouts when not connected
mongoose.set("bufferCommands", false);

// Connection event logging
mongoose.connection.on("connected", () => {
    console.log("MongoDB connected");
});

mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error", { error: err });
});

mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
});

const cached: { conn: any; promise: any } = (global as any).mongoose || {
    conn: null,
    promise: null,
};

if (!(global as any).mongoose) {
    (global as any).mongoose = cached;
}

async function connectToDb() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            /**
             * TLS hostname verification. Bun's node:tls shim sometimes passes a
             * null `cert`, and the DEFAULT checkServerIdentity then crashes
             * destructuring it ("Cannot destructure property 'subject'..."). So:
             * when we DO have a real cert, run the standard hostname check
             * (rejecting a valid-CA-but-wrong-host cert — i.e. a MITM); only skip
             * the extra hostname check on the null-cert edge case. The TLS chain
             * itself is still validated by the driver in every case.
             */
            checkServerIdentity: (hostname: string, cert: tls.PeerCertificate) => {
                if (cert && typeof cert === "object" && "subject" in cert) {
                    return tls.checkServerIdentity(hostname, cert);
                }
                return undefined;
            },
        };
        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
            return mongooseInstance;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

export default connectToDb;
