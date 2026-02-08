/**
 * Manual webhook test - simulates what Stripe sends
 * Run: node test-webhook-manually.js
 */

const WORKER_URL = 'https://freeze-alert.actscapital.workers.dev/webhook/stripe';
const WEBHOOK_SECRET = 'whsec_fb87c39737e2fc081ffd97df3f453540623181c6380a4388c3f255a01b3f9440'; // CLI secret

// Create a test checkout.session.completed event with proper metadata
const testEvent = {
  id: 'evt_test_manual',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_manual',
      customer: 'cus_test_manual',
      subscription: 'sub_test_manual',
      metadata: {
        phone: '+15125551234',
        zip_code: '78701',
        timezone: 'America/Chicago'
      }
    }
  }
};

// Create Stripe signature
async function createSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const hexSignature = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `t=${timestamp},v1=${hexSignature}`;
}

async function testWebhook() {
  console.log('🧪 Testing webhook handler manually...\n');

  const payload = JSON.stringify(testEvent);
  const signature = await createSignature(payload, WEBHOOK_SECRET);

  console.log('📤 Sending to:', WORKER_URL);
  console.log('📦 Event type:', testEvent.type);
  console.log('📋 Metadata:', JSON.stringify(testEvent.data.object.metadata, null, 2));
  console.log('');

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature
      },
      body: payload
    });

    const text = await response.text();

    console.log('📥 Response:', response.status, response.statusText);
    console.log('📄 Body:', text);

    if (response.ok) {
      console.log('\n✅ Webhook handler executed successfully!');
      console.log('   Check database for subscription.');
    } else {
      console.log('\n❌ Webhook handler returned error');
    }
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
  }
}

testWebhook();

