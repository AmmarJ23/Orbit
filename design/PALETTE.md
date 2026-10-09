# Orbit colour palette

## Direction

A calm, blue-led task dashboard inspired by Hoshimachi Suisei's official character illustration: pale blue hair, deep indigo ribbons, charcoal-grey plaid, white trim, and small gold accessories. These hex values are original UI adaptations, not an official palette or exact pixel samples.

Reference: [hololive official character profile](https://hololive.hololivepro.com/en/talents/hoshimachi-suisei/) and [official character illustration](https://hololive.hololivepro.com/wp-content/uploads/2020/06/Hoshimachi-Suisei_pr-img_01.png).

Dark mode is the proposed default, not a previously confirmed preference. The colours below are a design proposal; no application UI has been implemented.

## Dark theme tokens

| Token | Name | Hex | Use |
|---|---|---|---|
| `background` | Midnight | `#0C1222` | Page background |
| `surface` | Deep navy | `#151E32` | Sidebar, task lists, panels |
| `surface-raised` | Slate navy | `#1E2A43` | Menus, hover rows, raised panels |
| `border` | Steel blue | `#354563` | Quiet separators; not the sole control boundary |
| `control-border` | Cool slate | `#64789B` | Input outlines and essential control boundaries |
| `text` | Cool white | `#F2F6FF` | Headings and body text |
| `text-muted` | Silver blue | `#A6B5CF` | Descriptions, dates, secondary text |
| `primary` | Comet blue | `#79BFFF` | Primary actions, links, focus rings |
| `primary-hover` | Ice blue | `#A2D3FF` | Primary action hover |
| `indigo` | Ribbon indigo | `#7775E7` | Decorative secondary accent |
| `accent` | Starlight gold | `#E8C683` | Pinned tasks and personal highlights |
| `success` | Sea glass | `#75D6BA` | Completed / successful save |
| `warning` | Warm amber | `#F1C878` | Due soon / needs attention |
| `danger` | Soft coral | `#FF91A4` | Overdue / failed save |

## Light theme companion

Keep the same brand family, with darker blue for readable actions on pale surfaces.

| Token | Hex |
|---|---|
| Background | `#F3F6FC` |
| Surface | `#FFFFFF` |
| Raised / selected surface | `#E8EFFA` |
| Quiet border | `#CDD8E9` |
| Control border | `#64789B` |
| Text | `#17233B` |
| Muted text | `#52627A` |
| Primary | `#245BA8` |
| Primary hover | `#194780` |
| On primary | `#FFFFFF` |
| Gold accent text | `#80601B` |
| Success text | `#176B52` |
| Warning text | `#805300` |
| Danger text | `#AC2945` |

## Usage rules

- Let neutral navy surfaces dominate. Use blue for interaction and gold sparingly for personal highlights.
- Dark primary buttons use midnight text on comet blue. Light primary buttons use white on the darker primary blue.
- Use ribbon indigo for decorative details rather than normal text or filled controls without a separate contrast check.
- Focus: a 2px primary ring with a 2px background gap. Retain a visible outline for keyboard users.
- Selected tasks: raised surface, blue marker, and an explicit selected state. Keep source badges neutral with source names; source colour must not compete with task status.
- Completion uses success; due soon uses warning; overdue and errors use danger. Add text and an icon, so colour is never the only signal.
- Gold means a personal highlight, while amber means urgency. Label both because their hues are similar.
- Disabled controls retain readable labels and expose their disabled state. Loading and saving use explicit status text. Errors persist until resolved and include a retry action where appropriate.
- Avoid gradients behind task text, large gold surfaces, and star decorations across task rows. The reference should influence the palette while the interface remains easy to scan.

## Contrast checks

Calculated with the WCAG relative-luminance formula for solid, opaque sRGB colours.

| Foreground / background | Ratio |
|---|---|
| Cool white / deep navy | 15.35:1 |
| Silver blue / slate navy | 6.90:1 |
| Comet blue / deep navy | 8.47:1 |
| Midnight / comet blue button | 9.52:1 |
| Starlight gold / deep navy | 10.16:1 |
| Control border / slate navy | 3.20:1 |
| Light primary / cool white | 6.19:1 |

Key text combinations exceed 4.5:1; the checked control boundary exceeds 3:1. This checks these colour pairs, not full application accessibility. Recheck opacity, overlays, small icons, actual component states, and any new combinations during implementation.

## Files

- `palette.css`: semantic CSS tokens for both themes.
- `palette.html`: standalone visual swatches and small usage examples. It is a palette reference, not a dashboard prototype.
