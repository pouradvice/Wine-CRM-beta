# Wine-CRM-beta
Wine CRM Beta

## Reference Artifacts

### `recap-portal_22.html`

This file is a **read-only reference artifact**. It must **not** be imported, required, or called from any production app component.

Its sole purpose is to serve as a design and code reference for:

- Form and UI styling patterns (`.form-control`, `.card`, `.feedback-pill`, etc.)
- Product/account picker logic (search, dropdown)
- Report and dashboard layout (table, KPI card)

**Permitted use:** Team members may manually read this file and safely duplicate or adapt code patterns into new components. Any such extraction must be noted in the relevant PR/code-review as originating from this artifact.

**No runtime dependency on this file is permitted.**
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
