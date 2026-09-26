---
type: concept
title: Gbrain Facts Extraction Model Is Its Own Key
name: gbrain-facts-extraction-model-is-its-own-key
metadata:
  type: project
description: >-
  facts-absorb stierf op het extractiemodel; facts.extraction_model is een eigen
  sleutel, staat nu op anthropic:claude-sonnet-5, net als models.default en alle
  vier de tiers
ingested_via: put_page
ingested_at: '2026-09-12T14:16:54.188Z'
created: '2026-09-12T14:16:54.188Z'
source_kind: put_page
---

Gediagnosticeerd en gefixt 12 september 2026.

`facts-absorb` stierf al dagen. Twee tijdperken, één oorzaak: de job las zijn model
niet uit een eigen sleutel maar viel door naar `models.default`.

- Oud: `[facts-extract] provider_error (model=litellm:qwen3-coder:30b)`, 5 pogingen, dood in seconden.
- Nieuw: `wall-clock timeout exceeded` op `timeout_ms=180000`. `litellm:generalist-balanced:latest`
  verbruikte zijn hele budget aan een zichtbare reasoning-trace en leverde lege content.

## De juiste hendel

`facts.extraction_model`, niet `models.default` en niet `models.tier.reasoning`.
De broncode noemt hem zelf: `src/commands/models.ts:71`, `src/core/facts/extract.ts:60`,
`src/core/facts/backstop.ts:222`, `src/commands/doctor.ts:3516`.

```
gbrain config set facts.extraction_model anthropic:claude-sonnet-5
```

Bewijs: job #135970 (`outbound-gate-incidents-2026-09`) die op 08:26 UTC nog op de wandklok
doodging, liep na de wijziging in **elf seconden** af met 10 feiten.

## Waarom dit niets kost

De 16 Claude-seats in `/opt/crsproxy/auths/claude-*.json` op ai-hub zijn allemaal
OAuth-seats (`refresh_token`, `account_uuid`, `type: claude`) zonder `api_key`-veld.
CLIProxy-verkeer naar Claude loopt dus op abonnementen die al betaald zijn: marginale
tokenkosten nul, alleen rate limits tellen.

## Wat je hierbij moet weten

- `gbrain models` toont per sleutel de herkomst tussen blokhaken. Staat er `[config: models.default]`
  achter een taaksleutel, dan is die sleutel zelf niet gezet en verandert hem zetten alleen die taak.
- `models.expansion` en `models.chat` zijn eigen sleutels en stonden al op gemini-flash.
  `models.default` was dus nooit load-bearing voor query-expansie, alleen voor de tiers en de fallthrough.
- De jobtabel heet `public.minion_jobs`, niet `jobs`. Het soort job staat in kolom `name`, niet `job_type`.
- `mcp__gbrain__retry_job` weigert met `permission_denied` op een job die een andere principal indiende.
  `gbrain jobs retry <id>` op de CLI doet het wel.
- Een `gbrain config set` duurt vaak langer dan 120 s. Toets op de uitvoerregel
  `Set <key> = <value>`, nooit op de exitcode van een geketend commando.

## Nog open

`models.default` voedt nog `tier.utility`, `tier.reasoning`, `tier.deep` en `tier.subagent`.
gbrain waarschuwt zelf dat `tier.subagent` op `litellm:generalist-balanced:latest` "will run hot
(cost scales linearly with conversation length)", want die provider ondersteunt geen prompt caching.
Dat is een aparte beslissing, niet meegenomen in deze fix.

## Nasleep 12 september 2026

Sam koos daarna: alle vier de tiers naar sonnet-5. Dus ook `models.default` staat nu op
`anthropic:claude-sonnet-5`, waardoor `tier.utility`, `tier.reasoning`, `tier.deep` en
`tier.subagent` alle vier daarop uitkomen. Reden: `litellm:generalist-balanced:latest` kan
geen prompt caching, dus subagents liepen hot (kosten schalen lineair met de gesprekslengte).

`models.expansion` en `models.chat` blijven bewust op `litellm:gemini-flash-latest` (gratis,
lokaal), en `models.dream.extract_atoms` blijft caller-gepind op `openai:gpt-5.6-luna`.

Let op: de aliastabel van `gbrain models` is verouderd — `sonnet` wijst daar nog naar
`anthropic:claude-sonnet-4-6`. Gebruik de volledige model-id, nooit het alias.
