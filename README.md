# SpotNest Backend

SpotNest is a property rental platform with user authentication, owner/admin workflows, property listings, notifications, chat, and rental payments.

## Tech Stack

- Node.js
- Express.js
- TypeScript
- MongoDB + Mongoose
- JWT-based auth with HTTP-only cookies
- Razorpay
- Socket.IO
- Cloudinary for uploads
- Zod validation

## Project Structure

```text
spotnest-backend/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── routes/
│   ├── modules/
│   │   ├── auth/
│   │   ├── bookings/
│   │   ├── chat/
│   │   ├── dashboard/
│   │   ├── notifications/
│   │   ├── payments/
│   │   ├── properties/
│   │   └── settings/
│   ├── shared/
│   └── types/
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Main Modules

- Auth: login, signup, OTP verification, refresh, Google OAuth, user profile flows
- Properties: listing, owner management, image upload, admin approvals
- Bookings: tenant rental requests, owner approval/rejection, and date-based rental lifecycle
- Payments: separate Razorpay advance and monthly-rent payments, verification, and webhook handling
- Notifications: in-app notifications
- Chat: conversation and messaging
- Dashboard: admin/tenant dashboards

## Payment Flow

Rental requests and payments follow this flow:

1. A tenant requests a property for selected rental dates. The backend snapshots monthly rent and advance terms into a PENDING booking.
2. The owner reviews the request at GET /api/v1/bookings/owner/requests and approves or rejects it.
3. Approval enables advance payment; rejection ends the request without creating a payment.
4. The tenant requests an advance order at POST /api/v1/payments/advance/create-order. The backend uses the saved booking amount.
5. After checkout, POST /api/v1/payments/verify validates the signature and Razorpay order/payment amount, currency, and ownership.
6. A verified advance creates a scheduled or active rental. The booking becomes CONFIRMED, then ACTIVE when the rental start date arrives.
7. Due monthly rent records are created separately for each billing month and paid through POST /api/v1/payments/monthly/create-order.

## Environment Variables

Create a .env file based on .env.example:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/spotnest
JWT_SECRET=change-me
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000

RAZORPAY_KEY_ID=rzp_test_replace_me
RAZORPAY_KEY_SECRET=replace_me
RAZORPAY_WEBHOOK_SECRET=replace_me
```

Important:

- Never expose RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET to the frontend
- The backend returns only the public Razorpay key ID with an order
- Keep webhook secret separate from normal API secret

## Routes

### Auth

- POST /api/v1/auth/signup
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- GET /api/v1/auth/me

### Bookings

- POST /api/v1/bookings/
- GET /api/v1/bookings/mine
- GET /api/v1/bookings/owner/requests
- PATCH /api/v1/bookings/:id/review
- GET /api/v1/bookings/:id

### Payments

- POST /api/v1/payments/advance/create-order
- POST /api/v1/payments/monthly/create-order
- POST /api/v1/payments/verify
- POST /api/v1/payments/webhook

## Local Development

```bash
npm install
npm run dev
```

The server runs on:

```text
http://localhost:5000
```

## Production Build

```bash
npm run build
npm start
```

## Notes

- Advance and monthly rent have separate payment records in the tenant payment ledger
- Booking confirmation is only updated after backend verification or a signed captured-payment webhook
- Monthly billing records are generated for due rental cycles when tenant payment history is requested
