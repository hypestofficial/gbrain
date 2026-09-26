---
type: concept
title: Ai Hub Resize And Ga Preferred Path
name: ai-hub-resize-and-ga-preferred-path
metadata:
  type: project
description: >-
  ai-hub resize: StopInstances is IAM-deny, poweroff van binnenuit werkt; reboot
  legde 3 kapotte units bloot; GA-tunnel nu primair in Caddy voor
  gbrain/mem0/WhatsApp
ingested_via: put_page
ingested_at: '2026-09-12T14:59:32.460Z'
created: '2026-09-12T14:59:32.460Z'
source_kind: put_page
---

Resize van ai-hub (i-076bb2dab87476e69, us-east-1a) van r8g.xlarge naar m8g.2xlarge, 12 september 2026, 14:19–14:31 UTC.

## Stop gaat niet via de API

`ec2:StopInstances` is voor user `sam` een expliciete IAM-deny; `ModifyInstanceAttribute` en `StartInstances`
mogen wél (dry-run bevestigd). De route die werkt: `ssh ai-hub-ga 'sudo systemctl poweroff'`. De instance heeft
`InstanceInitiatedShutdownBehavior=stop`, dus hij eindigt op `stopped`, daarna `modify-instance-attribute
--instance-type` en `start-instances`. Totale downtime ~12 minuten inclusief boot.

## Wat de reboot brak (en hoe het nu vaststaat)

- `cliproxy-8318-alias` (socat 8318→8319) botste met `cliproxy-smart-relay`, dat sinds kort zelf op 8318 luistert.
  Alias uitgezet; `cliproxy-langwatch-sidecar` wacht nu op smart-relay in plaats van op de dode alias.
- `inbox-coordinator` wees naar `external-skills/claude-ops/bin/inbox-coordinator-server`, dat niet bestaat. De code
  staat in `~/.hermes-primary/lib/`; die heeft geen `__main__` en wil flask. Nu: eigen venv
  `~/.hermes-primary/hub/inbox-coordinator-venv` plus runner `~/.hermes-primary/hub/inbox-coordinator-server`,
  via een systemd drop-in. Luistert op 10.88.0.1:8765.
- `mcp-proxy` crashte 150+ keer omdat de whatsapp-MCP `inbox_coordinator_api` importeert uit een claude-ops/lib
  dat er niet is. Drop-in `Environment=PYTHONPATH=/home/ubuntu/.hermes-primary/lib`. NRestarts=0 sindsdien.
- `healify-dataroom` startte `serve` uit een npx-cachepad dat weg was. Nu `node_modules/.bin/serve` in de repo zelf.

Alle drie draaiden vóór de reboot ook al niet goed; de reboot maakte het zichtbaar.

## Global Accelerator als voorkeurspad

GA (15.197.67.90 / 166.117.167.244) is voor elke listener HEALTHY en TCP-connect vanaf de Mac is 173–190 ms tegen
263–274 ms over WireGuard. In Caddy staat de GA-leg nu overal eerst: CLIProxy (:8321 sidecar, weight 20),
Qdrant :6453, en sinds vandaag ook gbrain :8392, mem0 :8395 en de WhatsApp-bridges :8482/:8483 via nieuwe
SSH-forwards in `com.sam.gbrain-hub-tunnel` (18094, 18100, 18082, 18083). WireGuard is overal standby.
Postgres :5542 loopt via haproxy met ga1 eerst, ga2 en wg als backup.

Kanttekening: door de SSH-hop is een HTTP-rondje over de GA-tunnel voor gbrain ongeveer gelijk aan WireGuard
(0,54–0,82 s tegen 0,55 s), niet sneller. De winst zit in onafhankelijkheid van WireGuard, niet in latency.
Een echte GA-listener voor 8094/8100/8082/8083 zou de SSH-hop schrappen, maar 8094 exposeert destructieve
gbrain-tools en mag niet publiek.
