# Campaign Message Sending - Testing & Troubleshooting

## Quick Test (UI-Based)

### Step 1: Start the Server
```bash
npm run dev
```

### Step 2: Visit Test Page
Open browser: **http://localhost:4321/test-campaign**

### Step 3: Run Diagnostic
1. Select a campaign from the dropdown
2. Click "Test Campaign" button
3. Review the diagnostics output

### Expected Output
```json
{
  "campaignId": "...",
  "campaign": {
    "id": "...",
    "name": "...",
    "status": "sending",
    "contact_list_id": "...",
    "message_body": "..."
  },
  "twilio": {
    "configured": true
  },
  "contacts": {
    "inList": 5
  },
  "messages": {
    "queued": 5,
    "total": 5,
    "byStatus": [
      { "_id": "queued", "count": 5 }
    ]
  },
  "issues": []
}
```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| **"Twilio not configured"** | ✅ Already set in `.env`. Ensure `npm run build` succeeds |
| **"No contact list"** | Add contacts → Create campaign → Select contact list |
| **"Contact list is empty"** | Import/add contacts to the list first |
| **"Campaign status is draft"** | Click "Start Campaign" button to begin sending |
| **"No queued messages"** | Start campaign first to queue messages |
| **Messages not sending** | Check "Messages Queued" count - if 0, start campaign |

---

## Campaign Workflow Steps

### 1. Import Contacts ✅
- Page: **http://localhost:4321/import**
- Upload CSV with phone numbers
- Verify preview shows contacts
- Click "Import"

### 2. Create Contact List ✅
- Page: **http://localhost:4321/contacts** 
- Create new list
- Add imported contacts

### 3. Create Campaign ✅
- Page: **http://localhost:4321/campaigns**
- Click "+ New Campaign"
- Fill: Name, Message, Select Contact List
- Click "Save as Draft"

### 4. Start Campaign ⚠️ (This is where messages are queued)
- View campaign
- Click "Start Campaign" button
- Verify status changes to "Queued" → "Sending"
- Messages will be sent in batches

### 5. Monitor Progress
- Check dashboard for sent/delivered counts
- View message statuses in campaign detail

---

## API Endpoints for Testing

### Test Single Message
```bash
curl -X POST http://localhost:4321/api/test-message \
  -H "Content-Type: application/json" \
  -b "session=..." \
  -d '{
    "phone": "+919876543210",
    "body": "Test message from WhatsApp campaign manager"
  }'
```

### Get Campaign Diagnostics
```bash
curl -X POST http://localhost:4321/api/debug/campaign-test \
  -H "Content-Type: application/json" \
  -b "session=..." \
  -d '{
    "campaignId": "your_campaign_id_here"
  }'
```

### List Campaigns
```bash
curl -X POST http://localhost:4321/api/campaigns/index \
  -H "Content-Type: application/json" \
  -b "session=..." \
  -d '{
    "page": 1,
    "perPage": 20
  }'
```

---

## Environment Check

Your `.env` has:
```
✅ TWILIO_ACCOUNT_SID=
✅ TWILIO_AUTH_TOKEN=
✅ TWILIO_WHATSAPP_NUMBER=whatsapp:+91
✅ TWILIO_WEBHOOK_SECRET=your_webhook_secret_for_signature_verification
✅ DB_URI=mongodb+srv://... (configured)
```

---

## Next Steps

1. **Start server**: `npm run dev`
2. **Visit**: http://localhost:4321/test-campaign
3. **Select campaign** and click "Test Campaign"
4. **Review diagnostics** for any blocking issues
5. **Fix issues** according to solutions above
6. **Monitor** dashboard as messages send

---

## Debug Logs

Server logs will show:
```
Twilio configured: true
Campaign: { id: '...', name: '...', status: 'sending' }
Contact list ID: ...
Queued messages: 5
Messages by status: [{ _id: 'queued', count: 5 }]
```

Check terminal where `npm run dev` is running for detailed logs.
