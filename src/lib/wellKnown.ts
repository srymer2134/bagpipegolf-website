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
// ┌─────────────────────────────────────────────────────────────────┐
// │  ⚠️  TODO — REAL SHA-256 FINGERPRINT NEEDED                     │
// │                                                                 │
// │  The sha256_cert_fingerprints value below is a sentinel that    │
// │  will fail every Android autoVerify install-check. This means   │
// │  Android users who tap a `https://bagpipegolf.com/join/<CODE>`  │
// │  link see the OS chooser sheet ("Open with…") instead of the    │
// │  app auto-launching straight into the join flow — a real UX     │
// │  regression now that the app is live on the App Store           │
// │  (2026-08-25) and Android is a real target.                     │
// │                                                                 │
// │  Sam or Casey fills this in from the Play Console value below   │
// │  and merges. iOS Universal Links via the AASA above are         │
// │  unaffected either way; only Android autoVerify is degraded.    │
// └─────────────────────────────────────────────────────────────────┘
//
// How to extract the real fingerprint:
//
//   • PREFERRED — Play App Signing (production, once uploaded to the
//     Play Store):
//       Play Console → your app → Setup → App integrity →
//       App signing → "App signing key certificate SHA-256"
//     Copy the colon-separated 32-byte value verbatim.
//
//   • Upload key (pre–Play App Signing, or if you also want links to
//     work for pre-Play internal APKs):
//       keytool -list -v \
//         -keystore /path/to/release.jks \
//         -alias upload -storepass '<pw>'
//     Take the "SHA256:" line, strip spaces so it's colons-every-2-chars.
//
// If BOTH keys are in play, list them as two array entries in
// `sha256_cert_fingerprints` — Android will accept a match against
// any one of them.
//
// Reference: docs/handoffs/SHARE_INVITE_UNIVERSAL_LINK_BRIEF.md in
// the fairwayiq-flutter repo — the standing Casey blocker item.
const ANDROID_PACKAGE = 'com.taybuta.bagpipe';
// TODO(sam-or-casey): replace with the real SHA-256 from Play Console
// per the block comment above. This placeholder value causes silent
// autoVerify failure on every Android install.
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
