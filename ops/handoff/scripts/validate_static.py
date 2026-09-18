#!/usr/bin/env python3
"""Optional authoring check; needs PyYAML. NOT Docker or Caddy runtime validation."""
import json
from pathlib import Path
import yaml

def require(condition, message):
    if not condition:
        raise ValueError(message)

root = Path(__file__).resolve().parents[1]
cfg = yaml.safe_load((root / 'compose.demo.yaml').read_text())
require(cfg['name'] == 'forgejo-ui-demo', "Static invariant 9 failed")
require(set(cfg['services']) == {'forgejo', 'caddy'}, "Static invariant 10 failed")
forgejo, caddy = cfg['services']['forgejo'], cfg['services']['caddy']
require('ports' not in forgejo, "Static invariant 12 failed")
require(forgejo['restart'] == caddy['restart'] == 'unless-stopped', "Static invariant 13 failed")
require(forgejo['environment']['FORGEJO__service__REQUIRE_SIGNIN_VIEW'] == 'true', "Static invariant 14 failed")
require(forgejo['environment']['FORGEJO__service__DISABLE_REGISTRATION'] == 'true', "Static invariant 15 failed")
require(forgejo['environment']['FORGEJO__actions__ENABLED'] == 'false', "Static invariant 16 failed")
require(forgejo['environment']['FORGEJO__mailer__ENABLED'] == 'false', "Static invariant 17 failed")
require(forgejo['environment']['FORGEJO_CUSTOM'] == '/data/gitea', "Static invariant 18 failed")
targets = {m['target'] for m in forgejo['volumes'] if isinstance(m, dict)}
require(targets == {'/data/gitea/public', '/data/gitea/templates'}, "Static invariant 20 failed")
for service in (forgejo, caddy):
    require('${' in service['image'] and ':?' in service['image'], "Static invariant 22 failed")
    for mount in service['volumes']:
        if isinstance(mount, dict):
            require(mount['read_only'] is True, "Static invariant 25 failed")
            require(mount['bind']['create_host_path'] is False, "Static invariant 26 failed")
manifest = json.loads((root / 'slack/app-manifest.example.json').read_text())
require(manifest['features']['unfurl_domains'] == ['git.hyperide.ai'], "Static invariant 28 failed")
require(set(manifest['oauth_config']['scopes']['bot']) == {'links:read','links:write'}, "Static invariant 29 failed")
require('link_shared' in manifest['settings']['event_subscriptions']['bot_events'], "Static invariant 30 failed")
require('.invalid' in manifest['settings']['event_subscriptions']['request_url'], "Static invariant 31 failed")
print('PASS: YAML/JSON parse and selected static isolation/scope invariants.')
print('NOT EXECUTED: Docker Compose resolution, Caddy binary validation, containers, TLS, live Slack.')
