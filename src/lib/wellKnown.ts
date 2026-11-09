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
// ┌─────────────────────────────────────────────────────────────┐
// │  ⚠️  HALF-DONE 2026-11-09 — upload key landed, Play app        │
// │  signing key still missing.                                     │
// │                                                                 │
// │  Google RE-SIGNS every uploaded AAB with its own app signing     │
// │  key, so a Play Store install presents Google's certificate      │
// │  and NOT the upload certificate below. Until that second value   │
// │  is listed here, Play Store users who tap a                      │
// │  `https://bagpipegolf.com/join/<CODE>` link still get the OS     │
// │  chooser sheet ("Open with…") instead of the app opening on      │
// │  the join flow.                                                  │
// │                                                                 │
// │  Builds installed DIRECTLY — Firebase App Distribution, a       │
// │  local `flutter build apk --release` — keep the upload key and  │
// │  do verify as of this change.                                    │
// │                                                                 │
// │  iOS Universal Links via the AASA above are unaffected either    │
// │  way; only Android autoVerify is degraded.                       │
// └─────────────────────────────────────────────────────────────┘
//
// To add the Play app signing key:
//   Play Console → Bagpipe Golf → Test and release → Setup →
//   App integrity → App signing → "App signing key certificate",
//   the SHA-256 line. Append it to ANDROID_SHA256_FINGERPRINTS below.
//   A test asserts the current count on purpose, so it will go red and
//   tell you to update it rather than passing silently.
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

// Every certificate allowed to claim the domain.
const ANDROID_SHA256_FINGERPRINTS = [ANDROID_UPLOAD_KEY_SHA256];

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
