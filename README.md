# snap3d

**One photo in → an editable 3D model out.** Powered by the spatial reasoning of
**Claude Fable 5** — no photogrammetry rig, no multi-angle capture, no manual modeling.

Drop a single 2D photo (a car, a chair, a kettle…) and Fable 5 infers depth,
hidden geometry, and textures, then rebuilds the object as a **parametric scene of
named primitives** rendered live in Three.js.

## The out-of-the-box feature: Remix with words ✦

Everyone else stops at "photo → mesh". snap3d's scene is *semantic* — every part
has a name ("front-left wheel", "windshield") — so you can keep editing in plain
English:

> "make the wheels huge" · "turn it into a convertible" · "paint it neon green"

Fable 5 re-edits only the parts you asked about and hands back the updated scene.
Plus per-part sliders (scale, color) and one-click **.obj export** for Blender,
Unity, or any render engine.

## Run it

```bash
node server.js          # → http://localhost:3777
```

Zero npm dependencies. The brain is resolved in this order:

1. `ANTHROPIC_API_KEY` set → Anthropic API (`claude-fable-5`, override with `SNAP3D_MODEL`)
2. `claude` CLI installed → your local Claude Code session does the reasoning
3. neither → a bundled demo scene, so the UI always works

## How it works

```
photo (base64) ─→ Claude Fable 5 ─→ {parts:[{name, shape, dim, pos, rot, color}]} ─→ Three.js
       remix text + current scene ─→ Fable 5 ─→ updated scene JSON ──────────────────┘
```

The whole trick is a strict JSON contract: box/cylinder/sphere/cone/torus
primitives, Y-up, ground at y=0. The model does the spatial reasoning; the
browser just builds meshes.

## Files

- `server.js` — stdlib Node server + Fable 5 bridge (~100 lines)
- `public/index.html` — viewer, parts panel, remix box, OBJ export (one file)
- `public/demo-scene.json` — offline fallback scene

MIT · built by [Rohit Raj](https://rohitraj.tech) with Claude Fable 5
