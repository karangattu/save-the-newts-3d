# Android launcher artwork

`icon.png` is the original artwork generated with the built-in imagegen tool.
The California newt, warm flashlight light, wet forest road, and distant car
headlights reflect the game's nighttime road rescue setting.

The Android project is checked in. Its legacy, round, and adaptive launcher
images live in `android/app/src/main/res/mipmap-*` and survive `cap sync`.
The adaptive icon XML already points to `ic_launcher_foreground`.

Regenerate the density exports with ImageMagick from the repository root:

```bash
for item in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r density legacy foreground <<< "$item"
  target="android/app/src/main/res/mipmap-$density"
  magick resources/icon.png -resize "${legacy}x${legacy}" -strip "$target/ic_launcher.png"
  cp "$target/ic_launcher.png" "$target/ic_launcher_round.png"
  magick resources/icon.png -resize "${foreground}x${foreground}" -strip "$target/ic_launcher_foreground.png"
done
```

## Generation prompt

Use case: stylized-concept

Asset type: square Android launcher icon for Save the Newts 3D, a first-person nighttime California newt rescue game.

Primary request: Create one polished, readable game app icon. A California newt with earthy dark brown pebbled back, warm orange underside, rounded head, small eyes, four short legs and a long curved tail is the large central hero on wet asphalt. A warm flashlight beam illuminates the newt protectively. Behind it a dark winding forest road with a short yellow centerline and a tiny pair of distant car headlights suggests the traffic danger. Match a cinematic 3D game atmosphere, tactile realistic newt anatomy with slightly stylized clarity, dusk teal forest shadows and amber flashlight contrast. No fantasy creature, no frog, no gecko, no external gills.

Composition: square 1024x1024 edge-to-edge opaque artwork. Large unmistakable newt silhouette and face entirely inside central 60 percent of frame so Android circular and squircle crops retain it. Road, forest and headlights are subordinate simple shapes. Strong contrast readable at 48 pixels. No borders, no pre-rounded corners, no words, no letters, no watermark.
