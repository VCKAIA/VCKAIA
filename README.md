# VCKAIA

A student-focused public site for the Vidyartha College Artificial Intelligence Association. The frontend is React, TypeScript, and Vite. Firebase Authentication, Firestore, and callable Cloud Functions provide the live member, competition, quiz, and publishing features.

## Run locally

```sh
npm install
Copy-Item .env.example .env.local
npm run dev
```

The public site displays a setup notice until Firebase is configured. No forms report a successful write while their backend is unavailable.

## Configure Firebase

Use Node.js 22 for deploying Cloud Functions.

1. Create or select a Firebase project. In **Project settings → General → Your apps**, create a web app and copy its public web configuration to `.env.local` using the variable names in `.env.example`. The web API key identifies the project; do not put server secrets in `VITE_` variables.
2. Enable **Email/Password** and **Google** providers in Firebase Authentication. Configure authorized domains and the OAuth consent/application as needed.
3. Install and deploy the functions and Firestore policies:

   ```sh
   npm --prefix functions install
   npm --prefix functions run build
   npx firebase-tools login
   npx firebase-tools use <your-firebase-project-id>
   npx firebase-tools deploy --only firestore:rules,firestore:indexes,functions
   ```

4. Create an account through the public site. Wait for its `profiles/{uid}` document to appear in Firestore, confirm the UID and email in Authentication, then use the Firebase Console or a trusted Admin SDK environment to change that profile's `role` to `owner`. This is a one-time bootstrap; never expose owner provisioning as a public endpoint. Owners can grant `editor`, `admin`, and `owner` roles from `/admin`.
5. Add the configured Firebase variables to the production frontend environment and deploy the Vite `dist` output to a static host. Configure SPA rewrites so `/admin` serves `index.html`.

The Functions use the default `us-central1` region. Firestore rules keep team contact details private, expose only published site content and aggregate quiz standings, and restrict role changes, scoring, moderation, and results to authenticated server-side functions. New accounts always receive the regular `member` role.

## Gemini AI desk (optional)

The API key is used only by the callable Cloud Function:

```sh
npx firebase-tools functions:secrets:set GEMINI_API_KEY
npx firebase-tools deploy --only functions:vckaiaAssistant
```

The assistant requires a signed-in member, uses published VCKAIA content as context, and limits each account to 20 requests per hour. If the secret is unset or Gemini is unavailable, the function returns an error rather than simulating a response. Apply provider quotas and billing controls before public launch.

## Optional Cloudinary images

Set `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` in the frontend environment to enable optional cover-image uploads for member submissions and admin content. Use an unsigned preset with strict file type/size limits and an upload folder in Cloudinary; the website accepts JPEG, PNG, and WebP files up to 5 MB. Without those values, the image controls remain disabled and text publishing still works. The shared `xrmtii84` cloud appears to be a test environment, so configure the intended production cloud explicitly rather than relying on that value.

## Admin portal

`/admin` provides role-gated management for events, competition series, team registrations, competition results, quiz questions, submissions, content, and member roles. Inter-school teams register without accounts; quiz answers are checked server-side; member submissions are private until approved. Keep owner bootstrap and Firebase project credentials restricted to trusted maintainers.
