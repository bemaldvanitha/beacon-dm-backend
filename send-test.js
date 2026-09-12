"use strict";

require("dotenv").config();

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v24.0";

const RECIPIENT_ID = "27934744682894245";

async function sendTestMessage() {
    const url =
        `https://graph.instagram.com/${GRAPH_API_VERSION}` +
        `/${INSTAGRAM_ACCOUNT_ID}/messages`;

    console.log("Sending message...");
    console.log("Recipient:", RECIPIENT_ID);
    console.log("URL:", url);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                recipient: {
                    id: RECIPIENT_ID,
                },
                message: {
                    text: "Hi! 👋 This is a test message from Beacon DM.",
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

        console.log("\n✅ Message sent successfully!");
    } catch (error) {
        console.error("\n❌ Request failed:");
        console.error(error);
        process.exit(1);
    }
}

sendTestMessage();