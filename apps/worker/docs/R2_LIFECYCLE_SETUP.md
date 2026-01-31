# R2 Lifecycle Rules Configuration Guide

**Date**: July 27, 2025  
**Status**: Ready for Deployment  
**Estimated Time**: 15 minutes  

## 🎯 **Overview**

Configure R2 bucket lifecycle rules to automatically manage storage costs while preserving important snapshots.

## 📋 **Configuration Steps**

### **Option 1: Cloudflare Dashboard (Recommended for Quick Setup)**

1. **Navigate to R2 Bucket**:
   - Go to Cloudflare Dashboard → R2 Object Storage
   - Select bucket: `sheenapps-builder-artifacts`
   - Click "Manage" → "Lifecycle Rules"

2. **Rule 1: Delete Old Snapshots (Cost Control)**
   ```yaml
   Name: delete-old-snapshots
   Status: Enabled
   Filter: 
     Prefix: "" (applies to all objects)
   Action: Delete after 30 days
   ```

3. **Rule 2: Archive Monthly Snapshots (Optional - Future Enhancement)**
   ```yaml
   Name: archive-monthly
   Status: Enabled  
   Filter:
     Prefix: "*/snapshots/"
     Tags: retention=monthly
   Action: 
     - Move to Archive storage after 30 days
     - Delete after 365 days (1 year)
   ```

4. **Rule 3: Preserve Yearly Snapshots (Optional - Future Enhancement)**
   ```yaml
   Name: keep-yearly
   Status: Enabled
   Filter:
     Prefix: "*/snapshots/"  
     Tags: retention=yearly
   Action: No expiration (keep forever)
   ```

### **Option 2: Terraform (Recommended for Infrastructure as Code)**

Use the configuration file: `terraform/r2-lifecycle.tf`

```bash
# Deploy lifecycle rules
cd terraform/
terraform init
terraform plan -var="cloudflare_account_id=YOUR_ACCOUNT_ID"
terraform apply
```

## ⚠️ **Important Notes**

### **Current Implementation (Phase 1)**
- **Only Rule 1 is immediately needed** - automatic 30-day deletion
- Rules 2 & 3 are future enhancements for when we implement tagging

### **Cost Impact**
- **Before**: Unlimited storage growth (~$15/TB/month)
- **After**: Automatic cleanup after 30 days (~90% cost reduction)
- **Estimated monthly cost**: $5-50 depending on usage

### **Safety Considerations**
- ✅ **30 days gives users time** to download important versions
- ✅ **R2 is backup storage** - primary data is in Cloudflare Pages
- ✅ **Rollback still works** for recent versions (within 30 days)
- ⚠️ **Users should be notified** about the 30-day retention policy

## 🔄 **Future Enhancements**

When we implement advanced retention:

1. **Tagging Strategy**:
   ```typescript
   // Tag important snapshots during upload
   await uploadToR2(artifactZipPath, artifactKey, {
     metadata: {
       retention: isFirstOfMonth ? 'monthly' : 'standard',
       yearlySnapshot: isJanuary1st ? 'true' : 'false'
     }
   });
   ```

2. **User Controls**:
   - Allow users to mark versions as "important" (extends retention)
   - Premium users get longer retention (90 days vs 30 days)
   - Export notifications before deletion

## ✅ **Verification**

After deployment, verify rules are active:

1. **Dashboard Check**: Go to bucket → Lifecycle Rules → Confirm rules are "Active"
2. **Test Object**: Upload test file, confirm it appears in deletion queue after 30 days
3. **Monitoring**: Set up alerts for cost changes in Cloudflare billing

## 📊 **Expected Results**

- ✅ **Automatic cost control** - no runaway storage bills
- ✅ **Reasonable retention** - 30 days for user downloads  
- ✅ **Scalable foundation** - ready for advanced retention when needed
- ✅ **Compliance ready** - structured for future audit requirements

This configuration balances cost control with user needs, providing a solid foundation for the R2 storage system!