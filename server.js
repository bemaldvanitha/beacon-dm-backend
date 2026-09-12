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
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;

const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;

const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;

// Set this to the Graph API version you are using in Meta.
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v24.0";

const INSTAGRAM_GRAPH_BASE_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

const FACEBOOK_GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;


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

if (!INSTAGRAM_APP_SECRET) {
    console.warn("WARNING: INSTAGRAM_APP_SECRET is not set");
}

if (!FACEBOOK_PAGE_ACCESS_TOKEN) {
    console.warn("WARNING: FACEBOOK_PAGE_ACCESS_TOKEN is not set");
}

if (!FACEBOOK_PAGE_ID) {
    console.warn("WARNING: FACEBOOK_PAGE_ID is not set");
}

if (!FACEBOOK_APP_SECRET) {
    console.warn("WARNING: FACEBOOK_APP_SECRET is not set");
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

function verifyMetaSignature(req, secret) {
    if (!secret) {
        console.error("Webhook app secret is not configured");
        return false;
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
            .createHmac("sha256", secret)
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
    // Acknowledge Meta immediately.
    res.status(200).send("EVENT_RECEIVED");

    try {
        const body = req.body;

        console.log("\n========================================");
        console.log("Meta webhook received");
        console.log("Object:", body?.object);
        console.log("========================================");

        /*
         * Determine which Meta product sent the webhook.
         */
        let secret;

        if (body?.object === "instagram") {
            secret = INSTAGRAM_APP_SECRET;
        } else if (body?.object === "page") {
            secret = FACEBOOK_APP_SECRET;
        } else {
            console.log("Unknown webhook object:", body?.object);
            return;
        }

        /*
         * Verify the signature using the correct secret.
         */
        if (!verifyMetaSignature(req, secret)) {
            console.error(
                `Invalid ${body.object} webhook signature`
            );
            return;
        }

        console.log(
            `Valid ${body.object} webhook signature`
        );

        /*
         * Instagram
         */
        if (body.object === "instagram") {
            const entries = body.entry || [];

            for (const entry of entries) {
                const messagingEvents = entry.messaging || [];

                for (const event of messagingEvents) {
                    await processInstagramMessage(event);
                }
            }

            return;
        }

        /*
         * Facebook Page / Messenger
         */
        if (body.object === "page") {
            const entries = body.entry || [];

            for (const entry of entries) {
                const messagingEvents = entry.messaging || [];

                for (const event of messagingEvents) {
                    await processFacebookMessage(event);
                }
            }

            return;
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

async function processFacebookMessage(event) {
    console.log("\n----------------------------------------");
    console.log("Facebook Messenger event");
    console.log("----------------------------------------");

    /*
     * Ignore messages sent by our own Page.
     */
    if (event.message?.is_echo) {
        console.log("Ignoring Facebook echo message");
        return;
    }

    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;
    const message = event.message;

    if (!senderId) {
        console.log("No Facebook sender ID");
        return;
    }

    if (message?.text) {
        const text = message.text;

        console.log("Facebook Sender:", senderId);
        console.log("Facebook Recipient:", recipientId);
        console.log("Message:", text);
        console.log("Message ID:", message.mid);
        console.log(
            "Timestamp:",
            event.timestamp
                ? new Date(event.timestamp).toISOString()
                : "unknown"
        );

        /*
         * Later:
         * save this message to the same inbox database
         * used by Instagram.
         */

        return;
    }

    if (message?.attachments) {
        console.log(
            "Facebook Attachments:",
            message.attachments
        );

        return;
    }

    if (event.postback) {
        console.log(
            "Facebook Postback:",
            event.postback
        );

        return;
    }

    if (event.reaction) {
        console.log(
            "Facebook Reaction:",
            event.reaction
        );

        return;
    }

    console.log("Unhandled Facebook Messenger event");
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
        `${INSTAGRAM_GRAPH_BASE_URL}/${INSTAGRAM_ACCOUNT_ID}/messages`;

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

app.get("/privacy-policy", (req, res) => {
    res.type("html").send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Privacy Policy - Beacon DM</title>

    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.7;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            color: #222;
        }

        h1, h2 {
            color: #111;
        }

        .updated {
            color: #666;
        }

        footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
        }
    </style>
</head>

<body>

    <h1>Privacy Policy</h1>

    <p class="updated">
        Last updated: September 12, 2026
    </p>

    <p>
        This Privacy Policy explains how Beacon DM ("we", "our", or "the app")
        handles information when you use our application.
    </p>

    <h2>1. About Beacon DM</h2>

    <p>
        Beacon DM is a proof-of-concept messaging application designed to
        receive and manage Instagram direct messages through the Instagram
        API.
    </p>

    <p>
        The application is currently being developed and tested as a
        proof-of-concept.
    </p>

    <h2>2. Information We Process</h2>

    <p>
        When an Instagram user sends a message to the Instagram account
        connected to Beacon DM, the application may receive information
        provided through the Instagram API, including:
    </p>

    <ul>
        <li>Instagram user identifier</li>
        <li>Message content</li>
        <li>Message identifier</li>
        <li>Message timestamp</li>
        <li>Message attachments when provided by Instagram</li>
    </ul>

    <p>
        We only process information necessary for the operation and testing
        of the messaging functionality.
    </p>

    <h2>3. How We Use Information</h2>

    <p>Information received through the Instagram API may be used to:</p>

    <ul>
        <li>Receive Instagram direct messages</li>
        <li>Display messages in the Beacon DM application</li>
        <li>Organize and manage conversations</li>
        <li>Send replies to Instagram users</li>
        <li>Test and improve the proof-of-concept application</li>
        <li>Diagnose technical problems</li>
    </ul>

    <h2>4. Data Storage</h2>

    <p>
        During the proof-of-concept phase, message information may be
        temporarily processed or stored by the application's backend.
    </p>

    <p>
        We do not sell personal information or use Instagram message data
        for advertising purposes.
    </p>

    <h2>5. Sharing of Information</h2>

    <p>
        We do not sell or rent personal information.
    </p>

    <p>
        Information may be processed by infrastructure and hosting providers
        used to operate the application, but only as necessary to provide
        the application's functionality.
    </p>

    <h2>6. Instagram and Meta</h2>

    <p>
        Beacon DM uses Meta's Instagram APIs to provide messaging
        functionality. Instagram and Meta may independently process
        information according to their own policies and terms.
    </p>

    <p>
        Beacon DM does not control the privacy practices of Instagram or
        Meta.
    </p>

    <h2>7. Data Security</h2>

    <p>
        We take reasonable technical measures to protect information
        processed by the application.
    </p>

    <p>
        Access credentials such as API access tokens and application secrets
        are intended to be kept securely on the backend and are not intended
        to be exposed to users of the application.
    </p>

    <h2>8. Data Deletion</h2>

    <p>
        If you would like information associated with your interaction with
        Beacon DM to be deleted, you may request deletion by contacting us
        using the email address below.
    </p>

    <p>
        Please include enough information for us to identify the relevant
        data without unnecessarily providing sensitive information.
    </p>

    <h2>9. Children's Privacy</h2>

    <p>
        Beacon DM is not intended to knowingly collect personal information
        from children.
    </p>

    <h2>10. Changes to This Privacy Policy</h2>

    <p>
        We may update this Privacy Policy as the application develops.
        Changes will be reflected on this page.
    </p>

    <h2>11. Contact</h2>

    <p>
        If you have questions about this Privacy Policy or would like to
        request deletion of information, please contact:
    </p>

    <p>
        <strong>Email:</strong>
        bemalsdvanitha123@gmail.com
    </p>

    <footer>
        &copy; 2026 Beacon DM. All rights reserved.
    </footer>

</body>
</html>
    `);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("========================================");
    console.log(" Beacon DM Backend");
    console.log("========================================");
    console.log(`Port: ${PORT}`);
    console.log(`Webhook: /webhook`);
    console.log(`Health: /health`);
    console.log(`Send API: /api/messages/send`);
    console.log(`Instagram Graph API: ${INSTAGRAM_GRAPH_BASE_URL}`);
    console.log(`Facebook Graph API: ${FACEBOOK_GRAPH_BASE_URL}`);
    console.log("========================================");
    console.log("");
});