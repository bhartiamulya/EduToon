# EduToon

EduToon is a Vite + React + TypeScript application that turns a set of interactive slides into a playful learning experience. Children meet Momo the mascot, follow guided narration, and complete mini-games that use the webcam and microphone.

## Key Features

- **Slide-based storytelling:** Hero, Color Quest, Shape Parade, Clap Party, Manners, Safety, and Giggle Pledge screens rendered with smooth transitions.
- **Recorded narration:** Each prompt plays a local MP3 voice clip with a speech-synthesis fallback when audio cannot autoplay.
- **Camera-powered Color Quest:** Uses the webcam and MediaPipe image segmentation to detect colors while giving positive feedback.
- **Audio-reactive Clap Party:** Listens for claps through the microphone and celebrates with confetti when volume peaks.
- **Drag-and-drop Shape Parade:** Encourages matching shapes with celebratory responses.
- **Momo mascot overlay:** Static character image with a blinking animation that repositions per slide.

## Tech Stack

- Vite for bundling and dev server
- React 18 with TypeScript
- MediaPipe Tasks (ImageSegmenter) for background masking
- Web Speech API (speech recognition and synthesis)
- Plain CSS for layout and animation

## Getting Started

Requirements:

- Node.js 18+
- Working webcam and microphone if you plan to use the Color Quest or Clap Party interactions

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build

# Preview the production build
npm run preview
```

## Assets & Voice Clips

- Place recorded narration files inside `voices/` using the existing filenames (for example `voices/hero_intro.mp3`).
- `momo.jpeg` and `Doll.webp` are required assets referenced in the UI. Replace them with your own artwork if needed but keep the filenames or update imports accordingly.
- The app assumes camera and microphone permissions are granted at runtime; otherwise it falls back to explanatory text or speech.

