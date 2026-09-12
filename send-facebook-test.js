"use strict";

require("dotenv").config();

const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v24.0";

// Sender ID from your webhook logs
const RECIPIENT_ID = "28208912558765815";

async function sendFacebookMessage() {
    const url =
        `https://graph.facebook.com/${GRAPH_API_VERSION}` +
        `/${FACEBOOK_PAGE_ID}/messages`;

    console.log("Sending Facebook message...");
    console.log("Recipient:", RECIPIENT_ID);
    console.log("URL:", url);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${FACEBOOK_PAGE_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                recipient: {
                    id: RECIPIENT_ID,
                },
                messaging_type: "RESPONSE",
                message: {
                    text: "Hi! 👋 This is a Facebook Messenger test from Beacon DM.",
                },
            }),
        });

        const data = await response.json();

        console.log("\nHTTP Status:", response.status);
        console.log("Response:");
        console.log(JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error("\n❌ Message failed.");
            process.exit(1);
        }

        console.log("\n✅ Facebook message sent successfully!");
    } catch (error) {
        console.error("\n❌ Request failed:");
        console.error(error);
        process.exit(1);
    }
}

sendFacebookMessage();