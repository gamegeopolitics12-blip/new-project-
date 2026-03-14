# ODRkart Mobile App - Complete Development Prompt
## React Native / Flutter Implementation Guide

---

## 📱 PROJECT OVERVIEW

Build a production-ready mobile app (React Native or Flutter) for **ODRkart** - India's premier Online Dispute Resolution platform. The app must replicate 100% of the web functionality with mobile-optimized UX, offline capabilities, and enterprise-grade security.

**Core Purpose:** Enable users to file legal disputes, track cases, access AI-powered analysis, make secure payments, and interact with legal professionals - all from their mobile device.

---

## 🎨 DESIGN SYSTEM & BRANDING

### Color Palette
```
Primary Pink: #de18c7
Secondary Purple: #9b59b6
Dark Navy: #1a1a2e
Background Beige: #ccc389
White: #fff
Gradients:
  - Hero: linear-gradient(135deg, #fffdf7, #f5e8ff, #e8e0c0)
  - CTA: linear-gradient(90deg, #de18c7, #9b59b6)
  - Dark sections: linear-gradient(135deg, #07071a, #0f0820, #060f1a)
```

### Typography
- **Headings:** DM Sans (900 weight)
- **Body:** DM Sans (400/500 weight)
- **Code/Numbers:** JetBrains Mono (700/800 weight)

### Design Principles
- **Pink/Purple dominant** with gradients for CTAs
- **Card-based layouts** with soft shadows
- **Glassmorphism** for overlays (blur + transparency)
- **Auto-scrolling horizontal carousels** for content sections
- **Skeleton loaders** for AI-generated content
- **Bottom sheets** for forms and detail views
- **Haptic feedback** on key interactions

---

## 📐 APP ARCHITECTURE

### Navigation Structure
```
TabNavigator (Bottom Navigation)
├─ Home (Dashboard)
├─ Cases (My Disputes)
├─ AI Lab (Blog + Analysis)
├─ Services (ODR Offerings)
└─ Profile (Account + Settings)

StackNavigator (Per Tab)
├─ Auth Stack (Login/Register)
├─ Case Filing Wizard (6 Steps)
├─ Case Detail
├─ Payment Flow (Stripe)
├─ AI Report Viewer (Dual Tabs)
├─ Blog Post Reader
└─ Settings/Support
```

### State Management
**React Native:** Redux Toolkit + RTK Query  
**Flutter:** Bloc/Cubit + Freezed

**Required Slices/Blocs:**
- `authSlice` - JWT tokens, user session
- `casesSlice` - Dispute filing, tracking
- `aiSlice` - Analysis, blog posts, caching
- `paymentsSlice` - Stripe integration
- `chatSlice` - AI chatbot state

---

## 🚀 FEATURE IMPLEMENTATION GUIDE

### 1. **HERO DASHBOARD (Home Screen)**

**Live Statistics Panel**
```
┌─────────────────────────────────┐
│ 🏛️ Active Case Dashboard    ● LIVE │
├─────────────────────────────────┤
│ New cases today: 21             │
│ Active hearings: 8              │
├───────┬───────┬───────┬─────────┤
│ 12K+  │  98%  │  30d  │  500+   │
│ Cases │ Sat   │ Avg   │ Panel   │
└───────┴───────┴───────┴─────────┘
📋 Recent Activity (Animated Feed)
✅ Case ODR-2026-4821 resolved
📝 New case filed by Priya S.
🎤 Hearing started – ODR-4819
─────────────────────────────────
Progress Bar: 78% to monthly target
```

**Implementation:**
- **WebSocket connection** for live updates (cases filed, hearings started)
- **Animated counter** on mount (12K+, 98%, etc.)
- **Vertical auto-scroll feed** (3 visible items, refreshes every 3.5s)
- **Linear progress indicator** with percentage label
- **Pull-to-refresh** for manual update
- **Clock widget** showing current IST time

**API Endpoints:**
```
GET /api/stats/live
WebSocket ws://api.odrkart.com/stats
```

---

### 2. **CASE FILING WIZARD (6-Step Flow)**

**Step 1: Case Information**
```
Fields:
- Case Title (text input, 5-200 chars)
- Dispute Category (dropdown): Contract, Payment, Consumer, Employment, Real Estate, IP, E-Commerce, Cross-Border
- Claim Amount (number input, ₹ prefix)
- Preferred Resolution (dropdown): Mediation, Arbitration, Conciliation, Not Sure
- Brief Description (multiline, 10-5000 chars)

Validation:
- Real-time character count
- Required field indicators
- Error messages below inputs
```

**Step 2: Parties Involved**
```
Claimant (You):
- Full Name, Email, Phone

Respondent:
- Full Name/Company, Email (optional)

Validation:
- Email format check
- Phone number +91 format
```

**Step 3: Evidence Upload**
```
- Drag & drop zone OR file picker
- Accepted: PDF, DOC, DOCX, JPG, PNG, MP4
- Max size: 50MB per file
- Multiple files allowed
- Display: Filename, size, type icon, progress bar
- Remove button per file

Security:
- Client-side type validation
- File preview for images/PDFs
- Upload to signed S3 URLs
```

**Step 4: AI Document Analysis** ⚡ *Key Feature*
```
┌─────────────────────────────────┐
│ 🧠 ODRkart AI Document Analyser │
│ Generates dual reports          │
├─────────────────────────────────┤
│ 📋 Inputs Being Analysed        │
│ • Case: [title]                 │
│ • Type: [category]              │
│ • Claim: ₹[amount]              │
│ • Docs: [count] uploaded        │
├─────────────────────────────────┤
│ [✦ Run AI Analysis]             │
└─────────────────────────────────┘

During analysis:
 🧠 Analysing your case…
 Step 1 ✓ Reading case information
 Step 2 ⏳ Identifying parties
 Step 3 ⏳ Reviewing evidence
 Step 4 ⏳ Assessing legal merit
 Step 5 ⏳ Generating Company Report
 Step 6 ⏳ Generating Client Report

After completion:
Tab Switcher: [🏢 Company Report] [👤 Client Report]

Company Report (Internal):
┌─────────────────────────────────┐
│ 🏢 Internal Company Analysis   │
│ ODRkart · Confidential · [date] │
├─────────────────────────────────┤
│ Merit Score: 87/100 (HIGH)      │
│ Complexity: M | Timeline: 30d   │
├─────────────────────────────────┤
│ 📋 CASE OVERVIEW                │
│ [AI-generated text]             │
│                                 │
│ ⚖️ LEGAL MERIT ASSESSMENT       │
│ [AI-generated text]             │
│ ... (6 sections total)          │
└─────────────────────────────────┘
[📥 Download Company PDF]

Client Report (User-facing):
Similar structure, friendly tone
[📥 Download Client PDF]
```

**API Integration:**
```javascript
// React Native Example
const { data, isLoading } = useAnalyzeCaseMutation({
  title, category, amount, description,
  claimant, respondent, documents
});

// Response:
{
  companyReport: { text, error },
  clientReport: { text, error },
  caseData,
  generatedAt
}
```

**Step 5: Resolution Preferences**
```
- Desired Outcome (dropdown)
- Hearing Preference: Video/Asynchronous/In-person
- Language: English, Hindi, Tamil, Telugu, Marathi
```

**Step 6: Review & Submit**
```
Summary Card:
┌─────────────────────────────────┐
│ Case Title: [value]             │
│ Category: [value]               │
│ Claim Amount: ₹[value]          │
│ AI Analysis: ✓ Completed        │
│ Platform Fee: ₹1,999 (incl. GST)│
└─────────────────────────────────┘

Stripe Payment Integration:
[Full Stripe Elements form - see below]

After payment success:
┌─────────────────────────────────┐
│         ✓ Success!              │
│ Case Filed Successfully          │
│                                 │
│ Your Case Reference ID:         │
│ ┌─────────────────────────┐    │
│ │    ODR-2026-4821        │    │
│ └─────────────────────────┘    │
│ Payment ID: pi_ABC123XYZ        │
│                                 │
│ [← Back to Home] [📄 Receipt]   │
└─────────────────────────────────┘
```

**Progress Indicator:**
- Top stepper: 6 circles with connecting line
- Current step highlighted in pink
- Completed steps with checkmark
- Progress bar: 0% → 20% → 40% → 60% → 80% → 100%

---

### 3. **STRIPE PAYMENT INTEGRATION** 💳

**UI Components:**
```
┌─────────────────────────────────┐
│ 💳 Pay Securely via Stripe      │
│ Cards · Apple Pay · Google Pay  │
│                                 │
│ Total Amount                    │
│ ₹1,999 incl. GST                │
├─────────────────────────────────┤
│ Cardholder Name                 │
│ [________________]              │
│                                 │
│ Card Number                 💳  │
│ [____ ____ ____ ____]           │
│                                 │
│ Expiry Date      CVV        🔒  │
│ [MM / YY]        [•••]          │
├─────────────────────────────────┤
│ [✓] I agree to Terms & authorize│
│     payment of ₹1,999           │
├─────────────────────────────────┤
│ [🔒 Pay ₹1,999]                 │
│ 256-bit TLS · PCI DSS Level 1   │
└─────────────────────────────────┘
```

**React Native Implementation:**
```javascript
import { StripeProvider, CardField, useStripe } from '@stripe/stripe-react-native';

const PaymentScreen = () => {
  const { createPaymentMethod } = useStripe();
  
  const handlePayment = async () => {
    // 1. Create Payment Intent on backend
    const { clientSecret } = await fetch('/api/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify({ caseId, amount: 199900, currency: 'inr' })
    }).then(r => r.json());

    // 2. Collect card details
    const { paymentMethod } = await createPaymentMethod({
      type: 'Card',
      card: cardDetails
    });

    // 3. Confirm payment
    const { paymentIntent } = await confirmPayment(clientSecret, {
      type: 'Card',
      paymentMethodId: paymentMethod.id
    });

    // 4. Handle result
    if (paymentIntent.status === 'succeeded') {
      submitCase(paymentIntent.id);
    }
  };
};
```

**Flutter Implementation:**
```dart
import 'package:flutter_stripe/flutter_stripe.dart';

Future<void> processPayment() async {
  // 1. Create Payment Intent
  final response = await http.post(
    Uri.parse('$apiUrl/payments/create-intent'),
    body: json.encode({'caseId': caseId, 'amount': 199900, 'currency': 'inr'})
  );
  final clientSecret = json.decode(response.body)['clientSecret'];

  // 2. Present payment sheet
  await Stripe.instance.initPaymentSheet(
    paymentSheetParameters: SetupPaymentSheetParameters(
      merchantDisplayName: 'ODRkart',
      paymentIntentClientSecret: clientSecret,
      style: ThemeMode.light,
    )
  );

  await Stripe.instance.presentPaymentSheet();

  // 3. Payment successful
  submitCase(paymentIntentId);
}
```

**Security Requirements:**
- **Never store card details locally**
- **Use Stripe SDK** (not manual API calls)
- **PCI DSS compliance** via Stripe
- **3D Secure** for Indian cards
- **Webhook handling** for async updates

---

### 4. **AI LAB BLOG** 🧠 *Autonomous Content*

**Blog List View (Auto-Generated)**
```
┌─────────────────────────────────┐
│ 🧠 ODRkart AI Lab Blog          │
│ Auto-Publishing · AI-Powered    │
├─────────────────────────────────┤
│ [✦ Generate New Posts]          │
│                                 │
│ Topics: [All] [⚖️ Arb] [🤖 Tech]│
│         [👤 Consumer] [🌐 Intl] │
├─────────────────────────────────┤
│ Grid of Blog Cards (2 columns): │
│                                 │
│ ┌─────────┐ ┌─────────┐        │
│ │ 🤖       │ │ ⚖️       │        │
│ │ Legal    │ │ Arbitr.  │        │
│ │ Tech     │ │ Update   │        │
│ │ [title]  │ │ [title]  │        │
│ │ [excerpt]│ │ [excerpt]│        │
│ │ 5 min    │ │ 8 min    │        │
│ └─────────┘ └─────────┘        │
│                                 │
│ ✦ 4 articles published          │
│ Updated: 2:45 PM IST            │
└─────────────────────────────────┘
```

**Post Generation Flow:**
```javascript
// User taps "Generate New Posts"
setLoading(true);

// Show skeleton cards while generating
showSkeletons(4);

// Call AI API
const { posts } = await fetch('/api/ai/generate-blog-posts', {
  method: 'POST',
  body: JSON.stringify({ 
    topic: 'all', // or specific topic
    count: 4 
  })
}).then(r => r.json());

// Render posts
posts.forEach(post => renderBlogCard(post));

// Cache in AsyncStorage/SharedPreferences
await storage.set('blog_posts', JSON.stringify(posts));
```

**Blog Post Detail View:**
```
┌─────────────────────────────────┐
│ [← Back]                        │
│                                 │
│ 🤖                              │
│ Legal Tech                      │
│                                 │
│ Large Language Models as        │
│ Legal Research Tools            │
│                                 │
│ By ODRkart AI Lab · 5 min read  │
├─────────────────────────────────┤
│ [Full AI-generated article]    │
│ (Multi-paragraph content)       │
│                                 │
│ ... (scrollable content) ...    │
│                                 │
│ [Share] [Bookmark]              │
└─────────────────────────────────┘
```

---

### 5. **SERVICES CAROUSEL** (Horizontal Auto-Scroll)

```
┌─────────────────────────────────────────────────────┐
│ Our Complete ODR Solutions                          │
│ ← [Auto-scrolling cards, continuous loop] →        │
│                                                     │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │ ⚖️      │  │ 🤝      │  │ 📋      │  │ 📁      │  │
│  │ Online  │  │ Online  │  │ Legal   │  │ E-File  │  │
│  │ Arbitr. │  │ Mediat. │  │ Consult │  │ Case    │  │
│  │ [desc]  │  │ [desc]  │  │ [desc]  │  │ Mgmt    │  │
│  │ Get →   │  │ Get →   │  │ Get →   │  │ Get →   │  │
│  └────────┘  └────────┘  └────────┘  └────────┘  │
└─────────────────────────────────────────────────────┘
```

**Implementation (React Native):**
```javascript
import { FlatList, Animated } from 'react-native';

const ServicesCarousel = () => {
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = Animated.loop(
      Animated.timing(scrollX, {
        toValue: -cardWidth * services.length,
        duration: 40000,
        useNativeDriver: true
      })
    );
    animate.start();
  }, []);

  return (
    <Animated.FlatList
      horizontal
      data={[...services, ...services]} // Duplicate for seamless loop
      renderItem={ServiceCard}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      style={{ transform: [{ translateX: scrollX }] }}
    />
  );
};
```

---

### 6. **EXPERT PANEL CAROUSEL**

```
Horizontal scroll with judge cards:
┌─────────┐ ┌─────────┐ ┌─────────┐
│ [Photo] │ │ [Photo] │ │ [Photo] │
│ Justice │ │ Adv.    │ │ Dr.     │
│ A. Mehta│ │ P. Nair │ │ R. Bose │
│ ⚖️ Chief │ │ 🤝 Senior│ │ 🌐 Intl. │
│ Arbitr. │ │ Mediator│ │ Arbitr. │
│ 32 yrs  │ │ 18 yrs  │ │ 25 yrs  │
│ 1,200+  │ │ 850+    │ │ 600+    │
│ cases   │ │ cases   │ │ cases   │
└─────────┘ └─────────┘ └─────────┘
```

**Features:**
- **Circular photos** with fallback initials avatar
- **Star rating** (5 stars)
- **Years experience + cases resolved**
- **Tap to view full profile** (bottom sheet)

---

### 7. **AI SUMMARY PANEL** (Floating Action Button)

**Trigger:**
```
Fixed bottom-center FAB:
┌─────────────────────┐
│ ✦ Explore AI Summary│
└─────────────────────┘
```

**Bottom Sheet (on tap):**
```
┌─────────────────────────────────┐
│ 🧠 ODRkart AI Summary      [×]  │
│ ✦ Real-time AI                  │
├─────────────────────────────────┤
│ ⏳ Generating summary…          │
│ [Animated ring loader]          │
├─────────────────────────────────┤
│ After load:                     │
│                                 │
│ 12K+    98%     30D             │
│ Cases   Sat     Avg             │
│                                 │
│ 🏛️ Platform Overview            │
│ [AI-generated text]             │
│                                 │
│ ⚡ Key Strengths                 │
│ [AI-generated text]             │
│                                 │
│ 🎯 Who It's For                 │
│ [AI-generated text]             │
│                                 │
│ ✦ AI Verdict                    │
│ [AI-generated text]             │
│                                 │
│ [↺ Regenerate] [🚀 File Case]   │
└─────────────────────────────────┘
```

**Caching:**
- Cache AI summary for 6 hours
- Show cached version instantly, regenerate in background

---

### 8. **CHATBOT** (WhatsApp-style UI)

```
┌─────────────────────────────────┐
│ 🤖 ODRkart Assistant      [×]   │
│ ● Online                        │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────┐        │
│  │ 👋 Hi! Welcome to   │        │
│  │    ODRkart.         │        │
│  └─────────────────────┘        │
│                         10:23 AM│
│                                 │
│  ┌─────────────────────┐        │
│  │ How can I help?     │        │
│  └─────────────────────┘        │
│                                 │
│               ┌──────────────┐  │
│               │ File a case  │  │
│               └──────────────┘  │
│                         10:23 AM│
│                                 │
│ Quick Replies:                  │
│ [📝 File Case] [🛠 Services]    │
│ [💰 Fees] [🧠 AI Blog]          │
├─────────────────────────────────┤
│ Type your message… [➤]          │
└─────────────────────────────────┘
```

**Features:**
- **Auto-greeting** on first open
- **Typing indicator** (3 animated dots)
- **Quick reply buttons** for common queries
- **Message bubbles:** Bot (left/gray), User (right/pink gradient)
- **Timestamp** on each message
- **Knowledge base** for FAQs (local, no API call needed)

---

### 9. **LIVE STATS SECTION** (Dashboard)

```
┌─────────────────────────────────┐
│ ● LIVE DATA · Updates every 5s  │
│                                 │
│ Platform Performance Metrics    │
│                                 │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐│
│ │ ⚖️   │ │ 💰   │ │ 👨‍⚖️  │ │ 🌐   ││
│ │12.8K│ │ ₹240 │ │ 512 │ │ 18  ││
│ │Cases│ │ Cr   │ │Panel│ │City ││
│ │─────│ │─────│ │─────│ │─────││
│ │███85│ │██70 │ │█65  │ │45   ││
│ └─────┘ └─────┘ └─────┘ └─────┘│
│                                 │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐│
│ │ ⚡   │ │ 😊   │ │ 🏢   │ │ 📅   ││
│ │ 30d │ │ 98% │ │ 340 │ │ 7yr ││
│ │Resol│ │ Sat │ │Corp │ │Trust││
│ │─────│ │─────│ │─────│ │─────││
│ │███90│ │███98│ │██55 │ │███88││
│ └─────┘ └─────┘ └─────┘ └─────┘│
│                                 │
│ ● Fetching live data… 2:45 PM   │
└─────────────────────────────────┘
```

**Implementation:**
- **Animated counters** on mount (easing function)
- **Progress bars** animate to final %
- **Refresh every 5 seconds** (auto-polling)
- **Pull-to-refresh** for manual update
- **Skeleton shimmer** while loading

---

### 10. **CONTACT FORM**

```
┌─────────────────────────────────┐
│ Send us a message               │
├─────────────────────────────────┤
│ Your Name *                     │
│ [________________]              │
│                                 │
│ Email *                         │
│ [________________]              │
│                                 │
│ Phone Number                    │
│ [________________]              │
│                                 │
│ Subject *                       │
│ [▼ Select a topic]              │
│                                 │
│ Message *                       │
│ [________________]              │
│ [________________]              │
│ [________________]              │
│                                 │
│ [Send Message 📨]               │
└─────────────────────────────────┘

Success State:
┌─────────────────────────────────┐
│         ✅                       │
│ Message Sent Successfully!      │
│                                 │
│ Our team will contact you       │
│ within 24 hours.                │
│                                 │
│ [← Back to Home]                │
└─────────────────────────────────┘
```

**Validation:**
- Real-time error messages
- Required field indicators (*)
- Email format validation
- Disable submit until valid

---

## 🔐 SECURITY IMPLEMENTATION

### Authentication Flow
```
1. User opens app
2. Check AsyncStorage/Keychain for refreshToken
3. If exists:
   - Call /api/auth/refresh
   - Store new accessToken in memory
   - Navigate to Home
4. If not exists:
   - Navigate to Login screen

On every API call:
- Add Authorization: Bearer {accessToken}
- If 401 response:
  - Try refresh token
  - If refresh fails → Logout
```

### Secure Storage
**React Native:** `react-native-keychain`
**Flutter:** `flutter_secure_storage`

**What to store:**
- ✓ Refresh token (encrypted)
- ✗ Access token (in-memory only)
- ✗ Passwords (never)

### Network Security
```javascript
// React Native
import NetInfo from '@react-native-community/netinfo';
import { SSLPinning } from 'react-native-ssl-pinning';

// SSL Pinning
SSLPinning.fetch('https://api.odrkart.com', {
  method: 'POST',
  sslPinning: {
    certs: ['cert1', 'cert2']
  }
});

// Certificate validation
axios.defaults.baseURL = 'https://api.odrkart.com';
axios.defaults.timeout = 30000;
```

### Input Sanitization
```javascript
import DOMPurify from 'isomorphic-dompurify';

const sanitizeInput = (text) => {
  return DOMPurify.sanitize(text, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [] 
  });
};

// Before sending to API:
const cleanedTitle = sanitizeInput(caseTitle);
```

---

## 📊 OFFLINE CAPABILITIES

### Data Persistence
```javascript
// React Native
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache API responses
await AsyncStorage.setItem('cases', JSON.stringify(cases));

// Read offline
const cachedCases = await AsyncStorage.getItem('cases');
```

### Sync Strategy
```
1. Store pending actions in queue (e.g., case draft)
2. On network reconnect:
   - Sync pending actions
   - Update local cache
   - Show sync status indicator
```

---

## 🧪 TESTING REQUIREMENTS

### Unit Tests
- ✓ Authentication helpers
- ✓ Form validation logic
- ✓ Date/currency formatters
- ✓ API request builders

### Integration Tests
- ✓ Login/Register flow
- ✓ Case filing wizard
- ✓ Payment processing
- ✓ AI analysis

### E2E Tests (Detox/Maestro)
- ✓ Complete case filing → payment → success
- ✓ Login → view cases → logout
- ✓ Generate blog posts → read article

---

## 📦 THIRD-PARTY INTEGRATIONS

### Required SDKs
```
React Native:
- @stripe/stripe-react-native
- @react-native-firebase/analytics
- react-native-splash-screen
- react-native-vector-icons
- @react-navigation/native
- @reduxjs/toolkit
- axios

Flutter:
- flutter_stripe
- firebase_analytics
- flutter_native_splash
- google_fonts
- go_router
- bloc/freezed
- dio
```

### Push Notifications
```
Triggers:
- Case status update
- Payment confirmation
- Hearing scheduled
- New message from mediator
- AI report ready
```

---

## 🚢 DEPLOYMENT CHECKLIST

### iOS (React Native/Flutter)
- [ ] Xcode 15+ setup
- [ ] Apple Developer account
- [ ] App Store Connect configured
- [ ] Bundle ID: com.odrkart.app
- [ ] Privacy manifest (NSPrivacyTrackingDomains)
- [ ] TestFlight beta testing

### Android (React Native/Flutter)
- [ ] Android Studio setup
- [ ] Google Play Console account
- [ ] Keystore generated & secured
- [ ] Package: com.odrkart.app
- [ ] ProGuard rules configured
- [ ] Internal testing track

---

## 📱 PLATFORM-SPECIFIC FEATURES

### iOS Only
- Face ID / Touch ID for login
- Apple Pay integration
- 3D Touch quick actions
- Dynamic Island support (iPhone 14 Pro+)

### Android Only
- Fingerprint authentication
- Google Pay integration
- Material You theming
- Split-screen multitasking

---

## 🎯 SUCCESS METRICS

Track in Firebase Analytics:
- `case_filed` (conversion rate)
- `payment_completed` (revenue tracking)
- `ai_analysis_generated` (feature usage)
- `blog_post_read` (engagement)
- `session_duration` (retention)
- `crash_free_rate` (stability)

---

## 📝 FINAL NOTES

This prompt replicates **100% of web functionality** from the original HTML code. Key differentiators:
1. **AI-powered** document analysis with dual reports
2. **Real Stripe** payment integration (not simulated)
3. **Autonomous blog** generation via Claude API
4. **Live stats** with WebSocket updates
5. **Enterprise security** (JWT, SSL pinning, encrypted storage)

**DO NOT** cut corners on:
- Security (auth, payments, data storage)
- Error handling (network failures, API errors)
- Accessibility (screen readers, color contrast)
- Performance (60fps animations, lazy loading)

**Technology Stack Recommendation:**
- **React Native** for faster development + shared codebase
- **Flutter** for better performance + native feel

Build with production-grade standards from day one. This is a legal-tech platform handling sensitive client data — security is non-negotiable.

---

**Ready to build ODRkart Mobile? Start with authentication flow, then case filing wizard, then payment integration. Good luck! 🚀**
