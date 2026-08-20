# Google Cloud billing support — draft message

**How to send:** Google Cloud Console → Billing → Help / Contact support → Billing issue / Unexpected charges  
(or https://console.cloud.google.com/support )

Copy everything below the line into the case description.

---

**Subject:** Request for one-time billing credit — accidental Firestore charges from scheduled function (project afterten-portal-system)

Dear Google Cloud Billing Support,

I am writing to request a **one-time billing adjustment / goodwill credit** for unexpected Cloud Firestore charges on my project.

**Account / project details**
- Billing account name: Afterten-Portal-System
- Project ID: `afterten-portal-system`
- Service with unexpected cost: **Cloud Firestore**
- Period of unexpected high usage: approximately **3 August 2026 through 20 August 2026**
- Approximate unexpected amount: about **USD $381** (Firestore month-to-date), driven by daily costs of roughly **USD $20–27 per day**

**What happened**
I am a small business owner building an orders/portal system. A Cloud Functions **scheduled** function named `syncStockCatalogScheduled` was configured to run very frequently (approximately every 1 minute). Each run performed full catalog scans against Firestore (`catalog_items`, `catalog_variants`, and related collections). This caused a large, unintended increase in Firestore document reads.

This scheduled sync was **not intentional production usage**. It was left enabled during development by mistake. Normal application usage (orders, portal browsing) would not generate this level of daily Firestore cost.

**What I did to stop it**
Around **10–11 August 2026** I attempted to disable the scheduled catalog sync in application code and remove the Cloud Scheduler job.

On **20 August 2026** I completed a full cleanup and verification:
- Deleted the Cloud Function `syncStockCatalogScheduled` in region `europe-west1` via the Cloud Functions API
- Audited **Cloud Scheduler across all available regions** — **zero** scheduler jobs remain in the project
- Audited **Cloud Functions across all available regions** — `syncStockCatalogScheduled` **no longer exists**
- Redeployed remaining functions; catalog sync is now **disabled by default** and only a manual callable (`syncStockCatalog`) remains, which rejects calls while disabled

**Why I am requesting a credit**
I cannot afford this charge. The spend was caused by an accidental, runaway scheduled job, not by intentional product traffic. I have permanently removed the scheduled function and confirmed there are no Cloud Scheduler jobs left in any region. I ask Google for a **one-time goodwill credit** covering the unexpected Firestore charges for the period above (approximately USD $381, or as much as you can grant).

I am happy to provide screenshots of billing reports, Cloud Scheduler (empty), and Functions list if needed.

Thank you for your consideration.

Kind regards,  
[Your full name]  
[Your email used on the Google Cloud account]  
[Your phone number]  
Project: afterten-portal-system  
Billing account: Afterten-Portal-System
