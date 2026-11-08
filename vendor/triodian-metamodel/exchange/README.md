# Exchange formats

The Triodian AI governance apps are separate apps, each with its own database. They pass a small number of files
between them: over Cloudflare service bindings when they are deployed together, or as files a person downloads from
one app and loads into another. This folder publishes those files' formats as versioned JSON Schemas, so that anyone
can check a file, build a tool that reads or writes one, or import one into a GRC or board-portal platform.

| Format | Schema | Written by | Read by | What it carries |
| --- | --- | --- | --- | --- |
| `triodian.matterBrief/1` | [matter-brief-v1](matter-brief-v1.schema.json) | AI Obligations Atlas | AI Board Direction, AI Use Assessment | The obligations in scope by source tier, the questions counsel will need to determine, and the engagements that fit |
| `triodian.bd.directions.v1` | [board-directions-v1](board-directions-v1.schema.json) | AI Board Direction (connected mode) | AI Risk Appetite | The board's directions BD1 to BD7 as the chair recorded them |
| `triodian.raf.calibration.v1` | [calibration-set-v1](calibration-set-v1.schema.json) | AI Risk Appetite | AI Use Assessment | The appetite as parameters P1 to P11, agreed by the CRO or approved by the board |
| `triodian.aua.extract.v2` | [register-extract-v2](register-extract-v2.schema.json) | AI Use Assessment | AI Risk Appetite | The in-use feed: register entries, measures M1 to M10, gaps by priority, the finding on each arrangement, overdue items |
| `triodian.aua.extract.v1` | [register-extract-v1](register-extract-v1.schema.json) | AI Use Assessment | AI Risk Appetite | The register entries only; superseded by v2 and still accepted |
| `triodian.raf.boardview.v1` | [board-view-v1](board-view-v1.schema.json) | AI Risk Appetite | AI Board Direction | The approved calibration set, where the appetite stands now, and the latest in-use measures |
| `triodian.bd.confidentiality.v1` | [confidentiality-position-v1](confidentiality-position-v1.schema.json) | AI Board Direction | AI Confidentiality Exposure Assessment | The board's P, C or N marking for each class of information and kind of AI tool |

The findings on provider arrangements (F1 to F4) travel inside the register extract v2, in `findings`.

## How the formats fit together

1. The **Atlas** builds a **matter brief** for counsel, which Board Direction and Use Assessment load at set-up.
2. In connected mode, **Board Direction** issues the board's **directions**. Risk Appetite shows the relevant one on
   each decision and holds back a ceiling above a direction (check K11).
3. **Risk Appetite** issues the **calibration set** when the CRO agrees the working appetite and again when the board
   approves it. Use Assessment measures each AI arrangement against it.
4. **Use Assessment** issues the **in-use feed** (register extract v2). Risk Appetite reads it on decisions 3 and 8.
5. **Risk Appetite** serves the **board view**, which Board Direction shows at each board meeting.
6. In standalone mode, **Board Direction** exports the **confidentiality position**, which a later confidential-matter
   assessment imports as a suggested rung for counsel to confirm.

## What the schemas promise

- **They describe the files the apps write today.** Each schema names the function that writes the file and the one
  that reads it, and keeps the apps' own field names. That is why they sit here rather than in `schemas/`, whose
  domain rules (camelCase identifiers named `<entity>ID`, one record per schema) these older formats predate.
- **The version is in the file.** Each file names its format in `schema` or `format` (or `briefFormat` for the matter
  brief). A change that would make an older reader refuse a file gets a new version and a new schema; the old schema
  stays here for as long as any app still reads that version.
- **They are frozen at the stabilisation gate (G4).** Until then a format may still gain fields; each change is made
  here in the same release as the app change.
- **They carry no legal conclusions.** The files record positions, classifications and counts. Whether anything meets a
  legal obligation is a question for counsel.

## Examples and checks

[`examples/`](examples) holds at least one file per format. Where possible they were captured from the apps' worked
examples or test fixtures rather than written by hand: the calibration set and register extracts from the Risk Appetite
and Use Assessment worked examples, and the board directions from Board Direction's own builder run on its worked
example. The board view and confidentiality position examples were assembled in the shape the apps write.

`scripts/validate_exchange.py` runs in CI and checks that every schema is valid draft-07 with a resolvable `$ref`
everywhere, that every example validates against the schema its file name starts with, and that every schema has an
example:

```bash
pip install -r scripts/requirements.txt
python scripts/validate_exchange.py
```

## Using a schema

Each schema's `$id` is its location under `https://triodian.com/exchange/`. The board view refers to the calibration
set and the register extract by relative `$ref`, so load the whole folder into your validator's registry. In Python:

```python
import json, pathlib
from jsonschema import Draft7Validator
from referencing import Registry, Resource

base = "https://triodian.com/exchange/"
registry = Registry().with_resources(
    (base + p.name, Resource.from_contents(json.loads(p.read_text())))
    for p in pathlib.Path("exchange").glob("*.schema.json"))
Draft7Validator({"$ref": base + "calibration-set-v1.schema.json"}, registry=registry).validate(my_file)
```
