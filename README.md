# PDF Tag and Metadata Editor

This app is a React + Vite web application built on Apryse WebViewer for reviewing and editing PDF accessibility/content metadata.

## What the app does

- Opens PDF files from file picker or drag-and-drop.
- Displays figure/image structure tags found in the PDF.
- Lets you step through image tags and edit/save Alt-text back into the PDF structure tree.
- Highlights and navigates to selected image tags in the viewer.
- Shows a dialog each time a PDF is opened to review the PDF title metadata.
- Lets you accept the detected title or enter a custom title and save it into PDF metadata.
- Saves the currently loaded file through WebViewer.

## Development

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Environment

The app expects an Apryse license key in environment variables:

- `APRYSE_LICENSE_KEY`
