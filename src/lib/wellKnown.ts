// .well-known/* handlers for the Bagpipe Golf universal-link rollout.
//
// Two files OS install-verifiers fetch from the host that backs the
// universal-link domain:
//
//   /.well-known/apple-app-site-association
//     iOS reads this to associate `https://bagpipegolf.com/*` with the
//     installed app. Must serve `Content-Type: application/json`. NO
//     redirects allowed — the verifier rejects 3xx responses outright.
//
//   /.well-known/assetlinks.json
//     Android equivalent. The flutter manifest's
//     `<intent-filter android:autoVerify="true">` polls this on
//     install and silently downgrades to "chooser" if it can't pass
//     the SHA-256 fingerprint check.
//
// Returning the JSON inline (not from `public/`) keeps the
// Content-Type guarantees centralised + sidesteps Astro's
// dot-prefixed-pages-directory limitation.

// iOS production app identity. Bundle id + apple Team ID join the
// CFBundleIdentifier (`com.taybuta.bagpipe`) with the team id from
// the Runner.xcodeproj DEVELOPMENT_TEAM (`5X8U8RN3FJ`).
const IOS_APP_ID = '5X8U8RN3FJ.com.taybuta.bagpipe';

// Android production package, mirrored from android/app/build.gradle.kts
// `applicationId`.
//
// Android accepts a match against ANY entry in
// `sha256_cert_fingerprints`, so the list below is every certificate
// that may legitimately sign a build claiming bagpipegolf.com.
//
// COMPLETE as of 2026-11-09. Every install path verifies: Play Store
// (Google's three certificates), Firebase App Distribution and local
// release builds (our upload key).
//
// The history is worth keeping, because the failure was silent for
// months. This list was a single sentinel value
// (`AA:AA:…:AA`) from the day the file was written. Android fetches it
// at install, compares it to the signing certificate of the delivered
// APK, and on mismatch downgrades to the "Open with…" chooser sheet
// WITHOUT logging an error, raising an exception or failing a build. The
// only visible symptom was Play Console's Deep links page reporting the
// domain unverified — which nobody was reading.
//
// Where to re-fetch these if they ever change: Play Console → Bagpipe
// Golf → Protected with Play → Play App Signing. (The old "App
// integrity" page was retired in June 2026; searching for it wastes
// time.) Download the certificates and fingerprint them locally rather
// than copying hex from the page — see the openssl line below.
//
// A test pins the length of this array, so adding or removing a
// certificate goes red and tells you to update it rather than passing
// silently.
//
// Reference: docs/handoffs/SHARE_INVITE_UNIVERSAL_LINK_BRIEF.md in the
// fairwayiq-flutter repo; PATRICK_BACKLOG §32.
const ANDROID_PACKAGE = 'com.taybuta.bagpipe';

// Upload key — the certificate in the keystore CI decodes from
// ANDROID_KEYSTORE_BASE64, and the one android/key.properties points at
// for a local release build.
//
// Provenance: read off the signed bundle itself rather than copied from
// a console, so it cannot be a transcription error. Build 1.1.1 (353),
// GitHub Actions run 41696498571 (firebase_app_distribution_android,
// 2026-11-03), artifact `bagpipe-golf-1.1.1-353-aab`:
//
//   unzip -o app-release.aab META-INF/RELEASE.RSA
//   openssl pkcs7 -inform DER -in META-INF/RELEASE.RSA -print_certs \
//     | openssl x509 -noout -fingerprint -sha256
//
// Certificate: CN=Bagpipe Golf, O=FairwayIQ, OU=Mobile, C=US;
// self-signed; valid 2026-05-05 → 2051-04-29.
const ANDROID_UPLOAD_KEY_SHA256 =
  '8B:C4:6C:38:9F:18:53:4B:95:93:17:A8:13:3A:42:09:' +
  '36:40:F1:F3:24:C4:2A:FF:80:86:61:87:74:9B:44:3A';

// ── Play App Signing certificates, downloaded from Play Console on
// 2026-11-09 and fingerprinted locally with openssl, never transcribed:
//
//   openssl x509 -inform DER -in <cert>.der -noout -fingerprint -sha256
//
// All three are issued to `O=Google Inc., OU=Android, CN=Android`,
// valid 2026-11-02 → 2056-11-02. Google GENERATED this key; our upload
// key (above) was not imported, which is why Play Store installs could
// never verify while only the upload key was listed.
//
// Play issues three because it now signs with a hybrid scheme as well as
// the classical one, and the certificate a given device sees depends on
// which Play uses for that delivery. Listing all three is additive —
// Android accepts a match against any array entry — and removes the
// guesswork about which one a device will present.

// Play app signing key — the classical deployment certificate. This is
// the one a Play Store install presents.
const ANDROID_PLAY_APP_SIGNING_SHA256 =
  'C5:DF:79:FC:05:91:75:F2:2D:21:CB:10:0D:62:F9:54:' +
  'A0:F7:BC:BC:5E:10:12:BB:CA:F1:05:F0:4D:14:45:46';

// Play hybrid signing, classical half.
const ANDROID_PLAY_HYBRID_CLASSICAL_SHA256 =
  'C0:34:40:26:05:77:70:06:00:17:1E:80:E8:BA:73:E6:' +
  '46:84:A3:15:4C:47:35:E8:3E:9F:1B:28:94:A7:AF:20';

// Play hybrid signing, post-quantum half.
const ANDROID_PLAY_HYBRID_PQC_SHA256 =
  '79:98:E8:15:DA:D6:93:B3:D7:A8:A9:BE:4B:EA:15:82:' +
  '4F:CA:70:1F:30:83:75:05:D8:E8:E5:87:1D:D2:B1:0D';

// Every certificate allowed to claim the domain.
const ANDROID_SHA256_FINGERPRINTS = [
  ANDROID_UPLOAD_KEY_SHA256,
  ANDROID_PLAY_APP_SIGNING_SHA256,
  ANDROID_PLAY_HYBRID_CLASSICAL_SHA256,
  ANDROID_PLAY_HYBRID_PQC_SHA256,
];

const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [IOS_APP_ID],
        components: [
          {
            // Universal-link invite handoff. iOS routes a tap on
            // `https://bagpipegolf.com/join/<CODE>` into the app's
            // GoRouter redirect, which hands the code to
            // `JoinDispatcherScreen`. The dispatcher resolves the code
            // via `JoinCodeLookup.resolve(code)` — a single anon-safe
            // SECURITY DEFINER RPC fanout across `shared_games`,
            // `shared_tournaments`, and `leagues` — and routes to
            // whichever surface owns it. Path pattern stays flat +
            // wildcard so future share surfaces don't need this file
            // bumped.
            '/': '/join/*',
            comment: 'Invite deep-link — JoinDispatcherScreen (bet + tourney + league)',
          },
          // Stripe checkout return. A player pays on Stripe's hosted
          // page in the system browser (plan K5/F6 — no in-app
          // PaymentSheet in v1), and Stripe sends them back to one of
          // these two paths; iOS hands the tap to the app instead of
          // Safari so they land back where they started.
          //
          // ⚠️ ORDER. These are listed BEFORE the app has routes for
          // them, on purpose: iOS fetches this file at install and
          // update time, so the association has to exist by the time
          // the build that handles `/pay/*` ships. Until it does, a
          // hand-typed bagpipegolf.com/pay/success opens the app to
          // GoRouter's default unknown-route screen — nothing links
          // there, and no such page exists on the site yet.
          // **Do not publish a /pay/* URL anywhere until the app adds
          // the routes** (SAM_STRIPE_CONNECT_BUILD A4) and this site
          // adds the landing pages (W4).
          //
          // No `?` key, so the match ignores the query string —
          // Stripe appends its own session id.
          {
            '/': '/pay/success',
            comment: 'Stripe checkout return — app re-reads payment status from the API',
          },
          {
            '/': '/pay/cancel',
            comment: 'Stripe checkout cancelled — app returns the player to the event',
          },
        ],
      },
    ],
  },
};

const ASSETLINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: ANDROID_SHA256_FINGERPRINTS,
    },
  },
];

/** Returns a Response when [pathname] claims one of the
 *  `.well-known` endpoints; null otherwise (caller continues). */
export function handleWellKnownRequest(pathname: string): Response | null {
  if (pathname === '/.well-known/apple-app-site-association') {
    return new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  if (pathname === '/.well-known/assetlinks.json') {
    return new Response(JSON.stringify(ASSETLINKS), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return null;
}
