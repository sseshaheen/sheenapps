# 📝 How to Add Sanity CMS to Your Workspace

## 🎯 Quick Start Guide

### Step 1: Open Project Settings

1. **In your workspace builder**, look for the **Settings** button (⚙️ icon) in the workspace header
2. **Click the Settings button** to open the Project Settings panel
3. You'll see the **"Content Management"** section at the top

### Step 2: Connect Your Sanity Project

1. **Click "Connect"** in the Sanity CMS section
2. **Fill in your Sanity project details**:
   - **Project ID**: Found in your Sanity studio URL (`https://[PROJECT-ID].sanity.studio`)
   - **Dataset**: Usually `production`, `staging`, or `development`  
   - **Display Name**: A friendly name for this connection
   - **API Token**: Get this from your Sanity project settings

3. **Test the connection** by clicking "Test Connection"
4. **Once successful**, click "Connect" to complete the setup

### Step 3: Configure Settings (Optional)

- **Real-time Sync**: Enable automatic content updates via webhooks
- **Dataset**: Choose which Sanity dataset to use
- **Display Name**: Give your connection a memorable name

## 🔑 Getting Your Sanity Credentials

### Project ID
1. Go to your Sanity studio (e.g., `https://myproject.sanity.studio`)
2. Look at the URL - the project ID is the first part: `myproject`
3. Or find it in your `sanity.config.ts` file

### API Token
1. **Go to [sanity.io/manage](https://sanity.io/manage)**
2. **Select your project**
3. **Navigate to "API" → "Tokens"**
4. **Click "Add API Token"**
5. **Give it a name** (e.g., "SheenApps Builder")
6. **Select permissions**: 
   - **Read access** (minimum required)
   - **Write access** (if you want to create/edit content)
7. **Copy the token** (you won't see it again!)

## 🎨 What You Can Do

Once connected, your Sanity CMS integration enables:

### ✅ **Content Sync**
- Automatic synchronization of your Sanity content
- Real-time updates when content changes
- Support for drafts and published content

### ✅ **Multi-language Support** 
- Full support for all your locales (Arabic, French, English, etc.)
- RTL text direction support for Arabic content
- Language-specific content filtering

### ✅ **Document Management**
- Browse all your Sanity documents
- Filter by type, language, and status
- Search through your content

### ✅ **Preview System**
- Preview draft content before publishing
- Secure preview links with expiration
- Integration with your site's preview mode

## 🔧 Advanced Features

### Content Queries
- Execute GROQ queries directly from your workspace
- Cached query results for better performance
- Support for parameterized queries

### Webhook Integration
- Automatic webhook setup for real-time updates
- Content change notifications
- Smart cache invalidation

## 🛡️ Security Features

- **Encrypted token storage** - Your API tokens are securely stored
- **Permission-based access** - Only authorized users can manage connections
- **Audit logging** - All connection changes are logged
- **Emergency access** - Admin breakglass access for critical situations

## 🚨 Troubleshooting

### Connection Test Failed?
- **Check your Project ID** - Make sure it matches your Sanity studio
- **Verify your API Token** - Ensure it has the correct permissions
- **Check dataset name** - Must match exactly (case-sensitive)

### Not seeing content?
- **Verify dataset** - Make sure you're connected to the right dataset
- **Check permissions** - Your API token needs read access
- **Try manual sync** - Use the sync button to refresh content

### Real-time updates not working?
- **Check webhook URL** - Must be publicly accessible
- **Verify Sanity webhook** - Should point to your site's webhook endpoint
- **Check connection status** - Must be "connected" for webhooks to work

## 🎯 Best Practices

1. **Use descriptive names** for your connections
2. **Start with read-only tokens** for security
3. **Use staging datasets** for development
4. **Enable real-time sync** for dynamic content
5. **Test connections** before going live

---

## 🎉 That's It!

Your Sanity CMS is now integrated with your workspace. You can manage your headless content directly from the builder settings panel.

**Need help?** Check the connection status indicators and error messages in the settings panel for troubleshooting guidance.