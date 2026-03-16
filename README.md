# SearchKings Market Analyzer

This Next.js application allows users to analyze local markets by searching for businesses based on category and location. It provides detailed insights, including Google Business Profile data, AI-driven research on company size and ownership, and Google Ads presence.

## Features

- **Business Search:** Find local businesses using Google Places API.
- **AI-Powered Insights:** Automatically research business owner details, employee count, and estimated revenue using AI.
- **Ad Detection:** Check if a business is currently running Google Ads via the Google Ads Transparency Center.
- **Website Analysis:** Scan business websites for mentioned home service brands and active promotions.
- **Interactive Map:** View all search results on an embedded Google Map.
- **Data Export:** Download search results as a CSV file or create a shareable Google My Map (KML file).
- **Password Protection:** Simple, secure access control for the application.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS with shadcn/ui components
- **AI/Generative:** Genkit calling OpenAI
- **APIs:** Google Places, Google Drive, OpenAI, SearchApi.io

---

## Project Setup Guide

Follow these steps to get a copy of the Market Analyzer running in your own environment.

### Prerequisites

- Node.js (v20 or later)
- A Google Cloud Platform (GCP) account with a project and billing enabled.
- An OpenAI Platform account.
- A SearchApi.io account (free tier is available).

### Step 1: Get the Source Code & Install Dependencies

1.  Download or clone the source code to your local machine.
2.  Open a terminal in the project's root directory.
3.  Install the necessary Node.js packages:
    ```bash
    npm install
    ```

### Step 2: Configure Environment Variables

This project requires several API keys and credentials to function.

1.  In the project root, create a copy of the `.env.example` file and name it `.env.local`.
    ```bash
    cp .env.example .env.local
    ```
2.  Now, open `.env.local` and fill in the values for each variable. The sections below explain where to get each key.

#### A. Google Cloud Credentials

You'll need to create an API Key and a Service Account in your Google Cloud project.

1.  **Enable APIs:** In your GCP project, go to "APIs & Services" -> "Library" and enable:
    *   **Places API**
    *   **Google Drive API**

2.  **Get Your `GOOGLE_PLACES_API_KEY`:**
    *   Go to "APIs & Services" -> "Credentials".
    *   Click "+ CREATE CREDENTIALS" -> "API key".
    *   Copy the key and paste it into `.env.local` for both `GOOGLE_PLACES_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
    *   **Security:** It is highly recommended to restrict this key to only allow the **Places API**.

3.  **Get Your Service Account Credentials & Drive Folder ID:**
    *   Go to "APIs & Services" -> "Credentials" and click "+ CREATE CREDENTIALS" -> "Service account".
    *   Give it a name (e.g., `market-analyzer-bot`) and click "Create and Continue".
    *   For permissions, grant it the **Editor** role. Click "Continue", then "Done".
    *   Find the new service account. Note its email address for `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
    *   Go to the "KEYS" tab, click "ADD KEY" -> "Create new key", select **JSON**, and click "CREATE". A JSON file will be downloaded.
    *   Open the JSON file and copy the entire `private_key` value (including the `-----BEGIN...` and `-----END...` parts). Paste this into `GOOGLE_PRIVATE_KEY`. **Important:** In your `.env.local` file, you must wrap the key in double quotes `"` and replace all literal newlines with `\n`.
    *   Create a folder in your Google Drive where you want maps saved. Get the **Folder ID** from the URL (the string after `.../folders/`). This is your `GOOGLE_DRIVE_FOLDER_ID`.
    *   Share this Drive folder with your service account's email, giving it "Editor" permissions.

#### B. Third-Party API Keys

1.  **`OPENAI_API_KEY`:** Go to the [OpenAI Platform](https://platform.openai.com/api-keys), create a new secret key, and paste it into your `.env.local` file.
2.  **`SEARCHAPI_IO_API_KEY`:** Register on [SearchApi.io](https://www.searchapi.io/), find your API key in your dashboard, and paste it in.

#### C. Application Password

1.  **`APP_ACCESS_PASSWORD`:** Choose a strong password that you will use to access the deployed application. This is your site-wide access key.

### Step 3: Run the Application

Once your `.env.local` file is complete, you can start the application.

```bash
npm run dev
```

The application should now be running locally, typically at `http://localhost:9002`.

### Step 4: Deployment

To deploy this application, choose a hosting provider that supports Node.js (like Vercel, Netlify, or Google Cloud Run). You will need to configure the same environment variables from your `.env.local` file in your hosting provider's settings panel. Do not commit your `.env.local` file to Git.
