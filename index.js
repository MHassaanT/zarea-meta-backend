require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const PORT = process.env.PORT || 4002;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "zarea_verify_2025";
const RAW_MESSAGES_COLLECTION = "raw_messages";
let db;
// --- INITIALIZE FIREBASE ---
async function initializeFirebase() {
  try {
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64Key) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_BASE64");
    const serviceAccount = JSON.parse(Buffer.from(base64Key, "base64").toString("utf-8"));
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    db = admin.firestore();
    console.log("🔥 [Firebase] Admin Initialized");
  } catch (error) {
    console.error("❌ [Firebase] Init Error:", error.message);
    process.exit(1);
  }
}
// --- MESSAGE BUNDLING & SAVE ---
async function saveFacebookMessage(payload, userId) {
  const { sender, recipient, message, timestamp } = payload;
  const pageId = recipient.id;
  const psid = sender.id;
  try {
    const rawMessagesRef = db.collection(RAW_MESSAGES_COLLECTION);
    // 8-second bundling logic
    const recentMessages = await rawMessagesRef
      .where("userId", "==", userId)
      .where("from", "==", psid)
      .where("platform", "==", "facebook")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();
    if (!recentMessages.empty) {
      const recentDoc = recentMessages.docs[0];
      const recentData = recentDoc.data();
      const now = Date.now();
      const docTime = recentData.timestamp.toMillis();
      if (recentData.processed === false && (now - docTime < 8000)) {
        const newBody = recentData.body + "\n" + message.text;
        await recentDoc.ref.update({
          body: newBody,
          timestamp: admin.firestore.Timestamp.now()
        });
        console.log(`📩 [${userId}] Bundled Facebook message into ${recentDoc.id.substring(0, 8)}`);
        return;
      }
    }
    // New message
    const messageData = {
      timestamp: admin.firestore.Timestamp.now(),
      userId,
      phoneNumber: psid, // PSID equivalent
      from: psid,
      to: pageId,
      type: "chat",
      body: message.text,
      isGroup: false,
      platform: "facebook",
      wwebId: message.mid,
      processed: false,
      isLead: null,
      replyPending: false,
      autoReplyText: null,
    };
    const docRef = await rawMessagesRef.add(messageData);
    console.log(`📩 [${userId}] New Facebook message saved: ${docRef.id.substring(0, 8)}`);
  } catch (error) {
    console.error(`⚠️ [${userId}] Error saving Facebook message:`, error.message);
  }
}
// --- AI REPLY EXECUTOR ---
function startReplyListener() {
  console.log("🤖 [Executor] Listening for Facebook replies...");
  
  db.collection(RAW_MESSAGES_COLLECTION)
    .where("replyPending", "==", true)
    .where("platform", "==", "facebook")
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== "added" && change.type !== "modified") return;
        const doc = change.doc;
        const msg = doc.data();
        if (!msg.autoReplyText || !msg.from || !msg.userId) return;
        try {
          // Get Page Access Token
          const sessionSnap = await db.collection("facebook_sessions").doc(msg.userId).get();
          if (!sessionSnap.exists) return;
          const { pageAccessToken } = sessionSnap.data();
          if (!pageAccessToken) return;
          // Send via Graph API
          const response = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: msg.from },
              message: { text: msg.autoReplyText }
            })
          });
          const result = await response.json();
          if (result.error) throw new Error(result.error.message);
          // Update message status
          await doc.ref.update({
            replyPending: false,
            replySentAt: admin.firestore.Timestamp.now()
          });
          console.log(`✅ [${msg.userId}] AI reply sent via Facebook PSID ${msg.from}`);
        } catch (error) {
          console.error(`❌ [${msg.userId}] Facebook Reply Error:`, error.message);
        }
      });
    });
}
const app = express();
app.use(express.json());
// --- WEBHOOK VERIFICATION ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ [Webhook] Verified by Meta");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});
// --- WEBHOOK EVENT HANDLER ---
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageId = entry.id;
      const webhookEvent = entry.messaging[0];
      if (webhookEvent.message && webhookEvent.message.text) {
        try {
          // Find userId for this page
          const sessionQuery = await db.collection("facebook_sessions")
            .where("pageId", "==", pageId)
            .limit(1)
            .get();
          if (sessionQuery.empty) {
            console.log(`⚠️ [Webhook] No session found for Page ID ${pageId}`);
            continue;
          }
          const userId = sessionQuery.docs[0].data().userId;
          await saveFacebookMessage(webhookEvent, userId);
        } catch (error) {
          console.error("❌ [Webhook] Processing Error:", error.message);
        }
      }
    }
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});
app.get("/", (req, res) => {
  res.json({ status: "running", platform: "facebook" });
});
// --- BOOTSTRAP ---
(async () => {
  await initializeFirebase();
  startReplyListener();
  app.listen(PORT, () => {
    console.log(`\n🌍 [Server] Meta Backend running on port ${PORT}`);
  });
})();
