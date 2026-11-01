# VDraw — From imagination to implementation

**Sketch it. Describe it. Bring it to life.**

VDraw is a multimodal AI creation studio that transforms rough sketches, reference images and natural-language descriptions into editable digital creations.

Instead of requiring users to learn multiple specialist tools, our platform interprets their ideas and turns them into structured designs that can be previewed, customised and exported into different formats.

**One idea. Multiple outputs. Real, usable creations.**

## 1. Overview

### The problem

Turning an idea into a usable digital or physical design often requires knowledge of several specialist tools, including CAD software, 3D modelling applications, animation tools and frontend development environments.

This creates a barrier between having an idea and actually building it.

### Our solution

We provide a single workspace where users can sketch, describe or upload an idea and transform it into a structured, editable design.

A central AI-generated Design Blueprint acts as the source of truth for the different outputs, allowing one idea to be transformed into multiple formats.

### Who is it for?

- Designers and product prototypers.
- Makers and hobbyists.
- Indie game developers and 3D artists.
- Frontend developers and UI designers.
- Anyone who wants to turn an idea into something tangible without mastering specialist software.

## 2. Core user journey

1. **Input:** Draw a sketch, upload a reference image or describe an idea.
2. **Interpret:** AI analyses the input and extracts the intended design, components, dimensions and style.
3. **Generate:** The system converts the interpretation into a structured Design Blueprint.
4. **Visualise:** An interactive 3D model is generated for inspection and customisation.
5. **Refine:** Users request changes using natural language or design controls.
6. **Export:** The design can be exported into supported, usable formats.

## 3. Features and supported outputs

| Capability | Description | Status |
|---|---|---|
| Sketch interpretation | Understand rough drawings and design intent | [Update] |
| Image and text input | Combine visual references and descriptions | [Update] |
| Design Blueprint | Convert ideas into structured design specifications | [Update] |
| Interactive 3D preview | View, rotate and inspect generated objects | [Update] |
| Design refinement | Change dimensions, components and materials | [Update] |
| CAD export | Generate editable parametric CAD source | [Update] |
| 3D export | Download generated models | [Update] |
| Web component generation | Create components and interactive product previews | [Update] |
| Animation | Add motion to generated objects | [Update] |

Only mark features as complete once they work in the actual application.

## 4. Backend architecture and APIs

### Architecture overview

The platform uses a shared Design Blueprint to connect multimodal AI interpretation with deterministic rendering and export systems.

```text
User Input
  ├── Sketch / Canvas
  ├── Reference Image
  └── Text / Voice
         |
         v
Backend API
         |
         v
OpenAI Responses API
         |
         v
Structured Design Blueprint
         |
         v
Validation and Normalisation
         |
         +----------+----------+----------+
         |          |          |          |
         v          v          v          v
        3D         CAD        Web      Animation
      Renderer   Exporter   Exporter   Renderer
         |          |          |          |
         +----------+----------+----------+
                    |
                    v
              User Outputs
```

### AI integration

- **OpenAI Responses API:** Multimodal interpretation of sketches, images and natural-language descriptions.
- **Structured Outputs:** Constrained generation of the Design Blueprint.
- **Image generation (optional):** Concept imagery and visual presentation assets.
- **Audio transcription (optional):** Voice-based design instructions.

### Design Blueprint

The Design Blueprint is the common representation of a user's design.

It should capture:

- Object name and description.
- Dimensions and units.
- Components and their relationships.
- Geometric primitives and parameters.
- Position and rotation.
- Materials, colours and visual style.
- Optional animation and interaction settings.

All renderers and exporters should consume this shared representation rather than independently interpreting the original prompt.

### Backend endpoints

Document the actual routes implemented in the repository. Suggested responsibilities:

| Endpoint | Responsibility |
|---|---|
| `POST /api/design/interpret` | Interpret user input and return a Design Blueprint |
| `POST /api/design/refine` | Apply requested changes to an existing design |
| `POST /api/design/export` | Generate the requested output format |
| `GET /api/design/:id` | Retrieve a saved design |

## 5. Frontend and UI/UX

The application is designed as a creative workspace rather than a conventional chatbot.

### Main interface

- **Input panel:** Sketch canvas, image uploads and natural-language instructions.
- **Creation viewport:** Large interactive 3D preview.
- **Design inspector:** Components, dimensions, materials and adjustable parameters.
- **Refinement interface:** Natural-language instructions for modifying the current design.
- **Export panel:** Available downloadable formats.

### UX principles

- Visual-first interaction.
- Minimal learning curve.
- Immediate visual feedback.
- Editable outputs rather than static AI-generated images.
- One consistent design across all output formats.

## 6. Demo

### The scenario

A user wants to create a modular desk organiser but has no CAD or 3D modelling experience.

They sketch their idea, describe the intended functionality, and let the application generate an editable design.

The demonstration shows:

1. A rough sketch and natural-language description.
2. AI interpretation into a Design Blueprint.
3. The generated interactive 3D model.
4. A natural-language refinement.
5. A downloadable design file.
6. The same design represented in another output format.

**The takeaway: one rough idea becomes something you can actually use.**

## 7. Use of Codex

Codex was used throughout the hackathon as a development agent.

Document concrete examples of its contribution, including:

- The tasks it completed.
- The files or components it helped implement.
- The tests it ran.
- A specific bug or engineering challenge it helped solve.

Include evidence where possible, such as screenshots, example prompts or links to relevant commits.

## 8. Running the project

Document the actual prerequisites, installation commands and development scripts here.

### Environment variables

List required environment variables without including their values or actual API keys.

### Local development

Provide instructions for installing dependencies, configuring the environment and starting the application.

## 9. Credits and acknowledgements

Identify external libraries, APIs, templates, assets and existing code used in the project.

Clearly distinguish these from the functionality developed by the team during the hackathon.

## 10. Future direction

Potential extensions include game and AR assets, animation exports, interior design, furniture prototyping, laser-cut fabrication and additional frontend output formats.
