const express = require('express');
const axios = require('axios');
const app = express();

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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'OTM to Cloudant Proxy',
    version: '1.0.0',
    endpoints: {
      webhook: 'POST /webhook - Receive OTM orders',
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

// Made with Bob
