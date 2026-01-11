#!/usr/bin/env node

/**
 * Comprehensive diagnostic script for Stripe webhook debugging
 * Run: node diagnose-stripe.js
 */

const WORKER_URL = 'https://freeze-alert.actscapital.workers.dev';
const WEBHOOK_PATH = '/webhook/stripe';
const EXPECTED_URL = WORKER_URL + WEBHOOK_PATH;

console.log('🔍 Stripe Webhook Diagnostic\n');
console.log('━'.repeat(60));

async function checkWorkerHealth() {
  console.log('\n📡 Step 1: Checking Worker Health...');
  const healthUrl = EXPECTED_URL.replace('/webhook/stripe', '/health');
  console.log(`   URL: ${healthUrl}`);

  try {
    const response = await fetch(healthUrl);
    const data = await response.json();

    if (response.ok && data.success) {
      console.log('   ✅ Worker is online and responding');
      return true;
    } else {
      console.log('   ❌ Worker responded but health check failed');
      console.log('   Response:', JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.log('   ❌ Worker is not reachable');
    console.log('   Error:', err.message);
    return false;
  }
}

async function checkStripeWebhookEndpoint() {
  console.log('\n🔐 Step 2: Testing Stripe Webhook Endpoint...');
  console.log(`   URL: ${EXPECTED_URL}`);

  try {
    const response = await fetch(EXPECTED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1234567890,v1=fake_signature'
      },
      body: JSON.stringify({
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: { object: {} }
      })
    });

    const text = await response.text();

    if (response.status === 401) {
      console.log('   ✅ Endpoint is reachable (signature verification working)');
      console.log('   Response:', text);
      return true;
    } else if (response.status === 400) {
      console.log('   ⚠️  Endpoint responded with 400');
      console.log('   This might be expected. Response:', text);
      return true;
    } else {
      console.log(`   ❌ Unexpected status: ${response.status}`);
      console.log('   Response:', text);
      return false;
    }
  } catch (err) {
    console.log('   ❌ Failed to reach endpoint');
    console.log('   Error:', err.message);
    return false;
  }
}

async function checkStripeWebhookConfig() {
  console.log('\n⚙️  Step 3: Manual Checks Needed...');
  console.log('\n   → Go to: https://dashboard.stripe.com/webhooks');
  console.log('   → Check if you have a webhook endpoint configured');
  console.log('   → The URL should be:');
  console.log(`     ${EXPECTED_URL}`);
  console.log('   → Events to listen for:');
  console.log('     ✓ checkout.session.completed');
  console.log('     ✓ customer.subscription.deleted');
  console.log('     ✓ invoice.payment_failed');
  console.log('\n   → If webhook exists, check "Recent events" tab');
  console.log('   → Look for checkout.session.completed events');
  console.log('   → Check the response status (should be 200)');
}

function printNextSteps(workerOk, webhookOk) {
  console.log('\n━'.repeat(60));
  console.log('📋 Summary & Next Steps\n');

  if (!workerOk) {
    console.log('❌ Your worker is not deployed or not responding');
    console.log('   Run: npm run deploy');
    console.log('   Then run this script again\n');
    return;
  }

  if (workerOk && webhookOk) {
    console.log('✅ Worker is running and webhook endpoint is functional\n');
    console.log('Most likely issue: Stripe webhook not configured or wrong URL\n');
    console.log('Action items:');
    console.log('1. Go to https://dashboard.stripe.com/webhooks');
    console.log('2. Click "Add endpoint" (or edit existing)');
    console.log('3. Enter URL:', EXPECTED_URL);
    console.log('4. Select events: checkout.session.completed, etc.');
    console.log('5. Copy the "Signing secret" (starts with whsec_)');
    console.log('6. Run: npx wrangler secret put STRIPE_WEBHOOK_SECRET');
    console.log('7. Paste the signing secret\n');
    console.log('Then test again:\n');
    console.log('Terminal 1: npx wrangler tail --format pretty');
    console.log('Terminal 2: Complete a test payment\n');
    console.log('You should see webhook requests in the logs.');
  }
}

async function main() {
  const workerOk = await checkWorkerHealth();
  const webhookOk = await checkStripeWebhookEndpoint();
  await checkStripeWebhookConfig();
  printNextSteps(workerOk, webhookOk);

  console.log('\n━'.repeat(60));
  console.log('💡 For live debugging, run in another terminal:');
  console.log('   npx wrangler tail --format pretty\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

