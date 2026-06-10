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
// `applicationId`. The SHA-256 fingerprint is intentionally a sentinel
// placeholder until the production release key (or the Play app-signing
// cert if Bagpipe Golf goes on Play Store) is generated — Android
// silently falls back to the "chooser" UX in the meantime instead of
// auto-launching. Swap this value in a follow-up PR once the cert is
// minted; surface the fingerprint via `keytool -list -v -keystore ...`.
const ANDROID_PACKAGE = 'com.taybuta.bagpipe';
const ANDROID_SHA256_PLACEHOLDER =
  'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:' +
  'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA';

const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [IOS_APP_ID],
        components: [
          {
            // Tournament-invite handoff. iOS routes a tap on
            // `https://bagpipegolf.com/join/<CODE>` straight into the
            // app's `/tourney/join?code=<CODE>` route.
            '/': '/join/*',
            comment: 'Tournament-invite deep-link → /tourney/join?code=<CODE>',
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
      sha256_cert_fingerprints: [ANDROID_SHA256_PLACEHOLDER],
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
