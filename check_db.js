require("dotenv").config();
const admin = require("firebase-admin");

async function checkDB() {
  try {
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!base64Key) {
      console.log("No FIREBASE_SERVICE_ACCOUNT_BASE64 found.");
      return;
    }
    const serviceAccount = JSON.parse(Buffer.from(base64Key, "base64").toString("utf-8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    const db = admin.firestore();
    
    console.log("--- FACEBOOK SESSIONS ---");
    const fbSnap = await db.collection("facebook_sessions").get();
    if (fbSnap.empty) {
      console.log("Empty.");
    } else {
      fbSnap.forEach(doc => {
        console.log(`Doc ID: ${doc.id}`);
        console.log(`Data:`, doc.data());
      });
    }

    console.log("--- INSTAGRAM SESSIONS ---");
    const igSnap = await db.collection("instagram_sessions").get();
    if (igSnap.empty) {
      console.log("Empty.");
    } else {
      igSnap.forEach(doc => {
        console.log(`Doc ID: ${doc.id}`);
        console.log(`Data:`, doc.data());
      });
    }

  } catch (err) {
    console.error("Error:", err);
  }
}

checkDB();
