# 🚀 Deployment Guide - Step by Step

## ✅ Files Created

You now have 3 files in the `otm-proxy` folder:
- ✅ `server.js` - The proxy server code
- ✅ `package.json` - Node.js configuration
- ✅ `README.md` - Documentation

---

## 📋 Next Steps

### Step 1: Upload to GitHub (5 minutes)

1. **Go to GitHub**: https://github.com
2. **Sign in** (or create free account)
3. **Click "+" icon** (top right) → **"New repository"**
4. **Repository name**: `otm-cloudant-proxy`
5. **Description**: `Proxy for OTM to Cloudant integration`
6. **Visibility**: Public
7. **Click** "Create repository"
8. **Upload files**:
   - Click "uploading an existing file"
   - Drag and drop all 3 files from `otm-proxy` folder
   - Click "Commit changes"

✅ **Your code is now on GitHub!**

---

### Step 2: Deploy to Render.com (7 minutes)

1. **Go to Render.com**: https://render.com
2. **Click** "Get Started" or "Sign Up"
3. **Sign up with GitHub** (easiest option)
4. **Authorize Render** to access your GitHub

5. **Create New Web Service**:
   - Click **"New +"** (top right)
   - Select **"Web Service"**
   - Click **"Build and deploy from a Git repository"**
   - Click **"Next"**

6. **Connect Repository**:
   - Find your `otm-cloudant-proxy` repository
   - Click **"Connect"**

7. **Configure Service**:
   ```
   Name: otm-cloudant-proxy
   Region: Frankfurt (or closest to you)
   Branch: main
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   Plan: Free
   ```

8. **Click** "Create Web Service"

9. **Wait for Deployment** (2-3 minutes):
   - Watch the build logs
   - Wait for "Your service is live 🎉"

10. **Copy Your URL**:
    - Example: `https://otm-cloudant-proxy.onrender.com`
    - **Save this URL!**

✅ **Your proxy is now live!**

---

### Step 3: Test Your Proxy (3 minutes)

#### Test 1: Health Check

Open browser and go to:
```
https://your-app.onrender.com/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-22T11:45:00Z"
}
```

#### Test 2: Test IAM Token

Open browser and go to:
```
https://your-app.onrender.com/test
```

**Expected:**
```json
{
  "success": true,
  "message": "IAM token obtained successfully"
}
```

#### Test 3: Send Test Order

Open Command Prompt and run:

**Windows:**
```bash
curl -X POST https://your-app.onrender.com/webhook ^
  -H "Content-Type: application/json" ^
  -d "{\"_id\":\"TEST_001\",\"test\":true}"
```

**Mac/Linux:**
```bash
curl -X POST https://your-app.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"_id":"TEST_001","test":true}'
```

**Expected:**
```json
{
  "success": true,
  "cloudant_id": "TEST_001",
  "cloudant_rev": "1-xxxxx"
}
```

#### Test 4: Verify in Cloudant

1. Go to IBM Cloud → Cloudant
2. Launch Dashboard
3. Open `incoming_orders` database
4. Should see `TEST_001` document

✅ **If all tests pass, your proxy is working perfectly!**

---

### Step 4: Configure OTM (2 minutes)

In OTM Integration Agent:

```
URL: https://your-app.onrender.com/webhook
Method: POST
Content-Type: application/json
Authentication: None
Payload: Send exact OTM JSON
```

**Replace `your-app.onrender.com` with your actual Render.com URL!**

---

### Step 5: Monitor (Ongoing)

#### View Logs in Render.com
1. Go to your service in Render.com
2. Click "Logs" tab
3. See real-time requests

#### Check Cloudant
1. Go to Cloudant Dashboard
2. Check `incoming_orders` database
3. See incoming orders

---

## 🎯 What You've Accomplished

✅ Created proxy server with IAM authentication  
✅ Deployed to Render.com (FREE hosting)  
✅ Tested all endpoints  
✅ Ready for OTM integration  

---

## 📞 Troubleshooting

### Proxy returns 500 error
- Check Render.com logs
- Verify Cloudant credentials in `server.js`
- Test IAM endpoint manually

### OTM can't reach proxy
- Verify URL is correct
- Check Render service is running
- Test with curl first

### Cloudant returns 401
- IAM token expired (should auto-refresh)
- Check API key is valid
- Verify Cloudant URL is correct

---

## 🎉 Next Steps

Once OTM is sending orders:

1. **Setup Python Processor** - Process orders and assign labels
2. **Setup Dashboard** - View labels in real-time
3. **Setup Email Notifications** - Get alerts for new labels
4. **Automate Processing** - Schedule Python script

All instructions are in `COMPLETE_STEP_BY_STEP_GUIDE.md`

---

## 💰 Cost

- Render.com: **$0.00/month** (Free tier)
- IBM Cloudant: **$0.00/month** (Lite plan)
- **Total: FREE forever!**

---

**Your proxy is ready to receive OTM orders! 🚀**