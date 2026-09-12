"use strict";

require("dotenv").config();

const express = require("express");
const crypto = require("crypto");

const app = express();

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 3000;

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;

// Set this to the Graph API version you are using in Meta.
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v24.0";

const GRAPH_BASE_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;


/*
|--------------------------------------------------------------------------
| Basic validation
|--------------------------------------------------------------------------
*/

if (!WEBHOOK_VERIFY_TOKEN) {
    console.warn("WARNING: WEBHOOK_VERIFY_TOKEN is not set");
}

if (!INSTAGRAM_ACCESS_TOKEN) {
    console.warn("WARNING: INSTAGRAM_ACCESS_TOKEN is not set");
}

if (!INSTAGRAM_ACCOUNT_ID) {
    console.warn("WARNING: INSTAGRAM_ACCOUNT_ID is not set");
}

if (!META_APP_SECRET) {
    console.warn("WARNING: META_APP_SECRET is not set");
}


/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
|
| We keep the raw request body because Meta's webhook signature is
| calculated against the original raw body.
|
*/

app.use(
    express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf;
        },
    })
);


/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        service: "Beacon DM Backend",
        status: "running",
        timestamp: new Date().toISOString(),
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});


/*
|--------------------------------------------------------------------------
| Meta Webhook Verification
|--------------------------------------------------------------------------
|
| Meta sends:
|
| GET /webhook?
|   hub.mode=subscribe
|   hub.verify_token=YOUR_TOKEN
|   hub.challenge=SOME_RANDOM_VALUE
|
*/

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("Webhook verification request received");

    if (!mode || !token || !challenge) {
        return res.status(400).send("Missing verification parameters");
    }

    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
        console.log("Webhook verified successfully");

        return res.status(200).send(challenge);
    }

    console.error("Webhook verification failed");

    return res.status(403).send("Forbidden");
});


/*
|--------------------------------------------------------------------------
| Meta Signature Verification
|--------------------------------------------------------------------------
|
| Meta sends:
|
| X-Hub-Signature-256:
| sha256=xxxxxxxxxxxxxxxx
|
*/

function verifyMetaSignature(req) {
    if (!META_APP_SECRET) {
        console.warn(
            "META_APP_SECRET is not configured. Skipping signature verification."
        );

        return true;
    }

    const signature = req.headers["x-hub-signature-256"];

    if (!signature) {
        console.error("Missing X-Hub-Signature-256 header");
        return false;
    }

    if (!req.rawBody) {
        console.error("Raw request body is missing");
        return false;
    }

    const expectedSignature =
        "sha256=" +
        crypto
            .createHmac("sha256", META_APP_SECRET)
            .update(req.rawBody)
            .digest("hex");

    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
}


/*
|--------------------------------------------------------------------------
| Instagram Webhook
|--------------------------------------------------------------------------
|
| Meta sends Instagram events here.
|
*/

app.post("/webhook", async (req, res) => {
    /*
     * IMPORTANT:
     * Respond quickly to Meta.
     *
     * We acknowledge the webhook first, then process the payload.
     */

    if (!verifyMetaSignature(req)) {
        console.error("Invalid Meta webhook signature");

        return res.status(403).send("Invalid signature");
    }

    // Acknowledge immediately.
    res.status(200).send("EVENT_RECEIVED");

    try {
        const body = req.body;

        console.log("\n========================================");
        console.log("Instagram webhook received");
        console.log("========================================");

        console.log(JSON.stringify(body, null, 2));

        /*
        |--------------------------------------------------------------------------
        | Validate object
        |--------------------------------------------------------------------------
        */

        if (!body || body.object !== "instagram") {
            console.log("Ignoring non-Instagram webhook");

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Process entries
        |--------------------------------------------------------------------------
        */

        const entries = body.entry || [];

        for (const entry of entries) {
            const messagingEvents = entry.messaging || [];

            for (const event of messagingEvents) {
                await processInstagramMessage(event);
            }
        }
    } catch (error) {
        console.error("Webhook processing error:", error);
    }
});


/*
|--------------------------------------------------------------------------
| Process Instagram Messaging Event
|--------------------------------------------------------------------------
*/

async function processInstagramMessage(event) {
    console.log("\n----------------------------------------");
    console.log("Messaging event");
    console.log("----------------------------------------");

    /*
     * Ignore echo messages.
     *
     * Echo messages are messages sent by your own Instagram account/app.
     */

    if (event.message?.is_echo) {
        console.log("Ignoring echo message");
        return;
    }

    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;

    const message = event.message;

    if (!senderId) {
        console.log("No sender ID");
        return;
    }

    /*
     |--------------------------------------------------------------------------
     | Text message
     |--------------------------------------------------------------------------
     */

    if (message?.text) {
        const text = message.text;

        console.log("Sender:", senderId);
        console.log("Recipient:", recipientId);
        console.log("Message:", text);
        console.log("Message ID:", message.mid);
        console.log(
            "Timestamp:",
            event.timestamp
                ? new Date(event.timestamp).toISOString()
                : "unknown"
        );

        /*
         * ==============================================================
         * THIS IS WHERE YOU CONNECT YOUR DATABASE / AI / INBOX LOGIC
         * ==============================================================
         *
         * Example:
         *
         * await saveMessage({
         *     instagramUserId: senderId,
         *     messageId: message.mid,
         *     text,
         *     direction: "incoming"
         * });
         *
         * Then you can emit it through Socket.IO:
         *
         * io.emit("instagram_message", {...});
         *
         */

        return;
    }

    /*
     |--------------------------------------------------------------------------
     | Attachments
     |--------------------------------------------------------------------------
     */

    if (message?.attachments) {
        console.log("Sender:", senderId);
        console.log("Attachments:", message.attachments);

        /*
         * Save attachment information to your database here.
         */

        return;
    }

    /*
     |--------------------------------------------------------------------------
     | Quick replies / postbacks / other events
     |--------------------------------------------------------------------------
     */

    if (event.postback) {
        console.log("Postback:", event.postback);
        return;
    }

    if (event.reaction) {
        console.log("Reaction:", event.reaction);
        return;
    }

    console.log("Unhandled Instagram event");
}


/*
|--------------------------------------------------------------------------
| Send Instagram Message
|--------------------------------------------------------------------------
|
| Your frontend can call:
|
| POST /api/messages/send
|
| {
|     "recipientId": "...",
|     "text": "Hello!"
| }
|
*/

app.post("/api/messages/send", async (req, res) => {
    try {
        const { recipientId, text } = req.body;

        /*
         * Validate request
         */

        if (!recipientId) {
            return res.status(400).json({
                success: false,
                error: "recipientId is required",
            });
        }

        if (!text) {
            return res.status(400).json({
                success: false,
                error: "text is required",
            });
        }

        /*
         * Validate configuration
         */

        if (!INSTAGRAM_ACCESS_TOKEN) {
            return res.status(500).json({
                success: false,
                error: "Instagram access token is not configured",
            });
        }

        if (!INSTAGRAM_ACCOUNT_ID) {
            return res.status(500).json({
                success: false,
                error: "Instagram account ID is not configured",
            });
        }

        /*
         * Send message to Instagram
         */

        const result = await sendInstagramMessage(
            recipientId,
            text
        );

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Send message error:", error);

        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


/*
|--------------------------------------------------------------------------
| Instagram Send API
|--------------------------------------------------------------------------
*/

async function sendInstagramMessage(recipientId, text) {
    const url =
        `${GRAPH_BASE_URL}/${INSTAGRAM_ACCOUNT_ID}/messages`;

    const response = await fetch(url, {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
        },

        body: JSON.stringify({
            recipient: {
                id: recipientId,
            },

            message: {
                text: text,
            },
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Instagram API error:", data);

        throw new Error(
            data?.error?.message ||
            `Instagram API request failed (${response.status})`
        );
    }

    return data;
}


/*
|--------------------------------------------------------------------------
| Error Handler
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
    console.error("Unhandled server error:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        success: false,
        error: "Internal server error",
    });
});


/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("========================================");
    console.log(" Beacon DM Backend");
    console.log("========================================");
    console.log(`Port: ${PORT}`);
    console.log(`Webhook: /webhook`);
    console.log(`Health: /health`);
    console.log(`Send API: /api/messages/send`);
    console.log(`Graph API: ${GRAPH_BASE_URL}`);
    console.log("========================================");
    console.log("");
});