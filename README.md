# OTM to Cloudant Proxy

This service receives orders from Oracle Transportation Management (OTM) and forwards them to IBM Cloudant with proper IAM authentication.

## Overview

OTM cannot directly authenticate with IBM Cloud IAM, so this proxy handles:
- IAM token generation and caching
- Automatic token refresh (every hour)
- Request forwarding to Cloudant
- Error handling and logging

## Endpoints

### POST /webhook
Receives OTM orders and forwards to Cloudant.

**Request:**
```json
{
  "senderSystemId": "OTM",
  "transactions": {
    "items": [{
      "body": {
        "orderReleaseXid": "ORDER_001",
        "sourceLocationGid": "ALPHA.VETTER-PHARMA",
        "destLocationGid": "ALPHA.CARDINAL-HEALTH",
        "totalWeight": {
          "value": 3647.42,
          "unit": "LB"
        }
      }
    }]
  }
}
```

**Response:**
```json
{
  "success": true,
  "cloudant_id": "ORDER_001",
  "cloudant_rev": "1-xxxxx",
  "processing_time_ms": 234
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-22T11:30:00Z",
  "token_cached": true,
  "token_expires": "2026-06-22T12:30:00Z",
  "uptime_seconds": 3600
}
```

### GET /test
Test IAM token generation.

**Response:**
```json
{
  "success": true,
  "message": "IAM token obtained successfully",
  "token_preview": "eyJraWQiOiIyMDI0MDYyNTE4MzAi...",
  "expires_at": "2026-06-22T12:30:00Z"
}
```

### GET /
Service information.

## Configuration

The service is configured with:
- **Cloudant URL**: IBM Cloudant database endpoint
- **Cloudant API Key**: IAM API key for authentication
- **Target Database**: `incoming_orders`

## Deployment

### Render.com (Recommended)

1. Fork or upload this repository to GitHub
2. Sign up at https://render.com
3. Create new Web Service
4. Connect to GitHub repository
5. Configure:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
6. Deploy

Your service will be available at: `https://your-app.onrender.com`

### Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Server runs on http://localhost:3000
```

## Testing

### Test health check
```bash
curl https://your-app.onrender.com/health
```

### Test IAM token
```bash
curl https://your-app.onrender.com/test
```

### Send test order
```bash
curl -X POST https://your-app.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"_id":"TEST_001","test":true}'
```

## OTM Configuration

Configure OTM Integration Agent with:

```
URL: https://your-app.onrender.com/webhook
Method: POST
Content-Type: application/json
Authentication: None
Payload: Send exact OTM JSON
```

## Architecture

```
OTM (Oracle) 
  ↓ JSON via REST
Proxy (Render.com)
  ↓ IAM authenticated
IBM Cloudant
  ↓ Processed by
Python Script
  ↓ Notifications
Email + Dashboard
```

## Features

- ✅ Automatic IAM token management
- ✅ Token caching (reduces API calls)
- ✅ Automatic token refresh
- ✅ Detailed logging
- ✅ Error handling
- ✅ Health monitoring
- ✅ Free hosting on Render.com

## Requirements

- Node.js 18+
- Express.js 4.18+
- Axios 1.6+

## License

MIT

## Author

Zeenath Mohamed
zeenath.mohamed@ibm.com

## Support

For issues or questions, check the logs in Render.com dashboard or Cloudant database.