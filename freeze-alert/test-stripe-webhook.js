/**
 * Test script to manually trigger the Stripe webhook handler
 * This simulates what Stripe would send
 */

// Your worker URL (update this!)
const WORKER_URL = 'https://freeze-alert.YOUR_SUBDOMAIN.workers.dev/webhook/stripe';

// Test payload - minimal checkout.session.completed event
const testPayload = {
  id: 'evt_test_debug',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_debug',
      customer: 'cus_test_debug',
      subscription: 'sub_test_debug',
      metadata: {
        phone: '+15125551234',
        zip_code: '78701',
        timezone: 'America/Chicago'
      }
    }
  }
};

async function testWebhook() {
  console.log('🧪 Testing Stripe webhook handler...\n');
  console.log('📤 Sending to:', WORKER_URL);
  console.log('📦 Payload:', JSON.stringify(testPayload, null, 2));
  console.log('\n⚠️  Note: This will fail signature verification (expected)');
  console.log('   We just want to see if the endpoint is reachable.\n');

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_signature' // Will fail verification
      },
      body: JSON.stringify(testPayload)
    });

    console.log('📥 Response:', response.status, response.statusText);
    const body = await response.text();
    console.log('📄 Body:', body);

    if (response.status === 401) {
      console.log('\n✅ GOOD: Webhook endpoint is reachable!');
      console.log('   The 401 means signature verification is working.');
      console.log('   Problem is likely that Stripe webhook is not configured.');
    } else if (response.status === 404) {
      console.log('\n❌ BAD: Webhook endpoint not found.');
      console.log('   Check your worker URL.');
    } else {
      console.log('\n⚠️  Unexpected response.');
    }
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.log('   Check that your worker is deployed and the URL is correct.');
  }
}

testWebhook();

