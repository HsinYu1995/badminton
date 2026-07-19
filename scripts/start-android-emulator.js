#!/usr/bin/env node
// Runs Metro bound to the IPv4 loopback (127.0.0.1) instead of the LAN, so
// makeRedirectUri() resolves to exp://127.0.0.1:8081. GoTrue's redirect-URL
// validator rejects any redirect_to whose host is a non-loopback IP literal
// (see supabase/config.toml's additional_redirect_urls comment), so Google
// sign-in cannot complete against the default exp://<lan-ip>:8081 address.
//
// On Windows, `expo start --localhost` alone still binds Metro to the IPv6
// loopback ([::1]) unless Node's DNS resolution is forced to prefer IPv4,
// which adb reverse cannot forward to. Run `adb reverse tcp:8081 tcp:8081`
// (in addition to the Supabase `adb reverse tcp:54321 tcp:54321`) once per
// emulator boot before using this.

process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first']
  .filter(Boolean)
  .join(' ');

require('node:child_process').spawn('npx expo start --android --localhost', {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});
