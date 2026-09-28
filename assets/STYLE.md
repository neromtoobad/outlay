# Outlay style bible

**Direction:** cozy stylized 3D, in the look of modern feature animation. Byzantine touches: teal and gold, embroidered trim, lead seals, mosaic floor.

**Budget:** a hard cap of **500 Higgsfield credits** for the whole project, targeting about 60. Log every spend below.

**Model:** Higgsfield `gpt_image_2_5`, 16:9, 4 variants per call (1 credit). Higgsfield project `Misthos (Tameion)`, folder `c9aa4817-8470-4b50-a282-fa09b6febe2a`.

**Pipeline:**
1. Pose sheet (8 poses, 4×2 grid).
2. `node tools/sprites/slice.mjs <sheet> assets/sprites/<id> <id> 8`
3. `node tools/sprites/contact.mjs assets/sprites/<id> <id> assets/sprites/<id>-contact.png` to check the cut.

## Pose-sheet prompt template

Keep this verbatim. Swap only `[CHARACTER]` and `[POSES]`.

```
Character pose sheet for a 2D game, eight poses of the exact same original character arranged in a clean grid of 4 columns and 2 rows with generous even spacing, every pose shown full-body from the same three-quarter view facing lower-left, identical scale in every pose with feet on the same baseline in each row, pure white seamless background, cozy stylized 3D animated-film character in the style of a modern feature animation studio, playful stylized proportions with a large expressive head about one quarter of total height, compact rounded body, chunky simplified hands, soft rounded shapes and bold readable silhouette designed to read clearly at small sizes in an isometric office game, [CHARACTER]. The eight poses in order: [POSES]. Smooth matte stylized materials, soft global illumination, warm studio lighting, high-end 3D animation studio quality render, 4K, each pose fully separated with no overlap and no cropping, the same single character repeated only, no other people, no furniture, no background objects, original character not resembling any real person or existing copyrighted character, no text, no numbers, no labels, no watermark, no frame borders, no grid lines
```

**Worker `[POSES]`:**
1. standing idle relaxed
2. walking mid-stride left foot forward
3. walking mid-stride right foot forward
4. seated upper body typing on an invisible keyboard, shown from the waist up as if behind a desk
5. cheering with both arms raised
6. slumped sad with shoulders down and head bowed
7. walking carrying a cardboard box of belongings with both hands
8. tossing a single gold coin upward from one hand

## Cast palette rule

Every worker wears **one signature colour** plus a small gold Byzantine trim detail, so they read at about 190 px. The CFO owns deep teal with gold. Cast diversity: a mix of genders, ages and West African and global looks, with original characters only.

## Cast

| id | Character | Status |
|---|---|---|
| cfo | **The Chartoularios:** a mature West African man in his late fifties, salt-and-pepper hair, trimmed grey beard, round gold spectacles, a deep teal knee-length kaftan with gold Byzantine embroidery, a lead-seal medallion, burgundy loafers | ✅ `sheets/cfo.png` → `sprites/cfo/` |
| scout | young Nigerian woman, box-braid ponytail, **mustard** utility jacket, olive cargos | ✅ first try |
| researcher | South Asian man in his 30s, glasses, **burgundy** cardigan, chinos | ✅ first try |
| writer | Ghanaian woman in her 40s, **coral** head wrap and wrap dress, cream cardigan | ✅ first try |
| illustrator | young East Asian man, **lavender** beret and smock, round glasses | ✅ first try |
| verifier | young Nigerian man, **sky-blue** shirt, navy bow tie | ✅ first try |
| mailer | Latina woman in her 30s, curly ponytail, **orange** blazer | ✅ first try |
| reader | man in his 60s, bald with a white fringe, **olive** waistcoat, half-moon glasses | ✅ first try |
| analyst | Kenyan woman in her 30s, **cobalt** trouser suit | ✅ first try |
| messenger | young Senegalese man, **red** hoodie, high-tops | ✅ first try |
| auditor | Middle Eastern woman in her 40s, **deep purple** hijab and long coat | ✅ first try |

Review boards: `sprites/cast-a.png` and `sprites/cast-b.png`. The worker frame order is: 0 idle, 1 walk A, 2 walk B, 3 typing (waist up), 4 cheer, 5 sad, 6 carrying a box, 7 tossing a coin.

## Credit log

| When | What | Credits |
|---|---|---|
| Sep 27 | female CFO turnaround v1 ×4 (too realistic) | 1 |
| Sep 27 | female CFO turnaround v2 ×4 (stylized) | 1 |
| Sep 27 | male CFO pose sheet ×4 (chosen: 68a5ba6c) | 1 |
| Sep 27 | 10 worker pose sheets, 1 each (batch; all usable on first try) | 2.5 |
| Sep 27 | office room background ×4 (chosen: 684e4f6f → `scene/office-bg.png`) | 1 |
| Sep 27 | desk prop ×4 (chosen: 6c271cec → `scene/desk-0.png`) | 1 |
| Sep 27 | Agora market stall ×4 (chosen: 5b4d96c9 → `scene/stall-0.png`) | 1 |
| **Total** | | **8.5 / 500** |
