# Twilio Sandbox vs Production Account

## ❌ Error You're Seeing

```
Error: Failed to send
Tip: If using sandbox, recipient must send sandbox join keyword. 
If using a business number outside 24h session, use approved WhatsApp templates.
```

## 📋 What This Means

Your account is in **Twilio Sandbox mode** OR using a **business number**. Both have restrictions:

### ✅ Option 1: Sandbox Mode (Free Testing)

**Current State:** You need to register test recipients

**How to fix:**
1. Go to: https://console.twilio.com/monitor/dashboard
2. Find **WhatsApp Sandbox Settings**
3. Note the sandbox phone number and join keyword (e.g., "join mountain-flag")
4. **Send a message FROM YOUR TEST PHONE TO THE SANDBOX NUMBER** saying the join keyword
   - Example: Send `join mountain-flag` to `+1234567890` (sandbox number)
5. Once joined, the recipient can receive messages

**Pros:** Free, instant testing
**Cons:** Test mode only, limited to 100 messages/month

---

### ✅ Option 2: Production WhatsApp Business Account

**Current State:** Using business account without approved templates

**How to fix:**
1. Get **WhatsApp Business Account** approved (not sandbox)
2. Create **approved message templates** at: https://business.facebook.com/wa/manage/
3. Update campaign to use templates
4. Template must be approved by Meta/WhatsApp

**Example approved template:**
```
Hello {{name}},
Your appointment is {{date}} at {{time}}.
Reply STOP to opt-out.
```

**Pros:** Production messaging, higher limits
**Cons:** Requires approval, templates needed, $0.005-0.1 per message

---

## 🔧 For Your Code - Add Template Support

Current code sends plain messages. For business accounts, add template support:

**Option A: Use Templates (Recommended for Production)**
```typescript
// src/services/twilio.ts - Add template parameter
export async function sendWhatsAppMessageTemplate(opts: {
  to: string;
  templateSid: string;  // Template ID from WhatsApp
  parameters: string[]; // Template variables
  statusCallback?: string;
}): Promise<SendResult> {
  // Use client.messages.create({
  //   from: 'whatsapp:+917397956201',
  //   to: 'whatsapp:+919876543210',
  //   contentSid: templateSid,  // Pre-approved template
  //   contentVariables: JSON.stringify(parameters)
  // })
}
```

**Option B: Sandbox Workaround (For Testing)**
Just register test phone numbers in sandbox settings.

---

## 🎯 Immediate Action Required

### To Test in Sandbox (Easiest):

1. **Go to Twilio Console:**
   - https://console.twilio.com/
   - WhatsApp > Sandbox Settings

2. **Find your sandbox number** (format: `+1234567890`)

3. **Join the sandbox:**
   - From your phone, send the join keyword to the sandbox number
   - Example: "join mountain-flag"

4. **Test in your app:**
   - Use your phone number as recipient
   - Send test message

5. **Verify status:**
   - Visit: http://localhost:4322/test-campaign
   - Select campaign
   - Should show "queued" → "sent" → "delivered"

---

## 📱 Example Sandbox Join Process

```
1. Twilio shows: "Join sandbox with: join mountain-flag"
   Sandbox number: +1 234 567 8901

2. From your phone:
   Send WhatsApp message to +1 234 567 8901
   Content: "join mountain-flag"

3. Response:
   "You have successfully joined the sandbox!"

4. Now test campaign:
   - Create campaign
   - Enter your phone (now whitelisted)
   - Click "Start Campaign"
   - Message should send ✅
```

---

## 🔍 Check Current Account Type

Run this to see what's configured:

```bash
curl -X POST http://localhost:4322/api/debug/campaign-test \
  -H "Content-Type: application/json" \
  -d '{"campaignId": "YOUR_CAMPAIGN_ID"}'
```

Look for: `"twilio": { "configured": true }`

If configured, the issue is **sandbox/business account restrictions**, not a code problem.

---

## ✅ What's Working

- ✅ Twilio credentials are set
- ✅ Connection is working  
- ✅ Message is being sent to Twilio
- ✅ Twilio is blocking based on account type

---

## 🚀 Next Steps

1. **For Quick Testing (Sandbox):**
   - Get sandbox number from Twilio console
   - Join sandbox by sending keyword to sandbox number
   - Use your phone as test recipient

2. **For Production (Business Account):**
   - Get WhatsApp Business Account approved
   - Create approved message templates
   - Update code to use templates (optional - see template support above)

3. **Then Test Again:**
   - Go to http://localhost:4322/test-campaign
   - Select campaign
   - Monitor dashboard for delivery status
