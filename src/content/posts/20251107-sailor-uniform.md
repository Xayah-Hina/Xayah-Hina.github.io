---
title: "Comprehensive Sailor Uniform Character Generation"
published: 2025-11-07
description: ''
image: ''
tags: [AI Painting, ComfyUI, Flux]
category: 'Generative AI'
draft: false 
lang: ''
---

# Sailor Uniform Core Feature Dimensions

| Category                 | Dimension           | Typical Options (English)                                    | Example Prompt Phrase          |
| ------------------------ | ------------------- | ------------------------------------------------------------ | ------------------------------ |
| **Top (Blouse)**         | Collar Type         | square / sailor / stand / collarless / mini lapel            | `square sailor collar`         |
|                          | Collar Trim Color   | white / navy / red / black / gold / silver                   | `navy-trim collar`             |
|                          | Collar Stripe Count | one stripe / two stripes / triple stripes / plain            | `triple-striped collar`        |
|                          | Sleeve Length       | sleeveless / short / three-quarter / long                    | `long-sleeve sailor blouse`    |
|                          | Cuff Detail         | striped cuff / ribbon cuff / plain cuff / lace cuff          | `striped cuffs`                |
|                          | Front Closure       | pullover / zip front / buttoned / open front                 | `buttoned sailor top`          |
|                          | Fabric              | cotton / polyester / wool / silk / blend                     | `cotton sailor top`            |
|                          | Chest Decoration    | pocket / emblem badge / ribbon detail / none                 | `chest emblem badge`           |
|                          | Neck Accessory      | necktie / ribbon bow / scarf tie / bowknot / tie clip        | `red ribbon bow`               |
|                          | Back Bow            | large bow / small bow / none                                 | `large back bow`               |
|                          | Shoulder Detail     | epaulet stripe / plain / double-line trim                    | `naval shoulder stripe`        |
| **Skirt**                | Skirt Type          | pleated / A-line / circular / asymmetrical                   | `pleated skirt`                |
|                          | Skirt Length        | mini / mid-length / knee-length / long                       | `knee-length pleated skirt`    |
|                          | Waist Style         | high-waist / normal waist / elastic / belted                 | `high-waist skirt`             |
|                          | Skirt Color         | navy / black / gray / red / white / checkered                | `navy pleated skirt`           |
|                          | Skirt Pattern       | solid / plaid / striped / gradient / lace edge               | `plaid skirt`                  |
|                          | Skirt Layers        | single-layer / double-layer / lace underskirt                | `double-layer skirt`           |
|                          | Skirt Fabric        | cotton / polyester / wool / chiffon / blend                  | `wool skirt`                   |
| **Hosiery**              | Sock Type           | no socks / ankle / calf / knee-high / thigh-high / pantyhose | `thigh-high socks`             |
|                          | Sock Color          | white / black / gray / navy / striped / sheer                | `white thigh-highs`            |
|                          | Sock Pattern        | plain / striped / checkered / lace / floral edge             | `striped thigh-high socks`     |
|                          | Sock Accessory      | ribbon bow / lace trim / garter / none                       | `ribbon thigh-highs`           |
| **Footwear**             | Shoe Type           | loafers / mary janes / school shoes / sneakers / boots       | `black loafers`                |
|                          | Shoe Color          | black / brown / navy / white / red                           | `brown school shoes`           |
|                          | Shoe Finish         | glossy / matte / leather / patent                            | `glossy leather shoes`         |
|                          | Heel Height         | flat / low heel / medium heel                                | `low-heel loafers`             |
| **Outerwear (Seasonal)** | Layer Type          | cardigan / vest / blazer / coat / cape                       | `cardigan over sailor uniform` |
|                          | Material            | wool / knit / cotton / polyester                             | `wool cardigan`                |
|                          | Color Theme         | navy / gray / beige / white / black                          | `navy blazer`                  |
| **Accessories**          | Scarf / Tie Clip    | neck scarf / sailor scarf / scarf ring                       | `sailor scarf with clip`       |
|                          | School Emblem       | chest badge / tie clip emblem / collar pin                   | `school emblem on chest`       |
|                          | Belt / Strap        | slim belt / decorative strap / none                          | `decorative belt`              |
|                          | Bag                 | shoulder school bag / hand-carry school bag                  | `holding a school bag`         |
| **Headwear**             | Hat Type            | sailor hat / beret / no hat                                  | `white sailor hat`             |
|                          | Hair Accessory      | ribbon / hair clip / bow / headband / none                   | `ribbon hair accessory`        |
| **Gloves (optional)**    | Glove Type          | white gloves / black gloves / none                           | `white gloves`                 |

# Sailor Uniform Analysis Prompt Template

**Instruction (to the AI/Agent):**

> You are an expert visual tagger for Japanese sailor uniforms.
> Analyze the provided image focusing **only** on the uniform itself (ignore background/pose/lighting).
> For **every** dimension below, output a value in concise English (from what you can actually see).
> If a dimension is not visible, return `"not visible"`; if it’s ambiguous, return `"unsure"`.
> For each sub-dimension, also provide a short **prompt phrase** describing it for T2I/ComfyUI use.
> If you detect **any additional uniform-related details not covered by the schema** (e.g., jewelry worn with the uniform, distinctive tailoring, special fasteners), add them to `"extra_features"`.
> Finally, compose a clean, single-sentence `"combined_prompt"` aggregating all visible details.
>
> **Return exactly one JSON object** that follows this schema:

```json
{
  "top": {
    "collar_type": {"value": "", "prompt": ""},
    "collar_trim_color": {"value": "", "prompt": ""},
    "collar_stripe_count": {"value": "", "prompt": ""},
    "sleeve_length": {"value": "", "prompt": ""},
    "cuff_detail": {"value": "", "prompt": ""},
    "front_closure": {"value": "", "prompt": ""},
    "fabric": {"value": "", "prompt": ""},
    "chest_decoration": {"value": "", "prompt": ""},
    "neck_accessory": {"value": "", "prompt": ""},
    "back_bow": {"value": "", "prompt": ""},
    "shoulder_detail": {"value": "", "prompt": ""}
  },
  "skirt": {
    "type": {"value": "", "prompt": ""},
    "length": {"value": "", "prompt": ""},
    "waist_style": {"value": "", "prompt": ""},
    "color": {"value": "", "prompt": ""},
    "pattern": {"value": "", "prompt": ""},
    "layers": {"value": "", "prompt": ""},
    "fabric": {"value": "", "prompt": ""}
  },
  "hosiery": {
    "sock_type": {"value": "", "prompt": ""},
    "sock_color": {"value": "", "prompt": ""},
    "sock_pattern": {"value": "", "prompt": ""},
    "sock_accessory": {"value": "", "prompt": ""}
  },
  "footwear": {
    "shoe_type": {"value": "", "prompt": ""},
    "shoe_color": {"value": "", "prompt": ""},
    "shoe_finish": {"value": "", "prompt": ""},
    "heel_height": {"value": "", "prompt": ""}
  },
  "outerwear": {
    "layer_type": {"value": "", "prompt": ""},
    "material": {"value": "", "prompt": ""},
    "color_theme": {"value": "", "prompt": ""}
  },
  "accessories": {
    "scarf_or_tie_clip": {"value": "", "prompt": ""},
    "school_emblem": {"value": "", "prompt": ""},
    "belt_or_strap": {"value": "", "prompt": ""},
    "bag": {"value": "", "prompt": ""}
  },
  "headwear": {
    "hat_type": {"value": "", "prompt": ""},
    "hair_accessory": {"value": "", "prompt": ""}
  },
  "gloves": {
    "glove_type": {"value": "", "prompt": ""}
  },
  "extra_features": [
    { "feature": "", "prompt": "" }
  ],
  "combined_prompt": ""
}
```

**Value dictionaries must use the exact terms from the table whenever possible.**
Examples:

* `collar_type.value`: `"square"` / `"sailor"` / `"stand"` / `"collarless"` / `"mini lapel"`
* `collar_trim_color.value`: `"white"`, `"navy"`, `"red"`, `"black"`, `"gold"`, `"silver"`
* `collar_stripe_count.value`: `"one stripe"`, `"two stripes"`, `"triple stripes"`, `"plain"`
* Skirt/hosiery/footwear/outerwear/accessories/headwear/gloves follow the **same vocab** as the table.

At the end, `"combined_prompt"` should be a fluent sentence joining visible prompts only, e.g.:
`"white short-sleeved sailor blouse with navy-trim square collar and red ribbon bow, navy pleated knee-length skirt, white thigh-high socks, black glossy loafers, chest emblem badge."`
