# Zarea Meta Backend

Standalone service for handling Meta's Official WhatsApp Business API and Instagram Messaging API webhooks for ZareaAI.

## Setup Instructions

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   - Copy `.env.example` to `.env`.
   - `FIREBASE_SERVICE_ACCOUNT_BASE64`: Base64 encoded string of your Firebase service account JSON.
   - `META_VERIFY_TOKEN`: A string of your choice (must match what you enter in Meta Console).
   - `META_APP_SECRET`: From Meta App Dashboard > Settings > Basic.
   - `META_WHATSAPP_TOKEN`: Permanent System User Access Token.

3. **Start the server**:
   ```bash
   npm start
   ```

## Webhook Configuration

1. Go to [Meta Developers Portal](https://developers.facebook.com/).
2. Select your App.
3. Add **WhatsApp** and/or **Messenger** products.
4. Under **Configuration**, set:
   - **Callback URL**: `https://<your-deployed-url>/webhook`
   - **Verify Token**: (The value of `META_VERIFY_TOKEN` in your `.env`)
5. Subscribe to `messages` fields for both platforms.

## Testing Webhook Verification

You can test the verification endpoint using `curl`:

```bash
curl -X GET "http://localhost:4002/webhook?hub.mode=subscribe&hub.verify_token=zarea_verify_2025&hub.challenge=TEST_CHALLENGE"
```
Response should be: `TEST_CHALLENGE`

## Meta App Review Checklist

If you are recording a screencast for Meta App Review, ensure you show:
1. The **Webhook URL** correctly configured in the Meta Console.
2. A **WhatsApp message** being sent from a personal phone to the test/business number.
3. The **Firestore console** (`raw_messages` collection) showing the message appearing in real-time.
4. The **automated reply** being sent back to the personal phone.

## Database Management

### Adding Instagram Account ID to `insta_sessions`
For Instagram messaging to work, you must manually add the `instagramAccountId` field to the corresponding document in the `insta_sessions` collection. This ID can be found in the webhook payload or the Meta Business Suite.

## Features
- ✅ **Secure**: Validates `X-Hub-Signature-256` on all incoming events.
- ✅ **Smart**: Bundles multiple messages from the same sender within an 8-second window.
- ✅ **Integrated**: Real-time Firestore listener for automated AI replies.
- ✅ **Resilient**: Graceful error handling for Meta API calls.
