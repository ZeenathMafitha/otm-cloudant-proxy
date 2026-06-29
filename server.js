const express = require('express');
const axios = require('axios');
const app = express();

// CORS middleware - MUST be before other middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Allow large JSON payloads
app.use(express.json({ limit: '10mb' }));

// Your Cloudant credentials
const CLOUDANT_URL = 'https://6bcdd3eb-e614-466c-9f79-0c9c12778e76-bluemix.cloudantnosqldb.appdomain.cloud';
const CLOUDANT_APIKEY = 'US6zQgRyRLjR-X_GP2T_ymGbR4gD0KUqThxBwtEFjAS9';

// IAM token cache
let iamToken = null;
let tokenExpiry = 0;

// Function to get IAM token
async function getIAMToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (iamToken && Date.now() < tokenExpiry - 300000) {
    console.log('Using cached IAM token');
    return iamToken;
  }
  
  console.log('Fetching new IAM token from IBM Cloud...');
  
  try {
    const response = await axios.post(
      'https://iam.cloud.ibm.com/identity/token',
      `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${CLOUDANT_APIKEY}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    iamToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    
    console.log('✅ IAM token obtained, expires in', response.data.expires_in, 'seconds');
    
    return iamToken;
  } catch (error) {
    console.error('❌ Error getting IAM token:', error.message);
    throw error;
  }
}

// Main webhook endpoint for OTM
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('📥 Received OTM order at', new Date().toISOString());
  console.log('='.repeat(60));
  
  try {
    // Get valid IAM token
    const token = await getIAMToken();
    
    // Forward to Cloudant
    console.log('📤 Forwarding to Cloudant...');
    const response = await axios.post(
      `${CLOUDANT_URL}/incoming_orders`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const duration = Date.now() - startTime;
    console.log('✅ Successfully saved to Cloudant');
    console.log('   Document ID:', response.data.id);
    console.log('   Revision:', response.data.rev);
    console.log('   Duration:', duration, 'ms');
    console.log('='.repeat(60) + '\n');
    
    res.json({ 
      success: true, 
      message: 'Order received and saved to Cloudant',
      cloudant_id: response.data.id,
      cloudant_rev: response.data.rev,
      processing_time_ms: duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Error processing order');
    console.error('   Error:', error.message);
    console.error('   Duration:', duration, 'ms');
    if (error.response) {
      console.error('   Cloudant response:', error.response.data);
    }
    console.log('='.repeat(60) + '\n');
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    token_cached: !!iamToken,
    token_expires: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
    uptime_seconds: Math.floor(process.uptime())
  });
});

// Test endpoint
app.get('/test', async (req, res) => {
  try {
    const token = await getIAMToken();
    res.json({
      success: true,
      message: 'IAM token obtained successfully',
      token_preview: token.substring(0, 50) + '...',
      expires_at: new Date(tokenExpiry).toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process orders endpoint - Called by Watson Assistant
app.post('/process-orders', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 Watson AI triggered order processing');
  console.log('='.repeat(60));
  
  try {
    const token = await getIAMToken();
    
    // Get unprocessed orders
    console.log('📦 Fetching unprocessed orders...');
    const ordersResponse = await axios.get(
      `${CLOUDANT_URL}/incoming_orders/_all_docs?include_docs=true`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const orders = ordersResponse.data.rows
      .map(row => row.doc)
      .filter(doc => !doc._id.startsWith('_design') && !doc.processed);
    
    console.log(`📊 Found ${orders.length} unprocessed orders`);
    
    if (orders.length === 0) {
      return res.json({
        success: true,
        message: 'No orders to process',
        processed: 0,
        watson_response: '✅ No new orders found. All orders are up to date!'
      });
    }
    
    let processedCount = 0;
    const results = [];
    
    // Process each order
    for (const order of orders) {
      try {
        const result = await processOrder(order, token);
        results.push(result);
        processedCount++;
        console.log(`✅ Processed: ${result.order_id} → ${result.label_id}`);
      } catch (error) {
        console.error(`❌ Error processing ${order._id}:`, error.message);
        results.push({ order_id: order._id, error: error.message });
      }
    }
    
    // Create Watson-friendly response
    const summary = {
      success: true,
      processed: processedCount,
      total: orders.length,
      results: results,
      watson_response: `✅ Processing Complete!\n\n📊 Summary:\n- Orders processed: ${processedCount}/${orders.length}\n- Labels created/updated: ${results.length}\n\n🏷️ Latest Labels:\n${results.slice(0, 3).map(r => `- ${r.label_id}: ${r.cumulative_weight}kg (${r.order_count} orders)`).join('\n')}\n\n👀 View all labels in your dashboard!`
    };
    
    console.log('='.repeat(60) + '\n');
    res.json(summary);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('='.repeat(60) + '\n');
    res.status(500).json({
      success: false,
      error: error.message,
      watson_response: `❌ Error processing orders: ${error.message}`
    });
  }
});

// Process single order with 3500kg logic
async function processOrder(order, token) {
  // Parse OTM order
  const parsedOrder = parseOTMOrder(order);
  
  // Check if parsing was successful
  if (!parsedOrder) {
    throw new Error('Failed to parse order - invalid JSON structure');
  }
  
  // Get or create label (3500kg logic)
  const label = await getOrCreateLabel(parsedOrder, token);
  
  // Generate HTML label
  const htmlLabel = generateHTMLLabel(label);
  
  // Save label to Cloudant
  await saveLabel(label, htmlLabel, token);
  
  // Mark order as processed
  await markOrderProcessed(order, token);
  
  return {
    order_id: parsedOrder.order_id,
    label_id: label.label_id,
    weight_kg: parsedOrder.weight_kg,
    cumulative_weight: label.cumulative_weight_kg,
    order_count: label.order_count,
    status: label.status
  };
}

// Parse OTM JSON - FIXED for actual OTM structure
function parseOTMOrder(order) {
  try {
    // OTM sends data in transactions.items[0].body
    const transaction = order.transactions?.items?.[0];
    const body = transaction?.body;
    
    if (!body) {
      console.error('No transaction body found in order:', order._id);
      return null;
    }
    
    // Extract order details
    const orderId = body.orderReleaseGid || body.orderReleaseXid || order._id;
    const sourceLocation = body.sourceLocationGid || 'UNKNOWN';
    const destLocation = body.destLocationGid || 'UNKNOWN';
    
    // Get weight - it's in LB, convert to KG
    const weightLB = parseFloat(body.totalWeight?.value || 0);
    const weightKG = weightLB * 0.453592;  // 1 LB = 0.453592 KG
    
    // Get delivery date
    const deliveryDate = body.lateDeliveryDate?.value?.split('T')[0] ||
                        body.earlyPickupDate?.value?.split('T')[0] ||
                        new Date().toISOString().split('T')[0];
    
    console.log(`✅ Parsed order: ${orderId}, Weight: ${weightLB} LB = ${weightKG.toFixed(2)} KG`);
    
    return {
      order_id: orderId,
      source: sourceLocation,
      destination: destLocation,
      weight_kg: Math.round(weightKG * 100) / 100,
      weight_lb: Math.round(weightLB * 100) / 100,
      delivery_date: deliveryDate
    };
  } catch (error) {
    console.error('❌ Error parsing OTM order:', error.message);
    return null;
  }
}

// Get or create label with 3500kg threshold logic
async function getOrCreateLabel(order, token) {
  const route = `${order.source}_${order.destination}`;
  
  // Check for existing active label
  try {
    const findResponse = await axios.post(
      `${CLOUDANT_URL}/labels/_find`,
      {
        selector: {
          route: route,
          status: 'active'
        },
        limit: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`🔍 Looking for active label with route: ${route}`);
    console.log(`📊 Found ${findResponse.data.docs.length} active labels`);
    
    const existingLabel = findResponse.data.docs[0];
    
    // Check if we can add to existing label (5000kg threshold)
    if (existingLabel) {
      const newWeight = existingLabel.cumulative_weight_kg + order.weight_kg;
      console.log(`📦 Existing label: ${existingLabel.label_id}, Current: ${existingLabel.cumulative_weight_kg}kg, Adding: ${order.weight_kg}kg, New total: ${newWeight}kg`);
      
      if (newWeight <= 5000) {
        console.log(`✅ Adding to existing label ${existingLabel.label_id}`);
        // Add to existing label
        existingLabel.orders.push({
          order_id: order.order_id,
          weight_kg: order.weight_kg
        });
        existingLabel.cumulative_weight_kg = Math.round(newWeight * 100) / 100;
        existingLabel.order_count++;
        existingLabel.updated_at = new Date().toISOString();
        
        // Close label if near threshold (95% of 5000kg = 4750kg)
        if (existingLabel.cumulative_weight_kg >= 4750) {
          existingLabel.status = 'closed';
          console.log(`🔒 Closing label ${existingLabel.label_id} - reached 95% threshold`);
        }
        
        return existingLabel;
      } else {
        console.log(`⚠️  Cannot add to ${existingLabel.label_id} - would exceed 5000kg (${newWeight}kg)`);
      }
    } else {
      console.log(`📝 No active label found for route ${route}`);
    }
  } catch (error) {
    console.error(`❌ Error finding label:`, error.message);
  }
  
  // Create new label
  const nextNumber = await getNextLabelNumber(token);
  const labelId = `DHL-${String(nextNumber).padStart(4, '0')}`;
  console.log(`🆕 Creating new label: ${labelId} for route ${route}`);
  
  return {
    _id: labelId,
    label_id: labelId,
    route: route,
    source: order.source,
    destination: order.destination,
    delivery_date: order.delivery_date,
    orders: [{
      order_id: order.order_id,
      weight_kg: order.weight_kg
    }],
    cumulative_weight_kg: order.weight_kg,
    order_count: 1,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// Get next label number
async function getNextLabelNumber(token) {
  try {
    const response = await axios.get(
      `${CLOUDANT_URL}/labels/_all_docs?descending=true&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (response.data.rows.length > 0) {
      const lastId = response.data.rows[0].id;
      if (lastId.startsWith('DHL-')) {
        const lastNumber = parseInt(lastId.split('-')[1]);
        return lastNumber + 1;
      }
    }
    return 1;
  } catch (error) {
    return 1;
  }
}

// Generate HTML label with QR code
function generateHTMLLabel(label) {
  const qrData = encodeURIComponent(JSON.stringify({
    label_id: label.label_id,
    source: label.source,
    destination: label.destination,
    weight_kg: label.cumulative_weight_kg,
    orders: label.orders.map(o => o.order_id)
  }));
  
  const qrCodeUrl = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${qrData}`;
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${label.label_id} - DHL Shipping Label</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .label { width: 800px; border: 3px solid #FFCC00; padding: 20px; margin: 0 auto; }
        .header { background: #FFCC00; color: #D40511; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; }
        .label-id { font-size: 48px; font-weight: bold; color: #D40511; text-align: center; margin: 20px 0; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ccc; }
        .info-row { display: flex; justify-content: space-between; margin: 10px 0; }
        .info-label { font-weight: bold; color: #333; }
        .qr-code { text-align: center; margin: 20px 0; }
        .orders-list { margin: 10px 0; }
        .order-item { padding: 5px; border-bottom: 1px solid #eee; }
        @media print { .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="label">
        <div class="header">DHL EXPRESS</div>
        <div class="label-id">${label.label_id}</div>
        
        <div class="section">
            <div class="info-row">
                <div><span class="info-label">FROM:</span> ${label.source}</div>
                <div><span class="info-label">TO:</span> ${label.destination}</div>
            </div>
            <div class="info-row">
                <div><span class="info-label">DELIVERY DATE:</span> ${label.delivery_date}</div>
                <div><span class="info-label">TOTAL WEIGHT:</span> ${label.cumulative_weight_kg} KG</div>
            </div>
            <div class="info-row">
                <div><span class="info-label">ORDERS:</span> ${label.order_count}</div>
                <div><span class="info-label">STATUS:</span> ${label.status}</div>
            </div>
        </div>
        
        <div class="section">
            <h3>Order Details:</h3>
            <div class="orders-list">
                ${label.orders.map(order => `
                    <div class="order-item">
                        <strong>${order.order_id}</strong> - ${order.weight_kg} KG
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="qr-code">
            <img src="${qrCodeUrl}" alt="QR Code" />
            <div>Scan for tracking information</div>
        </div>
        
        <button class="no-print" onclick="window.print()" style="padding: 10px 20px; background: #D40511; color: white; border: none; cursor: pointer; font-size: 16px;">
            Print Label
        </button>
    </div>
</body>
</html>`;
}

// Save label to Cloudant
async function saveLabel(label, htmlLabel, token) {
  label.html_content = htmlLabel;
  
  try {
    // Try to get existing document to get _rev
    const existingDoc = await axios.get(
      `${CLOUDANT_URL}/labels/${label._id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    ).catch(() => null);
    
    if (existingDoc) {
      label._rev = existingDoc.data._rev;
    }
    
    await axios.put(
      `${CLOUDANT_URL}/labels/${label._id}`,
      label,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error saving label:', error.message);
    throw error;
  }
}

// Mark order as processed
async function markOrderProcessed(order, token) {
  order.processed = true;
  order.processed_at = new Date().toISOString();
  
  await axios.put(
    `${CLOUDANT_URL}/incoming_orders/${order._id}`,
    order,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

// Dashboard API endpoints - Fix CORS issue
app.get('/api/labels', async (req, res) => {
  try {
    const token = await getIAMToken();
    const response = await axios.get(
      `${CLOUDANT_URL}/labels/_all_docs?include_docs=true`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const labels = response.data.rows
      .map(row => row.doc)
      .filter(doc => doc.label_id);
    
    res.json({ success: true, labels });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/label/:id', async (req, res) => {
  try {
    const token = await getIAMToken();
    const response = await axios.get(
      `${CLOUDANT_URL}/labels/${req.params.id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    res.json({ success: true, label: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders/pending', async (req, res) => {
  try {
    const token = await getIAMToken();
    const response = await axios.get(
      `${CLOUDANT_URL}/incoming_orders/_all_docs?include_docs=true`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const pendingOrders = response.data.rows
      .map(row => row.doc)
      .filter(doc => !doc._id.startsWith('_design') && !doc.processed);
    
    res.json({ success: true, count: pendingOrders.length, orders: pendingOrders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Consolidate existing labels endpoint
app.post('/consolidate-labels', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 Manual label consolidation triggered');
  console.log('='.repeat(60));
  
  try {
    const token = await getIAMToken();
    
    // Get all labels
    const labelsResponse = await axios.get(
      `${CLOUDANT_URL}/labels/_all_docs?include_docs=true`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const labels = labelsResponse.data.rows
      .map(row => row.doc)
      .filter(doc => doc.label_id && !doc._id.startsWith('_design'));
    
    console.log(`📦 Found ${labels.length} labels`);
    
    // Group by route
    const routeGroups = {};
    labels.forEach(label => {
      const route = label.route || `${label.source}_${label.destination}`;
      if (!routeGroups[route]) {
        routeGroups[route] = [];
      }
      routeGroups[route].push(label);
    });
    
    const consolidationResults = [];
    
    for (const [route, routeLabels] of Object.entries(routeGroups)) {
      if (routeLabels.length <= 1) continue;
      
      // Sort by created_at
      routeLabels.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      console.log(`\n📍 Route: ${route} - Found ${routeLabels.length} labels`);
      
      // Process labels respecting 5000kg limit
      let currentLabel = null;
      let labelsToDelete = [];
      
      for (const label of routeLabels) {
        if (!currentLabel) {
          // First label becomes the primary
          currentLabel = label;
          currentLabel.max_weight_kg = 5000;
          currentLabel.route = route;
          console.log(`   🎯 Primary: ${currentLabel.label_id} (${currentLabel.cumulative_weight_kg}kg)`);
          continue;
        }
        
        // Check if we can merge this label into current
        const newWeight = currentLabel.cumulative_weight_kg + label.cumulative_weight_kg;
        
        if (newWeight <= 5000) {
          // Can merge
          console.log(`   ➕ Merging: ${label.label_id} (${label.cumulative_weight_kg}kg) → Total: ${newWeight}kg`);
          currentLabel.orders = currentLabel.orders.concat(label.orders);
          currentLabel.cumulative_weight_kg = Math.round(newWeight * 100) / 100;
          currentLabel.order_count = currentLabel.orders.length;
          labelsToDelete.push(label);
        } else {
          // Cannot merge - would exceed 5000kg
          console.log(`   ⚠️  Cannot merge ${label.label_id} (${label.cumulative_weight_kg}kg) - would exceed 5000kg (${newWeight}kg)`);
          
          // Save current label and start new one
          currentLabel.updated_at = new Date().toISOString();
          currentLabel.status = currentLabel.cumulative_weight_kg >= 4750 ? 'closed' : 'active';
          
          await axios.put(
            `${CLOUDANT_URL}/labels/${currentLabel._id}`,
            currentLabel,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          consolidationResults.push({
            route,
            label_id: currentLabel.label_id,
            weight: currentLabel.cumulative_weight_kg,
            orders: currentLabel.order_count,
            status: currentLabel.status
          });
          
          console.log(`   ✅ Saved ${currentLabel.label_id}: ${currentLabel.cumulative_weight_kg}kg, ${currentLabel.order_count} orders`);
          
          // This label becomes the new primary
          currentLabel = label;
          currentLabel.max_weight_kg = 5000;
          currentLabel.route = route;
          console.log(`   🎯 New Primary: ${currentLabel.label_id} (${currentLabel.cumulative_weight_kg}kg)`);
        }
      }
      
      // Save the last current label
      if (currentLabel) {
        currentLabel.updated_at = new Date().toISOString();
        currentLabel.status = currentLabel.cumulative_weight_kg >= 4750 ? 'closed' : 'active';
        
        await axios.put(
          `${CLOUDANT_URL}/labels/${currentLabel._id}`,
          currentLabel,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        consolidationResults.push({
          route,
          label_id: currentLabel.label_id,
          weight: currentLabel.cumulative_weight_kg,
          orders: currentLabel.order_count,
          status: currentLabel.status
        });
        
        console.log(`   ✅ Saved ${currentLabel.label_id}: ${currentLabel.cumulative_weight_kg}kg, ${currentLabel.order_count} orders`);
      }
      
      // Delete merged labels
      for (const label of labelsToDelete) {
        try {
          await axios.delete(
            `${CLOUDANT_URL}/labels/${label._id}?rev=${label._rev}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );
          console.log(`   🗑️  Deleted ${label.label_id}`);
        } catch (error) {
          console.log(`   ❌ Error deleting ${label.label_id}: ${error.message}`);
        }
      }
    }
    
    console.log('='.repeat(60) + '\n');
    
    res.json({
      success: true,
      message: 'Label consolidation complete',
      consolidated_routes: consolidationResults.length,
      results: consolidationResults
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('='.repeat(60) + '\n');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'OTM to Cloudant Proxy with Watson AI Integration',
    version: '2.0.0',
    endpoints: {
      webhook: 'POST /webhook - Receive OTM orders',
      process: 'POST /process-orders - Process orders with 5000kg logic (Watson AI)',
      consolidate: 'POST /consolidate-labels - Consolidate existing labels by route',
      labels: 'GET /api/labels - Get all labels (Dashboard API)',
      label: 'GET /api/label/:id - Get specific label (Dashboard API)',
      pending: 'GET /api/orders/pending - Get pending orders count',
      health: 'GET /health - Health check',
      test: 'GET /test - Test IAM token'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 OTM-Cloudant Proxy Server Started');
  console.log('='.repeat(60));
  console.log('Port:', PORT);
  console.log('Endpoints:');
  console.log('  POST /webhook - Receive OTM orders');
  console.log('  GET  /health  - Health check');
  console.log('  GET  /test    - Test IAM token');
  console.log('  GET  /        - Service info');
  console.log('='.repeat(60) + '\n');
});

