# Wine-CRM-beta
Wine CRM Beta
                          ┌─────────────────────────┐
                          │        SUPPLIERS        │
                          │ Upload brand data       │
                          │ Tech sheets / images    │
                          └───────────┬─────────────┘
                                      │
                                      ▼
                           ┌───────────────────┐
                           │  SUPPLIER PORTAL  │
                           │  (React Web App)  │
                           └─────────┬─────────┘
                                     │
                                     │
                                     ▼
                        ┌───────────────────────────┐
                        │         SUPABASE          │
                        │                           │
                        │ PostgreSQL Database       │
                        │ Auth                      │
                        │ Storage (Tech Sheets)     │
                        │ Edge Functions            │
                        │                           │
                        └───────┬─────────┬─────────┘
                                │         │
                                │         │
                                │         │
               ┌────────────────┘         └────────────────┐
               ▼                                           ▼

   ┌──────────────────────┐                     ┌──────────────────────┐
   │     RECAP PORTAL     │                     │  DISTRIBUTOR PORTAL  │
   │ (Sales Specialists)  │                     │ (Portfolio Insights) │
   │                      │                     │                      │
   │ Record Tastings      │                     │ SKU Performance      │
   │ Buyers + Accounts    │                     │ Conversion Reports   │
   │ Products Shown       │                     │ Portfolio Analytics  │
   │ Buyer Feedback       │                     │                      │
   └─────────┬────────────┘                     └─────────┬────────────┘
             │                                            │
             │                                            │
             ▼                                            ▼
     ┌────────────────────────────────────────────────────────┐
     │                 CORE DATA OBJECTS                      │
     │                                                        │
     │  Products                                              │
     │  Brands                                                │
     │  Buyers                                                │
     │  Clients                                               │
     │  Recaps (Tastings)                                     │
     │  Recap Products Shown                                  │
     │                                                        │
     └────────────────────────────────────────────────────────┘
                             │
                             │
                             ▼

                  ┌──────────────────────────┐
                  │   AUTOMATION LAYER       │
                  │   (Supabase Edge Fn)     │
                  │                          │
                  │ Brand Launch Trigger     │
                  │ Lead Creation            │
                  │ Email Campaigns          │
                  │ Dossier Generation       │
                  └──────────┬───────────────┘
                             │
                             │
                             ▼

                  ┌──────────────────────────┐
                  │      CALENDLY API        │
                  │                          │
                  │ Buyer Books Tasting      │
                  │ Calendar Scheduling      │
                  │ Webhook → Lead Created   │
                  └──────────┬───────────────┘
                             │
                             ▼

                  ┌──────────────────────────┐
                  │      EMAIL SYSTEM        │
                  │ (Resend / Sendgrid etc)  │
                  │                          │
                  │ Buyer Email Invitations  │
                  │ Specialist Briefings     │
                  │ Product Dossiers         │
                  └──────────────────────────┘
