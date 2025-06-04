// netlify/functions/stripe-webhook.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { buffer } = require('micro'); // needed to verify signature

// Initialize Supabase client with service‐role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  try {
    // 1) Get the raw request body & Stripe signature header
    const buf = await buffer(event);
    const sig = event.headers['stripe-signature'];

    // 2) Verify the event using Stripe’s SDK
    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        buf,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    // 3) Only handle checkout.session.completed
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const uploadId = session.metadata.uploadId;

      // 4a) Mark uploads.paid = true
      await supabase
        .from('uploads')
        .update({ paid: true })
        .eq('id', uploadId);

      // 4b) Mark reservations.paid = true for that uploadId
      await supabase
        .from('reservations')
        .update({ paid: true })
        .eq('upload_id', uploadId);

      console.log(`Marked upload ${uploadId} and its reservations as paid.`);
    }

    // 5) Return 200 so Stripe knows we received it
    return { statusCode: 200, body: 'Received' };
  } catch (err) {
    console.error('Error in stripe-webhook handler:', err);
    return { statusCode: 500, body: 'Internal server error' };
  }
};
