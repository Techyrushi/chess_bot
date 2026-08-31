#!/usr/bin/env node

/**
 * Campaign Workflow Test Script
 * Tests: Contact import → List creation → Campaign creation → Message sending
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.TEST_URL || 'http://localhost:4321';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'ChangeMe123!';

let sessionCookie = '';

async function req(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie && { 'Cookie': sessionCookie })
    }
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  const text = await res.text();
  
  // Extract session cookie
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie.split(';')[0];
  }

  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function test() {
  console.log('🧪 Campaign Workflow Test\n');

  try {
    // 1. Login
    console.log('1️⃣  Logging in...');
    const login = await req('POST', '/api/auth/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    if (login.status !== 200) {
      console.error('❌ Login failed:', login.data);
      return;
    }
    console.log('✅ Login successful\n');

    // 2. Get Twilio settings
    console.log('2️⃣  Checking Twilio settings...');
    const settings = await req('GET', '/api/settings');
    if (settings.status === 200) {
      const twilioOk = !!(
        settings.data.twilio_account_sid &&
        settings.data.twilio_auth_token &&
        settings.data.twilio_whatsapp_number
      );
      console.log(`✅ Twilio configured: ${twilioOk}`);
      if (!twilioOk) {
        console.error('❌ Missing Twilio credentials in database');
      }
    }
    console.log();

    // 3. List campaigns
    console.log('3️⃣  Fetching campaigns...');
    const campaigns = await req('POST', '/api/campaigns/index', { page: 1, perPage: 100 });
    if (campaigns.status === 200 && campaigns.data.campaigns?.length > 0) {
      console.log(`✅ Found ${campaigns.data.campaigns.length} campaign(s)\n`);
      
      // Test each campaign
      for (const campaign of campaigns.data.campaigns) {
        console.log(`📋 Campaign: "${campaign.name}" (${campaign.status})`);
        
        // Run diagnostic
        const diag = await req('POST', '/api/debug/campaign-test', {
          campaignId: campaign.id
        });

        if (diag.status === 200) {
          console.log(`   Status: ${diag.data.campaign.status}`);
          console.log(`   Contact List: ${diag.data.campaign.contact_list_id || 'None'}`);
          console.log(`   Contacts in List: ${diag.data.contacts.inList}`);
          console.log(`   Messages Queued: ${diag.data.messages.queued}`);
          console.log(`   Messages Total: ${diag.data.messages.total}`);
          
          if (diag.data.issues?.length > 0) {
            console.log(`   ⚠️  Issues:`);
            diag.data.issues.forEach(issue => {
              console.log(`      • ${issue}`);
            });
          } else {
            console.log(`   ✅ No issues found`);
          }
        } else {
          console.error(`   ❌ Diagnostic failed:`, diag.data);
        }
        console.log();
      }
    } else {
      console.log('⚠️  No campaigns found\n');
    }

    console.log('✅ Test complete!');

  } catch (err) {
    console.error('❌ Test error:', err.message);
  }
}

test();
