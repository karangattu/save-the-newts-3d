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
