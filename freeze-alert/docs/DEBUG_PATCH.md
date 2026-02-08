# Quick Debug Patch

Add these console.log statements to get detailed debugging output.

## Apply Debug Logging

Replace the `handleCheckoutCompleted` function in `src/handlers/stripe.ts` with this version:

```typescript
async function handleCheckoutCompleted(
  session: StripeCheckoutSession,
  env: Env
): Promise<void> {
  console.log('=== CHECKOUT COMPLETED DEBUG START ===');
  console.log('1. Session ID:', session.id);
  console.log('2. Raw metadata:', JSON.stringify(session.metadata, null, 2));

  const { phone, zip_code: zipCode, timezone } = session.metadata;
  console.log('3. Extracted values:', { phone, zipCode, timezone });

  if (!phone || !zipCode || !timezone) {
    console.error('❌ Missing metadata in checkout session:', session.id);
    console.error('   phone:', phone);
    console.error('   zipCode:', zipCode);
    console.error('   timezone:', timezone);
    return;
  }
  console.log('✓ Metadata validated');

  if (!session.customer || !session.subscription) {
    console.error('❌ Missing customer or subscription:', {
      customer: session.customer,
      subscription: session.subscription
    });
    return;
  }
  console.log('✓ Customer and subscription present');
  console.log('   Customer ID:', session.customer);
  console.log('   Subscription ID:', session.subscription);

  // Fetch subscription details from Stripe to get current_period_end
  console.log('4. Fetching subscription details from Stripe...');
  const subscriptionResponse = await fetch(
    `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
    {
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      },
    }
  );

  if (!subscriptionResponse.ok) {
    console.error('❌ Failed to fetch subscription from Stripe');
    console.error('   Status:', subscriptionResponse.status);
    console.error('   Subscription ID:', session.subscription);
    try {
      const errorBody = await subscriptionResponse.text();
      console.error('   Error body:', errorBody);
    } catch (e) {
      console.error('   Could not read error body');
    }
    return;
  }
  console.log('✓ Subscription fetched from Stripe');

  const subscription = await subscriptionResponse.json() as StripeSubscription;
  console.log('   Current period end:', subscription.current_period_end);

  // Create subscription record in D1
  console.log('5. Creating subscription in D1...');
  try {
    await createSubscription(
      phone,
      zipCode,
      timezone,
      session.customer,
      session.subscription,
      subscription.current_period_end,
      env
    );
    console.log('✓ Subscription created in D1');
  } catch (err) {
    console.error('❌ Failed to create subscription in D1');
    if (err instanceof DBError) {
      console.error('   DBError:', err.message);
      console.error('   Stack:', err.stack);
      return;
    }
    console.error('   Unexpected error:', err);
    throw err;
  }

  // Send activation confirmation SMS
  console.log('6. Sending activation confirmation SMS...');
  console.log('   To:', phone);
  console.log('   Zip:', zipCode);
  try {
    await sendActivationConfirmation(phone, zipCode, env);
    console.log('✓ Activation SMS sent successfully');
  } catch (err) {
    console.error('❌ Failed to send activation confirmation SMS');
    if (err instanceof SMSError) {
      console.error('   SMSError:', err.message);
      console.error('   Status code:', err.statusCode);
      console.error('   Twilio error code:', err.twilioErrorCode);
    } else {
      console.error('   Unexpected error:', err);
    }
    // Subscription is active, SMS failure is acceptable for Phase 1
  }

  console.log('=== CHECKOUT COMPLETED DEBUG END ===');
}
```

## Deploy and Test

```bash
# Deploy with debug logging
npm run deploy

# Watch logs in real-time
wrangler tail --format pretty

# In another terminal/window, complete a test payment
```

## What to Look For

You should see output like this:

```
=== CHECKOUT COMPLETED DEBUG START ===
1. Session ID: cs_test_...
2. Raw metadata: {
  "phone": "+15125551234",
  "zip_code": "78701",
  "timezone": "America/Chicago"
}
3. Extracted values: { phone: '+15125551234', zipCode: '78701', timezone: 'America/Chicago' }
✓ Metadata validated
✓ Customer and subscription present
   Customer ID: cus_...
   Subscription ID: sub_...
4. Fetching subscription details from Stripe...
✓ Subscription fetched from Stripe
   Current period end: 1735689600
5. Creating subscription in D1...
✓ Subscription created in D1
6. Sending activation confirmation SMS...
   To: +15125551234
   Zip: 78701
✓ Activation SMS sent successfully
=== CHECKOUT COMPLETED DEBUG END ===
```

## Identify the Issue

The debug output will show exactly where the process fails:

- **If you don't see any debug output**: Webhook isn't reaching the handler
- **If it stops at step 2**: Metadata is missing
- **If it stops at step 4**: Can't fetch subscription from Stripe (check API key)
- **If it stops at step 5**: Database write failing
- **If it stops at step 6**: SMS sending failing (check Twilio credentials)

## Remove Debug Logging

Once you've identified the issue, revert to the original code:

```bash
git checkout src/handlers/stripe.ts
npm run deploy
```

