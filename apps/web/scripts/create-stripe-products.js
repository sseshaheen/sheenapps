const Stripe = require('stripe');

// Get the API key from environment or command line
const apiKey = process.env.STRIPE_SECRET_KEY || process.argv[2];

if (!apiKey) {
  console.error('❌ Please provide your Stripe secret key:');
  console.error('   npm run create-stripe-products sk_test_...');
  console.error('   or set STRIPE_SECRET_KEY in .env.local');
  process.exit(1);
}

const stripe = new Stripe(apiKey);

async function createProducts() {
  try {
    console.log('🚀 Creating Stripe products and prices...\n');

    // Create Starter Plan
    const starterProduct = await stripe.products.create({
      name: 'Starter Plan',
      description: 'Perfect for getting started with AI-powered websites',
    });

    const starterPrice = await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 900, // $9.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      nickname: 'Starter Monthly',
    });

    console.log('✅ Starter Plan created');
    console.log(`   Price ID: ${starterPrice.id}`);

    // Create Growth Plan
    const growthProduct = await stripe.products.create({
      name: 'Growth Plan',
      description: 'For growing businesses that need more AI power',
    });

    const growthPrice = await stripe.prices.create({
      product: growthProduct.id,
      unit_amount: 2900, // $29.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      nickname: 'Growth Monthly',
    });

    console.log('✅ Growth Plan created');
    console.log(`   Price ID: ${growthPrice.id}`);

    // Create Scale Plan
    const scaleProduct = await stripe.products.create({
      name: 'Scale Plan',
      description: 'Unlimited AI power for scaling businesses',
    });

    const scalePrice = await stripe.prices.create({
      product: scaleProduct.id,
      unit_amount: 9900, // $99.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      nickname: 'Scale Monthly',
    });

    console.log('✅ Scale Plan created');
    console.log(`   Price ID: ${scalePrice.id}`);

    // Output the environment variables to add
    console.log('\n📝 Add these to your .env.local file:');
    console.log('```');
    console.log(`STRIPE_PRICE_ID_STARTER=${starterPrice.id}`);
    console.log(`STRIPE_PRICE_ID_GROWTH=${growthPrice.id}`);
    console.log(`STRIPE_PRICE_ID_SCALE=${scalePrice.id}`);
    console.log('```');

    console.log('\n✨ Products created successfully!');
    console.log('👉 Copy the above environment variables to your .env.local file');
    console.log('👉 Restart your dev server after updating .env.local');

  } catch (error) {
    console.error('❌ Error creating products:', error.message);
    if (error.type === 'StripeAuthenticationError') {
      console.error('   Your API key is invalid. Get a new one from https://dashboard.stripe.com/test/apikeys');
    }
  }
}

createProducts();