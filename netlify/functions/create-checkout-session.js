// netlify/functions/create-checkout-session.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service‐role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  try {
    // Parse the incoming POST body
    const { uploadId, unitAmount, quantity } = JSON.parse(event.body);

    // 1) Verify that the upload exists and is still unpaid
    const { data: uploadRow, error: uplErr } = await supabase
      .from('uploads')
      .select('paid')
      .eq('id', uploadId)
      .single();

    if (uplErr || !uploadRow || uploadRow.paid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid or already-paid uploadId' }),
      };
    }

    // 2) Create a new Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'GradGrid Plot' },
            unit_amount: unitAmount, // cents
          },
          quantity: quantity,
        },
      ],
      metadata: { uploadId },
      success_url: `${process.env.URL}/final.html?uploadId=${uploadId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/payment.html?uploadId=${uploadId}&canceled=true`,
    });

    // 3) Return the session ID to the frontend
    return {
      statusCode: 200,
      body: JSON.stringify({ sessionId: session.id }),
    };
  } catch (err) {
    console.error('Error in create-checkout-session:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
