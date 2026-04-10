# Save the Newts 3D repository instructions

- This repository is primarily a static JavaScript web game. Runtime code lives in `js/`, styles in `css/`, and browser tests in `tests/`.
- Prefer fixes in the web game unless the issue explicitly points to `desktop_game/`, which is a separate Unity/C# implementation.
- Install dependencies with `npm ci`.
- The main CI command is `npm run test`, which runs the Playwright browser test suite against the static site.
- If you need to run the site locally, use `npm run start` and expect it on `http://localhost:3000`.
- Keep changes focused and minimal. Avoid unrelated refactors while fixing CI failures.
