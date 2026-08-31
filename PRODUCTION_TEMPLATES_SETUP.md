# WhatsApp Production Account - Template Setup

## 🎯 What You Need

For **production WhatsApp Business accounts**, you must use **approved message templates**.

Your upgraded account requires templates because:
- ✅ Production account (not sandbox)
- ✅ Sending outside 24-hour customer conversation window
- ✅ Need pre-approved message content

## 📋 Step 1: Create Template in WhatsApp Business Manager

### Access Business Manager
1. Go to: https://business.facebook.com/
2. Select your **Business Account**
3. Navigate: **Tools → WhatsApp Manager**
4. Click: **Message Templates** (or **Phone → Templates**)

### Create New Template

1. Click **Create Template**
2. Fill in details:

**Example Template:**
```
Name:                appointment_reminder
Category:            TRANSACTIONAL
Language:            English (US)

Message Body:
Hello {{1}},

Your appointment is scheduled for:
📅 {{2}} at {{3}}

Please reply STOP to opt out.

Buttons (optional):
- Confirm Appointment (quick reply)
- Reschedule (quick reply)
```

**Example Template Variables:**
- {{1}} = Customer name
- {{2}} = Date
- {{3}} = Time

### Submit for Approval
1. Click **Submit**
2. WhatsApp reviews (usually 2-24 hours)
3. Status changes from **PENDING** → **APPROVED**

---

## 🔍 Step 2: Get Template SID

Once approved, get the template ID:

### Option A: WhatsApp Business Manager
1. Go to **Message Templates**
2. Find your template
3. Copy the **Template ID** (e.g., `hello_world` or `appointment_reminder`)

### Option B: Via Twilio Console
1. Go to: https://console.twilio.com/
2. Navigate: **Messaging → Content → Message Templates**
3. Find your template
4. Copy **Content SID** (starts with `HM...`)

---

## 💾 Step 3: Save Template in Database

Add template reference to your campaigns:

```bash
curl -X POST http://localhost:4322/api/settings \
  -H "Content-Type: application/json" \
  -d '{
    "key": "whatsapp_template_appointment",
    "value": "HM1234567890abcdef"
  }'
```

Or in campaign document, add:
```json
{
  "campaign_id": "...",
  "template_sid": "HM1234567890abcdef",
  "template_variables": ["name", "date", "time"]
}
```

---

## 🔧 Step 4: Update Campaign to Use Template

### Option A: Update Message Body Format

Change campaign message from:
```
Hello {{name}}, your appointment is {{date}} at {{time}}
```

To use template variables:
```
{{1}} = name
{{2}} = date  
{{3}} = time
```

### Option B: Use New Template Endpoint

Your code now has `sendWhatsAppTemplate()` function:

```typescript
// Send templated message
const result = await sendWhatsAppTemplate({
  to: '+919876543210',
  templateSid: 'HM1234567890abcdef',
  templateVariables: ['Raj', '2026-09-15', '2:00 PM']
});
```

---

## 📝 Step 5: Update Database Schema

Add template support to campaigns collection:

```javascript
// Add to campaign document
{
  "_id": "...",
  "name": "Appointment Reminders",
  "contact_list_id": "...",
  "template_sid": "HM1234567890abcdef",  // NEW: Template ID
  "use_template": true,                   // NEW: Flag to use template
  "template_variables": [                 // NEW: Variable mapping
    { "field": "name", "source": "contact.name" },
    { "field": "date", "source": "metadata.appointment_date" },
    { "field": "time", "source": "metadata.appointment_time" }
  ],
  "message_body": "Original (ignored if using template)",
  "status": "draft"
}
```

---

## 🚀 Step 6: Update sender.ts to Use Templates

Modify [src/services/sender.ts](src/services/sender.ts) to check for templates:

```typescript
// In runCampaignBatch(), replace message sending:

const result = campaign.use_template 
  ? await sendWhatsAppTemplate({
      to: msg.phone,
      templateSid: campaign.template_sid,
      templateVariables: extractTemplateVariables(msg, campaign),
      statusCallback
    })
  : await sendWhatsAppMessage({
      to: msg.phone,
      body: msg.body,
      mediaUrl: msg.media_url,
      statusCallback
    });
```

---

## ✅ Common Approved Template Categories

| Category | Use Case | Example |
|----------|----------|---------|
| **TRANSACTIONAL** | Appointments, orders, bills | "Your appointment is {{date}}" |
| **MARKETING** | Promotions, newsletters | "Special offer for you!" |
| **OTP** | One-time passwords | "Your code is {{1}}" |
| **ACCOUNT_UPDATE** | Account changes | "Password changed successfully" |

---

## 🧪 Test Template

### Via Twilio CLI
```bash
twilio api:flex:v1:messaging-channels:list
```

### Via cURL
```bash
curl -X POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json \
  -u {AccountSid}:{AuthToken} \
  -d "From=whatsapp%3A%2B917397956201" \
  -d "To=whatsapp%3A%2B919876543210" \
  -d "ContentSid=HM1234567890abcdef" \
  -d "ContentVariables=%5B%22Raj%22%2C%222026-09-15%22%2C%222%3A00%20PM%22%5D"
```

---

## 📱 Template Example: Appointment Reminder

**Template (in WhatsApp Manager):**
```
Hello {{1}},

Your appointment with Dr. {{2}} is confirmed for:
📅 {{3}} at {{4}}

Location: {{5}}

Reply CONFIRM to confirm or RESCHEDULE to change time.
```

**Code to send:**
```typescript
await sendWhatsAppTemplate({
  to: contact.phone,
  templateSid: 'appointment_reminder',
  templateVariables: [
    contact.name,           // {{1}}
    'Dr. Smith',            // {{2}}
    '2026-09-15',          // {{3}}
    '2:00 PM',             // {{4}}
    '123 Medical Plaza'    // {{5}}
  ]
});
```

---

## ⚠️ Important Notes

1. **Template must be APPROVED** before sending
2. **Variable order matters** - {{1}}, {{2}}, {{3}}, etc.
3. **No custom formatting** - templates are fixed
4. **Fallback to plain messages** only in 24-hour window (rare)
5. **Review rejected templates** - Meta gives feedback

---

## 🔗 Useful Links

- [WhatsApp Business Manager](https://business.facebook.com/)
- [Twilio Templates Docs](https://www.twilio.com/docs/whatsapp/message-templates)
- [Message Template Best Practices](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
- [Template Approval Guide](https://www.twilio.com/docs/whatsapp/message-templates#best-practices)

---

## ✅ Checklist

- [ ] Created WhatsApp template in Business Manager
- [ ] Template is APPROVED status
- [ ] Got template SID (starts with HM...)
- [ ] Added template support to code (done ✓)
- [ ] Updated campaign to include template_sid
- [ ] Tested template send with phone number
- [ ] Messages now sending successfully

**Current Status:** ✅ Code supports both templates and plain messages
**Next:** Create and approve your first template!
