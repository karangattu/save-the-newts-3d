# Save the Newts 3D

Rescue California newts crossing a road at night.

**Controls:** WASD to move, Mouse to look, Walk into newts to rescue them.

**Run:** `npx serve .`

## Copilot CI Auto-Fix

If a push to `main` fails in CI, the workflow can automatically open a GitHub issue and assign it to Copilot's cloud agent, which will then open a pull request with a proposed fix.

Required setup:

- Enable Copilot's cloud agent for this repository.
- Add a repository secret named `COPILOT_AGENT_TOKEN`.
- Use a fine-grained personal access token or GitHub App user-to-server token with read access to metadata and read/write access to actions, contents, issues, and pull requests.

The repository also includes `.github/workflows/copilot-setup-steps.yml` so Copilot's cloud agent can preinstall the Node and Playwright dependencies it needs before working on a fix.
