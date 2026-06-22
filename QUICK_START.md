# ⚡ QUICK START - 15 Minutes to Live System

## ✅ What You Have

In the `otm-proxy` folder on your Desktop:
- ✅ `server.js` - Proxy server (167 lines of JavaScript)
- ✅ `package.json` - Configuration (24 lines)
- ✅ `README.md` - Full documentation
- ✅ `DEPLOYMENT_GUIDE.md` - Detailed deployment steps

---

## 🚀 Deploy in 3 Steps

### Step 1: Upload to GitHub (3 min)

1. Go to https://github.com → Sign in
2. Click "+" → "New repository"
3. Name: `otm-cloudant-proxy`
4. Click "Create repository"
5. Click "uploading an existing file"
6. Drag all 4 files from `otm-proxy` folder
7. Click "Commit changes"

✅ **Done!**

---

### Step 2: Deploy to Render.com (5 min)

1. Go to https://render.com → Sign up with GitHub
2. Click "New +" → "Web Service"
3. Connect to your `otm-cloudant-proxy` repo
4. Configure:
   - Name: `otm-cloudant-proxy`
   - Build: `npm install`
   - Start: `npm start`
   - Plan: **Free**
5. Click "Create Web Service"
6. Wait 3 minutes for deployment
7. Copy your URL: `https://otm-cloudant-proxy.onrender.com`

✅ **Done!**

---

### Step 3: Test (2 min)

Open browser and test:

**Health Check:**
```
https://your-app.onrender.com/health
```

**IAM Token Test:**
```
https://your-app.onrender.com/test
```

Both should return JSON with `"success": true`

✅ **Done!**

---

## 🎯 Configure OTM

Give OTM team this URL:
```
https://your-app.onrender.com/webhook
```

**OTM Configuration:**
- Method: POST
- Content-Type: application/json
- Authentication: None

---

## 📊 What Happens Next

```
OTM sends order
    ↓
Your Render.com proxy (handles IAM auth)
    ↓
IBM Cloudant (stores order)
    ↓
Python script (processes & assigns labels)
    ↓
Email notification + Dashboard
```

---

## 🎉 You're Done!

**Total Time:** 10 minutes  
**Total Cost:** $0.00/month  
**Status:** Production ready  

---

## 📞 Need Help?

1. Check `DEPLOYMENT_GUIDE.md` for detailed steps
2. Check `README.md` for full documentation
3. View logs in Render.com dashboard
4. Check Cloudant for incoming orders

---

## 🔗 Important Links

- **Your Proxy Code:** Desktop/otm-proxy/
- **GitHub:** https://github.com/your-username/otm-cloudant-proxy
- **Render.com:** https://dashboard.render.com
- **IBM Cloud:** https://cloud.ibm.com
- **Cloudant Dashboard:** Launch from IBM Cloud

---

**Your OTM integration is ready! 🚀**