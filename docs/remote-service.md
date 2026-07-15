# Remote service setup

Remote service access is intended for machines on private or untrusted local networks without public DNS. There is no discovery, relay, NAT traversal, or public-Internet hosting feature.

## On the authority machine

Enable a deliberate encrypted UDP listener and restart the service:

```bash
git-stacks service expose enable --bind 192.168.1.20 --advertise 192.168.1.20 --port 41327
git-stacks service start
```

Create a short-lived mode-0600 pairing bundle:

```bash
git-stacks service pair create --name workstation --output ./git-stacks-pair.json
```

The bundle grants the complete current client surface by default. To restrict it, list explicit scopes:

```bash
git-stacks service pair create --name read-only --output ./git-stacks-pair.json \
  --scope snapshot.read event.read signal.read terminal.read
```

Transfer the file through a protected channel. Compare the displayed authority fingerprint over a separate trusted channel.

## On the helper/client machine

Accept the bundle only after fingerprint comparison:

```bash
git-stacks service pair accept \
  --file ./git-stacks-pair.json \
  --confirm ABCD-EFGH-IJKL-MNOP
```

List the resulting target and launch a client against it:

```bash
git-stacks service targets list
git-stacks web --target <target-id>
git-stacks manage --target <target-id>
```

After pairing, the browser still connects only to its local helper. The helper authenticates to the authority with its durable key and relays typed scoped channels. Reopening the browser needs a fresh local launch but does not repeat remote pairing.

Remote carriers are isolated per authenticated local browser/TUI principal. Connection setup retries briefly with bounded jitter. If an established remote carrier is lost, the affected local client fails closed instead of silently replaying an operation; launch it again to create a fresh authenticated session. Pairing and signed pins remain valid, and service-owned terminals can be reattached while the authority service still retains them.

## Revocation and recovery

On the authority, revoke a helper:

```bash
git-stacks service pair list
git-stacks service pair revoke <helper-id>
```

On the client, remove a target:

```bash
git-stacks service targets remove <target-id>
```

Disable all remote listening and restart locally:

```bash
git-stacks service expose disable
git-stacks service stop
git-stacks web
```

Changing an authority identity or helper identity is a trust reset and requires pairing again. A lost or exposed pairing bundle should be allowed to expire or replaced with a newly generated bundle; successful use consumes it atomically.

Transport certificates rotate independently of those stable identities. Signed pin records contain the current and next hashes/endpoints, and the two listeners overlap for three days. Normal helper use updates the monotonic record automatically; certificate rotation does not repeat pairing.

## Network notes

WebTransport uses HTTP/3 over UDP. Permit the configured base port **and the next consecutive UDP port** (the example uses `41327-41328`) between the machines; the pair alternates during certificate rollover. Public certificates, public DNS, and browser CA installation are not required because the pairing record pins stable-identity-signed certificate hashes. A wrong endpoint or certificate fails before workspace or terminal data is accepted.
