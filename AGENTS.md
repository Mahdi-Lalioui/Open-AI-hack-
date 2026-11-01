# AGENTS.md

## Project goal
Build a multimodal AI creation studio that transforms sketches,
images and natural-language descriptions into editable digital designs.

## Core architecture
- The Design Blueprint is the single source of truth.
- AI interprets user input and produces structured specifications.
- Validate every specification before rendering or exporting.
- Renderers and exporters consume the same blueprint.
- Never implement separate, inconsistent interpretations of the same design.

## Development rules
- Inspect existing code before making changes.
- Respect the established project structure and technology stack.
- Use TypeScript types and validation where applicable.
- Do not execute arbitrary model-generated code.
- Do not commit API keys, secrets or personal information.
- Do not create fake UI functionality or mock exports presented as real files.
- Verify that generated files are usable.

## Testing
- Test blueprint validation.
- Test geometry generation.
- Test export functionality.
- Run the relevant build and lint commands after changes.
- Report incomplete functionality honestly.

## Collaboration
- Keep changes focused.
- Avoid modifying another component's implementation unnecessarily.
- Update README documentation when functionality changes.
- Communicate changes to shared interfaces and API contracts.