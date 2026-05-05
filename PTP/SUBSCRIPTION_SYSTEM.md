# SaaS Subscription Credit System

## Overview
The P2P Image Editor now includes a complete SaaS subscription credit system with multiple pricing tiers, credit management, and user authentication.

## Features Implemented

### 1. User Authentication
- Access code-based authentication
- User information stored in `users.json`
- Session management with sessionStorage
- Automatic user info display after login

### 2. Subscription Plans
Four subscription tiers are available:

#### Free Plan
- **Price**: $0/month
- **Credits**: 10/month
- **Cost per operation**:
  - Edit: 2 credits
  - Generate: 1 credit
- **Features**: Basic quality, Standard support

#### Basic Plan
- **Price**: $9.99/month
- **Credits**: 100/month
- **Cost per operation**:
  - Edit: 2 credits
  - Generate: 1 credit
- **Features**: High quality, Priority support, No watermark

#### Professional Plan
- **Price**: $29.99/month
- **Credits**: 500/month
- **Cost per operation**:
  - Edit: 1 credit
  - Generate: 1 credit
- **Features**: Ultra quality, 24/7 support, API access, Commercial license

#### Enterprise Plan
- **Price**: $99.99/month
- **Credits**: 2000/month
- **Cost per operation**:
  - Edit: 1 credit
  - Generate: 1 credit
- **Features**: Maximum quality, Dedicated support, Custom API, White label, SLA guarantee

#### Beta User (Internal)
- **Price**: $0
- **Credits**: Unlimited (999999)
- **Cost per operation**: 0 credits (free)
- **Features**: All features, Beta access
- **Access Code**: `ptp2025`

### 3. Credit Management
- Real-time credit balance display
- Automatic credit deduction on each operation
- Credit cost display before operation
- Insufficient credits error handling
- Credit balance updates after each operation

### 4. User Interface
- User badge showing username and plan name
- Credits counter with lightning icon (⚡)
- Credit cost information below action buttons
- Subscription plans grid with feature comparison
- Current plan highlighting
- Mobile-responsive design

### 5. API Endpoints

#### POST /api/auth
Authenticate user with access code
```json
Request:
{
  "accessCode": "ptp2025"
}

Response:
{
  "success": true,
  "user": {
    "userId": "beta_user_001",
    "username": "Beta Tester",
    "email": "beta@example.com",
    "plan": "beta",
    "planName": "Beta User",
    "credits": 999999,
    "usedCredits": 0,
    "creditCost": {
      "edit": 0,
      "generate": 0
    },
    "features": [...],
    "createdAt": "2026-03-08T00:00:00.000Z",
    "expiresAt": null
  }
}
```

#### GET /api/plans
Get all available subscription plans
```json
Response:
{
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "credits": 10,
      "price": 0,
      "features": [...],
      "creditCost": {
        "edit": 2,
        "generate": 1
      }
    },
    ...
  ]
}
```

#### POST /api/generate
Generate image (requires accessCode in request body)
```json
Request:
{
  "prompt": "...",
  "width": 1024,
  "height": 1024,
  "steps": 4,
  "cfg": 1,
  "accessCode": "ptp2025"
}

Response:
{
  "success": true,
  "image": "/outputs/xxx.png",
  "thumbnail": "/outputs/thumb_xxx.jpg",
  "creditsUsed": 1,
  "creditsRemaining": 999998
}

Error (402 - Insufficient Credits):
{
  "error": "Insufficient credits",
  "credits": 0,
  "required": 1
}
```

#### POST /api/edit
Edit image (requires accessCode in form data)
```
FormData:
- image: File
- prompt: String
- accessCode: String

Response: Same as /api/generate
```

## User Data Structure

### users.json
```json
{
  "ACCESS_CODE": {
    "userId": "unique_id",
    "username": "Display Name",
    "email": "user@example.com",
    "plan": "free|basic|pro|enterprise|beta",
    "planName": "Plan Display Name",
    "credits": 100,
    "usedCredits": 0,
    "createdAt": "ISO 8601 date",
    "expiresAt": "ISO 8601 date or null",
    "creditCost": {
      "edit": 2,
      "generate": 1
    }
  }
}
```

## Adding New Users

To add a new user, edit `users.json`:

```json
{
  "ptp2025": { ... },
  "newuser123": {
    "userId": "user_002",
    "username": "New User",
    "email": "newuser@example.com",
    "plan": "basic",
    "planName": "Basic",
    "credits": 100,
    "usedCredits": 0,
    "createdAt": "2026-03-08T00:00:00.000Z",
    "expiresAt": null,
    "creditCost": {
      "edit": 2,
      "generate": 1
    }
  }
}
```

## Internationalization

The system supports English and Chinese:
- User interface automatically adapts to selected language
- All subscription plan information is translated
- Credit-related messages are localized

## Security Notes

1. **Access Code Storage**: Access codes are stored in sessionStorage (cleared on browser close)
2. **Server-Side Validation**: All operations validate the access code on the server
3. **Credit Deduction**: Credits are deducted server-side before processing
4. **File Storage**: User data is stored in a JSON file (consider database for production)

## Future Enhancements

1. **Payment Integration**: Add Stripe/PayPal for subscription payments
2. **Credit Refill**: Allow users to purchase additional credits
3. **Usage Analytics**: Track user usage patterns and statistics
4. **Email Notifications**: Send alerts for low credits or expiring subscriptions
5. **Admin Dashboard**: Manage users, plans, and credits
6. **Database Migration**: Move from JSON file to proper database (PostgreSQL/MongoDB)
7. **API Keys**: Generate API keys for programmatic access
8. **Webhooks**: Notify external systems of subscription events

## Testing

### Test Beta User
- Access Code: `ptp2025`
- Plan: Beta User
- Credits: Unlimited
- All operations are free

### Test Credit System
1. Create a test user with limited credits (e.g., 5 credits)
2. Perform operations and verify credit deduction
3. Try to perform operation with insufficient credits
4. Verify error handling and user feedback

## Deployment Notes

1. Ensure `users.json` has proper file permissions
2. Consider using environment variables for sensitive configuration
3. Implement proper backup strategy for user data
4. Monitor credit usage and system performance
5. Set up logging for authentication and credit operations
