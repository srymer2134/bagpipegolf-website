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
// placeholder — Bagpipe Golf is iOS-first pre-launch (TestFlight-only
// per fairwayiq-flutter/CLAUDE.md) so no Android release keystore exists
// yet. Android silently falls back to the "chooser" UX in the meantime
// instead of auto-launching, which is acceptable while no Android users
// exist. iOS Universal Links via the AASA above work regardless.
//
// When Android does ship, swap in the real SHA-256:
//
//   • Upload key (pre–Play App Signing):
//       keytool -list -v \
//         -keystore /path/to/release.jks \
//         -alias upload -storepass '<pw>'
//     Take the "SHA256:" line, strip spaces → colons every 2 chars.
//
//   • Play App Signing (production, once on the Play Store):
//       Play Console → your app → Setup → App integrity →
//       App signing → "App signing key certificate SHA-256".
//     This value REPLACES the upload-key value above once Play is
//     re-signing on the server; keep both if you also want links
//     to work for pre-Play internal APKs.
//
// Reference: docs/handoffs/SHARE_INVITE_UNIVERSAL_LINK_BRIEF.md
// (fairwayiq-flutter) — the Casey blocker item.
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
            // Universal-link invite handoff. iOS routes a tap on
            // `https://bagpipegolf.com/join/<CODE>` into the app's
            // `_resolveAndRouteJoinCode` helper, which does an async
            // lookup and routes league-first (post PR #960): a code
            // that hits a league goes to `/league/join?code=<CODE>`
            // (auto-submit), miss falls through to `/tourney/join?code=`.
            // Path pattern deliberately stays flat + wildcard so we
            // don't have to bump this file when new share surfaces
            // (bets, calcuttas) join the router.
            '/': '/join/*',
            comment: 'Invite deep-link (league-first, tourney fallback) → _resolveAndRouteJoinCode',
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
